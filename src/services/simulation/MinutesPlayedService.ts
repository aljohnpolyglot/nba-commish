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
import { getPlayerInjuryProfile } from '../../data/playerInjuryData';
import { injurySeverityLevel } from './playThroughInjuriesFactor';

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
  { base: 20, spread: 6 },  // depth slot 0 → 6th man  → 20–26, avg 23
  { base: 17, spread: 6 },  // depth slot 1 → 7th man  → 17–23, avg 20
  { base: 13, spread: 6 },  // depth slot 2 → 8th man  → 13–19, avg 16
  { base: 7,  spread: 5 },  // depth slot 3 → 9th man  →  7–12, avg  9.5
  { base: 2,  spread: 4 },  // depth slot 4+→ deep res →  2–6,  avg  4
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
    return { baseDepth: 8, starMpg: 36.0 };
  }

  // ── Standard rank profiles ────────────────────────────────────────────────
  if (rank <= 3)  return { baseDepth: 10, starMpg: 32.0 };  // secured — rest stars
  if (rank <= 5)  return { baseDepth: 9,  starMpg: 34.0 };  // comfortable contender
  if (rank <= 8)  return { baseDepth: 9,  starMpg: 35.0 };  // must-win zone
  if (rank <= 10) return { baseDepth: 9,  starMpg: 34.0 };  // play-in bubble
  return                 { baseDepth: 11, starMpg: 30.0 };  // lottery — evaluate youth
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

  if (avgAge < 24) return { depth: Math.min(depth + 2, 13), starMpg: Math.min(starMpg, 31) }; // OKC/SAS: cap starMpg → triggers youth mode in allocateMinutes
  if (avgAge > 29) return { depth: Math.max(depth - 1,  7), starMpg: Math.min(starMpg, 34) }; // LAC load manage
  return { depth, starMpg };
}

