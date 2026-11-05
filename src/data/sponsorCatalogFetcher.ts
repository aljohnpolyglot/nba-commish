import type { SponsorArchetype, SponsorshipSlot, TycoonTier, SponsorIndustry } from '../types/tycoon';
import { SPAIN_INITIAL_SPONSORS, SPAIN_BRAND_META } from '../services/tycoon/specs/spain';
import type { BrandMeta } from '../utils/sponsorLogos';
import { readJsonResponse } from '../services/utils/jsonResponse';
import sponsorOpportunityData from './euro-sponsors-complete.json';

export type LeagueKey = 'spain' | 'france' | 'italy' | 'greece' | 'germany' | 'turkey' | 'israel' | 'lithuania' | 'adriatic' | 'russia' | 'philippines';
export type SponsorDealEligibility = 'core' | 'endorsement';
export type SponsorTierWeights = Record<TycoonTier, number>;

export interface UnifiedSponsorOpportunity {
  id: string;
  brand: string;
  officialDomain: string;
  logoDomain?: string;
  headquarters: {
    city: string;
    country: string;
    iso2: string;
  };
  industry: SponsorIndustry;
  archetype: SponsorArchetype;
  marketScope: 'international' | 'national' | 'regional' | 'local';
  riskTags: string[];
  dealEligibility: 'core_only' | 'endorsement_only' | 'both';
  eligibleTiers: TycoonTier[];
  sourceEligibleTiers?: TycoonTier[];
  tierPoolWeights: SponsorTierWeights;
  aspirationalEligible?: boolean;
  eligibleCoreSlots: SponsorshipSlot[];
  baseAnnualValueEUR: number;
  minContractYears: number;
  maxContractYears: number;
  shortDescription?: string;
  perk: {
    templateId: string;
    productId?: string;
    valueOverride?: number;
  };
  performanceBonusProfileId?: string;
  sourceUrls: string[];
  sourceDealType?: string;
}

export interface SponsorOpportunity {
  id: string;
  brand: string;
  officialDomain: string;
  headquartersCity: string;
  headquartersCountry: string;
  headquartersIso2: string;
  dealType: 'sponsorship';
  oneTime: false;
  eligibleDealTypes?: SponsorDealEligibility[];
  eligibleSlots: SponsorshipSlot[];
  eligibleTiers: TycoonTier[];
  poolWeightByTier?: SponsorTierWeights;
  aspirationalEligible?: boolean;
  industry: SponsorIndustry;
  archetype: SponsorArchetype;
  baseAnnualValueEUR: number;
  minContractYears: number;
  maxContractYears: number;
  marketScope: 'international' | 'national' | 'regional' | 'local';
  riskTags: string[];
  shortDescription: string;
  perkId?: string;
  perkLabel?: string;
  perkDescription?: string;
  perkValue?: number;
  perkValueOverride?: number;
  perkProductId?: string;
  bonusProfileId?: string;
  sourceUrls: string[];
}

export interface EndorsementOpportunity {
  id: string;
  brand: string;
  officialDomain: string;
  headquartersCity: string;
  headquartersCountry: string;
  headquartersIso2: string;
  dealType: 'endorsement';
  oneTime: true;
  eligibleDealTypes?: SponsorDealEligibility[];
  contractYears: 1;
  expiresAfterSeason: true;
  eligibleTiers: TycoonTier[];
  poolWeightByTier?: SponsorTierWeights;
  aspirationalEligible?: boolean;
  industry: SponsorIndustry;
  archetype: SponsorArchetype;
  basePayoutEUR: number;
  offerLabel: string;
  activationType: string;
  marketScope: 'international' | 'national' | 'regional' | 'local';
  riskTags: string[];
  shortDescription: string;
  perkId?: string;
  perkLabel?: string;
  perkDescription?: string;
  perkValue?: number;
  perkValueOverride?: number;
  perkProductId?: string;
  bonusProfileId?: string;
  sourceUrls: string[];
}

export type SponsorMarketOpportunity = SponsorOpportunity | EndorsementOpportunity;

