import type { TycoonState, TycoonTier } from '../../types/tycoon';

const ROLE_BASE_SALARIES: Record<TycoonTier, Record<string, number>> = {
  S: {
    'Head Coach': 1_850_000,
    'Assistant Coach': 620_000,
    'Head of Sports Science': 540_000,
    'Head Physio': 460_000,
    'Player Development Coach': 480_000,
    'Chief Scout': 720_000,
    'Head of Analytics': 510_000,
  },
  A: {
    'Head Coach': 1_050_000,
    'Assistant Coach': 380_000,
    'Head of Sports Science': 340_000,
    'Head Physio': 300_000,
    'Player Development Coach': 310_000,
    'Chief Scout': 420_000,
    'Head of Analytics': 320_000,
  },
  B: {
    'Head Coach': 720_000,
    'Assistant Coach': 260_000,
    'Head of Sports Science': 240_000,
    'Head Physio': 210_000,
    'Player Development Coach': 220_000,
    'Chief Scout': 300_000,
    'Head of Analytics': 230_000,
  },
  C: {
    'Head Coach': 480_000,
    'Assistant Coach': 180_000,
    'Head of Sports Science': 165_000,
    'Head Physio': 145_000,
    'Player Development Coach': 155_000,
    'Chief Scout': 210_000,
    'Head of Analytics': 165_000,
  },
  D: {
    'Head Coach': 310_000,
    'Assistant Coach': 120_000,
    'Head of Sports Science': 110_000,
    'Head Physio': 95_000,
    'Player Development Coach': 105_000,
    'Chief Scout': 140_000,
    'Head of Analytics': 110_000,
  },
};

export const ACADEMY_COST_BY_TIER = [0, 250_000, 750_000, 1_500_000, 3_000_000, 6_000_000] as const;

function baseRole(role: string): string {
  return role.replace(/ \d+$/, '');
}

function roundSalary(value: number): number {
  return Math.round(value / 5_000) * 5_000;
}

export function getStaffRoleBaseSalary(tier: TycoonTier | undefined, role: string): number {
  const resolvedTier = tier ?? 'C';
  return ROLE_BASE_SALARIES[resolvedTier]?.[baseRole(role)] ?? ROLE_BASE_SALARIES[resolvedTier]?.['Assistant Coach'] ?? 180_000;
}

export function getStaffMarketSalary(tier: TycoonTier | undefined, role: string, rating?: number): number {
  const base = getStaffRoleBaseSalary(tier, role);
  const ratingMult = rating == null ? 1 : Math.max(0.72, Math.min(1.45, 0.72 + (rating - 55) / 55));
  return roundSalary(base * ratingMult);
}

export function normalizeStaffSalary(tier: TycoonTier | undefined, role: string, salary: number | undefined, rating?: number): number {
  const market = getStaffMarketSalary(tier, role, rating);
  if (!Number.isFinite(salary ?? NaN) || (salary ?? 0) <= 0) return market;
  const current = Math.round(salary!);
  return current > market * 1.55 ? market : current;
}

export function sumStaffPayrollEUR(tycoon?: Pick<TycoonState, 'staffMembers' | 'tier'>): number {
  return Math.round((tycoon?.staffMembers ?? []).reduce((sum, member) => {
    return sum + normalizeStaffSalary(tycoon?.tier, member.role, member.salary, member.rating);
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
