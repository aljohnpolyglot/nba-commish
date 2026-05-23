import type { GameState } from '../../types';
import { copyTextToClipboard, type CheatResult } from './shared';

export async function runTeamCheck(state: GameState): Promise<CheatResult> {
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats);
  });
  if (boxes.length < 30) {
    return { title: 'TEAMCHECK', body: `Only ${boxes.length} NBA boxes — need ≥30.`, ok: false };
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  type TR = {
    tid: number; abbrev: string; gp: number; w: number; l: number;
    pts: number; opp: number; fga: number; fgm: number; t3m: number; t3a: number;
    fta: number; ftm: number; ast: number; reb: number; orb: number;
    stl: number; blk: number; tov: number; pf: number;
  };
  const teamMap = new Map<number, TR>();
  const ensure = (tid: number): TR => {
    if (!teamMap.has(tid)) {
      teamMap.set(tid, { tid, abbrev: abbrev(tid), gp: 0, w: 0, l: 0, pts: 0, opp: 0, fga: 0, fgm: 0, t3m: 0, t3a: 0, fta: 0, ftm: 0, ast: 0, reb: 0, orb: 0, stl: 0, blk: 0, tov: 0, pf: 0 });
    }
    return teamMap.get(tid)!;
  };

  const sumLines = (lines: any[], k: string) => lines.reduce((s, p) => s + (p[k] ?? 0), 0);
  for (const g of boxes) {
    const home = ensure((g as any).homeTeamId);
    const away = ensure((g as any).awayTeamId);
    home.gp++; away.gp++;
    const homeWins = (g as any).homeScore > (g as any).awayScore;
    if (homeWins) { home.w++; away.l++; } else { home.l++; away.w++; }
    home.pts += (g as any).homeScore; home.opp += (g as any).awayScore;
    away.pts += (g as any).awayScore; away.opp += (g as any).homeScore;
    const hs = (g as any).homeStats, as = (g as any).awayStats;
    home.fga += sumLines(hs, 'fga'); home.fgm += sumLines(hs, 'fgm');
    home.t3m += sumLines(hs, 'threePm'); home.t3a += sumLines(hs, 'threePa');
    home.ftm += sumLines(hs, 'ftm'); home.fta += sumLines(hs, 'fta');
    home.ast += sumLines(hs, 'ast'); home.reb += sumLines(hs, 'reb'); home.orb += sumLines(hs, 'orb');
    home.stl += sumLines(hs, 'stl'); home.blk += sumLines(hs, 'blk');
    home.tov += sumLines(hs, 'tov'); home.pf += sumLines(hs, 'pf');
    away.fga += sumLines(as, 'fga'); away.fgm += sumLines(as, 'fgm');
    away.t3m += sumLines(as, 'threePm'); away.t3a += sumLines(as, 'threePa');
    away.ftm += sumLines(as, 'ftm'); away.fta += sumLines(as, 'fta');
    away.ast += sumLines(as, 'ast'); away.reb += sumLines(as, 'reb'); away.orb += sumLines(as, 'orb');
    away.stl += sumLines(as, 'stl'); away.blk += sumLines(as, 'blk');
    away.tov += sumLines(as, 'tov'); away.pf += sumLines(as, 'pf');
  }

  const rows = Array.from(teamMap.values()).filter(t => t.gp > 0).sort((a, b) => (b.pts / b.gp) - (a.pts / a.gp));
  const fmtPct = (n: number, d: number) => d > 0 ? (n / d * 100).toFixed(1) : '-';
  const fmtPg = (n: number, d: number) => d > 0 ? (n / d).toFixed(1) : '-';

  // NBA 2025-26 reference ranges (exact values from Gemini benchmark dump 2026-03-13).
  // PPG 105.9-122.1 (DEN top, BKN bottom). FG% .448-.491. 3P% .330-.392. FT% .740-.820
  // (GSW top, MIL bottom). eFG% .510-.588. ORtg 108.84-122.63. DRtg 107.89-122.84.
  // PACE 94-101.5. REB 39.8-47.2. League means: PPG 115.6, FGA 89.1, FG% 47.1, 3P% 36.0,
  // FT% 78.3, eFG% 54.6, AST 26.7, REB 43.8, TOV 14.5, PF 19.9.
  const NBA_RANGES = {
    PPG:  [105.9, 122.1], FG_PCT: [44.8, 49.1], TP_PCT: [33.0, 39.2], FT_PCT: [74.0, 82.0],
    eFG:  [51.0, 58.8], FGA: [85, 92], AST: [22, 30], REB: [39.8, 47.2], TOV: [11, 16], PF: [17, 22],
  };
  const flagOut = (val: number, range: [number, number]) => val < range[0] || val > range[1];

  const lines: string[] = [];
  lines.push(`TEAMCHECK — per-team season averages vs NBA 2025-26 reference`);
  lines.push(`Scope: ${rows.length} teams, ${boxes.length} NBA box scores. Sorted by PPG.`);
  lines.push('');
  lines.push('=== TEAMS ===');
  lines.push('rank\tteam\tGP\tW-L\tPPG\tOPP\tMOV\tFG%\t3P%\tFT%\teFG%\tFGA\t3PA\tFTA\tAST\tREB\tORB\tSTL\tBLK\tTOV\tPF');
  rows.forEach((t, i) => {
    const ppg = t.pts / t.gp, opp = t.opp / t.gp;
    const efg = t.fga > 0 ? (t.fgm + 0.5 * t.t3m) / t.fga * 100 : 0;
    lines.push([
      i + 1, t.abbrev, t.gp, `${t.w}-${t.l}`,
      ppg.toFixed(1), opp.toFixed(1), (ppg - opp).toFixed(1),
      fmtPct(t.fgm, t.fga), fmtPct(t.t3m, t.t3a), fmtPct(t.ftm, t.fta),
      efg.toFixed(1),
      fmtPg(t.fga, t.gp), fmtPg(t.t3a, t.gp), fmtPg(t.fta, t.gp),
      fmtPg(t.ast, t.gp), fmtPg(t.reb, t.gp), fmtPg(t.orb, t.gp),
      fmtPg(t.stl, t.gp), fmtPg(t.blk, t.gp), fmtPg(t.tov, t.gp), fmtPg(t.pf, t.gp),
    ].join('\t'));
  });
  lines.push('');

  // League means
  const totalGp = rows.reduce((s, t) => s + t.gp, 0) || 1;
  const lgPts = rows.reduce((s, t) => s + t.pts, 0) / totalGp;
  const lgFga = rows.reduce((s, t) => s + t.fga, 0) / totalGp;
  const lgFgm = rows.reduce((s, t) => s + t.fgm, 0);
  const lgFgaTotal = rows.reduce((s, t) => s + t.fga, 0);
  const lgT3m = rows.reduce((s, t) => s + t.t3m, 0);
  const lgT3a = rows.reduce((s, t) => s + t.t3a, 0);
  const lgFtm = rows.reduce((s, t) => s + t.ftm, 0);
  const lgFta = rows.reduce((s, t) => s + t.fta, 0);
  const lgAst = rows.reduce((s, t) => s + t.ast, 0) / totalGp;
  const lgReb = rows.reduce((s, t) => s + t.reb, 0) / totalGp;
  const lgPf = rows.reduce((s, t) => s + t.pf, 0) / totalGp;
  const lgTov = rows.reduce((s, t) => s + t.tov, 0) / totalGp;
  const lgEfg = lgFgaTotal > 0 ? (lgFgm + 0.5 * lgT3m) / lgFgaTotal * 100 : 0;

  lines.push('=== LEAGUE AVERAGES vs NBA REAL ===');
  lines.push('METRIC\tSIM\tNBA_RANGE\tSTATUS');
  const checkLg = (name: string, v: number, range: [number, number]) => {
    const ok = v >= range[0] && v <= range[1];
    lines.push(`${name}\t${v.toFixed(1)}\t${range[0]}–${range[1]}\t${ok ? '✓' : (v < range[0] ? '🔴 LOW' : '🔴 HIGH')}`);
  };
  // League-mean targets ±2 around exact 2025-26 NBA mean (Gemini benchmark)
  checkLg('PPG',    lgPts, [113, 118]);   // NBA 115.6
  checkLg('FGA',    lgFga, [87, 92]);     // NBA 89.1
  checkLg('FG%',    lgFgaTotal > 0 ? lgFgm / lgFgaTotal * 100 : 0, [45.5, 48.5]);  // NBA 47.1
  checkLg('3P%',    lgT3a > 0 ? lgT3m / lgT3a * 100 : 0, [34.5, 37.5]);            // NBA 36.0
  checkLg('FT%',    lgFta > 0 ? lgFtm / lgFta * 100 : 0, [76.5, 80.0]);            // NBA 78.3
  checkLg('eFG%',   lgEfg, [53.0, 56.0]); // NBA 54.6
  checkLg('AST',    lgAst, [25, 28]);     // NBA 26.7
  checkLg('REB',    lgReb, [42, 46]);     // NBA 43.8
  checkLg('TOV',    lgTov, [13.5, 15.5]); // NBA 14.5
  checkLg('PF',     lgPf,  [18.5, 21.5]); // NBA 19.9
  lines.push('');

  // Outliers
  lines.push('=== TEAM OUTLIERS (outside NBA range) ===');
  const outliers: string[] = [];
  rows.forEach(t => {
    const ppg = t.pts / t.gp, opp = t.opp / t.gp;
    const fgPct = t.fga > 0 ? t.fgm / t.fga * 100 : 0;
    const t3Pct = t.t3a > 0 ? t.t3m / t.t3a * 100 : 0;
    const efg = t.fga > 0 ? (t.fgm + 0.5 * t.t3m) / t.fga * 100 : 0;
    if (flagOut(ppg, NBA_RANGES.PPG as [number, number])) outliers.push(`${t.abbrev}: PPG ${ppg.toFixed(1)} (NBA ${NBA_RANGES.PPG.join('-')})`);
    if (flagOut(fgPct, NBA_RANGES.FG_PCT as [number, number])) outliers.push(`${t.abbrev}: FG% ${fgPct.toFixed(1)} (NBA ${NBA_RANGES.FG_PCT.join('-')})`);
    if (flagOut(t3Pct, NBA_RANGES.TP_PCT as [number, number])) outliers.push(`${t.abbrev}: 3P% ${t3Pct.toFixed(1)} (NBA ${NBA_RANGES.TP_PCT.join('-')})`);
    if (flagOut(efg, NBA_RANGES.eFG as [number, number])) outliers.push(`${t.abbrev}: eFG% ${efg.toFixed(1)} (NBA ${NBA_RANGES.eFG.join('-')})`);
  });
  if (outliers.length === 0) lines.push('✅ No team outside NBA reference ranges.');
  else outliers.slice(0, 30).forEach(o => lines.push('  • ' + o));

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'TEAMCHECK', body: `${rows.length} teams audited. ${outliers.length} outlier flag(s). Console + clipboard.`, ok: outliers.length < 10 };
}

