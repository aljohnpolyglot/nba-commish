/**
 * draftClassStrength.ts
 *
 * Dynamic draft-class strength + lottery-slot awareness for trade pick valuation.
 *
 * Two inputs drive pick TV beyond team power rank:
 *   1. CLASS STRENGTH — how loaded the upcoming prospect pool looks.
 *      Teams treat a 2026 pick in a "loaded" class like 2003 (LeBron, Wade,
 *      Bosh, Melo) very differently from a dud class like 2000. We score
 *      each tradable-window year and return a multiplier.
 *   2. ACTUAL LOTTERY SLOT — once the May lottery runs, the top-14 slots are
 *      KNOWN for the current-year draft. A bottom-3 team's pick stops being
 *      "top 3 projected" and becomes "the #8 pick, firm". Pricing must
 *      reflect that collapse of uncertainty, which matters most for June
 *      draft-day trades.
 *
 * Scope: we only score classes we can actually see (tid=-2 prospects for that
 * year). Far-future classes (3+ years out) are unscouted → multiplier = 1.0.
 * Rollover refreshes everything because `state.players` gains the newly aged
 * prospect cohort and the currentYear shifts.
 */

import type { NBAPlayer } from '../../types';
import { calcPot2K } from '../trade/tradeValueEngine';

/** Years into the future we score class strength for (0=current, 1=next, 2=+2). */
const SCOUT_HORIZON_YEARS = 2;

/** How many top prospects drive the class-strength score (lottery-sized sample). */
const SAMPLE_SIZE = 14;

/** Baseline K2 POT we treat as a "normal" class (roughly historical average). */
const BASELINE_AVG_POT = 80;

/** Multiplier is clamped — even a historic class can't 2x a pick, a weak one
 *  can't zero it out. Picks still have floor value (team control, contract). */
const MULTIPLIER_MIN = 0.75;
const MULTIPLIER_MAX = 1.30;

/**
 * How strong the draft class for `year` looks relative to league baseline.
 * Returns a multiplier applied to first-round pick TV (second round gets
 * dampened inside calcPickTV since late-2nd talent is thinner anyway).
 */
export function computeDraftClassStrength(
  players: NBAPlayer[],
  year: number,
  currentYear: number,
): number {
  // Unscouted years get neutral weight — pick value still flows from slot alone.
  if (year - currentYear > SCOUT_HORIZON_YEARS) return 1.0;
  if (year < currentYear) return 1.0; // past classes have no forward-looking value

  const pots = players
    .filter(p => p.tid === -2 && p.draft?.year === year)
    .map(p => calcPot2K(p, currentYear))
    .filter(v => v > 0)
    .sort((a, b) => b - a)
    .slice(0, SAMPLE_SIZE);

  if (pots.length === 0) return 1.0;

  const avgPot = pots.reduce((s, v) => s + v, 0) / pots.length;

  // Linear-ish mapping: each K2 POT point above/below baseline = 3% swing.
  // 90 avg → 1.30 (loaded), 85 → 1.15, 80 → 1.00, 75 → 0.85, 70 → 0.75 (clamped)
  const raw = 1.0 + (avgPot - BASELINE_AVG_POT) * 0.03;
  return Math.max(MULTIPLIER_MIN, Math.min(MULTIPLIER_MAX, raw));
}

/**
 * Precompute { year → multiplier } for every tradable pick season. Callers
 * build this once per render / per AI tick and pass it to `getPickTV`.
 */
export function buildClassStrengthMap(
  players: NBAPlayer[],
  currentYear: number,
  minSeason: number,
  maxSeason: number,
): Map<number, number> {
  const map = new Map<number, number>();
  for (let y = minSeason; y <= maxSeason; y++) {
    map.set(y, computeDraftClassStrength(players, y, currentYear));
  }
  return map;
}

/**
 * Map tid → actual lottery pick number (1-14) for the current draft year.
 * Empty if the lottery hasn't run yet — pre-lottery pricing falls back to
 * power-rank projection inside calcPickTV.
 */
export function buildLotterySlotMap(
  draftLotteryResult: Array<{ pickNumber: number; team: { tid: number } }> | undefined | null,
): Map<number, number> {
  const map = new Map<number, number>();
  if (!draftLotteryResult) return map;
  for (const r of draftLotteryResult) {
    if (typeof r?.team?.tid === 'number' && typeof r.pickNumber === 'number') {
      map.set(r.team.tid, r.pickNumber);
    }
  }
  return map;
}
