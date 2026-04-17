/**
 * leagueOvr — unified OVR calculator for all external leagues.
 *
 * Every league follows the same pipeline:
 *   1. Fetch raw BBGM ratings (no attribute scaling at fetch time)
 *   2. OVR = rawFormula(ratings) × LEAGUE_MULTIPLIERS[league]
 *   3. Sim stats = rating × same multiplier (getScaledRating in helpers.ts)
 *   4. UI display = same multiplier (useLeagueScaledRatings hook)
 *
 * One multiplier, one formula, three consistent places.
 * To add a new league: one entry in LEAGUE_MULTIPLIERS + one named export.
 */

/**
 * Scale factors applied to raw BBGM attribute ratings at fetch time.
 *
 * IMPORTANT: The source ratings are raw BBGM exports collected independently
 * by the dev via Python scripts and browser console automation — they are NOT
 * calibrated to reflect real-world league strength. Each league's data was
 * scraped/generated separately and may have different internal rating scales.
 * These multipliers are what bring them in line with NBA sim values.
 */
export const LEAGUE_MULTIPLIERS: Record<string, number> = {
  Euroleague:   0.980,  // just below NBA — top Euroleague players approach NBA starter level
  PBA:          0.510,
  'B-League':   0.850,
  Endesa:       0.830,  // +0.03 bump — Endesa top players were landing too low (72-ish ceiling)
  'G-League':   0.780,  // +0.03 bump — best G-League guys were topping out at 72, should reach ~75+
  WNBA:         1.000,  // WNBA rated on full BBGM scale — no downscaling
  'China CBA':     0.700,  // Chinese Basketball Association — below Euroleague/Endesa
  'NBL Australia': 0.750,  // National Basketball League (Australia) — strong developmental league
};

function calcRawOvr(ratings: any): number {
  if (!ratings) return 55;

  // Use ?? 50 (not || 50) so legitimate 0 values (e.g. tp=0 for non-shooters) aren't
  // inflated to 50. This preserves natural diversity across position archetypes.
  const hgt  = ratings.hgt  ?? 50;
  const stre = ratings.stre ?? 50;
  const spd  = ratings.spd  ?? 50;
  const jmp  = ratings.jmp  ?? 50;
  const endu = ratings.endu ?? 50;
  const ins  = ratings.ins  ?? 50;
  const dnk  = ratings.dnk  ?? 50;
  const ft   = ratings.ft   ?? 50;
  const fg   = ratings.fg   ?? 50;
  const tp   = ratings.tp   ?? 50;
  const oiq  = ratings.oiq  ?? 50;
  const diq  = ratings.diq  ?? 50;
  const drb  = ratings.drb  ?? 50;
  const pss  = ratings.pss  ?? 50;
  const reb  = ratings.reb  ?? 50;

  const athleticism = (spd + jmp + endu + stre) / 4;
  const shooting    = (fg + tp + ft) / 3;
  const iq          = (oiq + diq + pss) / 3;
  const inside      = (ins + dnk) / 2;
  const defense     = (drb + reb + diq) / 3;

  let ovr = (athleticism * 0.25) + (shooting * 0.25) + (iq * 0.2) + (inside * 0.15) + (defense * 0.15);

  if (hgt > 60) ovr += (hgt - 60) * 0.2;

  return ovr;
}

/**
 * Calculate OVR from ratings.
 *
 * When `league` is provided, pass in the RAW (unscaled) ratings from the
 * source BBGM export and let the multiplier be applied here. This preserves
 * the natural diversity in calcRawOvr's absolute height bonus — if you pass
 * in pre-scaled attrs the height threshold (hgt > 60) kills the bonus for
 * most players, collapsing everyone to the same OVR.
 *
 * When `league` is omitted (e.g. fallback in bbgmOvr), the input is already
 * pre-scaled and the formula runs without an extra multiplier.
 */
export function calculateLeagueOverall(ratings: any, league?: string): number {
  const mult = league ? (LEAGUE_MULTIPLIERS[league] ?? 1.0) : 1.0;
  return Math.round(Math.max(10, calcRawOvr(ratings) * mult));
}

// Named convenience exports — used by externalRosterService
export const calculateEuroleagueOverall  = (r: any) => calculateLeagueOverall(r);
export const calculatePBAOverall         = (r: any) => calculateLeagueOverall(r);
export const calculateBLeagueOverall     = (r: any) => calculateLeagueOverall(r);
export const calculateEndesaOverall      = (r: any) => calculateLeagueOverall(r);
export const calculateGLeagueOverall     = (r: any) => calculateLeagueOverall(r);
export const calculateChinaCBAOverall    = (r: any) => calculateLeagueOverall(r, 'China CBA');
export const calculateNBLAustraliaOverall = (r: any) => calculateLeagueOverall(r, 'NBL Australia');
