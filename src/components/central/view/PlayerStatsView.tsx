import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';
import { getOwnTeamId } from '../../../utils/helpers';
import { isFourPointEnabled } from '../../../utils/ruleFlags';
import { matchCheat, triggerCheat } from '../../../utils/debugCheats';
import { useHubScope } from '../../../hooks/useHubScope';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { PlayerStatsControls } from './PlayerStatsControls';
import { PlayerStatsTable } from './PlayerStatsTable';
import { ComputedRow, Phase, SeasonMode, SortField, StatType } from './PlayerStatsShared';
import { usePlayerStatsDerivedData } from './usePlayerStatsDerivedData';

interface PlayerStatsViewProps {
  initialTeamFilter?: string;
}

export const PlayerStatsView: React.FC<PlayerStatsViewProps> = ({ initialTeamFilter }) => {
  const { state, dispatchAction, navigateToTeam, pendingStatSort, setPendingStatSort } = useGame();
  const ownTid = getOwnTeamId(state);
  const { teams: scopedTeams, tids: scopedTids, players: scopedPlayers, isScoped, euroIsolated } = useHubScope();
  const labels = useLeagueLabels();
  const statPlayers = isScoped ? scopedPlayers : state.players;
  const statTeams = isScoped ? scopedTeams : state.teams;
  const fourPointEnabled = isFourPointEnabled(state.leagueStats);
  const quick = usePlayerQuickActions();
  const [statType, setStatType] = useState<StatType>('perGame');
  const [phase, setPhase] = useState<Phase>('regular');
  const [teamFilter, setTeamFilter] = useState<string>(initialTeamFilter ?? 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('pts');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [brefRows, setBrefRows] = useState<Map<string, ComputedRow>>(new Map());

  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    statPlayers.forEach(player => {
      player.stats?.forEach(stat => {
        if (stat.gp > 0) seasons.add(stat.season);
      });
    });
    return Array.from(seasons).sort((a, b) => b - a);
  }, [statPlayers]);

  const [season, setSeason] = useState<SeasonMode>(() => availableSeasons[0] ?? state.leagueStats.year);

  useEffect(() => {
    if (!pendingStatSort || pendingStatSort.type !== 'player') return;
    setSortField(pendingStatSort.field as SortField);
    setSortOrder(pendingStatSort.order);
    const advFields: SortField[] = ['per', 'tsPct', 'efgPctA', 'usgPct', 'ortg', 'drtg', 'bpm', 'ws', 'vorp'];
    if (advFields.includes(pendingStatSort.field as SortField)) setStatType('advanced');
    setPendingStatSort(null);
  }, [pendingStatSort, setPendingStatSort]);

  useEffect(() => {
    setCurrentPage(1);
  }, [season, phase, statType, teamFilter, searchTerm, sortField, sortOrder]);

  useEffect(() => {
    if (euroIsolated && phase === 'cup') setPhase('regular');
  }, [euroIsolated, phase]);

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
        perPage={perPage}
        setPerPage={handlePerPageChange}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        handleSearchKeyDown={handleSearchKeyDown}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        brefLoading={brefLoading}
        euroIsolated={euroIsolated}
        cupShort={labels.cupShort}
      />
      <PlayerStatsTable
        season={season}
        statType={statType}
        phase={phase}
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
