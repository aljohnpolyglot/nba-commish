import { PlayerGameStats } from '../types';
import {
  COURT_PLAYERS,
  LG_ORTG,
  MINUTES_PER_GAME,
  calcASTPct,
  calcBPM,
  calcBlkPct,
  calcDWS,
  calcEFG,
  calcEWA,
  calcFloorPct,
  calcGameScore,
  calcORTG,
  calcOWS,
  calcPER,
  calcRebPct,
  calcStlPct,
  calcTOVPct,
  calcTS,
  calcUSG,
  calcVORP,
  estimatePossessions,
  fivePlusCategories,
  pct,
  safe,
  safeInt,
  tenPlusCategories,
} from './advancedstatsHelpers';
import type {
  AdvancedPlayerStats,
  SeasonAdvancedStats,
  TeamAdvancedStats,
} from './advancedstatsTypes';

export type {
  AdvancedPlayerStats,
  SeasonAdvancedStats,
  TeamAdvancedStats,
} from './advancedstatsTypes';

export function generateAdvancedStats(
  teamStats: PlayerGameStats[],
  oppStats: PlayerGameStats[],
  pmArray: number[] = [],
  lgORTG: number = LG_ORTG,
): AdvancedPlayerStats[] {
  const sum = (arr: PlayerGameStats[], k: keyof PlayerGameStats) =>
    arr.reduce((a, s) => a + ((s[k] as number) || 0), 0);

  const T = {
    pts: sum(teamStats, 'pts'),
    fgm: sum(teamStats, 'fgm'),
    fga: sum(teamStats, 'fga'),
    tpm: sum(teamStats, 'threePm'),
    tpa: sum(teamStats, 'threePa'),
    fpm: sum(teamStats, 'fourPm'),
    fpa: sum(teamStats, 'fourPa'),
    ftm: sum(teamStats, 'ftm'),
    fta: sum(teamStats, 'fta'),
    orb: sum(teamStats, 'orb'),
    drb: sum(teamStats, 'drb'),
    ast: sum(teamStats, 'ast'),
    tov: sum(teamStats, 'tov'),
    stl: sum(teamStats, 'stl'),
    blk: sum(teamStats, 'blk'),
    min: sum(teamStats, 'min'),
  };

  const O = {
    pts: sum(oppStats, 'pts'),
    fgm: sum(oppStats, 'fgm'),
    fga: sum(oppStats, 'fga'),
    tpm: sum(oppStats, 'threePm'),
    tpa: sum(oppStats, 'threePa'),
    fpm: sum(oppStats, 'fourPm'),
    fpa: sum(oppStats, 'fourPa'),
    ftm: sum(oppStats, 'ftm'),
    fta: sum(oppStats, 'fta'),
    orb: sum(oppStats, 'orb'),
    drb: sum(oppStats, 'drb'),
    tov: sum(oppStats, 'tov'),
    min: sum(oppStats, 'min'),
  };

  const teamPoss = estimatePossessions(T.fga, T.fta, T.orb, T.tov);
  const oppPoss = estimatePossessions(O.fga, O.fta, O.orb, O.tov);
  const teamDRTG = calcORTG(O.pts, oppPoss);
  const pace = safe(((teamPoss + oppPoss) / 2) * (MINUTES_PER_GAME / (T.min / COURT_PLAYERS)));

  return teamStats.map((s, i): AdvancedPlayerStats => {
    const {
      min, pts, fgm, fga, threePm, threePa, fourPm = 0, fourPa = 0, ftm, fta,
      orb, drb, ast, tov, stl, blk, pf,
      fgAtRim, fgaAtRim, fgLowPost, fgaLowPost, fgMidRange, fgaMidRange,
    } = s;

    const reb = (orb || 0) + (drb || 0);
    const fg2m = fgm - threePm - fourPm;
    const fg2a = fga - threePa - fourPa;

    const tsPct = calcTS(pts, fga, fta);
    const efgPct = calcEFG(fgm, threePm, fga, fourPm);
    const fgPct = pct(fgm, fga);
    const fg2Pct = pct(fg2m, fg2a);
    const threePPct = pct(threePm, threePa);
    const fourPPct = pct(fourPm, fourPa);
    const ftPct = pct(ftm, fta);
    const fgAtRimPct = pct(fgAtRim || 0, fgaAtRim || 0);
    const fgLowPostPct = pct(fgLowPost || 0, fgaLowPost || 0);
    const fgMidRangePct = pct(fgMidRange || 0, fgaMidRange || 0);
    const rimRate = fga > 0 ? safe((fgaAtRim || 0) / fga) : 0;
    const lowPostRate = fga > 0 ? safe((fgaLowPost || 0) / fga) : 0;
    const midRangeRate = fga > 0 ? safe((fgaMidRange || 0) / fga) : 0;
    const threePointRate = fga > 0 ? safe(threePa / fga) : 0;
    const fourPointRate = fga > 0 ? safe(fourPa / fga) : 0;
    const freeThrowRate = fga > 0 ? safe(fta / fga) : 0;

    const pointsInThePaint = safeInt((fgAtRim || 0) * 2 + (fgLowPost || 0) * 2);
    const secondChancePts = safeInt((orb || 0) * 1.05);

    const orbPct = calcRebPct(orb || 0, T.orb, O.drb);
    const drbPct = calcRebPct(drb || 0, T.drb, O.orb);
    const trbPct = calcRebPct(reb, T.orb + T.drb, O.orb + O.drb);

    const astPct = calcASTPct(ast, min, T.min, T.fgm, fgm);
    const astToRatio = tov > 0 ? safe(ast / tov) : safe(ast);
    const tovPct = calcTOVPct(tov, fga, fta);
    const potentialAssists = safe((ast || 0) * 1.35);

    const stlPct = calcStlPct(stl, min, T.min, oppPoss);
    const blkPct = calcBlkPct(blk, min, T.min, O.fga, O.tpa, O.fpa);
    const deflections = safe((stl || 0) * 2.4);
    const chargesDrawn = safe((pf || 0) * 0.08);

    const usgPct = calcUSG(fga, fta, tov, min, T.min, T.fga, T.fta, T.tov);
    const floorPct = calcFloorPct(pts, ast, min);
    const playerPoss = estimatePossessions(fga, fta, orb || 0, tov);
    const scoringPossessions = safe(pts > 0 ? playerPoss * floorPct : 0);

    const ortg = calcORTG(pts, playerPoss);
    const minFraction = T.min > 0 ? min / (T.min / COURT_PLAYERS) : 0;
    const drtg = safe(teamDRTG);
    const netRtg = safe(ortg - drtg);

    const p36 = (k: number) => min > 0 ? safe((k / min) * 36) : 0;
    const pts36 = p36(pts);
    const reb36 = p36(reb);
    const ast36 = p36(ast);
    const stl36 = p36(stl);
    const blk36 = p36(blk);
    const tov36 = p36(tov);
    const fga36 = p36(fga);
    const fta36 = p36(fta);

    const p100 = (k: number) => playerPoss > 0 ? safe((k * 100) / playerPoss) : 0;
    const pts100 = p100(pts);
    const ast100 = p100(ast);
    const reb100 = p100(reb);
    const stl100 = p100(stl);
    const blk100 = p100(blk);
    const tov100 = p100(tov);

    const per = calcPER(s, teamPoss);
    const ows = calcOWS(ortg, playerPoss, lgORTG);
    const dws = calcDWS(drtg, lgORTG, minFraction, teamPoss);
    const ws = safe(ows + dws);
    const wsPer48 = min > 0 ? safe((ws * MINUTES_PER_GAME) / min) : 0;

    const { obpm, dbpm, bpm } = calcBPM(s, usgPct);
    const vorp = calcVORP(bpm, min);
    const ewa = calcEWA(per, min);
    const gameScore = calcGameScore(s);
    const gmscPer40 = min > 0 ? safe((gameScore / min) * 40) : 0;
    const rawPM = pmArray[i] ?? 0;
    const pm100 = teamPoss > 0 ? safe((rawPM * 100) / teamPoss) : 0;

    const tenCats = tenPlusCategories(s);
    const fiveCats = fivePlusCategories(s);
    const dd = tenCats >= 2 ? 1 : 0;
    const td = tenCats >= 3 ? 1 : 0;
    const qd = tenCats >= 4 ? 1 : 0;
    const fxf = fiveCats >= 5 ? 1 : 0;

    return {
      playerId: s.playerId,
      name: s.name,
      min,
      tsPct,
      efgPct,
      fgPct,
      fg2Pct,
      fg2m,
      fg2a,
      threePPct,
      fourPPct,
      ftPct,
      fgAtRimPct,
      fgLowPostPct,
      fgMidRangePct,
      rimRate,
      lowPostRate,
      midRangeRate,
      threePointRate,
      fourPointRate,
      freeThrowRate,
      pointsInThePaint,
      secondChancePts,
      orbPct,
      drbPct,
      trbPct,
      astPct,
      astToRatio,
      tovPct,
      potentialAssists,
      stlPct,
      blkPct,
      deflections,
      chargesDrawn,
      usgPct,
      floorPct,
      scoringPossessions,
      ortg,
      drtg,
      netRtg,
      pts36,
      reb36,
      ast36,
      stl36,
      blk36,
      tov36,
      fga36,
      fta36,
      pts100,
      ast100,
      reb100,
      stl100,
      blk100,
      tov100,
      per,
      ows,
      dws,
      ws,
      wsPer48,
      obpm,
      dbpm,
      bpm,
      vorp,
      ewa,
      gameScore,
      gmscPer40,
      pm: rawPM,
      pm100,
      dd,
      td,
      qd,
      fxf,
      possessions: safe(playerPoss),
      pace,
    };
  });
}

