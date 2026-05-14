import type { TycoonTier } from '../../types/tycoon';

export const MEDICAL_BUDGET_MIN_EUR = 100_000;
export const MEDICAL_BUDGET_MAX_EUR = 15_200_000;

const MEDICAL_QUALITY_SATURATION_EUR = 5_000_000;

/**
 * Returns 0..1 quality score from annual budget.
 *  - €100K  → 0.14 (replacement-level)
 *  - €500K  → 0.32
 *  - €1M    → 0.45
 *  - €2M    → 0.63
 *  - €5M+   → 1.00 (saturated)
 *
 * Diminishing returns curve — every euro is worth less than the previous one.
 */
export function medicalQuality(budgetEUR: number | undefined | null): number {
  const b = Math.max(0, budgetEUR ?? 0);
  return Math.max(0, Math.min(1, Math.sqrt(b / MEDICAL_QUALITY_SATURATION_EUR)));
}

/** Default annual budget per tier — used to seed new saves + AI teams that don't set their own. */
export function defaultMedicalBudgetForTier(tier: TycoonTier): number {
  switch (tier) {
    case 'S': return 3_000_000;
    case 'A': return 1_500_000;
    case 'B': return   800_000;
    case 'C': return   400_000;
    case 'D': return   200_000;
  }
}

/** Returns one of 5 prose labels describing what this budget buys. No raw numbers. */
export function medicalQualityLabel(quality: number): string {
  if (quality >= 0.85) return 'Elite performance lab — league-best recovery times';
  if (quality >= 0.60) return 'Strong sport-science investment — measurably healthier roster';
  if (quality >= 0.40) return 'Solid medical team — average injury management';
  if (quality >= 0.20) return 'Below-average sports-medicine investment';
  return 'Skeleton medical staff — frequent injuries, slow recovery';
}

/** Short prose summary of the projected gameplay impact. No multipliers shown. */
export function medicalImpactSummary(quality: number): string {
  if (quality >= 0.85) return 'Major reduction in injuries · faster return-to-play on minor knocks';
  if (quality >= 0.60) return 'Noticeable injury reduction · quicker recovery on most setbacks';
  if (quality >= 0.40) return 'Slight injury reduction · marginally faster recovery';
  if (quality >= 0.20) return 'Minimal protection — your roster will lose games to soft-tissue knocks';
  return 'High injury risk — your training-staff cannot meaningfully prevent injuries';
}

export type MedicalFacilityKey =
  | 'physiotherapy'
  | 'recoveryRoom'
  | 'hydrotherapy'
  | 'cryotherapy'
  | 'strengthConditioning'
  | 'sleepNutrition'
  | 'biomechanics'
  | 'diagnostics';

export type MedicalFacilityTier = 'Skeleton' | 'Standard' | 'Advanced' | 'Elite';

const FACILITY_THRESHOLDS: Record<MedicalFacilityKey, [number, number, number]> = {
  physiotherapy: [350_000, 1_250_000, 3_000_000],
  recoveryRoom: [400_000, 1_400_000, 3_250_000],
  hydrotherapy: [650_000, 1_700_000, 3_600_000],
  cryotherapy: [900_000, 2_250_000, 4_250_000],
  strengthConditioning: [500_000, 1_500_000, 3_500_000],
  sleepNutrition: [1_000_000, 2_750_000, 5_250_000],
  biomechanics: [1_250_000, 3_250_000, 6_000_000],
  diagnostics: [750_000, 2_000_000, 4_500_000],
};

export function getFacilityTier(budgetEUR: number | undefined | null, key: MedicalFacilityKey): MedicalFacilityTier {
  const budget = budgetEUR ?? 0;
  const [standard, advanced, elite] = FACILITY_THRESHOLDS[key];
  if (budget >= elite) return 'Elite';
  if (budget >= advanced) return 'Advanced';
  if (budget >= standard) return 'Standard';
  return 'Skeleton';
}

export function getImpactStats(quality: number): Array<{ label: string; value: number; prose: string }> {
  const q = Math.max(0, Math.min(1, quality));
  return [
    { label: 'Injury Frequency', value: -Math.round(q * 30), prose: 'Fewer minor injuries' },
    { label: 'Recovery Time', value: -Math.round(q * 15), prose: 'Faster return to action' },
    { label: 'Training Tolerance', value: Math.round(q * 16), prose: 'Higher training intensity' },
    { label: 'Player Availability', value: Math.round(q * 10), prose: 'More games available' },
    { label: 'Player Morale', value: Math.round(q * 7), prose: 'Improved well-being' },
  ];
}
