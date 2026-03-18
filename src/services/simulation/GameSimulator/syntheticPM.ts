/**
 * syntheticPM.ts
 *
 * Generates plausible per-player +/- from a finished box score.
 *
 * Why this is valid:
 *   Real PM is "score differential while this player was on the court."
 *   We don't have lineup segments — but we DO know:
 *     • The final score differential  (hard anchor)
 *     • Each player's minutes         (time on court)
 *     • Each player's performance     (good/bad games → positive/negative swings)
 *     • Whether it was a blowout      (stars sit Q4 → their PM diluted)
 *
 *   So we:
 *     1. Assign every player a "contribution weight" from their box line
 *     2. Give winners a positive pool (+margin) and losers a negative pool (−margin)
 *     3. Distribute those pools by weight with realistic variance
 *     4. Clamp to believable ranges (no +40 in a 6-point game)
 *
 *  The result won't match what a real play-by-play would produce, but it will
 *  be internally consistent, statistically realistic, and correctly anchored
 *  to the actual final score.
 */

import { PlayerGameStats } from '../types';
import { getVariance } from '../utils';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface PMResult {
  playerId: string;
  pm: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Performance score for a single player's box line.
 * Reflects how much they *personally* helped or hurt their team.
 * Returns a signed value — negative means the player was a net drag.
 */
function performanceScore(s: PlayerGameStats): number {
  return (
    s.pts  * 1.00
    + s.ast  * 1.50
    + s.orb  * 1.20
    + s.drb  * 0.70
    + s.stl  * 2.00
    + s.blk  * 1.50
    - s.tov  * 2.00
    - s.pf   * 0.80
    - (s.fga - s.fgm) * 0.60
    - (s.fta - s.ftm) * 0.40
  );
}

/**
 * Weight for receiving a share of the team PM pool.
 * Minutes are the base — performance tilts the distribution.
 * We keep weights strictly positive so the math stays clean;
 * the sign comes from the pool itself.
 */
function contributionWeight(s: PlayerGameStats, perf: number): number {
  // Minutes anchor (0–48 scale)
  const minWeight = Math.max(0.5, s.min);

  // Performance tilt: centre on 10 so average performer ≈ neutral multiplier
  // Range roughly [0.3 … 2.5] for realistic box lines
  const perfTilt = Math.max(0.15, 1.0 + (perf - 10) / 25);

  return minWeight * perfTilt;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateSyntheticPM
 *
 * Call this right after `generateCoordinatedStats` inside `GameSimulator`.
 *
 * @param homeStats      Coordinated stats for home team
 * @param awayStats      Coordinated stats for away team
 * @param homeScore      Final home score
 * @param awayScore      Final away score
 * @param isBlowout      True when |margin| > 20 (starters sit Q4)
 *
 * @returns              { homePM, awayPM } — parallel arrays matching input order
 */
export function generateSyntheticPM(
  homeStats: PlayerGameStats[],
  awayStats: PlayerGameStats[],
  homeScore: number,
  awayScore: number,
  isBlowout: boolean = false,
): {
  homePM: PMResult[];
  awayPM: PMResult[];
} {
  const margin = homeScore - awayScore; // positive = home won

  const homePM = distributeTeamPM(homeStats,  margin, isBlowout);
  const awayPM = distributeTeamPM(awayStats, -margin, isBlowout);

  return { homePM, awayPM };
}

// ─────────────────────────────────────────────────────────────────────────────

function distributeTeamPM(
  stats: PlayerGameStats[],
  teamNetPM: number,           // e.g. +12 for winner of a 12-point game
  isBlowout: boolean,
): PMResult[] {
  if (stats.length === 0) return [];

  const perfs   = stats.map(performanceScore);
  const weights = stats.map((s, i) => contributionWeight(s, perfs[i]));
  const totalW  = weights.reduce((a, b) => a + b, 0) || 1;

  // How spread out can individual PMs be relative to the margin?
  // In a blowout stars sit, so the spread is compressed.
  // In a close game, a single player can swing heavily.
  const spreadFactor = isBlowout ? 0.55 : 0.90;
  const maxIndividual = Math.max(6, Math.abs(teamNetPM) * spreadFactor + 4);

  const raw = stats.map((s, i) => {
    const share = weights[i] / totalW;

    // Base: player's share of the team PM pool
    const base = teamNetPM * share;

    // Individual variance — players on the same team don't all have identical PM.
    // A role player who had a quiet game might be −2 even on the winning team.
    // Cap variance amplitude at 40% of the margin so it doesn't swamp the signal.
    const varianceAmplitude = Math.min(
      Math.abs(teamNetPM) * 0.40 + 3,
      12
    );
    const noise = (Math.random() * 2 - 1) * varianceAmplitude * getVariance(1.0, 0.20);

    return base + noise;
  });

  // ── Normalise so team sum ≈ teamNetPM ─────────────────────────────────────
  // After variance the sum drifts. Rescale to stay anchored.
  const rawSum = raw.reduce((a, b) => a + b, 0) || 1;
  const scale  = Math.abs(rawSum) > 0.1 ? teamNetPM / rawSum : 1;
  const scaled = raw.map(v => v * scale);

  // ── Clamp to believable range ─────────────────────────────────────────────
  // No player should have a bigger PM than the margin + 8 (rare but real)
  // Starters get a slightly wider range than bench players.
  const clamped = scaled.map((v, i) => {
    const s = stats[i];
    const isStarter  = s.gs === 1;
    const clampHigh  =  maxIndividual * (isStarter ? 1.0 : 0.75);
    const clampLow   = -maxIndividual * (isStarter ? 1.0 : 0.75);
    return Math.round(Math.max(clampLow, Math.min(clampHigh, v)));
  });

  return stats.map((s, i) => ({
    playerId: s.playerId,
    pm: clamped[i],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE — merges PM back into PlayerGameStats[]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * applyPMToStats
 *
 * Merges PMResult[] back into a PlayerGameStats[] in-place (returns new array).
 * Attach to your GameResult before saving to DB.
 *
 * Usage inside GameSimulator.simulateGame():
 *
 *   const { homePM, awayPM } = generateSyntheticPM(
 *     homeStats, awayStats,
 *     finalHomeScore, finalAwayScore,
 *     Math.abs(finalHomeScore - finalAwayScore) > 20
 *   );
 *   const homeStatsFinal = applyPMToStats(homeStats, homePM);
 *   const awayStatsFinal = applyPMToStats(awayStats, awayPM);
 */
export function applyPMToStats(
  stats: PlayerGameStats[],
  pmResults: PMResult[],
): PlayerGameStats[] {
  const pmMap = new Map(pmResults.map(r => [r.playerId, r.pm]));
  return stats.map(s => ({
    ...s,
    pm: pmMap.get(s.playerId) ?? 0,
  }));
}