import type {
  OneTimePayout,
  SponsorPerk,
  SponsorSigningPerkGrant,
  Sponsorship,
  SponsorshipSlot,
  TycoonState,
} from '../../types/tycoon';
import { ALL_SLOTS } from '../../types/tycoon';
import { getSponsorProduct } from './sponsorPerkLibrary';

export interface ActiveSponsorPerk {
  sponsor: string;
  perk: SponsorPerk;
  dealType: 'core' | 'endorsement';
  slot?: SponsorshipSlot;
  annualValueEUR: number;
}

export interface SponsorSigningPerkChoice extends ActiveSponsorPerk {
  key: string;
  totalUses: number;
  usedUses: number;
  remainingUses: number;
  equivalentAnnualValueEUR: number;
}

export interface SponsorPurchaseQuote {
  costEUR: number;
  appliedPerks: Array<{ sponsor: string; perkId: string }>;
}

export interface SponsorCoverageQuote extends SponsorPurchaseQuote {
  coveredEUR: number;
}

export interface SponsorSigningPerkTeamResult<T> {
  rows: T[];
  grant?: SponsorSigningPerkGrant;
}

export function applySponsorOfferValueModifier(valueEUR: number, perk: SponsorPerk | undefined): number {
  if (
    perk?.effect?.operation !== 'multiply'
    || !effectTargets(perk, 'signedAnnualValueEUR')
  ) return Math.max(0, Math.round(valueEUR));
  return Math.max(0, Math.round(valueEUR * Number(perk.effect.value ?? 1)));
}

function isCoreDealActive(deal: Sponsorship, currentYear: number): boolean {
  const endYear = Number(deal.contractEndYear ?? deal.signedYear + deal.yearsRemaining);
  return deal.yearsRemaining > 0 && currentYear >= deal.signedYear && currentYear < endYear;
}

function isEndorsementActive(deal: OneTimePayout, currentYear: number): boolean {
  return deal.kind === 'endorsement'
    && deal.year <= currentYear
    && currentYear < Number(deal.expiresAfterYear ?? deal.year + 1);
}

function effectTargets(perk: SponsorPerk, target: string): boolean {
  const savedTarget = perk.effect?.target;
  return Array.isArray(savedTarget) ? savedTarget.includes(target) : savedTarget === target;
}

export function getActiveSponsorPerks(
  state: TycoonState | undefined,
  currentYear: number,
): ActiveSponsorPerk[] {
  if (!state) return [];
  const core = ALL_SLOTS.flatMap(slot => {
    const deal = state.sponsorships?.[slot];
    return deal?.perk && isCoreDealActive(deal, currentYear)
      ? [{
        sponsor: deal.sponsor,
        perk: deal.perk,
        dealType: 'core' as const,
        slot,
        annualValueEUR: deal.valuePerYear,
      }]
      : [];
  });
  const endorsements = (state.oneTimePayouts ?? []).flatMap(deal => (
    deal.perk && isEndorsementActive(deal, currentYear)
      ? [{ sponsor: deal.brand, perk: deal.perk, dealType: 'endorsement' as const, annualValueEUR: deal.amount }]
      : []
  ));
  return [...core, ...endorsements];
}

export function getSponsorReferenceYear(state: TycoonState | undefined): number {
  if (!state) return new Date().getFullYear();
  const years = [
    ...ALL_SLOTS.map(slot => state.sponsorships?.[slot]?.signedYear),
    ...(state.oneTimePayouts ?? []).map(deal => deal.year),
    ...(state.ledgerHistory ?? []).map(ledger => ledger.year),
    ...(state.transactions ?? []).map(transaction => transaction.season),
    ...(state.sponsorPerkUsage ?? []).map(usage => usage.season),
    state.regionalScoutingBudget?.season,
    state.budgetLockedYear,
  ].map(Number).filter(Number.isFinite);
  return years.length > 0 ? Math.max(...years) : new Date().getFullYear();
}

export function getSponsorPerksForTarget(
  state: TycoonState | undefined,
  currentYear: number,
  target: string,
): ActiveSponsorPerk[] {
  return getActiveSponsorPerks(state, currentYear).filter(entry => effectTargets(entry.perk, target));
}

