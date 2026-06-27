import type { TycoonState, TycoonTier } from '../../types/tycoon';

export type StaffMarket = 'nba' | 'euro' | 'pba';

const NBA_ROLE_MARKET_PROFILES: Record<string, { base: number; floor: number; ceiling: number }> = {
  'Head Coach': { base: 7_500_000, floor: 2_500_000, ceiling: 22_000_000 },
  'Assistant Coach': { base: 1_450_000, floor: 500_000, ceiling: 4_200_000 },
  'Head of Sports Science': { base: 900_000, floor: 325_000, ceiling: 2_400_000 },
  'Head Physio': { base: 820_000, floor: 300_000, ceiling: 2_200_000 },
  'Player Development Coach': { base: 980_000, floor: 350_000, ceiling: 2_600_000 },
  'Chief Scout': { base: 1_150_000, floor: 400_000, ceiling: 3_000_000 },
  'Head of Analytics': { base: 930_000, floor: 325_000, ceiling: 2_500_000 },
};

const EURO_ROLE_MARKET_PROFILES: Record<string, { base: number; floor: number; ceiling: number }> = {
  'Head Coach': { base: 550_000, floor: 250_000, ceiling: 1_800_000 },
  'Assistant Coach': { base: 180_000, floor: 90_000, ceiling: 450_000 },
  'Head of Sports Science': { base: 220_000, floor: 110_000, ceiling: 550_000 },
  'Head Physio': { base: 200_000, floor: 95_000, ceiling: 500_000 },
  'Player Development Coach': { base: 230_000, floor: 115_000, ceiling: 600_000 },
  'Chief Scout': { base: 250_000, floor: 125_000, ceiling: 650_000 },
  'Head of Analytics': { base: 210_000, floor: 100_000, ceiling: 550_000 },
};

const PBA_ROLE_MARKET_PROFILES: Record<string, { base: number; floor: number; ceiling: number }> = {
  'Head Coach': { base: 12_000_000, floor: 4_000_000, ceiling: 60_000_000 },
  'Assistant Coach': { base: 3_200_000, floor: 1_400_000, ceiling: 9_000_000 },
  'Head of Sports Science': { base: 2_800_000, floor: 1_200_000, ceiling: 8_000_000 },
  'Head Physio': { base: 2_400_000, floor: 1_100_000, ceiling: 7_000_000 },
  'Player Development Coach': { base: 3_000_000, floor: 1_300_000, ceiling: 8_500_000 },
  'Chief Scout': { base: 4_500_000, floor: 1_800_000, ceiling: 12_000_000 },
  'Head of Analytics': { base: 2_700_000, floor: 1_200_000, ceiling: 8_000_000 },
};

export const EURO_STAFF_PAYROLL_SHARE = 0.22;

export type StaffMarketValueContext = {
  market?: StaffMarket;
  externalSalary?: number | null;
  yearsExperience?: number | null;
  yearsWithTeam?: number | null;
};

export const ACADEMY_COST_BY_TIER = [0, 250_000, 750_000, 1_500_000, 3_000_000, 6_000_000] as const;

function baseRole(role: string): string {
  return role.replace(/ \d+$/, '');
}

function roundSalary(value: number): number {
  return Math.round(value / 5_000) * 5_000;
}

function getRoleMarketProfiles(market: StaffMarket): Record<string, { base: number; floor: number; ceiling: number }> {
  if (market === 'euro') return EURO_ROLE_MARKET_PROFILES;
  if (market === 'pba') return PBA_ROLE_MARKET_PROFILES;
  return NBA_ROLE_MARKET_PROFILES;
}

export function fallbackStaffPayrollEUR(wages: number): number {
  return roundSalary(Math.max(0, wages) * EURO_STAFF_PAYROLL_SHARE);
}

export function getStaffRoleBaseSalary(tier: TycoonTier | undefined, role: string, market: StaffMarket = 'nba'): number {
  void tier;
  const profiles = getRoleMarketProfiles(market);
  const profile = profiles[baseRole(role)] ?? profiles['Assistant Coach'];
  return profile.base;
}

export function getStaffMarketValue(role: string, rating?: number, context: StaffMarketValueContext = {}): number {
  if (Number.isFinite(context.externalSalary ?? NaN) && (context.externalSalary ?? 0) > 0) {
    return roundSalary(context.externalSalary!);
  }
  const profiles = getRoleMarketProfiles(context.market ?? 'nba');
  const profile = profiles[baseRole(role)] ?? profiles['Assistant Coach'];
  const normalizedRating = Math.max(45, Math.min(99, Math.round(rating ?? 66)));
  const yearsExperience = Math.max(0, Math.min(35, Math.round(context.yearsExperience ?? 8)));
  const yearsWithTeam = Math.max(0, Math.min(20, Math.round(context.yearsWithTeam ?? 2)));
  const ratingMult = 0.78 + ((normalizedRating - 55) / 44) * 0.82;
  const experienceMult = 0.9 + (yearsExperience / 35) * 0.38;
  const tenureMult = 1 + Math.min(0.12, yearsWithTeam * 0.0125);
  const raw = profile.base * ratingMult * experienceMult * tenureMult;
  return roundSalary(Math.max(profile.floor, Math.min(profile.ceiling, raw)));
}

export function getStaffMarketSalary(
  tier: TycoonTier | undefined,
  role: string,
  rating?: number,
  context: StaffMarketValueContext = {},
): number {
  void tier;
  return getStaffMarketValue(role, rating, context);
}

export function normalizeStaffSalary(
  tier: TycoonTier | undefined,
  role: string,
  salary: number | undefined,
  rating?: number,
  context: StaffMarketValueContext = {},
): number {
  const market = getStaffMarketSalary(tier, role, rating, context);
  if (Number.isFinite(context.externalSalary ?? NaN) && (context.externalSalary ?? 0) > 0) return market;
  if (!Number.isFinite(salary ?? NaN) || (salary ?? 0) <= 0) return market;
  const current = Math.round(salary!);
  if (current < market * 0.45 || current > market * 2.35) return market;
  return current;
}

export function sumStaffPayrollEUR(
  tycoon?: Pick<TycoonState, 'staffMembers' | 'tier'>,
  market: StaffMarket = 'nba',
): number {
  return Math.round((tycoon?.staffMembers ?? []).reduce((sum, member) => {
    return sum + normalizeStaffSalary(tycoon?.tier, member.role, member.salary, member.rating, { market });
  }, 0));
}

export function defaultAcademyBudgetForTier(tier: TycoonTier | undefined): number {
  switch (tier) {
    case 'S': return 4;
    case 'A': return 3;
    case 'B': return 2;
    case 'C': return 1;
    case 'D': return 1;
    default: return 1;
  }
}

export function academyBudgetCostEUR(value: number | undefined, tier?: TycoonTier): number {
  const budget = value ?? defaultAcademyBudgetForTier(tier);
  return ACADEMY_COST_BY_TIER[Math.max(0, Math.min(5, Math.round(budget)))] ?? 0;
}
