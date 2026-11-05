import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NBAPlayer } from '../../../types';
import { useGame } from '../../../store/GameContext';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';
import { getOwnTeamId, getSeasonPhase } from '../../../utils/helpers';
import { isFourPointEnabled, isThreePointEnabled } from '../../../utils/ruleFlags';
import { matchCheat, triggerCheat } from '../../../utils/debugCheats';
import { useHubScope } from '../../../hooks/useHubScope';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { PBA_COMPETITIONS } from '../../../data/templates/philippines/competitions';
import { getConferenceSpec, type PbaConference } from '../../../services/pba/conferenceTransition';
import { PlayerStatsControls } from './PlayerStatsControls';
import { PlayerStatsTable } from './PlayerStatsTable';
import { ComputedRow, Phase, SeasonMode, SortField, StatType } from './PlayerStatsShared';
import { usePlayerStatsDerivedData } from './usePlayerStatsDerivedData';
import { loadPbaStatsForPlayers, type PbaStatsByPlayer } from '../../../services/pba/statsArchive';
import {
  getCanonicalEuroStatCompetitionId,
  loadEuroStatsForPlayers,
  type EuroStatsByPlayer,
} from '../../../services/euro/statsArchive';
import { getHistoricalNbaCompletedSeasonCutoff } from '../../../services/playerDevelopment/hofHistoryWindow';
import { getPlayerStatsAwardMaxSeason } from '../../../utils/awardHistory';
import { getPbaBranchStartSeason } from '../../../services/pba/branchHistoryOwnership';
import { formatLeagueSeasonLabel } from '../../../services/leagueCalendar';
import { scopePlayerStatsPlayersToLeague } from './playerStatsLeagueScope';
import {
  buildNativeHistoricalPlayersForSeason,
  ensureBiosLoaded,
  ensureFullRosterPlayerDataLoaded,
  ensureNativeHistoricalStatsLoaded,
  getNativeHistoricalStatSeasons,
} from '../../../data/realPlayerDataFetcher';
import { mergePlayerCareer } from '../../../utils/playerCareerMerge';

interface PlayerStatsViewProps {
  initialTeamFilter?: string;
  selectedSeason?: number;
}

const PBA_COMBINED_FILTER = 'combined';

