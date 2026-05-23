import type { GameState } from '../../types';
import { copyTextToClipboard, type CheatResult } from './shared';

const BENCHMARK_2026 = {
  ppg: 115.6, fga: 89.1, fgm: 42.0, fgPct: 0.471,
  threePa: 37.0, threePm: 13.3, threePct: 0.360,
  fta: 23.5, ftm: 18.4, ftPct: 0.783,
  eFG: 0.546, ts: 0.582,
  ast: 26.7, reb: 43.8, orb: 11.4, drb: 32.4,
  stl: 8.4, blk: 4.8, tov: 14.5, pf: 19.9,
  pace: 98.2,
};

export async function runSimBench(state: GameState): Promise<CheatResult> {
  // Aggregate per-team-game stats from already-simulated boxScores and compare
  // to the 2026SimBenchmark.md targets. Uses the same NBA-only filter as
  // TeamStatsView / runScoreProf so non-NBA leagues don't pollute the average.

  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats) &&
           g.homeStats.length > 0 && g.awayStats.length > 0;
  });

  if (boxes.length < 10) {
    return { title: 'SIMBENCH', body: `Only ${boxes.length} NBA box scores — sim a few more days first.`, ok: false };
  }

  const teamRows: any[] = [];
  for (const g of boxes as any[]) {
    teamRows.push(toTeamRow(g.homeStats, g.homeScore));
    teamRows.push(toTeamRow(g.awayStats, g.awayScore));
  }

  const sum = teamRows.reduce((s, r) => {
    Object.keys(r).forEach(k => { s[k] = (s[k] ?? 0) + r[k]; });
    return s;
  }, {} as any);
  const n = teamRows.length;
  const avg = (k: string) => sum[k] / n;

  const fgPct    = sum.fga > 0 ? sum.fgm / sum.fga : 0;
  const threePct = sum.threePa > 0 ? sum.threePm / sum.threePa : 0;
  const ftPct    = sum.fta > 0 ? sum.ftm / sum.fta : 0;
  const eFG      = sum.fga > 0 ? (sum.fgm + 0.5 * sum.threePm) / sum.fga : 0;
  const ts       = (sum.fga + 0.44 * sum.fta) > 0
    ? sum.pts / (2 * (sum.fga + 0.44 * sum.fta)) : 0;
  // Pace ≈ FGA - ORB + TOV + 0.44·FTA per team-game (NBA convention, 48-min games)
  const pace = avg('fga') - avg('orb') + avg('tov') + 0.44 * avg('fta');

  const rows = [
    row('PPG',  avg('pts'),     BENCHMARK_2026.ppg,     'count'),
    row('FGA',  avg('fga'),     BENCHMARK_2026.fga,     'count'),
    row('FGM',  avg('fgm'),     BENCHMARK_2026.fgm,     'count'),
    row('FG%',  fgPct,          BENCHMARK_2026.fgPct,   'pct'),
    row('3PA',  avg('threePa'), BENCHMARK_2026.threePa, 'count'),
    row('3PM',  avg('threePm'), BENCHMARK_2026.threePm, 'count'),
    row('3P%',  threePct,       BENCHMARK_2026.threePct,'pct'),
    row('FTA',  avg('fta'),     BENCHMARK_2026.fta,     'count'),
    row('FTM',  avg('ftm'),     BENCHMARK_2026.ftm,     'count'),
    row('FT%',  ftPct,          BENCHMARK_2026.ftPct,   'pct'),
    row('eFG%', eFG,            BENCHMARK_2026.eFG,     'pct'),
    row('TS%',  ts,             BENCHMARK_2026.ts,      'pct'),
    row('AST',  avg('ast'),     BENCHMARK_2026.ast,     'count'),
    row('REB',  avg('reb'),     BENCHMARK_2026.reb,     'count'),
    row('ORB',  avg('orb'),     BENCHMARK_2026.orb,     'count'),
    row('DRB',  avg('drb'),     BENCHMARK_2026.drb,     'count'),
    row('STL',  avg('stl'),     BENCHMARK_2026.stl,     'count'),
    row('BLK',  avg('blk'),     BENCHMARK_2026.blk,     'count'),
    row('TOV',  avg('tov'),     BENCHMARK_2026.tov,     'count'),
    row('PF',   avg('pf'),      BENCHMARK_2026.pf,      'count'),
    row('PACE', pace,           BENCHMARK_2026.pace,    'count'),
  ];

  // TSV for clipboard / Sheets
  const tsv = [
    ['metric', 'sim', 'target', 'delta', 'delta%', 'flag'].join('\t'),
    ...rows.map(r => [r.metric, r.sim, r.target, r.delta, r.deltaPct, r.flag].join('\t')),
  ].join('\n');

  console.group(`🏀 SIMBENCH — ${boxes.length} games, ${n} team-rows`);
  console.table(rows);
  console.log('TSV (copy to Sheets):\n' + tsv);
  console.groupEnd();

  await copyTextToClipboard(tsv).catch(() => undefined);

  const offTargets = rows.filter(r => Math.abs(parseFloat(r.deltaPct)) > 5);
  return {
    title: 'SIMBENCH done',
    body: `${boxes.length} games, ${n} team-rows. ${offTargets.length} metrics off by >5%. TSV copied to clipboard.`,
    ok: true,
  };
}

function toTeamRow(lines: any[], score: number) {
  const sum = (k: string) => lines.reduce((s, p) => s + (p[k] ?? 0), 0);
  return {
    pts: score,
    fga: sum('fga'), fgm: sum('fgm'),
    threePa: sum('threePa'), threePm: sum('threePm'),
    fta: sum('fta'), ftm: sum('ftm'),
    ast: sum('ast'),
    reb: sum('reb'), orb: sum('orb'), drb: sum('drb'),
    stl: sum('stl'), blk: sum('blk'),
    tov: sum('tov'), pf: sum('pf'),
  };
}

function row(metric: string, sim: number, target: number, kind: 'count' | 'pct') {
  const delta = sim - target;
  const deltaPct = target !== 0 ? (delta / target) * 100 : 0;
  return {
    metric,
    sim:        kind === 'pct' ? (sim * 100).toFixed(1) + '%'        : sim.toFixed(2),
    target:     kind === 'pct' ? (target * 100).toFixed(1) + '%'      : target.toFixed(2),
    delta:      kind === 'pct' ? ((delta * 100)).toFixed(1) + 'pp'   : delta.toFixed(2),
    deltaPct:   deltaPct.toFixed(1) + '%',
    flag:       Math.abs(deltaPct) > 10 ? '⚠️' : Math.abs(deltaPct) > 5 ? '·' : '✓',
  };
}

// Benchmark Part 5 — distribution shape (qualifying players, ≥20 GP)

