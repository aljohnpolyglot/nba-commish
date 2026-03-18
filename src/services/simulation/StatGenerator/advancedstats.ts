/**
 * advancedStats.ts
 *
 * Generates every derivable advanced stat for players AND teams from a box score.
 *
 * Stat families covered:
 *  • Shooting efficiency  — TS%, eFG%, 2P%, 3P%, FT%, zone %, rates
 *  • Rebounding %         — ORB%, DRB%, TRB%
 *  • Playmaking           — AST%, TOV%, AST/TOV
 *  • Defense              — STL%, BLK%
 *  • Usage / floor        — USG%, Floor%
 *  • Ratings              — ORTG, DRTG, NetRtg, per-100-poss
 *  • Per-36               — pts, reb, ast, stl, blk, tov
 *  • PER                  — Hollinger Player Efficiency Rating
 *  • Win Shares           — OWS, DWS, WS, WS/48
 *  • Box Plus/Minus       — OBPM, DBPM, BPM  (Engelmann simplified)
 *  • VORP                 — Value Over Replacement Player
 *  • EWA                  — Estimated Wins Added
 *  • Game Score           — Hollinger, per-40 scaled
 *  • Plus/Minus           — raw PM, PM/100
 *  • Milestones           — DD, TD, QD, 5×5
 *  • Pace / possessions
 *  • Dean Oliver Four Factors (team)
 *  • Clutch / shot-quality proxies
 */

import { PlayerGameStats } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const LG_PER              = 15.0;   // league-average PER
const LG_TS               = 0.560;  // league-average True Shooting %
const LG_ORTG             = 110.0;  // league-average Offensive Rating (baseline)
const FT_POSS_FACTOR      = 0.44;   // FTA → possession multiplier
const MINUTES_PER_GAME    = 48;
const COURT_PLAYERS       = 5;
const REPLACEMENT_BPM     = -2.0;   // BPM replacement level

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface AdvancedPlayerStats {
  // Identity
  playerId: string;
  name: string;
  min: number;

  // ── Shooting Efficiency ──────────────────────────────────────────────────
  tsPct: number;            // True Shooting %
  efgPct: number;           // Effective Field Goal %
  fgPct: number;            // Overall FG%
  fg2Pct: number;           // 2-point FG%
  fg2m: number;             // 2PM (derived)
  fg2a: number;             // 2PA (derived)
  threePPct: number;        // 3P%
  ftPct: number;            // FT%

  // ── Shot-Zone Efficiency & Rates ─────────────────────────────────────────
  fgAtRimPct: number;       // At-rim FG%
  fgLowPostPct: number;     // Low-post FG%
  fgMidRangePct: number;    // Mid-range FG%
  rimRate: number;          // At-rim FGA / total FGA
  lowPostRate: number;      // Low-post FGA / total FGA
  midRangeRate: number;     // Mid-range FGA / total FGA
  threePointRate: number;   // 3PA / FGA
  freeThrowRate: number;    // FTA / FGA  (how often player gets to line)
  pointsInThePaint: number; // Estimated PIP (2×fgAtRim + 2×fgLowPost)
  secondChancePts: number;  // Estimated second-chance pts via ORB proxy

  // ── Rebounding % ─────────────────────────────────────────────────────────
  orbPct: number;           // Offensive Rebound %
  drbPct: number;           // Defensive Rebound %
  trbPct: number;           // Total Rebound %

  // ── Playmaking ────────────────────────────────────────────────────────────
  astPct: number;           // Assist %  (% of team FGM assisted while on floor)
  astToRatio: number;       // AST / TOV
  tovPct: number;           // TOV % (turnovers per 100 possessions used)
  potentialAssists: number; // AST * 1.35 proxy for passes that led to shots

  // ── Defense ──────────────────────────────────────────────────────────────
  stlPct: number;           // Steal %
  blkPct: number;           // Block %
  deflections: number;      // STL × 2.4 proxy  (no raw tracking data)
  chargesDrawn: number;     // PF-drawn proxy

  // ── Usage / Efficiency ───────────────────────────────────────────────────
  usgPct: number;           // Usage %
  floorPct: number;         // Floor % (scoring-possession %)
  scoringPossessions: number; // Estimated scoring possessions

  // ── Ratings ───────────────────────────────────────────────────────────────
  ortg: number;             // Individual Offensive Rating (pts per 100 poss used)
  drtg: number;             // Individual Defensive Rating (team DRTG scaled to min)
  netRtg: number;           // Net Rating

  // ── Per-36 ────────────────────────────────────────────────────────────────
  pts36: number;
  reb36: number;
  ast36: number;
  stl36: number;
  blk36: number;
  tov36: number;
  fga36: number;
  fta36: number;

  // ── Per-100-Possessions ───────────────────────────────────────────────────
  pts100: number;
  ast100: number;
  reb100: number;
  stl100: number;
  blk100: number;
  tov100: number;

  // ── PER ───────────────────────────────────────────────────────────────────
  per: number;              // Player Efficiency Rating

  // ── Win Shares ────────────────────────────────────────────────────────────
  ows: number;              // Offensive Win Shares
  dws: number;              // Defensive Win Shares
  ws: number;               // Total Win Shares
  wsPer48: number;          // Win Shares per 48 min

  // ── Box Plus/Minus ────────────────────────────────────────────────────────
  obpm: number;             // Offensive BPM
  dbpm: number;             // Defensive BPM
  bpm: number;              // Total BPM

  // ── VORP & EWA ────────────────────────────────────────────────────────────
  vorp: number;             // Value Over Replacement Player
  ewa: number;              // Estimated Wins Added

  // ── Game Score ────────────────────────────────────────────────────────────
  gameScore: number;        // Hollinger Game Score
  gmscPer40: number;        // Game Score per 40 min

  // ── Plus/Minus ────────────────────────────────────────────────────────────
  pm: number;               // Raw +/-
  pm100: number;            // +/- per 100 possessions

  // ── Milestones ────────────────────────────────────────────────────────────
  dd: number;               // Double-double (1 or 0)
  td: number;               // Triple-double
  qd: number;               // Quadruple-double
  fxf: number;              // 5×5 (5+ in all 5 major categories)

  // ── Context ───────────────────────────────────────────────────────────────
  possessions: number;      // Player possessions used
  pace: number;             // Estimated game pace
}

