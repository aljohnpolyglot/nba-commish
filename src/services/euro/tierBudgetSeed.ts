import type { SetupTierLabel } from '../../types';

export interface TierBudgetSeed {
  tier: SetupTierLabel;
  budget: number;
}

const TEAM_PRESTIGE_HINT: Record<string, Record<string, SetupTierLabel>> = {
  endesa: {
    RMB: 'Powerhouse',
    RMA: 'Powerhouse',
    BAR: 'Powerhouse',
    BAS: 'Established',
    VAL: 'Established',
    UNI: 'Established',
  },
  euroleague: {
    OLY: 'Powerhouse',
    PAN: 'Powerhouse',
    EFE: 'Powerhouse',
    CSK: 'Established',
    FBA: 'Established',
  },
};

const TIER_BUDGET_BASELINE: Record<string, number> = {
  endesa: 8_000_000,
  euroleague: 18_000_000,
};

const TIER_MULTIPLIERS: Record<SetupTierLabel, number> = {
  Powerhouse: 1.5,
  Established: 1.0,
  MidTier: 1.0,
  Underdog: 0.7,
};

function rngFromSeed(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function seedTierAndBudget(input: {
  teamAbbrev: string;
  leagueId: string;
  subSeed: number;
}): TierBudgetSeed {
  const abbrev = input.teamAbbrev.toUpperCase();
  const tier = TEAM_PRESTIGE_HINT[input.leagueId]?.[abbrev] ?? 'MidTier';
  const baseline = TIER_BUDGET_BASELINE[input.leagueId] ?? 5_000_000;
  const jitter = 0.9 + rngFromSeed(input.subSeed)() * 0.2;
  return {
    tier,
    budget: Math.round(baseline * TIER_MULTIPLIERS[tier] * jitter),
  };
}
