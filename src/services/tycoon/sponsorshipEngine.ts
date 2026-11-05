import type { SponsorIndustry, SponsorPerformanceBonus, SponsorPerk, Sponsorship, SponsorshipSlot, TycoonState, TycoonTier } from '../../types/tycoon';
import { ALL_SLOTS } from '../../types/tycoon';
import {
  findSponsorOpportunity,
  getSponsorOpportunities,
  pickSponsorName as pickSponsorNameFromCatalog,
  type LeagueKey,
} from '../../data/sponsorCatalogFetcher';
import { getSafeTycoonTier, getTycoonFacilityLevel, getTycoonTierBase } from './tierBase';
import { postClubTransaction } from './clubFinance';
import { createSponsorBenefitPackage, sponsorCashValueAfterServices } from './sponsorBenefits';
import type { SponsorBenefitPackage } from '../../types/tycoon';
import { buildSponsorPerformanceBonuses, SPONSOR_SLOT_PAYMENT_MULTIPLIER } from './sponsorOfferConstants';
import { resolveSponsorPerk } from './sponsorPerkLibrary';

export interface SuccessHistory {
  recentDomesticPositions?: number[];
  recentEndesaPositions?: number[];
  recentEuroleagueStages: Array<'final-four' | 'qf' | 'group' | 'none'>;
}

function recentDomesticPositions(history: SuccessHistory): number[] {
  return history.recentDomesticPositions ?? history.recentEndesaPositions ?? [];
}

export interface SponsorshipOffer {
  slot: SponsorshipSlot;
  sponsor: string;
  industry?: SponsorIndustry;
  archetype?: Sponsorship['archetype'];
  personality?: string;
  personalityProse?: string;
  conflictWarning?: string;
  valuePerYear: number;
  signingBonus: number;
  years: number;
  performanceBonus?: number;
  performanceBonuses?: SponsorPerformanceBonus[];
  perk?: SponsorPerk;
  benefitPackage?: SponsorBenefitPackage;
  headquartersCity?: string;
  headquartersCountry?: string;
  headquartersIso2?: string;
}

export type NegotiationStance = 'conservative' | 'balanced' | 'aggressive';

export interface SponsorEvaluation {
  competitiveScore: number;
  moodLabel: string;
  willAccept: boolean;
}

export interface BrandImpact {
  reach: 'Worldwide' | 'Regional' | 'Local';
  globalAppeal: number;
  socialReach: number;
  brandImage: number;
}

export function getCommercialTrust(state: TycoonState): number {
  return Math.max(0, Math.min(100, state.commercialTrust ?? 100));
}

export function getSponsorNegotiationBounds(offer: SponsorshipOffer) {
  const round = (value: number) => Math.max(0, Math.round(value / 5_000) * 5_000);
  return {
    annualMin: Math.max(5_000, round(offer.valuePerYear * 0.55)),
    annualMax: Math.max(5_000, round(offer.valuePerYear * 1.65)),
    bonusMin: 0,
    bonusMax: Math.max(5_000, round(Math.max(offer.signingBonus * 1.75, offer.valuePerYear * 1.25))),
  };
}

function recentSuccessBonus(h: SuccessHistory): number {
  let b = 0;
  for (const pos of recentDomesticPositions(h)) {
    if (pos >= 1 && pos <= 4) b += 0.05;
  }
  for (const st of h.recentEuroleagueStages ?? []) {
    if (st === 'final-four') b += 0.10;
    else if (st === 'qf') b += 0.05;
  }
  return Math.min(0.45, b);
}

function pickSponsorName(tier: TycoonTier, slot: SponsorshipSlot, existing?: string | null, league: LeagueKey = 'spain'): string {
  return pickSponsorNameFromCatalog(league, tier, slot, existing);
}

