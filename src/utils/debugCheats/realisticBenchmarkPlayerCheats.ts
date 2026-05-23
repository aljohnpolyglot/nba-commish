import type { GameState } from '../../types';
import { copyTextToClipboard, type CheatResult } from './shared';

const BENCHMARK_DIST = {
  ppg:  { mean: 12.6, median: 10.8, p25: 7.5,  p75: 18.2, p10: 4.5,  p90: 26.4 },
  fga:  { mean: 9.7,  median: 8.5,  p25: 6.2,  p75: 14.5, p10: 3.8,  p90: 20.2 },
  ts:   { mean: 0.582, median: 0.578, p25: 0.545, p75: 0.615, p10: 0.510, p90: 0.660 },
  // PER and USG% from benchmark left out — we'd need to recompute PER per-player here;
  // the existing PERSAMPLE / DISTSHAPE cheats already cover that path.
};

// Benchmark Part 6 — positional averages
const BENCHMARK_POS = {
  PG: { ppg: 12.2, rpg: 3.1, apg: 4.3, bpg: 0.3, spg: 1.0, fga: 9.7, threePa: 4.4, ftPct: 0.817 },
  SG: { ppg:  9.8, rpg: 2.9, apg: 2.3, bpg: 0.3, spg: 0.8, fga: 7.8, threePa: 3.8, ftPct: 0.818 },
  SF: { ppg: 11.7, rpg: 4.0, apg: 2.2, bpg: 0.4, spg: 0.8, fga: 9.1, threePa: 3.8, ftPct: 0.797 },
  PF: { ppg: 10.3, rpg: 4.4, apg: 1.9, bpg: 0.5, spg: 0.7, fga: 7.8, threePa: 3.2, ftPct: 0.751 },
  C:  { ppg:  9.8, rpg: 6.3, apg: 1.8, bpg: 0.9, spg: 0.6, fga: 7.0, threePa: 1.7, ftPct: 0.724 },
};

