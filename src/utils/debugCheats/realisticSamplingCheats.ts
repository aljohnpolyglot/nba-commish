import type { GameState } from '../../types';
import { copyTextToClipboard, type CheatResult } from './shared';

export async function runSample12(state: GameState): Promise<CheatResult> {
  const TARGET_GAMES = 24;
  const STRATA = { low: 6, mid: 10, high: 6, blowout: 1, ot: 1 };

  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity) return false;
    if (g.isPreseason) return false;
    if (!Array.isArray(g.homeStats) || !Array.isArray(g.awayStats)) return false;
    if (g.homeStats.length === 0 || g.awayStats.length === 0) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return true;
  });

  if (boxes.length < TARGET_GAMES) {
    return { title: 'SAMPLE12', body: `Only ${boxes.length} regular box scores available — need ≥${TARGET_GAMES}. Sim more games first.`, ok: false };
  }

  const tagged = boxes.map((g: any) => {
    const total = (g.homeScore ?? 0) + (g.awayScore ?? 0);
    const margin = Math.abs((g.homeScore ?? 0) - (g.awayScore ?? 0));
    return {
      game: g,
      total,
      margin,
      isOT: !!g.isOT,
      bucket:
        total < 205 ? 'LOW'  :
        total < 235 ? 'MID'  :
                      'HIGH',
    };
  });

  const sortRecent = (a: any, b: any) => String(b.game.date).localeCompare(String(a.game.date));
  const lows  = tagged.filter(t => t.bucket === 'LOW').sort(sortRecent);
  const mids  = tagged.filter(t => t.bucket === 'MID').sort(sortRecent);
  const highs = tagged.filter(t => t.bucket === 'HIGH').sort(sortRecent);
  const blow  = tagged.filter(t => t.margin >= 25).sort(sortRecent);
  const ots   = tagged.filter(t => t.isOT).sort(sortRecent);

  const picked = new Set<number>();
  const take = (pool: any[], n: number) => {
    const out: any[] = [];
    for (const t of pool) {
      if (out.length >= n) break;
      if (picked.has(t.game.gameId)) continue;
      picked.add(t.game.gameId);
      out.push(t);
    }
    return out;
  };

  const sample = [
    ...take(lows,  STRATA.low),
    ...take(mids,  STRATA.mid),
    ...take(highs, STRATA.high),
    ...take(blow,  STRATA.blowout),
    ...take(ots,   STRATA.ot),
  ];

  if (sample.length < TARGET_GAMES) {
    const remaining = tagged.filter(t => !picked.has(t.game.gameId)).sort(sortRecent);
    for (const t of remaining) {
      if (sample.length >= TARGET_GAMES) break;
      picked.add(t.game.gameId);
      sample.push(t);
    }
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  type Row = {
    date: string; matchup: string; team: string; bucket: string; ot: string;
    pts: number; fga: number; fgm: number; fgPct: number;
    threePm: number; threePa: number;
    ftm: number; fta: number;
    ast: number; orb: number; tov: number;
    eFG: number; AR: number; FTrate: number;
  };

  const rowsRaw: Row[] = [];
  const buildRow = (g: any, lines: any[], teamTid: number, oppTid: number, score: number, bucket: string): Row => {
    const sum = (k: string) => lines.reduce((s, p) => s + (p[k] ?? 0), 0);
    const fga = sum('fga'), fgm = sum('fgm');
    const t3a = sum('threePa'), t3m = sum('threePm');
    const fta = sum('fta'), ftm = sum('ftm');
    const ast = sum('ast'), orb = sum('orb'), tov = sum('tov');
    return {
      date: String(g.date).slice(0, 10),
      matchup: `${abbrev(teamTid)} vs ${abbrev(oppTid)}`,
      team: abbrev(teamTid),
      bucket,
      ot: g.isOT ? `OT${g.otCount ?? 1}` : '—',
      pts: score, fga, fgm, fgPct: fga > 0 ? +(fgm / fga * 100).toFixed(1) : 0,
      threePm: t3m, threePa: t3a,
      ftm, fta,
      ast, orb, tov,
      eFG: fga > 0 ? +(((fgm + 0.5 * t3m) / fga) * 100).toFixed(1) : 0,
      AR:  fgm > 0 ? +(ast / fgm).toFixed(3) : 0,
      FTrate: fga > 0 ? +(fta / fga).toFixed(3) : 0,
    };
  };

  for (const t of sample) {
    const g = t.game;
    rowsRaw.push(buildRow(g, g.homeStats, g.homeTeamId, g.awayTeamId, g.homeScore, t.bucket));
    rowsRaw.push(buildRow(g, g.awayStats, g.awayTeamId, g.homeTeamId, g.awayScore, t.bucket));
  }

  const pearson = (xs: number[], ys: number[]) => {
    const n = xs.length;
    if (n < 2) return 0;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx, b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return dx > 0 && dy > 0 ? +(num / Math.sqrt(dx * dy)).toFixed(3) : 0;
  };
  const mean   = (xs: number[]) => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 0;
  const stdev  = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
    return +Math.sqrt(v).toFixed(2);
  };
  const minMax = (xs: number[]) => xs.length ? `${Math.min(...xs).toFixed(0)}–${Math.max(...xs).toFixed(0)}` : '—';

  const ptsArr = rowsRaw.map(r => r.pts);
  const fgaArr = rowsRaw.map(r => r.fga);
  const efgArr = rowsRaw.map(r => r.eFG);
  const fgpArr = rowsRaw.map(r => r.fgPct);
  const arArr  = rowsRaw.map(r => r.AR);
  const astArr = rowsRaw.map(r => r.ast);
  const ftrArr = rowsRaw.map(r => r.FTrate);

  const corrPtsEFG = pearson(ptsArr, efgArr);
  const corrPtsFGA = pearson(ptsArr, fgaArr);
  const corrARFGP  = pearson(arArr, fgpArr);
  const corrEFGFGA = pearson(efgArr, fgaArr);

  const summary = {
    'Pearson(pts, eFG%)':    `${corrPtsEFG}  (NBA expect ≥0.70 → high score should track high efficiency)`,
    'Pearson(pts, FGA)':     `${corrPtsFGA}  (NBA expect ~0.30 — pts driven by efficiency, not volume)`,
    'Pearson(AR, FG%)':      `${corrARFGP}  (NBA expect mildly +; brick-fests should have lower AR)`,
    'Pearson(eFG%, FGA)':    `${corrEFGFGA}  (NBA expect ~0 or slightly negative)`,
    'pts mean / σ / range':  `${mean(ptsArr)} / ${stdev(ptsArr)} / ${minMax(ptsArr)}  (NBA: ~114 / ~12 / 90–135)`,
    'FGA mean / σ / range':  `${mean(fgaArr)} / ${stdev(fgaArr)} / ${minMax(fgaArr)}  (NBA: ~89 / ~5 / 78–100)`,
    'eFG% mean / σ':         `${mean(efgArr)} / ${stdev(efgArr)}  (NBA: ~53.5 / ~4)`,
    'AR mean / range':       `${mean(arArr)} / ${minMax(arArr.map(x => x * 100))}  (NBA: ~0.58 / 50–65)`,
    'AST mean / σ':          `${mean(astArr)} / ${stdev(astArr)}  (NBA: ~26 / ~4)`,
    'FTrate mean / σ':       `${mean(ftrArr)} / ${stdev(ftrArr)}  (NBA: ~0.24 / ~0.05)`,
  };

  const flags: string[] = [];
  if (corrPtsEFG < 0.55) flags.push(`🔴 pts↔eFG% corr ${corrPtsEFG} < 0.55 → score-roll & profile-roll decoupled (the "131 on 39%" / "99 on 56%" bug)`);
  if (corrPtsFGA > 0.60) flags.push(`🟡 pts↔FGA corr ${corrPtsFGA} > 0.60 → pts driven by volume not efficiency (real NBA: ~0.30)`);
  if (corrARFGP < 0.05)  flags.push(`🟡 AR↔FG% corr ${corrARFGP} ≈ 0 → assists not coupled to makes (brick-fest still gets full assists)`);
  const fgaSpread = Math.max(...fgaArr) - Math.min(...fgaArr);
  if (fgaSpread > 30)    flags.push(`🟡 FGA spread ${fgaSpread} > 30 → volume too volatile (real NBA: ~22)`);
  const arMean = arArr.reduce((a, b) => a + b, 0) / arArr.length;
  if (arMean > 0.64)     flags.push(`🟡 AR mean ${arMean.toFixed(3)} > 0.64 → league-wide assist inflation (real NBA: ~0.58)`);

  const cols: (keyof Row)[] = ['date', 'matchup', 'team', 'bucket', 'ot', 'pts', 'fga', 'fgm', 'fgPct', 'eFG', 'threePm', 'threePa', 'ftm', 'fta', 'FTrate', 'ast', 'AR', 'orb', 'tov'];
  const lines: string[] = [];
  lines.push(`SAMPLE12 — sim realism audit`);
  lines.push(`Sampled ${sample.length} games / ${rowsRaw.length} team-rows from ${boxes.length} available box scores.`);
  lines.push(`Strata: ${STRATA.low} low / ${STRATA.mid} mid / ${STRATA.high} high / ${STRATA.blowout} blowout / ${STRATA.ot} OT (backfill if empty).`);
  lines.push('');
  lines.push('=== ROWS ===');
  lines.push(cols.join('\t'));
  rowsRaw.forEach(r => lines.push(cols.map(c => r[c]).join('\t')));
  lines.push('');
  lines.push('=== SUMMARY ===');
  lines.push('METRIC\tVALUE\tNBA_EXPECT');
  lines.push(`Pearson(pts,eFG%)\t${corrPtsEFG}\t>=0.70`);
  lines.push(`Pearson(pts,FGA)\t${corrPtsFGA}\t~0.30`);
  lines.push(`Pearson(AR,FG%)\t${corrARFGP}\tmildly +`);
  lines.push(`Pearson(eFG%,FGA)\t${corrEFGFGA}\t~0`);
  lines.push(`pts mean / sigma / range\t${mean(ptsArr)} / ${stdev(ptsArr)} / ${minMax(ptsArr)}\t~114 / ~12 / 90-135`);
  lines.push(`FGA mean / sigma / range\t${mean(fgaArr)} / ${stdev(fgaArr)} / ${minMax(fgaArr)}\t~89 / ~5 / 78-100`);
  lines.push(`eFG% mean / sigma\t${mean(efgArr)} / ${stdev(efgArr)}\t~53.5 / ~4`);
  lines.push(`AR mean\t${mean(arArr)}\t~0.58`);
  lines.push(`AST mean / sigma\t${mean(astArr)} / ${stdev(astArr)}\t~26 / ~4`);
  lines.push(`FTrate mean / sigma\t${mean(ftrArr)} / ${stdev(ftrArr)}\t~0.30 (2025-26 NBA) / ~0.05`);
  lines.push('');
  lines.push('=== FLAGS ===');
  if (flags.length === 0) {
    lines.push('No pathology flags raised — sim looks calibrated.');
  } else {
    flags.forEach(f => lines.push(f));
  }

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);

  const headline = flags.length === 0
    ? `Sample healthy. ${rowsRaw.length} rows + summary in console (also clipboard).`
    : `${flags.length} pathology flag${flags.length === 1 ? '' : 's'}. ${rowsRaw.length} rows in console (also clipboard).`;
  return { title: 'SAMPLE12', body: headline, ok: flags.length === 0 };
}