export function classifySponsor(name: string): Pick<Sponsorship, 'industry' | 'archetype' | 'personality' | 'personalityProse'> {
  const lower = name.toLowerCase();
  const industry: SponsorIndustry =
    lower.includes('bet') || lower.includes('betway') || lower.includes('bet365') ? 'gambling'
    : lower.includes('air') || lower.includes('iberia') || lower.includes('qatar') || lower.includes('emirates') ? 'airline'
    : lower.includes('bank') || lower.includes('santander') || lower.includes('bbva') || lower.includes('caixa') ? 'bank'
    : lower.includes('tech') || lower.includes('digital') || lower.includes('vodafone') || lower.includes('movistar') ? 'tech'
    : lower.includes('beer') || lower.includes('estrella') || lower.includes('mahou') ? 'beer'
    : lower.includes('water') || lower.includes('aqua') ? 'water'
    : lower.includes('energy') || lower.includes('red bull') ? 'energy_drink'
    : lower.includes('auto') || lower.includes('seat') || lower.includes('cupra') ? 'auto'
    : 'generic';
  const archetype: Sponsorship['archetype'] =
    industry === 'gambling' ? 'gambling'
    : industry === 'tech' ? 'tech'
    : industry === 'airline' || industry === 'bank' || industry === 'auto' ? 'premium'
    : lower.includes('local') || lower.includes('ciudad') ? 'local'
    : 'generic';
  const personality = archetype === 'premium' ? 'Brand-protective'
    : archetype === 'gambling' ? 'Volatile high-yield'
    : archetype === 'tech' ? 'Growth-minded'
    : archetype === 'local' ? 'Community loyalist'
    : 'Commercially steady';
  const personalityProse = archetype === 'premium'
    ? 'Pays for clean visibility and reacts badly to scandals.'
    : archetype === 'gambling'
      ? 'Offers richer cash with higher board and fan scrutiny.'
      : archetype === 'tech'
        ? 'Values star power, data investment, and European reach.'
        : archetype === 'local'
          ? 'More patient in down years if the club protects local identity.'
          : 'Prioritizes reliable placement and basic performance clauses.';
  return { industry, archetype, personality, personalityProse };
}

export function getSponsorConflictWarnings(state: TycoonState): string[] {
  const sponsorships = state.sponsorships ?? {};
  const deals = ALL_SLOTS.map(slot => sponsorships[slot]).filter(Boolean) as Sponsorship[];
  const gamblingCount = deals.filter(d => d.industry === 'gambling' || d.archetype === 'gambling').length;
  const beerEnergyCount = deals.filter(d => d.industry === 'beer' || d.industry === 'energy_drink').length;
  const premiumCount = deals.filter(d => d.archetype === 'premium').length;
  const warnings: string[] = [];
  if (gamblingCount >= 2) warnings.push('Multiple gambling sponsors raise board scrutiny and youth-development conflicts.');
  if (beerEnergyCount >= 2) warnings.push('Alcohol and energy-drink overlap weakens family-brand positioning.');
  if (premiumCount >= 4) warnings.push('Premium partners expect cleaner press conferences and lower player-drama noise.');
  return warnings;
}

function objectiveSuccessScore(h: SuccessHistory): number {
  let score = 0;
  for (const pos of recentDomesticPositions(h)) {
    if (pos >= 1 && pos <= 4) score += 0.18;
    else if (pos >= 5 && pos <= 8) score += 0.08;
  }
  for (const st of h.recentEuroleagueStages ?? []) {
    if (st === 'final-four') score += 0.25;
    else if (st === 'qf') score += 0.14;
    else if (st === 'group') score += 0.06;
  }
  return Math.min(1, score);
}

export function sponsorFloor(state: TycoonState, slot: SponsorshipSlot, history: SuccessHistory): number {
  const tb = getTycoonTierBase(state.tier);
  const baseFloor = tb.sponsorshipFloor[slot] ?? 0;
  const stadiumLevel = getTycoonFacilityLevel(state.facilities?.stadium);
  const stadiumBonus = 0.10 * (stadiumLevel - 1);
  const successBonus = 0.15 * objectiveSuccessScore(history);
  const cityBonus = 0.20 * (state.cityPrestige ?? 0.5);
  const savedEconomyIndex = Number(state.currentEconomyIndex ?? 1);
  const economyIndex = Math.max(0.05, Number.isFinite(savedEconomyIndex) ? savedEconomyIndex : 1);
  return Math.round(baseFloor * economyIndex * (1 + stadiumBonus + successBonus + cityBonus) / 1.20);
}

