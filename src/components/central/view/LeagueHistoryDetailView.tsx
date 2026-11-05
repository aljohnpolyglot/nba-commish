import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, Loader, Shield, Trophy, Zap } from 'lucide-react';
import { generateAbbrev, getAllCachedSeasons, matchTeamByWikiName, useBRefSeason } from '../../../data/brefFetcher';
import { fetchCoachData, getCoachPhoto } from '../../../data/photos/coaches';
import { getHistoricalCoachPhoto } from '../../../services/staff/historicalNbaCoaches';
import { AwardService } from '../../../services/logic/AwardService';
import { EuroAwardService } from '../../../services/logic/EuroAwardService';
import { resolveCompetitionSeason, type CompetitionSeasonResolution } from '../../../services/competition/competitionResolver';
import { selectCompetitionTeamTids } from '../../../services/competition/competitionScheduler';
import type { CompetitionAwardKind } from '../../../services/competition/types';
import {
  getActiveCompetitionAwardProgram,
  inferCompetitionAwardKind,
} from '../../../services/competition/competitionAwardHistory';
import { getHistoricalNbaCompletedSeasonCutoff, isHistoricalNbaWhatIfSave } from '../../../services/playerDevelopment/hofHistoryWindow';
import { useGame } from '../../../store/GameContext';
import type { NBAPlayer } from '../../../types';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { getTeamFullName } from '../../../utils/teamNames';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { didHomeTeamWin } from '../../../utils/gameOutcome';
import { filterPostBranchSourceStats } from '../../../utils/historicalTimeline';
import { isAwardIntroducedForSeason, isAwardVisibleInTimeline, isValidAwardSeason } from '../../../utils/awardHistory';
import { mergeNormalizedPlayerAwards, normalizePlayerAwardType } from '../../../utils/playerAwardNormalizer';
import { getPbaBranchStartSeason } from '../../../services/pba/branchHistoryOwnership';
import { PlayerBioView } from './PlayerBioView';
import { buildCompetitionSeasonPlayers } from './playerStatsBoxScoreMaps';
import {
  cleanChampionName,
  cleanPlayerName,
  competitionSeasonEndYear,
  fetchCompetitionHistory,
  hasCompetitionHistorySource,
  type CompetitionGistId,
  type CompetitionSeason,
} from '../../../data/euroleagueHistoryFetcher';
import {
  buildNativeHistoricalPlayersForSeason,
  ensureFullRosterPlayerDataLoaded,
  ensureNativeHistoricalStatsLoaded,
  ensurePortraitLookupsLoaded,
  getHistoricalAwardsForIdentity,
} from '../../../data/realPlayerDataFetcher';
import {
  aggregateSeason,
  applyBrefHistoryTeams,
  buildBestRecords,
  buildBrefAwardObject,
  buildDetailAwardObject,
  buildFlatHistoryTeams,
  buildHistoricalAllStarRoster,
  buildHistoryPlayerStub,
  buildSemifinalsMvpEntries,
  findHistoryPlayer,
  getLeaders,
  resolveHistoryAwardPlayers,
} from './leagueHistoryDetailData';
import {
  AllStarSection,
  AllTeamSection,
  AwardWinner,
  BestRecordsSection,
  ChampionHeroSection,
  CompactAwardWinner,
  COYWinner,
  LeaderColumnWithSeason,
  PbaConferenceChampionsSection,
  SemifinalsMvpsSection,
} from './LeagueHistoryDetailSections';
import { EuroCompetitionChampionsSection } from './EuroCompetitionChampionsSection';
import { getEuroHistoryCompetitions } from '../../../utils/euroLeagueDefaults';
import {
  getCommissionerSeasonReviewSeason,
  getCommissionerTaskViews,
} from '../../../services/commissionerTasks/taskRegistry';
import { getCompletedSeasonForSummary } from '../../../store/gameContext/offseasonDispatchActions';
import { mergeHistoricalNbaExtraAwards } from '../../../data/historicalNbaExtraAwards';
import { formatLeagueSeasonLabel } from '../../../services/leagueCalendar';
import { AWARD_REGISTRY } from '../../../services/awards/AwardRegistry';
import { getLeagueHistoryTeamPool, scopeHistoryPlayersToLeague, type HistoryLeagueBucket } from './historyLeagueScope';
import { resolveTeamHistoryRecord } from './historySeasonSource';
import {
  getSourceOnlyHistoryPlayer,
  resolveSavedHistoryPlayer,
} from '../../../services/navigation/historyPlayerNavigation';
import { getSaveVisiblePeople } from '../../../services/playerUniverse/canonicalHistoricalPeople';

const isPbaTeamTid = (tid: unknown) => {
  const numericTid = Number(tid);
  return Number.isFinite(numericTid) && numericTid >= 2000 && numericTid < 2100;
};

const isPbaTeamLike = (team: any) => team?.league === 'PBA' || isPbaTeamTid(team?.id ?? team?.tid);

interface Props {
  season: number;
  onBack: () => void;
}

