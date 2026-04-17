/**
 * retirementChecker.ts
 *
 * Probabilistic retirement logic — called at season rollover (June 30).
 *
 * Philosophy (mirrors real NBA patterns):
 *  - Stars carry on into late 30s (OVR ≥ 80 at 38 is a LeBron edge case)
 *  - Fringe players retire sooner (OVR < 65 at 35+ → real retirement risk)
 *  - Age 43+ always retires — no exceptions
 *  - Deterministic: seeded by player internalId + year → same outcome on replay
 *
 * Returns:
 *  - `players` — updated array (some newly Retired)
 *  - `newRetirees` — list of players who just retired (for news/season preview)
 */

import type { NBAPlayer } from '../../types';

export interface RetireeRecord {
  playerId: string;
  name: string;
  age: number;
  ovr: number;
  allStarAppearances: number;
  championships: number;
  careerGP: number;
  careerPts: number;
  careerReb: number;
  careerAst: number;
  isLegend: boolean; // ≥ 5 All-Star appearances
}

// ─── Deterministic RNG (seeded) ──────────────────────────────────────────────
function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

// ─── Scale helpers ────────────────────────────────────────────────────────────
/**
 * Convert raw overallRating (custom weighted formula, ~50–85 range) to an
 * approximate 2K-display equivalent so thresholds are human-readable.
 *
 * Mirrors the base of convertTo2KRating (helpers.ts): 0.88 * raw + 31.
 * We skip the hgt/tp bonuses here — those are cosmetic display bumps, not
 * relevant to how good a player actually is for retirement purposes.
 *
 * Examples:
 *   raw 80 (LeBron at 38) → 2K-equiv 101 → capped 99
 *   raw 76 (Curry at 37)  → 2K-equiv 98
 *   raw 70 (All-Star)     → 2K-equiv 93
 *   raw 64 (solid starter)→ 2K-equiv 87
 *   raw 57 (rotation)     → 2K-equiv 81
 *   raw 50 (end of bench) → 2K-equiv 75
 */
function toApprox2K(rawOvr: number): number {
  return Math.min(99, Math.round(0.88 * rawOvr + 31));
}

// ─── Retire probability ───────────────────────────────────────────────────────
/**
 * Returns the probability [0, 1] that a player retires this offseason.
 *
 * All thresholds use RAW BBGM overallRating (typically 30-85 range):
 *   - 75+ raw = superstar (LeBron, Curry)
 *   - 68-74 = All-Star / star starter
 *   - 60-67 = solid starter
 *   - 50-59 = rotation / bench
 *   - <50   = end of bench / out of league
 *
 * @public — exported so PlayerBioMoraleTab can show a retirement risk indicator.
 */
export function retireProb(age: number, rawOvr: number): number {
  if (age < 34) {
    // Ultra-early retirement — freak injury ruin case only
    return rawOvr < 45 ? 0.12 : 0;
  }

  // ── Age 45+: auto-retire (beyond any realistic playing career) ────
  if (age >= 45) return 1.0;

  // ── BBGM OVR scale (practical range 35-82): ─────────────────────────────
  //   65+ = All-Star / superstar (top ~15 in league)
  //   55-64 = solid starter
  //   45-54 = rotation / bench
  //   <45  = end of bench / washed
  //
  // Key principle: OVR matters MORE than age. A 40-year-old still putting up
  // All-Star numbers (BBGM 68+) should almost never retire. A 36-year-old
  // who can't crack a rotation (BBGM 42) probably should.

  // ── All-Star / superstar (BBGM 65+) ─────────────────────────────────────
  if (rawOvr >= 65) {
    if (age <= 37) return 0;                         // still elite, won't retire
    if (age <= 38) return 0.03;                      // starting to think about it
    if (age <= 39) return 0.05;
    if (age <= 40) return 0.08;
    if (age <= 41) return 0.15;
    if (age <= 42) return 0.25;
    if (age <= 43) return 0.40;
    return 0.60;                                     // age 44
  }

  // ── Solid starter (BBGM 55-64) ──────────────────────────────────────────
  if (rawOvr >= 55) {
    if (age <= 34) return 0.05;
    if (age <= 35) return 0.10;
    if (age <= 36) return 0.15;
    if (age <= 37) return 0.25;
    if (age <= 38) return 0.35;
    if (age <= 39) return 0.50;
    if (age <= 40) return 0.60;
    if (age <= 41) return 0.70;
    return 0.80;                                     // age 42-44
  }

  // ── Rotation / bench (BBGM 45-54) ───────────────────────────────────────
  if (rawOvr >= 45) {
    if (age <= 34) return 0.15;
    if (age <= 35) return 0.25;
    if (age <= 36) return 0.35;
    if (age <= 37) return 0.50;
    if (age <= 38) return 0.60;
    if (age <= 39) return 0.75;
    if (age <= 40) return 0.85;
    return 0.95;                                     // age 41-44
  }

  // ── Washed (BBGM < 45) ──────────────────────────────────────────────────
  if (age <= 34) return 0.30;
  if (age <= 35) return 0.40;
  if (age <= 36) return 0.60;
  if (age <= 37) return 0.70;
  if (age <= 38) return 0.80;
  if (age <= 39) return 0.90;
  return 0.95;                                       // age 40-44
}