// SCOREPROF ───────────────────────────────────────────────────────────────────
// Score↔eFG% binned audit on the FULL NBA box score corpus (not just 24 games).
// Goal: pinpoint architectural decoupling — does score increase as efficiency
// increases the way NBA games do? In real NBA, the higher pts buckets should
// have monotonically higher eFG%. If 95-105 bucket has eFG% ~50 and 125+ bucket
// has eFG% ~52 (~2pp gap), that's NBA-realistic. If 115-125 bucket has eFG% LOWER
// than 95-105 bucket, the score↔profile decoupling bug is structural, not noise.
export async function runScoreProf(state: GameState): Promise<CheatResult> {
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats) &&
           g.homeStats.length > 0 && g.awayStats.length > 0;
  });

  if (boxes.length < 30) {
    return { title: 'SCOREPROF', body: `Only ${boxes.length} NBA boxes — need ≥30. Sim more.`, ok: false };
  }

  type R = { pts: number; fga: number; fgm: number; t3m: number; ast: number; fta: number };
  const buildRow = (lines: any[], score: number): R => {
    const sum = (k: string) => lines.reduce((s, p) => s + (p[k] ?? 0), 0);
    return { pts: score, fga: sum('fga'), fgm: sum('fgm'), t3m: sum('threePm'), ast: sum('ast'), fta: sum('fta') };
  };
  const rows: R[] = [];
  for (const g of boxes) {
    rows.push(buildRow((g as any).homeStats, (g as any).homeScore));
    rows.push(buildRow((g as any).awayStats, (g as any).awayScore));
  }

  const efg = (r: R) => r.fga > 0 ? ((r.fgm + 0.5 * r.t3m) / r.fga) * 100 : 0;
  const fgPct = (r: R) => r.fga > 0 ? (r.fgm / r.fga) * 100 : 0;
  const ar = (r: R) => r.fgm > 0 ? r.ast / r.fgm : 0;
  const ftRate = (r: R) => r.fga > 0 ? r.fta / r.fga : 0;

  const bins = [
    { name: '<95',     lo: 0,   hi: 95,  rows: [] as R[] },
    { name: '95-105',  lo: 95,  hi: 105, rows: [] as R[] },
    { name: '105-115', lo: 105, hi: 115, rows: [] as R[] },
    { name: '115-125', lo: 115, hi: 125, rows: [] as R[] },
    { name: '125+',    lo: 125, hi: 999, rows: [] as R[] },
  ];
  rows.forEach(r => {
    const b = bins.find(b => r.pts >= b.lo && r.pts < b.hi);
    if (b) b.rows.push(r);
  });

  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const stdev = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  };

  // Pearson on full corpus
  const ptsArr = rows.map(r => r.pts);
  const efgArr = rows.map(r => efg(r));
  const fgaArr = rows.map(r => r.fga);
  const arArr = rows.map(r => ar(r));
  const fgPctArr = rows.map(r => fgPct(r));
  const pearson = (xs: number[], ys: number[]) => {
    const n = xs.length;
    if (n < 2) return 0;
    const mx = mean(xs), my = mean(ys);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx, b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  };

  const corrPtsEfg = pearson(ptsArr, efgArr);
  const corrPtsFga = pearson(ptsArr, fgaArr);
  const corrArFgp = pearson(arArr, fgPctArr);

  // Worst inversions: high pts + low eFG% (or vice versa)
  const inversions = rows
    .map((r, i) => ({ r, i, score: r.pts - efg(r) * 1.8 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const lines: string[] = [];
  lines.push(`SCOREPROF — score↔efficiency architectural audit`);
  lines.push(`Corpus: ${rows.length} team-games from ${boxes.length} NBA box scores.`);
  lines.push('');
  lines.push('=== BINS ===');
  lines.push('bucket\tcount\tpts_avg\tFGA_avg\teFG%_avg\teFG%_sigma\tFG%_avg\tAR_avg\tFTrate_avg');
  bins.forEach(b => {
    if (b.rows.length === 0) {
      lines.push(`${b.name}\t0\t-\t-\t-\t-\t-\t-\t-`);
      return;
    }
    const efgs = b.rows.map(efg);
    lines.push([
      b.name,
      b.rows.length,
      mean(b.rows.map(r => r.pts)).toFixed(1),
      mean(b.rows.map(r => r.fga)).toFixed(1),
      mean(efgs).toFixed(2),
      stdev(efgs).toFixed(2),
      mean(b.rows.map(fgPct)).toFixed(2),
      mean(b.rows.map(ar)).toFixed(3),
      mean(b.rows.map(ftRate)).toFixed(3),
    ].join('\t'));
  });
  lines.push('');
  lines.push('=== CORRELATIONS (full corpus) ===');
  lines.push(`Pearson(pts,eFG%)\t${corrPtsEfg.toFixed(3)}\tNBA expect ~0.65-0.75 (efficiency drives score)`);
  lines.push(`Pearson(pts,FGA)\t${corrPtsFga.toFixed(3)}\tNBA expect ~0.20-0.30 (volume secondary)`);
  lines.push(`Pearson(AR,FG%)\t${corrArFgp.toFixed(3)}\tNBA expect ~0.10-0.30 (mild positive)`);
  lines.push('');
  lines.push('=== WORST 8 INVERSIONS (high pts on low eFG%) ===');
  lines.push('pts\tFGA\tFGM\teFG%\tFG%\tAR\tFTrate');
  inversions.forEach(({ r }) => {
    lines.push([r.pts, r.fga, r.fgm, efg(r).toFixed(1), fgPct(r).toFixed(1), ar(r).toFixed(2), ftRate(r).toFixed(2)].join('\t'));
  });
  lines.push('');
  lines.push('=== DIAGNOSTIC ===');
  // Monotonicity check — eFG% should rise with score
  const meanEfgs = bins.filter(b => b.rows.length > 0).map(b => ({ name: b.name, m: mean(b.rows.map(efg)), n: b.rows.length }));
  let monotonic = true;
  for (let i = 1; i < meanEfgs.length; i++) {
    if (meanEfgs[i].m < meanEfgs[i - 1].m - 0.5) {
      monotonic = false;
      lines.push(`🔴 NON-MONOTONIC: ${meanEfgs[i - 1].name} eFG% ${meanEfgs[i - 1].m.toFixed(2)} > ${meanEfgs[i].name} eFG% ${meanEfgs[i].m.toFixed(2)} → score-profile decoupled`);
    }
  }
  if (monotonic) lines.push(`✅ MONOTONIC: eFG% rises with score across all populated bins.`);
  if (corrPtsEfg < 0.50) lines.push(`🔴 pts↔eFG% corr ${corrPtsEfg.toFixed(3)} < 0.50 → strong decoupling (large-N evidence)`);
  else if (corrPtsEfg < 0.60) lines.push(`🟡 pts↔eFG% corr ${corrPtsEfg.toFixed(3)} < 0.60 → mild decoupling`);
  else lines.push(`✅ pts↔eFG% corr ${corrPtsEfg.toFixed(3)} → NBA-aligned`);

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'SCOREPROF', body: `Audited ${rows.length} team-games. Console + clipboard.`, ok: corrPtsEfg >= 0.55 };
}

// PLAYERDIST ──────────────────────────────────────────────────────────────────
// Per-player FGA/min and pts/min distribution on last 100 NBA games. Reveals
// the FGA-volatility architecture bug: hot teams collapse to 62 FGA because
// twoPa = twoPm/pct2 reverse-engineers attempts from makes. Per-minute volume
// rates should be ~0.40 FGA/min and ~0.55 pts/min across all min buckets.
// If high-min starters show FGA/min < 0.30, hot-team-collapse is structural.
export async function runPlayerDist(state: GameState): Promise<CheatResult> {
  const NUM_GAMES = 100;
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats);
  });
  if (boxes.length < 20) {
    return { title: 'PLAYERDIST', body: `Only ${boxes.length} NBA boxes — need ≥20.`, ok: false };
  }
  const recent = [...boxes].sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))).slice(0, NUM_GAMES);

  // Pull all player-game lines
  type PR = { name: string; min: number; pts: number; fga: number; fgm: number; t3m: number; t3a: number; fta: number; ftm: number; ast: number; eFG: number; fgaPerMin: number; ptsPerMin: number };
  const playerRows: PR[] = [];
  for (const g of recent) {
    const lines = [...((g as any).homeStats ?? []), ...((g as any).awayStats ?? [])];
    for (const p of lines) {
      const min = Number(p.min ?? 0);
      if (min < 0.5) continue; // skip DNPs / 0-min lines
      playerRows.push({
        name: String(p.name ?? '?'),
        min,
        pts: p.pts ?? 0,
        fga: p.fga ?? 0,
        fgm: p.fgm ?? 0,
        t3m: p.threePm ?? 0,
        t3a: p.threePa ?? 0,
        fta: p.fta ?? 0,
        ftm: p.ftm ?? 0,
        ast: p.ast ?? 0,
        eFG: p.fga > 0 ? ((p.fgm + 0.5 * p.threePm) / p.fga) * 100 : 0,
        fgaPerMin: min > 0 ? p.fga / min : 0,
        ptsPerMin: min > 0 ? p.pts / min : 0,
      });
    }
  }

  const minBuckets = [
    { name: '<5',     lo: 0,  hi: 5,  rows: [] as PR[] },
    { name: '5-15',   lo: 5,  hi: 15, rows: [] as PR[] },
    { name: '15-25',  lo: 15, hi: 25, rows: [] as PR[] },
    { name: '25-35',  lo: 25, hi: 35, rows: [] as PR[] },
    { name: '35+',    lo: 35, hi: 99, rows: [] as PR[] },
  ];
  playerRows.forEach(r => {
    const b = minBuckets.find(b => r.min >= b.lo && r.min < b.hi);
    if (b) b.rows.push(r);
  });

  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const stdev = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  };

  const lines: string[] = [];
  lines.push(`PLAYERDIST — per-player game distribution audit`);
  lines.push(`Sample: ${playerRows.length} player-game-rows from ${recent.length} most recent NBA games.`);
  lines.push('');
  lines.push('=== MIN BUCKETS ===');
  lines.push('bucket\tcount\tFGA/min_avg\tFGA/min_sigma\tpts/min_avg\tpts/min_sigma\teFG%_avg\teFG%_sigma\tFGA_avg\tpts_avg');
  minBuckets.forEach(b => {
    if (b.rows.length === 0) { lines.push(`${b.name}\t0\t-\t-\t-\t-\t-\t-\t-\t-`); return; }
    const fgaPm = b.rows.map(r => r.fgaPerMin);
    const ptsPm = b.rows.map(r => r.ptsPerMin);
    const efgs = b.rows.filter(r => r.fga > 0).map(r => r.eFG);
    lines.push([
      b.name, b.rows.length,
      mean(fgaPm).toFixed(3), stdev(fgaPm).toFixed(3),
      mean(ptsPm).toFixed(3), stdev(ptsPm).toFixed(3),
      efgs.length > 0 ? mean(efgs).toFixed(2) : '-',
      efgs.length > 0 ? stdev(efgs).toFixed(2) : '-',
      mean(b.rows.map(r => r.fga)).toFixed(1),
      mean(b.rows.map(r => r.pts)).toFixed(1),
    ].join('\t'));
  });
  lines.push('');
  lines.push('NBA expect: FGA/min ~0.40 across all buckets. pts/min ~0.55. eFG% ~53.5 ±5.');
  lines.push('');

  // Outliers: starters (25+ min) with weird FGA/min
  const starters = playerRows.filter(r => r.min >= 25);
  const hotChuck = starters.filter(r => r.fgaPerMin > 0.65).sort((a, b) => b.fgaPerMin - a.fgaPerMin).slice(0, 5);
  const coldDef = starters.filter(r => r.fgaPerMin < 0.25 && r.min >= 25).sort((a, b) => a.fgaPerMin - b.fgaPerMin).slice(0, 5);
  const explosionGames = playerRows.filter(r => r.pts >= 40).sort((a, b) => b.pts - a.pts).slice(0, 8);
  const brickGames = playerRows.filter(r => r.fga >= 15 && r.eFG < 35 && r.min >= 20).sort((a, b) => a.eFG - b.eFG).slice(0, 5);

  lines.push('=== HOT CHUCKERS (25+ min, FGA/min > 0.65) — NBA cap ~0.55 ===');
  lines.push('name\tmin\tFGA\tFGM\teFG%\tpts\tFGA/min');
  hotChuck.forEach(r => lines.push([r.name, r.min.toFixed(1), r.fga, r.fgm, r.eFG.toFixed(1), r.pts, r.fgaPerMin.toFixed(2)].join('\t')));
  lines.push('');
  lines.push('=== DEFER OUTLIERS (25+ min, FGA/min < 0.25) — NBA floor ~0.20 ===');
  lines.push('name\tmin\tFGA\tFGM\teFG%\tpts\tFGA/min');
  coldDef.forEach(r => lines.push([r.name, r.min.toFixed(1), r.fga, r.fgm, r.eFG.toFixed(1), r.pts, r.fgaPerMin.toFixed(2)].join('\t')));
  lines.push('');
  lines.push('=== TOP EXPLOSION GAMES (≥40 pts) ===');
  lines.push('name\tmin\tpts\tFGA\tFGM\teFG%');
  explosionGames.forEach(r => lines.push([r.name, r.min.toFixed(1), r.pts, r.fga, r.fgm, r.eFG.toFixed(1)].join('\t')));
  lines.push('');
  lines.push('=== BRICK GAMES (15+ FGA, eFG<35%) ===');
  lines.push('name\tmin\tFGA\tFGM\teFG%\tpts');
  brickGames.forEach(r => lines.push([r.name, r.min.toFixed(1), r.fga, r.fgm, r.eFG.toFixed(1), r.pts].join('\t')));
  lines.push('');
  lines.push('=== DIAGNOSTIC ===');
  // Hot-team-collapse check: 35+ min bucket should have FGA/min in [0.35, 0.50]
  const top = minBuckets.find(b => b.name === '35+');
  if (top && top.rows.length > 5) {
    const fgaPm = mean(top.rows.map(r => r.fgaPerMin));
    if (fgaPm < 0.30) lines.push(`🔴 35+ min FGA/min ${fgaPm.toFixed(3)} < 0.30 → starter volume collapsing (hot-team architectural bug)`);
    else if (fgaPm > 0.50) lines.push(`🟡 35+ min FGA/min ${fgaPm.toFixed(3)} > 0.50 → starters chuck too much`);
    else lines.push(`✅ 35+ min FGA/min ${fgaPm.toFixed(3)} in NBA range [0.35-0.50]`);
  }
  if (hotChuck.length > 5) lines.push(`🟡 ${hotChuck.length} starter-games with FGA/min > 0.65 — chucker pathology`);
  if (coldDef.length > 5) lines.push(`🟡 ${coldDef.length} starter-games with FGA/min < 0.25 — DEFER pathology`);

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'PLAYERDIST', body: `${playerRows.length} player-rows audited. Console + clipboard.`, ok: true };
}

// TEAMCHECK ───────────────────────────────────────────────────────────────────
// Per-team season averages compared to NBA 2025-26 reference ranges. Iterates
// all NBA-only box scores per team, computes per-game averages, sorts by PPG,
// flags outliers. NBA real 2025-26 ranges (median teams):
//   PPG 113-120, OPP 111-117, FG% .455-.490, 3P% .345-.380, FT% .770-.825
//   eFG% .520-.560, FGA 86-92, AST 24-28, REB 42-46, TOV 12-15, PF 19-22

