import { PlayerGameStats } from '../types';

const LG_PER = 15.0;
const LG_TS = 0.560;
const FT_POSS_FACTOR = 0.44;
export const LG_ORTG = 110.0;
export const MINUTES_PER_GAME = 48;
export const COURT_PLAYERS = 5;
const REPLACEMENT_BPM = -2.0;

export function safe(n: number, fallback = 0): number {
  return isFinite(n) && !isNaN(n) ? parseFloat(n.toFixed(4)) : fallback;
}

export function safeInt(n: number): number {
  return isFinite(n) && !isNaN(n) ? Math.round(n) : 0;
}

export function pct(made: number, att: number): number {
  return att > 0 ? safe(made / att) : 0;
}

export function estimatePossessions(fga: number, fta: number, orb: number, tov: number): number {
  return safe(fga + FT_POSS_FACTOR * fta - orb + tov);
}

export function calcTS(pts: number, fga: number, fta: number): number {
  const denom = 2 * (fga + FT_POSS_FACTOR * fta);
  return denom > 0 ? safe(pts / denom) : 0;
}

export function calcEFG(fgm: number, threePm: number, fga: number, fourPm: number = 0): number {
  return fga > 0 ? safe((fgm + 0.5 * threePm + 1.0 * fourPm) / fga) : 0;
}

export function calcUSG(
  fga: number,
  fta: number,
  tov: number,
  min: number,
  teamMin: number,
  teamFga: number,
  teamFta: number,
  teamTov: number,
): number {
  const denom = min * (teamFga + FT_POSS_FACTOR * teamFta + teamTov);
  return denom > 0 ? safe(((fga + FT_POSS_FACTOR * fta + tov) * (teamMin / COURT_PLAYERS)) / denom * 100) : 0;
}

export function calcRebPct(playerReb: number, teamReb: number, oppReb: number): number {
  return (teamReb + oppReb) > 0 ? safe((playerReb / (teamReb + oppReb)) * 100) : 0;
}

export function calcASTPct(ast: number, min: number, teamMin: number, teamFGM: number, playerFGM: number): number {
  const onFloorFGM = teamFGM - playerFGM;
  return min > 0 && onFloorFGM > 0 ? safe((ast * (teamMin / COURT_PLAYERS)) / (min * onFloorFGM) * 100) : 0;
}

export function calcStlPct(stl: number, min: number, teamMin: number, oppPoss: number): number {
  return min > 0 && oppPoss > 0 ? safe((stl * (teamMin / COURT_PLAYERS)) / (min * oppPoss) * 100) : 0;
}

export function calcBlkPct(blk: number, min: number, teamMin: number, oppFGA: number, oppTPA: number, oppFPA: number = 0): number {
  const opp2PA = oppFGA - oppTPA - oppFPA;
  return min > 0 && opp2PA > 0 ? safe((blk * (teamMin / COURT_PLAYERS)) / (min * opp2PA) * 100) : 0;
}

export function calcTOVPct(tov: number, fga: number, fta: number): number {
  const possUsed = fga + FT_POSS_FACTOR * fta + tov;
  return possUsed > 0 ? safe((tov / possUsed) * 100) : 0;
}

export function calcFloorPct(pts: number, ast: number, min: number): number {
  if (min <= 0) return 0;
  const scoringPos = pts + 0.5 * ast;
  return safe(Math.min(1, scoringPos / Math.max(1, min)));
}

