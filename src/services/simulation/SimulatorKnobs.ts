import { PBA_COACHING_BIAS, type EraCoachingBias } from './eraCoachingBias';
import type { GameRuleConfig } from './types';
import { DEFAULT_GAME_RULES } from './gameRuleRuntime';

export type SimulationEngine = 'fast' | 'realistic';

export interface SimulationEngineCalibration {
  paceMultiplier?: number;
  fieldGoalAttemptMult?: number;
  fastScorePaceMultiplier?: number;
  efficiencyMultiplier?: number;
  threePointRateMult?: number;
  threePointAttemptCapMult?: number;
  threePointSkillExponentMult?: number;
  threePointAttemptVolumeMult?: number;
  threePointAttemptFloorRate?: number;
  bigThreePointAttemptFloorRate?: number;
  lowThreePointAttemptCapMult?: number;
  threePointEfficiencyMult?: number;
  twoPointEfficiencyMult?: number;
  ftRateMult?: number;
  ftEfficiencyMult?: number;
  blockRateMult?: number;
  stealRateMult?: number;
  orbRateMult?: number;
  assistRateMult?: number;
  reboundOpportunityMult?: number;
  tovMult?: number;
  personalFoulRateMult?: number;
}

export interface SimulatorKnobs {
  playersOnCourt?: number;
  homeCourtAdvantagePoints?: number;
  /** Apply the normal roster-strength margin correction to explicit tournament rosters. */
  strengthCorrectionWithOverrideRosters?: boolean;
  /** Multiplies the incoming totalScore before stat distribution.
   *  1.0 = no change, 1.18 = All-Star pace (+18% more scoring) */
  paceMultiplier: number;

  fieldGoalAttemptMult?: number;
  boxScoreFgaNormalizationMult?: number;
  fastScorePaceMultiplier?: number;

  /** Multiplies 2PT and 3PT shooting % after all other modifiers.
   *  1.25 = All-Star (no defense); 0.70 = Celebrity (bad shooters) */
  efficiencyMultiplier: number;

  /** false = 3-point line does not exist (rule change). Forces threePointRateMult=0. */
  threePointAvailable: boolean;

  /** Multiplies the per-player 3PA attempt rate.
   *  1.4 = All-Star (everyone gunning 3s); 0.4 = Celebrity (rarely tries) */
  threePointRateMult: number;

  /** Fast-engine adapter for how sharply three-point volume follows shooter skill. */
  threePointSkillExponentMult?: number;

  /** Fast-engine adapter for era-specific elite-shooter attempt ceilings. */
  threePointPersonalCapMult?: number;

  /** Fast-engine calibration for league-wide per-player three-point attempt ceilings. */
  threePointAttemptCapMult?: number;

  /** Fast-engine multiplier applied after per-player attempt ceilings. */
  threePointAttemptVolumeMult?: number;

  threePointAttemptFloorRate?: number;
  bigThreePointAttemptFloorRate?: number;
  lowThreePointAttemptCapMult?: number;

  /** Multiplies per-player 3PT make probability. Used for line-distance rules. */
  threePointEfficiencyMult?: number;

  /** Multiplies per-player 2PT make probability. */
  twoPointEfficiencyMult?: number;

  /** Enables 4-point attempts in the stat generator. */
  fourPointAvailable?: boolean;

  /** Multiplies the per-player 4PA attempt rate. */
  fourPointRateMult?: number;

  /** Multiplies per-player 4PT make probability. Used for line-distance rules. */
  fourPointEfficiencyMult?: number;

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

  /** True for playoff/play-in games. Raises minute cap to ~44-46 min for stars. */
  isPlayoffs?: boolean;

  // ── Rule Changes (future-proofing) ────────────────────────────────────────
  /** Quarter length in minutes.  12 = NBA, 10 = FIBA.
   *  Affects the total minutes budget passed to allocateMinutes. */
  quarterLength: number;

  /** Number of regulation periods. 4 = NBA default. */
  numQuarters?: number;

  /** Timed = normal clock, Elam = timed regulation + untimed target finish, Target Score = first to a fixed score. */
  gameFormat?: 'timed' | 'target_score' | 'elam_ending';

  /** Fixed target when gameFormat === 'target_score'. */
  targetScore?: number;

  /** Overtime length in minutes. 5 = NBA. Affects OT score and minutes budget. */
  overtimeDuration?: number;

  /** Whether games can enter overtime. */
  overtimeEnabled?: boolean;

