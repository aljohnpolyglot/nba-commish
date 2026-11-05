import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { NBAPlayer, NBAGMStat } from '../../../types';
import { useGame } from '../../../store/GameContext';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { filterAwardsToVisibleTimeline, getPlayerStatsAwardMaxSeason } from '../../../utils/awardHistory';
import { ADV_COLS, GH_COLS, PG_COLS, Phase, PhaseTabs, SeasonRow, SL_COLS, SL_GROUPS, StatsTable } from './PlayerBioStatsHistoryShared';
import { buildSeasonRows, enrichInternationalStatMetadata, useBoxData } from './playerBioStatsHistoryData';
import { loadPbaStatsForPlayers } from '../../../services/pba/statsArchive';
import { loadEuroStatsForPlayers } from '../../../services/euro/statsArchive';
import { getHistoricalNbaCompletedSeasonCutoff } from '../../../services/playerDevelopment/hofHistoryWindow';
import { filterCurrentPbaImportedStats, isPbaCareerPlayer } from './playerBioStatsFilters';
import { filterPostBranchSourceStats, isHistoricalNbaWhatIfTimeline } from '../../../utils/historicalTimeline';
import { buildBoxScoreStatsByPlayer } from './playerStatsBoxScoreMaps';
import {
  ensureFullRosterPlayerDataLoaded,
  ensureNativeHistoricalStatsLoaded,
  getNativeHistoricalStatsForIdentity,
  mergeHistoricalSourceStats,
} from '../../../data/realPlayerDataFetcher';
import {
  getPreloadedEuroStats,
  getPreloadedExternalTeams,
  getPreloadedPbaStats,
} from '../../../services/playerBioPreload';
import { collectInternationalTournamentBoxScores } from '../../../services/fiba/tournamentBoxScores';
import { loadFibaHistoricalStatsForPlayer } from '../../../services/fiba/historicalPlayerStats';
import { loadSummerLeagueStatsForPlayer } from '../../../services/summerLeague/statsArchive';
import { loadBbrCollegeStatsForPlayer } from '../../../services/college/bbrCollegeHistory';
import { getPlayerBioDefaultLeagueContext, getPlayerBioStatCompetitionKey } from './playerBioCrossLeagueHistory';
import { getBackgroundStatsForPlayer } from '../../../services/backgroundUniverse/backgroundUniverseSelectors';
import { getPbaConferenceChampionKeys, isPbaConferenceStat } from './playerBioPbaSeasonGrouping';

interface Props {
  player: NBAPlayer;
}