export async function runPlayerBench(state: GameState): Promise<CheatResult> {
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats);
  });

  if (boxes.length < 10) {
    return { title: 'PLAYERBENCH', body: `Only ${boxes.length} NBA box scores — sim a few more days first.`, ok: false };
  }

  // Build position lookup once
  const posById = new Map<string, string>();
  (state.players ?? []).forEach((p: any) => {
    if (p.internalId) posById.set(p.internalId, (p.pos ?? '').toString().toUpperCase());
  });

  // Aggregate per-player totals across all team-games
  type Agg = {
    name: string; pos: string;
    gp: number; min: number;
    pts: number; fga: number; fgm: number; threePa: number; threePm: number;
    fta: number; ftm: number; ast: number; reb: number; orb: number; drb: number;
    stl: number; blk: number; tov: number; pf: number;
  };
  const byId = new Map<string, Agg>();

  const ingest = (lines: any[]) => {
    for (const ps of lines) {
      const id = ps.playerId ?? ps.internalId;
      if (!id) continue;
      let a = byId.get(id);
      if (!a) {
        a = {
          name: ps.name ?? id, pos: posById.get(id) ?? '',
          gp: 0, min: 0, pts: 0, fga: 0, fgm: 0, threePa: 0, threePm: 0,
          fta: 0, ftm: 0, ast: 0, reb: 0, orb: 0, drb: 0,
          stl: 0, blk: 0, tov: 0, pf: 0,
        };
        byId.set(id, a);
      }
      const min = ps.min || 0;
      if (min <= 0) continue; // DNPs don't count toward GP
      a.gp += 1;
      a.min += min;
      a.pts += ps.pts || 0;
      a.fga += ps.fga || 0; a.fgm += ps.fgm || 0;
      a.threePa += ps.threePa || 0; a.threePm += ps.threePm || 0;
      a.fta += ps.fta || 0; a.ftm += ps.ftm || 0;
      a.ast += ps.ast || 0;
      a.orb += ps.orb || 0; a.drb += ps.drb || 0;
      a.reb += (ps.reb ?? ((ps.orb || 0) + (ps.drb || 0)));
      a.stl += ps.stl || 0; a.blk += ps.blk || 0;
      a.tov += ps.tov || 0; a.pf += ps.pf || 0;
    }
  };
  for (const g of boxes as any[]) {
    ingest(g.homeStats); ingest(g.awayStats);
  }

  // Adaptive GP threshold — early in the season we don't have ≥20 GP per
  // player yet, so back off proportionally to the league progress. Floor at 5
  // so individual blowouts don't dominate the percentile bands.
  const maxGp = Math.max(...Array.from(byId.values(), a => a.gp), 0);
  const gpThreshold = Math.max(5, Math.min(20, Math.floor(maxGp * 0.5)));
  const qualifying = Array.from(byId.values()).filter(a => a.gp >= gpThreshold);

  if (qualifying.length === 0) {
    return { title: 'PLAYERBENCH', body: `No players with ≥${gpThreshold} GP yet — keep simming.`, ok: false };
  }

  const perGame = (a: Agg, k: keyof Agg) => a.gp > 0 ? (a[k] as number) / a.gp : 0;
  const tsCalc = (a: Agg) => {
    const denom = 2 * (a.fga + 0.44 * a.fta);
    return denom > 0 ? a.pts / denom : 0;
  };

  const ppgs = qualifying.map(a => perGame(a, 'pts')).sort((x, y) => x - y);
  const fgas = qualifying.map(a => perGame(a, 'fga')).sort((x, y) => x - y);
  const tss  = qualifying.map(a => tsCalc(a)).sort((x, y) => x - y);

  const pct = (arr: number[], q: number) => {
    if (arr.length === 0) return 0;
    const idx = Math.max(0, Math.min(arr.length - 1, Math.floor(q * (arr.length - 1))));
    return arr[idx];
  };
  const mean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const distRow = (label: string, arr: number[], bench: { mean: number; median: number; p25: number; p75: number; p10: number; p90: number }, kind: 'count' | 'pct') => {
    const fmt = kind === 'pct' ? (n: number) => (n * 100).toFixed(1) + '%' : (n: number) => n.toFixed(2);
    return {
      metric: label,
      simMean:   fmt(mean(arr)),     benchMean:   fmt(bench.mean),
      simMedian: fmt(pct(arr, 0.5)), benchMedian: fmt(bench.median),
      simP25:    fmt(pct(arr, 0.25)),benchP25:    fmt(bench.p25),
      simP75:    fmt(pct(arr, 0.75)),benchP75:    fmt(bench.p75),
      simP10:    fmt(pct(arr, 0.10)),benchP10:    fmt(bench.p10),
      simP90:    fmt(pct(arr, 0.90)),benchP90:    fmt(bench.p90),
    };
  };

  const distRows = [
    distRow('PPG',    ppgs, BENCHMARK_DIST.ppg, 'count'),
    distRow('FGA/G',  fgas, BENCHMARK_DIST.fga, 'count'),
    distRow('TS%',    tss,  BENCHMARK_DIST.ts,  'pct'),
  ];

  // Positional averages
  const posBuckets: Record<string, Agg[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
  qualifying.forEach(a => {
    const key = a.pos.toUpperCase();
    if (posBuckets[key]) posBuckets[key].push(a);
  });
  const posRows = (Object.keys(BENCHMARK_POS) as (keyof typeof BENCHMARK_POS)[]).map(pos => {
    const players = posBuckets[pos] ?? [];
    const avg = (k: keyof Agg) => players.length ? mean(players.map(p => perGame(p, k))) : 0;
    const pctAvg = (num: keyof Agg, den: keyof Agg) => {
      const sumNum = players.reduce((s, p) => s + (p[num] as number), 0);
      const sumDen = players.reduce((s, p) => s + (p[den] as number), 0);
      return sumDen > 0 ? sumNum / sumDen : 0;
    };
    const b = BENCHMARK_POS[pos];
    const flag = (sim: number, bench: number) => Math.abs(sim - bench) / Math.max(0.01, bench) > 0.15 ? '⚠️' : Math.abs(sim - bench) / Math.max(0.01, bench) > 0.08 ? '·' : '✓';
    return {
      pos, n: players.length,
      ppg:     `${avg('pts').toFixed(1)} (${b.ppg}) ${flag(avg('pts'), b.ppg)}`,
      rpg:     `${avg('reb').toFixed(1)} (${b.rpg}) ${flag(avg('reb'), b.rpg)}`,
      apg:     `${avg('ast').toFixed(1)} (${b.apg}) ${flag(avg('ast'), b.apg)}`,
      bpg:     `${avg('blk').toFixed(1)} (${b.bpg}) ${flag(avg('blk'), b.bpg)}`,
      spg:     `${avg('stl').toFixed(1)} (${b.spg}) ${flag(avg('stl'), b.spg)}`,
      fga:     `${avg('fga').toFixed(1)} (${b.fga}) ${flag(avg('fga'), b.fga)}`,
      threePa: `${avg('threePa').toFixed(1)} (${b.threePa}) ${flag(avg('threePa'), b.threePa)}`,
      ftPct:   `${(pctAvg('ftm', 'fta') * 100).toFixed(1)}% (${(b.ftPct * 100).toFixed(1)}%)`,
    };
  });

  // TSV for clipboard
  const tsv = [
    'DISTRIBUTION (qualifying ≥20 GP)',
    ['metric','simMean','benchMean','simMedian','benchMedian','simP25','benchP25','simP75','benchP75','simP10','benchP10','simP90','benchP90'].join('\t'),
    ...distRows.map(r => [r.metric, r.simMean, r.benchMean, r.simMedian, r.benchMedian, r.simP25, r.benchP25, r.simP75, r.benchP75, r.simP10, r.benchP10, r.simP90, r.benchP90].join('\t')),
    '',
    'POSITIONAL AVERAGES (sim vs benchmark)',
    ['pos','n','ppg','rpg','apg','bpg','spg','fga','3PA','FT%'].join('\t'),
    ...posRows.map(r => [r.pos, r.n, r.ppg, r.rpg, r.apg, r.bpg, r.spg, r.fga, r.threePa, r.ftPct].join('\t')),
  ].join('\n');

  console.group(`👤 PLAYERBENCH — ${boxes.length} games, ${qualifying.length} qualifying players (≥${gpThreshold} GP)`);
  console.log('Distribution shape (sim vs benchmark):');
  console.table(distRows);
  console.log('Positional averages (sim (bench) flag):');
  console.table(posRows);
  console.log('TSV (copy to Sheets):\n' + tsv);
  console.groupEnd();

  await copyTextToClipboard(tsv).catch(() => undefined);

  return {
    title: 'PLAYERBENCH done',
    body: `${qualifying.length} qualifying players. Distribution + positional averages logged. TSV copied to clipboard.`,
    ok: true,
  };
}

// 2026SimBenchmark.md Part 3 — Top 10 leaders (per game, min 20 GP)