  /** Timed-game tie-break mode. */
  overtimeType?: 'standard' | 'target_score' | 'shootout' | 'sudden_death' | string;

  /** Target points for target-score overtime or Elam-ending add-on points. */
  overtimeTargetPoints?: number;

  /** Optional hard cap on overtime periods. */
  maxOvertimesEnabled?: boolean;
  maxOvertimes?: number;
  gameRules?: GameRuleConfig;

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

  /** Multiplier on the mid-range attempt weight in shot-location distribution.
   *  1.0 = NBA default. Used when shot-distribution sliders push midrange up/down
   *  without shifting the other two 2PT buckets. */
  midRangeRateMult?: number;

  /** Multiplier on this team's 2PT (interior) efficiency. <1.0 means the defender
   *  is stacking help at the rim/post, so your paint FG% drops. Set by the
   *  opponent's Help Defense slider. 1.0 = neutral. */
  interiorEffMult?: number;

  /** Multiplier on the available-blocks pool passed to generateCoordinatedStats.
   *  1.0 = NBA default. >1.0 = more blocks (e.g. goaltending disabled → defenders
   *  can freely swat shots at/past the rim). 0 = blocks completely removed.
   *  Set via rule: goaltendingEnabled=false → 1.6 */
  blockRateMult: number;

  /** Multiplier on the share of turnovers credited as steals. */
  stealRateMult?: number;

  /** Multiplier on the offensive rebound pool. */
  orbRateMult?: number;

  /** Multiplier on assisted field goals after player passing quality is applied. */
  assistRateMult?: number;

  /** Optional era distribution exponent; lower values spread assists across lineups. */
  assistDistributionExponent?: number;

  /** Fast-engine adapter for era rebound opportunities not represented as live events. */
  reboundOpportunityMult?: number;

  /** Optional era distribution exponent; lower values spread rebounds across lineups. */
  reboundDistributionExponent?: number;

  /** Multiplier applied to LEAGUE_AVG_TOV in generateStatsForTeam.
   *  <1.0 = fewer turnovers (violations disabled, bigger court, no backcourt timer).
   *  Set via: travelingEnabled=false → 0.88, doubleDribbleEnabled=false → 0.90, etc. */
  tovMult: number;

  /** Multiplier applied to per-player FT% (gameFtp) — distinct from ftRateMult.
   *  ftRateMult controls how many FTA are *drawn*; ftEfficiencyMult controls how many *go in*.
   *  Set via: freeThrowDistance > 15 → <1.0 (farther line = harder shots). */
  ftEfficiencyMult: number;

  personalFoulRateMult?: number;

  engineCalibration?: Partial<Record<SimulationEngine, SimulationEngineCalibration>>;

  /** Era-level coaching tendency bias. Rule legality stays in base knobs; this
   *  leans the existing coaching/system shot mix toward the era. */
  eraCoachingBias?: EraCoachingBias;

  /** Applied in engine.ts to the raw game score BEFORE stat generation.
   *  Use for exhibition games (All-Star ~1.45, Rising Stars ~1.18) so the
   *  scoreboard shows realistic totals without double-counting paceMultiplier.
   *  When set, keep paceMultiplier = 1.0 so stats match the boosted score. */
  exhibitionScoreMult?: number;

  /** 0–4 scale. Controls how badly injured players are still included in the
   *  sim rotation and how much their performance is reduced.
   *  0 = injured players don't play (default).
   *  1 = day-to-day nags play at -2.5%.
   *  2 = moderate injuries play at -5%.
   *  3 = significant injuries play at -7.5%.
   *  4 = gut-it-out mode, all injuries play at -10%.
   *
   *  Applied per-player: factor = 1 − 0.025 × min(severity, playThroughInjuries). */
  playThroughInjuries?: number;
}