export function getSponsorEffectMultiplier(
  state: TycoonState | undefined,
  currentYear: number,
  target: string,
): number {
  return getSponsorPerksForTarget(state, currentYear, target)
    .filter(entry => entry.perk.effect?.operation === 'multiply')
    .reduce((multiplier, entry) => multiplier * Math.max(0, Number(entry.perk.effect?.value ?? 1)), 1);
}

export function getSponsorQualityFloor(
  state: TycoonState | undefined,
  currentYear: number,
  target: string,
): number | undefined {
  const floors = getSponsorPerksForTarget(state, currentYear, target)
    .filter(entry => entry.perk.effect?.operation === 'set_floor' || Number.isFinite(entry.perk.effect?.qualityFloorStars))
    .map(entry => Number(entry.perk.effect?.qualityFloorStars ?? entry.perk.effect?.value))
    .filter(Number.isFinite);
  return floors.length > 0 ? Math.max(...floors) : undefined;
}

export function isSponsorBudgetControlLocked(
  state: TycoonState | undefined,
  currentYear: number,
  target: string,
): boolean {
  return getSponsorPerksForTarget(state, currentYear, target)
    .some(entry => entry.perk.effect?.lockBudgetControl === true);
}

export function getSponsorTravelCostMultiplier(
  state: TycoonState | undefined,
  currentYear: number,
  mode: 'hotel' | 'flight' | 'bus',
): number {
  if (!state) return 1;
  if (mode === 'bus') {
    return ['busTravelCost', 'railTravelCost', 'ferryTravelCost']
      .reduce((multiplier, target) => (
        multiplier * getSponsorEffectMultiplier(state, currentYear, target)
      ), 1);
  }
  const target = mode === 'flight' ? 'flightQualityStars' : 'hotelQualityStars';
  const property = mode === 'flight' ? 'flightCostMultiplier' : 'hotelCostMultiplier';
  return getSponsorPerksForTarget(state, currentYear, target)
    .reduce((multiplier, entry) => (
      multiplier * Math.max(0, Number(entry.perk.effect?.[property] ?? 1))
    ), 1);
}

export function getSponsorCreditFacilityAccess(
  state: TycoonState | undefined,
  currentYear: number,
): {
  sponsor: string;
  package: { bankLoanLimitEUR: number; bankAnnualRate: number };
} | null {
  const entry = getSponsorPerksForTarget(state, currentYear, 'creditFacility')
    .find(item => item.perk.effect?.operation === 'configure');
  if (!entry) return null;
  const limitRate = Math.max(0, Number(entry.perk.effect?.limitAnnualValueRate ?? 0));
  const discount = Math.max(0, Number(entry.perk.effect?.interestRateDiscountPoints ?? 0)) / 100;
  return {
    sponsor: entry.sponsor,
    package: {
      bankLoanLimitEUR: Math.round(entry.annualValueEUR * limitRate),
      bankAnnualRate: Math.max(0, 0.05 - discount),
    },
  };
}

export function getSponsorPaymentAdvanceEUR(
  state: TycoonState | undefined,
  currentYear: number,
): number {
  if (!state) return 0;
  return ALL_SLOTS.reduce((sum, slot) => {
    const deal = state.sponsorships?.[slot];
    if (!deal?.perk || !isCoreDealActive(deal, currentYear)) return sum;
    if (!effectTargets(deal.perk, 'sponsorPaymentSchedule') || deal.perk.effect?.operation !== 'advance_percent') {
      return sum;
    }
    return sum + Math.round(deal.valuePerYear * Math.max(0, Math.min(1, Number(deal.perk.effect.value ?? 0))));
  }, 0);
}

function usageCount(state: TycoonState, sponsor: string, perkId: string, season: number): number {
  return state.sponsorPerkUsage?.find(usage => (
    usage.sponsor === sponsor && usage.perkId === perkId && usage.season === season
  ))?.uses ?? 0;
}