export function generateTeamAdvancedStats(
  teamStats: PlayerGameStats[],
  oppStats: PlayerGameStats[],
  lgORTG: number = LG_ORTG,
): TeamAdvancedStats {
  const sum = (arr: PlayerGameStats[], k: keyof PlayerGameStats) =>
    arr.reduce((a, s) => a + ((s[k] as number) || 0), 0);

  const pts = sum(teamStats, 'pts');
  const fgm = sum(teamStats, 'fgm');
  const fga = sum(teamStats, 'fga');
  const tpm = sum(teamStats, 'threePm');
  const tpa = sum(teamStats, 'threePa');
  const fpm = sum(teamStats, 'fourPm');
  const fpa = sum(teamStats, 'fourPa');
  const ftm = sum(teamStats, 'ftm');
  const fta = sum(teamStats, 'fta');
  const orb = sum(teamStats, 'orb');
  const drb = sum(teamStats, 'drb');
  const reb = orb + drb;
  const ast = sum(teamStats, 'ast');
  const tov = sum(teamStats, 'tov');
  const stl = sum(teamStats, 'stl');
  const blk = sum(teamStats, 'blk');
  const fgAtRim = sum(teamStats, 'fgAtRim');
  const fgLowPost = sum(teamStats, 'fgLowPost');

  const oPts = sum(oppStats, 'pts');
  const oFgm = sum(oppStats, 'fgm');
  const oFga = sum(oppStats, 'fga');
  const oTpm = sum(oppStats, 'threePm');
  const oTpa = sum(oppStats, 'threePa');
  const oFpm = sum(oppStats, 'fourPm');
  const oFpa = sum(oppStats, 'fourPa');
  const oFtm = sum(oppStats, 'ftm');
  const oFta = sum(oppStats, 'fta');
  const oOrb = sum(oppStats, 'orb');
  const oDrb = sum(oppStats, 'drb');
  const oReb = oOrb + oDrb;
  const oTov = sum(oppStats, 'tov');

  const teamMin = sum(teamStats, 'min');
  const teamMinDuration = teamMin / COURT_PLAYERS;

  const poss = estimatePossessions(fga, fta, orb, tov);
  const oppPoss = estimatePossessions(oFga, oFta, oOrb, oTov);
  const pace = teamMinDuration > 0
    ? safe(((poss + oppPoss) / 2) * (MINUTES_PER_GAME / teamMinDuration))
    : safe((poss + oppPoss) / 2);

  const ortg = calcORTG(pts, poss);
  const drtg = calcORTG(oPts, oppPoss);
  const netRtg = safe(ortg - drtg);

  const efgPct = calcEFG(fgm, tpm, fga, fpm);
  const tsPct = calcTS(pts, fga, fta);
  const fg2Pct = pct(fgm - tpm - fpm, fga - tpa - fpa);
  const threePPct = pct(tpm, tpa);
  const ftPct = pct(ftm, fta);
  const threePointRate = fga > 0 ? safe(tpa / fga) : 0;
  const freeThrowRate = fga > 0 ? safe(fta / fga) : 0;
  const pointsInThePaint = safeInt(fgAtRim * 2 + fgLowPost * 2);

  const orbPct = calcRebPct(orb, orb, oDrb);
  const drbPct = calcRebPct(drb, drb, oOrb);
  const trbPct = calcRebPct(reb, reb, oReb);

  const astPct = fgm > 0 ? safe((ast / fgm) * 100) : 0;
  const astToRatio = tov > 0 ? safe(ast / tov) : 0;
  const tovPct = calcTOVPct(tov, fga, fta);

  const blkPct = (oFga - oTpa - oFpa) > 0 ? safe((blk / (oFga - oTpa - oFpa)) * 100) : 0;
  const stlPct = oppPoss > 0 ? safe((stl / oppPoss) * 100) : 0;

  const p100 = (k: number) => poss > 0 ? safe((k * 100) / poss) : 0;
  const pts100 = p100(pts);
  const ast100 = p100(ast);
  const reb100 = p100(reb);
  const tov100 = p100(tov);
  const stl100 = p100(stl);
  const blk100 = p100(blk);

  const shootingFactor = efgPct;
  const tovFactor = safe(tov100 / 100);
  const rebFactor = safe(orbPct / 100);
  const ftFactor = fga > 0 ? safe(ftm / fga) : 0;

  const oEFG = calcEFG(oFgm, oTpm, oFga, oFpm);
  const oppShootingFactor = oEFG;
  const oppTovFactor = safe(calcTOVPct(oTov, oFga, oFta) / 100);
  const oppRebFactor = safe(calcRebPct(oOrb, oOrb, drb) / 100);
  const oppFtFactor = oFga > 0 ? safe(oFtm / oFga) : 0;

  return {
    poss: safe(poss),
    oppPoss: safe(oppPoss),
    pace,
    ortg,
    drtg,
    netRtg,
    efgPct,
    tsPct,
    fg2Pct,
    threePPct,
    ftPct,
    threePointRate,
    freeThrowRate,
    pointsInThePaint,
    orbPct,
    drbPct,
    trbPct,
    astPct,
    astToRatio,
    tovPct,
    blkPct,
    stlPct,
    pts100,
    ast100,
    reb100,
    tov100,
    stl100,
    blk100,
    shootingFactor,
    tovFactor,
    rebFactor,
    ftFactor,
    oppShootingFactor,
    oppTovFactor,
    oppRebFactor,
    oppFtFactor,
  };
}

