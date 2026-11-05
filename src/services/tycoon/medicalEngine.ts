import type { MedicalFacilityAreaKey, TycoonState, TycoonTier } from '../../types/tycoon';
import { getClubFinanceSnapshot, postClubTransaction } from './clubFinance';
import { commitSponsorPurchaseQuote, getSponsorPurchaseQuote } from './sponsorPerkEngine';

export const MEDICAL_BUDGET_MIN_EUR = 100_000;
export const MEDICAL_BUDGET_MAX_EUR = 15_200_000;

const MEDICAL_QUALITY_SATURATION_EUR = 5_000_000;

export interface MedicalAreaSpec {
  id: MedicalFacilityAreaKey;
  label: string;
  description: string;
  baseCostEUR: number;
  focus: string;
  benefits: [string, string, string];
}

export interface MedicalDepartmentBreakdown {
  quality: number;
  budgetRating: number;
  facilityRating: number;
  departmentHeadRating: number;
  ownedLevels: number;
  maximumLevels: number;
}

export const MEDICAL_AREA_SPECS: MedicalAreaSpec[] = [
  {
    id: 'clinic',
    label: 'Sports Medicine Clinic',
    description: 'Primary clinic for diagnosis, treatment, and day-to-day medical prevention.',
    baseCostEUR: 75_000,
    focus: 'Handles routine injuries and early intervention.',
    benefits: ['Prevention', 'Diagnosis', 'Treatment Quality'],
  },
  {
    id: 'recovery',
    label: 'Recovery Suite',
    description: 'Rest, regeneration, and return-to-play support between games.',
    baseCostEUR: 95_000,
    focus: 'Supports faster recovery between training and matches.',
    benefits: ['Recovery', 'Availability', 'Regeneration'],
  },
  {
    id: 'physicalTherapy',
    label: 'Physical Therapy',
    description: 'Mobility, rehabilitation, and movement restoration.',
    baseCostEUR: 90_000,
    focus: 'Improves rehabilitation and safe return to action.',
    benefits: ['Rehabilitation', 'Mobility', 'Durability'],
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics Lab',
    description: 'Advanced testing and medical data for better-informed decisions.',
    baseCostEUR: 115_000,
    focus: 'Improves assessments and catches problems earlier.',
    benefits: ['Screening', 'Assessment', 'Monitoring'],
  },
  {
    id: 'hydrotherapy',
    label: 'Hydrotherapy Room',
    description: 'Aquatic recovery and low-impact movement work.',
    baseCostEUR: 105_000,
    focus: 'Supports recovery while reducing physical load.',
    benefits: ['Aquatic Recovery', 'Mobility', 'Conditioning'],
  },
  {
    id: 'loadManagement',
    label: 'Load Management Center',
    description: 'Workload monitoring and performance balancing.',
    baseCostEUR: 135_000,
    focus: 'Balances training load, fatigue, and player availability.',
    benefits: ['Workload', 'Readiness', 'Prevention'],
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampLevel(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return clamp(Number.isFinite(parsed) ? Math.round(parsed) : fallback, 1, 10);
}

function legacyMedicalLevel(state: TycoonState): number {
  return clampLevel(1 + (Math.max(1, Number(state.facilities?.medicalCenter?.level ?? 1)) - 1) * 2);
}

export function medicalQuality(budgetEUR: number | undefined | null): number {
  const budget = Math.max(0, budgetEUR ?? 0);
  return clamp(Math.sqrt(budget / MEDICAL_QUALITY_SATURATION_EUR), 0, 1);
}

export function defaultMedicalBudgetForTier(tier: TycoonTier): number {
  switch (tier) {
    case 'S': return 3_000_000;
    case 'A': return 1_500_000;
    case 'B': return 800_000;
    case 'C': return 400_000;
    case 'D': return 200_000;
  }
}

export function getMedicalAreaLevels(state: TycoonState): Record<MedicalFacilityAreaKey, number> {
  const fallback = legacyMedicalLevel(state);
  const saved = state.facilities?.medicalCenter?.medicalAreaLevels ?? {};
  return Object.fromEntries(
    MEDICAL_AREA_SPECS.map(spec => [spec.id, clampLevel(saved[spec.id], fallback)]),
  ) as Record<MedicalFacilityAreaKey, number>;
}

function getHeadPhysioRating(state: TycoonState): number {
  const rating = Number(state.staffMembers?.find(member => member.role === 'Head Physio')?.rating ?? 60);
  return clamp(Number.isFinite(rating) ? Math.round(rating) : 60, 1, 99);
}

export function getMedicalDepartmentBreakdown(
  state: TycoonState,
  economyIndex = 1,
  budgetOverride?: number,
): MedicalDepartmentBreakdown {
  const levels = Object.values(getMedicalAreaLevels(state));
  const ownedLevels = levels.reduce((sum, level) => sum + level, 0);
  const maximumLevels = MEDICAL_AREA_SPECS.length * 10;
  const facilityProgress = (ownedLevels - MEDICAL_AREA_SPECS.length) / Math.max(1, maximumLevels - MEDICAL_AREA_SPECS.length);
  const facilityRating = Math.round(25 + clamp(facilityProgress, 0, 1) * 75);
  const budget = budgetOverride ?? state.medicalBudget ?? 0;
  const budgetRating = Math.round(medicalQuality(budget / Math.max(0.05, economyIndex)) * 100);
  const departmentHeadRating = getHeadPhysioRating(state);
  const permanentBonus = state.facilities?.medicalCenter?.permanentSponsorRatingBonus ?? 0;
  const quality = Math.round(budgetRating * 0.42 + facilityRating * 0.36 + departmentHeadRating * 0.22) + permanentBonus;
  return {
    quality: clamp(quality, 1, 100),
    budgetRating,
    facilityRating,
    departmentHeadRating,
    ownedLevels,
    maximumLevels,
  };
}

export function getMedicalDepartmentQuality(state: TycoonState, economyIndex = 1): number {
  return getMedicalDepartmentBreakdown(state, economyIndex).quality / 100;
}

export function getMedicalUpgradeCost(area: MedicalAreaSpec, currentLevel: number, economyIndex: number): number {
  if (currentLevel >= 10) return 0;
  return Math.round((area.baseCostEUR * Math.pow(1.48, currentLevel - 1) * Math.max(0.05, economyIndex)) / 5_000) * 5_000;
}

export function purchaseMedicalAreaUpgrade(
  state: TycoonState,
  areaId: MedicalFacilityAreaKey,
  currentDate: string,
  currentYear: number,
  economyIndex: number,
): boolean {
  const area = MEDICAL_AREA_SPECS.find(spec => spec.id === areaId);
  if (!area) return false;
  const levels = getMedicalAreaLevels(state);
  const currentLevel = levels[areaId];
  const baseCost = getMedicalUpgradeCost(area, currentLevel, economyIndex);
  if (baseCost <= 0) return false;
  const quote = getSponsorPurchaseQuote(
    state,
    currentYear,
    ['medicalUpgrade', 'facilityUpgrade', 'facilityUpgradeCost'],
    baseCost,
  );
  const cost = quote.costEUR;
  if (getClubFinanceSnapshot(state, currentDate).availableEUR < cost) return false;
  const targetLevel = currentLevel + 1;
  if (cost > 0) {
    const transaction = postClubTransaction(state, {
      sourceId: `medical-area:${areaId}:level-${targetLevel}`,
      date: currentDate,
      season: currentYear,
      category: 'facility',
      label: `${area.label} Level ${targetLevel}`,
      amountEUR: -cost,
    });
    if (!transaction) return false;
  }
  const facilities = state.facilities ?? ({} as TycoonState['facilities']);
  const medicalCenter = facilities.medicalCenter ?? { level: 1 };
  const nextLevels = { ...levels, [areaId]: targetLevel };
  const average = Object.values(nextLevels).reduce((sum, level) => sum + level, 0) / MEDICAL_AREA_SPECS.length;
  medicalCenter.medicalAreaLevels = nextLevels;
  medicalCenter.level = clamp(1 + Math.floor((average - 1) / 2.25), 1, 5);
  facilities.medicalCenter = medicalCenter;
  state.facilities = facilities;
  commitSponsorPurchaseQuote(state, currentYear, quote);
  return true;
}

export function getImpactStats(quality: number): Array<{ label: string; value: number; prose: string }> {
  const normalized = clamp(quality, 0, 1);
  return [
    { label: 'Injury Frequency', value: -Math.round(normalized * 30), prose: 'Fewer minor injuries' },
    { label: 'Recovery Time', value: -Math.round(normalized * 15), prose: 'Faster return to action' },
    { label: 'Training Tolerance', value: Math.round(normalized * 16), prose: 'Higher training intensity' },
    { label: 'Player Availability', value: Math.round(normalized * 10), prose: 'More games available' },
    { label: 'Player Morale', value: Math.round(normalized * 7), prose: 'Improved well-being' },
  ];
}
