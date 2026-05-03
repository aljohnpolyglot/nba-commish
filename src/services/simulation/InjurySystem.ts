import { NBAPlayer, NBATeam } from '../../types';
import { getInjuries } from '../injuryService';
import { normalRandom } from './utils';
import {
  getPlayerInjuryProfile,
  get2KExplosiveness,
  BODY_PART_TO_INJURIES,
} from '../../data/playerInjuryData';

export interface PlayerInjuryEvent {
  playerId: string;
  playerName: string;
  teamId: number;
  injuryType: string;
  gamesRemaining: number;
  /** Permanent rating deltas to apply to the player's current-season ratings object.
   *  Only present for major injuries (see MAJOR_INJURY_STAT_CHANGES). */
  statChanges?: Partial<Record<string, number>>;
  /** ISO date this injury was logged. Engine stamps this before results are dispatched. */
  startDate?: string;
  /** Origin label — "vs HOU" / "@OKC". Absent when non-game (checkInjuries bench roll). */
  origin?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAJOR INJURY STAT CHANGES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Permanent rating changes (deltas) applied when a player sustains a major injury.
 *
 * Based on real NBA injury outcomes:
 *   - ACL / Achilles / labrum tears → explosive athleticism drops (spd, jmp)
 *     but players often return with better shot-creation (fg, tp) and higher IQ
 *     from the long film-study rehab period.
 *   - Hamstring / hip injuries → speed and quickness losses.
 *   - Back injuries → reduced explosiveness + inside scoring ability.
 *   - Shoulder injuries → rim-attack and post moves take a hit.
 *   - Stress fractures / broken legs → milder but lasting speed penalty.
 *
 * Positive deltas on skill ratings model the "reinvention" many players undergo
 * after a serious injury forces them to evolve their game (e.g. post-Achilles
 * KD becoming a more iso-reliant, high-IQ scorer; post-ACL John Wall shifting
 * his game away from pure athleticism).
 */
const MAJOR_INJURY_STAT_CHANGES: Record<string, Partial<Record<string, number>>> = {
  // ── Lower-body catastrophic ──────────────────────────────────────────────
  'Torn ACL':               { spd: -6, jmp: -7, oiq: +2, tp: +2, fg: +1 },
  'Torn Achilles':          { spd: -8, jmp: -8, oiq: +3, tp: +3, fg: +2 },
  'Torn Meniscus':          { spd: -3, jmp: -4, oiq: +1 },
  'Torn MCL':               { spd: -4, jmp: -4 },
  'Torn PCL':               { spd: -4, jmp: -3 },
  'Torn Patellar Tendon':   { spd: -5, jmp: -6, oiq: +2, fg: +1 },
  // ── Hamstring / hip / quad ────────────────────────────────────────────────
  'Torn Hamstring':         { spd: -5, jmp: -3 },
  'Hamstring Tear':         { spd: -4, jmp: -2 },
  'Hip Fracture':           { spd: -5, jmp: -5, ins: -2 },
  'Quad Strain':            { spd: -2, jmp: -2 },
  'Quad Tear':              { spd: -4, jmp: -4 },
  // ── Foot / leg ────────────────────────────────────────────────────────────
  'Jones Fracture':         { spd: -3, jmp: -2 },
  'Lisfranc Injury':        { spd: -4, jmp: -4, oiq: +1 },
  'Stress Fracture (Foot)': { spd: -2, jmp: -2 },
  'Broken Leg':             { spd: -3, jmp: -3 },
  'Tibial Fracture':        { spd: -3, jmp: -3 },
  // ── Back ──────────────────────────────────────────────────────────────────
  'Herniated Disc':         { spd: -3, jmp: -2, ins: -2 },
  'Back Injury':            { spd: -2, jmp: -1, ins: -1 },
  'Spinal Stenosis':        { spd: -4, jmp: -3, ins: -2, oiq: +1 },
  // ── Shoulder / arm ────────────────────────────────────────────────────────
  'Torn Labrum (Shoulder)': { dnk: -4, ins: -3, oiq: +1, tp: +2 },
  'Rotator Cuff Tear':      { dnk: -3, ins: -2, oiq: +1, tp: +1 },
  'Dislocated Shoulder':    { dnk: -2, ins: -2 },
  // ── Wrist / hand / elbow ─────────────────────────────────────────────────
  'Broken Wrist':           { fg: -2, tp: -2, ft: -2 },
  'Broken Hand':            { fg: -2, ft: -2 },
  'Ulnar Collateral Ligament Tear': { fg: -3, ft: -2, tp: -2 },
};

/**
 * Worst-case permanent regression for catastrophic injuries (~25% chance).
 * Reflects career-altering outcomes (e.g. post-Achilles speed collapse).
 * If worst-case rolls, these REPLACE the base stat changes.
 */
const MAJOR_INJURY_WORST_CASE: Record<string, Partial<Record<string, number>>> = {
  'Torn ACL':             { spd: -9, jmp: -11, endu: -5, oiq: +3, fg: +1, tp: +2 },
  'Torn Achilles':        { spd: -16, jmp: -20, endu: -13, oiq: +4, fg: +2, tp: +3 },
  'Torn Patellar Tendon': { spd: -10, jmp: -13, endu: -5, oiq: +2, fg: +1 },
  'Torn Meniscus':        { spd: -6,  jmp: -8,  endu: -3, oiq: +1 },
  'Torn Hamstring':       { spd: -8,  jmp: -5,  endu: -4 },
  'Lisfranc Injury':      { spd: -7,  jmp: -6,  endu: -3, oiq: +1 },
  'Herniated Disc':       { spd: -5,  jmp: -4,  ins: -4, endu: -3 },
};

/** Probability of rolling worst-case regression on a catastrophic injury. */
const WORST_CASE_PROBABILITY = 0.25;

/**
 * Threshold: injuries with >= this many gamesRemaining trigger permanent stat changes.
 * Injuries shorter than this (< 15 games) are considered minor/recoverable.
 */
const MAJOR_INJURY_GAMES_THRESHOLD = 15;

/**
 * Season-ending injuries: always force a minimum of 82 gamesRemaining so the
 * player cannot return in the same season regardless of the random duration roll.
 * 82 is one full NBA regular season — enough to guarantee they miss the remainder
 * of the current year (and a handful of games at the start of next season, which
 * mirrors real ACL / Achilles recovery timelines).
 */
export const SEASON_ENDING_INJURIES = new Set([
  'Torn ACL',
  'Torn Achilles',
  'Torn Patellar Tendon',
  'Tibial Fracture',
  'Hip Fracture',
]);

/** True when the given injury type is considered devastating / long-term / career-altering. */
export function isDevastatingInjury(type: string): boolean {
  return SEASON_ENDING_INJURIES.has(type);
}
const SEASON_ENDING_MIN_GAMES = 82;

export function enforceSeasonEndingMinimum(type: string, games: number): number {
  return SEASON_ENDING_INJURIES.has(type)
    ? Math.max(SEASON_ENDING_MIN_GAMES, games)
    : games;
}

/**
 * Apply permanent stat changes to a player's current-season ratings when
 * a major injury event occurs.  Clamps each rating to [0, 99].
 *
 * @param player   The injured NBAPlayer (mutated in place)
 * @param season   Current season year (key into player.ratings)
 * @param changes  The stat delta map from MAJOR_INJURY_STAT_CHANGES
 */
export function applyMajorInjuryStatChanges(
  player: any, // NBAPlayer — using 'any' to avoid circular import friction
  season: number,
  changes: Partial<Record<string, number>>,
): void {
  const ratings = player.ratings?.find?.((r: any) => r.season === season)
    ?? player.ratings?.[player.ratings.length - 1];
  if (!ratings) return;

  for (const [key, delta] of Object.entries(changes)) {
    if (typeof ratings[key] === 'number') {
      ratings[key] = Math.max(0, Math.min(99, ratings[key] + delta));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Duration multiplier around the JSON mean.
 * Uses a normal distribution (σ=0.15) clamped to [0.75, 1.30] so the
 * empirically-calibrated JSON `games` stays close to reality.
 * healthLevel boosts severity (injured-prone / cumulative wear) additively.
 */
function durationMult(healthLevel = 0): number {
  const base = clamp(normalRandom(1.0, 0.15), 0.75, 1.30);
  return base + healthLevel * 0.10;
}

/** Weighted random pick from an array of [item, weight] pairs. */
function weightedRandom<T>(items: [T, number][]): T | null {
  const total = items.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

// Pre-compute cumulative sums over injury list for the generic (no-profile) path.
// Re-built when the fetched list is a different length from the cached version.
let _cumSums: number[] = [];
let _totalFreq = 0;
let _cumSumsBuiltFor = 0;
function initCumSums() {
  const injuries = getInjuries();
  if (_cumSums.length > 0 && _cumSumsBuiltFor === injuries.length) return;
  _cumSums = [];
  _cumSumsBuiltFor = injuries.length;
  let sum = 0;
  for (const inj of injuries) {
    sum += inj.frequency;
    _cumSums.push(sum);
  }
  _totalFreq = sum;
}

// ─────────────────────────────────────────────────────────────────────────────
// INJURY SELECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic injury — no player profile available.
 * Falls back to frequency-weighted random from INJURIES[].
 */
function genericInjury(healthLevel = 0): { type: string; gamesRemaining: number } {
  initCumSums();
  const injuries = getInjuries();
  const rand  = Math.random() * _totalFreq;
  let index   = _cumSums.findIndex(cs => cs >= rand);
  if (index === -1) index = injuries.length - 1;
  const inj   = injuries[index];
  const games = Math.max(1, Math.round(durationMult(healthLevel) * inj.games));
  return {
    type: inj.name,
    gamesRemaining: enforceSeasonEndingMinimum(inj.name, games),
  };
}

/**
 * Profile-aware injury:
 *  1. Pick a body part using the player's career injury_breakdown weights,
 *     optionally boosted toward lower-body for high-BMI explosive players.
 *  2. Pick a specific injury from BODY_PART_TO_INJURIES[bodyPart],
 *     weighted by frequency in INJURIES[].
 *  3. Use the matched injury's games value for duration.
 */
function profiledInjury(
  bodyParts: Record<string, number>,
  bmiLowerBodyBoost: number,
  healthLevel = 0,
): { type: string; gamesRemaining: number } {
  // Build weighted body-part pool, with lower-body amplification for BMI wear
  const LOWER_BODY = new Set(['knee', 'ankle', 'foot', 'achilles', 'calf', 'hamstring', 'quad']);
  const pool: [string, number][] = [];
  for (const [part, count] of Object.entries(bodyParts)) {
    if (!(part in BODY_PART_TO_INJURIES)) continue;
    const boost = LOWER_BODY.has(part) ? 1 + bmiLowerBodyBoost : 1;
    pool.push([part, count * boost]);
  }

  // Fallback: player profile exists but breakdown doesn't map cleanly → generic
  if (pool.length === 0) return genericInjury(healthLevel);

  const bodyPart = weightedRandom(pool);
  if (!bodyPart) return genericInjury(healthLevel);

  // Find matching injuries from the fetched list for this body part
  const candidates = BODY_PART_TO_INJURIES[bodyPart] ?? [];
  const injPool: [{ name: string; frequency: number; games: number }, number][] = [];
  for (const inj of getInjuries()) {
    if (candidates.includes(inj.name)) injPool.push([inj, inj.frequency]);
  }

  const inj = weightedRandom(injPool);
  if (!inj) return genericInjury(healthLevel);

  const games = Math.max(1, Math.round(durationMult(healthLevel) * inj.games));
  return {
    type: inj.name,
    gamesRemaining: enforceSeasonEndingMinimum(inj.name, games),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BMI + EXPLOSIVENESS WEAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a lower-body boost factor (0–1.5) for high-BMI explosive players.
 *
 * Formula:
 *   bmiWear  = max(0, (bmi - 25) / 6)   → 0 at NBA avg (~25), ~1.0 at BMI 31
 *   speedFactor = (speed + accel) / 200  → 0.6 at avg, ~0.85 at elite
 *   boost    = bmiWear × speedFactor
 *
 * Examples:
 *   Zion   (BMI ~33, speed 85, accel 85): (1.33 × 0.85) = 1.13 → big lower-body boost
 *   Embiid (BMI ~29, speed 78, accel 78): (0.67 × 0.78) = 0.52
 *   Jokic  (BMI ~31, speed 60, accel 60): (1.0  × 0.60) = 0.60  ← speed cancels out
 *   Curry  (BMI ~22, speed 92, accel 90): max(0, -0.5)  = 0   ← lean, no penalty
 */
function computeBMIWear(player: NBAPlayer): number {
  const hgtIn = player.hgt ?? 78;  // inches, default 6'6"
  const wt    = (player as any).weight ?? 220; // lbs, default 220
  const bmi   = (wt / (hgtIn * hgtIn)) * 703;
  const bmiWear = Math.max(0, (bmi - 25) / 6);

  if (bmiWear === 0) return 0; // lean player, no penalty

  const { speed, accel } = get2KExplosiveness(player.name, player.pos);
  const speedFactor = (speed + accel) / 200;
  return clamp(bmiWear * speedFactor, 0, 1.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// DURABILITY RATE MULTIPLIER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns an injury-rate multiplier from the player's historical frequency.
 *
 *   injuryFreqPerSeason = career_injury_count / yearsPro
 *   NBA_AVG_FREQ = 10 entries/season (rough league average)
 *   multiplier = clamp(freqPerSeason / NBA_AVG_FREQ, 0.20, 3.0)
 *
 * Anthony Davis: 296 / ~12yrs = 24.7 → ÷10 = 2.47x more injury prone
 * Durable vet:   30 / ~15yrs  =  2.0 → ÷10 = 0.20x (capped minimum)
 * Years pro estimated from age (conservative: age − 19, minimum 1).
 */
const NBA_AVG_FREQ = 10;

function durabilityMultiplier(player: NBAPlayer): number {
  const profile = getPlayerInjuryProfile(player.name);
  if (!profile) return 1.0; // no data → use base rate unchanged

  const yearsPro = Math.max(1, (player.age ?? 26) - 19);
  const freqPerSeason = profile.careerCount / yearsPro;
  return clamp(freqPerSeason / NBA_AVG_FREQ, 0.20, 3.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class InjurySystem {
  public static getSabotageGames(baseGames: number): number {
    const fluctuation = 0.8 + Math.random() * 0.4;
    return Math.max(1, Math.round(baseGames * fluctuation));
  }

  public static checkInjuries(
    players:  NBAPlayer[],
    homeTeam: NBATeam,
    awayTeam: NBATeam,
  ): PlayerInjuryEvent[] {
    const events: PlayerInjuryEvent[] = [];
    // Base rate covers bench/off-court "random" nags (practice, travel, soreness).
    // Was 0.015 — flooded the injuries list with non-game injuries every sim.
    // 0.004 keeps the league injured-share realistic without spamming unrelated players.
    const BASE_INJURY_RATE = 0.004;

    for (const player of players) {
      if (player.injury && player.injury.gamesRemaining > 0) continue;

      // ── Base rate ──────────────────────────────────────────────────────
      let injuryRate = BASE_INJURY_RATE;

      // ── Age factor (same as before) ────────────────────────────────────
      const age = player.age ?? 26;
      injuryRate *= Math.pow(1.03, Math.min(50, age) - 26);

      // ── Historical durability from career injury data ──────────────────
      injuryRate *= durabilityMultiplier(player);

      // ── Training fatigue → injury risk ─────────────────────────────────
      // 0 fatigue → 1.0×, 100 fatigue → 1.2×. Modern NBA sport-science teams
      // are very good at preventing fatigue-related injuries — pure load
      // monitoring + individualized recovery means a tired player isn't 50%
      // more likely to tear something. Mild bump only; the closed-loop pressure
      // comes from progression dampening, not catastrophic injury risk.
      // Future @NEW_FEATURES.md "Training Dev staff" tier should soften this
      // further for teams investing in performance science budget.
      const fatigue = Math.max(0, Math.min(100, (player as any).trainingFatigue ?? 0));
      injuryRate *= 1 + (fatigue / 100) * 0.2;

      // ── Load management for stars vs weak opponents ────────────────────
      const opponentTeam = player.tid === homeTeam.id ? awayTeam : homeTeam;
      if (opponentTeam.strength < 85 && player.overallRating > 70) { // BBGM 70+ = All-Star tier (load management realistic at this level)
        if (Math.random() < 0.05) {
          events.push({
            playerId:       player.internalId,
            playerName:     player.name,
            teamId:         player.tid,
            injuryType:     'Load Management',
            gamesRemaining: 1,
          });
          continue;
        }
      }

      // ── Roll ───────────────────────────────────────────────────────────
      if (Math.random() < injuryRate) {
        const profile       = getPlayerInjuryProfile(player.name);
        const bmiLowerBoost = computeBMIWear(player);

        const result = profile && Object.keys(profile.bodyParts).length > 0
          ? profiledInjury(profile.bodyParts, bmiLowerBoost)
          : genericInjury();

        const isMajor = result.gamesRemaining >= MAJOR_INJURY_GAMES_THRESHOLD;
        let statChanges = isMajor ? MAJOR_INJURY_STAT_CHANGES[result.type] : undefined;
        // Worst-case regression: ~25% chance on catastrophic injuries
        if (isMajor && MAJOR_INJURY_WORST_CASE[result.type] && Math.random() < WORST_CASE_PROBABILITY) {
          statChanges = MAJOR_INJURY_WORST_CASE[result.type];
        }

        events.push({
          playerId:       player.internalId,
          playerName:     player.name,
          teamId:         player.tid,
          injuryType:     result.type,
          gamesRemaining: result.gamesRemaining,
          ...(statChanges ? { statChanges } : {}),
        });
      }
    }

    return events;
  }
}
