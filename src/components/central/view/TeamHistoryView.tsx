import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, ArrowLeft, History, LayoutGrid, Trophy } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { getAllCachedSeasons, matchTeamByWikiName, useBRefSeasonsBatch } from '../../../data/brefFetcher';
import {
  fetchRegularRecords, fetchPlayoffRecords, fetchCareerLeaders, fetchAverageLeaders,
  fetchMissingPortraits,
  filterToTeam, getStatValue, CATEGORY_ORDER, CATEGORY_ORDER_AVG, buildCareerLeadersFromLiveTotals, buildAverageLeadersFromLiveTotals,
  cleanName, computeLiveTotals, computeLeagueLiveTotals, mergeCareerLeaders, mergeAverageLeaders, parseStatVal,
  computeLiveTotalsForTeamSeasons, computeSourceHistoricalTotals,
} from '../../../data/franchiseService';
import { buildNativeHistoricalPlayersThroughSeason, ensureFullRosterPlayerDataLoaded, ensureNativeHistoricalStatsLoaded, ensurePortraitLookupsLoaded, fetchNativeHistoricalPlayerByName, getAllFullRosterPlayers, getNativeRetiredJerseyRecords, getPhotoByName, getPhotoByPlayerIdentity } from '../../../data/realPlayerDataFetcher';
import { mergeHistoricalLeagueTotals } from '../../../data/historicalLeagueTotals';
import type { GameResult, NBAPlayer, Tab } from '../../../types';
import { getActiveLeagueTeams, resolveAnyTeam } from '../../../utils/teamLookup';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../../../utils/uiMode';
import { getTeamMascot } from '../../../utils/helpers';
import { getTeamFullName } from '../../../utils/teamNames';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { TeamHistoryLeadersPanel, TeamHistoryOverviewPanel, TeamHistoryRecordsPanel, TeamHistoryRetireModal, TeamHistorySeasonPanel, type TeamHistoryPlayerReference } from './TeamHistoryPanels';
import { mergeRetiredJerseyRecordsByNumber } from '../../../services/playerDevelopment/jerseyRetirementChecker';
import { TeamHistoryPicker } from './TeamHistoryPicker';
import { avatarFallback, consumePendingTeamHistoryOrigin, consumePendingTeamHistoryTid, getBestAccentColor, NBA_HUB_ID, requestTeamHistoryFor } from './TeamHistoryShared';
import { buildPbaAverageLeaders, buildPbaCareerLeaders, buildPbaTeamLiveTotals } from './pbaTeamHistoryStats';
import {
  getHistoricalNbaBranchSeasonCutoff,
  getHistoricalNbaCompletedSeasonCutoff,
  isHistoricalNbaWhatIfSave,
} from '../../../services/playerDevelopment/hofHistoryWindow';
import { filterPostBranchSourceStats, filterRetiredJerseysToTimeline, timelineInputFromState } from '../../../utils/historicalTimeline';
import { isAwardVisibleInTimeline } from '../../../utils/awardHistory';
import { getArchivedTeamSeasonSet, getArchivedTeamStatsTid, getTeamArchiveKey, isArchivedTeam } from '../../../utils/teamArchive';
import { mergeFranchiseRecords } from '../../../services/stats/franchiseRecords';
import {
  buildEuroTeamSeasonHistory,
  buildEuroTeamTrophies,
  getEuroTeamCompetitionOptions,
} from '../../../services/euro/euroTeamHistory';
import { TeamHistoryTrophiesPanel } from './TeamHistoryTrophiesPanel';
import type { AwardTrophyNamespace } from '../../../services/awards/awardTrophyPhotos';
import { buildModdedTeamTrophies } from '../../../services/history/moddedTeamTrophies';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import {
  isHistoryAwardInLeagueScope,
  scopeHistoryPlayersToLeague,
  scopeHistoryPlayersToTeam,
  type HistoryLeagueBucket,
} from './historyLeagueScope';
import { resolveTeamHistoryRecord } from './historySeasonSource';
import { EXTERNAL_LEAGUE_PRESENTATION } from '../../../data/externalLeaguePresentation';
import {
  getBackgroundTeamHistory,
  mergeBackgroundStatsIntoPlayers,
} from '../../../services/backgroundUniverse/backgroundUniverseSelectors';
import { formatLeagueSeasonLabel } from '../../../services/leagueCalendar';
import { createRetiredJerseyIdentityIndex } from '../../../services/playerUniverse/retiredJerseyIdentity';
import { combineFranchiseLegacyScore, isFranchiseStatRow, scoreFranchiseCareerProduction } from './teamHistoryRanking';
import { canonicalTeamHistoryRecordCategory, dedupeTeamHistoryRecords } from './teamHistoryRecords';
import { getSourceOnlyHistoryPlayer, resolveSavedHistoryPlayer } from '../../../services/navigation/historyPlayerNavigation';
import { PlayerBioView } from './PlayerBioView';
import { getSaveVisiblePeople } from '../../../services/playerUniverse/canonicalHistoricalPeople';
import { buildTeamHistoryAwardRankings } from '../../../services/history/teamHistoryAwards';
import { TeamHistoryAwardsPanel } from './TeamHistoryAwardsPanel';

export { requestTeamHistoryFor };

const SOURCE_RECORD_DEFS = [
  { category: 'Points', key: 'PTS', fields: ['ptsMax', 'pbaHigh'] },
  { category: 'Rebounds', key: 'REB', fields: ['trbMax', 'rebMax'] },
  { category: 'Assists', key: 'AST', fields: ['astMax'] },
  { category: 'Blocks', key: 'BLK', fields: ['blkMax'] },
  { category: 'Steals', key: 'STL', fields: ['stlMax'] },
  { category: 'Field Goals Made', key: 'FGM', fields: ['fgMax'] },
  { category: 'Field Goals Attempted', key: 'FGA', fields: ['fgaMax'] },
  { category: 'Three-Pointers Made', key: '3PM', fields: ['tpMax', 'threePmMax'] },
  { category: 'Three-Pointers Attempted', key: '3PA', fields: ['tpaMax', 'threePaMax'] },
  { category: 'Free Throws Made', key: 'FTM', fields: ['ftMax'] },
  { category: 'Free Throws Attempted', key: 'FTA', fields: ['ftaMax'] },
  { category: 'Offensive Rebounds', key: 'OREB', fields: ['orbMax'] },
  { category: 'Defensive Rebounds', key: 'DREB', fields: ['drbMax'] },
  { category: 'Turnovers', key: 'TOV', fields: ['tovMax'] },
  { category: 'Personal Fouls', key: 'PF', fields: ['pfMax'] },
  { category: 'Minutes Played', key: 'MIN', fields: ['minMax'] },
] as const;

function sourceRecordValue(row: Record<string, any>, fields: readonly string[]): number {
  let best = 0;
  for (const field of fields) {
    const raw = row[field];
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) best = Math.max(best, parsed);
    }
  }
  return best;
}

const normalizeTeamText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

const normalizePbaConference = (value: unknown): 'philippine' | 'commissioners' | 'governors' | null => {
  const text = normalizeTeamText(value);
  if (text.includes('commissioner')) return 'commissioners';
  if (text.includes('governor')) return 'governors';
  if (text.includes('philippine') || text.includes('all filipino') || text.includes('all philippine')) return 'philippine';
  return null;
};

const hasSourceHallOfFame = (player: any) =>
  Boolean(player?.hof)
  || ((player?.awards ?? []) as any[]).some((award: any) =>
    String(award?.type ?? award?.award ?? award?.name ?? '').toLowerCase().includes('hall of fame'),
  );

const sourceLastRegularSeason = (player: any): number | undefined => {
  const seasons = ((player?.stats ?? []) as any[])
    .filter(row => !row?.playoffs && Number(row?.gp ?? 0) > 0)
    .map(row => Number(row?.season))
    .filter(Number.isFinite);
  return seasons.length ? Math.max(...seasons) : undefined;
};

const sourceJerseyForTeam = (player: any, teamId: number | null, teamAbbrevs: Set<string>, maxSeason: number): string | undefined => {
  const rows = ((player?.stats ?? []) as any[])
    .filter(row => {
      if (row?.playoffs || row?.jerseyNumber == null || row?.jerseyNumber === '') return false;
      const season = Number(row?.season ?? 0);
      if (!Number.isFinite(season) || season > maxSeason) return false;
      if (teamId != null && Number(row?.tid) === teamId) return true;
      const abbrev = String(row?.abbrev ?? row?.teamAbbrev ?? row?.tm ?? row?.TM ?? '').trim().toUpperCase();
      return !!abbrev && teamAbbrevs.has(abbrev);
    })
    .sort((left, right) => Number(right?.season ?? 0) - Number(left?.season ?? 0));
  const number = rows[0]?.jerseyNumber;
  return number == null || number === '' ? undefined : String(number);
};

interface TeamHistoryViewProps {
  onViewChange?: (view: Tab) => void;
  initialTeamId?: number;
  initialOriginView?: Tab;
}

