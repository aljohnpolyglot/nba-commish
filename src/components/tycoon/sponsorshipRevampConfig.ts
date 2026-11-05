import type {
  OneTimePayout,
  SponsorPerk,
  Sponsorship,
  SponsorshipSlot,
} from '../../types/tycoon';
import { createSponsorBenefitPackage } from '../../services/tycoon/sponsorBenefits';
import { SPONSOR_SLOT_PAYMENT_MULTIPLIER } from '../../services/tycoon/sponsorOfferConstants';
import { SPONSOR_DEAL_RULES } from '../../services/tycoon/sponsorPerkLibrary';

export const ENDORSEMENT_SLOT_CAP = SPONSOR_DEAL_RULES.endorsementSlotCount;

export const SPONSOR_SLOT_CONFIG: Record<SponsorshipSlot, {
  label: string;
  description: string;
  multiplier: number;
}> = {
  kit: { label: 'Kit Sponsor', description: 'Main jersey placement', multiplier: SPONSOR_SLOT_PAYMENT_MULTIPLIER.kit },
  sleeve: { label: 'Sleeve Sponsor', description: 'Sleeve placement', multiplier: SPONSOR_SLOT_PAYMENT_MULTIPLIER.sleeve },
  back: { label: 'Back of Shirt', description: 'Jersey back placement', multiplier: SPONSOR_SLOT_PAYMENT_MULTIPLIER.back },
  shorts: { label: 'Shorts Sponsor', description: 'Shorts placement', multiplier: SPONSOR_SLOT_PAYMENT_MULTIPLIER.shorts },
  training: { label: 'Training Kit', description: 'Training apparel', multiplier: SPONSOR_SLOT_PAYMENT_MULTIPLIER.training },
  court: { label: 'Court Logo', description: 'Court branding', multiplier: SPONSOR_SLOT_PAYMENT_MULTIPLIER.court },
  stadium: { label: 'Arena Naming', description: 'Arena naming rights', multiplier: SPONSOR_SLOT_PAYMENT_MULTIPLIER.stadium },
  practice: { label: 'Practice Facility', description: 'Training facility naming', multiplier: SPONSOR_SLOT_PAYMENT_MULTIPLIER.practice },
};

export function getCoreSponsorPerk(deal: Sponsorship, slot: SponsorshipSlot): SponsorPerk {
  if (deal.perk) return deal.perk;
  const benefitPackage = deal.benefitPackage ?? createSponsorBenefitPackage({
    sponsor: deal.sponsor,
    industry: deal.industry,
    slot,
    valuePerYear: deal.valuePerYear,
  });
  return {
    id: `${slot}-${deal.sponsor}-perk`,
    label: benefitPackage?.label ?? 'Partner support',
    description: benefitPackage?.label ?? 'Partner support for the club.',
  };
}

export function getEndorsementPerk(deal: OneTimePayout): SponsorPerk {
  return deal.perk ?? {
    id: `${deal.id ?? deal.brand}-perk`,
    label: deal.benefitPackage?.label ?? deal.offerLabel ?? 'Partner support',
    description: deal.benefitPackage?.label ?? deal.offerLabel ?? 'Partner support for the club.',
  };
}