interface SponsorOpportunityMarket {
  leagueKey: Exclude<LeagueKey, 'philippines'>;
  country: string;
  iso2: string;
  sponsors?: UnifiedSponsorOpportunity[];
  sponsorships?: SponsorOpportunity[];
  endorsements?: EndorsementOpportunity[];
}

interface SponsorOpportunityDataset {
  version: number;
  currency: 'EUR';
  offerPoolRules?: {
    maxTierDistanceForAspirationalOffer?: number;
  };
  markets: SponsorOpportunityMarket[];
}

const OPPORTUNITY_DATA = sponsorOpportunityData as unknown as SponsorOpportunityDataset;
const TIER_ORDER: TycoonTier[] = ['S', 'A', 'B', 'C', 'D'];

const GENERIC_SPONSORS: Record<SponsorshipSlot, string[]> = {
  kit: ['Regional Commerce Partner', 'National Retail Partner', 'European Industry Partner'],
  sleeve: ['Regional Technology Partner', 'National Mobility Partner', 'European Media Partner'],
  back: ['Regional Logistics Partner', 'National Services Partner', 'European Finance Partner'],
  shorts: ['Regional Sports Partner', 'National Apparel Partner', 'European Consumer Partner'],
  training: ['Regional Health Partner', 'National Training Partner', 'European Performance Partner'],
  court: ['Regional Business Partner', 'National Banking Partner', 'European Digital Partner'],
  stadium: ['Regional Venue Partner', 'National Infrastructure Partner', 'European Energy Partner'],
  practice: ['Regional Academy Partner', 'National Education Partner', 'European Development Partner'],
};

const COUNTRY_SPONSORS: Partial<Record<LeagueKey, Partial<Record<SponsorshipSlot, string[]>>>> = {
  france: {
    kit: ['Orange', 'Renault', 'Carrefour', 'Accor'],
    sleeve: ['Decathlon', 'Crédit Agricole', 'FDJ', 'Vinci'],
    stadium: ['Accor Arena', 'Adidas Arena', 'Palais des Sports'],
  },
  italy: {
    kit: ['Armani', 'Eni', 'UniCredit', 'FIAT'],
    sleeve: ['TIM', 'Pirelli', 'Intesa Sanpaolo', 'Lavazza'],
    stadium: ['Mediolanum Forum', 'PalaLottomatica', 'Palasport'],
  },
  greece: {
    kit: ['OPAP', 'Aegean Airlines', 'Piraeus Bank', 'Cosmote'],
    sleeve: ['Stoiximan', 'Nova', 'Eurobank', 'Motor Oil'],
    stadium: ['OAKA Arena', 'Peace and Friendship Stadium', 'National Sports Hall'],
  },
  germany: {
    kit: ['Deutsche Telekom', 'Adidas', 'Allianz', 'Volkswagen'],
    sleeve: ['Puma', 'Lufthansa', 'SAP', 'Lidl'],
    stadium: ['BMW Park', 'Uber Arena', 'Ratiopharm Arena'],
  },
  turkey: {
    kit: ['Turkish Airlines', 'Beko', 'Ülker', 'Turkcell'],
    sleeve: ['Garanti BBVA', 'Anadolu Efes', 'Vestel', 'Türk Telekom'],
    stadium: ['Ülker Sports Arena', 'Sinan Erdem Dome', 'Basketball Development Center'],
  },
  israel: {
    kit: ['Bank Hapoalim', 'Partner', 'Strauss', 'Paz'],
    sleeve: ['Cellcom', 'EL AL', 'Wix', 'Shufersal'],
    stadium: ['Menora Mivtachim Arena', 'Pais Arena', 'Drive In Arena'],
  },
  lithuania: {
    kit: ['Maxima', 'Ignitis', 'Švyturys', 'Volfas Engelman'],
    sleeve: ['Telia Lietuva', 'Luminor', 'Betsafe', 'Akropolis'],
    stadium: ['Žalgirio Arena', 'Twinsbet Arena', 'Švyturio Arena'],
  },
  adriatic: {
    kit: ['NLB', 'Atlantic Grupa', 'Telekom Srbija', 'Podravka'],
    sleeve: ['Mozzart', 'Arena Sport', 'Petrol', 'm:tel'],
    stadium: ['Belgrade Arena', 'Arena Zagreb', 'Arena Stožice'],
  },
  russia: {
    kit: ['VTB', 'Gazprom', 'Lukoil', 'Rostelecom'],
    sleeve: ['Aeroflot', 'Yandex', 'MegaFon', 'Sber'],
    stadium: ['VTB Arena', 'Megasport Arena', 'Basket Hall'],
  },
};