function recordPerkUse(state: TycoonState, sponsor: string, perkId: string, season: number): void {
  state.sponsorPerkUsage = state.sponsorPerkUsage ?? [];
  const existing = state.sponsorPerkUsage.find(usage => (
    usage.sponsor === sponsor && usage.perkId === perkId && usage.season === season
  ));
  if (existing) existing.uses += 1;
  else state.sponsorPerkUsage.push({ sponsor, perkId, season, uses: 1 });
}

function allowanceAvailable(state: TycoonState, entry: ActiveSponsorPerk, season: number): boolean {
  const total = Number(entry.perk.effect?.uses ?? 0);
  return total > usageCount(state, entry.sponsor, entry.perk.id, season);
}

export function getSponsorPurchaseQuote(
  state: TycoonState,
  currentYear: number,
  targets: string[],
  baseCostEUR: number,
): SponsorPurchaseQuote {
  const applicable = getActiveSponsorPerks(state, currentYear).filter(entry => (
    targets.some(target => effectTargets(entry.perk, target))
    && (
      entry.perk.durationType === 'while_active'
      || allowanceAvailable(state, entry, currentYear)
    )
  ));
  const free = applicable.find(entry => entry.perk.effect?.operation === 'free_uses');
  if (free) {
    return {
      costEUR: 0,
      appliedPerks: [{ sponsor: free.sponsor, perkId: free.perk.id }],
    };
  }
  let multiplier = 1;
  const appliedPerks: SponsorPurchaseQuote['appliedPerks'] = [];
  for (const entry of applicable) {
    if (entry.perk.effect?.operation !== 'multiply') continue;
    multiplier *= Math.max(0, Number(entry.perk.effect.value ?? 1));
    if (entry.perk.durationType === 'seasonal_allowance') {
      appliedPerks.push({ sponsor: entry.sponsor, perkId: entry.perk.id });
    }
  }
  return {
    costEUR: Math.max(0, Math.round(baseCostEUR * multiplier / 5_000) * 5_000),
    appliedPerks,
  };
}

export function commitSponsorPurchaseQuote(
  state: TycoonState,
  currentYear: number,
  quote: SponsorPurchaseQuote,
): void {
  for (const perk of quote.appliedPerks) recordPerkUse(state, perk.sponsor, perk.perkId, currentYear);
}

export function getSponsorCoverageQuote(
  state: TycoonState,
  currentYear: number,
  target: string,
  baseCostEUR: number,
): SponsorCoverageQuote {
  const entry = getSponsorPerksForTarget(state, currentYear, target)
    .filter(item => item.perk.effect?.operation === 'cover_percent')
    .filter(item => item.perk.durationType === 'while_active' || allowanceAvailable(state, item, currentYear))
    .sort((left, right) => Number(right.perk.effect?.value ?? 0) - Number(left.perk.effect?.value ?? 0))[0];
  if (!entry) return { costEUR: baseCostEUR, coveredEUR: 0, appliedPerks: [] };
  const coverage = Math.max(0, Math.min(1, Number(entry.perk.effect?.value ?? 0)));
  const coveredEUR = Math.round(baseCostEUR * coverage);
  return {
    costEUR: Math.max(0, baseCostEUR - coveredEUR),
    coveredEUR,
    appliedPerks: entry.perk.durationType === 'while_active'
      ? []
      : [{ sponsor: entry.sponsor, perkId: entry.perk.id }],
  };
}

export function getAvailableSigningSponsorPerks(
  state: TycoonState | undefined,
  currentYear: number,
  appliesTo: 'player' | 'staff',
  annualSalaryEUR: number,
): SponsorSigningPerkChoice[] {
  if (!state) return [];
  return getSponsorPerksForTarget(state, currentYear, 'signingOffer')
    .filter(entry => (
      entry.perk.effect?.operation === 'add_in_kind_value'
      && (entry.perk.effect.appliesTo ?? []).includes(appliesTo)
    ))
    .map(entry => {
      const totalUses = Math.max(0, Math.round(Number(entry.perk.effect?.uses ?? 0)));
      const usedUses = usageCount(state, entry.sponsor, entry.perk.id, currentYear);
      return {
        ...entry,
        key: `${entry.sponsor}:${entry.perk.id}`,
        totalUses,
        usedUses,
        remainingUses: Math.max(0, totalUses - usedUses),
        equivalentAnnualValueEUR: Math.max(0, Math.round(
          annualSalaryEUR * Number(entry.perk.effect?.equivalentAnnualValueRatePerUse ?? 0),
        )),
      };
    })
    .filter(entry => entry.remainingUses > 0);
}

