/**
 * Shared rookie-contract salary logic.
 * Single source of truth used by DraftSimulatorView (watch-draft)
 * and autoRunDraft (lazy-sim) so both honour commissioner settings.
 */

// Shape ratios for the 30-pick rookie scale (pick 1 = 1.0, pick 30 ≈ 0.238).
// Multiplicative 5.42% step-down per slot.
export const R1_SHAPE: number[] = Array.from({ length: 30 }, (_, i) =>
  Math.pow(1 - 0.0542, i),
);

/**
 * Returns the rookie contract salary in USD for a given pick slot.
 * Respects all commissioner settings: scale type, cap %, static amount,
 * scaleAppliesTo (R1-only vs both rounds), and the min-salary floor.
 *
 * minContract normalisation: constants.ts stores it as raw USD (950000);
 * seasonRollover converts it to millions (0.95) after the first rollover.
 * Both forms are handled here.
 */
export function computeRookieSalaryUSD(pickSlot: number, ls: any): number {
  const round = pickSlot <= 30 ? 1 : 2;
  const rookieScaleType: string = ls?.rookieScaleType ?? 'dynamic';

  const rawMin = ls?.minContract ?? 1.273;
  const minSalaryUSD = rawMin > 1000 ? rawMin : rawMin * 1_000_000;

  if (rookieScaleType === 'none') return minSalaryUSD;

  const staticAmtUSD = (ls?.rookieStaticAmount ?? 3) * 1_000_000;
  if (rookieScaleType === 'static') return staticAmtUSD;

  // dynamic — cap-based, honouring scaleAppliesTo
  const scaleAppliesTo: string = ls?.rookieScaleAppliesTo ?? 'first_round';
  const useScale = round === 1 || scaleAppliesTo === 'both_rounds';
  if (!useScale) return minSalaryUSD;

  const capM: number = ls?.salaryCap ?? 154.6;
  const maxPct: number = ls?.rookieMaxContractPercentage ?? 9;
  const pick1USD = (capM * maxPct / 100) * 1_000_000;
  const ratio =
    pickSlot <= 30
      ? (R1_SHAPE[pickSlot - 1] ?? R1_SHAPE[29])
      : R1_SHAPE[29] * Math.pow(1 - 0.0542, pickSlot - 30);

  return Math.max(minSalaryUSD, Math.round(pick1USD * ratio));
}
