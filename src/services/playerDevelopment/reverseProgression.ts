/**
 * reverseProgression.ts
 *
 * The mirror of ProgressionEngine. Forward says: "given ratings at age A, what
 * are they at A+1?" — applied per attr via calcBaseChange + ageModifier + noise.
 * Reverse asks: "given current ratings at age A, what were they at A−N?"
 *
 * Used to backfill historical ratings for fictional-league players so each
 * past season has its own rating snapshot. Box scores from those years can
 * then reference the rating that was actually in effect (rookie 3pt% comes
 * from rookie-year tp, not current tp).
 *
 * Approach: reuse the same calcBaseChange + ATTR_FORMULAS as the forward
 * engine, run them iteratively from currentAge → targetAge, subtracting the
 * expected Δ each step. Forward applies (Δ × uniform(0.4, 1.4)); reverse
 * uses the mean (0.9) so it's a smooth interpolation, not a noisy walk.
 *
 * Why "expected" not "exact": the original random noise per season is gone —
 * we only know the endpoint. Best-effort is the mean trajectory plus a small
 * deterministic per-(player, year, attr) jitter so histories aren't pancake-flat.
 */

import { calcBaseChange, ATTR_FORMULAS } from './ProgressionEngine';

// Mean of uniform(0.4, 1.4) is 0.9 — that's what forward applies on average.
const MEAN_CHANGE_MOD = 0.9;
// Small per-(player, year, attr) jitter so reverse trajectories aren't flat lines.
const JITTER_AMPLITUDE = 0.4;

const ALL_ATTRS = Object.keys(ATTR_FORMULAS);

function seededHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function seededRand(s: string): number {
  return (seededHash(s) % 100000) / 100000;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Roll back one year. Given ratings AT age `fromAge`, return ratings AT
 * `fromAge - 1`. Uses the expected forward Δ at the prior age.
 */
function reverseOneYear(
  ratings: Record<string, number>,
  fromAge: number,
  pot: number,
  seedBase: string,
): Record<string, number> {
  const priorAge = fromAge - 1;
  const baseChange = calcBaseChange(priorAge, seedBase + '_base', pot);
  const out: Record<string, number> = { ...ratings };

  for (const attr of ALL_ATTRS) {
    const formula = ATTR_FORMULAS[attr];
    if (!formula) continue;
    // ageModifier may take a seed (endu only). Forward seeds with date — we
    // approximate with a per-(player, year, attr) seed.
    const seedAttr = `${seedBase}_${attr}_${priorAge}`;
    const ageMod = (formula.ageModifier as any)(priorAge, seedAttr);
    const expectedDelta = (baseChange + ageMod) * MEAN_CHANGE_MOD;
    const [lo, hi] = formula.changeLimits(priorAge);
    const boundedDelta = clamp(expectedDelta, lo, hi);
    const jitter = (seededRand(seedAttr + '_j') - 0.5) * 2 * JITTER_AMPLITUDE;

    const cur = out[attr] ?? 50;
    out[attr] = clamp(cur - boundedDelta + jitter, 0, 99);
  }

  return out;
}

interface RatingsHistoryEntry {
  season: number;
  age: number;
  ratings: Record<string, number>;
}

/**
 * Given current ratings at currentAge / currentYear, walk backward to
 * generate one rating snapshot per past season the player was active.
 * Returns oldest → newest order (rookie year first, current year last).
 *
 * `careerYears` = how many pro seasons the player has played (excluding the
 * current incoming season). Result has `careerYears` past entries — the
 * caller is responsible for adding the current entry on top.
 */
export function reverseProgressYears(
  currentRatings: Record<string, number>,
  currentAge: number,
  currentYear: number,
  careerYears: number,
  pot: number,
  playerSeed: string,
): RatingsHistoryEntry[] {
  if (careerYears <= 0) return [];

  // Walk backward year by year, snapshotting after each step.
  const snapshots: RatingsHistoryEntry[] = [];
  let working = { ...currentRatings };
  let age = currentAge;
  let year = currentYear;

  for (let i = 0; i < careerYears; i++) {
    working = reverseOneYear(working, age, pot, `${playerSeed}_y${year}`);
    age -= 1;
    year -= 1;
    snapshots.push({ season: year, age, ratings: { ...working } });
  }

  // Reverse so oldest comes first (chronological).
  return snapshots.reverse();
}

/**
 * Convenience: given current full ratings entry (BBGM-shaped, with ovr/pot),
 * return an array of past ratings entries shaped the same way. OVR for each
 * past entry is recomputed from the non-hgt attribute average (same formula
 * as genDraftPlayers).
 */
export function buildRatingsHistory(
  currentRatingsEntry: any,
  currentAge: number,
  currentYear: number,
  careerYears: number,
  playerSeed: string,
): any[] {
  const pot = currentRatingsEntry.pot ?? 70;
  const stripped: Record<string, number> = {};
  for (const k of ALL_ATTRS) stripped[k] = currentRatingsEntry[k] ?? 50;
  // hgt is preserved across years (height doesn't change after age 19 in any
  // meaningful way, and our generator pegs it to bio height anyway).
  stripped.hgt = currentRatingsEntry.hgt ?? 50;

  const history = reverseProgressYears(
    stripped, currentAge, currentYear, careerYears, pot, playerSeed,
  );

  const NON_HGT = ALL_ATTRS.filter(a => a !== 'hgt');
  return history.map(snap => {
    const sum = NON_HGT.reduce((s, a) => s + (snap.ratings[a] ?? 0), 0);
    const ovr = Math.round(sum / NON_HGT.length);
    return {
      ...snap.ratings,
      hgt: currentRatingsEntry.hgt,
      season: snap.season,
      ovr,
      pot,  // potential is a fixed scout-projected ceiling, not progressive
    };
  });
}
