import type { GameState } from '../../types';
import { copyTextToClipboard, type CheatResult } from './shared';

export async function runTiers(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 20;

  type PR = { name: string; tid: number; gp: number; pts: number };
  const players: PR[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const stats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (stats.length === 0) continue;
    const s = stats[stats.length - 1];
    if ((s.gp ?? 0) < MIN_GP) continue;
    players.push({ name: p.name, tid: p.tid, gp: s.gp, pts: s.pts ?? 0 });
  }

  if (players.length < 50) {
    return { title: 'TIERS', body: `Only ${players.length} players with ≥${MIN_GP} GP — need ≥50.`, ok: false };
  }

  const withPpg = players.map(p => ({ ...p, ppg: p.gp > 0 ? p.pts / p.gp : 0 }));
  withPpg.sort((a, b) => b.ppg - a.ppg);

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  const tiers = [
    { thr: 30, nba: 2,   tol: 1 },
    { thr: 28, nba: 5,   tol: 2 },
    { thr: 26, nba: 10,  tol: 3 },
    { thr: 24, nba: 17,  tol: 4 },
    { thr: 22, nba: 25,  tol: 5 },
    { thr: 20, nba: 37,  tol: 6 },
    { thr: 18, nba: 52,  tol: 8 },
    { thr: 15, nba: 78,  tol: 10 },
    { thr: 12, nba: 115, tol: 15 },
    { thr: 10, nba: 150, tol: 20 },
  ];

  const lines: string[] = [];
  lines.push(`TIERS — PPG tier counts vs NBA 2025-26 (≥${MIN_GP} GP)`);
  lines.push(`Sample: ${withPpg.length} qualifying NBA players, season ${currentYear}.`);
  lines.push('');
  lines.push('=== TIER COUNTS ===');
  lines.push('THRESHOLD\tSIM_COUNT\tNBA_COUNT\tDELTA\tFLAG');
  tiers.forEach(t => {
    const count = withPpg.filter(p => p.ppg >= t.thr).length;
    const delta = count - t.nba;
    const flag = Math.abs(delta) <= t.tol ? '✅' : delta < 0 ? '🔴 UNDER' : '🟡 OVER';
    lines.push(`${t.thr}+ PPG\t${count}\t${t.nba}\t${delta >= 0 ? '+' : ''}${delta}\t${flag}`);
  });
  lines.push('');

  lines.push('=== PLAYERS NEAR EACH TIER BOUNDARY ===');
  lines.push('TIER\tRANK\tPLAYER\tTEAM\tGP\tPPG');
  tiers.forEach(t => {
    if (t.nba < 1 || t.nba > withPpg.length) return;
    const idx = Math.min(t.nba - 1, withPpg.length - 1);
    const p = withPpg[idx];
    lines.push(`${t.thr}+\t#${idx + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${p.ppg.toFixed(1)}`);
  });
  lines.push('');

  const lines30 = withPpg.filter(p => p.ppg >= 30).length;
  const lines20 = withPpg.filter(p => p.ppg >= 20).length;
  const lines15 = withPpg.filter(p => p.ppg >= 15).length;
  lines.push('=== DIAGNOSTIC ===');
  if (Math.abs(lines30 - 2) > 2) lines.push(`🟡 30+ PPG: ${lines30} (NBA ~2) — ${lines30 > 2 ? 'too many elite scorers' : 'no elite scorers'}`);
  if (Math.abs(lines20 - 37) > 6) lines.push(`🔴 20+ PPG: ${lines20} (NBA ~37) — ${lines20 < 37 ? 'star tier compressed (mid-tier scorers missing)' : 'star tier inflated'}`);
  if (Math.abs(lines15 - 78) > 10) lines.push(`🟡 15+ PPG: ${lines15} (NBA ~78) — ${lines15 < 78 ? 'second-tier scorers compressed' : 'too many secondary scorers'}`);

  const matchCount = tiers.filter(t => {
    const c = withPpg.filter(p => p.ppg >= t.thr).length;
    return Math.abs(c - t.nba) <= t.tol;
  }).length;
  lines.push(`Tiers within NBA tolerance: ${matchCount} / ${tiers.length}`);
  if (matchCount === tiers.length) lines.push('✅ Talent ladder fully NBA-aligned.');
  else if (matchCount >= 7) lines.push('🟢 Talent ladder mostly NBA-aligned.');
  else if (matchCount >= 4) lines.push('🟡 Talent ladder partially aligned — mid-tier off.');
  else lines.push('🔴 Talent ladder significantly compressed/stretched vs NBA.');

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'TIERS', body: `${withPpg.length} players. ${matchCount}/${tiers.length} tiers within NBA tolerance.`, ok: matchCount >= 7 };
}

