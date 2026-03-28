/**
 * MinutesPlayedService.ts
 *
 * Unified source of truth for:
 *   (A) WHO plays in the rotation — depth, order, health/standings/context/age factors
 *   (B) HOW MANY minutes each player in that rotation receives
 *
 * Renamed from RotationService.ts to avoid name confusion with the
 * live-playback rotation tracker in simulation/live/.
 *
 * Previously the rotation depth logic lived here as a stub while StarterService
 * (role-based lineup picker) was actually called by StatGenerator/initial.ts.
 * This file is now the single call-site for simulation stats generation.
 *
 * Causal weight model for rotation depth (2025-26 NBA analysis):
 *   Competitive Incentive  (standings rank)   35%
 *   Roster Health & Attrition                 30%
 *   Schedule / Blowout Context                20%
 *   Demographic Maturity   (avg team age)     15%
 */

import { NBAPlayer as Player, NBATeam as Team } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { R } from './StatGenerator/helpers';
import { StarterService } from './StarterService';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface RotationResult {
  /** Ordered player list: index 0–4 = starters, 5+ = bench by depth. */
  players: Player[];
  /** Total number of players in the rotation (7–13). */
  depth: number;
  /** Suggested star MPG target based on standings pressure (used by allocateMinutes). */
  starMpgTarget: number;
}