export interface TeamAdvancedStats {
  // Pace & Possessions
  poss: number;             // Estimated possessions
  oppPoss: number;          // Opponent possessions
  pace: number;             // Pace (avg poss per 48 min)

  // Ratings
  ortg: number;             // Offensive Rating  (pts per 100 poss)
  drtg: number;             // Defensive Rating
  netRtg: number;           // Net Rating

  // Shooting
  efgPct: number;
  tsPct: number;
  fg2Pct: number;
  threePPct: number;
  ftPct: number;
  threePointRate: number;   // 3PA / FGA
  freeThrowRate: number;    // FTA / FGA
  pointsInThePaint: number;

  // Rebounding
  orbPct: number;
  drbPct: number;
  trbPct: number;

  // Playmaking
  astPct: number;           // AST / FGM × 100
  astToRatio: number;
  tovPct: number;

  // Defense
  blkPct: number;
  stlPct: number;

  // Per-100
  pts100: number;
  ast100: number;
  reb100: number;
  tov100: number;
  stl100: number;
  blk100: number;

  // Dean Oliver Four Factors
  shootingFactor: number;   // eFG%
  tovFactor: number;        // TOV%
  rebFactor: number;        // ORB%
  ftFactor: number;         // FTM / FGA

  // Opponent Four Factors
  oppShootingFactor: number;
  oppTovFactor: number;
  oppRebFactor: number;
  oppFtFactor: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Round to 4 decimal places, return 0 on NaN/Infinity */
function safe(n: number, fallback = 0): number {
  return isFinite(n) && !isNaN(n) ? parseFloat(n.toFixed(4)) : fallback;
}

/** Safe integer — no decimals */
function safeInt(n: number): number {
  return isFinite(n) && !isNaN(n) ? Math.round(n) : 0;
}

function pct(made: number, att: number): number {
  return att > 0 ? safe(made / att) : 0;
}

/** Estimate possessions from box-score components (Oliver formula) */
function estimatePossessions(
  fga: number,
  fta: number,
  orb: number,
  tov: number
): number {
  return fga + FT_POSS_FACTOR * fta - orb + tov;
}

/** True Shooting % */
function calcTS(pts: number, fga: number, fta: number): number {
  const denom = 2 * (fga + FT_POSS_FACTOR * fta);
  return denom > 0 ? safe(pts / denom) : 0;
}

/** Effective Field Goal % */
function calcEFG(fgm: number, threePm: number, fga: number): number {
  return fga > 0 ? safe((fgm + 0.5 * threePm) / fga) : 0;
}

/** Usage % — share of team possessions used while on floor */
function calcUSG(
  fga: number, fta: number, tov: number,
  min: number,
  teamMin: number, teamFGA: number, teamFTA: number, teamTOV: number
): number {
  if (min === 0) return 0;
  const playerPoss = fga + FT_POSS_FACTOR * fta + tov;
  const teamPossScaled =
    (teamFGA + FT_POSS_FACTOR * teamFTA + teamTOV) *
    (min / (teamMin / COURT_PLAYERS));
  return teamPossScaled > 0 ? safe((playerPoss * 100) / teamPossScaled) : 0;
}

/** Rebound % (ORB, DRB, or TRB) */
function calcRebPct(playerReb: number, teamReb: number, oppReb: number): number {
  const total = teamReb + oppReb;
  return total > 0 ? safe((playerReb * 100) / total) : 0;
}

/** Assist % — share of team FGM the player assisted while on floor */
function calcASTPct(
  ast: number,
  min: number,
  teamMin: number,
  teamFGM: number,
  playerFGM: number
): number {
  if (min === 0) return 0;
  const scaledTeamFGM = teamFGM * (min / (teamMin / COURT_PLAYERS));
  const denom = scaledTeamFGM - playerFGM;
  return denom > 0 ? safe((ast * 100) / denom) : 0;
}

/** STL % */
function calcStlPct(stl: number, min: number, teamMin: number, oppPoss: number): number {
  if (min === 0) return 0;
  const scaledOppPoss = oppPoss * (min / (teamMin / COURT_PLAYERS));
  return scaledOppPoss > 0 ? safe((stl * 100) / scaledOppPoss) : 0;
}

/** BLK % (% of opponent 2PA blocked) */
function calcBlkPct(blk: number, min: number, teamMin: number, oppFGA: number, oppTPA: number): number {
  if (min === 0) return 0;
  const opp2pa = oppFGA - oppTPA;
  const scaledOpp2pa = opp2pa * (min / (teamMin / COURT_PLAYERS));
  return scaledOpp2pa > 0 ? safe((blk * 100) / scaledOpp2pa) : 0;
}

/** TOV % — turnovers per 100 possessions used */
function calcTOVPct(tov: number, fga: number, fta: number): number {
  const poss = fga + FT_POSS_FACTOR * fta + tov;
  return poss > 0 ? safe((tov * 100) / poss) : 0;
}

/** Floor % — scoring possessions / total possessions */
function calcFloorPct(pts: number, ast: number, min: number): number {
  if (min === 0) return 0;
  // Approximate scoring possessions as (pts produced via scoring + assists)
  const scoringPoss = (pts * 0.5) + (ast * 0.7);
  const totalPoss   = Math.max(1, min * 0.65); // per-minute possession proxy
  return safe(Math.min(1, scoringPoss / totalPoss));
}

/**
 * Hollinger PER (per-game single-game version).
 * Scaled so that league average ≈ 15.
 */
function calcPER(s: PlayerGameStats, teamPoss: number): number {
  const { min, fgm, fga, ftm, fta, orb, drb, ast, stl, blk, tov, pf } = s;
  const threePm = s.threePm ?? 0;
  if (min === 0) return 0;

  const uProd =
    fgm   * 85.910
    + stl   * 53.897
    + threePm * 51.757
    + ftm   * 46.845
    + blk   * 39.190
    + orb   * 39.190
    + ast   * 34.677
    + drb   * 14.707
    - pf    * 17.174
    - (fta - ftm) * 20.091
    - (fga - fgm) * 39.190
    - tov   * 53.897;

  const paceFactor = teamPoss > 0 ? MINUTES_PER_GAME / teamPoss : 1;
  const PER_NORMALIZATION_FACTOR = 1.65; // Scale to make elite players ~30-35 and average ~15
  return safe((uProd / min) * paceFactor * PER_NORMALIZATION_FACTOR);
}

/**
 * Hollinger Game Score (full formula).
 * GmSc = PTS + 0.4×FGM − 0.7×FGA − 0.4×(FTA−FTM) + 0.7×ORB + 0.3×DRB
 *       + STL + 0.7×AST + 0.7×BLK − 0.4×PF − TOV
 */
function calcGameScore(s: PlayerGameStats): number {
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

/**
 * Offensive Rating (pts per 100 possessions *used by this player*).
 * For team ORTG use team pts / team poss.
 */
function calcORTG(pts: number, poss: number): number {
  return poss > 0 ? safe((pts * 100) / poss) : 0;
}

/**
 * Marginal Offense → Offensive Win Shares.
 * Follows Dean Oliver's formula via marginal points per win ≈ 0.32 × league ORTG.
 */
function calcOWS(
  playerORTG: number,
  playerPoss: number,
  lgORTG: number
): number {
  const margOff = ((playerORTG / 100) - (lgORTG / 100) * 0.92) * playerPoss;
  const margPtsPerWin = 0.32 * lgORTG;
  return margPtsPerWin > 0 ? safe(margOff / margPtsPerWin) : 0;
}

/**
 * Defensive Win Shares.
 * Approximated as proportion of team DWS by defensive stat contribution.
 */
function calcDWS(
  drtg: number,
  lgORTG: number,
  playerMinFraction: number,
  teamPoss: number
): number {
  const margDef = ((lgORTG / 100) * 1.08 - (drtg / 100)) * teamPoss * playerMinFraction;
  const margPtsPerWin = 0.32 * lgORTG;
  return margPtsPerWin > 0 ? safe(margDef / margPtsPerWin) : 0;
}

/**
 * Box Plus/Minus — simplified Engelmann/BBREF model.
 * Returns { obpm, dbpm, bpm }.
 */
function calcBPM(
  s: PlayerGameStats,
  usgPct: number,
): { obpm: number; dbpm: number; bpm: number } {
  const { min } = s;
  if (min === 0) return { obpm: 0, dbpm: 0, bpm: 0 };

  const p36 = (k: number) => (k / min) * 36;

  const pts36  = p36(s.pts);
  const ast36  = p36(s.ast);
  const orb36  = p36(s.orb);
  const drb36  = p36(s.drb);
  const tov36  = p36(s.tov);
  const stl36  = p36(s.stl);
  const blk36  = p36(s.blk);
  const ts     = calcTS(s.pts, s.fga, s.fta);
  const tsAdj  = ts - LG_TS;

  const obpm = safe(
    pts36   *  0.306
    + ast36  *  0.685
    + orb36  *  0.624
    + drb36  *  0.136
    - tov36  *  0.442
    + tsAdj  * 14.200
    + usgPct *  0.012
    - 3.50                    // replacement-level / positional baseline
  );

  const dbpm = safe(
    stl36  *  2.020
    + blk36  *  1.070
    + drb36  *  0.310
    - tov36  *  0.260
    - 1.92                    // replacement-level baseline
  );

  return { obpm, dbpm, bpm: safe(obpm + dbpm) };
}

/** VORP — accumulates value above replacement over minutes played. */
function calcVORP(bpm: number, min: number): number {
  return safe((bpm - REPLACEMENT_BPM) * (min / MINUTES_PER_GAME) * (1 / 82));
}

/** EWA — Estimated Wins Added (PER-based). */
function calcEWA(per: number, min: number): number {
  return safe((per - LG_PER) * (min / MINUTES_PER_GAME) / 67);
}

// ── Milestone helpers ────────────────────────────────────────────────────────
function tenPlusCategories(s: PlayerGameStats): number {
  return [s.pts, s.reb, s.ast, s.blk, s.stl].filter(v => v >= 10).length;
}
function fivePlusCategories(s: PlayerGameStats): number {
  return [s.pts, s.reb, s.ast, s.blk, s.stl].filter(v => v >= 5).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — PLAYER ADVANCED STATS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateAdvancedStats
 *
 * @param teamStats   Array of PlayerGameStats for the team of interest
 * @param oppStats    Array of PlayerGameStats for the opponent
 * @param pmArray     Optional raw +/- per player, same index as teamStats
 * @param lgORTG      League-average offensive rating override (default 110)
 * @returns           Array of AdvancedPlayerStats, same order as teamStats
 */
export function generateAdvancedStats(
  teamStats: PlayerGameStats[],
  oppStats: PlayerGameStats[],
  pmArray: number[] = [],
  lgORTG: number = LG_ORTG,
): AdvancedPlayerStats[] {

  // ── Team totals ────────────────────────────────────────────────────────────
  const sum = (arr: PlayerGameStats[], k: keyof PlayerGameStats) =>
    arr.reduce((a, s) => a + ((s[k] as number) || 0), 0);

  const T = {
    pts:  sum(teamStats, 'pts'),
    fgm:  sum(teamStats, 'fgm'),
    fga:  sum(teamStats, 'fga'),
    tpm:  sum(teamStats, 'threePm'),
    tpa:  sum(teamStats, 'threePa'),
    ftm:  sum(teamStats, 'ftm'),
    fta:  sum(teamStats, 'fta'),
    orb:  sum(teamStats, 'orb'),
    drb:  sum(teamStats, 'drb'),
    ast:  sum(teamStats, 'ast'),
    tov:  sum(teamStats, 'tov'),
    stl:  sum(teamStats, 'stl'),
    blk:  sum(teamStats, 'blk'),
    min:  sum(teamStats, 'min'),
  };

  const O = {
    pts:  sum(oppStats, 'pts'),
    fgm:  sum(oppStats, 'fgm'),
    fga:  sum(oppStats, 'fga'),
    tpm:  sum(oppStats, 'threePm'),
    tpa:  sum(oppStats, 'threePa'),
    ftm:  sum(oppStats, 'ftm'),
    fta:  sum(oppStats, 'fta'),
    orb:  sum(oppStats, 'orb'),
    drb:  sum(oppStats, 'drb'),
    tov:  sum(oppStats, 'tov'),
    min:  sum(oppStats, 'min'),
  };

  const teamPoss = estimatePossessions(T.fga, T.fta, T.orb, T.tov);
  const oppPoss  = estimatePossessions(O.fga, O.fta, O.orb, O.tov);
  const teamORTG = calcORTG(T.pts, teamPoss);
  const teamDRTG = calcORTG(O.pts, oppPoss);
  const pace     = safe(((teamPoss + oppPoss) / 2) * (MINUTES_PER_GAME / (T.min / COURT_PLAYERS)));

  // ── Per-player loop ────────────────────────────────────────────────────────
  return teamStats.map((s, i): AdvancedPlayerStats => {
    const {
      min, pts, fgm, fga, threePm, threePa, ftm, fta,
      orb, drb, ast, tov, stl, blk, pf, ba,
      fgAtRim, fgaAtRim, fgLowPost, fgaLowPost, fgMidRange, fgaMidRange,
    } = s;

    const reb  = (orb || 0) + (drb || 0);
    const fg2m = fgm - threePm;
    const fg2a = fga - threePa;

    // ── Shooting ─────────────────────────────────────────────────────────────
    const tsPct         = calcTS(pts, fga, fta);
    const efgPct        = calcEFG(fgm, threePm, fga);
    const fgPct         = pct(fgm, fga);
    const fg2Pct        = pct(fg2m, fg2a);
    const threePPct     = pct(threePm, threePa);
    const ftPct         = pct(ftm, fta);
    const fgAtRimPct    = pct(fgAtRim || 0, fgaAtRim || 0);
    const fgLowPostPct  = pct(fgLowPost || 0, fgaLowPost || 0);
    const fgMidRangePct = pct(fgMidRange || 0, fgaMidRange || 0);
    const rimRate       = fga > 0 ? safe((fgaAtRim || 0) / fga) : 0;
    const lowPostRate   = fga > 0 ? safe((fgaLowPost || 0) / fga) : 0;
    const midRangeRate  = fga > 0 ? safe((fgaMidRange || 0) / fga) : 0;
    const threePointRate = fga > 0 ? safe(threePa / fga) : 0;
    const freeThrowRate  = fga > 0 ? safe(fta / fga) : 0;

    const pointsInThePaint = safeInt(
      (fgAtRim || 0) * 2 + (fgLowPost || 0) * 2
    );
    const secondChancePts  = safeInt((orb || 0) * 1.05); // rough proxy

    // ── Rebounding % ─────────────────────────────────────────────────────────
    const orbPct = calcRebPct(orb || 0, T.orb, O.drb);
    const drbPct = calcRebPct(drb || 0, T.drb, O.orb);
    const trbPct = calcRebPct(reb, T.orb + T.drb, O.orb + O.drb);

    // ── Playmaking ────────────────────────────────────────────────────────────
    const astPct    = calcASTPct(ast, min, T.min, T.fgm, fgm);
    const astToRatio = tov > 0 ? safe(ast / tov) : safe(ast);
    const tovPct    = calcTOVPct(tov, fga, fta);
    const potentialAssists = safe((ast || 0) * 1.35);

    // ── Defense ───────────────────────────────────────────────────────────────
    const stlPct      = calcStlPct(stl, min, T.min, oppPoss);
    const blkPct      = calcBlkPct(blk, min, T.min, O.fga, O.tpa);
    const deflections = safe((stl || 0) * 2.4);
    const chargesDrawn = safe((pf || 0) * 0.08); // approximate

    // ── Usage / Possessions ───────────────────────────────────────────────────
    const usgPct          = calcUSG(fga, fta, tov, min, T.min, T.fga, T.fta, T.tov);
    const floorPct        = calcFloorPct(pts, ast, min);
    const playerPoss      = estimatePossessions(fga, fta, orb || 0, tov);
    const scoringPossessions = safe(pts > 0 ? playerPoss * floorPct : 0);

    // ── Ratings ────────────────────────────────────────────────────────────────
    const ortg   = calcORTG(pts, playerPoss);
    const minFraction = T.min > 0 ? min / (T.min / COURT_PLAYERS) : 0;
    const drtg   = safe(teamDRTG); // Individual DRtg is roughly team DRtg in this simplified model
    const netRtg = safe(ortg - drtg);

    // ── Per-36 ─────────────────────────────────────────────────────────────────
    const p36 = (k: number) => min > 0 ? safe((k / min) * 36) : 0;
    const pts36 = p36(pts);
    const reb36 = p36(reb);
    const ast36 = p36(ast);
    const stl36 = p36(stl);
    const blk36 = p36(blk);
    const tov36 = p36(tov);
    const fga36 = p36(fga);
    const fta36 = p36(fta);

    // ── Per-100 ────────────────────────────────────────────────────────────────
    const p100 = (k: number) => playerPoss > 0 ? safe((k * 100) / playerPoss) : 0;
    const pts100 = p100(pts);
    const ast100 = p100(ast);
    const reb100 = p100(reb);
    const stl100 = p100(stl);
    const blk100 = p100(blk);
    const tov100 = p100(tov);

    // ── PER ────────────────────────────────────────────────────────────────────
    const per = calcPER(s, teamPoss);

    // ── Win Shares ──────────────────────────────────────────────────────────────
    const ows     = calcOWS(ortg, playerPoss, lgORTG);
    const dws     = calcDWS(drtg, lgORTG, minFraction, teamPoss);
    const ws      = safe(ows + dws);
    const wsPer48 = min > 0 ? safe((ws * MINUTES_PER_GAME) / min) : 0;

    // ── BPM ────────────────────────────────────────────────────────────────────
    const { obpm, dbpm, bpm } = calcBPM(s, usgPct);

    // ── VORP & EWA ─────────────────────────────────────────────────────────────
    const vorp = calcVORP(bpm, min);
    const ewa  = calcEWA(per, min);

    // ── Game Score ─────────────────────────────────────────────────────────────
    const gameScore  = calcGameScore(s);
    const gmscPer40  = min > 0 ? safe((gameScore / min) * 40) : 0;

    // ── Plus/Minus ──────────────────────────────────────────────────────────────
    const rawPM  = pmArray[i] ?? 0;
    const pm100  = teamPoss > 0 ? safe((rawPM * 100) / teamPoss) : 0;

    // ── Milestones ──────────────────────────────────────────────────────────────
    const tenCats  = tenPlusCategories(s);
    const fiveCats = fivePlusCategories(s);
    const dd  = tenCats >= 2 ? 1 : 0;
    const td  = tenCats >= 3 ? 1 : 0;
    const qd  = tenCats >= 4 ? 1 : 0;
    const fxf = fiveCats >= 5 ? 1 : 0;

    return {
      playerId: s.playerId,
      name:     s.name,
      min,

      tsPct, efgPct, fgPct, fg2Pct, fg2m, fg2a, threePPct, ftPct,

      fgAtRimPct, fgLowPostPct, fgMidRangePct,
      rimRate, lowPostRate, midRangeRate, threePointRate, freeThrowRate,
      pointsInThePaint, secondChancePts,

      orbPct, drbPct, trbPct,

      astPct, astToRatio, tovPct, potentialAssists,

      stlPct, blkPct, deflections, chargesDrawn,

      usgPct, floorPct, scoringPossessions,

      ortg, drtg, netRtg,

      pts36, reb36, ast36, stl36, blk36, tov36, fga36, fta36,

      pts100, ast100, reb100, stl100, blk100, tov100,

      per,

      ows, dws, ws, wsPer48,

      obpm, dbpm, bpm,

      vorp,
      ewa,

      gameScore, gmscPer40,

      pm: rawPM, pm100,

      dd, td, qd, fxf,

      possessions: safe(playerPoss),
      pace,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM ADVANCED STATS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateTeamAdvancedStats
 *
 * Computes all team-level advanced stats from two box score arrays.
 *
 * @param teamStats  Box score rows for the team of interest
 * @param oppStats   Box score rows for the opponent
 * @param lgORTG     League-average ORTG (default 110)
 */
export function generateTeamAdvancedStats(
  teamStats: PlayerGameStats[],
  oppStats: PlayerGameStats[],
  lgORTG: number = LG_ORTG,
): TeamAdvancedStats {
  const sum = (arr: PlayerGameStats[], k: keyof PlayerGameStats) =>
    arr.reduce((a, s) => a + ((s[k] as number) || 0), 0);

  // Team box
  const pts = sum(teamStats, 'pts');
  const fgm = sum(teamStats, 'fgm');
  const fga = sum(teamStats, 'fga');
  const tpm = sum(teamStats, 'threePm');
  const tpa = sum(teamStats, 'threePa');
  const ftm = sum(teamStats, 'ftm');
  const fta = sum(teamStats, 'fta');
  const orb = sum(teamStats, 'orb');
  const drb = sum(teamStats, 'drb');
  const ast = sum(teamStats, 'ast');
  const tov = sum(teamStats, 'tov');
  const stl = sum(teamStats, 'stl');
  const blk = sum(teamStats, 'blk');
  const reb = orb + drb;
  const fgaAtRim   = sum(teamStats, 'fgaAtRim');
  const fgAtRim    = sum(teamStats, 'fgAtRim');
  const fgaLowPost = sum(teamStats, 'fgaLowPost');
  const fgLowPost  = sum(teamStats, 'fgLowPost');

  // Opponent box
  const oPts = sum(oppStats, 'pts');
  const oFgm = sum(oppStats, 'fgm');
  const oFga = sum(oppStats, 'fga');
  const oTpm = sum(oppStats, 'threePm');
  const oTpa = sum(oppStats, 'threePa');
  const oFtm = sum(oppStats, 'ftm');
  const oFta = sum(oppStats, 'fta');
  const oOrb = sum(oppStats, 'orb');
  const oDrb = sum(oppStats, 'drb');
  const oTov = sum(oppStats, 'tov');
  const oStl = sum(oppStats, 'stl');
  const oBlk = sum(oppStats, 'blk');
  const oReb = oOrb + oDrb;

  const teamMin = sum(teamStats, 'min');
  const teamMinDuration = teamMin / COURT_PLAYERS;

  // Possessions & pace
  const poss  = estimatePossessions(fga, fta, orb, tov);
  const oppPoss = estimatePossessions(oFga, oFta, oOrb, oTov);
  const pace  = teamMinDuration > 0 ? safe(((poss + oppPoss) / 2) * (MINUTES_PER_GAME / teamMinDuration)) : safe((poss + oppPoss) / 2);

  // Ratings
  const ortg  = calcORTG(pts, poss);
  const drtg  = calcORTG(oPts, oppPoss);
  const netRtg = safe(ortg - drtg);

  // Shooting
  const efgPct      = calcEFG(fgm, tpm, fga);
  const tsPct       = calcTS(pts, fga, fta);
  const fg2Pct      = pct(fgm - tpm, fga - tpa);
  const threePPct   = pct(tpm, tpa);
  const ftPct       = pct(ftm, fta);
  const threePointRate = fga > 0 ? safe(tpa / fga) : 0;
  const freeThrowRate  = fga > 0 ? safe(fta / fga) : 0;
  const pointsInThePaint = safeInt(fgAtRim * 2 + fgLowPost * 2);

  // Rebounding %
  const orbPct = calcRebPct(orb, orb, oDrb);
  const drbPct = calcRebPct(drb, drb, oOrb);
  const trbPct = calcRebPct(reb, reb, oReb);

  // Playmaking
  const astPct    = fgm > 0 ? safe((ast / fgm) * 100) : 0;
  const astToRatio = tov > 0 ? safe(ast / tov) : 0;
  const tovPct    = calcTOVPct(tov, fga, fta);

  // Defense %
  const blkPct = (oFga - oTpa) > 0 ? safe((blk / (oFga - oTpa)) * 100) : 0;
  const stlPct = oppPoss > 0 ? safe((stl / oppPoss) * 100) : 0;

  // Per-100
  const p100 = (k: number) => poss > 0 ? safe((k * 100) / poss) : 0;
  const pts100 = p100(pts);
  const ast100 = p100(ast);
  const reb100 = p100(reb);
  const tov100 = p100(tov);
  const stl100 = p100(stl);
  const blk100 = p100(blk);

  // Dean Oliver Four Factors — team
  const shootingFactor = efgPct;
  const tovFactor      = safe(tov100 / 100);
  const rebFactor      = safe(orbPct / 100);
  const ftFactor       = fga > 0 ? safe(ftm / fga) : 0;

  // Opponent Four Factors
  const oEFG = calcEFG(oFgm, oTpm, oFga);
  const oppShootingFactor = oEFG;
  const oppTovFactor = safe(calcTOVPct(oTov, oFga, oFta) / 100);
  const oppRebFactor = safe(calcRebPct(oOrb, oOrb, drb) / 100);
  const oppFtFactor  = oFga > 0 ? safe(oFtm / oFga) : 0;

  return {
    poss: safe(poss),
    oppPoss: safe(oppPoss),
    pace,
    ortg, drtg, netRtg,
    efgPct, tsPct, fg2Pct, threePPct, ftPct,
    threePointRate, freeThrowRate,
    pointsInThePaint,
    orbPct, drbPct, trbPct,
    astPct, astToRatio, tovPct,
    blkPct, stlPct,
    pts100, ast100, reb100, tov100, stl100, blk100,
    shootingFactor, tovFactor, rebFactor, ftFactor,
    oppShootingFactor, oppTovFactor, oppRebFactor, oppFtFactor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEASON AGGREGATOR — accumulate per-game advanced stats into season totals
// ─────────────────────────────────────────────────────────────────────────────

export interface SeasonAdvancedStats {
  playerId: string;
  name: string;
  gp: number;
  gs: number;
  minPerGame: number;

  // Per-game averages
  ptsPerGame: number;
  rebPerGame: number;
  astPerGame: number;
  stlPerGame: number;
  blkPerGame: number;
  tovPerGame: number;
  fgmPerGame: number;
  fgaPerGame: number;

  // Season shooting (totals → rates)
  tsPct: number;
  efgPct: number;
  fgPct: number;
  fg2Pct: number;
  threePPct: number;
  ftPct: number;
  threePointRate: number;
  freeThrowRate: number;

  // Advanced (season averages)
  perSeasonAvg: number;
  usgPctAvg: number;
  ortgAvg: number;
  drtgAvg: number;
  netRtgAvg: number;
  orbPctAvg: number;
  drbPctAvg: number;
  trbPctAvg: number;
  astPctAvg: number;
  stlPctAvg: number;
  blkPctAvg: number;
  tovPctAvg: number;
  bpmAvg: number;
  obpmAvg: number;
  dbpmAvg: number;

  // Accumulators
  wsTot: number;
  owsTot: number;
  dwsTot: number;
  vorpTot: number;
  ewaTot: number;

  // Milestones (counts over season)
  ddTotal: number;
  tdTotal: number;
  qdTotal: number;
  fxfTotal: number;
}

/**
 * aggregateSeasonAdvancedStats
 *
 * Takes an array of per-game AdvancedPlayerStats for the same player
 * (one element per game) and returns season-level totals/averages.
 */
export function aggregateSeasonAdvancedStats(
  games: AdvancedPlayerStats[],
  rawBoxTotals: {
    pts: number; fgm: number; fga: number;
    tpm: number; tpa: number; ftm: number; fta: number;
    orb: number; drb: number;
    gs: number;
  }
): SeasonAdvancedStats {
  if (games.length === 0) {
    return {} as SeasonAdvancedStats;
  }

  const gp  = games.length;
  const avg = (k: keyof AdvancedPlayerStats) =>
    safe(games.reduce((a, g) => a + (g[k] as number), 0) / gp);
  const tot = (k: keyof AdvancedPlayerStats) =>
    safe(games.reduce((a, g) => a + (g[k] as number), 0));

  const minTotal = games.reduce((a, g) => a + g.min, 0);

  return {
    playerId: games[0].playerId,
    name:     games[0].name,
    gp,
    gs: rawBoxTotals.gs,
    minPerGame: safe(minTotal / gp),

    ptsPerGame: safe(rawBoxTotals.pts / gp),
    rebPerGame: safe((rawBoxTotals.orb + rawBoxTotals.drb) / gp),
    astPerGame: avg('ast36') * (avg('min') / 36), // back-calc from per-36
    stlPerGame: avg('stl36') * (avg('min') / 36),
    blkPerGame: avg('blk36') * (avg('min') / 36),
    tovPerGame: avg('tov36') * (avg('min') / 36),
    fgmPerGame: safe(rawBoxTotals.fgm / gp),
    fgaPerGame: safe(rawBoxTotals.fga / gp),

    // Season-total shooting rates
    tsPct:         calcTS(rawBoxTotals.pts, rawBoxTotals.fga, rawBoxTotals.fta),
    efgPct:        calcEFG(rawBoxTotals.fgm, rawBoxTotals.tpm, rawBoxTotals.fga),
    fgPct:         pct(rawBoxTotals.fgm, rawBoxTotals.fga),
    fg2Pct:        pct(rawBoxTotals.fgm - rawBoxTotals.tpm, rawBoxTotals.fga - rawBoxTotals.tpa),
    threePPct:     pct(rawBoxTotals.tpm, rawBoxTotals.tpa),
    ftPct:         pct(rawBoxTotals.ftm, rawBoxTotals.fta),
    threePointRate: rawBoxTotals.fga > 0 ? safe(rawBoxTotals.tpa / rawBoxTotals.fga) : 0,
    freeThrowRate:  rawBoxTotals.fga > 0 ? safe(rawBoxTotals.fta / rawBoxTotals.fga) : 0,

    perSeasonAvg:  avg('per'),
    usgPctAvg:     avg('usgPct'),
    ortgAvg:       avg('ortg'),
    drtgAvg:       avg('drtg'),
    netRtgAvg:     avg('netRtg'),
    orbPctAvg:     avg('orbPct'),
    drbPctAvg:     avg('drbPct'),
    trbPctAvg:     avg('trbPct'),
    astPctAvg:     avg('astPct'),
    stlPctAvg:     avg('stlPct'),
    blkPctAvg:     avg('blkPct'),
    tovPctAvg:     avg('tovPct'),
    bpmAvg:        avg('bpm'),
    obpmAvg:       avg('obpm'),
    dbpmAvg:       avg('dbpm'),

    wsTot:   tot('ws'),
    owsTot:  tot('ows'),
    dwsTot:  tot('dws'),
    vorpTot: tot('vorp'),
    ewaTot:  tot('ewa'),

    ddTotal:  safeInt(tot('dd')),
    tdTotal:  safeInt(tot('td')),
    qdTotal:  safeInt(tot('qd')),
    fxfTotal: safeInt(tot('fxf')),
  };
}