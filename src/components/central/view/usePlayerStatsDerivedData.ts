import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { GameState, NBAGMStat, NBAPlayer } from '../../../types';
import { getDisplayAge } from '../../../store/playerRatingStore';
import { evaluateFilter } from '../../../utils/filterUtils';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import {
  aggregateStats,
  ComputedRow,
  dedupeStatsRows,
  fetchBrefRow,
  historicalTeamRows,
  Phase,
  SeasonMode,
  SortField,
  StatType,
  toRow,
} from './PlayerStatsShared';
import {
  buildBoxScoreShotLocMap,
  buildBoxScoreStatsByPlayer,
  buildCupStatsByPlayer,
  buildCurrentSeasonStatsByPhase,
  buildShotLocMap,
} from './playerStatsBoxScoreMaps';

interface UsePlayerStatsDerivedDataArgs {
  state: GameState;
  statPlayers: NBAPlayer[];
  statTeams: { id: number; abbrev: string }[];
  scopedTids: Set<number>;
  isScoped: boolean;
  season: SeasonMode;
  phase: Phase;
  competitionIds?: string[];
  externalStatsByPlayer?: Map<string, NBAGMStat[]>;
  statType: StatType;
  teamFilter: string;
  searchTerm: string;
  columnFilters: Record<string, string>;
  sortField: SortField;
  sortOrder: 'asc' | 'desc';
  perPage: number;
  currentPage: number;
  brefRows: Map<string, ComputedRow>;
  setBrefRows: Dispatch<SetStateAction<Map<string, ComputedRow>>>;
}

interface UsePlayerStatsDerivedDataResult {
  brefLoading: boolean;
  filteredRows: ComputedRow[];
  pageRows: ComputedRow[];
  totalPages: number;
}

