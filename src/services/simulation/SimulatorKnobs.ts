/**
 * SimulatorKnobs.ts
 *
 * Configurable parameters that let any caller tune the stat generator engine
 * without touching core logic.  Two use cases:
 *
 *   1. Exhibition games  — All-Star, Rising Stars, Celebrity Game each have
 *      their own preset that controls pace, shooting tendencies, rotation depth,
 *      and per-player minute distribution.
 *
 *   2. Rule-change experiments — 3PT line removal, FIBA quarter length (10 min),
 *      shot-clock changes, etc.  Flip the knobs from commissioner settings and
 *      the whole simulation adapts automatically.
 *
 * Usage:
 *   import { KNOBS_ALL_STAR, getKnobs } from '../SimulatorKnobs';
 *   generateStatsForTeam(..., getKnobs(KNOBS_ALL_STAR));
 */

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulatorKnobs {
  // ── Scoring & Pace ────────────────────────────────────────────────────────
  /** Multiplies the incoming totalScore before stat distribution.
   *  1.0 = no change, 1.18 = All-Star pace (+18% more scoring) */
  paceMultiplier: number;

  // ── Shooting ─────────────────────────────────────────────────────────────
  /** Multiplies 2PT and 3PT shooting % after all other modifiers.
   *  1.25 = All-Star (no defense); 0.70 = Celebrity (bad shooters) */
  efficiencyMultiplier: number;

  /** false = 3-point line does not exist (rule change). Forces threePointRateMult=0. */
  threePointAvailable: boolean;

  /** Multiplies the per-player 3PA attempt rate.
   *  1.4 = All-Star (everyone gunning 3s); 0.4 = Celebrity (rarely tries) */
  threePointRateMult: number;

  // ── Free Throws ───────────────────────────────────────────────────────────
  /** Multiplies the foul-drawing / FT rate.
   *  0.4 = All-Star (refs let them play); 2.0 = bruiser-ball rule change */
  ftRateMult: number;

  // ── Rotation & Minutes ────────────────────────────────────────────────────
  /** When set, overrides the depth calculated by MinutesPlayedService.
   *  12 = use the full All-Star squad; 10 = Celebrity roster */
  rotationDepthOverride?: number;

  /** When set, replaces the starMpgTarget from MinutesPlayedService.
   *  26 = All-Star load management; 22 = Rising Stars; undefined = normal */
  starMpgOverride?: number;

  /** When true, distributes minutes evenly among all rotation players
   *  instead of using depth-tiered allocation.
   *  Ideal for Celebrity Game where every star "must" play equal time. */
  flatMinutes: boolean;

  /** Target minutes per player when flatMinutes=true.
   *  Ignored when flatMinutes=false.  Default 15 for 10-man squad. */
  flatMinutesTarget?: number;

  // ── Player Rating Floor ───────────────────────────────────────────────────
  /** Minimum value returned by any stat rating lookup.
   *  35 for Celebrity Game (prevents literal 0-stat lines on celebs with no ratings) */
  ratingFloor: number;

  // ── Standings Context (per-team, used by MinutesPlayedService) ──────────
  /** Conference rank 1-15. Used to pick the standing profile (star MPG, depth). */
  conferenceRank: number;

  /** Games behind the conference leader (0 = leader).
   *  Combined with gamesRemaining to detect elimination or clinch. */
  gbFromLeader: number;

  /** Regular-season games remaining (82 − played).
   *  When gbFromLeader > gamesRemaining → team is eliminated → youth rotation. */
  gamesRemaining: number;

  // ── Rule Changes (future-proofing) ────────────────────────────────────────
  /** Quarter length in minutes.  12 = NBA, 10 = FIBA.
   *  Affects the total minutes budget passed to allocateMinutes. */
  quarterLength: number;

  /** Shot clock in seconds. Drives paceMultiplier — 24/shotClockSeconds.
   *  24 = NBA default (1.0×), 12 = 2.0× pace, 14 = ~1.7× pace. */
  shotClockSeconds: number;

  /** Multiplier on the rim-attempt weight in shot-location distribution.
   *  1.0 = NBA default. <1.0 = fewer drives/rim attacks (e.g. no def-3-sec rule).
   *  Set via rule: defensiveThreeSecondEnabled=false → 0.72 */
  rimRateMult: number;

  /** Multiplier on the low-post attempt weight in shot-location distribution.
   *  1.0 = NBA default. >1.0 = more post play (e.g. no offensive-3-sec rule).
   *  Set via rule: offensiveThreeSecondEnabled=false → 1.35 */
  lowPostRateMult: number;

  /** Multiplier on the available-blocks pool passed to generateCoordinatedStats.
   *  1.0 = NBA default. >1.0 = more blocks (e.g. goaltending disabled → defenders
   *  can freely swat shots at/past the rim). 0 = blocks completely removed.
   *  Set via rule: goaltendingEnabled=false → 1.6 */
  blockRateMult: number;

  // ── Exhibition score boost ─────────────────────────────────────────────────
  /** Applied in engine.ts to the raw game score BEFORE stat generation.
   *  Use for exhibition games (All-Star ~1.45, Rising Stars ~1.18) so the
   *  scoreboard shows realistic totals without double-counting paceMultiplier.
   *  When set, keep paceMultiplier = 1.0 so stats match the boosted score. */
  exhibitionScoreMult?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULTS — regular NBA game, no modifications
// ─────────────────────────────────────────────────────────────────────────────

export const KNOBS_DEFAULT: SimulatorKnobs = {
  paceMultiplier:       1.0,
  efficiencyMultiplier: 1.0,
  threePointAvailable:  true,
  threePointRateMult:   1.0,
  ftRateMult:           1.0,
  flatMinutes:          false,
  ratingFloor:          0,
  conferenceRank:       8,   // play-in bubble — safe default
  gbFromLeader:         0,
  gamesRemaining:       41,
  quarterLength:        12,
  shotClockSeconds:     24,
  rimRateMult:          1.0,
  lowPostRateMult:      1.0,
  blockRateMult:        1.0,
};

// ─────────────────────────────────────────────────────────────────────────────
// EXHIBITION PRESETS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All-Star Game
 * Historical averages: ~165-175 pts per team, everyone gets 14-28 min,
 * stars play ~25-28 min, no real defense, refs swallow whistles.
 *
 * exhibitionScoreMult (1.48) boosts the base game score (~110) to the
 * real All-Star range (~163).  paceMultiplier=1.0 keeps stat totals
 * equal to the actual scoreboard — no double-counting.
 * flatMinutes=true distributes minutes evenly across all 12 players
 * based on overall rating, preventing one star from logging 36+ min
 * while the 11th man gets 2 min.
 */
export const KNOBS_ALL_STAR: SimulatorKnobs = {
  paceMultiplier:        1.0,    // stats match boosted game score (no double-count)
  efficiencyMultiplier:  1.30,   // no real defense — high FG%, many open looks
  threePointAvailable:   true,
  threePointRateMult:    1.45,   // everyone chucks 3s
  ftRateMult:            0.32,   // refs rarely call fouls
  rotationDepthOverride: 12,     // all 12 All-Stars play
  flatMinutes:           true,   // rating-weighted even distribution
  flatMinutesTarget:     20,     // 240 total / 12 = 20 avg; stars ~26, role players ~14
  ratingFloor:           0,
  conferenceRank:        1,      // neutral — depth fully driven by rotationDepthOverride
  gbFromLeader:          0,
  gamesRemaining:        82,
  quarterLength:         12,
  shotClockSeconds:      24,
  rimRateMult:           1.0,
  lowPostRateMult:       1.0,
  blockRateMult:         1.0,
  exhibitionScoreMult:   1.48,   // base ~110 → ~163 pts per team (realistic ASG range)
};

/**
 * Rising Stars Game
 * Rookies & 2nd-year players — more aggressive, more turnovers,
 * slightly lower efficiency than veterans.  Still an exhibition feel.
 */
export const KNOBS_RISING_STARS: SimulatorKnobs = {
  paceMultiplier:        1.10,
  efficiencyMultiplier:  1.08,   // young legs, decent efficiency
  threePointAvailable:   true,
  threePointRateMult:    1.20,   // athletic players love the 3
  ftRateMult:            0.55,
  rotationDepthOverride: 10,     // 10-man rotation per side
  flatMinutes:           true,   // everyone gets meaningful run
  flatMinutesTarget:     24,     // 10 players × 24 = 240 min total
  ratingFloor:           0,
  conferenceRank:        4,
  gbFromLeader:          0,
  gamesRemaining:        82,
  quarterLength:         12,
  shotClockSeconds:      24,
  rimRateMult:           1.0,
  lowPostRateMult:       1.0,
  blockRateMult:         1.0,
  exhibitionScoreMult:   1.18,   // modest boost for Rising Stars (~130 per team)
};

/**
 * Celebrity Game
 * Entertainers with no real NBA ratings — needs lowest floor so stats
 * don't hit zero, flat minute distribution, and a forgiving efficiency bump
 * that still keeps scores realistic (~60-75 pts per team).
 */
export const KNOBS_CELEBRITY: SimulatorKnobs = {
  paceMultiplier:        0.82,   // lower scoring totals
  efficiencyMultiplier:  0.78,   // celebs can't really shoot
  threePointAvailable:   true,
  threePointRateMult:    0.35,   // very few 3-point attempts
  ftRateMult:            0.60,
  rotationDepthOverride: 10,     // use all celebs in rotation
  flatMinutes:           true,
  flatMinutesTarget:     24,     // base target — rating-weighted in allocateMinutes
  ratingFloor:           32,     // floor prevents 0-stat lines for non-NBA players
  conferenceRank:        8,
  gbFromLeader:          0,
  gamesRemaining:        41,
  quarterLength:         12,
  shotClockSeconds:      24,
  rimRateMult:           1.0,
  lowPostRateMult:       1.0,
  blockRateMult:         1.0,
};

// ─────────────────────────────────────────────────────────────────────────────
// RULE-CHANGE PRESETS  (examples — connect via commissioner rules tab)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Preseason Game
 * Low stakes — coaches experiment with lineups, stars get limited minutes,
 * younger players and two-ways see extended run.  Slightly lower efficiency
 * as players shake off rust.
 */
export const KNOBS_PRESEASON: SimulatorKnobs = {
  paceMultiplier:        0.95,   // slightly lower scoring than regular season
  efficiencyMultiplier:  0.90,   // rust factor — lower shooting efficiency
  threePointAvailable:   true,
  threePointRateMult:    0.85,   // less trigger-happy, more mid-range work
  ftRateMult:            0.80,   // refs let it go more in preseason
  rotationDepthOverride: 13,     // deeper rotation to evaluate roster depth
  flatMinutes:           false,
  ratingFloor:           0,
  conferenceRank:        8,
  gbFromLeader:          0,
  gamesRemaining:        82,
  quarterLength:         12,
  shotClockSeconds:      24,
  rimRateMult:           1.0,
  lowPostRateMult:       1.0,
  blockRateMult:         1.0,
};

/** FIBA-style: 10-min quarters, no 3PT (hypothetical rule experiment). */
export const KNOBS_NO_THREE: SimulatorKnobs = {
  ...KNOBS_DEFAULT,
  threePointAvailable: false,
  threePointRateMult:  0,
  quarterLength:       12,
};

/** FIBA-style: 10-minute quarters (reduces total minutes budget). */
export const KNOBS_FIBA_QUARTERS: SimulatorKnobs = {
  ...KNOBS_DEFAULT,
  quarterLength: 10,
};

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge partial overrides on top of the default knobs.
 * Use this when a commissioner rule changes a single param without a full preset.
 *
 * @example
 * getKnobs({ threePointAvailable: false })  // remove 3PT line from regular games
 * getKnobs({ quarterLength: 10 })           // FIBA quarters
 */
export function getKnobs(overrides?: Partial<SimulatorKnobs>): SimulatorKnobs {
  return { ...KNOBS_DEFAULT, ...overrides };
}
