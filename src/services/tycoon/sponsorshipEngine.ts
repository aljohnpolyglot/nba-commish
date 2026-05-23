import type { SponsorIndustry, Sponsorship, SponsorshipSlot, TycoonState, TycoonTier } from '../../types/tycoon';
import { ALL_SLOTS } from '../../types/tycoon';
import { TIER_BASE } from './specs/spain';
import { pickSponsorName as pickSponsorNameFromCatalog } from '../../data/sponsorCatalogFetcher';

export interface SuccessHistory {
  recentEndesaPositions: number[];
  recentEuroleagueStages: Array<'final-four' | 'qf' | 'group' | 'none'>;
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
  brandFit: number;
}

function recentSuccessBonus(h: SuccessHistory): number {
  let b = 0;
  for (const pos of h.recentEndesaPositions ?? []) {
    if (pos >= 1 && pos <= 4) b += 0.05;
  }
  for (const st of h.recentEuroleagueStages ?? []) {
    if (st === 'final-four') b += 0.10;
    else if (st === 'qf') b += 0.05;
  }
  return Math.min(0.45, b);
}

function pickSponsorName(tier: TycoonTier, slot: SponsorshipSlot, existing?: string | null): string {
  return pickSponsorNameFromCatalog('spain', tier, slot, existing);
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
  for (const pos of h.recentEndesaPositions ?? []) {
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
  const tb = TIER_BASE[state.tier];
  const baseFloor = tb.sponsorshipFloor[slot] ?? 0;
  const stadiumLevel = Math.max(1, state.facilities?.stadium?.level ?? 1);
  const stadiumBonus = 0.10 * (stadiumLevel - 1);
  const successBonus = 0.15 * objectiveSuccessScore(history);
  const cityBonus = 0.20 * (state.cityPrestige ?? 0.5);
  return Math.round(baseFloor * (1 + stadiumBonus + successBonus + cityBonus) / 1.20);
}

export function getMarketOffer(
  state: TycoonState,
  slot: SponsorshipSlot,
  history: SuccessHistory,
  starBoost: number = 0,
  overrideSponsor?: string,
): SponsorshipOffer {
  const existing = state.sponsorships?.[slot];
  const successBonus = recentSuccessBonus(history);
  const loyaltyBonus = existing ? 0.10 : 0;
  const penalty = state.nextRenewalPenaltyFactor ?? 1.0;
  const noise = 0.95 + Math.random() * 0.10;

  const floor = sponsorFloor(state, slot, history);
  const sponsor = overrideSponsor ?? existing?.sponsor ?? pickSponsorName(state.tier, slot, null);
  const sponsorProfile = classifySponsor(sponsor);
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
    penalty *
    noise
  );

  const signingBonus = Math.round(value * (0.5 + Math.random() * 1.0));

  return {
    slot,
    sponsor,
    ...sponsorProfile,
    conflictWarning: conflicts[0],
    valuePerYear: value,
    signingBonus,
    years: 3 + Math.floor(Math.random() * 2),
  };
}

export function applyRenewal(state: TycoonState, slot: SponsorshipSlot, offer: SponsorshipOffer, currentYear: number): void {
  state.sponsorships = state.sponsorships ?? {};
  const existingHistory = state.sponsorships[slot]?.relationshipHistory ?? [];
  state.sponsorships[slot] = {
    sponsor: offer.sponsor,
    industry: offer.industry,
    archetype: offer.archetype,
    personality: offer.personality,
    personalityProse: offer.personalityProse,
    valuePerYear: offer.valuePerYear,
    signingBonus: offer.signingBonus,
    yearsRemaining: offer.years,
    signedYear: currentYear,
    relationshipHistory: [
      ...existingHistory,
      { year: currentYear, value: offer.valuePerYear, eventType: (existingHistory.length > 0 ? 'renew' : 'sign') as 'renew' | 'sign' },
    ].slice(-8),
  };
  // Signing bonus pays out immediately on signing.
  state.cashOnHand = (state.cashOnHand ?? 0) + (offer.signingBonus ?? 0);
  delete state.nextRenewalPenaltyFactor;
}