export function usePlayerStatsDerivedData({
  state,
  statPlayers,
  statTeams,
  scopedTids,
  isScoped,
  season,
  phase,
  competitionIds,
  externalStatsByPlayer,
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
}: UsePlayerStatsDerivedDataArgs): UsePlayerStatsDerivedDataResult {
  const [brefLoading, setBrefLoading] = useState(false);
  const brefAttempted = useRef(new Set<string>());
  const competitionIdKey = competitionIds?.join('|') ?? '';
  const competitionIdSet = useMemo(
    () => competitionIds ? new Set(competitionIds.map(id => id.toLowerCase())) : undefined,
    [competitionIdKey],
  );

  const cupStatsByPlayer = useMemo(() => buildCupStatsByPlayer(state), [
    state.boxScores,
    state.schedule,
    state.playoffs,
    state.nbaCup,
    state.nbaCupHistory,
    state.leagueStats.year,
  ]);

  const currentSeasonStatsByPhase = useMemo(() => buildCurrentSeasonStatsByPhase(state), [
    state.boxScores,
    state.schedule,
    state.playoffs,
    state.nbaCup,
    state.nbaCupHistory,
    state.leagueStats.year,
  ]);

  const boxScoreStatsByPlayer = useMemo(
    () => competitionIdSet
      ? buildBoxScoreStatsByPlayer(state, { competitionIds: competitionIdSet, phase: phase === 'cup' ? 'regular' : phase })
      : null,
    [
      state.boxScores,
      state.schedule,
      state.playoffs,
      state.nbaCup,
      state.nbaCupHistory,
      state.leagueStats,
      competitionIdSet,
      phase,
    ],
  );

  const rows = useMemo((): ComputedRow[] => {
    const result: ComputedRow[] = [];

    const getPhaseStats = (player: NBAPlayer, targetSeason: number | null): NBAGMStat[] => {
      const allStats = dedupeStatsRows(player.stats ?? []);
      const filtered = targetSeason !== null ? allStats.filter(stat => stat.season === targetSeason) : [...allStats];
      if (phase === 'cup') {
        if (targetSeason !== null && targetSeason !== state.leagueStats.year) return [];
        const cup = cupStatsByPlayer.get(`${targetSeason ?? state.leagueStats.year}:${player.internalId}`);
        return cup ? [cup] : [];
      }
      if (targetSeason === state.leagueStats.year) {
        const currentMap =
          phase === 'regular'
            ? currentSeasonStatsByPhase.regular
            : phase === 'playoffs'
              ? currentSeasonStatsByPhase.playoffs
              : currentSeasonStatsByPhase.combined;
        const current = currentMap.get(player.internalId);
        return current ? [current] : [];
      }
      if (phase === 'regular') return filtered.filter(stat => !stat.playoffs);
      if (phase === 'playoffs') return filtered.filter(stat => stat.playoffs);
      const reg = filtered.filter(stat => !stat.playoffs);
      const poff = filtered.filter(stat => stat.playoffs);
      if (!reg.length && !poff.length) return [];
      return [aggregateStats([...reg, ...poff])];
    };

    for (const player of statPlayers) {
      if (!player.name || player.diedYear) continue;
      if (isScoped && player.tid >= 0 && !scopedTids.has(player.tid)) continue;

      const currentTeam = resolveAnyTeam(player.tid, state.teams, state.nonNBATeams ?? []);
      const currentTeamAbbrev = currentTeam?.abbrev ?? (player.tid < 0 ? 'FA' : '?');
      if (!boxScoreStatsByPlayer && teamFilter !== 'all' && player.tid > 0 && currentTeamAbbrev !== teamFilter && (season === 'career' || season === state.leagueStats.year)) {
        continue;
      }

      const age = getDisplayAge(player, state.leagueStats.year ?? new Date().getFullYear());

      if (boxScoreStatsByPlayer || externalStatsByPlayer) {
        const archiveStats = (phase === 'playoffs' ? [] : externalStatsByPlayer?.get(player.internalId) ?? []);
        const boxStats = boxScoreStatsByPlayer?.get(player.internalId) ?? [];
        const statKey = (stat: NBAGMStat) => [
          stat.season,
          stat.tid,
          stat.playoffs ? 1 : 0,
          (stat as any).competitionId ?? (stat as any)._archiveCompetitionId ?? '',
        ].join('|');
        const boxKeys = new Set(boxStats.map(statKey));
        const stats = [
          ...archiveStats.filter(stat => !boxKeys.has(statKey(stat))),
          ...boxStats,
        ];
        if (!stats.length) continue;

        if (season === 'career') {
          const filteredStats = teamFilter === 'all'
            ? stats
            : stats.filter(stat => statTeams.find(team => team.id === stat.tid)?.abbrev === teamFilter);
          if (!filteredStats.length) continue;
          const agg = aggregateStats(filteredStats);
          if (agg.gp < 1) continue;
          result.push(toRow(player, agg, statType, 'career', currentTeamAbbrev, age));
          continue;
        }

        if (season === 'all') {
          const years = new Set(stats.map(stat => stat.season));
          for (const year of years) {
            result.push(...historicalTeamRows(stats.filter(stat => stat.season === year), player, statTeams, statType, year, age, teamFilter));
          }
          continue;
        }

        result.push(...historicalTeamRows(stats.filter(stat => stat.season === season), player, statTeams, statType, season as number, age, teamFilter));
        continue;
      }

      if (season === 'career') {
        const stats = getPhaseStats(player, null);
        if (!stats.length) {
          const cached = brefRows.get(player.internalId);
          if (cached) result.push(cached);
          continue;
        }
        const agg = aggregateStats(stats);
        if (agg.gp < 1) continue;
        result.push(toRow(player, agg, statType, 'career', currentTeamAbbrev, age));
        continue;
      }

      if (season === 'all') {
        const years = new Set<number>((player.stats ?? []).map(stat => stat.season));
        for (const year of years) {
          const stats = getPhaseStats(player, year);
          if (!stats.length) continue;
          if (year === state.leagueStats.year) {
            const agg = stats.length > 1 ? aggregateStats(stats) : stats[0];
            if (agg.gp < 1) continue;
            if (teamFilter !== 'all' && currentTeamAbbrev !== teamFilter) continue;
            result.push(toRow(player, agg, statType, year, currentTeamAbbrev, age));
          } else {
            result.push(...historicalTeamRows(stats, player, statTeams, statType, year, age, teamFilter));
          }
        }
        continue;
      }

      const stats = getPhaseStats(player, season as number);
      if (!stats.length) continue;
      if (season === state.leagueStats.year) {
        const agg = stats.length > 1 ? aggregateStats(stats) : stats[0];
        if (agg.gp < 1) continue;
        if (teamFilter !== 'all' && currentTeamAbbrev !== teamFilter) continue;
        result.push(toRow(player, agg, statType, season as number, currentTeamAbbrev, age));
      } else {
        result.push(...historicalTeamRows(stats, player, statTeams, statType, season as number, age, teamFilter));
      }
    }

    return result;
  }, [
    statPlayers,
    statTeams,
    scopedTids,
    isScoped,
    state.teams,
    state.nonNBATeams,
    state.leagueStats.year,
    season,
    phase,
    statType,
    teamFilter,
    brefRows,
    cupStatsByPlayer,
    currentSeasonStatsByPhase,
    boxScoreStatsByPlayer,
    externalStatsByPlayer,
  ]);

  useEffect(() => {
    if (season !== 'career' || isScoped) return;
    const toFetch = statPlayers
      .filter(
        player =>
          player.name &&
          !player.diedYear &&
          (player.hof || player.status === 'Retired') &&
          (!player.stats || player.stats.filter(stat => !stat.playoffs && stat.gp > 0).length === 0) &&
          !brefAttempted.current.has(player.internalId),
      )
      .slice(0, 10);
    if (!toFetch.length) return;

    toFetch.forEach(player => brefAttempted.current.add(player.internalId));
    setBrefLoading(true);
    Promise.allSettled(toFetch.map(player => fetchBrefRow(player))).then(results => {
      const newMap = new Map(brefRows);
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          newMap.set(toFetch[index].internalId, result.value);
        }
      });
      setBrefRows(newMap);
      setBrefLoading(false);
    });
  }, [season, statPlayers, isScoped]); // eslint-disable-line react-hooks/exhaustive-deps

  const shotLocMap = useMemo(() => competitionIdSet
    ? buildBoxScoreShotLocMap(state, statType, season, phase === 'cup' ? 'regular' : phase, competitionIdSet)
    : buildShotLocMap(state.boxScores, statType, season, phase), [
    state,
    state.boxScores,
    statType,
    season,
    phase,
    competitionIdSet,
  ]);

  const enrichedRows = useMemo((): ComputedRow[] => {
    if (statType !== 'shotLocations') return rows;
    return rows.map(row => {
      const slKey = season === 'all' ? `${row.player.internalId}_${row.season}` : row.player.internalId;
      const sl = shotLocMap.get(slKey);
      if (!sl) return row;
      return {
        ...row,
        rimFgm: sl.rimFgm,
        rimFga: sl.rimFga,
        rimFgPct: sl.rimFga > 0 ? sl.rimFgm / sl.rimFga : 0,
        lpFgm: sl.lpFgm,
        lpFga: sl.lpFga,
        lpFgPct: sl.lpFga > 0 ? sl.lpFgm / sl.lpFga : 0,
        mrFgm: sl.mrFgm,
        mrFga: sl.mrFga,
        mrFgPct: sl.mrFga > 0 ? sl.mrFgm / sl.mrFga : 0,
        slTpm: sl.tpFgm,
        slTpa: sl.tpFga,
        slTpPct: sl.tpFga > 0 ? sl.tpFgm / sl.tpFga : 0,
        ba: sl.ba,
        dd: sl.dd,
        td: sl.td,
        qd: sl.qd,
        fiveX5: sl.fiveX5,
        dunks: sl.dunks,
        techs: sl.techs,
        pip: sl.pip,
      };
    });
  }, [rows, shotLocMap, statType, season]);

  const filteredRows = useMemo(() => {
    let data = enrichedRows;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(
        row =>
          row.player.name.toLowerCase().includes(term) ||
          (row.player.pos ?? '').toLowerCase().includes(term) ||
          row.teamAbbrev.toLowerCase().includes(term),
      );
    }

    if (Object.values(columnFilters).some(Boolean)) {
      data = data.filter(row => {
        for (const [col, filter] of Object.entries(columnFilters)) {
          if (!filter) continue;
          let value: string | number = '';
          if (col === 'name') value = row.player.name;
          else if (col === 'pos') value = row.player.pos ?? '';
          else if (col === 'team') value = row.teamAbbrev;
          else value = (row as any)[col] ?? 0;
          if (!evaluateFilter(String(value), filter)) return false;
        }
        return true;
      });
    }

    return [...data].sort((a, b) => {
      let av: number | string = (a as any)[sortField] ?? 0;
      let bv: number | string = (b as any)[sortField] ?? 0;
      if (sortField === 'name') {
        av = a.player.name;
        bv = b.player.name;
      }
      if (sortField === 'pos') {
        av = a.player.pos ?? '';
        bv = b.player.pos ?? '';
      }
      if (sortField === 'team') {
        av = a.teamAbbrev;
        bv = b.teamAbbrev;
      }
      if (av < bv) return sortOrder === 'asc' ? -1 : 1;
      if (av > bv) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [enrichedRows, searchTerm, columnFilters, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredRows.length / perPage);
  const pageRows = filteredRows.slice((currentPage - 1) * perPage, currentPage * perPage);

  useEffect(() => {
    (window as any).__nbaPlayerStatsDebugRows = {
      context: { season, phase, competitionIds, statType, teamFilter, searchTerm, sortField, sortOrder },
      rows: filteredRows.map(row => {
        const rating = row.player.ratings?.[row.player.ratings.length - 1] ?? {};
        return {
          name: row.player.name,
          team: row.teamAbbrev,
          pos: row.player.pos ?? '',
          age: row.age,
          ratingTp: rating.tp ?? '',
          ratingFg: rating.fg ?? '',
          ratingFt: rating.ft ?? '',
          ratingIns: rating.ins ?? '',
          ratingDnk: rating.dnk ?? '',
          ratingHgt: rating.hgt ?? '',
          ratingOiq: rating.oiq ?? '',
          ratingDrb: rating.drb ?? '',
          gp: row.gp,
          mpg: row.min,
          tpm: row.tp,
          tpa: row.tpa,
          tpPct: row.tpPct,
          fga: row.fga,
          threePAr: row.threePAr,
          pts: row.pts,
        };
      }),
    };
  }, [filteredRows, season, phase, competitionIdKey, statType, teamFilter, searchTerm, sortField, sortOrder]);

  return { brefLoading, filteredRows, pageRows, totalPages };
}