export async function runAdvCheck(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 20;

  type AggP = {
    name: string; tid: number;
    gp: number; min: number; pts: number; fga: number; fgm: number;
    t3m: number; t3a: number; ft: number; fta: number;
    ast: number; reb: number; stl: number; blk: number; tov: number;
    ws: number; ows: number; dws: number; vorp: number; ewa: number;
    per: number; usg: number; ortg: number; drtg: number;
    bpm: number; obpm: number; dbpm: number; ts: number; ws48: number;
  };

  const players: AggP[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const seasonStats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (seasonStats.length === 0) continue;

    let gp = 0, min = 0, pts = 0, fga = 0, fgm = 0, t3m = 0, t3a = 0;
    let ft = 0, fta = 0, ast = 0, reb = 0, stl = 0, blk = 0, tov = 0;
    let ws = 0, ows = 0, dws = 0, vorp = 0, ewa = 0;
    let perW = 0, usgW = 0, ortgW = 0, drtgW = 0;
    let bpmW = 0, obpmW = 0, dbpmW = 0, tsW = 0, ws48W = 0;
    let weightMin = 0;
    for (const s of seasonStats) {
      const m = s.min ?? 0;
      gp += s.gp ?? 0; min += m; pts += s.pts ?? 0;
      fga += s.fga ?? 0; fgm += s.fg ?? 0;
      t3m += s.tp ?? 0; t3a += s.tpa ?? 0;
      ft += s.ft ?? 0; fta += s.fta ?? 0;
      ast += s.ast ?? 0;
      reb += s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0));
      stl += s.stl ?? 0; blk += s.blk ?? 0; tov += s.tov ?? 0;
      ws += s.ws ?? 0; ows += s.ows ?? 0; dws += s.dws ?? 0; vorp += s.vorp ?? 0;
      ewa += s.ewa ?? 0;
      if (m > 0) {
        perW += (s.per ?? 0) * m;
        usgW += (s.usgPct ?? 0) * m;
        ortgW += (s.ortg ?? 0) * m;
        drtgW += (s.drtg ?? 0) * m;
        bpmW += (s.bpm ?? 0) * m;
        obpmW += (s.obpm ?? 0) * m;
        dbpmW += (s.dbpm ?? 0) * m;
        tsW += (s.tsPct ?? 0) * m;
        const stintWs48 = s.ws48 ?? (s as any).wsPer48 ?? ((s.ws ?? 0) * 48 / Math.max(1, m));
        ws48W += stintWs48 * m;
        weightMin += m;
      }
    }

    if (gp < MIN_GP) continue;

    const div = (n: number, d: number) => d > 0 ? n / d : 0;
    players.push({
      name: p.name, tid: p.tid,
      gp, min, pts, fga, fgm, t3m, t3a, ft, fta, ast, reb, stl, blk, tov,
      ws, ows, dws, vorp, ewa,
      per: div(perW, weightMin),
      usg: div(usgW, weightMin),
      ortg: div(ortgW, weightMin),
      drtg: div(drtgW, weightMin),
      bpm: div(bpmW, weightMin),
      obpm: div(obpmW, weightMin),
      dbpm: div(dbpmW, weightMin),
      ts: div(tsW, weightMin),
      ws48: div(ws48W, weightMin),
    });
  }

  if (players.length < 30) {
    return { title: 'ADVCHECK', body: `Only ${players.length} players with ≥${MIN_GP} GP — need ≥30.`, ok: false };
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  const lines: string[] = [];
  lines.push(`ADVCHECK — Advanced Stats vs NBA 2025-26 reference`);
  lines.push(`Sample: ${players.length} qualifying NBA players (≥${MIN_GP} GP, trade-aggregated). Season ${currentYear}.`);
  lines.push('');

  type RefT = { top1: number; top5: number; leaders: string };
  const showTop = (label: string, scoreFn: (p: AggP) => number, fmt: (n: number) => string, ref: RefT, ascending = false) => {
    const sorted = [...players].sort((a, b) => ascending ? scoreFn(a) - scoreFn(b) : scoreFn(b) - scoreFn(a)).slice(0, 5);
    lines.push(`=== ${label} (NBA top-1: ${ref.top1}, top-5: ${ref.top5} | ${ref.leaders}) ===`);
    lines.push('rank\tname\tteam\tGP\tvalue');
    sorted.forEach((p, i) => lines.push(`${i + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${fmt(scoreFn(p))}`));
    const top1 = scoreFn(sorted[0]);
    const tolerance = ref.top1 * 0.15;
    const flag1 = ascending
      ? (top1 < ref.top1 - tolerance ? '🔴 too good' : top1 > ref.top1 + tolerance ? '🔴 worse than NBA top' : '✓')
      : (top1 > ref.top1 * 1.15 ? '🔴 over NBA' : top1 < ref.top1 * 0.85 ? '🔴 under NBA' : '✓');
    lines.push(`status\ttop1=${fmt(top1)} ${flag1}`);
    lines.push('');
  };

  showTop('PER', p => p.per, n => n.toFixed(1), { top1: 32.3, top5: 22.0, leaders: 'Jokic 32.3, SGA 30.8, Doncic 27.9' });
  showTop('USG%', p => p.usg, n => n.toFixed(1), { top1: 38.1, top5: 29.4, leaders: 'Doncic 38.1, J.Brown 36.2, Jokic 30.4' });
  const RATE_MIN_MIN = 1500;
  const rateQualifying = players.filter(p => p.min >= RATE_MIN_MIN);
  const showTopRate = (label: string, scoreFn: (p: AggP) => number, fmt: (n: number) => string, ref: RefT, ascending = false) => {
    const sorted = [...rateQualifying].sort((a, b) => ascending ? scoreFn(a) - scoreFn(b) : scoreFn(b) - scoreFn(a)).slice(0, 5);
    if (sorted.length === 0) { lines.push(`=== ${label} === (no players ≥${RATE_MIN_MIN} min)`); lines.push(''); return; }
    lines.push(`=== ${label} (≥${RATE_MIN_MIN} min, NBA top-1: ${ref.top1}, top-5: ${ref.top5} | ${ref.leaders}) ===`);
    lines.push('rank\tname\tteam\tGP\tmin\tvalue');
    sorted.forEach((p, i) => lines.push(`${i + 1}\t${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${p.min.toFixed(0)}\t${fmt(scoreFn(p))}`));
    const top1 = scoreFn(sorted[0]);
    const flag1 = ascending
      ? (top1 < ref.top1 * 0.95 ? '🔴 too good' : top1 > ref.top1 * 1.10 ? '🔴 worse than NBA' : '✓')
      : (top1 > ref.top1 * 1.15 ? '🔴 over NBA' : top1 < ref.top1 * 0.85 ? '🔴 under NBA' : '✓');
    lines.push(`status\ttop1=${fmt(top1)} ${flag1}`);
    lines.push('');
  };
  showTopRate('ORtg', p => p.ortg, n => n.toFixed(1), { top1: 126, top5: 120, leaders: 'Jokic 126, SGA 125, Durant 124' });
  showTopRate('DRtg (lower=better)', p => p.drtg, n => n.toFixed(1), { top1: 101.0, top5: 107.1, leaders: 'Wemby 101, Holmgren 104.5, Gobert 105.8' }, true);
  showTop('BPM', p => p.bpm, n => n.toFixed(1), { top1: 14.2, top5: 5.1, leaders: 'Jokic 14.2, SGA 11.7, Doncic 9.3' });
  showTop('VORP', p => p.vorp, n => n.toFixed(1), { top1: 9.2, top5: 4.7, leaders: 'Jokic 9.2, SGA 7.8, Doncic 6.6' });
  showTop('EWA', p => p.ewa, n => n.toFixed(1), { top1: 22, top5: 14, leaders: 'Jokic ~22, SGA ~18, Doncic ~15 (Hollinger MVP-tier 22-30)' });
  showTop('WS', p => p.ws, n => n.toFixed(1), { top1: 15.2, top5: 9.5, leaders: 'SGA 15.2, Jokic 14.9, Durant 10.7' });
  showTop('WS/48', p => p.ws48, n => n.toFixed(3), { top1: 0.316, top5: 0.180, leaders: 'Jokic .316, SGA .295, Doncic .199' });

  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrity || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats);
  });

  type TR = { tid: number; gp: number; pts: number; opp: number; fga: number; fta: number; tov: number; orb: number };
  const teamMap = new Map<number, TR>();
  const ensure = (tid: number): TR => {
    if (!teamMap.has(tid)) teamMap.set(tid, { tid, gp: 0, pts: 0, opp: 0, fga: 0, fta: 0, tov: 0, orb: 0 });
    return teamMap.get(tid)!;
  };
  const sumLines = (lines: any[], k: string) => lines.reduce((s, p) => s + (p[k] ?? 0), 0);
  for (const g of boxes) {
    const home = ensure((g as any).homeTeamId);
    const away = ensure((g as any).awayTeamId);
    home.gp++; away.gp++;
    home.pts += (g as any).homeScore; home.opp += (g as any).awayScore;
    away.pts += (g as any).awayScore; away.opp += (g as any).homeScore;
    const hs = (g as any).homeStats, as = (g as any).awayStats;
    home.fga += sumLines(hs, 'fga'); home.fta += sumLines(hs, 'fta');
    home.tov += sumLines(hs, 'tov'); home.orb += sumLines(hs, 'orb');
    away.fga += sumLines(as, 'fga'); away.fta += sumLines(as, 'fta');
    away.tov += sumLines(as, 'tov'); away.orb += sumLines(as, 'orb');
  }

  const PACE_CORRECTION = 0.965;
  const teamRows = Array.from(teamMap.values()).filter(t => t.gp >= 5).map(t => {
    const possPg = ((t.fga + 0.44 * t.fta + t.tov - t.orb) / t.gp) * PACE_CORRECTION;
    const ortg = possPg > 0 ? (t.pts / t.gp / possPg) * 100 : 0;
    const drtg = possPg > 0 ? (t.opp / t.gp / possPg) * 100 : 0;
    return {
      tid: t.tid, abbrev: abbrev(t.tid), gp: t.gp,
      ppg: t.pts / t.gp, opp: t.opp / t.gp,
      ortg, drtg, netrtg: ortg - drtg, pace: possPg,
    };
  });

  // Best ORtg (highest), best DRtg (lowest), best NetRtg (highest), pace range
  const bestOrtg = [...teamRows].sort((a, b) => b.ortg - a.ortg);
  const bestDrtg = [...teamRows].sort((a, b) => a.drtg - b.drtg);  // lower is better
  const bestNet = [...teamRows].sort((a, b) => b.netrtg - a.netrtg);
  const paceSorted = [...teamRows].sort((a, b) => b.pace - a.pace);

  lines.push('=== TEAM ADVANCED ===');
  lines.push('METRIC\tSIM_TOP_TEAM\tSIM_VALUE\tNBA_TOP\tSIM_BOT_TEAM\tSIM_VALUE\tNBA_BOT');
  lines.push(`ORtg\t${bestOrtg[0].abbrev}\t${bestOrtg[0].ortg.toFixed(1)}\t122.63 (DEN)\t${bestOrtg[bestOrtg.length-1].abbrev}\t${bestOrtg[bestOrtg.length-1].ortg.toFixed(1)}\t108.84 (BKN)`);
  lines.push(`DRtg\t${bestDrtg[0].abbrev}\t${bestDrtg[0].drtg.toFixed(1)}\t107.89 (OKC)\t${bestDrtg[bestDrtg.length-1].abbrev}\t${bestDrtg[bestDrtg.length-1].drtg.toFixed(1)}\t122.84 (WAS)`);
  lines.push(`NetRtg\t${bestNet[0].abbrev}\t${bestNet[0].netrtg >= 0 ? '+' : ''}${bestNet[0].netrtg.toFixed(1)}\t-\t${bestNet[bestNet.length-1].abbrev}\t${bestNet[bestNet.length-1].netrtg >= 0 ? '+' : ''}${bestNet[bestNet.length-1].netrtg.toFixed(1)}\t-`);
  lines.push(`PACE\t${paceSorted[0].abbrev}\t${paceSorted[0].pace.toFixed(1)}\t101.5 (IND)\t${paceSorted[paceSorted.length-1].abbrev}\t${paceSorted[paceSorted.length-1].pace.toFixed(1)}\t94.0 (PHI)`);

  // League means
  const lgOrtg = teamRows.reduce((s, t) => s + t.ortg, 0) / teamRows.length;
  const lgDrtg = teamRows.reduce((s, t) => s + t.drtg, 0) / teamRows.length;
  const lgPace = teamRows.reduce((s, t) => s + t.pace, 0) / teamRows.length;
  lines.push('');
  lines.push('=== LEAGUE MEAN ADVANCED ===');
  lines.push('METRIC\tSIM\tNBA\tSTATUS');
  const checkLg = (name: string, v: number, nba: number, tol: number) => {
    const ok = Math.abs(v - nba) <= tol;
    lines.push(`${name}\t${v.toFixed(1)}\t${nba}\t${ok ? '✓' : v > nba ? '🟡 HIGH' : '🟡 LOW'}`);
  };
  checkLg('ORtg', lgOrtg, 115.6, 2);
  checkLg('DRtg', lgDrtg, 115.6, 2);
  checkLg('PACE', lgPace, 98.2, 2);

  // Diagnostic
  lines.push('');
  lines.push('=== DIAGNOSTIC ===');
  const diags: string[] = [];
  // DRtg architectural sanity check
  const simDrtgTop = bestDrtg[0].drtg;
  if (simDrtgTop < 95) diags.push(`🔴 Top DRtg ${simDrtgTop.toFixed(1)} < 95 — DRtg too low (defense over-buffed)`);
  if (simDrtgTop > 110) diags.push(`🔴 Top DRtg ${simDrtgTop.toFixed(1)} > 110 — no elite defense (DRtg compressed)`);
  // ORtg sanity
  const simOrtgTop = bestOrtg[0].ortg;
  if (simOrtgTop < 115) diags.push(`🟡 Top ORtg ${simOrtgTop.toFixed(1)} < 115 — top offense weak`);
  if (simOrtgTop > 130) diags.push(`🟡 Top ORtg ${simOrtgTop.toFixed(1)} > 130 — top offense over-buffed`);
  // PACE sanity
  if (lgPace < 95) diags.push(`🟡 League PACE ${lgPace.toFixed(1)} < 95 — too slow`);
  if (lgPace > 102) diags.push(`🟡 League PACE ${lgPace.toFixed(1)} > 102 — too fast`);

  if (diags.length === 0) lines.push('✅ Team advanced metrics in NBA range.');
  else diags.forEach(d => lines.push('  ' + d));

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'ADVCHECK', body: `${players.length} players + ${teamRows.length} teams audited. Console + clipboard.`, ok: diags.length === 0 };
}