export interface MinuteAllocation {
  /** Minutes per player — parallel to the rotation array. */
  minutes: number[];
  /** Post-clamp total (≈ (48 + otCount×5) × 5). */
  totalMinutes: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// BENCH MINUTE TIERS
// Real NBA distributions: 6th man 22-28, 7th man 17-23, etc.
// ─────────────────────────────────────────────────────────────────────────────

const BENCH_TIERS = [
  { base: 22, spread: 6 },  // depth slot 0 → 6th man  → 22–28, avg 25
  { base: 17, spread: 6 },  // depth slot 1 → 7th man  → 17–23, avg 20
  { base: 11, spread: 6 },  // depth slot 2 → 8th man  → 11–17, avg 14
  { base: 4,  spread: 4 },  // depth slot 3 → 9th man  →  4–8,  avg  6
  { base: 1,  spread: 3 },  // depth slot 4+→ deep res →  1–4,  avg  2.5
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Competitive incentive: derive base depth and star MPG from conference rank,
 * GB from leader, and games remaining.
 *
 * Three contextual overrides sit on top of the standard rank profile:
 *  1. Eliminated (GB > gamesRemaining) → full development rotation, 12-deep, star ~26 MPG
 *  2. Locked-in #1 seed (late season, can't be caught) → extra rest mode, star ~30 MPG
 *  3. Late-season play-in push (rank 7-10, final 20 games) → tight 7-man, star ~38.5 MPG
 */
function standingsProfile(
  rank: number,
  gbFromLeader: number = 0,
  gamesRemaining: number = 41,
): { baseDepth: number; starMpg: number } {
  // ── Contextual overrides ─────────────────────────────────────────────────

  // Hard elimination: winning every remaining game still can't close the gap.
  // Chicago (4-52, GB 37.5, ~26 left): 37.5 > 26 → run the Gleaguers.
  if (gbFromLeader > gamesRemaining) {
    return { baseDepth: 12, starMpg: 26.0 };
  }

  // Locked-in top seed: #1 with an insurmountable lead in the final 25 games.
  // OKC, Cavs in late March — genuine rest/load-management mode.
  if (rank === 1 && gamesRemaining <= 25) {
    return { baseDepth: 10, starMpg: 30.0 };
  }

  // Late-season play-in crunch: rank 7-10 in the final 20 games.
  // Every game counts — tightest possible rotation.
  if (rank >= 7 && rank <= 10 && gamesRemaining <= 20) {
    return { baseDepth: 7, starMpg: 38.5 };
  }

  // ── Standard rank profiles ────────────────────────────────────────────────
  if (rank <= 3)  return { baseDepth: 10, starMpg: 33.0 };  // secured — rest stars
  if (rank <= 5)  return { baseDepth: 8,  starMpg: 36.5 };  // comfortable contender
  if (rank <= 8)  return { baseDepth: 8,  starMpg: 37.5 };  // must-win zone
  if (rank <= 10) return { baseDepth: 9,  starMpg: 36.0 };  // play-in bubble
  return                 { baseDepth: 11, starMpg: 31.0 };  // lottery — evaluate youth
}

/** Roster health: cap depth to available healthy bodies. */
function healthAdjustment(baseDepth: number, healthyCount: number): number {
  const capped = Math.min(baseDepth, healthyCount);
  if (healthyCount <= 7) return Math.max(healthyCount, 6); // all hands on deck
  if (healthyCount <= 9) return Math.min(capped, 9);
  return capped;
}

/** Blowout/close game context: expand or contract rotation + star MPG modifier. */
function blowoutAdjustment(depth: number, lead: number): { depth: number; starMpgMod: number } {
  const abs = Math.abs(lead);
  if (abs > 25) return { depth: Math.min(depth + 3, 13), starMpgMod: -5.0 };
  if (abs > 18) return { depth: Math.min(depth + 2, 12), starMpgMod: -3.5 };
  if (abs > 10) return { depth: Math.min(depth + 1, 11), starMpgMod: -2.0 };
  if (abs < 5)  return { depth: Math.max(depth - 1,  7), starMpgMod: +1.0 }; // dogfight
  return               { depth,                          starMpgMod:  0   };
}

/** Demographic maturity: young roster → deeper rotation; veterans → load manage. */
function ageAdjustment(
  players: Player[],
  depth: number,
  starMpg: number,
  season: number,
): { depth: number; starMpg: number } {
  if (players.length === 0) return { depth, starMpg };
  const avgAge =
    players.reduce((s, p) => s + (season - (p.born?.year ?? season - 24)), 0) / players.length;

  if (avgAge < 24) return { depth: Math.min(depth + 1, 13), starMpg };              // OKC/SAS youth model
  if (avgAge > 29) return { depth: Math.max(depth - 1,  7), starMpg: Math.min(starMpg, 34) }; // LAC load manage
  return { depth, starMpg };
}

/** Sort players best→worst by 2K overall rating. */
function sortByOVR(players: Player[], season: number): Player[] {
  return [...players].sort((a, b) => {
    const hgtA = a.ratings?.[a.ratings.length - 1]?.hgt ?? 50;
    const hgtB = b.ratings?.[b.ratings.length - 1]?.hgt ?? 50;
    return convertTo2KRating(b.overallRating, hgtB) - convertTo2KRating(a.overallRating, hgtA);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export class MinutesPlayedService {

  // ── A: WHO PLAYS ──────────────────────────────────────────────────────────

  /**
   * Returns the ordered rotation and depth metadata for one game.
   *
   * @param team            Team object.
   * @param players         Full player pool (filtered internally by team + health).
   * @param lead            Running score differential (positive = home ahead).
   * @param season          Season year (e.g. 2026) for rating lookups.
   * @param overridePlayers Pre-filtered roster (All-Star, scrimmage, etc.).
   * @param conferenceRank  1–15 standing in conference. Defaults to 8 (play-in).
   */
  static getRotation(
    team: Team,
    players: Player[],
    lead: number = 0,
    season: number = 2025,
    overridePlayers?: Player[],
    conferenceRank: number = 8,
    gbFromLeader: number = 0,
    gamesRemaining: number = 41,
    depthOverride?: number,
  ): RotationResult {
    const roster  = overridePlayers ?? players.filter(p => p.tid === team.id);
    const healthy = roster.filter(p => !p.injury || p.injury.gamesRemaining <= 0);
    const pool    = healthy.length >= 5 ? healthy : roster.slice(0, Math.max(5, roster.length));

    // ── Depth calculation (standings + health + context + age) ──────────────
    const { baseDepth, starMpg: baseMpg }  = standingsProfile(conferenceRank, gbFromLeader, gamesRemaining);
    const healthDepth                       = healthAdjustment(baseDepth, pool.length);
    const { depth: ctxDepth, starMpgMod }  = blowoutAdjustment(healthDepth, lead);
    const { depth: finalDepth, starMpg }   = ageAdjustment(
      sortByOVR(pool, season), ctxDepth, baseMpg + starMpgMod, season
    );
    // depthOverride (e.g. rotationDepthOverride=12 for All-Star) bypasses the
    // standings-based depth so that all selected players actually get into the rotation.
    const depth = depthOverride
      ? Math.min(depthOverride, pool.length)
      : Math.max(7, Math.min(13, finalDepth));

    // ── Ordered rotation — StarterService for role-aware starters + bench ───
    // StarterService.getRotation returns [5 starters, N bench] sorted by role fit
    // then OVR.  We slice to the depth we've calculated above.
    const roleOrdered = StarterService.getRotation(team, players, lead, season, pool);

    const finalRotation = roleOrdered.slice(0, depth);
    console.debug(
      `[Rotation] ${team.name} | rank=${conferenceRank} gb=${gbFromLeader} rem=${gamesRemaining}` +
      ` | baseDepth=${depthOverride ? `OVERRIDE→${depthOverride}` : baseDepth} health=${pool.length} ctx=${ctxDepth} final=${depth}` +
      ` | starMPG=${starMpg.toFixed(1)} | players=[${finalRotation.map(p => p.name).join(', ')}]`
    );
    return {
      players:       finalRotation,
      depth,
      starMpgTarget: Math.max(28, Math.min(39, starMpg)),
    };
  }

  /**
   * Convenience overload — returns just the Player[] array.
   * Drop-in replacement for StarterService.getRotation().
   */
  static getRotationPlayers(
    team: Team,
    players: Player[],
    lead: number = 0,
    season: number = 2025,
    overridePlayers?: Player[],
    conferenceRank: number = 8,
    gbFromLeader: number = 0,
    gamesRemaining: number = 41,
    depthOverride?: number,
  ): Player[] {
    return this.getRotation(team, players, lead, season, overridePlayers, conferenceRank, gbFromLeader, gamesRemaining, depthOverride).players;
  }

  // ── B: HOW MANY MINUTES ───────────────────────────────────────────────────

  /**
   * Allocate playing time for every player in the rotation.
   * Minutes sum to (48 + otCount×5) × 5 after clamping.
   *
   * @param rotation  Ordered array from getRotation() / getRotationPlayers().
   *                  Slots 0-4 are starters; 5+ are bench by depth.
   * @param season    Season year for rating lookups.
   * @param lead      Score differential for blowout detection.
   * @param otCount   Number of OT periods (adds 5 min per period).
   * @param starMpgTarget Optional star MPG target from RotationResult — when
   *                      provided, nudges slot-0 minutes toward this value.
   */
  static allocateMinutes(
    rotation: Player[],
    season: number,
    lead: number = 0,
    otCount: number = 0,
    starMpgTarget?: number,
  ): MinuteAllocation {
    const isBlowout    = Math.abs(lead) > 15;
    const isBigBlowout = Math.abs(lead) > 25;
    const gameLengthMin = 48 + otCount * 5;
    const otMultiplier  = gameLengthMin / 48;  // 1.0 reg, ~1.10 1OT, ~1.21 2OT

    const weights = rotation.map((p, i) => {
      const endu = R(p, 'endu', season);
      let baseMins: number;

      if (i < 5) {
        // Starters — use starMpgTarget for slot 0 when provided
        if (i === 0 && starMpgTarget !== undefined) {
          baseMins = starMpgTarget + (Math.random() - 0.5) * 2; // ±1 min wobble
        } else {
          baseMins = isBigBlowout
            ? 30 + Math.random() * 4   // 30–34
            : isBlowout
            ? 33 + Math.random() * 3   // 33–36
            : 35 + Math.random() * 3;  // 35–38
        }
        // Soft fatigue: endu < 40 clips up to ~4.5 min (e.g. Wemby endu=10 → –4.5 min)
        const fatigue = endu < 40 ? (40 - endu) * 0.15 : 0;
        baseMins -= fatigue;
      } else {
        // Bench — depth-tiered base minutes
        const depthSlot = Math.min(i - 5, BENCH_TIERS.length - 1);
        const { base, spread } = BENCH_TIERS[depthSlot];
        const blowoutBonus = isBigBlowout ? 8 : isBlowout ? 4 : 0;
        baseMins = base + Math.random() * spread + blowoutBonus;
        const fatigue = endu < 40 ? (40 - endu) * 0.10 : 0;
        baseMins -= fatigue;
      }

      // Scale up for OT: a player who'd play 37 min in regulation plays ~44 min in 2OT.
      // Cap at full game length so no player exceeds the game clock.
      const scaledMins = Math.max(1, baseMins) * otMultiplier;
      return Math.min(gameLengthMin, scaledMins);
    });

    // Hard clamp: trim bench first (deepest → shallowest), starters last
    const TARGET = gameLengthMin * 5;
    let total    = weights.reduce((a, b) => a + b, 0);

    const trimOrder = Array.from(
      { length: Math.min(weights.length, 13) },
      (_, k) => weights.length - 1 - k,
    );
    let ti = 0;
    while (total > TARGET && ti < trimOrder.length) {
      const idx = trimOrder[ti];
      // Deep bench in blowouts should keep ~8-12 min (garbage time quarter).
      // Starters/6th-man always trimmed down to 4-min absolute floor.
      const minFloor = idx >= 5
        ? (isBigBlowout ? 8 : isBlowout ? 6 : 4)
        : 4;
      if (weights[idx] > minFloor) { weights[idx] -= 1; total -= 1; }
      else { ti++; }
    }

    // Scale up if small rotation left minutes unallocated (initial total < TARGET).
    // Without this, a 7-player rotation allocates ~225 min instead of 240, leaving a
    // 15-min shortfall that coordinated.ts then dumps onto one player as a "rounding fix."
    if (total < TARGET && weights.length > 0) {
      const scale = TARGET / total;
      for (let i = 0; i < weights.length; i++) {
        weights[i] = Math.min(gameLengthMin, weights[i] * scale);
      }
      total = weights.reduce((a, b) => a + b, 0);
    }

    console.debug(
      `[Minutes] ${rotation.length}p | target=${TARGET} allocated=${total.toFixed(1)} | ` +
      rotation.map((p, i) => `${p.name.split(' ').pop()}=${weights[i].toFixed(1)}`).join(' ')
    );
    return { minutes: weights, totalMinutes: total };
  }
}