export const TeamHistoryView: React.FC<TeamHistoryViewProps> = ({ onViewChange, initialTeamId, initialOriginView }) => {
  const { state, navigateToPlayer } = useGame();
  const saveVisiblePeople = useMemo(
    () => getSaveVisiblePeople(state),
    [state.backgroundUniverse, state.historicalPeople, state.players],
  );
  const timeline = timelineInputFromState(state);
  const isFictional = state.leagueType === 'fictional';
  const euroIsolated = isEuroIsolatedMode(state);
  const pbaIsolated = isPbaIsolatedMode(state);
  const wnbaIsolated = isWnbaIsolatedMode(state);
  const labels = useLeagueLabels();
  const isNbaHistoryScope = state.leagueType === 'modded'
    && (state.moddedLeagueBase ?? 'nba') === 'nba'
    && !euroIsolated
    && !pbaIsolated
    && !wnbaIsolated;
  const teamTrophyNamespace: AwardTrophyNamespace | undefined = isFictional || pbaIsolated || state.leagueType !== 'modded'
    ? undefined
    : euroIsolated
      ? 'euro'
      : wnbaIsolated
        ? 'wnba'
        : state.moddedLeagueBase === 'nba' || state.moddedLeagueBase == null
          ? 'nba'
          : undefined;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(() => initialTeamId ?? consumePendingTeamHistoryTid());
  const [originView, setOriginView] = useState<Tab | null>(() => initialOriginView ?? consumePendingTeamHistoryOrigin());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'records' | 'leaders' | 'awards' | 'history' | 'trophies'>('overview');
  const [euroCompetitionFilter, setEuroCompetitionFilter] = useState(state.euroPrimaryCompetitionId ?? 'all');
  const [recordType, setRecordType] = useState<'regular' | 'playoff'>('regular');
  const [leaderSubTab, setLeaderSubTab] = useState<'totals' | 'averages'>('totals');
  const [expandedLeaders, setExpandedLeaders] = useState<Record<string, boolean>>({});
  const [expandedRecords, setExpandedRecords] = useState<Record<string, boolean>>({});
  const [showRetireModal, setShowRetireModal] = useState(false);
  const [regularRecords, setRegularRecords] = useState<any[]>([]);
  const [playoffRecords, setPlayoffRecords] = useState<any[]>([]);
  const [careerLeaders, setCareerLeaders] = useState<any[]>([]);
  const [averageLeaders, setAverageLeaders] = useState<any[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [portraitMap, setPortraitMap] = useState<Map<string, string>>(new Map());
  const [fullRosterRecordPlayers, setFullRosterRecordPlayers] = useState<Array<Record<string, any>>>([]);
  const [sourceOnlyHistoryPlayer, setSourceOnlyHistoryPlayer] = useState<NBAPlayer | null>(null);
  const leagueHubLogoUrl = isNbaHistoryScope
    ? 'https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg'
    : EXTERNAL_LEAGUE_PRESENTATION.find(entry => entry.name === (pbaIsolated ? 'PBA' : wnbaIsolated ? 'WNBA' : ''))?.logo;

  const nbaHubTeam = {
    id: NBA_HUB_ID,
    name: 'League',
    region: labels.leagueName,
    abbrev: labels.leagueName.split(/\s+/).map(word => word[0]).join('').slice(0, 4).toUpperCase() || 'LGE',
    colors: ['#1D428A', '#C8102E'],
    conference: 'League',
    logoUrl: leagueHubLogoUrl,
  };
  const teamArchive = (state.teamArchive ?? []) as any[];
  const selectedArchivedTeam = selectedTeamId != null ? teamArchive.find(team => team.id === selectedTeamId) ?? null : null;
  const selectedTeam = selectedTeamId === NBA_HUB_ID
    ? nbaHubTeam
    : (selectedTeamId != null ? selectedArchivedTeam ?? resolveAnyTeam(selectedTeamId, state.teams, state.nonNBATeams ?? []) ?? null : null);
  const isNBAHub = selectedTeamId === NBA_HUB_ID;
  const selectedTeamKey = selectedTeam
    ? `${selectedTeam.id}|${selectedTeam.abbrev ?? ''}|${selectedTeam.region ?? ''}|${selectedTeam.name ?? ''}`
    : '';
  const selectedTeamSeasonKey = selectedTeam
    ? ((selectedTeam as any).seasons ?? []).map((season: any) => `${season.season}:${season.won ?? season.wins ?? ''}:${season.lost ?? season.losses ?? ''}`).join('|')
    : '';
  const selectedTeamStatsTid = selectedTeam ? getArchivedTeamStatsTid(selectedTeam as any) : null;
  const selectedIsArchived = selectedTeam ? isArchivedTeam(selectedTeam) : false;
  const selectedArchivedSeasonSet = useMemo(
    () => selectedTeam ? getArchivedTeamSeasonSet(selectedTeam as any) : null,
    [selectedTeamKey, selectedTeamSeasonKey],
  );
  const historicalWhatIf = isHistoricalNbaWhatIfSave({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  });
  const populatedSeasonCutoff = getHistoricalNbaCompletedSeasonCutoff({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  }) ?? state.leagueStats?.year ?? new Date(state.date).getFullYear();
  const historicalSourceCutoff = getHistoricalNbaBranchSeasonCutoff({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  }) ?? populatedSeasonCutoff;
  const historyPlayers = useMemo(() => {
    const timelinePlayers = historicalWhatIf
      ? saveVisiblePeople.map(player => ({
          ...player,
          stats: filterPostBranchSourceStats(player.stats, state.nbaStartYear),
        }))
      : saveVisiblePeople;
    return mergeBackgroundStatsIntoPlayers(timelinePlayers, state);
  }, [historicalWhatIf, saveVisiblePeople, state.backgroundUniverse, state.nbaStartYear]);
  const backgroundTeamHistory = useMemo(
    () => selectedTeamStatsTid == null ? [] : getBackgroundTeamHistory(state, selectedTeamStatsTid),
    [selectedTeamStatsTid, state.backgroundUniverse],
  );
  const historyLeagueBucket: HistoryLeagueBucket | null = isNbaHistoryScope && backgroundTeamHistory.length === 0
    ? 'nba'
    : wnbaIsolated && backgroundTeamHistory.length === 0
      ? 'wnba'
      : null;
  const historyStatPlayers = useMemo(
    () => historyLeagueBucket
      ? scopeHistoryPlayersToLeague(historyPlayers, state.teams, historyLeagueBucket)
      : historyPlayers,
    [historyLeagueBucket, historyPlayers, state.teams],
  );
  const maxVisibleSeason = state.leagueStats?.year ?? new Date(state.date).getFullYear();
  const canUseExternalFranchiseFeed = !!selectedTeam && isNbaHistoryScope && (isNBAHub || (selectedTeam.id >= 0 && selectedTeam.id < 30));
  const euroCompetitionOptions = useMemo(
    () => euroIsolated && selectedTeam ? getEuroTeamCompetitionOptions(state, selectedTeamStatsTid ?? selectedTeam.id) : [],
    [euroIsolated, selectedTeamKey, selectedTeamStatsTid, state.activeCompetitions, state.boxScores, state.competitionHistory, state.euroCompetitionTeamTids],
  );
  useEffect(() => {
    if (!euroIsolated || !selectedTeam) return;
    const valid = new Set(['all', ...euroCompetitionOptions.map(option => option.id)]);
    setEuroCompetitionFilter(current => valid.has(current)
      ? current
      : euroCompetitionOptions.find(option => option.id === state.euroPrimaryCompetitionId)?.id
        ?? euroCompetitionOptions[0]?.id
        ?? 'all');
  }, [euroCompetitionOptions, euroIsolated, selectedTeamKey, state.euroPrimaryCompetitionId]);

  const liveTotals = useMemo(
    () => selectedTeam
      ? (isNBAHub && pbaIsolated
        ? buildPbaTeamLiveTotals(state, null)
        : pbaIsolated
        ? buildPbaTeamLiveTotals(state, selectedTeam.id)
        : isNBAHub
          ? computeLeagueLiveTotals(historyStatPlayers, populatedSeasonCutoff)
          : selectedArchivedSeasonSet && selectedTeamStatsTid != null
            ? computeLiveTotalsForTeamSeasons(historyStatPlayers, selectedTeamStatsTid, selectedArchivedSeasonSet, populatedSeasonCutoff)
            : computeLiveTotals(historyStatPlayers, selectedTeam.id, populatedSeasonCutoff))
      : [],
    [
      isNBAHub,
      pbaIsolated,
      populatedSeasonCutoff,
      selectedTeamKey,
      selectedTeamSeasonKey,
      selectedTeamStatsTid,
      historyStatPlayers,
      state.boxScores,
      state.schedule,
      state.playoffs,
      state.nbaCup,
      state.nbaCupHistory,
      state.leagueStats,
    ],
  );
  const branchLiveTotals = useMemo(() => {
    if (!historicalWhatIf || !selectedTeam) return [];
    if (isNBAHub) return computeLeagueLiveTotals(historyStatPlayers, populatedSeasonCutoff, historicalSourceCutoff);
    if (selectedArchivedSeasonSet && selectedTeamStatsTid != null) {
      return computeLiveTotalsForTeamSeasons(
        historyStatPlayers,
        selectedTeamStatsTid,
        selectedArchivedSeasonSet,
        populatedSeasonCutoff,
        historicalSourceCutoff,
      );
    }
    return computeLiveTotals(historyStatPlayers, selectedTeam.id, populatedSeasonCutoff, historicalSourceCutoff);
  }, [
    historicalWhatIf,
    historicalSourceCutoff,
    historyStatPlayers,
    isNBAHub,
    populatedSeasonCutoff,
    selectedTeamKey,
    selectedTeamSeasonKey,
    selectedTeamStatsTid,
  ]);
  const selectedTeamAbbrevs = useMemo(() => {
    if (!selectedTeam) return new Set<string>();
    const values = [
      (selectedTeam as any).abbrev,
      ...(((selectedTeam as any).identitySeasons ?? []) as any[]).map(row => row?.abbrev),
      ...(((selectedTeam as any).seasons ?? []) as any[]).map(row => row?.abbrev),
    ];
    return new Set(values.map(value => String(value ?? '').trim().toUpperCase()).filter(Boolean));
  }, [selectedTeamKey, selectedTeamSeasonKey]);
  const sourceHistoryPlayers = useMemo(() => {
    if (!historyLeagueBucket) return fullRosterRecordPlayers;
    const leagueScoped = scopeHistoryPlayersToLeague(fullRosterRecordPlayers, state.teams, historyLeagueBucket);
    return isNBAHub || !selectedTeam
      ? leagueScoped
      : scopeHistoryPlayersToTeam(leagueScoped, selectedTeamAbbrevs, historyLeagueBucket);
  }, [fullRosterRecordPlayers, historyLeagueBucket, isNBAHub, selectedTeamKey, selectedTeamAbbrevs, state.teams]);
  const awardRankings = useMemo(() => buildTeamHistoryAwardRankings({
    players: [...historyStatPlayers, ...(sourceHistoryPlayers as NBAPlayer[])],
    historicalAwards: state.historicalAwards ?? [],
    maxSeason: populatedSeasonCutoff,
    leagueBucket: historyLeagueBucket,
    competitionIds: euroIsolated && euroCompetitionFilter !== 'all'
      ? new Set([euroCompetitionFilter.toLowerCase()])
      : undefined,
    teamScope: !isNBAHub && selectedTeam && selectedTeamStatsTid != null
      ? {
          teamId: selectedTeamStatsTid,
          acceptedTeamAbbrevs: selectedTeamAbbrevs,
          seasons: selectedArchivedSeasonSet ?? undefined,
        }
      : undefined,
  }), [
    euroCompetitionFilter,
    euroIsolated,
    historyLeagueBucket,
    historyStatPlayers,
    isNBAHub,
    populatedSeasonCutoff,
    selectedArchivedSeasonSet,
    selectedTeamAbbrevs,
    selectedTeamKey,
    selectedTeamStatsTid,
    sourceHistoryPlayers,
    state.historicalAwards,
  ]);
  const sourceHistoricalTotals = useMemo(
    () => selectedTeam && isNbaHistoryScope
      ? computeSourceHistoricalTotals(sourceHistoryPlayers, {
          seasons: selectedArchivedSeasonSet,
          maxSeason: historicalSourceCutoff,
          leagueWide: true,
        })
      : [],
    [
      isNbaHistoryScope,
      isNBAHub,
      historicalSourceCutoff,
      selectedArchivedSeasonSet,
      selectedTeamKey,
      selectedTeamStatsTid,
      sourceHistoryPlayers,
    ],
  );
  const historyTotals = useMemo(
    () => historicalWhatIf && !pbaIsolated
      ? mergeHistoricalLeagueTotals(sourceHistoricalTotals, liveTotals, branchLiveTotals)
      : sourceHistoricalTotals.length && !pbaIsolated
        ? [...sourceHistoricalTotals, ...liveTotals]
        : liveTotals,
    [branchLiveTotals, historicalWhatIf, liveTotals, pbaIsolated, sourceHistoricalTotals],
  );
  const mergedCareer = useMemo(
    () => pbaIsolated
      ? buildPbaCareerLeaders(liveTotals as any)
      : historicalWhatIf
        ? buildCareerLeadersFromLiveTotals(historyTotals)
        : mergeCareerLeaders(careerLeaders, historyTotals),
    [careerLeaders, historicalWhatIf, historyTotals, liveTotals, pbaIsolated],
  );
  const mergedAverage = useMemo(
    () => pbaIsolated
      ? buildPbaAverageLeaders(liveTotals as any)
      : historicalWhatIf
        ? buildAverageLeadersFromLiveTotals(historyTotals)
        : mergeAverageLeaders(averageLeaders, historyTotals),
    [averageLeaders, historicalWhatIf, historyTotals, liveTotals, pbaIsolated],
  );
  const accent = selectedTeam ? getBestAccentColor(selectedTeam.colors, selectedTeam.name) : '#94a3b8';

  const findPlayerImg = (name: string): string => {
    const key = name?.toLowerCase().trim();
    const statePlayer = saveVisiblePeople.find(player => player.name?.toLowerCase() === key);
    if (statePlayer?.imgURL) return statePlayer.imgURL;
    if (isNbaHistoryScope && statePlayer) {
      const fromIdentity = getPhotoByPlayerIdentity(statePlayer);
      if (fromIdentity) return fromIdentity;
    }
    if (isNbaHistoryScope) {
      const fromGist = portraitMap.get(key);
      if (fromGist) return fromGist;
      const fromSource = getPhotoByName(name);
      if (fromSource) return fromSource;
    }
    return avatarFallback(name);
  };

  useEffect(() => {
    if (!isNbaHistoryScope) {
      setPortraitMap(new Map());
      return;
    }
    ensurePortraitLookupsLoaded();
    fetchMissingPortraits().then(portraits => {
      const next = new Map<string, string>();
      for (const portrait of portraits) {
        if (portrait.name && portrait.portrait) next.set(portrait.name.toLowerCase().trim(), portrait.portrait);
      }
      setPortraitMap(next);
    }).catch(() => {});
  }, [isNbaHistoryScope]);

  useEffect(() => {
    if (!isNbaHistoryScope) {
      setFullRosterRecordPlayers([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      ensureFullRosterPlayerDataLoaded(),
      ensureNativeHistoricalStatsLoaded(),
      ensurePortraitLookupsLoaded(),
    ])
      .then(() => {
        if (!cancelled) {
          setFullRosterRecordPlayers([
            ...getAllFullRosterPlayers(),
            ...buildNativeHistoricalPlayersThroughSeason(historicalSourceCutoff),
          ]);
        }
      })
      .catch(() => {
        if (!cancelled) setFullRosterRecordPlayers([]);
      });
    return () => { cancelled = true; };
  }, [historicalSourceCutoff, isNbaHistoryScope]);

  useEffect(() => {
    if (!selectedTeam) return;
    if (!isNbaHistoryScope || selectedTeam.id >= 100 || !canUseExternalFranchiseFeed) {
      setRegularRecords([]);
      setPlayoffRecords([]);
      setCareerLeaders([]);
      setAverageLeaders([]);
      setExternalError(null);
      setExternalLoading(false);
      return;
    }

    let cancelled = false;
    setExternalLoading(true);
    setExternalError(null);
    setRegularRecords([]);
    setPlayoffRecords([]);
    setCareerLeaders([]);
    setAverageLeaders([]);
    Promise.all([fetchRegularRecords(), fetchPlayoffRecords(), fetchCareerLeaders(), fetchAverageLeaders()])
      .then(([regular, playoff, career, average]) => {
        if (cancelled) return;
        if (selectedTeamId === NBA_HUB_ID) {
          setRegularRecords(regular);
          setPlayoffRecords(playoff);
          setCareerLeaders(career);
          setAverageLeaders(average.filter(leader => parseInt(leader.GP || '0', 10) >= 100));
          return;
        }
        setRegularRecords(filterToTeam(regular, selectedTeam));
        setPlayoffRecords(filterToTeam(playoff, selectedTeam));
        setCareerLeaders(filterToTeam(career, selectedTeam));
        setAverageLeaders(filterToTeam(average, selectedTeam).filter(leader => parseInt(leader.GP || '0', 10) >= 100));
      })
      .catch(error => { if (!cancelled) setExternalError(String(error)); })
      .finally(() => { if (!cancelled) setExternalLoading(false); });

    return () => { cancelled = true; };
  }, [canUseExternalFranchiseFeed, isNbaHistoryScope, selectedTeamKey, selectedTeamId]);

  const topPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    const savedPlayerIds = new Set(saveVisiblePeople.map(player => player.internalId));
    const identityFields = (player: any) => savedPlayerIds.has(player?.internalId)
      ? { playerId: player.internalId, playerIdentityMatch: 'id' as const }
      : player?.internalId
        ? { playerRef: player, playerIdentityMatch: 'source' as const }
        : { playerIdentityMatch: 'name' as const };
    const playerByName = new Map<string, any>();
    for (const player of historyStatPlayers) {
      const key = cleanName(player.name ?? '').toLowerCase().trim();
      if (key && !playerByName.has(key)) playerByName.set(key, player);
    }
    for (const player of sourceHistoryPlayers) {
      const key = cleanName(String(player?.name ?? '')).toLowerCase().trim();
      if (!key) continue;
      const current = playerByName.get(key);
      const currentScopedGames = (current?.stats ?? []).reduce(
        (sum: number, row: any) => sum + (!row?.playoffs ? Number(row?.gp ?? 0) : 0),
        0,
      );
      const sourceScopedGames = (player?.stats ?? []).reduce(
        (sum: number, row: any) => sum + (!row?.playoffs ? Number(row?.gp ?? 0) : 0),
        0,
      );
      if (current && (currentScopedGames > 0 || sourceScopedGames <= 0)) continue;
      playerByName.set(key, {
        ...player,
        name: cleanName(String(player.name ?? '')),
        imgURL: current?.imgURL ?? player.imgURL ?? getPhotoByPlayerIdentity(player),
        _historySourceOnly: true,
      });
    }
    const franchiseSeasonSet = !isNBAHub
      ? new Set<number>(((selectedTeam as any)?.seasons ?? [])
          .map((season: any) => Number(season.season))
          .filter((season: number) => Number.isFinite(season) && season <= populatedSeasonCutoff))
      : null;
    const hasFranchiseSeasonGuard = !!franchiseSeasonSet && franchiseSeasonSet.size > 0;

    const scorePlayer = (player: any, tid: number | null): number => {
      const playerCutoff = historicalWhatIf && player._historySourceOnly
        ? historicalSourceCutoff
        : populatedSeasonCutoff;
      const teamSeasons = tid !== null
        ? new Set(
            (player.stats ?? [])
              .filter((season: any) => Number(season.season) <= playerCutoff && isFranchiseStatRow(season, tid, selectedTeamAbbrevs) && (!hasFranchiseSeasonGuard || franchiseSeasonSet!.has(Number(season.season))))
              .map((season: any) => season.season),
          )
        : null;
      const inScope = (season: number) => teamSeasons === null || teamSeasons.has(season);

      const scopedStatSeasons = new Set<number>(
        (player.stats ?? [])
          .map((row: any) => Number(row?.season))
          .filter((season: number) => Number.isFinite(season) && season <= playerCutoff),
      );
      const awards = (player.awards ?? []).filter((award: any) =>
        isAwardVisibleInTimeline(award, playerCutoff)
        && inScope(award.season)
        && (!historyLeagueBucket || isHistoryAwardInLeagueScope(award, historyLeagueBucket, scopedStatSeasons)),
      );
      const mvp = awards.filter((award: any) => award.type === 'Most Valuable Player').length;
      const fmvp = awards.filter((award: any) => award.type === 'Finals MVP').length;
      const al1 = awards.filter((award: any) => award.type === 'All-NBA First Team' || award.type === 'All-League First Team').length;
      const al2 = awards.filter((award: any) => award.type === 'All-NBA Second Team' || award.type === 'All-League Second Team').length;
      const al3 = awards.filter((award: any) => award.type === 'All-NBA Third Team' || award.type === 'All-League Third Team').length;
      const ad1 = awards.filter((award: any) => award.type === 'All-Defensive First Team').length;
      const ad2 = awards.filter((award: any) => award.type === 'All-Defensive Second Team').length;
      const allStar = awards.filter((award: any) => award.type === 'All-Star').length;
      const champ = awards.filter((award: any) => award.type === 'NBA Champion').length;
      const regularStats = (player.stats ?? []).filter(
        (season: any) =>
          !season.playoffs &&
          Number(season.season) <= playerCutoff &&
          (
            tid === null ||
            (
              isFranchiseStatRow(season, tid, selectedTeamAbbrevs) &&
              (!hasFranchiseSeasonGuard || franchiseSeasonSet!.has(Number(season.season)))
            )
          ),
      );
      const playoffStats = (player.stats ?? []).filter(
        (season: any) =>
          !!season.playoffs &&
          Number(season.season) <= playerCutoff &&
          (
            tid === null ||
            (
              isFranchiseStatRow(season, tid, selectedTeamAbbrevs) &&
              (!hasFranchiseSeasonGuard || franchiseSeasonSet!.has(Number(season.season)))
            )
          ),
      );
      const regularWS = regularStats.reduce((sum: number, season: any) => sum + (season.ows ?? 0) + (season.dws ?? 0) + (season.ewa ?? 0), 0);
      const playoffWS = playoffStats.reduce((sum: number, season: any) => sum + (season.ows ?? 0) + (season.dws ?? 0) + (season.ewa ?? 0), 0);
      return mvp * 6 + fmvp * 6 + al1 * 2 + al2 + al3 * 0.25 + (ad1 + ad2) * 0.15 + allStar * 0.1 + champ + (playoffWS / 2) * 0.1 + (regularWS / 2) * 0.075;
    };

    const hasVisibleHof = (player: any): boolean => {
      if (!player.hof) return false;
      if (!historicalWhatIf) return true;
      const inductionYear = Number(player.hofInductionYear ?? 0);
      const playerCutoff = player._historySourceOnly ? historicalSourceCutoff : populatedSeasonCutoff;
      return inductionYear > 0 ? inductionYear <= playerCutoff : !player._historySourceOnly;
    };

    const qualifiesForLeagueGoatList = (player: any): boolean => {
      if (hasVisibleHof(player)) return true;
      const playerCutoff = historicalWhatIf && player._historySourceOnly
        ? historicalSourceCutoff
        : populatedSeasonCutoff;
      const scopedStatSeasons = new Set<number>(
        (player.stats ?? [])
          .map((row: any) => Number(row?.season))
          .filter((season: number) => Number.isFinite(season) && season <= playerCutoff),
      );
      const awards = (player.awards ?? []).filter((award: any) =>
        isAwardVisibleInTimeline(award, playerCutoff)
        && (!historyLeagueBucket || isHistoryAwardInLeagueScope(award, historyLeagueBucket, scopedStatSeasons)),
      );
      const majorAward = awards.some((award: any) => [
        'Most Valuable Player',
        'Finals MVP',
        'Defensive Player of the Year',
        'All-NBA First Team',
        'All-NBA Second Team',
        'All-NBA Third Team',
        'All-League First Team',
        'All-League Second Team',
        'All-League Third Team',
      ].includes(award.type));
      if (majorAward) return true;
      const allStars = awards.filter((award: any) => award.type === 'All-Star').length;
      if (allStars >= 3) return true;
      const regularStats = (player.stats ?? []).filter((row: any) =>
        !row.playoffs && Number(row.season) <= playerCutoff
      );
      const careerGp = regularStats.reduce((sum: number, row: any) => sum + (Number(row.gp) || 0), 0);
      const careerWs = regularStats.reduce((sum: number, row: any) =>
        sum + (Number(row.ws) || Number(row.ows) + Number(row.dws) || Number(row.ewa) || 0), 0
      );
      return careerGp >= 600 && careerWs >= 75;
    };

    if (isNBAHub && pbaIsolated) {
      return historyTotals
        .filter(row => Number(row.GP ?? 0) > 0)
        .map(row => {
          const name = cleanName(row.NAME ?? '');
          const player = playerByName.get(name.toLowerCase().trim());
          const score = Number(row.PTS ?? 0) + Number(row.REB ?? 0) + Number(row.AST ?? 0);
          return { name, score, imgURL: player?.imgURL, hof: player ? hasVisibleHof(player) : false, ...identityFields(player) };
        })
        .filter(entry => entry.name && entry.score > 0)
        .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
        .slice(0, 100);
    }

    if (isNBAHub) {
      return Array.from(playerByName.values())
        .filter(player => (player.stats ?? []).some((row: any) =>
          !row?.playoffs && Number(row?.season) <= populatedSeasonCutoff,
        ))
        .filter(qualifiesForLeagueGoatList)
        .map(player => ({ name: player.name, score: scorePlayer(player, null), imgURL: player.imgURL, hof: hasVisibleHof(player), ...identityFields(player) }))
        .filter(entry => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 100);
    }

    const teamId = selectedTeamStatsTid ?? selectedTeam.id;
    const teamTenureNames = new Set<string>(
      historyStatPlayers
        .filter(player => (player.stats ?? []).some((season: any) => isFranchiseStatRow(season, teamId, selectedTeamAbbrevs) && Number(season.season) <= populatedSeasonCutoff))
        .map(player => (player.name ?? '').toLowerCase().trim())
        .filter(Boolean),
    );
    for (const total of historyTotals) {
      const name = cleanName(total.NAME ?? '').toLowerCase().trim();
      if (name) teamTenureNames.add(name);
    }
    const parMap = new Map<string, { pts: number; reb: number; ast: number }>();
    for (const row of mergedCareer) {
      const name = cleanName(row.NAME);
      if (teamTenureNames.size > 0 && !teamTenureNames.has(name.toLowerCase().trim())) continue;
      if (!parMap.has(name)) parMap.set(name, { pts: 0, reb: 0, ast: 0 });
      const entry = parMap.get(name)!;
      const category = row.Category ?? row.Career_Leader_Category;
      const value = (row._val ?? 0) || parseStatVal(getStatValue(row, category));
      if (category === 'Points') entry.pts = Math.max(entry.pts, value);
      if (category === 'Rebounds') entry.reb = Math.max(entry.reb, value);
      if (category === 'Assists') entry.ast = Math.max(entry.ast, value);
    }
    for (const live of historyTotals) {
      const name = live.NAME;
      if (teamTenureNames.size > 0 && !teamTenureNames.has(name.toLowerCase().trim())) continue;
      if (!parMap.has(name)) parMap.set(name, { pts: 0, reb: 0, ast: 0 });
      const entry = parMap.get(name)!;
      entry.pts = Math.max(entry.pts, parseFloat(live.PTS ?? '0') || 0);
      entry.reb = Math.max(entry.reb, parseFloat(live.REB ?? '0') || 0);
      entry.ast = Math.max(entry.ast, parseFloat(live.AST ?? '0') || 0);
    }
    return Array.from(parMap.entries())
      .map(([name, stats]) => {
        const statePlayer = playerByName.get(name.toLowerCase().trim());
        const productionScore = scoreFranchiseCareerProduction(stats);
        const score = statePlayer
          ? combineFranchiseLegacyScore(scorePlayer(statePlayer, teamId), productionScore)
          : productionScore;
        return { name, score, imgURL: statePlayer?.imgURL, hof: statePlayer?.hof ?? false, ...identityFields(statePlayer) };
      })
      .filter(entry => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 30);
  }, [historicalSourceCutoff, historicalWhatIf, historyLeagueBucket, historyStatPlayers, historyTotals, isNBAHub, pbaIsolated, populatedSeasonCutoff, mergedCareer, selectedTeamAbbrevs, selectedTeamKey, selectedTeamStatsTid, sourceHistoryPlayers, state.players]);

  const teamHistorySourceYears = useMemo(() => {
    if (!isNbaHistoryScope || !selectedTeam) return [];
    return ((selectedTeam as any).seasons ?? [])
      .filter((row: any) => {
        const season = Number(row?.season);
        const games = Number(row?.won ?? row?.wins ?? 0) + Number(row?.lost ?? row?.losses ?? 0);
        return Number.isFinite(season) && season <= historicalSourceCutoff && games === 0;
      })
      .map((row: any) => Number(row.season));
  }, [historicalSourceCutoff, isNbaHistoryScope, selectedTeamKey, selectedTeamSeasonKey]);
  const teamHistorySourceMap = useBRefSeasonsBatch(teamHistorySourceYears);

  const baseSeasonHistory = useMemo(() => {
    if (!selectedTeam) return [];
    const awards = (state.historicalAwards as any[]) ?? [];
    const teamId = selectedTeamStatsTid ?? selectedTeam.id;
    const seasonsSet = new Set<number>();
    const isSelectedSeason = (season: number) => !selectedArchivedSeasonSet || selectedArchivedSeasonSet.has(season);
    const selectedTeamNames = new Set(
      [
        getTeamFullName(selectedTeam as any),
        (selectedTeam as any).name,
        `${(selectedTeam as any).region ?? ''} ${(selectedTeam as any).name ?? ''}`,
        (selectedTeam as any).abbrev,
      ]
        .map(normalizeTeamText)
        .filter(Boolean),
    );
    const awardMatchesSelectedTeam = (award: any): boolean => {
      if (Number(award?.tid) === teamId) return true;
      const awardName = normalizeTeamText(award?.team ?? award?.name);
      if (!awardName) return false;
      if (selectedTeamNames.has(awardName)) return true;
      return [...selectedTeamNames].some(name => name.length >= 5 && (awardName.includes(name) || name.includes(awardName)));
    };
    awards.forEach(award => {
      const season = Number(award.season);
      if (!Number.isFinite(season) || season > populatedSeasonCutoff) return;
      if (isNBAHub || ((pbaIsolated ? awardMatchesSelectedTeam(award) : Number(award.tid) === teamId) && isSelectedSeason(season))) seasonsSet.add(season);
    });
    ((selectedTeam as any).seasons ?? []).forEach((season: any) => {
      const seasonYear = Number(season.season);
      if (Number.isFinite(seasonYear) && seasonYear <= populatedSeasonCutoff) seasonsSet.add(seasonYear);
    });
    historyStatPlayers.forEach(player => (player.stats ?? []).forEach((season: any) => {
      const seasonYear = Number(season.season);
      if (season.tid === teamId && Number.isFinite(seasonYear) && seasonYear <= populatedSeasonCutoff && isSelectedSeason(seasonYear)) seasonsSet.add(seasonYear);
    }));
    const backgroundBySeason = new Map<number, (typeof backgroundTeamHistory)[number]>();
    backgroundTeamHistory.forEach(entry => {
      if (entry.season > populatedSeasonCutoff || !isSelectedSeason(entry.season)) return;
      seasonsSet.add(entry.season);
      if (!backgroundBySeason.has(entry.season)) backgroundBySeason.set(entry.season, entry);
    });

    const champAwards = awards.filter((award: any) => {
      const season = Number(award.season ?? 0);
      return award.type === 'Champion'
        && (pbaIsolated ? awardMatchesSelectedTeam(award) : Number(award.tid) === teamId)
        && season <= populatedSeasonCutoff
        && isSelectedSeason(season);
    });
    const runnerUpAwards = awards.filter((award: any) => {
      const season = Number(award.season ?? 0);
      return award.type === 'Runner Up'
        && (pbaIsolated ? awardMatchesSelectedTeam(award) : Number(award.tid) === teamId)
        && season <= populatedSeasonCutoff
        && isSelectedSeason(season);
    });
    const champSeasons = new Set(champAwards.map((award: any) => Number(award.season)));
    const runnerUpSeasons = new Set(runnerUpAwards.map((award: any) => Number(award.season)));
    const standingsChampionSeasons = new Set(
      (state.seasonHistory ?? [])
        .filter(entry => entry.championSource === 'standings' && entry.championTid === teamId)
        .map(entry => entry.year),
    );
    const standingsRunnerUpSeasons = new Set(
      (state.seasonHistory ?? [])
        .filter(entry => entry.championSource === 'standings' && entry.runnerUpTid === teamId)
        .map(entry => entry.year),
    );
    const pbaTitlesBySeason = new Map<number, string[]>();
    const pbaConferenceLabels: Record<string, string> = {
      philippine: 'Philippine Cup',
      commissioners: "Commissioner's Cup",
      governors: "Governors' Cup",
    };
    if (pbaIsolated) {
      for (const entry of (((state.leagueStats as any).pbaConferenceChampions ?? []) as any[])) {
        const season = Number(entry.season);
        if (!Number.isFinite(season) || season > populatedSeasonCutoff) continue;
        seasonsSet.add(season);
        const entryTeamName = normalizeTeamText(entry.teamName);
        const entryMatches = Number(entry.teamId) === teamId
          || (!!entryTeamName && [...selectedTeamNames].some(name => name.length >= 5 && (entryTeamName.includes(name) || name.includes(entryTeamName))));
        if (!entryMatches) continue;
        if (!pbaTitlesBySeason.has(season)) pbaTitlesBySeason.set(season, []);
        pbaTitlesBySeason.get(season)!.push(pbaConferenceLabels[entry.conference] ?? entry.conference);
      }
      for (const award of champAwards) {
        const season = Number(award.season);
        if (!Number.isFinite(season) || season > populatedSeasonCutoff) continue;
        const conference = normalizePbaConference(award.conference ?? award.source ?? award.competitionId ?? award.type);
        if (!conference) continue;
        if (!pbaTitlesBySeason.has(season)) pbaTitlesBySeason.set(season, []);
        const label = pbaConferenceLabels[conference];
        const labels = pbaTitlesBySeason.get(season)!;
        if (!labels.includes(label)) labels.push(label);
      }
    }
    const pbaRecordsBySeason = new Map<number, { w: number; l: number }>();
    if (pbaIsolated) {
      for (const box of (state.boxScores ?? []) as any[]) {
        if (!String(box?.competitionId ?? '').startsWith('pba-')) continue;
        const season = Number(box.season ?? state.leagueStats?.year);
        if (!Number.isFinite(season) || season > populatedSeasonCutoff) continue;
        const isHome = Number(box.homeTeamId) === teamId;
        const isAway = Number(box.awayTeamId) === teamId;
        if (!isHome && !isAway) continue;
        seasonsSet.add(season);
        const rec = pbaRecordsBySeason.get(season) ?? { w: 0, l: 0 };
        const homeWon = Number(box.homeScore ?? 0) > Number(box.awayScore ?? 0);
        const won = isHome ? homeWon : !homeWon;
        rec.w += won ? 1 : 0;
        rec.l += won ? 0 : 1;
        pbaRecordsBySeason.set(season, rec);
      }
    }

    if (isNbaHistoryScope && !selectedIsArchived) {
      for (const [year, brefData] of getAllCachedSeasons().entries()) {
        if (year > historicalSourceCutoff) continue;
        const championLabel = (brefData.champion?.name ?? '').toLowerCase();
        const runnerUpLabel = (brefData.runnerUp?.name ?? '').toLowerCase();
        const teamLabel = (selectedTeam.name ?? '').toLowerCase();
        const fullLabel = `${(selectedTeam as any).region ?? ''} ${selectedTeam.name ?? ''}`.toLowerCase().trim();
        if (championLabel && (championLabel.includes(teamLabel) || fullLabel.includes(championLabel))) { champSeasons.add(year); seasonsSet.add(year); }
        if (runnerUpLabel && (runnerUpLabel.includes(teamLabel) || fullLabel.includes(runnerUpLabel))) { runnerUpSeasons.add(year); seasonsSet.add(year); }
      }
    }

    const currentSeason = state.leagueStats?.year ?? new Date(state.date).getFullYear();
    return Array.from(seasonsSet).sort((left, right) => right - left).map(season => {
      const teamSeason = ((selectedTeam as any).seasons ?? []).find((entry: any) => Number(entry.season) === season);
      const sourceSeason = teamHistorySourceMap.get(season) ?? getAllCachedSeasons().get(season);
      const sourceRecord = sourceSeason?.teamRecords?.find(record =>
        Boolean(matchTeamByWikiName(record.name, [selectedTeam as any])),
      );
      const { won: resolvedWon, lost: resolvedLost } = resolveTeamHistoryRecord(teamSeason, sourceRecord);
      const backgroundSeason = backgroundBySeason.get(season);
      const backgroundWon = backgroundSeason?.won;
      const backgroundLost = backgroundSeason?.lost;
      const pbaRecord = pbaRecordsBySeason.get(season);
      const pbaConferenceTitles = pbaTitlesBySeason.get(season) ?? [];
      const playoffRoundsWon = teamSeason?.playoffRoundsWon;
      const isStandingsTitle = standingsChampionSeasons.has(season);
      const isStandingsRunnerUp = standingsRunnerUpSeasons.has(season);
      const isChamp = backgroundSeason?.isChampion === true || pbaConferenceTitles.length > 0 || isStandingsTitle || champSeasons.has(season) || playoffRoundsWon === 4;
      const isRU = !isChamp && (backgroundSeason?.isRunnerUp === true || isStandingsRunnerUp || runnerUpSeasons.has(season) || playoffRoundsWon === 3);
      const won = resolvedWon ?? backgroundWon ?? pbaRecord?.w;
      const lost = resolvedLost ?? backgroundLost ?? pbaRecord?.l;
      const isCurrent = season === currentSeason && Number(won ?? 0) + Number(lost ?? 0) === 0;
      return {
        season,
        won: isCurrent ? undefined : won,
        lost: isCurrent ? undefined : lost,
        playoffRoundsWon: isCurrent || isStandingsTitle || isStandingsRunnerUp
          ? undefined
          : (playoffRoundsWon ?? (isChamp ? 4 : isRU ? 3 : undefined)),
        isChamp,
        isRU,
        isCurrent,
        isStandingsTitle,
        conferenceTitles: pbaConferenceTitles,
      };
    });
  }, [backgroundTeamHistory, historicalSourceCutoff, historyStatPlayers, isFictional, isNBAHub, populatedSeasonCutoff, pbaIsolated, selectedArchivedSeasonSet, selectedIsArchived, selectedTeamKey, selectedTeamStatsTid, state.historicalAwards, state.leagueStats, state.boxScores, state.seasonHistory, teamHistorySourceMap]);

  const euroSeasonHistory = useMemo(
    () => euroIsolated && selectedTeam
      ? buildEuroTeamSeasonHistory(state, selectedTeamStatsTid ?? selectedTeam.id, euroCompetitionFilter)
      : [],
    [
      euroCompetitionFilter,
      euroIsolated,
      selectedTeamKey,
      selectedTeamStatsTid,
      state.activeCompetitions,
      state.boxScores,
      state.competitionHistory,
      state.euroCompetitionTeamTids,
      state.leagueStats.year,
    ],
  );
  const seasonHistory = euroIsolated
    ? euroSeasonHistory
    : baseSeasonHistory.map(season => ({
        ...season,
        playoffAppearances: (season.playoffRoundsWon ?? -1) >= 0 ? 1 : 0,
        titleCount: season.isChamp ? 1 : 0,
        competitionTitles: season.conferenceTitles ?? [],
      }));
  const euroTrophies = useMemo(
    () => euroIsolated && selectedTeam
      ? buildEuroTeamTrophies(state, selectedTeamStatsTid ?? selectedTeam.id)
          .filter(trophy => euroCompetitionFilter === 'all' || trophy.competitionId === euroCompetitionFilter)
      : [],
    [
      euroCompetitionFilter,
      euroIsolated,
      selectedTeamKey,
      selectedTeamStatsTid,
      state.activeCompetitions,
      state.competitionHistory,
      state.historicalAwards,
    ],
  );
  const teamTrophies = useMemo(() => {
    if (!selectedTeam || !teamTrophyNamespace) return [];
    if (euroIsolated) return euroTrophies;
    if (teamTrophyNamespace !== 'nba' && teamTrophyNamespace !== 'wnba') return [];
    const teamId = selectedTeamStatsTid ?? selectedTeam.id;
    return buildModdedTeamTrophies(state, teamId, teamTrophyNamespace, accent, seasonHistory);
  }, [accent, euroIsolated, euroTrophies, seasonHistory, selectedTeamKey, selectedTeamStatsTid, state.cupCompetitions, state.historicalWnba, state.nbaCup, state.nbaCupHistory, state.seasonHistory, teamTrophyNamespace]);

  const summaryStats = useMemo(() => {
    const known = seasonHistory.filter(season => season.won != null && (season.won + (season.lost ?? 0)) > 0);
    const totalW = known.reduce((sum, season) => sum + (season.won ?? 0), 0);
    const totalL = known.reduce((sum, season) => sum + (season.lost ?? 0), 0);
    const sorted = [...known].sort((left, right) => ((right.won ?? 0) / (((right.won ?? 0) + (right.lost ?? 0)) || 1)) - ((left.won ?? 0) / (((left.won ?? 0) + (left.lost ?? 0)) || 1)));
    return {
      totalW,
      totalL,
      winPct: totalW + totalL > 0 ? (totalW / (totalW + totalL)).toFixed(3) : '.000',
      playoffApps: seasonHistory.reduce((sum, season) => sum + Number(season.playoffAppearances ?? ((season.playoffRoundsWon ?? -1) >= 0)), 0),
      finalsApps: seasonHistory.filter(season => (season.playoffRoundsWon ?? -1) >= 3).length,
      titles: euroIsolated
        ? seasonHistory.reduce((sum, season) => sum + Number(season.titleCount ?? Number(season.isChamp)), 0)
        : pbaIsolated
        ? seasonHistory.reduce((sum, season) => sum + ((season.conferenceTitles?.length ?? 0) || (season.isChamp ? 1 : 0)), 0)
        : seasonHistory.filter(season => season.isChamp).length,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [euroIsolated, pbaIsolated, seasonHistory]);

  const processedRecords = useMemo(() => {
    const source = recordType === 'regular' ? regularRecords : playoffRecords;
    const isPlayoff = recordType === 'playoff';
    const activeDate = new Date(state.date);
    const sourceCutoff = historicalWhatIf ? historicalSourceCutoff : populatedSeasonCutoff;
    const filtered = source.filter(record => {
      if (!String(record.DATE ?? '').trim() || !String(record.OPP ?? '').trim()) return false;
      try {
        const date = new Date(record.DATE);
        if (Number.isNaN(date.getTime()) || (!Number.isNaN(activeDate.getTime()) && date > activeDate)) return false;
        const month = date.getUTCMonth();
        const year = date.getUTCFullYear();
        const seasonEndYear = month >= 9 ? year + 1 : year;
        if (seasonEndYear > sourceCutoff) return false;
      } catch {}
      return true;
    });

    const teamById = new Map<number, any>();
    for (const team of [...state.teams, ...(state.teamArchive ?? []), ...(state.nonNBATeams ?? [])] as any[]) {
      for (const rawId of [team?.id, team?.tid]) {
        const id = Number(rawId);
        if (Number.isFinite(id) && !teamById.has(id)) teamById.set(id, team);
      }
    }
    const sourceHistoricalRecords: any[] = [];
    if ((isNbaHistoryScope || pbaIsolated || isFictional) && (isNBAHub || selectedTeamStatsTid != null)) {
      const sourceRecordPlayers = pbaIsolated || isFictional ? historyPlayers : sourceHistoryPlayers;
      for (const player of sourceRecordPlayers) {
        const name = String(player?.name ?? '').trim();
        if (!name) continue;
        const isSavedPlayer = saveVisiblePeople.some(candidate => candidate.internalId === player.internalId);
        for (const stat of (player?.stats ?? []) as Record<string, any>[]) {
          const season = Number(stat.season);
          if (!Number.isFinite(season) || season <= 0 || season > populatedSeasonCutoff || season > maxVisibleSeason) continue;
          if (Boolean(stat.playoffs) !== isPlayoff) continue;
          if (selectedArchivedSeasonSet && !selectedArchivedSeasonSet.has(season)) continue;
          const tid = Number(stat.tid);
          if (!isNBAHub && !isFranchiseStatRow(stat, selectedTeamStatsTid!, selectedTeamAbbrevs)) continue;
          const team = Number.isFinite(tid) && tid >= 0 ? teamById.get(tid) : undefined;
          const tm = String(team?.abbrev ?? stat.abbrev ?? stat.teamAbbrev ?? stat.tm ?? stat.TM ?? '').trim().toUpperCase();
          for (const def of SOURCE_RECORD_DEFS) {
            const value = sourceRecordValue(stat, def.fields);
            if (value <= 0) continue;
            sourceHistoricalRecords.push({
              tid: isNBAHub ? tid : selectedTeamStatsTid,
              season,
              category: def.category,
              isPlayoff,
              value,
              NAME: name,
              DATE: pbaIsolated ? String(season) : formatLeagueSeasonLabel(season, state.leagueStats),
              OPP: pbaIsolated || isFictional ? 'Season high' : '',
              TM: tm,
              SearchCategory: def.category,
              [def.key]: String(value),
              ...(isSavedPlayer ? { _playerId: player.internalId } : { _sourcePlayer: player }),
            });
          }
        }
      }
    }

    const availableSimRecords = mergeFranchiseRecords({
      existing: state.simFranchiseRecords ?? [],
      results: state.boxScores as GameResult[],
      schedule: state.schedule,
      teams: state.teams,
      nonNBATeams: state.nonNBATeams ?? [],
      fallbackDate: state.date,
      fallbackSeason: state.leagueStats.year,
    });
    const simRecords = availableSimRecords.filter((record: any) => {
      if (record.isPlayoff !== isPlayoff) return false;
      if (!isNBAHub && record.tid !== selectedTeamStatsTid) return false;
      const recordDate = new Date(record.DATE ?? '');
      if (!String(record.OPP ?? '').trim() || Number.isNaN(recordDate.getTime())) return false;
      if (!Number.isNaN(activeDate.getTime()) && recordDate > activeDate) return false;
      const recordSeason = Number(record.season ?? record.SEASON ?? 0);
      if (selectedArchivedSeasonSet && Number.isFinite(recordSeason) && recordSeason > 0 && !selectedArchivedSeasonSet.has(recordSeason)) return false;
      return !Number.isFinite(recordSeason) || recordSeason <= 0 || recordSeason <= maxVisibleSeason;
    });
    const all = [...filtered, ...sourceHistoricalRecords, ...simRecords].map(record => ({
      ...record,
      SearchCategory: canonicalTeamHistoryRecordCategory(record.SearchCategory ?? record.category),
    })).filter(record => record.SearchCategory);
    const grouped: Record<string, any[]> = {};
    all.forEach(record => {
      const category = record.SearchCategory;
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(record);
    });
    for (const category of Object.keys(grouped)) {
      grouped[category] = dedupeTeamHistoryRecords(grouped[category], category);
    }
    return Object.entries(grouped)
      .sort(([left], [right]) => (CATEGORY_ORDER.indexOf(left) === -1 ? 99 : CATEGORY_ORDER.indexOf(left)) - (CATEGORY_ORDER.indexOf(right) === -1 ? 99 : CATEGORY_ORDER.indexOf(right)))
      .map(([, records]) => records);
  }, [historicalSourceCutoff, historicalWhatIf, historyPlayers, isFictional, isNBAHub, isNbaHistoryScope, maxVisibleSeason, pbaIsolated, playoffRecords, populatedSeasonCutoff, recordType, regularRecords, selectedArchivedSeasonSet, selectedTeamAbbrevs, selectedTeamStatsTid, sourceHistoryPlayers, state.boxScores, state.date, state.leagueStats, state.nonNBATeams, state.players, state.schedule, state.simFranchiseRecords, state.teamArchive, state.teams]);

  const sourceRetiredJerseys = useMemo(() => {
    if (!selectedTeam || isNBAHub || !isNbaHistoryScope) return [];
    const teamId = selectedTeamStatsTid ?? selectedTeam.id;
    const rows = sourceHistoricalTotals
      .map(total => {
        const name = cleanName(String(total.NAME ?? ''));
        const sourcePlayer = fullRosterRecordPlayers.find(player => cleanName(String(player?.name ?? '')).toLowerCase() === name.toLowerCase());
        if (!sourcePlayer || !hasSourceHallOfFame(sourcePlayer)) return null;
        const gp = parseStatVal(total.GP);
        if (gp < 250) return null;
        const retiredYear = Number(sourcePlayer.retiredYear ?? sourcePlayer.retired ?? sourceLastRegularSeason(sourcePlayer) ?? 0);
        if (!Number.isFinite(retiredYear) || retiredYear <= 0 || retiredYear > populatedSeasonCutoff) return null;
        const number = sourceJerseyForTeam(sourcePlayer, teamId, selectedTeamAbbrevs, populatedSeasonCutoff);
        if (!number) return null;
        const score = parseStatVal(total.PTS) + parseStatVal(total.REB) + parseStatVal(total.AST);
        return {
          number,
          text: name,
          playerId: `source-retired-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          seasonRetired: retiredYear,
          teamId: selectedTeam.id,
          reason: 'hof_legend',
          tier: 'late_honor',
          _score: score,
        };
      })
      .filter(Boolean) as any[];
    const byNumber = new Map<string, any>();
    for (const row of rows.sort((left, right) => (right._score ?? 0) - (left._score ?? 0))) {
      if (!byNumber.has(String(row.number))) byNumber.set(String(row.number), row);
    }
    return Array.from(byNumber.values()).slice(0, 12);
  }, [fullRosterRecordPlayers, isNBAHub, isNbaHistoryScope, populatedSeasonCutoff, selectedTeamAbbrevs, selectedTeamKey, selectedTeamStatsTid, sourceHistoricalTotals]);
  const nativeRetiredJerseys = useMemo(() => {
    if (!selectedTeam || isNBAHub || !isNbaHistoryScope) return [];
    return getNativeRetiredJerseyRecords([...selectedTeamAbbrevs], populatedSeasonCutoff).map(record => ({
      ...record,
      teamId: selectedTeam.id,
      reason: 'hof_legend',
      tier: 'late_honor',
    }));
  }, [fullRosterRecordPlayers, isNBAHub, isNbaHistoryScope, populatedSeasonCutoff, selectedTeamAbbrevs, selectedTeamKey]);

  const filteredTeams = useMemo(() => {
    const lowered = searchTerm.toLowerCase();
    const activeKeys = new Set(state.teams.map(team => getTeamArchiveKey(team)));
    const inactiveArchiveTeams = (state.teamArchive ?? []).filter(team => {
      const key = (team as any).archiveKey ?? getTeamArchiveKey(team);
      return !activeKeys.has(key);
    });
    const sourceTeams = pbaIsolated
      ? ((state.nonNBATeams ?? []).filter((team: any) => team.league === 'PBA').map((team: any) => resolveAnyTeam(team.tid, state.teams, state.nonNBATeams ?? [])).filter(Boolean) as any[])
      : euroIsolated ? getActiveLeagueTeams(state) : [...state.teams, ...inactiveArchiveTeams];
    return sourceTeams.filter(team => team.name.toLowerCase().includes(lowered) || (team.region ?? '').toLowerCase().includes(lowered) || team.abbrev.toLowerCase().includes(lowered));
  }, [euroIsolated, pbaIsolated, searchTerm, state.nonNBATeams, state.teamArchive, state.teams]);

  const openTeamHistoryPlayer = React.useCallback((reference: TeamHistoryPlayerReference) => {
    const savedPlayer = resolveSavedHistoryPlayer(saveVisiblePeople, reference);
    if (savedPlayer) {
      navigateToPlayer(savedPlayer);
      return;
    }
    const sourcePlayer = getSourceOnlyHistoryPlayer(reference);
    if (sourcePlayer) {
      setSourceOnlyHistoryPlayer(sourcePlayer);
      return;
    }
    if (!isNbaHistoryScope || reference.playerIdentityMatch !== 'name') return;
    fetchNativeHistoricalPlayerByName(reference.name, {
      branchCutoffYear: historicalWhatIf
        ? Number(state.nbaStartYear ?? 0) || undefined
        : Number(state.leagueStats.year ?? 0) + 1,
    })
      .then(fetchedPlayer => {
        if (fetchedPlayer) setSourceOnlyHistoryPlayer(fetchedPlayer);
      })
      .catch(() => {});
  }, [historicalWhatIf, isNbaHistoryScope, navigateToPlayer, saveVisiblePeople, state.leagueStats.year, state.nbaStartYear]);
  const isGM = state.gameMode === 'gm';
  const canRetireForTeam = !selectedIsArchived && (!isGM || selectedTeamId === (state as any).userTeamId);
  const recordsLoading = externalLoading && processedRecords.length === 0;
  const recordsError = processedRecords.length > 0 ? null : externalError;
  const retiredJerseyIdentity = useMemo(
    () => createRetiredJerseyIdentityIndex(saveVisiblePeople, fullRosterRecordPlayers),
    [fullRosterRecordPlayers, saveVisiblePeople],
  );
  const retirementCandidatePlayers = useMemo(() => {
    const byIdentity = new Map<string, NBAPlayer>();
    for (const player of [...saveVisiblePeople, ...(fullRosterRecordPlayers as NBAPlayer[])]) {
      const identity = String(player.personId ?? player.internalId ?? player.name ?? '').trim().toLowerCase();
      if (identity && !byIdentity.has(identity)) byIdentity.set(identity, player);
    }
    return [...byIdentity.values()];
  }, [fullRosterRecordPlayers, saveVisiblePeople]);

  if (sourceOnlyHistoryPlayer) {
    return <PlayerBioView player={sourceOnlyHistoryPlayer} onBack={() => setSourceOnlyHistoryPlayer(null)} />;
  }
  if (!selectedTeam) {
    return <TeamHistoryPicker euroIsolated={euroIsolated} leagueName={labels.leagueName} showNbaBranding={isNbaHistoryScope} leagueLogoUrl={leagueHubLogoUrl} searchTerm={searchTerm} setSearchTerm={setSearchTerm} filteredTeams={filteredTeams} setSelectedTeamId={setSelectedTeamId} setActiveTab={setActiveTab} setExpandedLeaders={setExpandedLeaders} setExpandedRecords={setExpandedRecords} seasonYear={state.leagueStats?.year ?? new Date(state.date).getFullYear()} />;
  }

  const retiredJerseys: any[] = (selectedTeam as any).retiredJerseyNumbers ?? [];
  const combinedRetiredJerseys = mergeRetiredJerseyRecordsByNumber(
    retiredJerseys,
    [...sourceRetiredJerseys, ...nativeRetiredJerseys],
  );
  const visibleRetiredJerseys = filterRetiredJerseysToTimeline(combinedRetiredJerseys, timeline, saveVisiblePeople);
  const jerseyReasonLabel = (jersey: any) => {
    const reason = jersey.reason ?? jersey.tier;
    if (reason === 'franchise_icon' || reason === 'automatic') return 'Franchise Icon';
    if (reason === 'championship_core' || reason === 'fast_track') return 'Title Core';
    if (reason === 'hof_legend') return 'HOF Legend';
    if (reason === 'loyal_star' || reason === 'standard') return 'Loyal Star';
    if (reason === 'honorary' || reason === 'late_honor') return 'Honorary';
    return null;
  };
  const retiredJerseyDisplayName = (jersey: any) => retiredJerseyIdentity.displayName(jersey);
  const selectedTeamSnapshot = selectedTeam ? getHistoricalTeamSnapshot(selectedTeam, populatedSeasonCutoff) : null;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#09090b] text-zinc-100" style={{ '--ta': accent } as React.CSSProperties}>
      <div className="relative overflow-hidden border-b border-zinc-800/50 bg-zinc-950">
        <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(ellipse at top right, ${accent}, transparent 70%)` }} />
        <div className="relative max-w-6xl mx-auto px-6 pt-6 pb-8">
          <button
            onClick={() => {
              if (originView && onViewChange) {
                const destination = originView;
                setOriginView(null);
                setSelectedTeamId(null);
                onViewChange(destination);
                return;
              }
              setSelectedTeamId(null);
            }}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" style={{ color: accent }} />
            {originView === 'League History' ? 'Back to League History' : 'All Teams'}
          </button>
          <div className="flex items-center gap-5">
            {selectedTeamSnapshot?.logoUrl ? <img src={selectedTeamSnapshot.logoUrl} alt={selectedTeamSnapshot.name} className="w-20 h-20 object-contain drop-shadow-xl shrink-0" referrerPolicy="no-referrer" /> : <div className="w-20 h-20 rounded-2xl bg-zinc-800 flex items-center justify-center text-2xl font-black shrink-0" style={{ color: accent }}>{selectedTeamSnapshot?.abbrev ?? selectedTeam.abbrev}</div>}
            <div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight uppercase leading-none">
                {selectedTeamSnapshot?.region && <span className="text-zinc-300">{selectedTeamSnapshot.region} </span>}
                <span style={{ color: accent }}>{getTeamMascot(selectedTeamSnapshot?.name ?? selectedTeam.name, selectedTeamSnapshot?.region ?? selectedTeam.region)}</span>
              </h1>
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                <span>{selectedTeamSnapshot?.abbrev ?? selectedTeam.abbrev}</span>
                <span>{selectedTeam.conference}</span>
                {summaryStats.titles > 0 && <span className="flex items-center gap-1" style={{ color: accent }}><Trophy className="w-3 h-3" /> {summaryStats.titles}× Champion</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-20 bg-[#09090b]/90 backdrop-blur border-b border-zinc-800/50 overflow-x-auto">
        <div className="max-w-6xl mx-auto px-6 flex gap-6 min-w-max">
          {[
            { id: 'overview' as const, label: 'Overview', icon: LayoutGrid },
            { id: 'records' as const, label: 'Records', icon: Trophy },
            { id: 'leaders' as const, label: 'Leaders', icon: Award },
            { id: 'awards' as const, label: 'Awards', icon: Award },
            ...(teamTrophyNamespace && !isNBAHub ? [{ id: 'trophies' as const, label: 'Trophies', icon: Trophy }] : []),
            ...(!isNBAHub ? [{ id: 'history' as const, label: 'Season History', icon: History }] : []),
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 py-4 text-xs font-semibold transition-all relative whitespace-nowrap ${activeTab === tab.id ? '' : 'text-zinc-500 hover:text-zinc-300'}`} style={activeTab === tab.id ? { color: accent } : {}}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && <motion.div layoutId="teamHistoryTab" className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: accent }} />}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {euroIsolated && euroCompetitionOptions.length > 0 && (
          <div className="mb-7 flex snap-x gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
            {[
              { id: 'all', label: 'Combined', shortLabel: 'All', accentColor: accent },
              ...euroCompetitionOptions,
            ].map(option => (
              <button
                key={option.id}
                onClick={() => setEuroCompetitionFilter(option.id)}
                className={`shrink-0 snap-start rounded-xl border px-4 py-2 text-left transition-colors ${
                  euroCompetitionFilter === option.id
                    ? 'border-transparent bg-zinc-100 text-zinc-950'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-white'
                }`}
              >
                <div className="text-[9px] font-black uppercase tracking-[0.2em]" style={euroCompetitionFilter === option.id ? {} : { color: option.accentColor }}>
                  {option.shortLabel}
                </div>
                <div className="mt-0.5 max-w-[170px] truncate text-xs font-bold">{option.label}</div>
              </button>
            ))}
          </div>
        )}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && <TeamHistoryOverviewPanel accent={accent} isNBAHub={isNBAHub} isFictional={isFictional} allLeagueTeamLabel={wnbaIsolated ? 'All-WNBA' : pbaIsolated ? 'All-PBA' : undefined} retiredJerseys={visibleRetiredJerseys} retiredJerseyDisplayName={retiredJerseyDisplayName} jerseyReasonLabel={jerseyReasonLabel} canRetireForTeam={canRetireForTeam} setShowRetireModal={setShowRetireModal} topPlayers={topPlayers} findPlayerImg={findPlayerImg} onOpenPlayer={openTeamHistoryPlayer} />}
          {activeTab === 'records' && <TeamHistoryRecordsPanel accent={accent} isNBAHub={isNBAHub} recordType={recordType} setRecordType={setRecordType} externalLoading={recordsLoading} externalError={recordsError} processedRecords={processedRecords} findPlayerImg={findPlayerImg} cleanName={cleanName} getStatValue={getStatValue} onOpenPlayer={openTeamHistoryPlayer} />}
          {activeTab === 'leaders' && <TeamHistoryLeadersPanel accent={accent} isNBAHub={isNBAHub} leaderSubTab={leaderSubTab} setLeaderSubTab={setLeaderSubTab} externalLoading={externalLoading} externalError={externalError} mergedCareer={mergedCareer} mergedAverage={mergedAverage} expandedLeaders={expandedLeaders} setExpandedLeaders={setExpandedLeaders} statePlayers={saveVisiblePeople} findPlayerImg={findPlayerImg} cleanName={cleanName} getStatValue={getStatValue} categoryOrder={CATEGORY_ORDER} categoryOrderAvg={CATEGORY_ORDER_AVG} onOpenPlayer={openTeamHistoryPlayer} />}
          {activeTab === 'awards' && <TeamHistoryAwardsPanel accent={accent} rankings={awardRankings} onOpenPlayer={openTeamHistoryPlayer} />}
          {activeTab === 'trophies' && teamTrophyNamespace && <TeamHistoryTrophiesPanel trophyNamespace={teamTrophyNamespace} trophies={teamTrophies} teamName={tid => getTeamFullName(resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []))} onOpenPlayer={openTeamHistoryPlayer} formatSeasonLabel={season => pbaIsolated ? String(season) : formatLeagueSeasonLabel(season, state.leagueStats)} />}
          {activeTab === 'history' && <TeamHistorySeasonPanel accent={accent} summaryStats={summaryStats} seasonHistory={seasonHistory} isFictional={isFictional} championLabel={pbaIsolated ? 'PBA Conference Champion' : undefined} playInEnabled={!!state.leagueStats?.playIn} formatSeasonLabel={season => pbaIsolated ? String(season) : formatLeagueSeasonLabel(season, state.leagueStats)} />}
        </AnimatePresence>
      </div>

      <TeamHistoryRetireModal selectedTeamId={selectedTeamId} teamId={selectedTeam.id} isNBAHub={isNBAHub} showRetireModal={showRetireModal} setShowRetireModal={setShowRetireModal} accent={accent} findPlayerImg={findPlayerImg} candidatePlayers={retirementCandidatePlayers} />
    </div>
  );
};
