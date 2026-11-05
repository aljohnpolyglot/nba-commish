import sponsorData from '../../data/euro-sponsors-complete.json';
import type { SponsorPerk, SponsorPerkEffect } from '../../types/tycoon';

export interface SponsorPerkTemplate {
  id: string;
  label: string;
  duration: NonNullable<SponsorPerk['durationType']>;
  effect: SponsorPerkEffect;
  description: string;
}

export interface SponsorProduct {
  id: string;
  name: string;
  targetRating: 'training' | 'medical' | 'arena' | 'analytics';
  ratingBoost: number;
  purchasePriceEUR: number;
  permanent: true;
}

export interface SponsorBonusProfileEntry {
  type: string;
  target: string | number;
  rate: number;
}

export interface SponsorBonusProfile {
  id: string;
  formula: string;
  bonuses: SponsorBonusProfileEntry[];
}

interface SponsorDataLibrary {
  dealRules: {
    coreSlots: string[];
    coreSlotMultipliers: Record<string, number>;
    endorsementSlotCount: number;
    endorsementContractYears: number;
    endorsementUsesSlotMultiplier: boolean;
    sameSponsorCannotHoldMultipleActiveDeals: boolean;
  };
  offerPoolRules: {
    visibleOffersPerRefresh: number;
    maxAspirationalOffers: number;
    maxTierDistanceForAspirationalOffer: number;
    onlyManagedClubOffersAreVisible: boolean;
    otherClubSponsorAssignmentIsHidden: boolean;
  };
  performanceBonusRules: {
    amountFormula: string;
    useSignedNominalAnnualValue: boolean;
    retroactiveInflationAdjustment: boolean;
    profiles: SponsorBonusProfile[];
  };
  perkTemplates: SponsorPerkTemplate[];
  productCatalog: SponsorProduct[];
}

const LIBRARY = sponsorData as unknown as SponsorDataLibrary;

export const SPONSOR_DEAL_RULES = LIBRARY.dealRules;
export const SPONSOR_OFFER_POOL_RULES = LIBRARY.offerPoolRules;
export const SPONSOR_PERFORMANCE_BONUS_RULES = LIBRARY.performanceBonusRules;

export const SPONSOR_PERK_LIBRARY = Object.fromEntries(
  LIBRARY.perkTemplates.map(template => [template.id, template]),
) as Record<string, SponsorPerkTemplate>;

export const SPONSOR_PRODUCT_LIBRARY = Object.fromEntries(
  LIBRARY.productCatalog.map(product => [product.id, product]),
) as Record<string, SponsorProduct>;

export const SPONSOR_BONUS_PROFILE_LIBRARY = Object.fromEntries(
  LIBRARY.performanceBonusRules.profiles.map(profile => [profile.id, profile]),
) as Record<string, SponsorBonusProfile>;

export type SponsorPerkId = string;

function perkValue(effect: SponsorPerkEffect): number | undefined {
  if (Number.isFinite(effect.value)) return Number(effect.value);
  if (Number.isFinite(effect.uses)) return Number(effect.uses);
  if (Number.isFinite(effect.qualityFloorStars)) return Number(effect.qualityFloorStars);
  return undefined;
}

function productDescription(template: SponsorPerkTemplate, productId?: string): string {
  if (template.effect.operation !== 'grant_product' || !productId) return template.description;
  const product = SPONSOR_PRODUCT_LIBRARY[productId];
  if (!product) return template.description;
  const target = product.targetRating === 'training'
    ? 'Training Center'
    : product.targetRating === 'medical'
      ? 'Medical'
      : product.targetRating === 'arena'
        ? 'Arena'
        : 'Analytics';
  return `${product.name} permanently adds ${product.ratingBoost} to the ${target} rating.`;
}

export function getSponsorProduct(productId?: string): SponsorProduct | undefined {
  return productId ? SPONSOR_PRODUCT_LIBRARY[productId] : undefined;
}

export function getSponsorBonusProfile(profileId?: string): SponsorBonusProfile | undefined {
  return profileId ? SPONSOR_BONUS_PROFILE_LIBRARY[profileId] : undefined;
}

export function resolveSponsorPerk(
  perkId?: string,
  valueOverride?: number,
  productId?: string,
): SponsorPerk | undefined {
  if (!perkId) return undefined;
  const template = SPONSOR_PERK_LIBRARY[perkId];
  if (!template) return undefined;
  return {
    id: template.id,
    label: template.label,
    description: productDescription(template, productId),
    value: valueOverride ?? perkValue(template.effect),
    productId,
    effect: {
      ...template.effect,
      ...(valueOverride == null || template.effect.value == null ? {} : { value: valueOverride }),
    },
    durationType: template.duration,
    resetRule: template.effect.reset === 'season'
      ? 'season'
      : template.duration === 'while_active'
        ? 'contract'
        : 'never',
    stackable: false,
  };
}