export function aggregateSeasonAdvancedStats(
  games: AdvancedPlayerStats[],
  rawBoxTotals: {
    pts: number;
    fgm: number;
    fga: number;
    tpm: number;
    tpa: number;
    ftm: number;
    fta: number;
    orb: number;
    drb: number;
    gs: number;
  },
): SeasonAdvancedStats {
  if (games.length === 0) {
    return {} as SeasonAdvancedStats;
  }

  const gp = games.length;
  const avg = (k: keyof AdvancedPlayerStats) =>
    safe(games.reduce((a, g) => a + (g[k] as number), 0) / gp);
  const tot = (k: keyof AdvancedPlayerStats) =>
    safe(games.reduce((a, g) => a + (g[k] as number), 0));

  const minTotal = games.reduce((a, g) => a + g.min, 0);

  return {
    playerId: games[0].playerId,
    name: games[0].name,
    gp,
    gs: rawBoxTotals.gs,
    minPerGame: safe(minTotal / gp),
    ptsPerGame: safe(rawBoxTotals.pts / gp),
    rebPerGame: safe((rawBoxTotals.orb + rawBoxTotals.drb) / gp),
    astPerGame: avg('ast36') * (avg('min') / 36),
    stlPerGame: avg('stl36') * (avg('min') / 36),
    blkPerGame: avg('blk36') * (avg('min') / 36),
    tovPerGame: avg('tov36') * (avg('min') / 36),
    fgmPerGame: safe(rawBoxTotals.fgm / gp),
    fgaPerGame: safe(rawBoxTotals.fga / gp),
    tsPct: calcTS(rawBoxTotals.pts, rawBoxTotals.fga, rawBoxTotals.fta),
    efgPct: calcEFG(rawBoxTotals.fgm, rawBoxTotals.tpm, rawBoxTotals.fga, (rawBoxTotals as any).fpm ?? 0),
    fgPct: pct(rawBoxTotals.fgm, rawBoxTotals.fga),
    fg2Pct: pct(
      rawBoxTotals.fgm - rawBoxTotals.tpm - ((rawBoxTotals as any).fpm ?? 0),
      rawBoxTotals.fga - rawBoxTotals.tpa - ((rawBoxTotals as any).fpa ?? 0),
    ),
    threePPct: pct(rawBoxTotals.tpm, rawBoxTotals.tpa),
    ftPct: pct(rawBoxTotals.ftm, rawBoxTotals.fta),
    threePointRate: rawBoxTotals.fga > 0 ? safe(rawBoxTotals.tpa / rawBoxTotals.fga) : 0,
    freeThrowRate: rawBoxTotals.fga > 0 ? safe(rawBoxTotals.fta / rawBoxTotals.fga) : 0,
    perSeasonAvg: avg('per'),
    usgPctAvg: avg('usgPct'),
    ortgAvg: avg('ortg'),
    drtgAvg: avg('drtg'),
    netRtgAvg: avg('netRtg'),
    orbPctAvg: avg('orbPct'),
    drbPctAvg: avg('drbPct'),
    trbPctAvg: avg('trbPct'),
    astPctAvg: avg('astPct'),
    stlPctAvg: avg('stlPct'),
    blkPctAvg: avg('blkPct'),
    tovPctAvg: avg('tovPct'),
    bpmAvg: avg('bpm'),
    obpmAvg: avg('obpm'),
    dbpmAvg: avg('dbpm'),
    wsTot: tot('ws'),
    owsTot: tot('ows'),
    dwsTot: tot('dws'),
    vorpTot: tot('vorp'),
    ewaTot: tot('ewa'),
    ddTotal: safeInt(tot('dd')),
    tdTotal: safeInt(tot('td')),
    qdTotal: safeInt(tot('qd')),
    fxfTotal: safeInt(tot('fxf')),
  };
}