export function getMarketOffer(
  state: TycoonState,
  slot: SponsorshipSlot,
  history: SuccessHistory,
  starBoost: number = 0,
  overrideSponsor?: string,
  league: LeagueKey = 'spain',
  economyIndex: number = Number(state.currentEconomyIndex ?? 1),
): SponsorshipOffer {
  const existing = state.sponsorships?.[slot];
  const successBonus = recentSuccessBonus(history);
  const loyaltyBonus = existing ? 0.10 : 0;
  const penalty = state.nextRenewalPenaltyFactor ?? 1.0;
  const trustFactor = 0.65 + getCommercialTrust(state) * 0.0035;
  const noise = 0.95 + Math.random() * 0.10;

  const tier = getSafeTycoonTier(state.tier);
  const sponsor = overrideSponsor ?? existing?.sponsor ?? pickSponsorName(tier, slot, null, league);
  const opportunity = findSponsorOpportunity(league, tier, slot, sponsor);
  const sponsorProfile = {
    ...classifySponsor(sponsor),
    ...(opportunity ? { industry: opportunity.industry, archetype: opportunity.archetype } : {}),
  };
  const floor = opportunity
    ? Math.round(opportunity.baseAnnualValueEUR * SPONSOR_SLOT_PAYMENT_MULTIPLIER[slot] * Math.max(0.05, Number.isFinite(economyIndex) ? economyIndex : 1))
    : sponsorFloor(state, slot, history);
  const archetypeMultiplier = sponsorProfile.archetype === 'gambling' ? 1.22
    : sponsorProfile.archetype === 'premium' ? 1.12
    : sponsorProfile.archetype === 'tech' ? 1.08
    : sponsorProfile.archetype === 'local' ? 0.92
    : 1;
  const conflicts = getSponsorConflictWarnings(state);
  const value = Math.round(
    floor *
    (1 + successBonus) *
    (1 + loyaltyBonus) *
    (1 + starBoost) *
    archetypeMultiplier *
    trustFactor *
    penalty *
    noise
  );

  const signingBonus = Math.round(value * (0.5 + Math.random() * 1.0));

  const benefitPackage = opportunity
    ? undefined
    : createSponsorBenefitPackage({ sponsor, industry: sponsorProfile.industry, slot, valuePerYear: value });
  const offer: SponsorshipOffer = {
    slot,
    sponsor,
    ...sponsorProfile,
    conflictWarning: conflicts[0],
    valuePerYear: opportunity ? value : sponsorCashValueAfterServices(value, benefitPackage),
    signingBonus,
    years: 3 + Math.floor(Math.random() * 2),
    headquartersCity: opportunity?.headquartersCity,
    headquartersCountry: opportunity?.headquartersCountry,
    headquartersIso2: opportunity?.headquartersIso2,
  };
  if (opportunity) {
    offer.years = opportunity.minContractYears
      + Math.floor(Math.random() * (opportunity.maxContractYears - opportunity.minContractYears + 1));
    offer.perk = resolveSponsorPerk(
      opportunity.perkId,
      opportunity.perkValueOverride ?? opportunity.perkValue,
      opportunity.perkProductId,
    );
    offer.performanceBonuses = buildSponsorPerformanceBonuses(
      offer.valuePerYear,
      offer.archetype,
      opportunity.bonusProfileId,
    );
  }
  offer.benefitPackage = benefitPackage;
  return offer;
}

export function applyRenewal(state: TycoonState, slot: SponsorshipSlot, offer: SponsorshipOffer, currentYear: number): void {
  state.sponsorships = state.sponsorships ?? {};
  const existing = state.sponsorships[slot];
  const sameSponsor = existing?.sponsor === offer.sponsor;
  const existingHistory = sameSponsor ? existing?.relationshipHistory ?? [] : [];
  state.sponsorships[slot] = {
    sponsor: offer.sponsor,
    industry: offer.industry,
    archetype: offer.archetype,
    personality: offer.personality,
    personalityProse: offer.personalityProse,
    valuePerYear: offer.valuePerYear,
    signingBonus: offer.signingBonus,
    performanceBonuses: offer.performanceBonuses,
    paymentSchedule: 'quarterly',
    renewalOptionYears: 1,
    terminationNoticeDays: 90,
    perk: offer.perk,
    yearsRemaining: offer.years,
    signedYear: currentYear,
    contractEndYear: currentYear + offer.years,
    headquartersCity: offer.headquartersCity ?? (sameSponsor ? existing?.headquartersCity : undefined),
    headquartersCountry: offer.headquartersCountry ?? (sameSponsor ? existing?.headquartersCountry : undefined),
    headquartersIso2: offer.headquartersIso2 ?? (sameSponsor ? existing?.headquartersIso2 : undefined),
    benefitPackage: offer.benefitPackage ?? createSponsorBenefitPackage(offer),
    benefitPackageVersion: 1,
    relationshipHistory: [
      ...existingHistory,
      { year: currentYear, value: offer.valuePerYear, eventType: (existingHistory.length > 0 ? 'renew' : 'sign') as 'renew' | 'sign' },
    ].slice(-8),
  };
  postClubTransaction(state, {
    sourceId: `sponsor-bonus:${slot}:${currentYear}:${offer.sponsor}`,
    date: `${currentYear}-07-01`,
    season: currentYear,
    category: 'sponsorship',
    label: `${offer.sponsor} signing bonus`,
    amountEUR: offer.signingBonus ?? 0,
  });
  delete state.nextRenewalPenaltyFactor;
}