export const PlayerStatsView: React.FC<PlayerStatsViewProps> = ({ initialTeamFilter, selectedSeason }) => {
  const { state, dispatchAction, navigateToTeam, pendingStatSort, setPendingStatSort } = useGame();
  const currentSeason = state.leagueStats.year;
  const pbaSourceCutoff = getPbaBranchStartSeason(state);
  const maxVisibleSeason = getHistoricalNbaCompletedSeasonCutoff({
    currentYear: currentSeason,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  }) ?? currentSeason;
  const isStatsSeasonVisible = useCallback(
    (seasonYear: number) => seasonYear <= maxVisibleSeason || seasonYear === currentSeason,
    [currentSeason, maxVisibleSeason],
  );
  const ownTid = getOwnTeamId(state);
  const { hubTab, teams: scopedTeams, tids: scopedTids, players: scopedPlayers, isScoped, euroIsolated, pbaIsolated, wnbaIsolated } = useHubScope();
  const formatStatsSeasonLabel = useCallback(
    (seasonYear: number) => pbaIsolated ? String(seasonYear) : formatLeagueSeasonLabel(seasonYear, state.leagueStats),
    [pbaIsolated, state.leagueStats],
  );
  const hubCompetition = state.activeCompetitions?.find(competition => competition.id === hubTab);
  const knockoutOnly = hubCompetition?.format === 'knockout' || hubCompetition?.format === 'tournament';
  const labels = useLeagueLabels();
  const statTeams = isScoped ? scopedTeams : state.teams;
  const nbaCentralScope = !isScoped
    && state.leagueType === 'modded'
    && (state.moddedLeagueBase ?? 'nba') === 'nba';
  const baseStatPlayers = useMemo(() => {
    if (wnbaIsolated) return scopePlayerStatsPlayersToLeague(scopedPlayers, scopedTeams, 'wnba');
    if (nbaCentralScope) return scopePlayerStatsPlayersToLeague(state.players, state.teams, 'nba');
    return isScoped ? scopedPlayers : state.players;
  }, [isScoped, nbaCentralScope, scopedPlayers, scopedTeams, state.players, state.teams, wnbaIsolated]);
  const fourPointEnabled = isFourPointEnabled(state.leagueStats);
  const threePointEnabled = isThreePointEnabled(state.leagueStats);
  const quick = usePlayerQuickActions();
  const activeStatsPhase = useMemo<Phase>(() => {
    if (knockoutOnly) return 'combined';
    const activePhase = getSeasonPhase(state);
    if (activePhase === 'preseason' || activePhase === 'playoffs') return activePhase;
    return 'regular';
  }, [knockoutOnly, state.date, state.leagueStats, state.schedule, state.teams]);
  const [statType, setStatType] = useState<StatType>('perGame');
  const [phase, setPhase] = useState<Phase>(activeStatsPhase);
  const phaseWasSelected = useRef(false);
  const selectPhase = useCallback((nextPhase: Phase) => {
    phaseWasSelected.current = true;
    setPhase(nextPhase);
  }, []);
  const [pbaCompetitionFilter, setPbaCompetitionFilter] = useState(() =>
    getConferenceSpec(((state.leagueStats as any)?.pbaConference ?? 'philippine') as PbaConference).id,
  );
  const currentPbaCompetitionId = getConferenceSpec(((state.leagueStats as any)?.pbaConference ?? 'philippine') as PbaConference).id;
  const [teamFilter, setTeamFilter] = useState<string>(initialTeamFilter ?? 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('pts');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [brefRows, setBrefRows] = useState<Map<string, ComputedRow>>(new Map());
  const [pbaArchiveStats, setPbaArchiveStats] = useState<PbaStatsByPlayer>(new Map());
  const [euroArchiveStats, setEuroArchiveStats] = useState<EuroStatsByPlayer>(new Map());
  const [nativeHistoricalPlayers, setNativeHistoricalPlayers] = useState<NBAPlayer[]>([]);
  const [nativeHistoricalSeasons, setNativeHistoricalSeasons] = useState<number[]>([]);
  const [nativeHistoricalArchiveReady, setNativeHistoricalArchiveReady] = useState(false);
  const [season, setSeason] = useState<SeasonMode>(() => selectedSeason ?? currentSeason);

  useEffect(() => {
    let cancelled = false;
    if (!nbaCentralScope) {
      setNativeHistoricalSeasons([]);
      setNativeHistoricalPlayers([]);
      setNativeHistoricalArchiveReady(true);
      return () => { cancelled = true; };
    }
    setNativeHistoricalArchiveReady(false);
    Promise.all([
      ensureBiosLoaded(),
      ensureNativeHistoricalStatsLoaded(),
      ensureFullRosterPlayerDataLoaded(),
    ]).then(() => {
      if (cancelled) return;
      setNativeHistoricalSeasons(getNativeHistoricalStatSeasons(maxVisibleSeason));
      setNativeHistoricalArchiveReady(true);
      if (typeof season !== 'number' || season >= currentSeason || season > maxVisibleSeason) {
        setNativeHistoricalPlayers([]);
        return;
      }
      setNativeHistoricalPlayers(buildNativeHistoricalPlayersForSeason(season).map(player => ({
        ...player,
        stats: (player.stats ?? []).filter(stat => Number(stat.season) === season),
      })));
    });
    return () => { cancelled = true; };
  }, [currentSeason, maxVisibleSeason, nbaCentralScope, season]);

  const statPlayers = useMemo(() => {
    if (!nbaCentralScope || nativeHistoricalPlayers.length === 0) return baseStatPlayers;
    const historyBySlug = new Map(nativeHistoricalPlayers
      .flatMap(player => player.srID ? [[player.srID.toLowerCase(), player] as const] : []));
    const seen = new Set<string>();
    const merged = baseStatPlayers.map(player => {
      const slug = String(player.srID ?? player.slug ?? '').toLowerCase();
      const history = slug ? historyBySlug.get(slug) : undefined;
      if (!history) return player;
      seen.add(slug);
      return mergePlayerCareer(player, history) as NBAPlayer;
    });
    for (const player of nativeHistoricalPlayers) {
      const slug = String(player.srID ?? player.slug ?? '').toLowerCase();
      if (!slug || !seen.has(slug)) merged.push(player);
    }
    return merged;
  }, [baseStatPlayers, nativeHistoricalPlayers, nbaCentralScope]);

  useEffect(() => {
    phaseWasSelected.current = false;
    setPhase(activeStatsPhase);
  }, [hubTab, knockoutOnly]);

  useEffect(() => {
    if (!phaseWasSelected.current) setPhase(activeStatsPhase);
  }, [activeStatsPhase]);

  useEffect(() => {
    let cancelled = false;
    if (pbaIsolated) {
      loadPbaStatsForPlayers(scopedPlayers, { maxSeason: pbaSourceCutoff - 1 }).then(rows => {
        if (!cancelled) setPbaArchiveStats(rows);
      });
    } else {
      setPbaArchiveStats(new Map());
    }
    if (euroIsolated) {
      loadEuroStatsForPlayers(scopedPlayers, { maxSeason: currentSeason - 1 }).then(rows => {
        if (!cancelled) setEuroArchiveStats(rows);
      });
    } else {
      setEuroArchiveStats(new Map());
    }
    return () => { cancelled = true; };
  }, [currentSeason, euroIsolated, pbaIsolated, pbaSourceCutoff, scopedPlayers]);

  const availableSeasons = useMemo(() => {
    if (pbaIsolated) {
      const pbaIds = new Set(PBA_COMPETITIONS.map(spec => spec.id));
      const seasons = new Set<number>([currentSeason]);
      (state.boxScores as any[]).forEach(box => {
        if (!pbaIds.has(String(box.competitionId ?? ''))) return;
        const seasonYear = Number(box.season) || currentSeason;
        if (seasonYear > 0 && isStatsSeasonVisible(seasonYear)) seasons.add(seasonYear);
      });
      for (const rows of pbaArchiveStats.values()) {
        rows.forEach(row => {
          if (row.gp > 0 && isStatsSeasonVisible(row.season)) seasons.add(row.season);
        });
      }
      statPlayers.forEach(player => {
        player.stats?.forEach(stat => {
          if (stat.gp > 0 && isStatsSeasonVisible(stat.season)) seasons.add(stat.season);
        });
      });
      return Array.from(seasons).sort((a, b) => b - a);
    }
    if (euroIsolated) {
      const seasons = new Set<number>([currentSeason]);
      (state.boxScores as any[]).forEach(box => {
        if (hubTab && String(box.competitionId ?? '').toLowerCase() !== hubTab.toLowerCase()) return;
        const seasonYear = Number(box.season) || currentSeason;
        if (seasonYear > 0 && isStatsSeasonVisible(seasonYear)) seasons.add(seasonYear);
      });
      for (const rows of euroArchiveStats.values()) {
        rows.forEach(row => {
          if (hubTab && getCanonicalEuroStatCompetitionId(row as any) !== hubTab.toLowerCase()) return;
          if (row.gp > 0 && isStatsSeasonVisible(row.season)) seasons.add(row.season);
        });
      }
      return Array.from(seasons).sort((a, b) => b - a);
    }
    const seasons = new Set<number>([currentSeason, ...(nbaCentralScope ? nativeHistoricalSeasons : [])]);
    statPlayers.forEach(player => {
      player.stats?.forEach(stat => {
        if (stat.gp > 0 && isStatsSeasonVisible(stat.season)) seasons.add(stat.season);
      });
    });
    return Array.from(seasons).sort((a, b) => b - a);
  }, [currentSeason, euroArchiveStats, euroIsolated, hubTab, isStatsSeasonVisible, nativeHistoricalSeasons, nbaCentralScope, pbaArchiveStats, pbaIsolated, state.boxScores, statPlayers]);

  useEffect(() => {
    if (selectedSeason != null) setSeason(selectedSeason);
  }, [selectedSeason]);

  useEffect(() => {
    if (typeof season !== 'number') return;
    if (nbaCentralScope && !nativeHistoricalArchiveReady) return;
    if (availableSeasons.length > 0 && !availableSeasons.includes(season)) {
      setSeason(availableSeasons.includes(currentSeason) ? currentSeason : availableSeasons[0]);
    }
  }, [availableSeasons, currentSeason, nativeHistoricalArchiveReady, nbaCentralScope, season]);

  useEffect(() => {
    if (!pendingStatSort || pendingStatSort.type !== 'player') return;
    setSortField(pendingStatSort.field as SortField);
    setSortOrder(pendingStatSort.order);
    if (pendingStatSort.phase) setPhase(pendingStatSort.phase as Phase);
    if (pbaIsolated && pendingStatSort.competitionId) setPbaCompetitionFilter(pendingStatSort.competitionId);
    const advFields: SortField[] = ['per', 'tsPct', 'efgPctA', 'usgPct', 'ortg', 'drtg', 'bpm', 'ws', 'vorp'];
    if (advFields.includes(pendingStatSort.field as SortField)) setStatType('advanced');
    setPendingStatSort(null);
  }, [pendingStatSort, pbaIsolated, setPendingStatSort]);

  useEffect(() => {
    setCurrentPage(1);
  }, [season, phase, pbaCompetitionFilter, statType, teamFilter, searchTerm, sortField, sortOrder]);

  useEffect(() => {
    if ((euroIsolated || pbaIsolated) && phase === 'cup') setPhase('regular');
  }, [euroIsolated, pbaIsolated, phase]);

  useEffect(() => {
    if (!pbaIsolated) return;
    setPbaCompetitionFilter(prev => prev === PBA_COMBINED_FILTER ? prev : currentPbaCompetitionId);
  }, [currentPbaCompetitionId, pbaIsolated]);

  useEffect(() => {
    if (!pbaIsolated || typeof season !== 'number') return;
    const hasSeasonAggregate = statPlayers.some(player => (player.stats ?? []).some(stat =>
      stat.season === season
      && !stat.playoffs
      && stat.gp > 0
      && stat.season < pbaSourceCutoff
      && String(stat.competitionId ?? '').toLowerCase() === 'pba'
    ));
    if (hasSeasonAggregate) setPbaCompetitionFilter(PBA_COMBINED_FILTER);
  }, [pbaIsolated, pbaSourceCutoff, season, statPlayers]);

  const pbaCompetitionOptions = useMemo(() => [
    ...PBA_COMPETITIONS.map(spec => ({ id: spec.id, label: spec.displayName.replace(/^PBA\s+/, '') })),
    { id: PBA_COMBINED_FILTER, label: 'Combined' },
  ], []);

  const pbaCompetitionIds = useMemo(() => {
    if (!pbaIsolated) return undefined;
    return pbaCompetitionFilter === PBA_COMBINED_FILTER
      ? [...PBA_COMPETITIONS.map(spec => spec.id), 'pba']
      : [pbaCompetitionFilter];
  }, [pbaIsolated, pbaCompetitionFilter]);
  const competitionIds = useMemo(() => {
    if (pbaIsolated) return pbaCompetitionIds;
    if (euroIsolated && (hubTab ?? state.euroPrimaryCompetitionId)) return [hubTab ?? state.euroPrimaryCompetitionId!];
    return undefined;
  }, [euroIsolated, hubTab, pbaCompetitionIds, pbaIsolated, state.euroPrimaryCompetitionId]);

  const filteredPbaArchiveStats = useMemo(() => {
    if (!pbaIsolated) return undefined;
    if (pbaCompetitionFilter === PBA_COMBINED_FILTER) return pbaArchiveStats;
    const filtered = new Map<string, typeof pbaArchiveStats extends Map<string, infer T> ? T : never>();
    for (const [playerId, rows] of pbaArchiveStats.entries()) {
      const nextRows = rows.filter(row => (row as any)._archiveCompetitionId === pbaCompetitionFilter);
      if (nextRows.length > 0) filtered.set(playerId, nextRows as any);
    }
    return filtered;
  }, [pbaArchiveStats, pbaCompetitionFilter, pbaIsolated]);

  const filteredEuroArchiveStats = useMemo(() => {
    if (!euroIsolated || !hubTab) return euroArchiveStats;
    const filtered: EuroStatsByPlayer = new Map();
    for (const [playerId, rows] of euroArchiveStats.entries()) {
      const matching = rows.filter(row => getCanonicalEuroStatCompetitionId(row as any) === hubTab.toLowerCase());
      if (matching.length > 0) filtered.set(playerId, matching);
    }
    return filtered;
  }, [euroArchiveStats, euroIsolated, hubTab]);

  const externalArchiveStats = pbaIsolated
    ? filteredPbaArchiveStats
    : euroIsolated
      ? filteredEuroArchiveStats
      : undefined;

  const sortedTeams = useMemo(
    () =>
      isScoped
        ? [...scopedTeams].sort((a, b) => (a.abbrev ?? a.name).localeCompare(b.abbrev ?? b.name))
        : [...state.teams]
            .filter(team => team.conference === 'East' || team.conference === 'West')
            .sort((a, b) => a.abbrev.localeCompare(b.abbrev)),
    [state.teams, scopedTeams, isScoped],
  );

  useEffect(() => {
    if (teamFilter === 'all') return;
    const legacyTeam = sortedTeams.find(team => team.abbrev === teamFilter);
    if (legacyTeam) {
      setTeamFilter(String(legacyTeam.id));
      return;
    }
    if (!sortedTeams.some(team => String(team.id) === teamFilter)) {
      setTeamFilter('all');
    }
  }, [teamFilter, sortedTeams]);

  const prevTeam = useCallback(() => {
    const index = sortedTeams.findIndex(team => String(team.id) === teamFilter);
    if (teamFilter === 'all') setTeamFilter(sortedTeams.length ? String(sortedTeams[sortedTeams.length - 1].id) : 'all');
    else if (index <= 0) setTeamFilter('all');
    else setTeamFilter(String(sortedTeams[index - 1].id));
  }, [teamFilter, sortedTeams]);

  const nextTeam = useCallback(() => {
    const index = sortedTeams.findIndex(team => String(team.id) === teamFilter);
    if (teamFilter === 'all') setTeamFilter(sortedTeams.length ? String(sortedTeams[0].id) : 'all');
    else if (index >= sortedTeams.length - 1) setTeamFilter('all');
    else setTeamFilter(String(sortedTeams[index + 1].id));
  }, [teamFilter, sortedTeams]);

  const { brefLoading, filteredRows, pageRows, totalPages } = usePlayerStatsDerivedData({
    state,
    statPlayers,
    statTeams,
    scopedTids: scopedTids as Set<number>,
    isScoped,
    season,
    phase,
    competitionIds,
    externalStatsByPlayer: externalArchiveStats,
    statType,
    teamFilter,
    searchTerm,
    columnFilters,
    sortField,
    sortOrder,
    perPage,
    currentPage,
    brefRows,
    setBrefRows,
  });

  const handleSearchKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;
      const code = matchCheat(searchTerm);
      if (!code) return;
      event.preventDefault();
      setSearchTerm('');
      await triggerCheat(code, { state, dispatchAction });
    },
    [dispatchAction, searchTerm, state],
  );

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortOrder(order => (order === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortOrder('desc');
    }
  }, [sortField]);

  const handlePerPageChange = useCallback((value: React.SetStateAction<number>) => {
    setPerPage(value);
    setCurrentPage(1);
  }, []);

  const handleTeamSelect = useCallback((abbrev: string) => {
    const team = statTeams.find(entry => entry.abbrev === abbrev);
    if (team) navigateToTeam(team.id);
  }, [navigateToTeam, statTeams]);

  if (quick.fullPageView) return quick.fullPageView;

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-200">
      <PlayerStatsControls
        availableSeasons={availableSeasons}
        season={season}
        setSeason={setSeason}
        sortedTeams={sortedTeams}
        teamFilter={teamFilter}
        setTeamFilter={setTeamFilter}
        prevTeam={prevTeam}
        nextTeam={nextTeam}
        statType={statType}
        setStatType={setStatType}
        phase={phase}
        setPhase={selectPhase}
        pbaCompetitionFilter={pbaCompetitionFilter}
        setPbaCompetitionFilter={setPbaCompetitionFilter}
        pbaCompetitionOptions={pbaCompetitionOptions}
        perPage={perPage}
        setPerPage={handlePerPageChange}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        handleSearchKeyDown={handleSearchKeyDown}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        brefLoading={brefLoading}
        euroIsolated={euroIsolated}
        pbaIsolated={pbaIsolated}
        cupShort={labels.cupShort}
        title={hubCompetition ? `${hubCompetition.displayName} Player Stats` : undefined}
        knockoutOnly={knockoutOnly}
        formatSeasonLabel={formatStatsSeasonLabel}
      />
      <PlayerStatsTable
        season={season}
        statType={statType}
        phase={phase}
        competitionId={euroIsolated ? hubTab ?? state.euroPrimaryCompetitionId : undefined}
        competitionLabel={pbaIsolated
          ? pbaCompetitionOptions.find(option => option.id === pbaCompetitionFilter)?.label
          : hubCompetition?.shortName}
        phaseLabelOverride={knockoutOnly ? 'Tournament Games' : undefined}
        cupShort={labels.cupShort}
        cupChampion={labels.cupChampion}
        maxSeason={getPlayerStatsAwardMaxSeason(season, currentSeason, maxVisibleSeason)}
        fourPointEnabled={fourPointEnabled}
        threePointEnabled={threePointEnabled}
        ownTid={ownTid}
        showFilters={showFilters}
        columnFilters={columnFilters}
        setColumnFilters={setColumnFilters}
        sortField={sortField}
        sortOrder={sortOrder}
        onSort={handleSort}
        filteredRows={filteredRows}
        pageRows={pageRows}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        perPage={perPage}
        totalPages={totalPages}
        onPlayerSelect={row => quick.openFor(row.player)}
        onTeamSelect={handleTeamSelect}
        formatSeasonLabel={formatStatsSeasonLabel}
      />
      {quick.portals}
    </div>
  );
};

export default PlayerStatsView;