export const KNOBS_DEFAULT: SimulatorKnobs = {
  playersOnCourt:        5,
  homeCourtAdvantagePoints: 3,
  paceMultiplier:       1.0,
  fastScorePaceMultiplier: 1.0,
  efficiencyMultiplier: 1.0,
  threePointAvailable:  true,
  threePointRateMult:   1.0,
  threePointEfficiencyMult: 1.0,
  twoPointEfficiencyMult: 1.0,
  fourPointAvailable:   false,
  fourPointRateMult:    0,
  fourPointEfficiencyMult: 1.0,
  ftRateMult:           1.0,
  flatMinutes:          false,
  ratingFloor:          0,
  conferenceRank:       8,   // play-in bubble — safe default
  gbFromLeader:         0,
  gamesRemaining:       41,
  quarterLength:        12,
  numQuarters:          4,
  gameFormat:           'timed',
  targetScore:          100,
  overtimeDuration:     5,
  overtimeEnabled:      true,
  overtimeType:         'standard',
  overtimeTargetPoints: 7,
  maxOvertimesEnabled:  false,
  maxOvertimes:         0,
  gameRules:            DEFAULT_GAME_RULES,
  shotClockSeconds:     24,
  rimRateMult:          1.0,
  lowPostRateMult:      1.0,
  blockRateMult:        1.0,
  stealRateMult:        1.0,
  tovMult:              1.0,
  ftEfficiencyMult:     1.0,
  personalFoulRateMult: 1.0,
};

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
  flatMinutesTarget:     20,     // starting weight; normalized to the configured team-minute budget
  ratingFloor:           0,
  conferenceRank:        1,      // neutral — depth fully driven by rotationDepthOverride
  gbFromLeader:          0,
  gamesRemaining:        82,
  quarterLength:         12,
  shotClockSeconds:      24,
  rimRateMult:           1.0,
  lowPostRateMult:       1.0,
  blockRateMult:         1.0,
  tovMult:               1.0,
  ftEfficiencyMult:      1.0,
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
  flatMinutesTarget:     24,     // starting weight; normalized to the configured team-minute budget
  ratingFloor:           0,
  conferenceRank:        4,
  gbFromLeader:          0,
  gamesRemaining:        82,
  quarterLength:         12,
  shotClockSeconds:      24,
  rimRateMult:           1.0,
  lowPostRateMult:       1.0,
  blockRateMult:         1.0,
  tovMult:               1.0,
  ftEfficiencyMult:      1.0,
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
  tovMult:               1.0,
  ftEfficiencyMult:      1.0,
};

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
  tovMult:               1.0,
  ftEfficiencyMult:      1.0,
};

/**
 * B-League (Japan) — calibrated from Japan national team vs Philippines (FIBA).
 * NBA preseason uses NBA rules (12-min quarters). Japan FG%: 48.5%, 3P%: 37.1%,
 * FT%: 92% (Japanese players are elite FT shooters — one of the highest in the world).
 * More disciplined than PBA, good perimeter shooting, physical interior.
 * B-League is meaningfully above PBA level (Japan beat PH by 21 in 40 min).
 */
export const KNOBS_BLEAGUE: SimulatorKnobs = {
  ...KNOBS_PRESEASON,
  quarterLength:         12,    // NBA preseason uses NBA rules
  paceMultiplier:        0.90,  // slightly below NBA pace but not drastically slower
  efficiencyMultiplier:  0.93,  // FG% ~48% — close to NBA, small rust factor
  threePointRateMult:    0.82,  // moderate 3PA, less volume than NBA but not inside-only
  ftRateMult:            0.88,  // fewer FTA than NBA
  ftEfficiencyMult:      1.05,  // Japanese players shoot FTs exceptionally well (~90%+)
  rotationDepthOverride: 11,
  tovMult:               0.88,  // disciplined ball movement
};

/**
 * Euroleague vs NBA preseason — calibrated from real Dallas vs Real Madrid box score.
 * NBA rules apply (12-min quarters). Combined 250 pts, FG% 47% both sides,
 * heavy 3PA volume (97 combined vs NBA ~65), FT% lower (~65% vs NBA 77%).
 * Euroleague adapts to NBA pace — they don't slow it down, they run with it.
 */
export const KNOBS_EUROLEAGUE: SimulatorKnobs = {
  ...KNOBS_PRESEASON,
  quarterLength:         12,    // NBA rules in international preseason games
  paceMultiplier:        1.05,  // Euroleague actually scores MORE vs NBA (open up and run)
  efficiencyMultiplier:  0.95,  // FG% near identical to NBA, slight rust factor
  threePointRateMult:    1.10,  // Euroleague shoots MORE 3s than NBA in this context (97 vs ~65)
  ftRateMult:            0.85,  // fewer trips to the line vs NBA pace
  ftEfficiencyMult:      0.88,  // FT% ~65% vs NBA ~77% — real Euroleague trait
  rotationDepthOverride: 11,
  tovMult:               0.90,  // disciplined ball movement, fewer TOs
};

/**
 * EuroLeague / Liga ACB club competition — FIBA cadence and less heliocentric
 * star usage than NBA. Tuned to keep MVP-level leaders nearer ~18-22 PPG.
 */