// LEADERS ─────────────────────────────────────────────────────────────────────
// Top 10 league leaders in 8 categories vs NBA 2025-26 reference values.
// Filters NBA active players only (tid 0-99) with minimum games played.
export async function runLeaders(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 10;

  type PR = {
    name: string; tid: number; gp: number; min: number;
    pts: number; reb: number; ast: number; stl: number; blk: number;
    fga: number; fgm: number; t3m: number; t3a: number; ft: number; fta: number; tov: number;
  };
  const players: PR[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const seasonStats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (seasonStats.length === 0) continue;
    const s = seasonStats[seasonStats.length - 1];
    if ((s.gp ?? 0) < MIN_GP) continue;
    players.push({
      name: p.name,
      tid: p.tid,
      gp: s.gp,
      min: s.min ?? 0,
      pts: s.pts ?? 0,
      reb: s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0)),
      ast: s.ast ?? 0,
      stl: s.stl ?? 0,
      blk: s.blk ?? 0,
      fga: s.fga ?? 0,
      fgm: s.fg ?? 0,
      t3m: s.tp ?? 0,
      t3a: s.tpa ?? 0,
      ft: s.ft ?? 0,
      fta: s.fta ?? 0,
      tov: s.tov ?? 0,
    });
  }

  if (players.length < 30) {
    return { title: 'LEADERS', body: `Only ${players.length} NBA players with ≥${MIN_GP} GP. Sim more.`, ok: false };
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  // NBA 2025-26 reference (exact top-1 / top-10 from Gemini benchmark, 2026-03-13)
  const NBA_REF = {
    PPG:    { top1: 33.5, top10: 26.0, real_leader: 'Doncic 33.5, SGA 31.1, Edwards 28.8' },
    RPG:    { top1: 12.9, top10: 9.0,  real_leader: 'Jokic 12.9, KAT 11.9, Clingan 11.6, Wemby 11.5' },
    APG:    { top1: 10.7, top10: 7.1,  real_leader: 'Jokic 10.7, Cunningham 9.9, Doncic 8.3' },
    SPG:    { top1: 2.1,  top10: 1.7,  real_leader: 'Wallace 2.1, Daniels 2.0, Ausar 2.0' },
    BPG:    { top1: 4.0,  top10: 1.7,  real_leader: 'Wemby 4.0, Holmgren 2.8, Clingan 2.7' },
    FGA:    { top1: 22.8, top10: 19.9, real_leader: 'Doncic 22.8, SGA 22.4, Brown 21.7' },
    TPM:    { top1: 4.6,  top10: 3.1,  real_leader: 'Curry 4.6, Doncic 4.1, Mitchell 3.8' },
    FT_PCT: { top1: 92.1, top10: 84.2, real_leader: 'Curry .921, Irving .908, Durant .902' },
  };

  const lines: string[] = [];
  lines.push(`LEADERS — top 10 league leaders vs NBA 2025-26 reference (≥${MIN_GP} GP)`);
  lines.push(`Scope: ${players.length} qualifying NBA players, season ${currentYear}.`);
  lines.push('');

  const showTop = (label: string, scoreFn: (p: PR) => number, fmt: (n: number) => string, ref: { top1: number; top10: number; real_leader: string }) => {
    const sorted = [...players].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, 10);
    if (sorted.length === 0) return;
    lines.push(`=== ${label} (NBA top-1: ${ref.top1}, top-10: ${ref.top10} | ${ref.real_leader}) ===`);
    lines.push('rank\tname\tteam\tGP\tvalue');
    sorted.forEach((p, i) => lines.push(`${i + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${fmt(scoreFn(p))}`));
    const top1 = scoreFn(sorted[0]);
    const top10 = scoreFn(sorted[sorted.length - 1]);
    const flag1 = top1 > ref.top1 * 1.15 ? '🔴 over NBA top' : top1 < ref.top1 * 0.85 ? '🔴 under NBA top' : '✓';
    const flag10 = top10 > ref.top10 * 1.15 ? '🟡 top-10 high' : top10 < ref.top10 * 0.85 ? '🟡 top-10 low' : '✓';
    lines.push(`status\ttop1=${fmt(top1)} ${flag1}\ttop10=${fmt(top10)} ${flag10}`);
    lines.push('');
  };

  showTop('PPG',  p => p.gp > 0 ? p.pts / p.gp : 0, n => n.toFixed(1), NBA_REF.PPG);
  showTop('RPG',  p => p.gp > 0 ? p.reb / p.gp : 0, n => n.toFixed(1), NBA_REF.RPG);
  showTop('APG',  p => p.gp > 0 ? p.ast / p.gp : 0, n => n.toFixed(1), NBA_REF.APG);
  showTop('SPG',  p => p.gp > 0 ? p.stl / p.gp : 0, n => n.toFixed(2), NBA_REF.SPG);
  showTop('BPG',  p => p.gp > 0 ? p.blk / p.gp : 0, n => n.toFixed(2), NBA_REF.BPG);
  showTop('FGA/G', p => p.gp > 0 ? p.fga / p.gp : 0, n => n.toFixed(1), NBA_REF.FGA);
  showTop('3PM/G', p => p.gp > 0 ? p.t3m / p.gp : 0, n => n.toFixed(2), NBA_REF.TPM);
  // FT% — require at least 50 FTA total to qualify
  const ftCandidates = players.filter(p => p.fta >= 50);
  if (ftCandidates.length > 0) {
    const sorted = [...ftCandidates].sort((a, b) => (b.ft / b.fta) - (a.ft / a.fta)).slice(0, 10);
    lines.push(`=== FT% (≥50 FTA, NBA top-1: ${NBA_REF.FT_PCT.top1}%, top-10: ${NBA_REF.FT_PCT.top10}% | ${NBA_REF.FT_PCT.real_leader}) ===`);
    lines.push('rank\tname\tteam\tFTM-FTA\tFT%');
    sorted.forEach((p, i) => lines.push(`${i + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.ft}-${p.fta}\t${(p.ft / p.fta * 100).toFixed(1)}`));
    const top1ft = (sorted[0].ft / sorted[0].fta) * 100;
    const flag = top1ft > NBA_REF.FT_PCT.top1 * 1.05 ? '🔴 over NBA' : top1ft < NBA_REF.FT_PCT.top1 * 0.92 ? '🔴 under NBA' : '✓';
    lines.push(`status\ttop1=${top1ft.toFixed(1)}% ${flag}`);
    lines.push('');
  }

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'LEADERS', body: `Top-10 leaderboards (${players.length} eligible players). Console + clipboard.`, ok: true };
}

