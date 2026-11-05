import type { GameResult, PlayerGameStats } from './types';

export interface BenchmarkTeamRow {
  pts: number;
  fga: number;
  fgm: number;
  threePa: number;
  threePm: number;
  fta: number;
  ftm: number;
  ast: number;
  reb: number;
  orb: number;
  drb: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
}

export interface BenchmarkLeagueAverages extends BenchmarkTeamRow {
  fgPct: number;
  threePct: number;
  ftPct: number;
  pace: number;
  teamGames: number;
}

const sumStat = (lines: PlayerGameStats[], key: keyof PlayerGameStats): number =>
  lines.reduce((sum, player) => sum + Number(player[key] ?? 0), 0);

export function gameTeamRows(game: Pick<GameResult, 'homeStats' | 'awayStats' | 'homeScore' | 'awayScore'>): BenchmarkTeamRow[] {
  return [
    teamRow(game.homeStats, game.homeScore),
    teamRow(game.awayStats, game.awayScore),
  ];
}

export function teamRow(lines: PlayerGameStats[], score: number): BenchmarkTeamRow {
  return {
    pts: score,
    fga: sumStat(lines, 'fga'),
    fgm: sumStat(lines, 'fgm'),
    threePa: sumStat(lines, 'threePa'),
    threePm: sumStat(lines, 'threePm'),
    fta: sumStat(lines, 'fta'),
    ftm: sumStat(lines, 'ftm'),
    ast: sumStat(lines, 'ast'),
    reb: sumStat(lines, 'reb'),
    orb: sumStat(lines, 'orb'),
    drb: sumStat(lines, 'drb'),
    stl: sumStat(lines, 'stl'),
    blk: sumStat(lines, 'blk'),
    tov: sumStat(lines, 'tov'),
    pf: sumStat(lines, 'pf'),
  };
}

export function aggregateBenchmarkGames(games: Array<Pick<GameResult, 'homeStats' | 'awayStats' | 'homeScore' | 'awayScore'>>): BenchmarkLeagueAverages {
  const rows = games.flatMap(gameTeamRows);
  if (rows.length === 0) throw new Error('Historical simulator benchmark produced no team-games');
  const totals = rows.reduce<BenchmarkTeamRow>((sum, row) => {
    for (const key of Object.keys(row) as Array<keyof BenchmarkTeamRow>) sum[key] += row[key];
    return sum;
  }, { pts: 0, fga: 0, fgm: 0, threePa: 0, threePm: 0, fta: 0, ftm: 0, ast: 0, reb: 0, orb: 0, drb: 0, stl: 0, blk: 0, tov: 0, pf: 0 });
  const teamGames = rows.length;
  const average = Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, value / teamGames]),
  ) as unknown as BenchmarkTeamRow;
  return {
    ...average,
    fgPct: totals.fga > 0 ? totals.fgm / totals.fga : 0,
    threePct: totals.threePa > 0 ? totals.threePm / totals.threePa : 0,
    ftPct: totals.fta > 0 ? totals.ftm / totals.fta : 0,
    pace: average.fga - average.orb + average.tov + 0.44 * average.fta,
    teamGames,
  };
}
