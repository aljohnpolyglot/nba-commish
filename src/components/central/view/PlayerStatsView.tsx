import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';
import { getOwnTeamId } from '../../../utils/helpers';
import { isFourPointEnabled } from '../../../utils/ruleFlags';
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
import { loadEuroStatsForPlayers, type EuroStatsByPlayer } from '../../../services/euro/statsArchive';

interface PlayerStatsViewProps {
  initialTeamFilter?: string;
}

const PBA_COMBINED_FILTER = 'combined';

export const PlayerStatsView: React.FC<PlayerStatsViewProps> = ({ initialTeamFilter }) => {
  const { state, dispatchAction, navigateToTeam, pendingStatSort, setPendingStatSort } = useGame();
  const ownTid = getOwnTeamId(state);
  const { teams: scopedTeams, tids: scopedTids, players: scopedPlayers, isScoped, euroIsolated, pbaIsolated } = useHubScope();
  const labels = useLeagueLabels();
  const statPlayers = isScoped ? scopedPlayers : state.players;
  const statTeams = isScoped ? scopedTeams : state.teams;
  const fourPointEnabled = isFourPointEnabled(state.leagueStats);
  const quick = usePlayerQuickActions();
  const [statType, setStatType] = useState<StatType>('perGame');
  const [phase, setPhase] = useState<Phase>('regular');
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

  useEffect(() => {
    let cancelled = false;
    if (pbaIsolated) {
      loadPbaStatsForPlayers(scopedPlayers).then(rows => {
        if (!cancelled) setPbaArchiveStats(rows);
      });
    } else {
      setPbaArchiveStats(new Map());
    }
    if (euroIsolated) {
      loadEuroStatsForPlayers(scopedPlayers).then(rows => {
        if (!cancelled) setEuroArchiveStats(rows);
      });
    } else {
      setEuroArchiveStats(new Map());
    }
    return () => { cancelled = true; };
  }, [euroIsolated, pbaIsolated, scopedPlayers]);

  const availableSeasons = useMemo(() => {
    if (pbaIsolated) {
      const pbaIds = new Set(PBA_COMPETITIONS.map(spec => spec.id));
      const seasons = new Set<number>();
      (state.boxScores as any[]).forEach(box => {
        if (!pbaIds.has(String(box.competitionId ?? ''))) return;
        const seasonYear = Number(box.season) || state.leagueStats.year;
        if (seasonYear > 0) seasons.add(seasonYear);
      });
      for (const rows of pbaArchiveStats.values()) {
        rows.forEach(row => {
          if (row.gp > 0) seasons.add(row.season);
        });
      }
      return Array.from(seasons).sort((a, b) => b - a);
    }
    if (euroIsolated) {
      const seasons = new Set<number>();
      statPlayers.forEach(player => {
        player.stats?.forEach(stat => {
          if (stat.gp > 0) seasons.add(stat.season);
        });
      });
      for (const rows of euroArchiveStats.values()) {
        rows.forEach(row => {
          if (row.gp > 0) seasons.add(row.season);
        });
      }
      return Array.from(seasons).sort((a, b) => b - a);
    }
    const seasons = new Set<number>();
    statPlayers.forEach(player => {
      player.stats?.forEach(stat => {
        if (stat.gp > 0) seasons.add(stat.season);
      });
    });
    return Array.from(seasons).sort((a, b) => b - a);
  }, [euroArchiveStats, euroIsolated, pbaArchiveStats, pbaIsolated, state.boxScores, state.leagueStats.year, statPlayers]);

  const [season, setSeason] = useState<SeasonMode>(() => availableSeasons[0] ?? state.leagueStats.year);

  useEffect(() => {
    if ((!pbaIsolated && !euroIsolated) || typeof season !== 'number') return;
    if (availableSeasons.length > 0 && !availableSeasons.includes(season)) {
      setSeason(availableSeasons[0]);
    }
  }, [availableSeasons, euroIsolated, pbaIsolated, season]);

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

  const pbaCompetitionOptions = useMemo(() => [
    ...PBA_COMPETITIONS.map(spec => ({ id: spec.id, label: spec.displayName.replace(/^PBA\s+/, '') })),
    { id: PBA_COMBINED_FILTER, label: 'Combined' },
  ], []);

  const pbaCompetitionIds = useMemo(() => {
    if (!pbaIsolated) return undefined;
    return pbaCompetitionFilter === PBA_COMBINED_FILTER
      ? PBA_COMPETITIONS.map(spec => spec.id)
      : [pbaCompetitionFilter];
  }, [pbaIsolated, pbaCompetitionFilter]);

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

  const externalArchiveStats = pbaIsolated
    ? filteredPbaArchiveStats
    : euroIsolated
      ? euroArchiveStats
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
    if (teamFilter !== 'all' && !sortedTeams.some(team => team.abbrev === teamFilter)) {
      setTeamFilter('all');
    }
  }, [teamFilter, sortedTeams]);

  const prevSeason = useCallback(() => {
    if (season === 'all') {
      setSeason('career');
      return;
    }
    if (season === 'career') {
      setSeason(availableSeasons[0] ?? new Date().getFullYear());
      return;
    }
    const index = availableSeasons.indexOf(season as number);
    setSeason(index < availableSeasons.length - 1 ? availableSeasons[index + 1] : 'all');
  }, [season, availableSeasons]);

  const nextSeason = useCallback(() => {
    if (season === 'career') {
      setSeason('all');
      return;
    }
    if (season === 'all') {
      setSeason(availableSeasons[0] ?? new Date().getFullYear());
      return;
    }
    const index = availableSeasons.indexOf(season as number);
    setSeason(index > 0 ? availableSeasons[index - 1] : 'career');
  }, [season, availableSeasons]);

  const prevTeam = useCallback(() => {
    const index = sortedTeams.findIndex(team => team.abbrev === teamFilter);
    if (teamFilter === 'all') setTeamFilter(sortedTeams[sortedTeams.length - 1]?.abbrev ?? 'all');
    else if (index <= 0) setTeamFilter('all');
    else setTeamFilter(sortedTeams[index - 1].abbrev);
  }, [teamFilter, sortedTeams]);

  const nextTeam = useCallback(() => {
    const index = sortedTeams.findIndex(team => team.abbrev === teamFilter);
    if (teamFilter === 'all') setTeamFilter(sortedTeams[0]?.abbrev ?? 'all');
    else if (index >= sortedTeams.length - 1) setTeamFilter('all');
    else setTeamFilter(sortedTeams[index + 1].abbrev);
  }, [teamFilter, sortedTeams]);

  const { brefLoading, filteredRows, pageRows, totalPages } = usePlayerStatsDerivedData({
    state,
    statPlayers,
    statTeams,
    scopedTids: scopedTids as Set<number>,
    isScoped,
    season,
    phase,
    competitionIds: pbaCompetitionIds,
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
        prevSeason={prevSeason}
        nextSeason={nextSeason}
        sortedTeams={sortedTeams}
        teamFilter={teamFilter}
        setTeamFilter={setTeamFilter}
        prevTeam={prevTeam}
        nextTeam={nextTeam}
        statType={statType}
        setStatType={setStatType}
        phase={phase}
        setPhase={setPhase}
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
      />
      <PlayerStatsTable
        season={season}
        statType={statType}
        phase={phase}
        competitionLabel={pbaIsolated
          ? pbaCompetitionOptions.find(option => option.id === pbaCompetitionFilter)?.label
          : undefined}
        cupShort={labels.cupShort}
        cupChampion={labels.cupChampion}
        fourPointEnabled={fourPointEnabled}
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
        brefRowsSize={brefRows.size}
        onPlayerSelect={row => quick.openFor(row.player)}
        onTeamSelect={handleTeamSelect}
      />
      {quick.portals}
    </div>
  );
};

export default PlayerStatsView;