export const KNOBS_EURO_CLUB_COMPETITION: SimulatorKnobs = {
  ...KNOBS_DEFAULT,
  quarterLength:         10,
  numQuarters:           4,
  paceMultiplier:        0.95,
  efficiencyMultiplier:  0.91,
  threePointRateMult:    1.22,
  ftRateMult:            1.45, // 40-minute whistle still yields roughly NBA-rate attempts per minute
  ftEfficiencyMult:      0.93,
  blockRateMult:         1.0,
  stealRateMult:         1.0,
  orbRateMult:           1.20,
  assistRateMult:        1.35,
  reboundOpportunityMult: 0.80,
  personalFoulRateMult:  1.70, // Fast path includes EuroLeague's larger non-shooting-foul share
  tovMult:               0.98,
  rotationDepthOverride: 11,
  starMpgOverride:       30,
  conferenceRank:        3,
  gbFromLeader:          0,
  gamesRemaining:        20,
  engineCalibration: {
    fast: {
      paceMultiplier: 0.78,
      threePointRateMult: 1.25,
      threePointAttemptCapMult: 1.50,
      threePointEfficiencyMult: 1.22,
      ftRateMult: 1.75,
      blockRateMult: 0.62,
      stealRateMult: 1.50,
      assistRateMult: 1.20,
      personalFoulRateMult: 0.95,
    },
  },
};

export const KNOBS_EURO_FRIENDLY: SimulatorKnobs = {
  ...KNOBS_EURO_CLUB_COMPETITION,
  paceMultiplier:        0.92,
  efficiencyMultiplier:  0.90,
  rotationDepthOverride: 13,
  starMpgOverride:       24,
};

/**
 * PBA — tuned for league play, not FIBA mismatch games.
 * Current reference shape: low-to-mid 100s scoring, slightly lower efficiency than
 * NBA, physical whistle, moderate 3PA, and a low-volume but real 4-point line.
 */
export const KNOBS_PBA: SimulatorKnobs = {
  ...KNOBS_PRESEASON,
  quarterLength:         12,    // NBA preseason uses NBA rules
  paceMultiplier:        1.0,
  efficiencyMultiplier:  0.93,
  interiorEffMult:       0.94,
  rimRateMult:           0.88,
  lowPostRateMult:       0.82,
  midRangeRateMult:      1.18,
  threePointRateMult:    1.0,
  threePointEfficiencyMult: 0.84,
  fourPointAvailable:    true,
  fourPointRateMult:     3.0,
  fourPointEfficiencyMult: 1.1,
  ftRateMult:            1.28,
  ftEfficiencyMult:      0.98,
  blockRateMult:         1.55,
  orbRateMult:           1.0,
  assistRateMult:        0.90,
    assistDistributionExponent: 0.55,
  reboundDistributionExponent: 0.75,
  tovMult:               0.95,
  rotationDepthOverride: 11,
  eraCoachingBias:       PBA_COACHING_BIAS,
  engineCalibration: {
    fast: {
      paceMultiplier: 1.00,
      fieldGoalAttemptMult: 0.84,
      threePointRateMult: 2.40,
      threePointAttemptCapMult: 2.05,
      threePointSkillExponentMult: 0.30,
      threePointAttemptVolumeMult: 1.45,
      threePointAttemptFloorRate: 0.34,
      bigThreePointAttemptFloorRate: 0.16,
      lowThreePointAttemptCapMult: 1.43,
      threePointEfficiencyMult: 1.45,
      twoPointEfficiencyMult: 1.06,
      ftRateMult: 1.055,
      ftEfficiencyMult: 1.03,
      blockRateMult: 0.80,
      stealRateMult: 1.50,
      orbRateMult: 1.80,
      assistRateMult: 0.94,
      reboundOpportunityMult: 1.20,
      tovMult: 1.23,
      personalFoulRateMult: 1.15,
    },
    realistic: {
      paceMultiplier: 1.13,
      efficiencyMultiplier: 1.008,
      threePointRateMult: 3.65,
      threePointEfficiencyMult: 1.30,
      ftRateMult: 2.48,
      orbRateMult: 1.50,
      assistRateMult: 1.18,
      blockRateMult: 1.12,
      stealRateMult: 0.82,
      tovMult: 1.02,
    },
  },
};

