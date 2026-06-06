import type { FacilityState, StadiumFacilityState, TierBase, TycoonTier } from '../../types/tycoon';
import { TIER_BASE } from './specs/spain';

const DEFAULT_TIER: TycoonTier = 'D';

export function getSafeTycoonTier(tier: unknown): TycoonTier {
  return typeof tier === 'string' && tier in TIER_BASE ? tier as TycoonTier : DEFAULT_TIER;
}

export function getTycoonTierBase(tier: unknown): TierBase {
  return TIER_BASE[getSafeTycoonTier(tier)];
}

export function getTycoonFacilityLevel(facility: Partial<FacilityState> | null | undefined): number {
  const level = Number(facility?.level);
  return Number.isFinite(level) && level > 0 ? Math.max(1, Math.min(5, Math.round(level))) : 1;
}

export function getTycoonStadiumCapacity(
  tycoon: { tier?: unknown; facilities?: { stadium?: Partial<StadiumFacilityState> } } | null | undefined,
): number {
  const capacity = Number(tycoon?.facilities?.stadium?.capacity);
  return Number.isFinite(capacity) && capacity > 0
    ? Math.round(capacity)
    : getTycoonTierBase(tycoon?.tier).stadiumCapacity;
}