/** Sort players best→worst by 2K overall rating. */
function sortByOVR(players: Player[], season: number): Player[] {
  return [...players].sort((a, b) => {
    const hgtA = a.ratings?.[a.ratings.length - 1]?.hgt ?? 50;
    const hgtB = b.ratings?.[b.ratings.length - 1]?.hgt ?? 50;
    return convertTo2KRating(b.overallRating, hgtB, b.ratings?.[b.ratings.length - 1]?.tp) - convertTo2KRating(a.overallRating, hgtA, a.ratings?.[a.ratings.length - 1]?.tp);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DURABILITY MINUTE CAP
// ─────────────────────────────────────────────────────────────────────────────

const NBA_AVG_INJURY_FREQ = 10;

/**
 * Returns a maximum starter minutes cap for injury-prone players, derived from
 * real career injury history (same dataset used by InjurySystem.ts).
 *
 *   factor = careerInjuries / (yearsPro × NBA_AVG)
 *   ≤ 1.0  → durable / no data   → no cap (40 min ceiling)
 *   ≤ 1.5  → slightly prone      → 36 min cap  (e.g. LeBron era management)
 *   ≤ 2.0  → injury-prone        → 33 min cap  (Anthony Davis, Kawhi)
 *   > 2.0  → extremely prone     → 30 min cap  (Zion, early-career Embiid)
 */
function durabilityMinuteCap(player: Player): number {
  const profile = getPlayerInjuryProfile(player.name);
  if (!profile) return 40;

  const yearsPro = Math.max(1, (player.age ?? 26) - 19);
  const factor   = profile.careerCount / (yearsPro * NBA_AVG_INJURY_FREQ);

  if (factor <= 1.0) return 40;
  if (factor <= 1.5) return 36;
  if (factor <= 2.0) return 33;
  return 30;
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
    playThroughInjuries: number = 0,
  ): RotationResult {
    const roster  = overridePlayers ?? players.filter(p => p.tid === team.id);
    const healthy = roster.filter(p => !p.injury || p.injury.gamesRemaining <= 0);
    // Play-through: include injured players whose severity bucket is at or below
    // the knob. Regular season (pti=2) pulls in day-to-day (1) and moderate (2)
    // nags; playoffs (pti=4) pull in everyone short of long-term shelved.
    const playable = playThroughInjuries > 0
      ? roster.filter(p => {
          const g = p.injury?.gamesRemaining ?? 0;
          if (g <= 0) return true;
          return injurySeverityLevel(g) <= playThroughInjuries;
        })
      : healthy;
    let pool      = playable.length >= 5 ? playable : roster.slice(0, Math.max(5, roster.length));

    // Next-man-up: if short-handed (< 8 healthy bodies), pull the next available player
    // from the team's own roster — least-injured first (day-to-day before long-term).
    // Mirrors NBA "next man up" culture: the 9th/10th guy steps in, not a FA signing.
    const MIN_ROTATION = 8;
    if (pool.length < MIN_ROTATION) {
      const alreadyIn = new Set(pool.map(p => p.internalId));
      const callups = roster
        .filter(p => !alreadyIn.has(p.internalId))
        .sort((a, b) => (a.injury?.gamesRemaining ?? 0) - (b.injury?.gamesRemaining ?? 0))
        .slice(0, MIN_ROTATION - pool.length);
      pool = [...pool, ...callups];
    }

    // ── PER-based bench filter: drop stat-padders when depth allows ──────────
    // A player below 55% of league-avg PER (≈ PER 8 in a ~15 avg league) with
    // qualifying minutes is benched if we won't fall below MIN_ROTATION.
    // Guards against rookies / new arrivals with no stats: no stats → keep.
    {
      const perSamples = pool.flatMap(p =>
        ((p as any).stats ?? []).filter((s: any) => s.season === season && !s.playoffs && (s.gp ?? 0) > 0)
      );
      const leaguePERAvg = perSamples.length > 0
        ? perSamples.reduce((a: number, s: any) => a + ((s.per as number) ?? 0), 0) / perSamples.length
        : 15;
      const PER_FLOOR = leaguePERAvg * 0.55;
      const trimmed = pool.filter(p => {
        const pStats = ((p as any).stats ?? []).filter((s: any) => s.season === season && !s.playoffs && (s.gp ?? 0) > 0);
        if (pStats.length === 0) return true;
        const gp = pStats.reduce((a: number, s: any) => a + ((s.gp as number) ?? 0), 0);
        const minSum = pStats.reduce((a: number, s: any) => a + ((s.min as number) ?? 0), 0);
        if (gp < 5 || (gp > 0 && minSum / gp < 5)) return true;
        const per = minSum > 0
          ? pStats.reduce((a: number, s: any) => a + ((s.per as number) ?? 0) * ((s.min as number) ?? 0), 0) / minSum
          : leaguePERAvg;
        return per >= PER_FLOOR;
      });
      if (trimmed.length >= MIN_ROTATION) pool = trimmed;
    }

    // ── Depth calculation (standings + health + context + age) ──────────────
    const { baseDepth, starMpg: baseMpg }  = standingsProfile(conferenceRank, gbFromLeader, gamesRemaining);
    const healthDepth                       = healthAdjustment(baseDepth, pool.length);
    const { depth: ctxDepth, starMpgMod }  = blowoutAdjustment(healthDepth, lead);
    const { depth: finalDepth, starMpg }   = ageAdjustment(
      sortByOVR(pool, season), ctxDepth, baseMpg + starMpgMod, season
    );
    // depthOverride (e.g. rotationDepthOverride=12 for All-Star) bypasses the
    // standings-based depth so that all selected players actually get into the rotation.
    // Floor raised from 8 to 9 so regular-season Ideal/Gameplan plans show a realistic
    // 9-man rotation instead of playoff-tight 8. Playoff games already tighten naturally
    // via the blowout/age pipeline; 9 is still plausible for deeper playoff teams.
    const depth = depthOverride
      ? Math.min(depthOverride, pool.length)
      : Math.max(9, Math.min(13, finalDepth));

    // ── Ordered rotation — StarterService for role-aware starters + bench ───
    // StarterService.getRotation returns [5 starters, N bench] sorted by role fit
    // then OVR. Pass `depth` through so the bench fill honors the full rotation
    // (All-Star override=12 was getting clipped to StarterService's legacy 10-cap).
    const roleOrdered = StarterService.getRotation(team, players, lead, season, pool, true, depth);

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
    playThroughInjuries: number = 0,
  ): Player[] {
    return this.getRotation(team, players, lead, season, overridePlayers, conferenceRank, gbFromLeader, gamesRemaining, depthOverride, playThroughInjuries).players;
  }

  // ── B: HOW MANY MINUTES ───────────────────────────────────────────────────

  /**
   * Allocate playing time for every player in the rotation.
   * Minutes sum to (regulation length + overtime length) × 5 after clamping.
   *
   * @param rotation  Ordered array from getRotation() / getRotationPlayers().
   *                  Slots 0-4 are starters; 5+ are bench by depth.
   * @param season    Season year for rating lookups.
   * @param lead      Score differential for blowout detection.
   * @param otCount   Number of OT periods.
   * @param starMpgTarget Optional star MPG target from RotationResult — when
   *                      provided, nudges slot-0 minutes toward this value.
   */
  static allocateMinutes(
    rotation: Player[],
    season: number,
    lead: number = 0,
    otCount: number = 0,
    starMpgTarget?: number,
    isPlayoffs: boolean = false,
    quarterLength: number = 12,
    overtimeDuration: number = 5,
    numQuarters: number = 4,
  ): MinuteAllocation {
    const isBlowout    = Math.abs(lead) > 15;
    const isBigBlowout = Math.abs(lead) > 25;
    const regulationLengthMin = quarterLength * numQuarters;
    const gameLengthMin = regulationLengthMin + otCount * overtimeDuration;
    const otMultiplier  = gameLengthMin / regulationLengthMin;  // 1.0 reg → grows with each OT

    // Youth/development mode: lottery teams (starMpgTarget ≤ 31) spread minutes
    // across the full rotation instead of piling 35+ min on every starter.
    // Star still leads, but each subsequent starter steps down ~2 min, freeing
    // real minutes for the 9th–12th men (Dylan Harper, OKC depth guys, etc.).
    const isYouthMode = starMpgTarget !== undefined && starMpgTarget <= 31;

    const weights = rotation.map((p, i) => {
      const endu = R(p, 'endu', season);
      let baseMins: number;

      if (i < 5) {
        if (isYouthMode && starMpgTarget !== undefined) {
          // Youth starters: star gets target, each next slot steps down 2 min.
          // Slot 0: ~31, Slot 1: ~29, Slot 2: ~27, Slot 3: ~25, Slot 4: ~23
          const slotDrop = i * 2;
          baseMins = Math.max(20, starMpgTarget - slotDrop) + (Math.random() - 0.5) * 2;
        } else if (i === 0 && starMpgTarget !== undefined) {
          // Cap reg-season star MPG at 36 — real NBA averages (LeBron ~35, Luka
          // ~37, Giannis ~33, Jokic ~34). Playoffs can ride the full target for
          // the short-rotation effect. Without this clamp the Ideal's drift-
          // absorber tops the star off to 41-42 which looked fake.
          const regCap = 36;
          const effectiveTarget = isPlayoffs ? starMpgTarget : Math.min(regCap, starMpgTarget);
          baseMins = effectiveTarget + (Math.random() - 0.5) * 2; // ±1 min wobble
        } else {
          // Each subsequent starter slot steps down relative to the star's load.
          // Slot 1: ~star+1, Slot 2: ~star-3, Slot 3: ~star-7, Slot 4: ~star-12
          const slotDrops = [-3, -5, -8, -13];
          const slotDrop = slotDrops[i - 1] ?? -13;
          const starRef = Math.min(37, (starMpgTarget ?? 36) + 1);
          const normalRef = isBigBlowout ? Math.min(31, starRef) : isBlowout ? Math.min(34, starRef) : starRef;
          baseMins = Math.max(20, normalRef + slotDrop + (Math.random() - 0.5) * 4);
        }
        // Soft fatigue: endu < 40 clips up to ~4.5 min (e.g. Wemby endu=10 → –4.5 min)
        const fatigue = endu < 40 ? (40 - endu) * 0.15 : 0;
        baseMins -= fatigue;
        // Durability cap: injury-prone stars (AD, Kawhi, Zion) play fewer minutes
        // than the standings model would otherwise suggest (load management).
        baseMins = Math.min(baseMins, durabilityMinuteCap(p));
      } else {
        // Bench — depth-tiered base minutes
        const depthSlot = Math.min(i - 5, BENCH_TIERS.length - 1);
        const { base, spread } = BENCH_TIERS[depthSlot];
        const blowoutBonus = isBigBlowout ? 8 : isBlowout ? 4 : 0;
        // Youth teams boost deep bench slots so young reserves actually play
        const youthBonus = isYouthMode && depthSlot >= 3 ? 6 : 0;
        baseMins = base + Math.random() * spread + blowoutBonus + youthBonus;
        const fatigue = endu < 40 ? (40 - endu) * 0.10 : 0;
        baseMins -= fatigue;

        // Synergy nudge: 6th–8th men who qualify as spacers/playmakers/rebounders
        // get a small bump so they more reliably clear the minute threshold used by
        // calculateTeamStrengthWithMinutes (+2.0/+3.5 spacing, +1.5/+2.5 playmaking,
        // +1.0/+2.0 rebounding).
        if (depthSlot <= 2 && !isBlowout) {
          const lr = p.ratings?.[p.ratings.length - 1];
          if ((lr?.tp ?? 50) > 60)                             baseMins += 1.5;  // spacer → pushes over 15-min threshold
          if ((lr?.pss ?? 50) > 65)                            baseMins += 1.5;  // playmaker → pushes over 20-min threshold
          if (((lr?.hgt ?? 50) + (lr?.reb ?? 50)) / 2 > 62)   baseMins += 1.0;  // rebounder → pushes over 12-min threshold
        }
      }

      // Scale up for OT: a player who'd play 37 min in regulation plays ~44 min in 2OT.
      // Hard cap with jitter: ~38-40 min regular season, ~44-46 min playoffs.
      // Jitter prevents robotic "40:00" exactly — produces natural values like 38:17, 39:28.
      // Reg-season lowered from 40→38 to keep stars under 40 MPG (real-world norm).
      const MAX_BASE = isPlayoffs ? 44 : 38;
      const MAX_JITTER = 2; // ±0-2 min randomness
      const maxMinutes = (MAX_BASE + Math.random() * MAX_JITTER) * otMultiplier;
      const scaledMins = Math.max(1, baseMins) * otMultiplier;
      return Math.min(maxMinutes, scaledMins);
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