export const PlayerBioStatsHistory: React.FC<Props> = ({ player }) => {
  const { state } = useGame();
  const externalTeams = getPreloadedExternalTeams(state.saveId);
  const labels = useLeagueLabels();
  const [pgPhase, setPgPhase] = useState<Phase>('rs');
  const [slPhase, setSlPhase] = useState<Phase>('rs');
  const [advPhase, setAdvPhase] = useState<Phase>('rs');
  const [ghPhase, setGhPhase] = useState<Phase>('rs');
  const [pbaArchiveStats, setPbaArchiveStats] = useState<NBAGMStat[]>([]);
  const [euroArchiveStats, setEuroArchiveStats] = useState<NBAGMStat[]>([]);
  const [fullRosterSourceStats, setFullRosterSourceStats] = useState<NBAGMStat[]>([]);
  const [summerLeagueStats, setSummerLeagueStats] = useState<NBAGMStat[]>([]);
  const [collegeStats, setCollegeStats] = useState<NBAGMStat[]>([]);
  const [fibaArchiveStats, setFibaArchiveStats] = useState<NBAGMStat[]>([]);
  const collegeRequested = pgPhase === 'college' || slPhase === 'college' || advPhase === 'college' || ghPhase === 'college';
  const isFictional = state.leagueType === 'fictional';
  const isPbaPlayer = isPbaCareerPlayer(player);
  const euroMode = state.leagueStats?.uiMode === 'euro_isolated';
  const isEuroCurrentPlayer = euroMode || player.status === 'Euroleague' || player.status === 'Endesa';
  const isEuroArchivePlayer = !isFictional && !isPbaPlayer;
  const isEuroCareerPlayer = euroMode || isEuroArchivePlayer;
  const currentSeason = state.leagueStats.year;
  const defaultLeagueContext = getPlayerBioDefaultLeagueContext(state.leagueStats?.uiMode);
  const euroSourceSeason = isEuroCareerPlayer ? Number(state.euroStartSeason ?? currentSeason) : undefined;
  const maxVisibleSeason = euroMode
    ? Math.max(0, Number(state.euroStartSeason ?? currentSeason) - 1)
    : getHistoricalNbaCompletedSeasonCutoff({
        currentYear: currentSeason,
        leagueType: state.leagueType,
        moddedLeagueBase: state.moddedLeagueBase,
        nbaStartYear: state.nbaStartYear,
      }) ?? currentSeason;
  const historicalBranchStartSeason = isHistoricalNbaWhatIfTimeline({
    currentYear: currentSeason,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  })
    ? Number(state.nbaStartYear ?? 0) || undefined
    : undefined;
  const gameCalendarYear = Number(String(state.date ?? '').slice(0, 4)) || currentSeason;
  const summerLeagueSourceCutoff = Math.min(
    maxVisibleSeason,
    state.leagueType === 'modded' && state.moddedLeagueBase === 'nba'
      ? Number(state.nbaStartYear ?? gameCalendarYear)
      : gameCalendarYear,
  );
  const backgroundStats = useMemo(
    () => getBackgroundStatsForPlayer(state, player.internalId),
    [player.internalId, state.backgroundUniverse],
  );
  const visibleAwards = useMemo(
    () => filterAwardsToVisibleTimeline(
      isEuroCurrentPlayer ? (player.awards ?? []).filter(award => award.season < currentSeason) : player.awards ?? [],
      getPlayerStatsAwardMaxSeason(currentSeason, currentSeason, maxVisibleSeason),
    ),
    [currentSeason, isEuroCurrentPlayer, maxVisibleSeason, player.awards],
  );

  const allStarSeasons = useMemo(() => {
    const set = new Set<number>();
    visibleAwards.forEach(award => {
      if (award.type && (award.type.toLowerCase().includes('all-star') || award.type.toLowerCase().includes('allstar'))) {
        set.add(award.season);
      }
    });
    return set;
  }, [visibleAwards]);

  const ringSeasons = useMemo(() => {
    const set = new Set<number>();
    visibleAwards.forEach(award => {
      if (!award.type) return;
      const type = award.type.toLowerCase();
      if ((type.includes('champion') || type === 'nba champion' || type === 'nba championship')
        && !type.includes('cup')
        && !isPbaConferenceStat(award.competitionId)
        && !(isPbaPlayer && String(award.competitionId ?? '').toLowerCase() === 'pba')) {
        set.add(award.season);
      }
    });
    return set;
  }, [isPbaPlayer, visibleAwards]);

  const pbaConferenceChampionKeys = useMemo(
    () => getPbaConferenceChampionKeys(visibleAwards),
    [visibleAwards],
  );

  const cupSeasons = useMemo(() => {
    const set = new Set<number>();
    visibleAwards.forEach(award => {
      if (award.type?.toLowerCase() === 'nba cup champion') set.add(award.season);
    });
    return set;
  }, [visibleAwards]);

  const internationalBoxScores = useMemo(
    () => collectInternationalTournamentBoxScores(
      state.internationalTournament,
      state.internationalTournamentHistory,
    ),
    [state.internationalTournament, state.internationalTournamentHistory],
  );
  const playerBioBoxScores = useMemo(
    () => [...state.boxScores, ...internationalBoxScores],
    [internationalBoxScores, state.boxScores],
  );
  const boxData = useBoxData(player.internalId, playerBioBoxScores, state.leagueStats);
  const euroBranchStats = useMemo(() => {
    if (!isEuroCurrentPlayer || !state.euroPrimaryCompetitionId) return [];
    const competitionIds = new Set([state.euroPrimaryCompetitionId]);
    const regular = buildBoxScoreStatsByPlayer(state, { competitionIds, phase: 'regular' }).get(player.internalId) ?? [];
    const playoffs = buildBoxScoreStatsByPlayer(state, { competitionIds, phase: 'playoffs' }).get(player.internalId) ?? [];
    return [
      ...regular,
      ...playoffs.map(row => ({ ...row, playoffs: true })),
    ];
  }, [isEuroCurrentPlayer, player.internalId, state.boxScores, state.euroPrimaryCompetitionId, state.leagueStats, state.nbaCup, state.nbaCupHistory, state.playoffs, state.schedule]);
  useEffect(() => {
    let cancelled = false;
    if (!isPbaPlayer) {
      setPbaArchiveStats([]);
    } else {
      const preloaded = getPreloadedPbaStats(state.saveId, player.internalId, currentSeason - 1);
      if (preloaded) {
        setPbaArchiveStats(preloaded);
      } else {
        loadPbaStatsForPlayers([player], { maxSeason: currentSeason - 1 }).then(rowsByPlayer => {
          if (!cancelled) setPbaArchiveStats(rowsByPlayer.get(player.internalId) ?? []);
        });
      }
    }
    if (!isEuroArchivePlayer) {
      setEuroArchiveStats([]);
    } else {
      const maxEuroSourceSeason = Math.max(0, Number(euroSourceSeason ?? currentSeason) - 1);
      const preloaded = getPreloadedEuroStats(state.saveId, player.internalId, maxEuroSourceSeason);
      if (preloaded?.length) {
        setEuroArchiveStats(preloaded.filter(row => (
          euroSourceSeason === undefined || row.season < euroSourceSeason
        )));
      } else {
        loadEuroStatsForPlayers([player], { maxSeason: currentSeason - 1 }).then(rowsByPlayer => {
          if (!cancelled) setEuroArchiveStats((rowsByPlayer.get(player.internalId) ?? []).filter(row => (
            euroSourceSeason === undefined || row.season < euroSourceSeason
          )));
        });
      }
    }
    return () => { cancelled = true; };
  }, [currentSeason, euroSourceSeason, isEuroArchivePlayer, isPbaPlayer, player, state.saveId]);

  useEffect(() => {
    let cancelled = false;
    setFullRosterSourceStats([]);
    if (isFictional) return () => { cancelled = true; };
    Promise.all([ensureFullRosterPlayerDataLoaded(), ensureNativeHistoricalStatsLoaded()])
      .then(() => {
        if (!cancelled) setFullRosterSourceStats(getNativeHistoricalStatsForIdentity(player));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isFictional, player.internalId, player.name, player.srID, (player as any).slug]);

  useEffect(() => {
    let cancelled = false;
    setFibaArchiveStats([]);
    if (isFictional) return () => { cancelled = true; };
    loadFibaHistoricalStatsForPlayer(player, maxVisibleSeason)
      .then(rows => {
        if (!cancelled) setFibaArchiveStats(rows);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isFictional, maxVisibleSeason, player.born?.year, player.name]);

  useEffect(() => {
    let cancelled = false;
    setSummerLeagueStats([]);
    if (isFictional) return () => { cancelled = true; };
    loadSummerLeagueStatsForPlayer(player, summerLeagueSourceCutoff)
      .then(rows => {
        if (!cancelled) setSummerLeagueStats(rows);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isFictional, player, summerLeagueSourceCutoff]);

  useEffect(() => {
    let cancelled = false;
    setCollegeStats([]);
    if (isFictional || !collegeRequested) return () => { cancelled = true; };
    loadBbrCollegeStatsForPlayer(player, maxVisibleSeason)
      .then(rows => {
        if (!cancelled) setCollegeStats(rows);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [collegeRequested, isFictional, maxVisibleSeason, player]);

  const stats = useMemo(() => {
    const storedBase = filterCurrentPbaImportedStats(player, (player.stats ?? []) as NBAGMStat[], currentSeason);
    const base = isEuroCurrentPlayer
      ? [...storedBase.filter(row => Number(row.season) < currentSeason), ...euroBranchStats]
      : storedBase;
    const sourceMaxSeason = isEuroCurrentPlayer
      ? Math.max(0, Number(euroSourceSeason ?? currentSeason) - 1)
      : historicalBranchStartSeason ?? maxVisibleSeason;
    const withHistoricalSource = filterPostBranchSourceStats(
      mergeHistoricalSourceStats(base, fullRosterSourceStats, sourceMaxSeason),
      historicalBranchStartSeason,
    );
    const displaySource = enrichInternationalStatMetadata(withHistoricalSource, fibaArchiveStats);
    const rowKey = (row: NBAGMStat) => `${row.season}|${row.playoffs ? 1 : 0}|${getPlayerBioStatCompetitionKey(row, defaultLeagueContext?.tag)}`;
    const existingRows = new Set(displaySource.filter(row => (row.gp ?? 0) > 0).map(rowKey));
    const isCanonicalPbaSourceRow = (row: NBAGMStat) => (
      (row.gp ?? 0) > 0
      && (
        (row as NBAGMStat & { historicalPbaSourceStat?: boolean }).historicalPbaSourceStat === true
        || String(row.competitionId ?? '').toLowerCase() === 'pba'
      )
    );
    const pbaSourceRichness = (row: NBAGMStat) => (
      ['min', 'fg', 'fga', 'tp', 'tpa', 'ft', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf']
        .filter(field => (row as unknown as Record<string, unknown>)[field] != null)
        .length
    );
    const richSourcePbaSeasons = new Set(displaySource
      .filter(row => isCanonicalPbaSourceRow(row) && pbaSourceRichness(row) >= 8)
      .map(row => Number(row.season)));
    const archivePbaSeasons = new Set(pbaArchiveStats.map(row => Number(row.season)));
    const replacedSparseSourceSeasons = new Set(displaySource
      .filter(row => (
        isCanonicalPbaSourceRow(row)
        && pbaSourceRichness(row) < 8
        && archivePbaSeasons.has(Number(row.season))
      ))
      .map(row => Number(row.season)));
    const displayBase = displaySource.filter(row => !(
      isCanonicalPbaSourceRow(row)
      && replacedSparseSourceSeasons.has(Number(row.season))
    ));
    const archive = [
      ...pbaArchiveStats.filter(row => !richSourcePbaSeasons.has(Number(row.season))),
      ...euroArchiveStats,
      ...fibaArchiveStats,
      ...summerLeagueStats,
      ...collegeStats,
      ...backgroundStats,
    ].filter(row => !existingRows.has(rowKey(row)));
    if (!archive.length) return displayBase;
    return [...displayBase, ...archive];
  }, [backgroundStats, collegeStats, currentSeason, defaultLeagueContext?.tag, euroArchiveStats, euroBranchStats, euroSourceSeason, fibaArchiveStats, fullRosterSourceStats, historicalBranchStartSeason, isEuroCurrentPlayer, maxVisibleSeason, pbaArchiveStats, player, player.stats, summerLeagueStats]);
  const visibleStats = useMemo(
    () => stats.filter(stat => {
      const season = Number(stat.season ?? 0);
      return season <= maxVisibleSeason || season === currentSeason;
    }),
    [currentSeason, maxVisibleSeason, stats],
  );
  const computedAge = player.born?.year ? currentSeason - player.born.year : (player.age ?? 0);
  const allTeamsForRows = useMemo(
    () => [...state.teams, ...externalTeams, ...(state.nonNBATeams ?? [])],
    [externalTeams, state.nonNBATeams, state.teams],
  );

  const build = (phase: Phase) => buildSeasonRows(visibleStats, allTeamsForRows, currentSeason, computedAge, boxData, phase, defaultLeagueContext);
  const automaticPhasePlayer = useRef('');
  const firstPopulatedPhase = useMemo(() => (
    (['rs', 'international', 'college', 'summerLeague', 'playoffs', 'combined'] as Phase[])
      .find(phase => buildSeasonRows(
        visibleStats,
        allTeamsForRows,
        currentSeason,
        computedAge,
        boxData,
        phase,
        defaultLeagueContext,
      ).body.length > 0)
  ), [allTeamsForRows, boxData, computedAge, currentSeason, defaultLeagueContext, visibleStats]);
  useEffect(() => {
    if (!firstPopulatedPhase || automaticPhasePlayer.current === player.internalId) return;
    automaticPhasePlayer.current = player.internalId;
    setPgPhase(firstPopulatedPhase);
    setSlPhase(firstPopulatedPhase);
    setAdvPhase(firstPopulatedPhase);
    setGhPhase(firstPopulatedPhase);
  }, [firstPopulatedPhase, player.internalId]);
  const pgData = useMemo(() => build(pgPhase), [boxData, pgPhase, visibleStats]);
  const slData = useMemo(() => build(slPhase), [boxData, slPhase, visibleStats]);
  const advData = useMemo(() => build(advPhase), [advPhase, boxData, visibleStats]);
  const ghData = useMemo(() => build(ghPhase), [boxData, ghPhase, visibleStats]);
  const toRows = (data: { body: SeasonRow[]; career: SeasonRow | null }) => [...data.body, ...(data.career ? [data.career] : [])];

  return (
    <div className="p-4 md:p-6 bg-[#080808] space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Per Game</h3>
            {(allStarSeasons.size > 0 || ringSeasons.size > 0 || cupSeasons.size > 0 || pbaConferenceChampionKeys.size > 0) && (
              <p className="text-[10px] text-slate-600 mt-0.5">
                {(ringSeasons.size > 0 || pbaConferenceChampionKeys.size > 0) && '💍 Champion  '}
                {cupSeasons.size > 0 && '🏆 Cup Champion  '}
                {allStarSeasons.size > 0 && '★ All-Star'}
              </p>
            )}
          </div>
          <PhaseTabs phase={pgPhase} onChange={setPgPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(pgData)} cols={PG_COLS} allStarSeasons={allStarSeasons} ringSeasons={ringSeasons} cupSeasons={cupSeasons} cupChampionLabel={labels.cupChampion} pbaConferenceChampionKeys={pbaConferenceChampionKeys} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Shot Locations &amp; Feats</h3>
          <PhaseTabs phase={slPhase} onChange={setSlPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(slData)} cols={SL_COLS} allStarSeasons={allStarSeasons} ringSeasons={ringSeasons} cupSeasons={cupSeasons} cupChampionLabel={labels.cupChampion} groupHeaders={SL_GROUPS} pbaConferenceChampionKeys={pbaConferenceChampionKeys} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Advanced</h3>
          <PhaseTabs phase={advPhase} onChange={setAdvPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(advData)} cols={ADV_COLS} allStarSeasons={allStarSeasons} ringSeasons={ringSeasons} cupSeasons={cupSeasons} cupChampionLabel={labels.cupChampion} pbaConferenceChampionKeys={pbaConferenceChampionKeys} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Game Highs</h3>
          <PhaseTabs phase={ghPhase} onChange={setGhPhase} />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <StatsTable rows={toRows(ghData)} cols={GH_COLS} allStarSeasons={allStarSeasons} ringSeasons={ringSeasons} cupSeasons={cupSeasons} cupChampionLabel={labels.cupChampion} pbaConferenceChampionKeys={pbaConferenceChampionKeys} />
        </div>
      </section>
    </div>
  );
};
