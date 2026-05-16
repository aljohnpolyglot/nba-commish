import type { OwnerVision, SetupTierLabel } from '../../types';

export type SeasonOutcome = 'good' | 'neutral' | 'bad';

export interface SeasonStatsForOwner {
  domesticPlayoffAppearance: boolean;
  continentalFinalFour: boolean;
  winPct: number;
  netProfitEUR: number;
  youthProgressed: boolean;
}

export function evaluateSeasonForOwner(
  stats: SeasonStatsForOwner,
  vision: OwnerVision,
  _tier: SetupTierLabel,
): SeasonOutcome {
  if (vision === 'WinNow') {
    if (stats.continentalFinalFour || stats.domesticPlayoffAppearance) return 'good';
    return 'bad';
  }

  if (vision === 'Frugal') {
    if (stats.netProfitEUR < 0) return 'bad';
    if (stats.netProfitEUR > 0 && stats.domesticPlayoffAppearance) return 'good';
    return 'neutral';
  }

  if (stats.winPct >= 0.35) return stats.youthProgressed ? 'good' : 'neutral';
  return stats.youthProgressed ? 'neutral' : 'bad';
}