// ─── Career stats snapshot ────────────────────────────────────────────────────
function computeCareerTotals(player: NBAPlayer): { gp: number; pts: number; reb: number; ast: number } {
  const stats = player.stats ?? [];
  let gp = 0, pts = 0, reb = 0, ast = 0;
  for (const s of stats) {
    if ((s as any).playoffs) continue; // skip playoff rows
    gp  += s.gp  ?? 0;
    pts += s.pts ?? 0;
    reb += s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0));
    ast += s.ast ?? 0;
  }
  return { gp, pts, reb, ast };
}

function countAllStarAppearances(player: NBAPlayer): number {
  return (player.awards ?? []).filter(a => a.type === 'All-Star').length;
}

function countChampionships(player: NBAPlayer): number {
  return (player.awards ?? []).filter(a => a.type === 'Champion').length;
}

// ─── Farewell tour probability ────────────────────────────────────────────────
/**
 * Returns the probability [0, 1] that a player's upcoming season is their
 * farewell tour (i.e. very likely to be their last season).
 *
 * Tiers:
 *  - Legends (≥15 All-Star + age ≥37): automatic — LeBron, Kareem, Jordan never
 *    get forced out while still star-level, but this fires when the body starts to go.
 *    We use OVR ≥ 90 (2K scale) as "still All-Star level" — they skip farewell entirely.
 *  - High All-Star (≥10 All-Star) + age 37+: very likely
 *  - Moderate All-Star (≥5) + age 38+: likely
 *  - Regular players: ~70% of retireProb (slightly below, since we want farewell to
 *    be a reasonable warning, not a certainty for all aging fringe players)
 *
 * @public — exported for PlayerBioMoraleTab retirement watch display.
 */
export function farewellTourProb(age: number, rawOvr: number, allStarApps: number): number {
  if (age < 34) return 0;

  // Elite raw OVR (still playing at star level): never a farewell — they just keep going.
  if (rawOvr >= 75) return 0;

  // Legend tier: ≥15 All-Star + significant age → guaranteed farewell
  if (allStarApps >= 15 && age >= 37) return 1.0;

  // High All-Star (10-14) + aging
  if (allStarApps >= 10 && age >= 39) return 0.95;
  if (allStarApps >= 10 && age >= 37) return 0.75;
  if (allStarApps >= 10 && age >= 36) return 0.50;

  // Moderate All-Star (5-9)
  if (allStarApps >= 5 && age >= 40) return 0.90;
  if (allStarApps >= 5 && age >= 38) return 0.65;
  if (allStarApps >= 5 && age >= 36) return 0.35;

  // Regular players — base retire prob * 0.7 + small All-Star bonus
  const base = retireProb(age, rawOvr);
  if (base <= 0) return 0;
  const allStarBonus = Math.min(0.15, allStarApps * 0.02);
  return Math.min(0.90, base * 0.70 + allStarBonus);
}

export interface FarewellRecord {
  playerId: string;
  name: string;
  age: number;
  allStarAppearances: number;
  championships: number;
  isLegend: boolean; // ≥5 All-Star
}

/**
 * Flag players entering their farewell tour season.
 * Called at rollover AFTER retirement checks (retirees are already removed).
 * Sets `farewellTour: true` on qualifying players for the UPCOMING season.
 *
 * @param players  Post-retirement player list
 * @param year     The season that just ended
 */