export function calcPER(s: PlayerGameStats, teamPoss: number): number {
  const { min, fgm, fga, ftm, fta, orb, drb, ast, stl, blk, tov, pf } = s;
  const threePm = s.threePm ?? 0;
  const fourPm = s.fourPm ?? 0;
  if (min === 0) return 0;

  const uProd =
    fgm * 85.910
    + stl * 53.897
    + threePm * 51.757
    + fourPm * 80.0
    + ftm * 46.845
    + blk * 39.19
    + orb * 39.19
    + ast * 34.677
    + drb * 14.707
    - pf * 17.174
    - (fta - ftm) * 20.091
    - (fga - fgm) * 39.19
    - tov * 53.897;

  const paceFactor = teamPoss > 0 ? MINUTES_PER_GAME / teamPoss : 1;
  const PER_NORMALIZATION_FACTOR = 1.4;
  return safe((uProd / min) * paceFactor * PER_NORMALIZATION_FACTOR);
}

export function calcGameScore(s: PlayerGameStats): number {
  return safe(
    s.pts
    + 0.4 * s.fgm
    - 0.7 * s.fga
    - 0.4 * (s.fta - s.ftm)
    + 0.7 * s.orb
    + 0.3 * s.drb
    + s.stl
    + 0.7 * s.ast
    + 0.7 * s.blk
    - 0.4 * s.pf
    - s.tov
  );
}

export function calcORTG(pts: number, poss: number): number {
  return poss > 0 ? safe((pts / poss) * 100) : 0;
}

export function calcOWS(ortg: number, poss: number, lgORTG: number): number {
  const margOff = ((ortg / 100) - (lgORTG / 100) * 0.92) * poss;
  const margPtsPerWin = 0.32 * lgORTG * 2.3;
  return margPtsPerWin > 0 ? safe(margOff / margPtsPerWin) : 0;
}

export function calcDWS(drtg: number, lgORTG: number, minFraction: number, teamPoss: number): number {
  const margDef = ((lgORTG / 100) * 1.08 - (drtg / 100)) * teamPoss * minFraction;
  const margPtsPerWin = 0.32 * lgORTG * 2.3;
  return margPtsPerWin > 0 ? safe(margDef / margPtsPerWin) : 0;
}

export function calcBPM(s: PlayerGameStats, usgPct: number): { obpm: number; dbpm: number; bpm: number } {
  const { min } = s;
  if (min === 0) return { obpm: 0, dbpm: 0, bpm: 0 };

  const p36 = (k: number) => (k / min) * 36;
  const pts36 = p36(s.pts);
  const ast36 = p36(s.ast);
  const orb36 = p36(s.orb);
  const drb36 = p36(s.drb);
  const tov36 = p36(s.tov);
  const stl36 = p36(s.stl);
  const blk36 = p36(s.blk);
  const ts = calcTS(s.pts, s.fga, s.fta);
  const tsAdj = ts - LG_TS;

  const obpm = safe(
    pts36 * 0.306
    + ast36 * 0.685
    + orb36 * 0.624
    + drb36 * 0.136
    - tov36 * 0.442
    + tsAdj * 14.2
    + usgPct * 0.012
    - 3.5
  );
  const dbpm = safe(
    stl36 * 2.02
    + blk36 * 1.07
    + drb36 * 0.31
    - tov36 * 0.26
    - 1.92
  );
  const BPM_SCALE = 0.58;
  return {
    obpm: safe(obpm * BPM_SCALE),
    dbpm: safe(dbpm * BPM_SCALE),
    bpm: safe((obpm + dbpm) * BPM_SCALE),
  };
}

export function calcVORP(bpm: number, min: number): number {
  return safe((bpm - REPLACEMENT_BPM) * (min / MINUTES_PER_GAME) * (1 / 82));
}

export function calcEWA(per: number, min: number): number {
  const PRL = 11;
  return safe((per - PRL) * (min / MINUTES_PER_GAME) / 42);
}

export function tenPlusCategories(s: PlayerGameStats): number {
  return [s.pts, s.orb + s.drb, s.ast, s.stl, s.blk].filter(v => (v || 0) >= 10).length;
}

export function fivePlusCategories(s: PlayerGameStats): number {
  return [s.pts, s.orb + s.drb, s.ast, s.stl, s.blk].filter(v => (v || 0) >= 5).length;
}