export function resolveSponsorLeagueKey(...values: unknown[]): LeagueKey {
  const text = values.join(' ').toLowerCase();
  if (text.includes('philippines') || text.includes('philippine') || text.includes('pba')) return 'philippines';
  if (text.includes('france') || text.includes('french')) return 'france';
  if (text.includes('italy') || text.includes('italian')) return 'italy';
  if (text.includes('greece') || text.includes('greek')) return 'greece';
  if (text.includes('germany') || text.includes('german')) return 'germany';
  if (text.includes('turkey') || text.includes('turkish')) return 'turkey';
  if (text.includes('israel') || text.includes('israeli')) return 'israel';
  if (text.includes('lithuania') || text.includes('lithuanian')) return 'lithuania';
  if (text.includes('adriatic') || text.includes('serbia') || text.includes('croatia') || text.includes('slovenia')) return 'adriatic';
  if (text.includes('russia') || text.includes('vtb')) return 'russia';
  return 'spain';
}

interface LeagueData {
  tiers: Record<TycoonTier, Record<SponsorshipSlot, string[]>>;
  brands: Record<string, { industry: SponsorIndustry | 'generic'; domain: string | null; logoOverride: string | null }>;
}

interface SponsorCatalog {
  version: number;
  leagues: Partial<Record<LeagueKey, LeagueData | null>>;
}

