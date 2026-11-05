import { INITIAL_LEAGUE_STATS } from '../constants';
import { getWnbaRookieScaleSalaryUSD } from '../services/wnba/economy';

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
export function computeRookieSalaryUSD(
  pickSlot: number,
  ls: any,
  draftRoundSize?: number,
  draftSeason?: number,
): number {
  const pbaMode = ls?.uiMode === 'pba_isolated';
  const wnbaMode = ls?.uiMode === 'wnba_isolated';
  const pbaEconomy = pbaMode ? getPBARosterEconomyConfig(ls, 'pba_isolated') : undefined;
  const roundSize = Math.max(1, Math.round(Number(draftRoundSize) || (pbaMode ? 12 : 30)));
  const round = pickSlot <= roundSize ? 1 : 2;
  const rookieScaleType: string = ls?.rookieScaleType ?? 'dynamic';

  const rawMin = pbaMode
    ? (ls?.minContractStaticAmount ?? ls?.minContract ?? 1.2)
    : (ls?.minContractStaticAmount ?? ls?.minContract ?? 1.273);
  const minSalaryUSD = ls?.minContractType === 'none'
    ? 0
    : pbaEconomy?.minSalaryUSD ?? (rawMin > 1000 ? rawMin : rawMin * 1_000_000);

  if (rookieScaleType === 'none') return minSalaryUSD;

  const scaleSeason = Number(draftSeason ?? ls?.year);
  if (wnbaMode && scaleSeason >= 2026) {
    const pickInRound = ((Math.max(1, pickSlot) - 1) % roundSize) + 1;
    return getWnbaRookieScaleSalaryUSD(scaleSeason, round, pickInRound, 0);
  }

  const staticAmtUSD = (ls?.rookieStaticAmount ?? 3) * 1_000_000 * (pbaEconomy?.economyScale ?? 1);
  if (rookieScaleType === 'static') return staticAmtUSD;

  // dynamic — cap-based, honouring scaleAppliesTo
  const scaleAppliesTo: string = ls?.rookieScaleAppliesTo ?? 'first_round';
  const useScale = round === 1 || scaleAppliesTo === 'both_rounds';
  if (!useScale) return minSalaryUSD;

  // salaryCap is stored as raw USD in INITIAL_LEAGUE_STATS
  // and persisted that way through inflation. Older saves / tests may use
  // millions (154.6) — normalise either form to USD before scaling.
  const rawCap: number = ls?.salaryCap ?? INITIAL_LEAGUE_STATS.salaryCap;
  const capUSD = pbaEconomy?.salaryCapUSD ?? (rawCap > 1_000_000 ? rawCap : rawCap * 1_000_000);
  const maxPct: number = ls?.rookieMaxContractPercentage ?? 9;
  const pick1USD = capUSD * maxPct / 100;
  const scaleIndex = pickSlot <= roundSize
    ? pickSlot - 1
    : roundSize - 1 + pickSlot - roundSize;
  const ratio = R1_SHAPE[scaleIndex] ?? Math.pow(1 - 0.0542, scaleIndex);

  return Math.max(minSalaryUSD, Math.round(pick1USD * ratio));
}

export function computeRookieContractSalaryUSD(
  pickSlot: number,
  contractYearIndex: number,
  ls: any,
  draftRoundSize?: number,
  draftSeason?: number,
): number {
  const roundSize = Math.max(1, Math.round(Number(draftRoundSize) || (ls?.uiMode === 'pba_isolated' ? 12 : 30)));
  const round = pickSlot <= roundSize ? 1 : Math.floor((Math.max(1, pickSlot) - 1) / roundSize) + 1;
  const scaleSeason = Number(draftSeason ?? ls?.year);
  if (ls?.uiMode === 'wnba_isolated' && ls?.rookieScaleType !== 'none' && scaleSeason >= 2026) {
    const pickInRound = ((Math.max(1, pickSlot) - 1) % roundSize) + 1;
    return getWnbaRookieScaleSalaryUSD(scaleSeason, round, pickInRound, contractYearIndex);
  }
  return Math.round(computeRookieSalaryUSD(pickSlot, ls, roundSize, draftSeason) * Math.pow(1.05, contractYearIndex));
}
import { getPBARosterEconomyConfig } from '../services/externalRosterService.shared';
