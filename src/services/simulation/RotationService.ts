// Renamed to MinutesPlayedService.ts — re-exported here for backwards compatibility.
export { MinutesPlayedService as RotationService } from './MinutesPlayedService';
export type { RotationResult, MinuteAllocation } from './MinutesPlayedService';

// Dead code below kept for reference only. Remove after migration is confirmed.
import { NBAPlayer as Player, NBATeam as Team } from '../../../types';
import { convertTo2KRating } from '../../../utils/helpers';

// ─────────────────────────────────────────────────────────────────────────────
// RotationService.ts
//
// Determines WHO plays and HOW DEEP the rotation goes each game.
// Replaces StarterService throughout the simulation pipeline.
//
// Causal weight model (2025-26 NBA rotation analysis):
//   Competitive Incentive  (standings rank)   35%
//   Roster Health & Attrition                 30%
//   Schedule / Blowout Context                20%
//   Demographic Maturity   (avg team age)     15%
//
// MINUTE ALLOCATION lives in StatGenerator — this service only controls
// who is in the rotation and in what priority order.
// ─────────────────────────────────────────────────────────────────────────────

export interface RotationResult {
  /** Ordered player array: index 0–4 = starters, 5+ = bench depth order */
  players: Player[];
  /** How many players are in the rotation (7–13) */
  depth: number;
  /** Suggested star MPG target based on standings pressure (used by StatGenerator) */
  starMpgTarget: number;
}

export class RotationService {

  // ── 1. COMPETITIVE INCENTIVE (35%) ────────────────────────────────────────
  //
  // Seeds 1–3  (secured):    "Qualitative Depth" model
  //                           10–11 man rotation, star ~32–34 MPG
  // Seeds 4–10 (play-in):    "Tightening" model
  //                           7–8 man rotation, star ~36–38 MPG
  // Seeds 11–15 (lottery):   "Youth Evaluation" model
  //                           11–12 man rotation, developmental 20+ MPG
  //
  private static standingsProfile(conferenceRank: number): {
    baseDepth: number;
    starMpg: number;
  } {
    if (conferenceRank <= 3)  return { baseDepth: 10, starMpg: 33.0 };  // secured
    if (conferenceRank <= 5)  return { baseDepth: 8,  starMpg: 36.5 };  // comfortable contender
    if (conferenceRank <= 8)  return { baseDepth: 8,  starMpg: 37.5 };  // must-win zone
    if (conferenceRank <= 10) return { baseDepth: 9,  starMpg: 36.0 };  // play-in bubble
    return                           { baseDepth: 11, starMpg: 31.0 };  // lottery evaluation
  }

  // ── 2. ROSTER HEALTH ADJUSTMENT (30%) ─────────────────────────────────────
  //
  // Injury attrition forcibly redistributes minutes.
  // If we lose 2+ rotation players → expand survivors, floor at 7.
  //
  private static healthAdjustment(
    baseDepth: number,
    healthyCount: number
  ): number {
    // Can never rotate deeper than healthy bodies available
    const cappedToRoster = Math.min(baseDepth, healthyCount);
    // Depleted roster: force everyone left to play more
    if (healthyCount <= 7) return Math.max(healthyCount, 6);
    if (healthyCount <= 9) return Math.min(cappedToRoster, 9);
    return cappedToRoster;
  }

  // ── 3. BLOWOUT / GAME CONTEXT (part of competitive incentive) ─────────────
  //
  // Winning big → rest stars, run the depth.
  // Losing big  → coach concedes, plays youth / garbage time.
  // Close game  → stick with the plan.
  //
  private static blowoutAdjustment(
    depth: number,
    lead: number
  ): { depth: number; starMpgMod: number } {
    const abs = Math.abs(lead);
    if (abs > 25) return { depth: Math.min(depth + 3, 13), starMpgMod: -5.0 };  // blowout
    if (abs > 18) return { depth: Math.min(depth + 2, 12), starMpgMod: -3.5 };
    if (abs > 10) return { depth: Math.min(depth + 1, 11), starMpgMod: -2.0 };
    if (abs < 5)  return { depth: Math.max(depth - 1, 7),  starMpgMod: +1.0 };  // dogfight
    return               { depth,                          starMpgMod: 0   };
  }

  // ── 4. DEMOGRAPHIC MATURITY (15%) ─────────────────────────────────────────
  //
  // Young rosters (avg age < 24): higher recovery velocity → deeper rotation OK
  // Veteran squads (avg age > 29): load-manage stars → tighter but star MPG capped
  //
  private static ageAdjustment(
    players: Player[],
    depth: number,
    starMpg: number,
    season: number
  ): { depth: number; starMpg: number } {
    if (players.length === 0) return { depth, starMpg };

    const avgAge =
      players.reduce((sum, p) => sum + (season - (p.born?.year ?? season - 24)), 0) /
      players.length;

    // Young (OKC/SAS/DET model): sustain deep rotations, high-pressure defense
    if (avgAge < 24) return { depth: Math.min(depth + 1, 13), starMpg };
    // Veterans needing load management (LAC/GSW model)
    if (avgAge > 29) return { depth: Math.max(depth - 1, 7),  starMpg: Math.min(starMpg, 34) };
    // Sweet spot (25–27): no adjustment, peak output
    return { depth, starMpg };
  }