const CATALOG_URL = String((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_SPONSOR_CATALOG_URL ?? '').trim();

let cache: SponsorCatalog | null = null;
let inflight: Promise<SponsorCatalog> | null = null;

export async function loadSponsorCatalog(): Promise<SponsorCatalog> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    if (!CATALOG_URL) {
      cache = OFFLINE_FALLBACK;
      return OFFLINE_FALLBACK;
    }
    try {
      const res = await fetch(CATALOG_URL);
      const json = await readJsonResponse<SponsorCatalog>(res, 'Sponsor catalog');
      cache = json;
      return json;
    } catch (err) {
      console.warn('[sponsorCatalog] fetch failed, using offline fallback', err);
      cache = OFFLINE_FALLBACK;
      return OFFLINE_FALLBACK;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getSponsorCatalogSync(): SponsorCatalog | null {
  return cache;
}

export function pickSponsorName(
  league: LeagueKey,
  tier: TycoonTier,
  slot: SponsorshipSlot,
  existing?: string | null,
): string {
  const pool = getSponsorPool(league, tier, slot);
  const filtered = existing ? pool.filter((n) => n !== existing) : pool;
  if (filtered.length === 0) return pool[0] ?? 'Regional Commerce Partner';
  return filtered[Math.floor(Math.random() * filtered.length)] ?? pool[0] ?? 'Regional Commerce Partner';
}

export function getBrandMeta(league: LeagueKey, sponsorName: string): BrandMeta | undefined {
  const markets = getMarketOpportunities(league);
  const opportunity = markets
    .flatMap(market => [...(market.sponsorships ?? []), ...(market.endorsements ?? [])])
    .find(item => item.brand === sponsorName);
  if (opportunity) {
    return {
      industry: opportunity.industry,
      domain: opportunity.officialDomain,
      logoOverride: null,
    };
  }
  const unified = markets
    .flatMap(market => market.sponsors ?? [])
    .find(item => item.brand === sponsorName);
  if (unified) {
    return {
      industry: unified.industry,
      domain: unified.logoDomain ?? unified.officialDomain,
      logoOverride: null,
    };
  }
  const fromCache = cache?.leagues[league]?.brands?.[sponsorName];
  if (fromCache) return fromCache;
  return OFFLINE_FALLBACK.leagues[league]?.brands?.[sponsorName];
}

export function getSponsorPool(
  league: LeagueKey,
  tier: TycoonTier,
  slot: SponsorshipSlot,
): string[] {
  const opportunityPool = getSponsorOpportunities(league, tier, slot).map(item => item.brand);
  if (opportunityPool.length > 0) return opportunityPool;
  const data = (cache ?? OFFLINE_FALLBACK).leagues[league];
  return data?.tiers?.[tier]?.[slot]
    ?? COUNTRY_SPONSORS[league]?.[slot]
    ?? (league === 'spain' ? SPAIN_INITIAL_SPONSORS[tier]?.[slot] : undefined)
    ?? GENERIC_SPONSORS[slot]
    ?? [];
}

export function isLegacySponsorFallbackName(
  league: LeagueKey,
  slot: SponsorshipSlot,
  sponsorName: string,
): boolean {
  if (GENERIC_SPONSORS[slot]?.includes(sponsorName)) return true;
  if (slot !== 'stadium' || !COUNTRY_SPONSORS[league]?.stadium?.includes(sponsorName)) return false;
  return !getMarketOpportunities(league)
    .flatMap(market => market.sponsors ?? [])
    .some(sponsor => sponsor.brand === sponsorName);
}

function getMarketOpportunities(league: LeagueKey): SponsorOpportunityMarket[] {
  return OPPORTUNITY_DATA.markets.filter(market => market.leagueKey === league);
}

function allowedAtTier(
  opportunity: SponsorOpportunity | EndorsementOpportunity,
  tier: TycoonTier,
): boolean {
  if (getSponsorTierWeight(opportunity, tier) <= 0) return false;
  if (opportunity.eligibleTiers.includes(tier) || opportunity.aspirationalEligible !== true) return true;
  const tierIndex = TIER_ORDER.indexOf(tier);
  const nearestEligibleDistance = Math.min(
    ...opportunity.eligibleTiers.map(eligible => Math.abs(TIER_ORDER.indexOf(eligible) - tierIndex)),
  );
  return nearestEligibleDistance <= Number(
    OPPORTUNITY_DATA.offerPoolRules?.maxTierDistanceForAspirationalOffer ?? 2,
  );
}

function defaultArchetype(industry: SponsorIndustry): SponsorArchetype {
  if (industry === 'gambling') return 'gambling';
  if (industry === 'tech' || industry === 'telecom') return 'tech';
  if (industry === 'airline' || industry === 'bank' || industry === 'auto' || industry === 'fashion') return 'premium';
  return 'generic';
}

function unifiedCoreOpportunity(
  market: SponsorOpportunityMarket,
  item: UnifiedSponsorOpportunity,
): SponsorOpportunity {
  return {
    id: item.id,
    brand: item.brand,
    officialDomain: item.logoDomain ?? item.officialDomain,
    headquartersCity: item.headquarters.city,
    headquartersCountry: item.headquarters.country ?? market.country,
    headquartersIso2: item.headquarters.iso2 ?? market.iso2,
    dealType: 'sponsorship',
    oneTime: false,
    eligibleDealTypes: ['core'],
    eligibleSlots: item.eligibleCoreSlots,
    eligibleTiers: item.eligibleTiers,
    poolWeightByTier: item.tierPoolWeights,
    aspirationalEligible: item.aspirationalEligible,
    industry: item.industry,
    archetype: item.archetype ?? defaultArchetype(item.industry),
    baseAnnualValueEUR: item.baseAnnualValueEUR,
    minContractYears: item.minContractYears,
    maxContractYears: item.maxContractYears,
    marketScope: item.marketScope,
    riskTags: item.riskTags,
    shortDescription: item.shortDescription ?? `${item.brand} partnership.`,
    perkId: item.perk.templateId,
    perkValueOverride: item.perk.valueOverride,
    perkProductId: item.perk.productId,
    bonusProfileId: item.performanceBonusProfileId,
    sourceUrls: item.sourceUrls,
  };
}

function unifiedEndorsementOpportunity(
  market: SponsorOpportunityMarket,
  item: UnifiedSponsorOpportunity,
): EndorsementOpportunity {
  return {
    id: `${item.id}-endorsement`,
    brand: item.brand,
    officialDomain: item.logoDomain ?? item.officialDomain,
    headquartersCity: item.headquarters.city,
    headquartersCountry: item.headquarters.country ?? market.country,
    headquartersIso2: item.headquarters.iso2 ?? market.iso2,
    dealType: 'endorsement',
    oneTime: true,
    eligibleDealTypes: ['endorsement'],
    contractYears: 1,
    expiresAfterSeason: true,
    eligibleTiers: item.eligibleTiers,
    poolWeightByTier: item.tierPoolWeights,
    aspirationalEligible: item.aspirationalEligible,
    industry: item.industry,
    archetype: item.archetype ?? defaultArchetype(item.industry),
    basePayoutEUR: item.baseAnnualValueEUR,
    offerLabel: 'One-Year Endorsement',
    activationType: 'partnership',
    marketScope: item.marketScope,
    riskTags: item.riskTags,
    shortDescription: item.shortDescription ?? `${item.brand} one-year partnership.`,
    perkId: item.perk.templateId,
    perkValueOverride: item.perk.valueOverride,
    perkProductId: item.perk.productId,
    bonusProfileId: item.performanceBonusProfileId,
    sourceUrls: item.sourceUrls,
  };
}

export function getSponsorOpportunities(
  league: LeagueKey,
  tier: TycoonTier,
  slot?: SponsorshipSlot,
): SponsorOpportunity[] {
  return getMarketOpportunities(league)
    .flatMap(market => [
      ...(market.sponsorships ?? []),
      ...(market.sponsors ?? [])
        .filter(item => item.dealEligibility === 'core_only' || item.dealEligibility === 'both')
        .map(item => unifiedCoreOpportunity(market, item)),
    ])
    .filter(item => (
      allowedAtTier(item, tier)
      && (!item.eligibleDealTypes || item.eligibleDealTypes.includes('core'))
      && (!slot || item.eligibleSlots.includes(slot))
    ));
}

export function getEndorsementOpportunities(
  league: LeagueKey,
  tier: TycoonTier,
): EndorsementOpportunity[] {
  return getMarketOpportunities(league)
    .flatMap(market => [
      ...(market.endorsements ?? []),
      ...(market.sponsors ?? [])
        .filter(item => item.dealEligibility === 'endorsement_only' || item.dealEligibility === 'both')
        .map(item => unifiedEndorsementOpportunity(market, item)),
    ])
    .filter(item => (
      allowedAtTier(item, tier)
      && (!item.eligibleDealTypes || item.eligibleDealTypes.includes('endorsement'))
    ));
}

export function getSponsorTierWeight(
  opportunity: SponsorMarketOpportunity,
  tier: TycoonTier,
): number {
  const explicitWeight = opportunity.poolWeightByTier?.[tier];
  if (Number.isFinite(explicitWeight)) return Math.max(0, Number(explicitWeight));
  return opportunity.eligibleTiers.includes(tier) ? 1 : 0;
}

export function findSponsorOpportunity(
  league: LeagueKey,
  tier: TycoonTier,
  slot: SponsorshipSlot,
  brand?: string,
): SponsorOpportunity | undefined {
  const opportunities = getSponsorOpportunities(league, tier, slot);
  return brand ? opportunities.find(item => item.brand === brand) : opportunities[0];
}

const OFFLINE_FALLBACK: SponsorCatalog = {
  version: 0,
  leagues: {
    spain: { tiers: SPAIN_INITIAL_SPONSORS, brands: SPAIN_BRAND_META },
  },
};