export function evaluateOffer(
  sponsor: SponsorshipOffer,
  offer: SponsorshipOffer,
  stance: NegotiationStance,
): SponsorEvaluation {
  const target = Math.max(1, sponsor.valuePerYear);
  const baseRatio = offer.valuePerYear / target;
  const bonusLift = Math.min(0.18, (offer.signingBonus ?? 0) / Math.max(1, target * offer.years) * 0.35);
  const lengthFit = offer.years >= 3 ? 0.08 : offer.years === 2 ? 0.02 : -0.06;
  const stancePenalty = stance === 'aggressive' ? -0.08 : stance === 'conservative' ? 0.04 : 0;
  const archetypePenalty = sponsor.archetype === 'premium' && stance === 'aggressive' ? -0.05
    : sponsor.archetype === 'local' && stance === 'conservative' ? 0.04
    : sponsor.archetype === 'gambling' ? 0.03
    : 0;
  const score = Math.round(Math.max(0, Math.min(100, (baseRatio + bonusLift + lengthFit + stancePenalty + archetypePenalty) * 72)));
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
  const tierBoost = state.tier === 'S' ? 20 : state.tier === 'A' ? 14 : state.tier === 'B' ? 9 : state.tier === 'C' ? 5 : 2;
  return {
    reach,
    globalAppeal: Math.min(100, Math.round(prestige * 70 + tierBoost)),
    socialReach: Math.min(100, Math.round(Math.log10(Math.max(10, yearly)) * 12 + tierBoost)),
    brandImage: Math.min(100, Math.round(55 + prestige * 25 + tierBoost / 2)),
    brandFit: Math.min(100, Math.round(50 + prestige * 30 + (offer.years >= 3 ? 8 : 0))),
  };
}

export function applyDecline(state: TycoonState, slot: SponsorshipSlot): void {
  state.sponsorships = state.sponsorships ?? {};
  state.sponsorships[slot] = null;
}

export function getSponsorContractEndYear(sponsor?: Sponsorship | null): number | null {
  if (!sponsor) return null;
  const signedYear = Number(sponsor.signedYear);
  const yearsRemaining = Number(sponsor.yearsRemaining);
  if (!Number.isFinite(signedYear) || !Number.isFinite(yearsRemaining)) return null;
  return signedYear + yearsRemaining;
}

export function isSponsorDueForRenewal(sponsor: Sponsorship | null | undefined, currentYear: number): boolean {
  const endYear = getSponsorContractEndYear(sponsor);
  return endYear != null && endYear <= currentYear;
}

export function dekrementSponsorshipYears(state: TycoonState): void {
  state.sponsorships = state.sponsorships ?? {};
  ALL_SLOTS.forEach(slot => {
    const s = state.sponsorships[slot];
    if (!s) return;
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
): TycoonState['sponsorships'] {
  const tb = TIER_BASE[tier];
  const scale = 0.5 + (cityPrestige ?? 0.5) * 0.9;
  const make = (slot: SponsorshipSlot): Sponsorship => {
    const floor = tb.sponsorshipFloor[slot] ?? 0;
    const value = Math.round(floor * scale * (0.9 + Math.random() * 0.3));
    const sponsor = pickSponsorName(tier, slot, null);
    return {
      sponsor,
      ...classifySponsor(sponsor),
      valuePerYear: value,
      signingBonus: Math.round(value * (0.4 + Math.random() * 0.6)),
      yearsRemaining: 1 + Math.floor(Math.random() * 4),
      signedYear: currentYear - 1,
    };
  };
  const out = {} as Record<SponsorshipSlot, Sponsorship | null>;
  ALL_SLOTS.forEach(s => { out[s] = make(s); });
  return out;
}

export function hasExpiredSlot(state: TycoonState): boolean {
  return ALL_SLOTS.some(s => state.sponsorships?.[s] === null);
}