export function evaluateOffer(
  sponsor: SponsorshipOffer,
  offer: SponsorshipOffer,
  stance: NegotiationStance,
  commercialTrust: number = 100,
): SponsorEvaluation {
  const target = Math.max(1, sponsor.valuePerYear);
  const annualRatio = offer.valuePerYear / target;
  const annualFit = annualRatio <= 1
    ? 0.96 + (1 - annualRatio) * 0.18
    : 0.96 / Math.pow(annualRatio, 1.8);
  const targetBonus = Math.max(1, sponsor.signingBonus || target * 0.5);
  const bonusRatio = (offer.signingBonus ?? 0) / targetBonus;
  const bonusAdjustment = bonusRatio <= 1
    ? Math.min(0.06, (1 - bonusRatio) * 0.06)
    : -Math.min(0.25, (bonusRatio - 1) * 0.18);
  const lengthFit = offer.years >= 3 ? 0.08 : offer.years === 2 ? 0.02 : -0.06;
  const stancePenalty = stance === 'aggressive' ? -0.08 : stance === 'conservative' ? 0.04 : 0;
  const archetypePenalty = sponsor.archetype === 'premium' && stance === 'aggressive' ? -0.05
    : sponsor.archetype === 'local' && stance === 'conservative' ? 0.04
    : sponsor.archetype === 'gambling' ? 0.03
    : 0;
  const trustAdjustment = (Math.max(0, Math.min(100, commercialTrust)) - 100) * 0.35;
  const score = Math.round(Math.max(0, Math.min(100, (annualFit + bonusAdjustment + lengthFit + stancePenalty + archetypePenalty) * 72 + trustAdjustment)));
  let moodLabel = 'Competitive';
  if (score >= 88) moodLabel = 'Premium offer';
  else if (score >= 72) moodLabel = 'Competitive';
  else if (score >= 58) moodLabel = 'Borderline';
  else if (score >= 42) moodLabel = 'Lowball';
  else moodLabel = 'Insulting';
  return { competitiveScore: score, moodLabel, willAccept: score >= 68 };
}

export function computeBrandImpact(offer: SponsorshipOffer, state: TycoonState): BrandImpact {
  const prestige = state.cityPrestige ?? 0.5;
  const yearly = offer.valuePerYear;
  const reach: BrandImpact['reach'] = yearly > 2_000_000 || prestige > 0.8 ? 'Worldwide' : yearly > 500_000 || prestige > 0.45 ? 'Regional' : 'Local';
  const tier = getSafeTycoonTier(state.tier);
  const tierBoost = tier === 'S' ? 20 : tier === 'A' ? 14 : tier === 'B' ? 9 : tier === 'C' ? 5 : 2;
  return {
    reach,
    globalAppeal: Math.min(100, Math.round(prestige * 70 + tierBoost)),
    socialReach: Math.min(100, Math.round(Math.log10(Math.max(10, yearly)) * 12 + tierBoost)),
    brandImage: Math.min(100, Math.round(55 + prestige * 25 + tierBoost / 2)),
  };
}

export function applyMidContractSponsorReplacement(
  state: TycoonState,
  slot: SponsorshipSlot,
  currentYear: number,
): void {
  const current = state.sponsorships?.[slot];
  if (!current || isSponsorDueForRenewal(current, currentYear)) return;
  state.commercialTrust = Math.max(0, getCommercialTrust(state) - 15);
  state.commercialTrustHistory = [
    ...(state.commercialTrustHistory ?? []),
    {
      year: currentYear,
      sponsor: current.sponsor,
      slot,
      event: 'breached' as const,
      note: `Ended the ${current.sponsor} agreement before expiry.`,
    },
  ].slice(-20);
}