export const KNOBS_WNBA: SimulatorKnobs = {
  ...KNOBS_DEFAULT,
  quarterLength: 10,
  numQuarters: 4,
  engineCalibration: {
    fast: {
      paceMultiplier: 1.00,
      fieldGoalAttemptMult: 0.78,
      efficiencyMultiplier: 0.95,
      threePointRateMult: 1.45,
      threePointAttemptCapMult: 1.35,
      threePointEfficiencyMult: 1.00,
      twoPointEfficiencyMult: 1.08,
      ftRateMult: 1.205,
      ftEfficiencyMult: 1.08,
      blockRateMult: 1.70,
      stealRateMult: 1.20,
      orbRateMult: 1.50,
      assistRateMult: 1.25,
      reboundOpportunityMult: 1.05,
      personalFoulRateMult: 1.50,
    },
    realistic: {
      paceMultiplier: 1.04,
      efficiencyMultiplier: 0.85,
      threePointRateMult: 0.75,
      threePointEfficiencyMult: 1.05,
      ftRateMult: 1.35,
      ftEfficiencyMult: 1.03,
      blockRateMult: 2.10,
      orbRateMult: 1.28,
      assistRateMult: 1.00,
      reboundOpportunityMult: 0.81,
      stealRateMult: 0.93,
      tovMult: 0.97,
    },
  },
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
  numQuarters: 4,
  paceMultiplier: 0.93,
  efficiencyMultiplier: 0.95,
  threePointRateMult: 0.9,
  ftRateMult: 0.88,
  orbRateMult: 0.9,
  assistRateMult: 0.92,
  assistDistributionExponent: 0.9,
  reboundOpportunityMult: 0.95,
  reboundDistributionExponent: 1.35,
  rotationDepthOverride: 11,
  starMpgOverride: 30,
  conferenceRank: 3,
  gbFromLeader: 0,
  gamesRemaining: 20,
};

export function isEuroClubTeamId(teamId: number): boolean {
  return (teamId >= 1000 && teamId < 2000) || (teamId >= 5000 && teamId < 6000);
}

export function isEuroClubCompetitionGame(
  team: { id: number } | number,
  knobs: Pick<SimulatorKnobs, 'quarterLength'>,
): boolean {
  const tid = typeof team === 'number' ? team : team.id;
  return isEuroClubTeamId(tid) && (knobs.quarterLength ?? 12) <= 10;
}

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

export function applySimulationEngineCalibration(
  knobs: SimulatorKnobs,
  engine: SimulationEngine,
): SimulatorKnobs {
  const calibration = knobs.engineCalibration?.[engine];
  if (!calibration) return knobs;
  const { engineCalibration: _engineCalibration, ...base } = knobs;
  const multiply = (value: number | undefined, multiplier: number | undefined) =>
    (value ?? 1) * (multiplier ?? 1);
  return {
    ...base,
    paceMultiplier: multiply(knobs.paceMultiplier, calibration.paceMultiplier),
    fieldGoalAttemptMult: multiply(knobs.fieldGoalAttemptMult, calibration.fieldGoalAttemptMult),
    efficiencyMultiplier: multiply(knobs.efficiencyMultiplier, calibration.efficiencyMultiplier),
    threePointRateMult: multiply(knobs.threePointRateMult, calibration.threePointRateMult),
    threePointAttemptCapMult: multiply(knobs.threePointAttemptCapMult, calibration.threePointAttemptCapMult),
    threePointSkillExponentMult: multiply(knobs.threePointSkillExponentMult, calibration.threePointSkillExponentMult),
    threePointAttemptVolumeMult: multiply(knobs.threePointAttemptVolumeMult, calibration.threePointAttemptVolumeMult),
    threePointAttemptFloorRate: calibration.threePointAttemptFloorRate ?? knobs.threePointAttemptFloorRate,
    bigThreePointAttemptFloorRate: calibration.bigThreePointAttemptFloorRate ?? knobs.bigThreePointAttemptFloorRate,
    lowThreePointAttemptCapMult: multiply(knobs.lowThreePointAttemptCapMult, calibration.lowThreePointAttemptCapMult),
    threePointEfficiencyMult: multiply(knobs.threePointEfficiencyMult, calibration.threePointEfficiencyMult),
    twoPointEfficiencyMult: multiply(knobs.twoPointEfficiencyMult, calibration.twoPointEfficiencyMult),
    ftRateMult: multiply(knobs.ftRateMult, calibration.ftRateMult),
    ftEfficiencyMult: multiply(knobs.ftEfficiencyMult, calibration.ftEfficiencyMult),
    blockRateMult: multiply(knobs.blockRateMult, calibration.blockRateMult),
    stealRateMult: multiply(knobs.stealRateMult, calibration.stealRateMult),
    orbRateMult: multiply(knobs.orbRateMult, calibration.orbRateMult),
    assistRateMult: multiply(knobs.assistRateMult, calibration.assistRateMult),
    reboundOpportunityMult: multiply(knobs.reboundOpportunityMult, calibration.reboundOpportunityMult),
    tovMult: multiply(knobs.tovMult, calibration.tovMult),
    personalFoulRateMult: multiply(knobs.personalFoulRateMult, calibration.personalFoulRateMult),
  };
}