export function consumeSponsorSigningPerk(
  state: TycoonState,
  currentYear: number,
  sponsor: string,
  perkId: string,
  appliesTo: 'player' | 'staff',
  annualSalaryEUR: number,
): SponsorSigningPerkGrant | undefined {
  const choice = getAvailableSigningSponsorPerks(state, currentYear, appliesTo, annualSalaryEUR)
    .find(entry => entry.sponsor === sponsor && entry.perk.id === perkId);
  if (!choice) return undefined;
  recordPerkUse(state, sponsor, perkId, currentYear);
  return {
    sponsor,
    perkId,
    label: choice.perk.label,
    season: currentYear,
    equivalentAnnualValueEUR: choice.equivalentAnnualValueEUR,
  };
}

export function consumeSponsorSigningPerkForTeamRows<T extends {
  id?: number;
  tid?: number;
  tycoon?: TycoonState;
}>(
  rows: T[],
  tid: number,
  currentYear: number,
  requested: SponsorSigningPerkGrant | undefined,
  appliesTo: 'player' | 'staff',
  annualSalaryEUR: number,
): SponsorSigningPerkTeamResult<T> {
  if (!requested) return { rows };
  let grant: SponsorSigningPerkGrant | undefined;
  const nextRows = rows.map(team => {
    if (grant || Number(team.id ?? team.tid) !== tid || !team.tycoon) return team;
    const tycoon: TycoonState = {
      ...team.tycoon,
      sponsorPerkUsage: [...(team.tycoon.sponsorPerkUsage ?? [])].map(usage => ({ ...usage })),
    };
    grant = consumeSponsorSigningPerk(
      tycoon,
      currentYear,
      requested.sponsor,
      requested.perkId,
      appliesTo,
      annualSalaryEUR,
    );
    return grant ? { ...team, tycoon } : team;
  });
  return { rows: nextRows, grant };
}

export function applySponsorPerkOnDealSigned(
  state: TycoonState,
  sponsor: string,
  perk: SponsorPerk | undefined,
  currentYear: number,
): boolean {
  if (!perk || perk.effect?.operation !== 'grant_product' || !perk.productId) return false;
  const product = getSponsorProduct(perk.productId);
  if (!product || state.installedSponsorProducts?.some(item => item.productId === product.id)) return false;
  state.installedSponsorProducts = [
    ...(state.installedSponsorProducts ?? []),
    {
      productId: product.id,
      productName: product.name,
      sponsor,
      perkId: perk.id,
      targetRating: product.targetRating,
      ratingBoost: product.ratingBoost,
      installedYear: currentYear,
    },
  ];
  if (product.targetRating === 'training') {
    state.facilities.trainingCenter.permanentSponsorRatingBonus =
      (state.facilities.trainingCenter.permanentSponsorRatingBonus ?? 0) + product.ratingBoost;
  } else if (product.targetRating === 'medical') {
    const medical = state.facilities.medicalCenter ?? { level: 1 };
    medical.permanentSponsorRatingBonus = (medical.permanentSponsorRatingBonus ?? 0) + product.ratingBoost;
    state.facilities.medicalCenter = medical;
  } else if (product.targetRating === 'arena') {
    state.facilities.stadium.permanentSponsorRatingBonus =
      (state.facilities.stadium.permanentSponsorRatingBonus ?? 0) + product.ratingBoost;
  } else {
    state.analyticsPermanentSponsorRatingBonus =
      (state.analyticsPermanentSponsorRatingBonus ?? 0) + product.ratingBoost;
  }
  return true;
}