export async function runBenchEff(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const MIN_GP = 20;
  const MIN_MPG_LO = 14;
  const MIN_MPG_HI = 26;

  type AggP = {
    name: string; tid: number; gp: number; gs: number; min: number; mpg: number;
    pts: number; fga: number; fgm: number; t3m: number;
    ft: number; fta: number; tov: number; ast: number;
    per: number; ts: number; usg: number; bpm: number; ws48: number;
    fgaPerMin: number; ppg: number; eFG: number;
  };

  const players: AggP[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const seasonStats = ((p as any).stats as any[] | undefined ?? []).filter(s => s.season === currentYear && !s.playoffs);
    if (seasonStats.length === 0) continue;

    let gp = 0, gs = 0, min = 0, pts = 0, fga = 0, fgm = 0, t3m = 0;
    let ft = 0, fta = 0, ast = 0, tov = 0;
    let perW = 0, tsW = 0, usgW = 0, bpmW = 0, ws48W = 0;
    let weightMin = 0;
    for (const s of seasonStats) {
      const m = s.min ?? 0;
      gp += s.gp ?? 0; min += m;
      gs += s.gs ?? 0;
      pts += s.pts ?? 0; fga += s.fga ?? 0; fgm += s.fg ?? 0;
      t3m += s.tp ?? 0; ft += s.ft ?? 0; fta += s.fta ?? 0;
      ast += s.ast ?? 0; tov += s.tov ?? 0;
      if (m > 0) {
        perW += (s.per ?? 0) * m;
        tsW += (s.tsPct ?? 0) * m;
        usgW += (s.usgPct ?? 0) * m;
        bpmW += (s.bpm ?? 0) * m;
        ws48W += (s.ws48 ?? (s as any).wsPer48 ?? ((s.ws ?? 0) * 48 / Math.max(1, m))) * m;
        weightMin += m;
      }
    }
    if (gp < MIN_GP) continue;
    const mpg = min / gp;
    if (mpg < MIN_MPG_LO || mpg > MIN_MPG_HI) continue;

    const div = (n: number, d: number) => d > 0 ? n / d : 0;
    players.push({
      name: p.name, tid: p.tid, gp, gs, min, mpg,
      pts, fga, fgm, t3m, ft, fta, tov, ast,
      per: div(perW, weightMin),
      ts: div(tsW, weightMin),
      usg: div(usgW, weightMin),
      bpm: div(bpmW, weightMin),
      ws48: div(ws48W, weightMin),
      fgaPerMin: div(fga, min),
      ppg: div(pts, gp),
      eFG: fga > 0 ? ((fgm + 0.5 * t3m) / fga) * 100 : 0,
    });
  }

  if (players.length < 30) {
    return { title: 'BENCHEFF', body: `Only ${players.length} sixth-men found (${MIN_MPG_LO}-${MIN_MPG_HI} mpg, ≥${MIN_GP} GP) — need ≥30.`, ok: false };
  }

  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;
  const isBench = (p: AggP) => p.gs < Math.max(10, p.gp * 0.4);

  const sorted = [...players].sort((a, b) => b.per - a.per);
  const top15 = sorted.slice(0, 15);

  const lines: string[] = [];
  lines.push(`BENCHEFF — Sixth-man efficiency audit (${MIN_MPG_LO}-${MIN_MPG_HI} mpg, ≥${MIN_GP} GP, trade-aggregated)`);
  lines.push(`Sample: ${players.length} sixth-men in season ${currentYear}.`);
  lines.push(`NBA real reference (2025-26): Herro 16 PER, Powell 17, Clarkson 15, Carrington 14 (PER 13-17 typical for top sixth-men).`);
  lines.push('');
  lines.push('=== TOP 15 BY PER ===');
  lines.push('rank\tname\tteam\tGP\tGS\tmpg\tPPG\tPER\tTS%\tUSG%\teFG%\tFGA/min\tBPM\tWS/48\trole');
  top15.forEach((p, i) => lines.push([
    i + 1, p.name, abbrev(p.tid), p.gp,
    p.gs,
    p.mpg.toFixed(1), p.ppg.toFixed(1),
    p.per.toFixed(1), p.ts.toFixed(3), p.usg.toFixed(1),
    p.eFG.toFixed(1), p.fgaPerMin.toFixed(2),
    p.bpm.toFixed(1), p.ws48.toFixed(3),
    isBench(p) ? 'BENCH' : 'STARTERISH',
  ].join('\t')));
  lines.push('');

  const tier17 = players.filter(p => p.per >= 17).length;
  const tier15 = players.filter(p => p.per >= 15 && p.per < 17).length;
  const tier13 = players.filter(p => p.per >= 13 && p.per < 15).length;
  const tier10 = players.filter(p => p.per >= 10 && p.per < 13).length;
  const tier05 = players.filter(p => p.per >= 5 && p.per < 10).length;
  const tierNeg = players.filter(p => p.per < 5).length;

  lines.push('=== PER TIER DISTRIBUTION ===');
  lines.push('TIER\tSIM_COUNT\tNBA_EXPECT\tFLAG');
  const checkTier = (label: string, c: number, expect: number, tol: number) => {
    const flag = Math.abs(c - expect) <= tol ? '✓' : c > expect ? '🟡 OVER' : '🔴 UNDER';
    lines.push(`${label}\t${c}\t${expect}\t${flag}`);
  };
  checkTier('PER ≥17 (elite gems)', tier17, 8, 4);
  checkTier('PER 15-17 (strong sixth-man)', tier15, 18, 6);
  checkTier('PER 13-15 (solid rotation)', tier13, 30, 8);
  checkTier('PER 10-13 (regular role)', tier10, 40, 10);
  checkTier('PER 5-10 (marginal)', tier05, 25, 8);
  checkTier('PER <5 (truly bad / negative)', tierNeg, 8, 5);
  lines.push('');

  const diags: string[] = [];
  if (tier17 < 4) diags.push(`🔴 Only ${tier17} sixth-men with PER ≥17 (NBA: ~8) — elite gems suppressed`);
  if (tier15 + tier17 < 18) diags.push(`🔴 Only ${tier15 + tier17} sixth-men with PER ≥15 (NBA: ~26) — high-tier compression`);
  if (tierNeg > 18) diags.push(`🟡 ${tierNeg} sixth-men with PER <5 (NBA: ~8) — too many negative-PER role players`);

  const gemCandidates = players.filter(p => p.mpg < 22 && p.per >= 13 && isBench(p));
  lines.push(`=== POTENTIAL GEMS (bench, mpg <22, PER ≥13) — ${gemCandidates.length} found (NBA real: ~15-25) ===`);
  if (gemCandidates.length === 0) {
    lines.push('🔴 NO bench gems found — every high-PER player is high-mpg starter (PER tied to minutes)');
  } else {
    lines.push('name\tteam\tGP\tGS\tmpg\tPPG\tPER\tTS%\tUSG%');
    gemCandidates
      .sort((a, b) => b.per - a.per)
      .slice(0, 10)
      .forEach(p => lines.push(`${p.name}\t${abbrev(p.tid)}\t${p.gp}\t${p.gs}\t${p.mpg.toFixed(1)}\t${p.ppg.toFixed(1)}\t${p.per.toFixed(1)}\t${p.ts.toFixed(3)}\t${p.usg.toFixed(1)}`));
  }
  lines.push('');

  const teamRows = teams
    .filter((t: any) => typeof t.id === 'number' && t.id >= 0 && t.id < 100)
    .map((t: any) => {
      const teamPlayers = players.filter(p => p.tid === t.id);
      const benchPlayers = teamPlayers.filter(isBench);
      const bench10 = benchPlayers.filter(p => p.per >= 10).length;
      const bench13 = benchPlayers.filter(p => p.per >= 13).length;
      const starter10 = teamPlayers.filter(p => !isBench(p) && p.per >= 10).length;
      const topBench = [...benchPlayers].sort((a, b) => b.per - a.per)[0];
      return {
        tid: t.id,
        team: abbrev(t.id),
        benchCount: benchPlayers.length,
        bench10,
        bench13,
        starter10,
        topBenchName: topBench?.name ?? '-',
        topBenchPer: topBench ? topBench.per : -99,
        topBenchMpg: topBench?.mpg ?? 0,
      };
    })
    .filter(r => r.benchCount > 0)
    .sort((a, b) => b.bench13 - a.bench13 || b.bench10 - a.bench10 || b.topBenchPer - a.topBenchPer);

  lines.push('=== TEAM BENCH GEM SCAN ===');
  lines.push('team\tbenchPlayers\tbenchPER10+\tbenchPER13+\tstarterPER10+\ttopBench\ttopBenchPER\ttopBenchMPG');
  teamRows.forEach(r => lines.push([
    r.team,
    r.benchCount,
    r.bench10,
    r.bench13,
    r.starter10,
    r.topBenchName,
    r.topBenchPer >= 0 ? r.topBenchPer.toFixed(1) : '-',
    r.topBenchMpg.toFixed(1),
  ].join('\t')));
  lines.push('');

  const deadBenchTeams = teamRows.filter(r => r.bench13 === 0);
  const richBenchTeams = teamRows.filter(r => r.bench13 >= 2);
  if (deadBenchTeams.length > Math.round(teamRows.length * 0.65)) {
    diags.push(`🔴 ${deadBenchTeams.length}/${teamRows.length} teams have zero bench PER ≥13 players — no hidden gems`);
  }
  if (richBenchTeams.length < 4) {
    diags.push(`🟡 Only ${richBenchTeams.length} teams have 2+ bench PER ≥13 players — bench quality too top-heavy`);
  }

  lines.push('=== DIAGNOSTIC ===');
  if (diags.length === 0) lines.push('✅ Sixth-man PER distribution NBA-aligned.');
  else diags.forEach(d => lines.push('  ' + d));

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return { title: 'BENCHEFF', body: `${players.length} sixth-men, ${gemCandidates.length} bench gems, ${deadBenchTeams.length} teams with zero bench PER 13+. Console + clipboard.`, ok: diags.length === 0 };
}