  // ── PLAYER SORTING ────────────────────────────────────────────────────────
  //
  // Rank by 2K overall rating so the best available players fill the rotation.
  // Uses the same convertTo2KRating formula as the rest of the UI.
  //
  private static sortByOVR(players: Player[], season: number): Player[] {
    return [...players].sort((a, b) => {
      const ovA = convertTo2KRating(
        a.overallRating,
        a.ratings?.[a.ratings.length - 1]?.hgt ?? 50
      );
      const ovB = convertTo2KRating(
        b.overallRating,
        b.ratings?.[b.ratings.length - 1]?.hgt ?? 50
      );
      return ovB - ovA;
    });
  }

  // ── PUBLIC ENTRY POINT ────────────────────────────────────────────────────

  /**
   * Get the ordered rotation for one game simulation.
   *
   * @param team            - Team object
   * @param players         - Full player pool (filtered to this team internally)
   * @param lead            - Running game lead for blowout detection
   * @param season          - Current season year (e.g. 2026)
   * @param overridePlayers - Pre-filtered roster override (All-Star, scrimmage, etc.)
   * @param conferenceRank  - 1–15 conference standing. Defaults to 8 (play-in bubble).
   */
  static getRotation(
    team: Team,
    players: Player[],
    lead: number,
    season: number,
    overridePlayers?: Player[],
    conferenceRank: number = 8
  ): RotationResult {
    const roster = overridePlayers ?? players.filter(p => p.tid === team.id);

    // Health filter (Roster Health 30%)
    const healthy = roster.filter(p => !p.injury || p.injury.gamesRemaining <= 0);

    // Failsafe: if everyone is mysteriously injured, return whoever is available
    const pool = healthy.length >= 5 ? healthy : roster.slice(0, Math.max(5, roster.length));

    // Sort best→worst by 2K OVR
    const sorted = this.sortByOVR(pool, season);

    // ── Build depth through the four causal factors ──────────────────────────

    // 1. Standings / competitive incentive
    const { baseDepth, starMpg: baseMpg } = this.standingsProfile(conferenceRank);

    // 2. Roster health
    const healthDepth = this.healthAdjustment(baseDepth, pool.length);

    // 3. Blowout context
    const { depth: blowoutDepth, starMpgMod } = this.blowoutAdjustment(healthDepth, lead);

    // 4. Demographic maturity
    const { depth: finalDepth, starMpg: finalMpg } = this.ageAdjustment(
      sorted,
      blowoutDepth,
      baseMpg + starMpgMod,
      season
    );

    // Hard rail: 7 minimum (you need a real rotation), 13 maximum
    const depth = Math.max(7, Math.min(13, finalDepth));

    return {
      players:      sorted.slice(0, depth),
      depth,
      starMpgTarget: Math.max(28, Math.min(39, finalMpg)),
    };
  }

  /**
   * Convenience overload: returns just the Player[] array.
   * Drop-in replacement for StarterService.getRotation().
   */
  static getRotationPlayers(
    team: Team,
    players: Player[],
    lead: number,
    season: number,
    overridePlayers?: Player[],
    conferenceRank: number = 8
  ): Player[] {
    return this.getRotation(team, players, lead, season, overridePlayers, conferenceRank).players;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE CODE CLI — INTEGRATION CHECKLIST
// Run this after dropping the file into your simulation services folder.
//
// 1. PLACE FILE:
//    Move RotationService.ts to the same directory as StarterService.ts
//    (e.g., src/services/simulation/RotationService.ts)
//    Verify the import paths match your project:
//      - '../../../types'         → your NBAPlayer / NBATeam types
//      - '../../../utils/helpers' → where convertTo2KRating lives
//
// 2. UPDATE StatGenerator (generateStatsForTeam function):
//    REMOVE:  import { StarterService } from '../StarterService';
//    ADD:     import { RotationService } from '../RotationService';
//
//    REMOVE:  const rotation = StarterService.getRotation(team, players, lead, season, overridePlayers);
//    ADD:     const rotation = RotationService.getRotationPlayers(team, players, lead, season, overridePlayers);
//
//    The BENCH_MINUTE_TIERS array and all minute-allocation logic stays in StatGenerator — don't touch it.
//
// 3. UPDATE GameSimulator (optional — for conferenceRank to flow through):
//    If you want playoff-pressure rotation tightening, you can pass conferenceRank
//    from the team object into generateStatsForTeam and down into RotationService.
//    If you skip this, it defaults to rank 8 (play-in bubble) which is a safe middle ground.
//
// 4. REMOVE StarterService import from any other files that still reference it
//    and replace with RotationService.getRotationPlayers() using the same signature.
//
// 5. CONFIRM the convertTo2KRating signature matches:
//    convertTo2KRating(bbgmRating: number, hgtAttribute: number): number
//    The hgtAttribute is the BBGM 0–100 attribute, NOT bio inches.
//    Source from user: 0.88 * bbgmRating + 31, with +6 bonus at hgt=100.
// ─────────────────────────────────────────────────────────────────────────────