// DISTSHAPE ───────────────────────────────────────────────────────────────────
// Per-player season distribution audit on percentile bands (P10/P25/P50/P75/P90)
// vs NBA 2025-26 reference (Gemini benchmark dump). Reveals whether the talent
// curve in the sim matches NBA — e.g. P90 PPG should be ~26.4 (NBA elite tier),
// P10 should be ~4.5 (deep-bench scrubs). Detects "compressed" or "stretched"
// score distributions that mean-checks miss.
export async function runDistShape(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 20;

  type PR = { name: string; gp: number; min: number; pts: number; fga: number; fgm: number; t3m: number; t3a: number; ft: number; fta: number; tov: number; ast: number; reb: number };
  const players: PR[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const stats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (stats.length === 0) continue;
    const s = stats[stats.length - 1];
    if ((s.gp ?? 0) < MIN_GP) continue;
    players.push({
      name: p.name,
      gp: s.gp,
      min: s.min ?? 0,
      pts: s.pts ?? 0, fga: s.fga ?? 0, fgm: s.fg ?? 0,
      t3m: s.tp ?? 0, t3a: s.tpa ?? 0,
      ft: s.ft ?? 0, fta: s.fta ?? 0,
      tov: s.tov ?? 0, ast: s.ast ?? 0, reb: s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0)),
    });
  }

  if (players.length < 50) {
    return { title: 'DISTSHAPE', body: `Only ${players.length} players with ≥${MIN_GP} GP — need ≥50.`, ok: false };
  }

  const percentile = (xs: number[], p: number) => {
    if (xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length)));
    return sorted[idx];
  };
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  // NBA 2025-26 reference distribution (from Gemini benchmark, qualifying ≥20 GP)
  const NBA_DIST = {
    PPG:   { mean: 12.6, P10: 4.5,  P25: 7.5,  P50: 10.8, P75: 18.2, P90: 26.4 },
    FGA:   { mean: 9.7,  P10: 3.8,  P25: 6.2,  P50: 8.5,  P75: 14.5, P90: 20.2 },
    TSpct: { mean: 58.2, P10: 51.0, P25: 54.5, P50: 57.8, P75: 61.5, P90: 66.0 },
    USGpct: { mean: 20.0, P10: 12.5, P25: 15.0, P50: 18.5, P75: 24.5, P90: 31.0 },
  };

  // Per-player metric calculations
  const ppg = players.map(p => p.gp > 0 ? p.pts / p.gp : 0);
  const fgaPg = players.map(p => p.gp > 0 ? p.fga / p.gp : 0);
  // True Shooting %: pts / (2 × (FGA + 0.44 × FTA)) × 100
  const ts = players.map(p => {
    const denom = 2 * (p.fga + 0.44 * p.fta);
    return denom > 0 ? (p.pts / denom) * 100 : 0;
  });
  // Usage estimate: ((FGA + 0.44 × FTA + TOV) × team_min) / (player_min × team_FGA + ...)
  // Simplified: we approximate USG% from per-player rate — not exact but a useful proxy
  const usg = players.map(p => {
    if (p.min <= 0) return 0;
    const minPg = p.min / p.gp;
    if (minPg <= 0) return 0;
    const possessionsPg = (p.fga + 0.44 * p.fta + p.tov) / p.gp;
    // Approximation: NBA team has ~98 possessions over 240 min → ~0.40 poss/min on court
    return (possessionsPg / (minPg * 0.40)) * 100 * 0.20; // scaled to NBA-realistic range
  });

  const lines: string[] = [];
  lines.push(`DISTSHAPE — per-player distribution vs NBA 2025-26 percentiles (≥${MIN_GP} GP)`);
  lines.push(`Sample: ${players.length} qualifying NBA players, season ${currentYear}.`);
  lines.push('');

  const showDist = (label: string, vals: number[], ref: { mean: number; P10: number; P25: number; P50: number; P75: number; P90: number }, fmt: (n: number) => string) => {
    const simMean = mean(vals);
    const p = (q: number) => percentile(vals, q);
    lines.push(`=== ${label} ===`);
    lines.push('PERCENTILE\tSIM\tNBA\tDELTA\tFLAG');
    const rows: { name: string; sim: number; nba: number }[] = [
      { name: 'mean', sim: simMean, nba: ref.mean },
      { name: 'P10',  sim: p(10),   nba: ref.P10 },
      { name: 'P25',  sim: p(25),   nba: ref.P25 },
      { name: 'P50',  sim: p(50),   nba: ref.P50 },
      { name: 'P75',  sim: p(75),   nba: ref.P75 },
      { name: 'P90',  sim: p(90),   nba: ref.P90 },
    ];
    rows.forEach(r => {
      const delta = r.sim - r.nba;
      const flag = Math.abs(delta) / r.nba > 0.15 ? '🔴' : Math.abs(delta) / r.nba > 0.08 ? '🟡' : '✅';
      lines.push(`${r.name}\t${fmt(r.sim)}\t${fmt(r.nba)}\t${delta >= 0 ? '+' : ''}${fmt(delta)}\t${flag}`);
    });
    lines.push('');
  };

  showDist('PPG',  ppg,   NBA_DIST.PPG,   n => n.toFixed(1));
  showDist('FGA/G', fgaPg, NBA_DIST.FGA,   n => n.toFixed(1));
  showDist('TS%',  ts,    NBA_DIST.TSpct, n => n.toFixed(1));
  showDist('USG%', usg,   NBA_DIST.USGpct, n => n.toFixed(1));

  // Diagnostic
  const diags: string[] = [];
  const ppgSpread = percentile(ppg, 90) - percentile(ppg, 10);
  const ppgSpreadNba = NBA_DIST.PPG.P90 - NBA_DIST.PPG.P10;
  if (Math.abs(ppgSpread - ppgSpreadNba) / ppgSpreadNba > 0.15) {
    diags.push(`🔴 PPG spread P90-P10 = ${ppgSpread.toFixed(1)} (NBA ${ppgSpreadNba.toFixed(1)}) → ${ppgSpread > ppgSpreadNba ? 'too stretched' : 'too compressed'} talent curve`);
  }
  const tsTop = percentile(ts, 90);
  if (tsTop > NBA_DIST.TSpct.P90 * 1.05) diags.push(`🟡 TS% P90 ${tsTop.toFixed(1)} > NBA ${NBA_DIST.TSpct.P90.toFixed(1)} → elite efficiency too generous`);
  if (tsTop < NBA_DIST.TSpct.P90 * 0.92) diags.push(`🟡 TS% P90 ${tsTop.toFixed(1)} < NBA ${NBA_DIST.TSpct.P90.toFixed(1)} → elite efficiency too low`);

  lines.push('=== DIAGNOSTIC ===');
  if (diags.length === 0) lines.push('✅ Distribution shape matches NBA reference within ±15%.');
  else diags.forEach(d => lines.push('  ' + d));

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'DISTSHAPE', body: `${players.length} players audited. Console + clipboard.`, ok: diags.length === 0 };
}

// TIERS ───────────────────────────────────────────────────────────────────────
// PPG tier counts (≥20 GP) vs NBA 2025-26 reference. Direct check at each scoring
// tier: 30+, 28+, 26+, 24+, 22+, 20+, 18+, 15+, 12+, 10+ PPG. Reveals whether the
// talent ladder matches NBA real distribution. NBA reference (Gemini benchmark):
//   30+: ~2 (Doncic, SGA)        20+: ~37
//   28+: ~5                       18+: ~52
//   26+: ~10 (top10 floor)        15+: ~78
//   24+: ~17                      12+: ~115
//   22+: ~25                      10+: ~150