export function getSponsorContractEndYear(sponsor: Sponsorship | null | undefined, currentYear?: number): number | null {
  if (!sponsor) return null;
  const savedEndYear = Number(sponsor.contractEndYear);
  if (Number.isFinite(savedEndYear)) return savedEndYear;
  const signedYear = Number(sponsor.signedYear);
  const yearsRemaining = Number(sponsor.yearsRemaining);
  if (!Number.isFinite(yearsRemaining)) return null;
  if (Number.isFinite(currentYear)) return Number(currentYear) + yearsRemaining;
  if (!Number.isFinite(signedYear)) return null;
  return signedYear + yearsRemaining;
}

export function isSponsorDueForRenewal(sponsor: Sponsorship | null | undefined, currentYear: number): boolean {
  const endYear = getSponsorContractEndYear(sponsor, currentYear);
  return endYear != null && endYear <= currentYear;
}

export function isSponsorExpiringNextRollover(sponsor: Sponsorship | null | undefined, currentYear: number): boolean {
  const endYear = getSponsorContractEndYear(sponsor, currentYear);
  return endYear != null && endYear <= currentYear + 1;
}

export function dekrementSponsorshipYears(state: TycoonState, currentYear?: number): void {
  state.sponsorships = state.sponsorships ?? {};
  ALL_SLOTS.forEach(slot => {
    const s = state.sponsorships[slot];
    if (!s) return;
    if (!Number.isFinite(Number(s.contractEndYear)) && Number.isFinite(currentYear)) {
      s.contractEndYear = Number(currentYear) + s.yearsRemaining;
    }
    s.yearsRemaining -= 1;
    if (s.yearsRemaining <= 0) {
      state.sponsorships[slot] = null;
    }
  });
  state.oneTimePayouts = [];
}

export function seedInitialSponsorships(
  tier: TycoonTier,
  currentYear: number,
  cityPrestige?: number,
  league: LeagueKey = 'spain',
  economyIndex: number = 1,
): TycoonState['sponsorships'] {
  const safeTier = getSafeTycoonTier(tier);
  const tb = getTycoonTierBase(safeTier);
  const scale = 0.5 + (cityPrestige ?? 0.5) * 0.9;
  const make = (slot: SponsorshipSlot): Sponsorship => {
    const opportunities = getSponsorOpportunities(league, safeTier, slot);
    const opportunity = opportunities[Math.floor(Math.random() * opportunities.length)];
    const floor = opportunity
      ? opportunity.baseAnnualValueEUR * SPONSOR_SLOT_PAYMENT_MULTIPLIER[slot]
      : tb.sponsorshipFloor[slot] ?? 0;
    const nominalValue = Math.round(floor * scale * (0.9 + Math.random() * 0.3));
    const value = Math.round(nominalValue * Math.max(0.05, Number.isFinite(economyIndex) ? economyIndex : 1));
    const sponsor = opportunity?.brand ?? pickSponsorName(safeTier, slot, null, league);
    const yearsRemaining = opportunity
      ? opportunity.minContractYears + Math.floor(Math.random() * (opportunity.maxContractYears - opportunity.minContractYears + 1))
      : 1 + Math.floor(Math.random() * 4);
    const profile = opportunity
      ? {
        perk: resolveSponsorPerk(
          opportunity.perkId,
          opportunity.perkValueOverride ?? opportunity.perkValue,
          opportunity.perkProductId,
        ),
        performanceBonuses: buildSponsorPerformanceBonuses(value, opportunity.archetype, opportunity.bonusProfileId),
      }
      : {};
    return {
      sponsor,
      ...classifySponsor(sponsor),
      ...(opportunity ? { industry: opportunity.industry, archetype: opportunity.archetype } : {}),
      valuePerYear: value,
      signingBonus: Math.round(value * (0.4 + Math.random() * 0.6)),
      yearsRemaining,
      signedYear: currentYear - 1,
      contractEndYear: currentYear + yearsRemaining,
      headquartersCity: opportunity?.headquartersCity,
      headquartersCountry: opportunity?.headquartersCountry,
      headquartersIso2: opportunity?.headquartersIso2,
      ...profile,
    };
  };
  const out = {} as Record<SponsorshipSlot, Sponsorship | null>;
  ALL_SLOTS.forEach(slot => {
    const deal = make(slot);
    if (!deal.perk) {
      deal.benefitPackage = createSponsorBenefitPackage({ ...deal, slot });
      deal.benefitPackageVersion = 1;
    }
    out[slot] = deal;
  });
  return out;
}

export function hasExpiredSlot(state: TycoonState): boolean {
  return ALL_SLOTS.some(s => state.sponsorships?.[s] === null);
}