export interface SystemKnobMods {
  paceBonus:        number;  // ×paceMultiplier
  efficiencyMod:    number;  // ×efficiencyMultiplier
  threePointMod:    number;  // ×threePointRateMult
  rimMod:           number;  // ×rimRateMult
  lowPostMod:       number;  // ×lowPostRateMult
  midRangeMod:      number;  // ×midRangeRateMult
  helioStarPtsMod:  number;  // extra ptsMult for #1 scoring option (Heliocentric only)
  helioStarEffMod:  number;  // extra effMult for #1 scoring option (Heliocentric only)
}

const NEUTRAL_MODS: SystemKnobMods = {
  paceBonus: 1, efficiencyMod: 1, threePointMod: 1,
  rimMod: 1, lowPostMod: 1, midRangeMod: 1,
  helioStarPtsMod: 1, helioStarEffMod: 1,
};

const SYSTEM_MODS: Record<string, SystemKnobMods> = {
  'Heliocentric':     { ...NEUTRAL_MODS, paceBonus: 0.93, efficiencyMod: 0.95, helioStarPtsMod: 1.28, helioStarEffMod: 0.91 },
  'Run and Gun':      { ...NEUTRAL_MODS, paceBonus: 1.10, efficiencyMod: 0.96, threePointMod: 1.14 },
  '7 Seconds':        { ...NEUTRAL_MODS, paceBonus: 1.08, efficiencyMod: 0.97, threePointMod: 1.10 },
  'Point-Five':       { ...NEUTRAL_MODS, paceBonus: 1.10, efficiencyMod: 0.96, threePointMod: 1.08 },
  'Early Offense':    { ...NEUTRAL_MODS, paceBonus: 1.06, rimMod: 1.06 },
  'Pace and Space':   { ...NEUTRAL_MODS, paceBonus: 1.05, threePointMod: 1.12 },
  'Five-Out Drive':   { ...NEUTRAL_MODS, threePointMod: 1.10, rimMod: 1.08 },
  'Five-Out Slasher': { ...NEUTRAL_MODS, rimMod: 1.12, threePointMod: 1.08 },
  'Gravity Motion':   { ...NEUTRAL_MODS, paceBonus: 1.02, threePointMod: 1.15 },
  'Perimeter Centric':{ ...NEUTRAL_MODS, threePointMod: 1.12, midRangeMod: 1.08 },
  'Dribble Drive':    { ...NEUTRAL_MODS, paceBonus: 1.03, rimMod: 1.15 },
  'Post Hub':         { ...NEUTRAL_MODS, paceBonus: 0.96, lowPostMod: 1.15, rimMod: 1.10 },
  'Post Anchor':      { ...NEUTRAL_MODS, paceBonus: 0.95, lowPostMod: 1.12, rimMod: 1.12 },
  'Post Centric':     { ...NEUTRAL_MODS, paceBonus: 0.94, lowPostMod: 1.18, rimMod: 1.08 },
  'Twin Towers':      { ...NEUTRAL_MODS, paceBonus: 0.95, lowPostMod: 1.20, rimMod: 1.15, threePointMod: 0.80 },
  'The Wheel':        { ...NEUTRAL_MODS, paceBonus: 1.05, threePointMod: 1.05, midRangeMod: 1.05 },
  'Triangle':         { ...NEUTRAL_MODS, paceBonus: 0.95, midRangeMod: 1.12 },
  'P&R Mastery':      { ...NEUTRAL_MODS, paceBonus: 1.02, rimMod: 1.10 },
  'Grit and Grind':   { ...NEUTRAL_MODS, paceBonus: 0.88, efficiencyMod: 0.96, rimMod: 1.05 },
  'Defense':          { ...NEUTRAL_MODS, paceBonus: 0.92, efficiencyMod: 0.94 },
  'Balanced':         { ...NEUTRAL_MODS },
};

export function getSystemMods(systemName: string): SystemKnobMods {
  return SYSTEM_MODS[systemName] ?? NEUTRAL_MODS;
}
