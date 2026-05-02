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
 * Map tid → actual lottery pick slot (1-14) for the current draft year.
 * Empty if the lottery hasn't run yet.
 */
export function buildLotterySlotMap(
  draftLotteryResult: Array<{ pick?: number; pickNumber?: number; team: { tid: number } }> | undefined | null,
): Map<number, number> {
  const map = new Map<number, number>();
  if (!draftLotteryResult) return map;
  for (const r of draftLotteryResult) {
    const slot = r?.pick ?? r?.pickNumber;
    if (typeof r?.team?.tid === 'number' && typeof slot === 'number') {
      map.set(r.team.tid, slot);
    }
  }
  return map;
}

/**
 * Build a full tid → draftSlot (1-30) map for the current year once the
 * lottery has run. Extends lottery slots (#1-14) with standings-order slots
 * (#15-30) for non-lottery teams. Round 2 uses the same ordering (mirroring
 * how real-NBA round 2 follows round 1 order). Returns empty map if lottery
 * hasn't fired yet — all labels fall back to round-generic text.
 */
export function buildFullDraftSlotMap(
  draftLotteryResult: Array<{ pick?: number; pickNumber?: number; team: { tid: number } }> | undefined | null,
  teams: Array<{ id: number; wins?: number; losses?: number }>,
): Map<number, number> {
  const lotteryMap = buildLotterySlotMap(draftLotteryResult);
  if (lotteryMap.size === 0) return lotteryMap; // lottery hasn't run — nothing to resolve
  const lotteryTids = new Set(lotteryMap.keys());
  // Non-lottery teams sorted worst → best record → picks #15 onward
  const nonLottery = teams
    .filter(t => t.id >= 0 && t.id < 100 && !lotteryTids.has(t.id))
    .sort((a, b) => {
      const wpA = (a.wins ?? 0) / Math.max(1, (a.wins ?? 0) + (a.losses ?? 0));
      const wpB = (b.wins ?? 0) / Math.max(1, (b.wins ?? 0) + (b.losses ?? 0));
      return wpA - wpB; // worst first → lowest pick numbers
    });
  const fullMap = new Map(lotteryMap);
  nonLottery.forEach((t, i) => fullMap.set(t.id, lotteryMap.size + 1 + i));
  return fullMap;
}

/**
 * Render a pick label that resolves to "#N Pick" / "#N 2nd" once the full
 * draft order is known for the pick's season. Falls back to round-only for
 * future years or when the lottery hasn't fired yet.
 *
 *   short=true  → "#4 Pick" / "#4 2nd" / "1st Rd" / "2nd Rd"
 *   short=false → "2026 #4 Pick" / "2026 #4 2nd Rd" / "2026 1st Round" / "2026 2nd Round"
 */
export function formatPickLabel(
  pick: { season: number; round: number; originalTid: number },
  currentYear: number,
  lotterySlotByTid: Map<number, number> | undefined,
  short = false,
): string {
  const yearPart = short ? '' : `${pick.season} `;
  if (pick.season === currentYear) {
    const slot = lotterySlotByTid?.get(pick.originalTid);
    if (slot != null) {
      return pick.round === 1
        ? `${yearPart}#${slot} Pick`
        : `${yearPart}#${slot} 2nd Rd`;
    }
  }
  const roundPart = pick.round === 1
    ? (short ? '1st Rd' : '1st Round')
    : (short ? '2nd Rd' : '2nd Round');
  return `${yearPart}${roundPart}`;
}
