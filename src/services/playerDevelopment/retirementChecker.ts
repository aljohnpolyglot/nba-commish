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
export function retireProb(age: number, rawOvr: number, allStarApps = 0, recentAllStar = false, lastSeasonGP = 0): number {
  if (age < 34) {
    return rawOvr < 45 ? 0.12 : 0;
  }

  if (age >= 45) return 1.0;

  // ── Active All-Stars never retire — if they're still earning selections, they keep going.
  if (recentAllStar) return 0;

  // ── "Still productive" immunity ──────────────────────────────────
  // Played 50+ games last season at solid-starter+ level (BBGM 60+ ≈ K2 84+).
  // Catches Kawhi/late-career LeBron — guys producing without All-Star nods.
  // Caps at age 43 so even productive vets eventually retire.
  if (lastSeasonGP >= 50 && rawOvr >= 60 && age <= 42) return 0;

  // ── Legend multiplier — all-time greats hang on longer ───────────
  const legendMult = allStarApps >= 15 ? 0.30
                   : allStarApps >= 10 ? 0.50
                   : allStarApps >= 5  ? 0.75
                   : 1.0;

  // ── BBGM OVR scale (practical range 35-82): ─────────────────────────────
  //   65+ = All-Star / superstar (top ~15 in league)
  //   55-64 = solid starter
  //   45-54 = rotation / bench
  //   <45  = end of bench / washed
  //
  // Key principle: OVR matters MORE than age. As long as a player is still
  // producing they keep playing. The curve only kicks in for genuine decline.

  // ── All-Star / superstar (BBGM 65+) — sharply softened ──────────────────
  // If you're still elite, you don't retire by accident. Compare real LeBron
  // (41yo, 19.2 ppg, K2 88) — should not even consider retirement.
  if (rawOvr >= 65) {
    if (age <= 38) return 0;
    if (age <= 39) return 0.01 * legendMult;
    if (age <= 40) return 0.02 * legendMult;
    if (age <= 41) return 0.04 * legendMult;
    if (age <= 42) return 0.07 * legendMult;
    if (age <= 43) return 0.15 * legendMult;
    return 0.30 * legendMult;                        // age 44
  }

  // ── Solid starter (BBGM 55-64) ──────────────────────────────────────────
  if (rawOvr >= 55) {
    if (age <= 34) return 0.05 * legendMult;
    if (age <= 35) return 0.10 * legendMult;
    if (age <= 36) return 0.15 * legendMult;
    if (age <= 37) return 0.25 * legendMult;
    if (age <= 38) return 0.35 * legendMult;
    if (age <= 39) return 0.50 * legendMult;
    if (age <= 40) return 0.60 * legendMult;
    if (age <= 41) return 0.70 * legendMult;
    return 0.80 * legendMult;
  }

  // ── Rotation / bench (BBGM 45-54) ───────────────────────────────────────
  if (rawOvr >= 45) {
    if (age <= 34) return 0.15 * legendMult;
    if (age <= 35) return 0.25 * legendMult;
    if (age <= 36) return 0.35 * legendMult;
    if (age <= 37) return 0.50 * legendMult;
    if (age <= 38) return 0.60 * legendMult;
    if (age <= 39) return 0.75 * legendMult;
    if (age <= 40) return 0.85 * legendMult;
    return Math.min(1.0, 0.95 * legendMult);
  }

  // ── Washed (BBGM < 45) ──────────────────────────────────────────────────
  if (age <= 34) return 0.30 * legendMult;
  if (age <= 35) return 0.40 * legendMult;
  if (age <= 36) return 0.60 * legendMult;
  if (age <= 37) return 0.70 * legendMult;
  if (age <= 38) return 0.80 * legendMult;
  if (age <= 39) return 0.90 * legendMult;
  return Math.min(1.0, 0.95 * legendMult);
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


/** True if player made an All-Star game in the season just ended or the one before. */
function wasAllStarRecently(player: NBAPlayer, year: number): boolean {
  return (player.awards ?? []).some(
    a => a.type === 'All-Star' && a.season >= year - 1 && a.season <= year
  );
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
export function farewellTourProb(age: number, rawOvr: number, allStarApps: number, recentAllStar = false): number {
  if (age < 34) return 0;

  // Elite raw OVR (still playing at star level): never a farewell — they just keep going.
  if (rawOvr >= 75) return 0;

  // If they just made the All-Star game they are not retiring — no age cap.
  // A 42-year-old All-Star is still an active contributor; farewell tour fires only
  // after they stop earning selections.
  if (recentAllStar) return 0;

  // Legend tier: ≥15 All-Star + significant age → guaranteed farewell
  if (allStarApps >= 15 && age >= 41) return 1.0;
  if (allStarApps >= 15 && age >= 39) return 0.70;

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
    const recentStar = wasAllStarRecently(p, year);
    const prob = farewellTourProb(age, p.overallRating ?? 60, allStarCount, recentStar);
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

// ─── Mortality curve ─────────────────────────────────────────────────────────
function ageMortalityProb(age: number): number {
  if (age >= 105) return 1.0;
  if (age >= 100) return 0.40;
  if (age >= 95)  return 0.25;
  if (age >= 90)  return 0.18;
  if (age >= 85)  return 0.12;
  if (age >= 80)  return 0.07;
  if (age >= 75)  return 0.04;
  if (age >= 70)  return 0.02;
  if (age >= 65)  return 0.01;
  return 0;
}

export interface MortalityRecord {
  playerId: string;
  name: string;
  age: number;
  diedYear: number;
}

/** Roll mortality for all retired living players. Called after HOF checks. */
export function runMortalityChecks(
  players: NBAPlayer[],
  year: number,
): { players: NBAPlayer[]; deaths: MortalityRecord[] } {
  const deaths: MortalityRecord[] = [];

  const updated = players.map(p => {
    if ((p as any).status !== 'Retired') return p;
    if ((p as any).diedYear) return p;

    const age = year - (p.born?.year ?? 2000);
    const prob = ageMortalityProb(age);
    if (prob <= 0) return p;

    const roll = seededRandom(`died_${p.internalId}_${year}`);
    if (roll >= prob) return p;

    deaths.push({ playerId: p.internalId, name: p.name, age, diedYear: year });
    return { ...p, diedYear: year } as any as NBAPlayer;
  });

  return { players: updated, deaths };
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

  // 'FreeAgent' (no space) is a legacy typo that leaked from the old trim path —
  // include it as a defensive alias so stuck pre-migration vets still retire.
  const ACTIVE_STATUSES = new Set(['Active', 'Free Agent', 'FreeAgent', 'Prospect']);
  // External men's leagues are handled by retireExternalLeaguePlayers() in
  // externalLeagueSustainer.ts — called BEFORE this function in seasonRollover.ts.
  // Players arriving here are already NBA/FA; external leagues skip through below.

  const updated = players.map(p => {
    const status = (p as any).status ?? 'Active';

    // Skip: already retired, deceased, external leagues, draft prospects, WNBA
    if (!ACTIVE_STATUSES.has(status)) return p;
    if ((p as any).diedYear) return p;
    if (p.tid === -2) return p; // unborn draft prospect
    if ((p as any).status === 'WNBA') return p;

    // Prefer born.year calculation — player.age can be stale/wrong from BBGM load
    const age = p.born?.year ? (year - p.born.year) : (typeof p.age === 'number' && p.age > 0 ? p.age : 0);
    if (age < 34) return p; // too young to consider

    const ovr = p.overallRating ?? 60;

    // Hard force-retire: abandoned late-career FAs. Evidence from 5-year sim audit:
    // Kyle Lowry (46), P.J. Tucker (47), Brook Lopez (44), etc. all stuck as FAs.
    // Guard fires for FA (tid === -1) at 43+ with no recent games-played signal.
    // Previously age >= 40 which caught Curry/LeBron-tier who are still All-Stars;
    // bumped to 43 since All-Star immunity above handles the elite-late-career case.
    if (p.tid === -1 && age >= 43) {
      const lastTwoSeasonsGP = (p.stats ?? [])
        .filter((s: any) => !s.playoffs && (s.season ?? 0) >= (year - 1))
        .reduce((sum: number, s: any) => sum + (s.gp ?? 0), 0);
      if (lastTwoSeasonsGP === 0) {
        console.log(`[Retirement] ${p.name} (age ${age}, OVR ${ovr}) — FORCE RETIRE (FA, 40+, 0 GP in last 2 seasons)`);
        const { gp, pts, reb, ast } = computeCareerTotals(p);
        const allStars = countAllStarAppearances(p);
        const champs = countChampionships(p);
        newRetirees.push({
          playerId: p.internalId, name: p.name, age, ovr,
          allStarAppearances: allStars, championships: champs,
          careerGP: gp, careerPts: pts, careerReb: reb, careerAst: ast,
          isLegend: allStars >= 5,
        });
        return {
          ...p,
          status: 'Retired' as const,
          tid: -1,
          retiredYear: year,
          farewellTour: undefined,
        } as any;
      }
    }

    const isFarewell = !!(p as any).farewellTour;
    const allStarCount = countAllStarAppearances(p);
    const recentStar = wasAllStarRecently(p, year);
    // Last season GP — feeds the "still productive" immunity in retireProb
    const lastSeasonGP = (p.stats ?? [])
      .filter((s: any) => !s.playoffs && s.season === year)
      .reduce((sum: number, s: any) => sum + (s.gp ?? 0), 0);

    // Farewell tour players retire guaranteed — they already had their goodbye season.
    // Exceptions: OVR recovered to elite (≥75), OR they're still making All-Star games.
    // A player who made the All-Star game last season isn't done — cancel the flag and loop.
    if (isFarewell && ovr < 75 && !recentStar) {
      // Guaranteed retirement — no roll needed
      console.log(
        `[Retirement] ${p.name} (age ${age}, OVR ${ovr}) — FAREWELL TOUR → RETIRED`
      );
    } else {
      // If farewell-flagged but still making All-Stars, clear the flag so it
      // doesn't re-fire next rollover as a guaranteed retirement.
      const clearFarewell = isFarewell && recentStar;

      const prob = retireProb(age, ovr, allStarCount, recentStar, lastSeasonGP);
      if (prob <= 0) {
        return clearFarewell ? { ...p, farewellTour: undefined } as any : p;
      }
      const roll = seededRandom(`retire_${p.internalId}_${year}`);
      if (age >= 34) {
        const survived = roll >= prob;
        console.log(
          `[Retirement] ${p.name} (age ${age}, OVR ${ovr}) — prob: ${(prob * 100).toFixed(1)}%, roll: ${roll.toFixed(4)} → ${survived ? 'SURVIVED' : 'RETIRED'}`
        );
      }
      if (roll >= prob) return clearFarewell ? { ...p, farewellTour: undefined } as any : p;
    }

    // Retiring!
     // Retiring!
    const { gp, pts, reb, ast } = computeCareerTotals(p);
    const champCount = countChampionships(p);

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