export const LeagueHistoryDetailView: React.FC<Props> = ({ season, onBack }) => {
  const { state, dispatchAction, navigateToPlayer } = useGame();
  const saveVisiblePeople = useMemo(
    () => getSaveVisiblePeople(state),
    [state.backgroundUniverse, state.historicalPeople, state.players],
  );
  const isFictional = state.leagueType === 'fictional';
  const euroIsolated = state.leagueStats?.uiMode === 'euro_isolated';
  const pbaIsolated = state.leagueStats?.uiMode === 'pba_isolated';
  const wnbaIsolated = state.leagueStats?.uiMode === 'wnba_isolated';
  const pbaSourceCutoff = getPbaBranchStartSeason(state);
  const currentSeason = state.leagueStats.year;
  const seasonReviewTask = getCommissionerTaskViews(state)
    .find(task => task.taskId === 'season_review' && task.status === 'in_progress');
  const isCommissionerSeasonReview = !!seasonReviewTask
    && season === getCommissionerSeasonReviewSeason(state);
  const isEuroOffseasonSeasonReview = euroIsolated
    && state.offseasonChecklist?.seasonSummary === 'in-progress'
    && season === getCompletedSeasonForSummary(state);
  const completeSeasonReview = async () => {
    if (isEuroOffseasonSeasonReview) {
      await dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'seasonSummary' } } as any);
    }
  };
  const euroPrimaryCompetition = useMemo(
    () => euroIsolated
      ? state.activeCompetitions?.find(entry => entry.id === (state.euroPrimaryCompetitionId ?? 'endesa')) ?? null
      : null,
    [euroIsolated, state.activeCompetitions, state.euroPrimaryCompetitionId],
  );
  const euroHistoryCompetitions = useMemo(
    () => euroIsolated ? getEuroHistoryCompetitions(state) : [],
    [euroIsolated, state.activeCompetitions, state.clubAliasMap, state.euroCompetitionTeamTids, state.euroPrimaryCompetitionId, state.nonNBATeams, state.schedule],
  );
  const euroParticipantTids = useMemo(
    () => euroPrimaryCompetition
      ? new Set(selectCompetitionTeamTids(euroPrimaryCompetition, state))
      : new Set<number>(),
    [euroPrimaryCompetition, state],
  );
  const euroSeasonResolution = useMemo(() => {
    if (!euroPrimaryCompetition) return null;
    const stored = ((state.competitionHistory?.[euroPrimaryCompetition.id] ?? []) as CompetitionSeasonResolution[])
      .find(entry => Number(entry?.season) === Number(season) && entry?.championTid != null);
    return stored ?? resolveCompetitionSeason(
      euroPrimaryCompetition,
      state.boxScores,
      season,
      [...euroParticipantTids],
    );
  }, [euroParticipantTids, euroPrimaryCompetition, season, state.boxScores, state.competitionHistory]);
  const currentSeasonComplete =
    (euroIsolated && season === currentSeason && euroSeasonResolution?.championTid != null)
    || (state.playoffs?.bracketComplete === true && state.playoffs?.champion != null)
    || (((state as any).seasonHistory ?? []) as any[]).some(entry =>
      Number(entry?.year) === Number(currentSeason) && (entry?.championTid != null || entry?.champion),
    )
    || (state.historicalAwards ?? []).some((award: any) =>
      Number(award?.season) === Number(currentSeason)
      && award?.type === 'Champion'
      && (!euroIsolated || award?.competitionId === euroPrimaryCompetition?.id),
    );
  const isCurrent = season === currentSeason && !currentSeasonComplete;
  const isHistoricalNbaSave = isHistoricalNbaWhatIfSave({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  });
  const basePopulatedSeasonCutoff = getHistoricalNbaCompletedSeasonCutoff({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  }) ?? currentSeason;
  const populatedSeasonCutoff = currentSeasonComplete
    ? Math.max(basePopulatedSeasonCutoff, currentSeason)
    : basePopulatedSeasonCutoff;
  const euroBranchStartSeason = euroIsolated
    ? Number(state.euroStartSeason ?? currentSeason)
    : undefined;
  const maxVisibleSeason = currentSeason;
  const seasonAllowedByHistoryWindow = season <= maxVisibleSeason;
  const canUseCompletedSeasonArtifacts =
    (!isHistoricalNbaSave || season <= populatedSeasonCutoff)
    && (euroBranchStartSeason == null || season < euroBranchStartSeason);
  const historicalBranchStartSeason = isHistoricalNbaSave
    ? Number(state.nbaStartYear ?? 0) || undefined
    : undefined;
  const externalSeasonCutoff = historicalBranchStartSeason ?? basePopulatedSeasonCutoff;
  const canUseExternalSeasonArtifacts = !isHistoricalNbaSave || season <= externalSeasonCutoff;
  const minGP = euroIsolated
    ? Math.min(15, Math.max(1, Number(state.leagueStats.minGamesRequirement ?? 15)))
    : isCurrent ? 15 : 20;
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [coachPhotosReady, setCoachPhotosReady] = useState(false);
  const [notFoundName, setNotFoundName] = useState<string | null>(null);
  const [nativeSeasonPlayers, setNativeSeasonPlayers] = useState<NBAPlayer[]>([]);
  const [euroArchives, setEuroArchives] = useState<Record<string, CompetitionSeason[]>>({});
  const euroArchiveSeasons = euroPrimaryCompetition
    ? euroArchives[euroPrimaryCompetition.id] ?? []
    : [];
  const euroArchiveSeason = useMemo(
    () => euroArchiveSeasons.find(row => competitionSeasonEndYear(row) === season) ?? null,
    [euroArchiveSeasons, season],
  );

  useEffect(() => {
    let mounted = true;
    setEuroArchives({});
    const archiveCutoff = Number(state.euroStartSeason ?? currentSeason);
    if (!euroIsolated) return () => { mounted = false; };
    const sourced = euroHistoryCompetitions.filter(competition => hasCompetitionHistorySource(competition.id));
    Promise.all(sourced.map(async competition => ({
      id: competition.id,
      rows: (await fetchCompetitionHistory(competition.id as CompetitionGistId))
        .filter(row => (competitionSeasonEndYear(row) ?? Infinity) < archiveCutoff),
    })).map(request => request.catch(() => ({ id: '', rows: [] as CompetitionSeason[] }))))
      .then(entries => {
        if (!mounted) return;
        setEuroArchives(Object.fromEntries(entries.filter(entry => entry.id).map(entry => [entry.id, entry.rows])));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [currentSeason, euroHistoryCompetitions, euroIsolated, state.euroStartSeason]);

  useEffect(() => {
    fetchCoachData().then(() => setCoachPhotosReady(true));
  }, []);

  const awardsAll = useMemo(() => {
    const saved = ((state.historicalAwards as any[]) ?? []).filter((award: any) =>
      isAwardVisibleInTimeline(award, populatedSeasonCutoff),
    );
    return !isFictional && !pbaIsolated && !euroIsolated && !wnbaIsolated
      ? mergeHistoricalNbaExtraAwards(saved, externalSeasonCutoff)
      : saved;
  }, [euroIsolated, externalSeasonCutoff, isFictional, pbaIsolated, populatedSeasonCutoff, state.historicalAwards, wnbaIsolated]);
  const pbaTeams = useMemo(
    () => (state.nonNBATeams ?? []).filter(isPbaTeamLike),
    [state.nonNBATeams],
  );
  const euroTeams = useMemo(
    () => [...state.teams, ...(state.nonNBATeams ?? [])]
      .filter((team: any) => euroParticipantTids.has(Number(team.id ?? team.tid))),
    [euroParticipantTids, state.nonNBATeams, state.teams],
  );
  const historyTeams = useMemo(
    () => pbaIsolated
      ? pbaTeams
      : euroIsolated
        ? euroTeams
        : getLeagueHistoryTeamPool(state.teams, state.teamArchive, wnbaIsolated ? 'wnba' : 'nba'),
    [euroIsolated, euroTeams, pbaIsolated, pbaTeams, state.teamArchive, state.teams, wnbaIsolated],
  );
  const completedSeasonSnapshot = state.completedSeasonSnapshots?.[
    `${state.seasonLifecycle?.mode ?? state.leagueStats.uiMode ?? state.leagueType}:${season}`
  ] ?? (state.completedSeasonSnapshot?.season === season ? state.completedSeasonSnapshot : undefined);
  const eraAwardKeys = completedSeasonSnapshot?.enabledAwardKeys
    ?? (state.leagueStats.eraRulesProfile?.season === season
      ? state.leagueStats.eraRulesProfile.enabledAwards
      : undefined);
  const isSeasonAwardEnabled = (awardId: string) =>
    !isFictional || !Array.isArray(eraAwardKeys) || eraAwardKeys.includes(awardId);
  const hasMajorSeasonAwards = ['mvp', 'dpoy', 'coy', 'smoy', 'mip', 'roy']
    .some(isSeasonAwardEnabled);
  const historyTeamsForRecords = useMemo(
    () => {
      const snapshot = completedSeasonSnapshot;
      if (snapshot) {
        const byId = new Map(snapshot.standings.map(row => [row.teamId, row] as const));
        return historyTeams.map((team: any) => {
          const row = byId.get(Number(team.id ?? team.tid));
          if (!row) return team;
          return {
            ...team,
            seasons: [
              ...(team.seasons ?? []).filter((entry: any) => Number(entry.season) !== Number(season)),
              {
                season,
                won: row.wins,
                lost: row.losses,
                tied: row.draws,
                standingsPoints: row.standingsPoints,
                pointDifferential: row.pointDifferential,
              },
            ],
          };
        });
      }
      return canUseCompletedSeasonArtifacts
      ? historyTeams
      : historyTeams.map((team: any) => ({
          ...team,
          seasons: (team.seasons ?? []).filter((entry: any) => Number(entry.season) !== Number(season)),
        }));
    },
    [canUseCompletedSeasonArtifacts, completedSeasonSnapshot, historyTeams, season],
  );
  const allLookupTeams = useMemo(
    () => pbaIsolated || euroIsolated ? [...state.teams, ...(state.nonNBATeams ?? [])] : historyTeams,
    [euroIsolated, historyTeams, pbaIsolated, state.nonNBATeams, state.teams],
  );
  const pbaLookupTeams = useMemo(
    () => allLookupTeams.filter(isPbaTeamLike),
    [allLookupTeams],
  );
  const historyLeagueBucket: HistoryLeagueBucket | null = wnbaIsolated
    ? 'wnba'
    : !isFictional && !pbaIsolated && !euroIsolated && (state.moddedLeagueBase ?? 'nba') === 'nba'
      ? 'nba'
      : null;
  const stateHistoryPlayers = useMemo(() => {
    if (!historyLeagueBucket) return saveVisiblePeople;
    const activeTeamIds = new Set(state.teams.map(team => Number(team.id)));
    return scopeHistoryPlayersToLeague(saveVisiblePeople, historyTeams, historyLeagueBucket)
      .filter(player => (player.stats?.length ?? 0) > 0 || activeTeamIds.has(Number(player.tid)));
  }, [historyLeagueBucket, historyTeams, saveVisiblePeople, state.teams]);
  useEffect(() => {
    let mounted = true;
    setNativeSeasonPlayers([]);
    if ((isCurrent && !canUseCompletedSeasonArtifacts) || isFictional || pbaIsolated || euroIsolated || wnbaIsolated || !canUseExternalSeasonArtifacts) {
      return () => { mounted = false; };
    }
    Promise.all([
      ensurePortraitLookupsLoaded(),
      ensureNativeHistoricalStatsLoaded(),
      ensureFullRosterPlayerDataLoaded(),
    ])
      .then(() => {
        if (!mounted) return;
        setNativeSeasonPlayers(buildNativeHistoricalPlayersForSeason(season));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [canUseCompletedSeasonArtifacts, canUseExternalSeasonArtifacts, euroIsolated, isCurrent, isFictional, pbaIsolated, season, wnbaIsolated]);
  const historyPlayers = useMemo(() => {
    if (euroIsolated && euroPrimaryCompetition) {
      return buildCompetitionSeasonPlayers(state, euroPrimaryCompetition.id, euroParticipantTids, season);
    }
    const keyFor = (player: any) => {
      const slug = String(player?.slug ?? player?.srID ?? '').trim().toLowerCase();
      if (slug) return `slug:${slug}`;
      return `name:${String(player?.name ?? '').trim().toLowerCase()}`;
    };
    const seen = new Set<string>();
    const merged: NBAPlayer[] = [];
    for (const player of stateHistoryPlayers) {
      const rawSourceAwards = getHistoricalAwardsForIdentity(player);
      const sourceAwards = historicalBranchStartSeason !== undefined
        ? rawSourceAwards.filter((award) => isAwardVisibleInTimeline(award, historicalBranchStartSeason))
        : rawSourceAwards;
      const branchFilteredStats = filterPostBranchSourceStats(player.stats, historicalBranchStartSeason);
      const filteredStats = pbaIsolated
        ? branchFilteredStats.filter(stat => !(
            Number(stat.season) >= pbaSourceCutoff
            && (
              (stat as any).historicalPbaSourceStat === true
              || String(stat.competitionId ?? '').toLowerCase() === 'pba'
            )
          ))
        : branchFilteredStats;
      const withFilteredStats = filteredStats === player.stats ? player : { ...player, stats: filteredStats };
      merged.push(sourceAwards.length
        ? { ...withFilteredStats, awards: mergeNormalizedPlayerAwards(player.awards, sourceAwards) }
        : withFilteredStats);
      seen.add(keyFor(player));
    }
    for (const player of nativeSeasonPlayers) {
      const key = keyFor(player);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(player);
    }
    return merged;
  }, [euroIsolated, euroParticipantTids, euroPrimaryCompetition, historicalBranchStartSeason, nativeSeasonPlayers, pbaIsolated, pbaSourceCutoff, season, state, stateHistoryPlayers]);
  const findCompletedTeamSeason = React.useCallback(
    (team: any) => canUseCompletedSeasonArtifacts
      ? team?.seasons?.find((entry: any) => Number(entry.season) === Number(season))
      : undefined,
    [canUseCompletedSeasonArtifacts, season],
  );
  const bbgmRecord = useMemo(
    () => awardsAll.find((award) => Number(award.season) === Number(season) && !award.type) as any,
    [awardsAll, season],
  );
  const flatAwards = useMemo(
    () => awardsAll.filter((award) => Number(award.season) === Number(season) && !!award.type),
    [awardsAll, season],
  );
  const pbaAwardAliases = {
    mvp: ['MVP', 'Most Valuable Player'],
    dpoy: ['DPOY', 'Defensive Player of the Year'],
    smoy: ['SMOY', 'Sixth Man of the Year'],
    clutch: ['Clutch Player of the Year', 'CPOY'],
    mqm: ['Mr. Quality Minutes'],
    mip: ['MIP', 'Most Improved Player'],
    roy: ['ROY', 'Rookie of the Year'],
    finalsMvp: ['Finals MVP'],
    coy: ['COY', 'Coach of the Year'],
    scoringChampion: ['Scoring Champion'],
    bestPlayer: ['Best Player of the Conference'],
    bestImport: ['Best Import of the Conference'],
  } as const;
  const normalizePbaKey = (value: unknown) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase();
  const isNonWinnerNote = (value: unknown) => {
    const key = normalizePbaKey(value);
    return (
      key.includes('no tournament')
      || key.includes('not held')
      || key.includes('cancelled')
      || key.includes('canceled')
      || key.includes('pandemic')
      || key.includes('fiba world cup')
      || key.includes('asian games')
    );
  };
  const normalizePbaConferenceKey = (
    value: unknown,
  ): 'philippine' | 'commissioners' | 'governors' | null => {
    const haystack = normalizePbaKey(value);
    if (!haystack) return null;
    if (haystack.includes('governor')) return 'governors';
    if (haystack.includes('commissioner')) return 'commissioners';
    if (
      haystack.includes('philippine')
      || haystack.includes('all filipino')
      || haystack.includes('all philippine')
      || haystack.includes('jun bernardino')
    ) {
      return 'philippine';
    }
    return null;
  };
  const getPbaConferenceKey = (award: any): 'philippine' | 'commissioners' | 'governors' | null => {
    return normalizePbaConferenceKey([award?.conference, award?.source, award?.type].filter(Boolean).join(' '));
  };
  const isPbaHistoryAward = (award: any) => {
    if (award?.uiMode === 'pba_isolated' || award?.competitionId === 'pba') return true;
    if (String(award?.competitionId ?? '').startsWith('pba-')) return true;
    if (isPbaTeamTid(award?.tid)) return true;
    if (getPbaConferenceKey(award) !== null) return true;
    const awardPlayer = findHistoryPlayer(historyPlayers, award);
    if (awardPlayer && isPbaTeamTid(awardPlayer.tid)) return true;
    const awardTeam = pbaLookupTeams.find((candidate: any) => {
      const target = normalizePbaKey(award?.team ?? award?.name);
      if (!target) return false;
      const snapshot = getHistoricalTeamSnapshot(candidate, season);
      const fullName = normalizePbaKey(getTeamFullName({
        ...(candidate ?? {}),
        region: snapshot.region ?? candidate?.region,
        name: snapshot.name ?? candidate?.name,
        abbrev: snapshot.abbrev ?? candidate?.abbrev,
      }));
      const shortName = normalizePbaKey(candidate?.name || '');
      const abbrev = normalizePbaKey(candidate?.abbrev || '');
      return (
        fullName === target
        || shortName === target
        || abbrev === target
        || fullName.includes(target)
        || target.includes(fullName)
        || shortName.includes(target)
        || target.includes(shortName)
      );
    });
    if (awardTeam) return true;
    const key = normalizePbaKey([award?.source, award?.awardName, award?.award_name, award?.conference, award?.competitionId].filter(Boolean).join(' '));
    return key.includes('pba');
  };
  const isEuroHistoryAward = (award: any) => {
    const competitionId = String(award?.competitionId ?? '').toLowerCase();
    const primaryCompetitionId = String(euroPrimaryCompetition?.id ?? '').toLowerCase();
    if (competitionId) return competitionId === primaryCompetitionId;
    if (award?.uiMode === 'euro_isolated') return true;
    if (['euroleague', 'endesa', 'liga_acb', 'liga-acb'].includes(competitionId)) return true;
    const key = normalizePbaKey([award?.source, award?.awardName, award?.award_name, award?.type, award?.competitionId].filter(Boolean).join(' '));
    return (
      key.includes('euroleague')
      || key.includes('euro league')
      || key.includes('liga acb')
      || key.includes('endesa')
      || key.includes('alphonso ford')
      || key.includes('gomelskiy')
      || key.includes('final four mvp')
      || key.includes('all euroleague')
    );
  };
  const isWnbaHistoryAward = (award: any) => {
    if (award?.uiMode === 'wnba_isolated' || award?.source === 'wnba-history') return true;
    if (findHistoryPlayer(historyPlayers, award)) return true;
    const target = normalizePbaKey(award?.team ?? award?.name);
    if (!target) return false;
    return allLookupTeams.some((team: any) => {
      const snapshot = getHistoricalTeamSnapshot(team, season);
      return [
        snapshot.abbrev,
        team.abbrev,
        getTeamFullName({
          ...team,
          region: snapshot.region ?? team.region,
          name: snapshot.name ?? team.name,
        }),
      ].some(value => normalizePbaKey(value) === target);
    });
  };
  const scopedFlatAwards = useMemo(
    () => pbaIsolated
      ? flatAwards.filter(isPbaHistoryAward)
      : euroIsolated
        ? flatAwards.filter(isEuroHistoryAward)
        : wnbaIsolated
          ? flatAwards.filter(isWnbaHistoryAward)
          : flatAwards,
    [allLookupTeams, euroIsolated, flatAwards, historyPlayers, pbaIsolated, pbaLookupTeams, season, wnbaIsolated],
  );
  const euroHeroMvpType = useMemo(() => {
    if (!euroIsolated || !euroPrimaryCompetition) return undefined;
    const priority: CompetitionAwardKind[] = euroPrimaryCompetition.playoffFormat?.finalFormat === 'final-four'
      ? ['finalFourMvp', 'finalsMvp', 'tournamentMvp', 'playoffsMvp']
      : euroPrimaryCompetition.format === 'knockout' || euroPrimaryCompetition.format === 'tournament'
        ? ['tournamentMvp', 'finalsMvp', 'finalFourMvp', 'playoffsMvp']
        : ['finalsMvp', 'playoffsMvp', 'finalFourMvp', 'tournamentMvp'];
    for (const kind of priority) {
      const actual = scopedFlatAwards.find(award =>
        inferCompetitionAwardKind(String(award.type ?? ''), euroPrimaryCompetition.id) === kind,
      );
      if (actual?.type) return String(actual.type);
    }
    for (const kind of priority) {
      const entry = getActiveCompetitionAwardProgram(euroPrimaryCompetition, season, [kind])[0];
      if (entry) return entry.type;
    }
    return undefined;
  }, [euroIsolated, euroPrimaryCompetition, scopedFlatAwards, season]);
  const flat = (types: string | readonly string[]) => {
    const list = Array.isArray(types) ? types : [types];
    return scopedFlatAwards.find((award) => list.includes(String(award.type))) ?? null;
  };
  const getAwardEntry = (bbgmKey: string, flatTypes: string | readonly string[]) => {
    const flatHit = flat(flatTypes);
    if (pbaIsolated || euroIsolated || wnbaIsolated) return flatHit;
    return flatHit ?? bbgmRecord?.[bbgmKey] ?? null;
  };
  const getPbaConferenceAward = (types: string | readonly string[], conference: 'philippine' | 'commissioners' | 'governors') => {
    const list = Array.isArray(types) ? types : [types];
    return scopedFlatAwards.find((award) =>
      list.includes(String(award.type))
      && getPbaConferenceKey(award) === conference
      && !isNonWinnerNote(award?.name ?? award?.team),
    ) ?? null;
  };
  const findPbaTeamByName = React.useCallback((rawName?: string | null) => {
    const target = normalizePbaKey(rawName);
    if (!target) return null;
    return pbaLookupTeams.find((candidate: any) => {
      const snapshot = getHistoricalTeamSnapshot(candidate, season);
      const fullName = normalizePbaKey(getTeamFullName({
        ...(candidate ?? {}),
        region: snapshot.region ?? candidate?.region,
        name: snapshot.name ?? candidate?.name,
        abbrev: snapshot.abbrev ?? candidate?.abbrev,
      }));
      const shortName = normalizePbaKey(candidate?.name || '');
      const abbrev = normalizePbaKey(candidate?.abbrev || '');
      return (
        fullName === target
        || shortName === target
        || abbrev === target
        || fullName.includes(target)
        || target.includes(fullName)
        || shortName.includes(target)
        || target.includes(shortName)
      );
    }) ?? null;
  }, [pbaLookupTeams, season]);
  const getPbaDisplayTeam = React.useCallback((team: any, fallbackName?: string | null) => {
    const baseTeam = team ?? { name: fallbackName ?? '', league: 'PBA' };
    const snapshot = getHistoricalTeamSnapshot(baseTeam as any, season);
    const name = getTeamFullName({
      ...(baseTeam ?? {}),
      region: snapshot.region ?? baseTeam?.region,
      name: snapshot.name ?? baseTeam?.name ?? fallbackName,
      abbrev: snapshot.abbrev ?? baseTeam?.abbrev,
    }) || fallbackName || '';
    if (!name) return null;
    const tid = baseTeam?.id ?? baseTeam?.tid;
    return {
      ...(team ?? {}),
      id: tid,
      tid,
      name,
      region: snapshot.region ?? baseTeam?.region,
      abbrev: snapshot.abbrev ?? baseTeam?.abbrev ?? String(name).slice(0, 3).toUpperCase(),
      logoUrl: snapshot.logoUrl || getResolvedTeamLogoUrl(baseTeam ?? { name, abbrev: baseTeam?.abbrev, league: 'PBA' }),
    };
  }, [season]);
  const getPbaConferenceSeasonCandidates = React.useCallback((
    _conference: 'philippine' | 'commissioners' | 'governors',
  ) => {
    const primary = Number(season);
    return [primary];
  }, [season]);
  const findPlayer = (awardEntry: any) => findHistoryPlayer(historyPlayers, awardEntry);
  const shouldGroupAllStarsByConference = useMemo(() => {
    const format = String(state.leagueStats?.allStarFormat ?? 'east_vs_west').toLowerCase();
    return format === 'east_vs_west' || format === 'east vs west';
  }, [state.leagueStats?.allStarFormat]);
  const withLiveRecordFallback = React.useCallback((team: any, row: any) => {
    if (!team) return row;
    const rowWon = row?.won ?? row?.wins;
    const rowLost = row?.lost ?? row?.losses;
    const liveWon = team.wins;
    const liveLost = team.losses;
    const shouldUseLiveFallback =
      (rowWon == null && rowLost == null && liveWon != null && liveLost != null)
      || ((rowWon ?? 0) + (rowLost ?? 0) === 0 && (liveWon ?? 0) + (liveLost ?? 0) > 0);
    if (!shouldUseLiveFallback) return row;
    return {
      ...(row ?? {}),
      won: liveWon,
      lost: liveLost,
      wins: liveWon,
      losses: liveLost,
    };
  }, []);

  const { data: bref, loading: brefLoading } = useBRefSeason(
    !isCurrent && !isFictional && !pbaIsolated && !euroIsolated && !wnbaIsolated && canUseExternalSeasonArtifacts ? season : null,
  );

  const euroAwardRaces = useMemo(() => {
    if (!euroIsolated || !euroPrimaryCompetition || euroParticipantTids.size === 0) return null;
    if (euroPrimaryCompetition.id === 'euroleague') {
      const races = EuroAwardService.calculateEuroleagueRaces(
        historyPlayers,
        state.teams,
        state.nonNBATeams ?? [],
        season,
        state.staff,
        state.leagueStats.minGamesRequirement,
        state.boxScores,
        euroParticipantTids,
      );
      return {
        mvp: races.mvp,
        defender: races.defender,
        sixthMan: [],
        mostImproved: [],
        bestYoungPlayer: races.risingStar,
        bestCoach: races.coy,
        topScorer: races.topScorer,
        topRebounder: [],
        topAssister: [],
        pirLeader: [],
        offensivePlayer: [],
        efficiencyPlayer: [],
        spectacularPlayer: [],
        popularPlayer: [],
        bestFive: races.allEuroLeague,
      };
    }
    return EuroAwardService.calculateDomesticRaces(
      historyPlayers,
      state.teams,
      state.nonNBATeams ?? [],
      season,
      euroPrimaryCompetition.id,
      euroParticipantTids,
      state.staff,
      state.leagueStats.minGamesRequirement,
      state.boxScores,
    );
  }, [euroIsolated, euroParticipantTids, euroPrimaryCompetition, historyPlayers, season, state.boxScores, state.leagueStats.minGamesRequirement, state.nonNBATeams, state.staff, state.teams]);

  const awards = useMemo(() => {
    const archiveEntry = (raw: string | undefined) => {
      const name = cleanPlayerName(raw);
      if (!name) return null;
      const teamName = String(raw ?? '').match(/\(([^)]+)\)\s*$/)?.[1] ?? '';
      return buildDetailAwardObject({ name, team: teamName }, allLookupTeams, historyPlayers, season);
    };
    if (euroIsolated) {
      return {
        mvp: null,
        dpoy: null,
        smoy: null,
        clutch: null,
        mqm: null,
        mip: null,
        roy: null,
        finalsMvp: buildDetailAwardObject(
          scopedFlatAwards.find(award => String(award.type ?? '') === euroHeroMvpType),
          allLookupTeams,
          historyPlayers,
          season,
        ) ?? archiveEntry(euroArchiveSeason?.Finals_MVP ?? euroArchiveSeason?.Final_Four_MVP),
        coy: null,
        scoringChampion: null,
        philippineBpc: null,
        commissionersBpc: null,
        commissionersBestImport: null,
        governorsBpc: null,
        governorsBestImport: null,
      };
    }
    const resolved: Record<string, any> = {
      mvp: buildDetailAwardObject(getAwardEntry('mvp', pbaIsolated ? pbaAwardAliases.mvp : ['MVP', 'Most Valuable Player']), allLookupTeams, historyPlayers, season),
      dpoy: buildDetailAwardObject(getAwardEntry('dpoy', pbaIsolated ? pbaAwardAliases.dpoy : ['DPOY', 'Defensive Player of the Year']), allLookupTeams, historyPlayers, season),
      smoy: buildDetailAwardObject(getAwardEntry('smoy', pbaIsolated ? pbaAwardAliases.smoy : ['SMOY', 'Sixth Man of the Year']), allLookupTeams, historyPlayers, season),
      clutch: buildDetailAwardObject(getAwardEntry('clutch', pbaAwardAliases.clutch), allLookupTeams, historyPlayers, season),
      mqm: buildDetailAwardObject(getAwardEntry('smoy', pbaIsolated ? pbaAwardAliases.mqm : 'SMOY'), allLookupTeams, historyPlayers, season),
      mip: buildDetailAwardObject(getAwardEntry('mip', pbaIsolated ? pbaAwardAliases.mip : ['MIP', 'Most Improved Player']), allLookupTeams, historyPlayers, season),
      roy: buildDetailAwardObject(getAwardEntry('roy', pbaIsolated ? pbaAwardAliases.roy : ['ROY', 'Rookie of the Year']), allLookupTeams, historyPlayers, season),
      finalsMvp: buildDetailAwardObject(pbaIsolated ? getPbaConferenceAward(pbaAwardAliases.finalsMvp, 'philippine') : getAwardEntry('finalsMvp', pbaAwardAliases.finalsMvp), allLookupTeams, historyPlayers, season),
      coy: buildDetailAwardObject(getAwardEntry('coy', pbaIsolated ? pbaAwardAliases.coy : ['COY', 'Coach of the Year']), allLookupTeams, historyPlayers, season),
      scoringChampion: buildDetailAwardObject(getAwardEntry('mvp', pbaAwardAliases.scoringChampion), allLookupTeams, historyPlayers, season),
      philippineBpc: buildDetailAwardObject(pbaIsolated ? getPbaConferenceAward(pbaAwardAliases.bestPlayer, 'philippine') : null, allLookupTeams, historyPlayers, season),
      commissionersBpc: buildDetailAwardObject(pbaIsolated ? getPbaConferenceAward(pbaAwardAliases.bestPlayer, 'commissioners') : null, allLookupTeams, historyPlayers, season),
      commissionersBestImport: buildDetailAwardObject(pbaIsolated ? getPbaConferenceAward(pbaAwardAliases.bestImport, 'commissioners') : null, allLookupTeams, historyPlayers, season),
      governorsBpc: buildDetailAwardObject(pbaIsolated ? getPbaConferenceAward(pbaAwardAliases.bestPlayer, 'governors') : null, allLookupTeams, historyPlayers, season),
      governorsBestImport: buildDetailAwardObject(pbaIsolated ? getPbaConferenceAward(pbaAwardAliases.bestImport, 'governors') : null, allLookupTeams, historyPlayers, season),
    };
    if (bref) {
      if (!resolved.mvp) resolved.mvp = buildBrefAwardObject(bref.mvp, allLookupTeams, historyPlayers, season);
      if (!resolved.dpoy) resolved.dpoy = buildBrefAwardObject(bref.dpoy, allLookupTeams, historyPlayers, season);
      if (!resolved.smoy) resolved.smoy = buildBrefAwardObject(bref.smoy, allLookupTeams, historyPlayers, season);
      if (!resolved.mip) resolved.mip = buildBrefAwardObject(bref.mip, allLookupTeams, historyPlayers, season);
      if (!resolved.roy) resolved.roy = buildBrefAwardObject(bref.roy, allLookupTeams, historyPlayers, season);
      if (!resolved.finalsMvp) resolved.finalsMvp = buildBrefAwardObject(bref.finalsMvp, allLookupTeams, historyPlayers, season);
      if (!resolved.coy) resolved.coy = buildBrefAwardObject(bref.coy, allLookupTeams, historyPlayers, season);
    }
    if (resolved.coy) {
      if (!isFictional) {
        const photo = isHistoricalNbaSave
          ? getHistoricalCoachPhoto(resolved.coy.name) ?? getCoachPhoto(resolved.coy.name)
          : pbaIsolated || coachPhotosReady
            ? getCoachPhoto(resolved.coy.name)
            : undefined;
        resolved.coy = { ...resolved.coy, imgURL: photo ?? undefined, face: undefined };
      }
      resolved.coy = { ...resolved.coy, disableNameFallback: true };
    }
    return resolved;
  }, [allLookupTeams, bref, coachPhotosReady, euroArchiveSeason, euroHeroMvpType, euroIsolated, historyPlayers, isFictional, isHistoricalNbaSave, pbaIsolated, scopedFlatAwards, season, wnbaIsolated]);

  const extraAwardCards = useMemo(() => {
    if (pbaIsolated || euroIsolated) return [];
    const definitions = AWARD_REGISTRY.filter(definition => definition.showInHistoryDetail);
    return definitions.flatMap(definition => {
      const source = scopedFlatAwards.find(award => String(award.type) === String(definition.storedType ?? definition.name));
      if (!source) return [];
      const award = buildDetailAwardObject(source, allLookupTeams, historyPlayers, season);
      return award ? [{ definition, source, award }] : [];
    });
  }, [allLookupTeams, euroIsolated, historyPlayers, pbaIsolated, scopedFlatAwards, season]);

  const minorAwardCards = useMemo(() => {
    if (pbaIsolated || euroIsolated) return [];
    const cards: Array<{ key: string; label: string; award: any; source: any; isPlayer: boolean }> = [];
    if (awards.clutch) {
      cards.push({
        key: 'clutch-player',
        label: 'Clutch Player of the Year',
        award: awards.clutch,
        source: getAwardEntry('clutch', pbaAwardAliases.clutch),
        isPlayer: true,
      });
    }
    extraAwardCards.forEach(({ definition, source, award }) => {
      cards.push({
        key: definition.id,
        label: definition.shortName,
        award,
        source,
        isPlayer: definition.scope === 'player',
      });
    });
    return cards;
  }, [awards.clutch, euroIsolated, extraAwardCards, getAwardEntry, pbaIsolated]);

  const euroAwardCards = useMemo(() => {
    if (!euroIsolated || !euroPrimaryCompetition) return [];
    const activeProgram = getActiveCompetitionAwardProgram(euroPrimaryCompetition, season)
      .filter(entry =>
        entry.kind !== 'allLeague'
        && entry.type !== euroHeroMvpType,
      );
    const programTypes = new Set(activeProgram.map(entry => entry.type));
    const actualAwards = scopedFlatAwards.filter(award => {
      const type = String(award.type ?? '');
      const kind = inferCompetitionAwardKind(type, euroPrimaryCompetition.id);
      return award.competitionId === euroPrimaryCompetition.id
        && type !== 'Champion'
        && type !== 'Runner Up'
        && kind !== 'allLeague'
        && type !== euroHeroMvpType;
    });
    const awardObject = (award: any) => {
      const kind = inferCompetitionAwardKind(String(award?.type ?? ''), euroPrimaryCompetition.id);
      if (award?.role === 'coach' || award?.role === 'executive' || ['coach', 'championshipCoach', 'executive'].includes(kind)) {
        const team = award?.tid != null
          ? allLookupTeams.find((candidate: any) => Number(candidate.id ?? candidate.tid) === Number(award.tid))
          : matchTeamByWikiName(award?.team ?? '', allLookupTeams as any[]) as any;
        const snapshot = team ? getHistoricalTeamSnapshot(team, season) : null;
        return {
          name: award.name,
          team: snapshot?.abbrev ?? team?.abbrev ?? award?.team ?? '',
          imgURL: getCoachPhoto(award.name) ?? undefined,
          teamLogoUrl: snapshot?.logoUrl || getResolvedTeamLogoUrl(team, season),
        };
      }
      return buildDetailAwardObject(award, allLookupTeams, historyPlayers, season);
    };
    const raceWinner = (kind: string) => {
      if (!euroAwardRaces) return null;
      const races = euroAwardRaces as any;
      const candidates = kind === 'youngPlayer'
        ? races.bestYoungPlayer
        : kind === 'coach'
          ? races.bestCoach
          : kind === 'assistLeader'
            ? races.topAssister
            : kind === 'efficiencyPlayer'
              ? races.efficiencyPlayer ?? races.pirLeader
              : races[kind];
      const winner = candidates?.[0];
      if (!winner) return null;
      if (winner.coachName) {
        return {
          name: winner.coachName,
          team: winner.team?.abbrev ?? '',
          imgURL: winner.portraitUrl,
          face: winner.face,
          teamLogoUrl: getHistoricalTeamSnapshot(winner.team, season).logoUrl,
        };
      }
      return {
        name: winner.player.name,
        team: winner.team?.abbrev ?? '',
        id: winner.player.internalId,
        imgURL: winner.player.imgURL,
        face: winner.player.face,
        teamLogoUrl: getHistoricalTeamSnapshot(winner.team, season).logoUrl,
        player: winner.player,
        playerRef: winner.player,
      };
    };
    const cards = activeProgram.map(entry => {
      const actual = actualAwards.find(award => String(award.type) === entry.type);
      return {
        key: `${entry.kind}:${entry.type}`,
        label: entry.type,
        award: actual ? awardObject(actual) : isCurrent ? raceWinner(entry.kind) : null,
        source: actual ?? null,
      };
    });
    for (const actual of actualAwards) {
      if (programTypes.has(String(actual.type))) continue;
      cards.push({
        key: `actual:${actual.type}:${actual.name}`,
        label: String(actual.type),
        award: awardObject(actual),
        source: actual,
      });
    }
    const seen = new Set<string>();
    return cards.filter(card => {
      const key = `${card.label}:${card.award?.name ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allLookupTeams, euroAwardRaces, euroHeroMvpType, euroIsolated, euroPrimaryCompetition, historyPlayers, isCurrent, scopedFlatAwards, season]);

  const champAward = pbaIsolated ? getPbaConferenceAward(['Champion'], 'philippine') : flat('Champion');
  const runnerAward = pbaIsolated ? getPbaConferenceAward(['Runner Up'], 'philippine') : flat('Runner Up');
  const euroFinalMvpLabel = euroHeroMvpType;

  const champTeam = useMemo(() => {
    if (euroIsolated && euroSeasonResolution?.championTid != null) {
      return resolveAnyTeam(euroSeasonResolution.championTid, state.teams, state.nonNBATeams ?? []) ?? null;
    }
    if (champAward) {
      const byTid = champAward.tid != null
        ? allLookupTeams.find((team: any) => (team.id ?? team.tid) === champAward.tid)
        : null;
      const byName = matchTeamByWikiName(champAward.team ?? champAward.name, allLookupTeams as any[]) as any;
      if (byTid || byName) return byTid ?? byName;
    }
    if (euroIsolated && euroArchiveSeason) {
      const archived = cleanChampionName(euroArchiveSeason.Champions ?? euroArchiveSeason.Season_champions);
      const matched = matchTeamByWikiName(archived, allLookupTeams as any[]) as any;
      if (matched) return matched;
    }

    let best: any = null;
    let maxRounds = -1;
    historyTeamsForRecords.forEach((team: any) => {
      const teamSeason = findCompletedTeamSeason(team);
      if ((teamSeason?.playoffRoundsWon ?? -1) > maxRounds) {
        maxRounds = teamSeason?.playoffRoundsWon ?? -1;
        best = team;
      }
    });
    if (maxRounds > 0) return best;

    if (bref?.champion) {
      return (matchTeamByWikiName(bref.champion.name, allLookupTeams as any[]) as any) ?? null;
    }

    if (awards.finalsMvp) {
      for (const player of historyPlayers) {
        const hit = player.awards?.find((award: any) => Number(award.season) === Number(season) && award.type === 'Finals MVP');
        if (!hit) continue;
        const stats = player.stats?.filter((stat: any) => Number(stat.season) === Number(season) && !stat.playoffs && (stat.tid ?? -1) >= 0) ?? [];
        const tid = stats.length ? stats.reduce((left: any, right: any) => (left.gp >= right.gp ? left : right)).tid : player.tid;
        return allLookupTeams.find((team: any) => (team.id ?? team.tid) === tid) ?? null;
      }
    }

    return null;
  }, [allLookupTeams, awards.finalsMvp, bref, champAward, euroArchiveSeason, euroIsolated, euroSeasonResolution, findCompletedTeamSeason, historyPlayers, historyTeamsForRecords, season, state.nonNBATeams, state.teams]);

  const runnerUpTeam = useMemo(() => {
    if (pbaIsolated) return null;
    if (euroIsolated && euroSeasonResolution?.runnerUpTid != null) {
      return resolveAnyTeam(euroSeasonResolution.runnerUpTid, state.teams, state.nonNBATeams ?? []) ?? null;
    }
    if (runnerAward) {
      const byTid = runnerAward.tid != null
        ? allLookupTeams.find((team: any) => (team.id ?? team.tid) === runnerAward.tid)
        : null;
      const byName = matchTeamByWikiName(runnerAward.team ?? runnerAward.name, allLookupTeams as any[]) as any;
      if (byTid || byName) return byTid ?? byName;
    }
    if (euroIsolated && euroArchiveSeason?.Runnersup) {
      const matched = matchTeamByWikiName(cleanChampionName(euroArchiveSeason.Runnersup), allLookupTeams as any[]) as any;
      if (matched) return matched;
    }

    let maxRounds = -1;
    historyTeamsForRecords.forEach((team: any) => {
      const teamSeason = findCompletedTeamSeason(team);
      if ((teamSeason?.playoffRoundsWon ?? -1) > maxRounds) maxRounds = teamSeason?.playoffRoundsWon ?? -1;
    });
    if (maxRounds > 0) {
      let runner: any = null;
      historyTeamsForRecords.forEach((team: any) => {
        const teamSeason = findCompletedTeamSeason(team);
        if (teamSeason?.playoffRoundsWon === maxRounds - 1) runner = team;
      });
      return runner;
    }

    if (bref?.runnerUp) {
      return (matchTeamByWikiName(bref.runnerUp.name, allLookupTeams as any[]) as any) ?? null;
    }
    return null;
  }, [allLookupTeams, bref, euroArchiveSeason, euroIsolated, euroSeasonResolution, findCompletedTeamSeason, historyTeamsForRecords, runnerAward, season, state.nonNBATeams, state.teams]);

  const resolveCompletedRecord = React.useCallback((team: any, row: any) => {
    if (!team) return row;
    if (isCurrent) return withLiveRecordFallback(team, row);
    const sourceRecord = bref?.teamRecords?.find(record =>
      Boolean(matchTeamByWikiName(record.name, [team] as any[])),
    );
    const resolved = resolveTeamHistoryRecord(row, sourceRecord);
    return resolved.won == null || resolved.lost == null
      ? row
      : { ...(row ?? {}), won: resolved.won, lost: resolved.lost };
  }, [bref, isCurrent, withLiveRecordFallback]);

  const rawChampRecord = euroIsolated
    ? withLiveRecordFallback(
        champTeam,
        (() => {
          const tid = Number(champTeam?.id ?? champTeam?.tid);
          const games = (state.boxScores ?? []).filter(game =>
            game.competitionId === euroPrimaryCompetition?.id
            && Number(game.season) === Number(season)
            && (game.homeTeamId === tid || game.awayTeamId === tid),
          );
          if (games.length === 0) return findCompletedTeamSeason(champTeam);
          const won = games.filter(game =>
            (game.homeTeamId === tid && didHomeTeamWin(game))
            || (game.awayTeamId === tid && !didHomeTeamWin(game)),
          ).length;
          return { won, lost: games.length - won };
        })(),
      )
    : resolveCompletedRecord(champTeam, findCompletedTeamSeason(champTeam));
  const rawRunnerUpRecord = euroIsolated
    ? withLiveRecordFallback(
        runnerUpTeam,
        (() => {
          const tid = Number(runnerUpTeam?.id ?? runnerUpTeam?.tid);
          const games = (state.boxScores ?? []).filter(game =>
            game.competitionId === euroPrimaryCompetition?.id
            && Number(game.season) === Number(season)
            && (game.homeTeamId === tid || game.awayTeamId === tid),
          );
          if (games.length === 0) return findCompletedTeamSeason(runnerUpTeam);
          const won = games.filter(game =>
            (game.homeTeamId === tid && didHomeTeamWin(game))
            || (game.awayTeamId === tid && !didHomeTeamWin(game)),
          ).length;
          return { won, lost: games.length - won };
        })(),
      )
    : resolveCompletedRecord(runnerUpTeam, findCompletedTeamSeason(runnerUpTeam));
  const hasMeaningfulRecord = (row: any) => Number(row?.won ?? row?.wins ?? 0) + Number(row?.lost ?? row?.losses ?? 0) > 0;
  const champRecord = hasMeaningfulRecord(rawChampRecord) ? rawChampRecord : null;
  const runnerUpRecord = hasMeaningfulRecord(rawRunnerUpRecord) ? rawRunnerUpRecord : null;
  const countEuroCompetitionResult = (teamId: number | undefined, runnerUp = false): number => {
    if (!euroIsolated || !euroPrimaryCompetition || teamId == null) return 1;
    const seasons = new Set<number>();
    for (const row of euroArchiveSeasons) {
      const rowSeason = competitionSeasonEndYear(row);
      if (!rowSeason || rowSeason > season) continue;
      const name = cleanChampionName(runnerUp ? row.Runnersup : row.Champions ?? row.Season_champions);
      const matched = matchTeamByWikiName(name, allLookupTeams as any[]) as any;
      if (Number(matched?.id ?? matched?.tid) === teamId) seasons.add(rowSeason);
    }
    const savedEntries = (state.competitionHistory?.[euroPrimaryCompetition.id] ?? []) as Array<{
      season?: number;
      championTid?: number;
      runnerUpTid?: number;
    }>;
    for (const entry of savedEntries) {
      const rowSeason = Number(entry?.season);
      const resultTid = runnerUp ? entry?.runnerUpTid : entry?.championTid;
      if (rowSeason <= season && Number(resultTid) === teamId) seasons.add(rowSeason);
    }
    return Math.max(1, seasons.size);
  };
  const hasAllLeague = !pbaIsolated && !euroIsolated && (
    !!bbgmRecord?.allLeague
    || scopedFlatAwards.some((award) =>
      award.type?.startsWith('All-NBA')
      || award.type?.startsWith('All-League')
      || award.type?.startsWith('All-Defensive')
      || award.type?.startsWith('All-Rookie'),
    )
  );

  const handlePlayerClick = (awardEntry: any) => {
    const savedPlayer = resolveSavedHistoryPlayer(saveVisiblePeople, awardEntry);
    if (savedPlayer) {
      navigateToPlayer(savedPlayer);
      return;
    }
    const sourcePlayer = getSourceOnlyHistoryPlayer(awardEntry);
    if (sourcePlayer) {
      setViewingPlayer(sourcePlayer);
      return;
    }
    const sourceName = awardEntry?.name ?? awardEntry?.playerName;
    if (sourceName) {
      setViewingPlayer(buildHistoryPlayerStub(sourceName));
      return;
    }
    setNotFoundName('Player');
  };

  const leaders = useMemo(() => {
    const archiveLeader = (raw: string | undefined) => {
      const name = cleanPlayerName(raw);
      if (!name) return [];
      const teamName = String(raw ?? '').match(/\(([^)]+)\)\s*$/)?.[1] ?? '';
      const player = findHistoryPlayer(historyPlayers, { name }) ?? buildHistoryPlayerStub(name);
      const team = matchTeamByWikiName(teamName, historyTeams as any[]) as any;
      return [{ player, team, agg: null, value: 0, sourceOnly: true }];
    };
    const withArchive = (computed: any[], raw: string | undefined) => computed.length > 0 ? computed : archiveLeader(raw);
    return {
      pts: withArchive(getLeaders(historyPlayers, historyTeams, season, 'PTS', 1, minGP), euroArchiveSeason?.Top_scorer ?? euroArchiveSeason?.Points),
      reb: withArchive(getLeaders(historyPlayers, historyTeams, season, 'REB', 1, minGP), euroArchiveSeason?.Rebounds),
      ast: withArchive(getLeaders(historyPlayers, historyTeams, season, 'AST', 1, minGP), euroArchiveSeason?.Assists),
      stl: withArchive(getLeaders(historyPlayers, historyTeams, season, 'STL', 1, minGP), euroArchiveSeason?.Steals),
      blk: withArchive(getLeaders(historyPlayers, historyTeams, season, 'BLK', 1, minGP), euroArchiveSeason?.Blocks),
      tpm: getLeaders(historyPlayers, historyTeams, season, '3PM', 1, minGP),
      per: withArchive(getLeaders(historyPlayers, historyTeams, season, 'PER', 1, minGP), euroArchiveSeason?.Index_Rating),
    };
  }, [euroArchiveSeason, historyPlayers, historyTeams, minGP, season]);

  const liveAwardRaces = useMemo(() => (
    isCurrent && !pbaIsolated && !euroIsolated
      ? AwardService.calculateAwardRaces(
          state.players as any,
          state.teams as any,
          season,
          state.staff as any,
          state.leagueStats.minGamesRequirement,
          10,
          state.leagueStats.uiMode,
        )
      : null
  ), [euroIsolated, isCurrent, pbaIsolated, season, state.leagueStats.minGamesRequirement, state.players, state.staff, state.teams]);

  const allStarRoster = useMemo(() => {
    if (euroIsolated) return null;
    const normalizeConference = (rawConference: any, fallbackConference: any) => {
      const raw = String(rawConference ?? fallbackConference ?? '').trim();
      const lower = raw.toLowerCase();
      if (lower.startsWith('east')) return 'East';
      if (lower.startsWith('west')) return 'West';
      return raw || null;
    };
    const historicalRoster = canUseCompletedSeasonArtifacts
      ? buildHistoricalAllStarRoster(historyPlayers, historyTeams, season)
      : null;
    const normalizeRoster = (roster: any[]) => (
      roster
        .map((entry: any) => {
          const player = saveVisiblePeople.find((candidate: any) => String(candidate.internalId) === String(entry?.playerId));
          const team = player ? allLookupTeams.find((candidate: any) => (candidate.id ?? candidate.tid) === player.tid) : allLookupTeams.find((candidate: any) => candidate.abbrev === entry?.teamAbbrev);
          const conference = normalizeConference(entry?.conference, (team as any)?.conference);
          return { ...entry, teamAbbrev: entry?.teamAbbrev ?? team?.abbrev ?? '', conference };
        })
        .filter((entry: any) => entry && entry.playerId && entry.playerName)
    );
    if (isCurrent && state.allStar?.roster?.length) {
      const normalized = normalizeRoster(state.allStar.roster ?? []);
      if (normalized.length > 0 && normalized.length >= (historicalRoster?.length ?? 0)) return normalized;
    }
    const persistedRoster = state.allStarHistory?.[season]?.roster ?? [];
    if (persistedRoster.length > 0) return normalizeRoster(persistedRoster);
    return historicalRoster;
  }, [allLookupTeams, canUseCompletedSeasonArtifacts, euroIsolated, historyPlayers, historyTeams, isCurrent, saveVisiblePeople, season, state.allStar, state.allStarHistory]);

  const bestRecords = useMemo(
    () => buildBestRecords(historyTeamsForRecords, season, bref, isCurrent),
    [bref, historyTeamsForRecords, isCurrent, season],
  );

  const semifinalsMvps = useMemo(() => {
    if (pbaIsolated || euroIsolated) return [];
    if (!isAwardIntroducedForSeason('Conference Finals MVP', season)) return [];
    const entries: any[] = bbgmRecord?.sfmvp ?? scopedFlatAwards.filter((award) => award.type === 'Semifinals MVP' || award.type === 'Conference Finals MVP') ?? [];
    return buildSemifinalsMvpEntries(entries, allLookupTeams, historyPlayers, season);
  }, [allLookupTeams, bbgmRecord, euroIsolated, historyPlayers, pbaIsolated, scopedFlatAwards, season]);

  const awardCounts = useMemo(() => {
    const priorAwards = awardsAll.filter((award) => isValidAwardSeason(award.season) && Number(award.season) <= Number(season));
    const normalizeAwardName = (value: unknown) =>
      String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const namesMatch = (left: unknown, right: unknown) => normalizeAwardName(left) === normalizeAwardName(right);

    const countForPlayer = (name: string | undefined, flatTypes: string | readonly string[], bbgmKey: string) => {
      if (!name) return 1;
      const list = Array.isArray(flatTypes) ? flatTypes : [flatTypes];
      const seasons = new Set<number>();
      for (const award of priorAwards) {
        const awardSeason = Number(award.season);
        if (award.type) {
          if (list.includes(String(award.type)) && namesMatch(award.name, name)) seasons.add(awardSeason);
          continue;
        }
        if (namesMatch(award[bbgmKey]?.name, name)) seasons.add(awardSeason);
      }
      if (!isFictional && !pbaIsolated && !wnbaIsolated) {
        for (const [year, brefSeason] of getAllCachedSeasons().entries()) {
          if (!isValidAwardSeason(year) || year > Number(season) || year > externalSeasonCutoff) continue;
          if (namesMatch((brefSeason as any)?.[bbgmKey]?.name, name)) seasons.add(year);
        }
      }
      return Math.max(seasons.size, 1);
    };

    const countPbaConferenceAwards = (
      name: string | undefined,
      flatTypes: string | readonly string[],
      conference: 'philippine' | 'commissioners' | 'governors',
    ) => {
      if (!name) return 1;
      const list = Array.isArray(flatTypes) ? flatTypes : [flatTypes];
      const wins = new Set<string>();
      for (const award of priorAwards) {
        if (
          !award.type
          || !list.includes(String(award.type))
          || !namesMatch(award.name, name)
          || getPbaConferenceKey(award) !== conference
        ) {
          continue;
        }
        wins.add(`${award.season}|${award.type}|${award.competitionId ?? conference}`);
      }
      return Math.max(wins.size, 1);
    };

    const countChamp = (teamId: number | undefined) => {
      if (teamId == null) return 1;
      const championSeasons = new Set<number>();
      for (const award of priorAwards) {
        if (award.type === 'Champion' && award.tid === teamId && isValidAwardSeason(award.season)) championSeasons.add(Number(award.season));
      }
      if (!isFictional && !pbaIsolated && !wnbaIsolated) {
        for (const [year, brefSeason] of getAllCachedSeasons().entries()) {
          if (!isValidAwardSeason(year) || year > Number(season) || year > externalSeasonCutoff || !brefSeason.champion?.name) continue;
          const matched = matchTeamByWikiName(brefSeason.champion.name, allLookupTeams as any[]);
          if (matched && (matched as any).id === teamId) championSeasons.add(year);
        }
      }
      return Math.max(championSeasons.size, 1);
    };

    const countRunnerUp = (teamId: number | undefined) => {
      if (teamId == null) return 1;
      const finalsSeasons = new Set<number>();
      for (const award of priorAwards) {
        if (award.type === 'Runner Up' && award.tid === teamId && isValidAwardSeason(award.season)) finalsSeasons.add(Number(award.season));
      }
      if (!isFictional && !pbaIsolated && !wnbaIsolated) {
        for (const [year, brefSeason] of getAllCachedSeasons().entries()) {
          if (!isValidAwardSeason(year) || year > Number(season) || year > externalSeasonCutoff || !brefSeason.runnerUp?.name) continue;
          const matched = matchTeamByWikiName(brefSeason.runnerUp.name, allLookupTeams as any[]);
          if (matched && (matched as any).id === teamId) finalsSeasons.add(year);
        }
      }
      return Math.max(finalsSeasons.size, 1);
    };

    const countPbaConferenceChampions = (teamId: number | undefined, conference?: string) => {
      if (teamId == null) return 1;
      const entries = Array.isArray(state.leagueStats?.pbaConferenceChampions) ? state.leagueStats.pbaConferenceChampions : [];
      const seasons = new Set<number>();
      for (const entry of entries) {
        if (Number(entry?.teamId) !== Number(teamId)) continue;
        if (conference && normalizePbaConferenceKey(entry?.conference) !== conference) continue;
        if (!isValidAwardSeason(entry?.season) || Number(entry?.season) > Number(season)) continue;
        seasons.add(Number(entry.season));
      }
      return Math.max(seasons.size, 1);
    };

    const countAllStar = (playerName: string | undefined) => {
      if (!playerName) return 1;
      const seasons = new Set<number>();
      for (const player of historyPlayers) {
        if (!namesMatch(player.name, playerName)) continue;
        for (const award of player.awards ?? []) {
          if (award.type === 'All-Star' && isValidAwardSeason(award.season) && Number(award.season) <= Number(season)) {
            seasons.add(Number(award.season));
          }
        }
      }
      return Math.max(seasons.size, 1);
    };

    const countAllNBA = (playerName: string | undefined) => {
      if (!playerName) return 1;
      const seasons = new Set<number>();
      for (const award of priorAwards) {
        const awardSeason = Number(award.season);
        if (award.type) {
          if (namesMatch(award.name, playerName) && /^All-(NBA|League)/.test(award.type)) seasons.add(awardSeason);
          continue;
        }
        for (const team of award.allLeague ?? []) {
          if ((team.players ?? []).some((player: any) => namesMatch(player.name, playerName))) seasons.add(awardSeason);
        }
      }
      for (const player of historyPlayers) {
        if (!namesMatch(player.name, playerName)) continue;
        for (const award of player.awards ?? []) {
          const awardSeason = Number(award.season);
          const awardType = normalizePlayerAwardType(award.type);
          if (isValidAwardSeason(awardSeason) && awardSeason <= Number(season) && (awardType.startsWith('All-NBA ') || awardType.startsWith('All-League '))) {
            seasons.add(awardSeason);
          }
        }
      }
      return Math.max(seasons.size, 1);
    };

    const countAllDef = (playerName: string | undefined) => {
      if (!playerName) return 1;
      const seasons = new Set<number>();
      for (const award of priorAwards) {
        const awardSeason = Number(award.season);
        if (award.type) {
          if (namesMatch(award.name, playerName) && /^All-Defensive/.test(award.type)) seasons.add(awardSeason);
          continue;
        }
        for (const team of award.allDefensive ?? []) {
          if ((team.players ?? []).some((player: any) => namesMatch(player.name, playerName))) seasons.add(awardSeason);
        }
      }
      for (const player of historyPlayers) {
        if (!namesMatch(player.name, playerName)) continue;
        for (const award of player.awards ?? []) {
          const awardSeason = Number(award.season);
          const awardType = normalizePlayerAwardType(award.type);
          if (isValidAwardSeason(awardSeason) && awardSeason <= Number(season) && awardType.startsWith('All-Defensive ')) {
            seasons.add(awardSeason);
          }
        }
      }
      return Math.max(seasons.size, 1);
    };

    return {
      countForPlayer,
      countPbaConferenceAwards,
      countChamp,
      countRunnerUp,
      countPbaConferenceChampions,
      countAllStar,
      countAllNBA,
      countAllDef,
    };
  }, [allLookupTeams, awardsAll, externalSeasonCutoff, historyPlayers, isFictional, pbaIsolated, season, state.leagueStats?.pbaConferenceChampions, wnbaIsolated]);

  const hasFlatAllNBA = scopedFlatAwards.some((award) => award.type?.startsWith('All-NBA') || award.type?.startsWith('All-League'));
  const hasFlatAllDef = scopedFlatAwards.some((award) => award.type?.startsWith('All-Defensive'));
  const hasFlatAllRookie = scopedFlatAwards.some((award) => award.type?.startsWith('All-Rookie'));

  const pbaConferenceChampions = useMemo(() => {
    if (!pbaIsolated) return [];
    const entries = Array.isArray(state.leagueStats?.pbaConferenceChampions) ? state.leagueStats.pbaConferenceChampions : [];
    const conferenceMeta = [
      { key: 'philippine', competitionId: 'pba-philippine-cup', label: 'Philippine Cup Champion', accent: 'amber' },
      { key: 'commissioners', competitionId: 'pba-commissioners-cup', label: "Commissioner's Cup Champion", accent: 'sky' },
      { key: 'governors', competitionId: 'pba-governors-cup', label: "Governors' Cup Champion", accent: 'emerald' },
    ] as const;

    return conferenceMeta.map((meta) => {
      const seasonCandidates = getPbaConferenceSeasonCandidates(meta.key);
      const entry = [...entries].reverse().find((candidate: any) =>
        seasonCandidates.includes(Number(candidate?.season))
        && normalizePbaConferenceKey(candidate?.conference) === meta.key
        && !isNonWinnerNote(candidate?.teamName ?? candidate?.name),
      );
      const award = scopedFlatAwards.find((candidate: any) =>
        seasonCandidates.includes(Number(candidate?.season))
        && candidate?.type === 'Champion'
        && getPbaConferenceKey(candidate) === meta.key
        && !isNonWinnerNote(candidate?.name ?? candidate?.team),
      ) ?? null;
      const entryTeamId = (entry as any)?.teamId ?? (entry as any)?.tid;
      const resolvedTeam = entryTeamId != null
        ? resolveAnyTeam(Number(entryTeamId), state.teams as any, state.nonNBATeams ?? []) ?? null
        : award?.tid != null
          ? resolveAnyTeam(Number(award.tid), state.teams as any, state.nonNBATeams ?? []) ?? null
          : findPbaTeamByName(award?.team ?? award?.name ?? entry?.teamName);
      const team = getPbaDisplayTeam(resolvedTeam, award?.team ?? award?.name ?? entry?.teamName);
      const teamAny = team as any;
      const teamId = Number(entryTeamId ?? teamAny?.id ?? teamAny?.tid);
      const branchGames = season >= pbaSourceCutoff && Number.isFinite(teamId)
        ? (state.boxScores ?? []).filter((game: any) =>
            game?.competitionId === meta.competitionId
            && seasonCandidates.includes(Number(game?.season))
            && (Number(game?.homeTeamId) === teamId || Number(game?.awayTeamId) === teamId)
            && Number.isFinite(Number(game?.homeScore))
            && Number.isFinite(Number(game?.awayScore))
            && Number(game?.homeScore) !== Number(game?.awayScore),
          )
        : [];
      const branchRecord = branchGames.reduce(
        (totals: { won: number; lost: number; wins: number; losses: number }, game: any) => {
          const won = Number(game.homeTeamId) === teamId ? didHomeTeamWin(game) : !didHomeTeamWin(game);
          if (won) {
            totals.won += 1;
            totals.wins += 1;
          } else {
            totals.lost += 1;
            totals.losses += 1;
          }
          return totals;
        },
        { won: 0, lost: 0, wins: 0, losses: 0 },
      );
      const record = season >= pbaSourceCutoff
        ? branchGames.length > 0 ? branchRecord : entry?.record ?? null
        : entry?.record
          ?? teamAny?.seasons?.find((candidate: any) => Number(candidate.season) === Number(season))
          ?? null;
      return {
        key: meta.key,
        label: meta.label,
        accent: meta.accent,
        season,
        team,
        record,
        count: teamAny ? awardCounts.countPbaConferenceChampions(teamAny.id ?? teamAny.tid, meta.key) : 0,
      };
    });
  }, [awardCounts, findPbaTeamByName, getPbaConferenceSeasonCandidates, getPbaDisplayTeam, pbaIsolated, pbaSourceCutoff, scopedFlatAwards, season, state.boxScores, state.leagueStats?.pbaConferenceChampions, state.nonNBATeams, state.teams]);

  const euroCompetitionChampions = useMemo(() => {
    if (!euroIsolated) return [];
    const allTeams = [...state.teams, ...(state.nonNBATeams ?? [])];
    const normalizeTeamName = (value: unknown) => String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '')
      .toLowerCase();
    const sourceTeam = (name: string) => {
      if (!name) return null;
      return (matchTeamByWikiName(name, allTeams as any[]) as any) ?? {
        name,
        region: '',
        abbrev: generateAbbrev(name),
      };
    };
    return euroHistoryCompetitions.map(spec => {
      const stored = ((state.competitionHistory?.[spec.id] ?? []) as CompetitionSeasonResolution[])
        .find(entry => Number(entry.season) === Number(season) && entry.championTid != null);
      const resolution = stored ?? resolveCompetitionSeason(
        spec,
        state.boxScores,
        season,
        selectCompetitionTeamTids(spec, state),
      );
      const archiveRows = euroArchives[spec.id] ?? [];
      const archiveSeason = archiveRows.find(entry => competitionSeasonEndYear(entry) === season);
      const archiveChampionName = cleanChampionName(archiveSeason?.Champions ?? archiveSeason?.Season_champions);
      const archiveRunnerUpName = cleanChampionName(archiveSeason?.Runnersup);
      const champion = resolution?.championTid != null
        ? resolveAnyTeam(resolution.championTid, state.teams, state.nonNBATeams ?? []) ?? null
        : sourceTeam(archiveChampionName);
      const runnerUp = resolution?.runnerUpTid != null
        ? resolveAnyTeam(resolution.runnerUpTid, state.teams, state.nonNBATeams ?? []) ?? null
        : sourceTeam(archiveRunnerUpName);
      const championId = Number((champion as any)?.id ?? (champion as any)?.tid);
      const branchTitles = new Set(
        ((state.competitionHistory?.[spec.id] ?? []) as CompetitionSeasonResolution[])
          .filter(entry => Number(entry.season) <= Number(season) && Number(entry.championTid) === championId)
          .map(entry => Number(entry.season)),
      );
      for (const award of awardsAll) {
        if (award.type !== 'Champion' || award.competitionId !== spec.id || Number(award.season) > Number(season)) continue;
        if (Number(award.tid) === championId) branchTitles.add(Number(award.season));
      }
      const championNameKey = normalizeTeamName(getTeamFullName(champion));
      for (const entry of archiveRows) {
        const entrySeason = competitionSeasonEndYear(entry);
        if (!entrySeason || entrySeason > season) continue;
        const entryName = cleanChampionName(entry.Champions ?? entry.Season_champions);
        const matched = matchTeamByWikiName(entryName, allTeams as any[]) as any;
        const matchedId = Number(matched?.id ?? matched?.tid);
        if ((Number.isFinite(championId) && matchedId === championId)
          || (championNameKey && normalizeTeamName(entryName) === championNameKey)) {
          branchTitles.add(entrySeason);
        }
      }
      const record = resolution?.standings?.find(row => row.tid === resolution.championTid) ?? null;
      return {
        competitionId: spec.id,
        label: spec.displayName,
        accentColor: spec.accentColor ?? '#f59e0b',
        season,
        champion,
        runnerUp,
        record: record ? { wins: record.wins, losses: record.losses } : null,
        count: champion ? Math.max(1, branchTitles.size) : 0,
      };
    }).filter(card => card.champion !== null);
  }, [awardsAll, euroArchives, euroHistoryCompetitions, euroIsolated, season, state]);

  const pbaMythicalTeams = useMemo(() => {
    if (!pbaIsolated) return [];
    return buildFlatHistoryTeams('PBA Mythical', ['First Team', 'Second Team'], scopedFlatAwards, allLookupTeams, historyPlayers, season);
  }, [allLookupTeams, historyPlayers, pbaIsolated, scopedFlatAwards]);

  const allNBATeams = useMemo(() => {
    if (liveAwardRaces) {
      return [
        { name: '1st Team', players: liveAwardRaces.allNBATeams.allNBA[0].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: getHistoricalTeamSnapshot(spot.team, season).logoUrl, playerRef: spot.player, count: awardCounts.countAllNBA(spot.player.name) })) },
        { name: '2nd Team', players: liveAwardRaces.allNBATeams.allNBA[1].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: getHistoricalTeamSnapshot(spot.team, season).logoUrl, playerRef: spot.player, count: awardCounts.countAllNBA(spot.player.name) })) },
        { name: '3rd Team', players: liveAwardRaces.allNBATeams.allNBA[2].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: getHistoricalTeamSnapshot(spot.team, season).logoUrl, playerRef: spot.player, count: awardCounts.countAllNBA(spot.player.name) })) },
      ];
    }
    const teams = !hasFlatAllNBA && bbgmRecord?.allLeague
      ? [
          { name: '1st Team', players: resolveHistoryAwardPlayers(bbgmRecord.allLeague[0]?.players, allLookupTeams, historyPlayers, season) },
          { name: '2nd Team', players: resolveHistoryAwardPlayers(bbgmRecord.allLeague[1]?.players, allLookupTeams, historyPlayers, season) },
          { name: '3rd Team', players: resolveHistoryAwardPlayers(bbgmRecord.allLeague[2]?.players, allLookupTeams, historyPlayers, season) },
        ]
      : buildFlatHistoryTeams(isFictional || wnbaIsolated ? 'All-League' : 'All-NBA', ['First Team', 'Second Team', 'Third Team'], scopedFlatAwards, allLookupTeams, historyPlayers, season);
    return applyBrefHistoryTeams(
      teams.map((team) => ({ ...team, players: team.players.map((player) => ({ ...player, count: awardCounts.countAllNBA(player.name) })) })),
      bref?.allNBA ?? [],
      historyPlayers,
      allLookupTeams,
      season,
    );
  }, [allLookupTeams, awardCounts, bbgmRecord, bref, hasFlatAllNBA, historyPlayers, isFictional, liveAwardRaces, scopedFlatAwards, state.players, wnbaIsolated]);

  const euroAllLeagueTeams = useMemo(() => {
    if (!euroIsolated || !euroPrimaryCompetition) return [];
    const program = getActiveCompetitionAwardProgram(euroPrimaryCompetition, season, ['allLeague']);
    const sourceGroups = program.map(entry => ({
      name: entry.type,
      players: resolveHistoryAwardPlayers(
        scopedFlatAwards.filter(award => String(award.type) === entry.type),
        allLookupTeams,
        historyPlayers,
        season,
      ),
    })).filter(group => group.players.length > 0);
    if (sourceGroups.length > 0) return sourceGroups;
    const archived = (euroArchiveSeason?.All_League_Teams ?? []).map(group => ({
      name: group.name,
      players: group.players.map(entry => buildDetailAwardObject(
        { name: entry.name, team: entry.team },
        allLookupTeams,
        historyPlayers,
        season,
      )).filter(Boolean),
    }));
    if (archived.some(group => group.players.length > 0)) return archived;
    if (!isCurrent || !euroAwardRaces) return [];
    const selections = (euroAwardRaces as any).bestFive ?? [];
    return program.map((entry, index) => ({
      name: entry.type,
      players: (selections[index] ?? []).map((spot: any) => ({
        name: spot.player.name,
        team: spot.team?.abbrev ?? '',
        imgURL: spot.player.imgURL,
        face: spot.player.face,
        teamLogoUrl: getHistoricalTeamSnapshot(spot.team, season).logoUrl,
        playerRef: spot.player,
      })),
    }));
  }, [allLookupTeams, euroArchiveSeason, euroAwardRaces, euroIsolated, euroPrimaryCompetition, historyPlayers, isCurrent, scopedFlatAwards, season]);
  const hasEuroAllLeagueTeams = euroAllLeagueTeams.some(group => group.players.length > 0);

  const allDefTeams = useMemo(() => {
    if (liveAwardRaces) {
      return [
        { name: '1st Team', players: liveAwardRaces.allNBATeams.allDefense[0].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: getHistoricalTeamSnapshot(spot.team, season).logoUrl, playerRef: spot.player, count: awardCounts.countAllDef(spot.player.name) })) },
        { name: '2nd Team', players: liveAwardRaces.allNBATeams.allDefense[1].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: getHistoricalTeamSnapshot(spot.team, season).logoUrl, playerRef: spot.player, count: awardCounts.countAllDef(spot.player.name) })) },
      ];
    }
    const teams = pbaIsolated
      ? [{
          name: 'Team',
          players: resolveHistoryAwardPlayers(
            scopedFlatAwards.filter((award) => {
              const key = normalizePbaKey(award.type);
              return key === 'pba all defensive team';
            }),
            allLookupTeams,
            historyPlayers,
            season,
          ),
        }]
      : !hasFlatAllDef && bbgmRecord?.allDefensive
        ? [
            { name: '1st Team', players: resolveHistoryAwardPlayers(bbgmRecord.allDefensive[0]?.players, allLookupTeams, historyPlayers, season) },
            { name: '2nd Team', players: resolveHistoryAwardPlayers(bbgmRecord.allDefensive[1]?.players, allLookupTeams, historyPlayers, season) },
          ]
        : buildFlatHistoryTeams('All-Defensive', ['First Team', 'Second Team'], scopedFlatAwards, allLookupTeams, historyPlayers, season);
    return applyBrefHistoryTeams(
      teams.map((team) => ({ ...team, players: team.players.map((player) => ({ ...player, count: awardCounts.countAllDef(player.name) })) })),
      bref?.allDefensive ?? [],
      historyPlayers,
      allLookupTeams,
      season,
    );
  }, [allLookupTeams, awardCounts, bbgmRecord, bref, hasFlatAllDef, historyPlayers, liveAwardRaces, scopedFlatAwards]);

  const allRookieTeams = useMemo(() => {
    if (liveAwardRaces) {
      return [
        { name: '1st Team', players: liveAwardRaces.allNBATeams.allRookie[0].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: getHistoricalTeamSnapshot(spot.team, season).logoUrl, playerRef: spot.player })) },
        { name: '2nd Team', players: liveAwardRaces.allNBATeams.allRookie[1].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: getHistoricalTeamSnapshot(spot.team, season).logoUrl, playerRef: spot.player })) },
      ];
    }
    const teams = pbaIsolated
      ? [{
          name: 'Team',
          players: resolveHistoryAwardPlayers(
            scopedFlatAwards.filter((award) => {
              const key = normalizePbaKey(award.type);
              return key === 'pba all rookie team';
            }),
            allLookupTeams,
            historyPlayers,
            season,
          ),
        }]
      : !hasFlatAllRookie && bbgmRecord?.allRookie
        ? [{ name: '1st Team', players: resolveHistoryAwardPlayers(bbgmRecord.allRookie, allLookupTeams, historyPlayers, season) }]
        : buildFlatHistoryTeams('All-Rookie', ['First Team', 'Second Team'], scopedFlatAwards, allLookupTeams, historyPlayers, season);
    return applyBrefHistoryTeams(teams, bref?.allRookie ?? [], historyPlayers, allLookupTeams, season);
  }, [allLookupTeams, bbgmRecord, bref, hasFlatAllRookie, historyPlayers, liveAwardRaces, scopedFlatAwards]);

  const hasPbaTeamAwards = pbaIsolated && (pbaMythicalTeams.length > 0 || allDefTeams.length > 0 || allRookieTeams.length > 0);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer as any} onBack={() => setViewingPlayer(null)} />;
  }

  if (!seasonAllowedByHistoryWindow) {
    return (
      <div className="h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors shrink-0">
              <ChevronLeft size={16} /> League History
            </button>
            <div className="h-4 w-px bg-slate-700" />
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">
              {formatLeagueSeasonLabel(season, state.leagueStats)} Season
            </h2>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
            {isHistoricalNbaSave
              ? 'This season is beyond the selected historical start window, so it is hidden from League History in this what-if save.'
              : 'This season is not available in the current League History window.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {notFoundName && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2">
            <span>Records not available for <span className="text-white">{notFoundName}</span></span>
            <button onClick={() => setNotFoundName(null)} className="text-slate-500 hover:text-white ml-1">✕</button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors shrink-0">
            <ChevronLeft size={16} /> League History
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            {formatLeagueSeasonLabel(season, state.leagueStats)} Season
            {isCurrent && (
              <span className="text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                In Progress
              </span>
            )}
          </h2>
        </div>

        {(isCommissionerSeasonReview || isEuroOffseasonSeasonReview) && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                Season Review
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {isEuroOffseasonSeasonReview
                  ? 'Review the completed season, then continue your offseason checklist.'
                  : 'Review the completed season, then return to the next Commissioner task.'}
              </p>
            </div>
            {isEuroOffseasonSeasonReview && (
              <button
                type="button"
                onClick={completeSeasonReview}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-emerald-400"
              >
                <CheckCircle2 size={16} /> Mark Done
              </button>
            )}
          </div>
        )}

        {pbaIsolated ? (
          <PbaConferenceChampionsSection champions={pbaConferenceChampions} isCurrent={isCurrent} />
        ) : euroIsolated ? (
          euroCompetitionChampions.length > 0
            ? <EuroCompetitionChampionsSection champions={euroCompetitionChampions} />
            : null
        ) : (
          <ChampionHeroSection
          champTeam={champTeam}
          champRecord={champRecord}
          runnerUpTeam={runnerUpTeam}
          runnerUpRecord={runnerUpRecord}
          finalsMvp={awards.finalsMvp}
          finalsMvpLabel={euroFinalMvpLabel}
          isCurrent={isCurrent}
          season={season}
          countChamp={euroIsolated ? teamId => countEuroCompetitionResult(teamId) : awardCounts.countChamp}
          countRunnerUp={euroIsolated ? teamId => countEuroCompetitionResult(teamId, true) : awardCounts.countRunnerUp}
          onFinalsMvpClick={() => handlePlayerClick(awards.finalsMvp ?? getAwardEntry('finalsMvp', 'Finals MVP'))}
        />
      )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={13} className="text-slate-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              {pbaIsolated
                ? 'PBA Season Awards'
                : euroIsolated
                  ? `${euroPrimaryCompetition?.displayName ?? 'European Competition'} Individual Awards`
                  : wnbaIsolated
                    ? 'WNBA Season Awards'
                    : 'Season Awards'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {euroIsolated ? (
              euroAwardCards.length > 0 ? euroAwardCards.map(card => (
                <AwardWinner
                  key={card.key}
                  label={card.label}
                  award={card.award}
                  isCurrent={isCurrent}
                  season={season}
                  onClick={card.award && card.source?.role === 'player'
                    ? () => handlePlayerClick(card.source ?? card.award)
                    : undefined}
                />
              )) : (
                <div className="col-span-full rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-500">
                  No individual awards are active for this competition and season.
                </div>
              )
            ) : (
              <>
                {!hasMajorSeasonAwards && (
                  <div className="col-span-full rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-500">
                    No individual awards were active for this season.
                  </div>
                )}
                {isSeasonAwardEnabled('mvp') && <AwardWinner label="MVP" award={awards.mvp} isCurrent={isCurrent} season={season} winCount={awardCounts.countForPlayer(awards.mvp?.name, pbaIsolated ? pbaAwardAliases.mvp : ['MVP', 'Most Valuable Player'], 'mvp')} onClick={() => handlePlayerClick(awards.mvp ?? getAwardEntry('mvp', pbaIsolated ? pbaAwardAliases.mvp : ['MVP', 'Most Valuable Player']))} />}
                {isSeasonAwardEnabled('dpoy') && <AwardWinner label="DPOY" award={awards.dpoy} isCurrent={isCurrent} season={season} winCount={awardCounts.countForPlayer(awards.dpoy?.name, pbaIsolated ? pbaAwardAliases.dpoy : ['DPOY', 'Defensive Player of the Year'], 'dpoy')} onClick={() => handlePlayerClick(awards.dpoy ?? getAwardEntry('dpoy', pbaIsolated ? pbaAwardAliases.dpoy : ['DPOY', 'Defensive Player of the Year']))} />}
                {isSeasonAwardEnabled('coy') && <COYWinner award={awards.coy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.coy?.name, pbaIsolated ? pbaAwardAliases.coy : ['COY', 'Coach of the Year'], 'coy')} />}
            {pbaIsolated && (
              <AwardWinner label="SC" award={awards.scoringChampion} isCurrent={isCurrent} season={season} winCount={awardCounts.countForPlayer(awards.scoringChampion?.name, pbaAwardAliases.scoringChampion, 'mvp')} onClick={() => handlePlayerClick(awards.scoringChampion ?? getAwardEntry('mvp', pbaAwardAliases.scoringChampion))} />
            )}
            {isSeasonAwardEnabled('smoy') && <AwardWinner label="SMOY" award={awards.smoy} isCurrent={isCurrent} season={season} winCount={awardCounts.countForPlayer(awards.smoy?.name, pbaIsolated ? pbaAwardAliases.smoy : 'SMOY', 'smoy')} onClick={() => handlePlayerClick(awards.smoy ?? getAwardEntry('smoy', pbaIsolated ? pbaAwardAliases.smoy : 'SMOY'))} />}
            {pbaIsolated && (
              <AwardWinner label="MQM" award={awards.mqm} isCurrent={isCurrent} season={season} winCount={awardCounts.countForPlayer(awards.mqm?.name, pbaAwardAliases.mqm, 'smoy')} onClick={() => handlePlayerClick(awards.mqm ?? getAwardEntry('smoy', pbaAwardAliases.mqm))} />
            )}
            {pbaIsolated && (
              <>
                <AwardWinner
                  label="Philippine Cup BPC"
                  award={awards.philippineBpc}
                  isCurrent={isCurrent}
                  season={season}
                  winCount={awardCounts.countPbaConferenceAwards(awards.philippineBpc?.name, pbaAwardAliases.bestPlayer, 'philippine')}
                  onClick={() => handlePlayerClick(awards.philippineBpc ?? getPbaConferenceAward(pbaAwardAliases.bestPlayer, 'philippine'))}
                />
                <AwardWinner
                  label="Commissioner's Cup BPC"
                  award={awards.commissionersBpc}
                  isCurrent={isCurrent}
                  season={season}
                  winCount={awardCounts.countPbaConferenceAwards(awards.commissionersBpc?.name, pbaAwardAliases.bestPlayer, 'commissioners')}
                  onClick={() => handlePlayerClick(awards.commissionersBpc ?? getPbaConferenceAward(pbaAwardAliases.bestPlayer, 'commissioners'))}
                />
                <AwardWinner
                  label="Commissioner's Cup Best Import"
                  award={awards.commissionersBestImport}
                  isCurrent={isCurrent}
                  season={season}
                  winCount={awardCounts.countPbaConferenceAwards(awards.commissionersBestImport?.name, pbaAwardAliases.bestImport, 'commissioners')}
                  onClick={() => handlePlayerClick(awards.commissionersBestImport ?? getPbaConferenceAward(pbaAwardAliases.bestImport, 'commissioners'))}
                />
                <AwardWinner
                  label="Governors' Cup BPC"
                  award={awards.governorsBpc}
                  isCurrent={isCurrent}
                  season={season}
                  winCount={awardCounts.countPbaConferenceAwards(awards.governorsBpc?.name, pbaAwardAliases.bestPlayer, 'governors')}
                  onClick={() => handlePlayerClick(awards.governorsBpc ?? getPbaConferenceAward(pbaAwardAliases.bestPlayer, 'governors'))}
                />
                <AwardWinner
                  label="Governors' Cup Best Import"
                  award={awards.governorsBestImport}
                  isCurrent={isCurrent}
                  season={season}
                  winCount={awardCounts.countPbaConferenceAwards(awards.governorsBestImport?.name, pbaAwardAliases.bestImport, 'governors')}
                  onClick={() => handlePlayerClick(awards.governorsBestImport ?? getPbaConferenceAward(pbaAwardAliases.bestImport, 'governors'))}
                />
              </>
            )}
            {isSeasonAwardEnabled('mip') && <AwardWinner label="MIP" award={awards.mip} isCurrent={isCurrent} season={season} winCount={awardCounts.countForPlayer(awards.mip?.name, pbaIsolated ? pbaAwardAliases.mip : 'MIP', 'mip')} onClick={() => handlePlayerClick(awards.mip ?? getAwardEntry('mip', pbaIsolated ? pbaAwardAliases.mip : 'MIP'))} />}
            {isSeasonAwardEnabled('roy') && <AwardWinner label="ROY" award={awards.roy} isCurrent={isCurrent} season={season} winCount={awardCounts.countForPlayer(awards.roy?.name, pbaIsolated ? pbaAwardAliases.roy : 'ROY', 'roy')} onClick={() => handlePlayerClick(awards.roy ?? getAwardEntry('roy', pbaIsolated ? pbaAwardAliases.roy : 'ROY'))} />}
              </>
            )}
          </div>
          {minorAwardCards.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/35 p-3">
              <div className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">Additional Awards</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {minorAwardCards.map(card => (
                  <CompactAwardWinner
                    key={card.key}
                    label={card.label}
                    award={card.award}
                    season={season}
                    onClick={card.isPlayer ? () => handlePlayerClick(card.source ?? card.award) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={13} className="text-slate-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                Stat Leaders
                <span className="ml-2 text-slate-600 font-normal normal-case text-[10px]">min {minGP} GP</span>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {([
                { key: 'pts', title: 'Scoring', unit: 'PPG' },
                { key: 'reb', title: 'Rebounds', unit: 'RPG' },
                { key: 'ast', title: 'Assists', unit: 'APG' },
                { key: 'stl', title: 'Steals', unit: 'SPG' },
                { key: 'blk', title: 'Blocks', unit: 'BPG' },
                { key: 'tpm', title: '3-Pointers', unit: '3PM' },
                { key: 'per', title: 'PER', unit: 'PER' },
              ] as const).map(({ key, title, unit }) => (
                <LeaderColumnWithSeason
                  key={key}
                  title={title}
                  unit={unit}
                  leaders={(leaders as any)[key]}
                  isCurrent={isCurrent}
                  season={season}
                  onPlayerClick={handlePlayerClick}
                />
              ))}
            </div>
        </div>

        {!pbaIsolated && brefLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-4">
            <Loader size={14} className="animate-spin" />
            Loading season data…
          </div>
        ) : ((pbaIsolated && hasPbaTeamAwards) || (euroIsolated && hasEuroAllLeagueTeams) || (!pbaIsolated && !euroIsolated && (hasAllLeague || bref))) ? (
          <div className="space-y-6">
            {pbaIsolated ? (
              <AllTeamSection label="PBA Mythical Team" icon={<Trophy size={12} />} iconColor="text-amber-400" teams={pbaMythicalTeams} season={season} onPlayerClick={handlePlayerClick} showCount />
            ) : euroIsolated ? (
              <AllTeamSection label={`${euroPrimaryCompetition?.shortName ?? 'League'} All-League`} icon={<Trophy size={12} />} iconColor="text-amber-400" teams={euroAllLeagueTeams} season={season} onPlayerClick={handlePlayerClick} />
            ) : (
              <AllTeamSection label={wnbaIsolated ? 'All-WNBA' : isFictional ? 'All-League' : 'All-NBA'} icon={<Trophy size={12} />} iconColor="text-amber-400" teams={allNBATeams} season={season} onPlayerClick={handlePlayerClick} showCount />
            )}
            {!euroIsolated && (pbaIsolated ? allDefTeams.length > 0 : true) && (
              <AllTeamSection label={pbaIsolated ? 'PBA All-Defensive' : 'All-Defensive'} icon={<Shield size={12} />} iconColor="text-blue-400" teams={allDefTeams} season={season} onPlayerClick={handlePlayerClick} showCount />
            )}
            {!euroIsolated && (pbaIsolated ? allRookieTeams.length > 0 : true) && (
              <AllTeamSection label={pbaIsolated ? 'PBA All-Rookie' : 'All-Rookie'} icon={<Zap size={12} />} iconColor="text-green-400" teams={allRookieTeams} season={season} onPlayerClick={handlePlayerClick} />
            )}
          </div>
        ) : null}

        {!pbaIsolated || bestRecords.length > 0 ? <BestRecordsSection bestRecords={bestRecords} /> : null}

        {(!pbaIsolated && !euroIsolated || semifinalsMvps.length > 0) ? <SemifinalsMvpsSection
          semifinalsMvps={semifinalsMvps}
          season={season}
          onPlayerSelect={handlePlayerClick}
          onPlayerMissing={(name) => handlePlayerClick({ name })}
        /> : null}

        {!pbaIsolated && !euroIsolated && allStarRoster?.length ? <AllStarSection
          state={state}
          allStarRoster={allStarRoster}
          players={historyPlayers}
          teams={historyTeams}
          season={season}
          countAllStar={awardCounts.countAllStar}
          onPlayerSelect={handlePlayerClick}
          onPlayerMissing={(name) => handlePlayerClick({ name })}
          groupByConference={shouldGroupAllStarsByConference}
          useNbaConferenceLogos={!wnbaIsolated && !isFictional}
        /> : null}
      </div>
    </div>
  );
};
