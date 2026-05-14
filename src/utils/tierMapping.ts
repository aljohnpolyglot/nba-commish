import type { SetupTierLabel } from '../types';
import type { TycoonTier } from '../types/tycoon';

export function mapSetupTierToTycoonTier(label: SetupTierLabel): TycoonTier {
  switch (label) {
    case 'Powerhouse':  return 'S';
    case 'Established': return 'A';
    case 'MidTier':     return 'B';
    case 'Underdog':    return 'C';
  }
}

export function getTycoonTierUILabel(tier: TycoonTier): string {
  switch (tier) {
    case 'S': return 'Powerhouse';
    case 'A': return 'Established';
    case 'B': return 'Mid-Tier';
    case 'C': return 'Underdog';
    case 'D': return 'Lower-Tier';
  }
}