export function runFarewellTourChecks(
  players: NBAPlayer[],
  year: number,
): { players: NBAPlayer[]; newFarewells: FarewellRecord[] } {
  const newFarewells: FarewellRecord[] = [];

  const ACTIVE_STATUSES = new Set(['Active', 'Free Agent']);

  const updated = players.map(p => {
    // Skip non-active, deceased, external, or already flagged
    if (!ACTIVE_STATUSES.has((p as any).status ?? 'Active')) return p;
    if ((p as any).diedYear) return p;
    if (p.tid === -2) return p;
    if ((p as any).farewellTour) return p; // already flagged from prior rollover

    // Prefer born.year calculation — player.age can be stale/wrong from BBGM load
    const age = p.born?.year ? (year - p.born.year) : (typeof p.age === 'number' && p.age > 0 ? p.age : 0);
    if (age < 34) return p;

    const allStarCount = countAllStarAppearances(p);
    const prob = farewellTourProb(age, p.overallRating ?? 60, allStarCount);
    if (prob <= 0) return p;

    const roll = seededRandom(`farewell_${p.internalId}_${year}`);
    if (roll >= prob) return p;

    const champCount = countChampionships(p);
    newFarewells.push({
      playerId:           p.internalId,
      name:               p.name,
      age,
      allStarAppearances: allStarCount,
      championships:      champCount,
      isLegend:           allStarCount >= 5,
    });

    return { ...p, farewellTour: true } as any as NBAPlayer;
  });

  return { players: updated, newFarewells };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run retirement checks for all active/FA players.
 * Call this inside applySeasonRollover AFTER age increments.
 *
 * Players with `farewellTour: true` are guaranteed to retire — no dice roll.
 * (They already survived one farewell season, that's their last.)
 *
 * @param players  The already-aged player list from rollover
 * @param year     The season that just ended (pre-increment)
 * @returns        { players: updated list, newRetirees: record of who just retired }
 */
export function runRetirementChecks(
  players: NBAPlayer[],
  year: number,
): { players: NBAPlayer[]; newRetirees: RetireeRecord[] } {
  const newRetirees: RetireeRecord[] = [];

  const ACTIVE_STATUSES = new Set(['Active', 'Free Agent', 'Prospect']);

  const updated = players.map(p => {
    // Skip: already retired, deceased, external leagues, draft prospects, WNBA
    if (!ACTIVE_STATUSES.has((p as any).status ?? 'Active')) return p;
    if ((p as any).diedYear) return p;
    if (p.tid === -2) return p; // unborn draft prospect
    if ((p as any).status === 'WNBA') return p;

    // Prefer born.year calculation — player.age can be stale/wrong from BBGM load
    const age = p.born?.year ? (year - p.born.year) : (typeof p.age === 'number' && p.age > 0 ? p.age : 0);
    if (age < 34) return p; // too young to consider

    const ovr = p.overallRating ?? 60;
    const isFarewell = !!(p as any).farewellTour;

    // Farewell tour players retire guaranteed — they already had their goodbye season.
    // Exception: if their raw OVR shot back up to elite (≥75), they un-retired mentally.
    if (isFarewell && ovr < 75) {
      // Guaranteed retirement — no roll needed
      console.log(
        `[Retirement] ${p.name} (age ${age}, OVR ${ovr}) — FAREWELL TOUR → RETIRED`
      );
    } else {
      const prob = retireProb(age, ovr);
      if (prob <= 0) {
        return p;
      }
      const roll = seededRandom(`retire_${p.internalId}_${year}`);
      if (age >= 34) {
        const survived = roll >= prob;
        console.log(
          `[Retirement] ${p.name} (age ${age}, OVR ${ovr}) — prob: ${(prob * 100).toFixed(1)}%, roll: ${roll.toFixed(4)} → ${survived ? 'SURVIVED' : 'RETIRED'}`
        );
      }
      if (roll >= prob) return p;
    }

    // Retiring!
    const { gp, pts, reb, ast } = computeCareerTotals(p);
    const allStarCount = countAllStarAppearances(p);
    const champCount   = countChampionships(p);

    newRetirees.push({
      playerId:           p.internalId,
      name:               p.name,
      age,
      ovr,
      allStarAppearances: allStarCount,
      championships:      champCount,
      careerGP:           gp,
      careerPts:          pts,
      careerReb:          reb,
      careerAst:          ast,
      isLegend:           allStarCount >= 5,
    });

    return {
      ...p,
      status:       'Retired'   as const,
      tid:          -1,
      retiredYear:  year,
      farewellTour: undefined,  // clean up flag
      contract:     undefined,
    } as any as NBAPlayer;
  });

  // Summary log for debugging
  const checked34Plus = players.filter(p => {
    const ACTIVE = new Set(['Active', 'Free Agent', 'Prospect']);
    if (!ACTIVE.has((p as any).status ?? 'Active')) return false;
    if ((p as any).diedYear || p.tid === -2 || (p as any).status === 'WNBA') return false;
    const a = p.born?.year ? (year - p.born.year) : (typeof p.age === 'number' ? p.age : 0);
    return a >= 34;
  }).length;
  console.log(`[Retirement] Checked ${checked34Plus} players age 34+, ${newRetirees.length} retired, ${checked34Plus - newRetirees.length} survived`);

  return { players: updated, newRetirees };
}
