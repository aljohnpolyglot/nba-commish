import React from 'react';
import {
  Shirt,
  Building2,
  Tv,
  Landmark,
  Car,
  Cpu,
  Beer,
  Plane,
  MoreHorizontal,
  Dice5,
  Store,
} from 'lucide-react';
import type { SponsorOfferModalData } from './SponsorOfferModal';
import type { StartNegotiationModalData } from './StartNegotiationModal';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { getSponsorPool, getBrandMeta } from '../../data/sponsorCatalogFetcher';
import { classifySponsor } from '../../services/tycoon/sponsorshipEngine';
import { ALL_SLOTS, type SponsorshipSlot, type SponsorIndustry, type TycoonTier } from '../../types/tycoon';

export type InterestLevel = 'very-interested' | 'interested' | 'neutral' | 'not-interested';
export type MarketFit = 'excellent' | 'very-good' | 'good' | 'fair' | 'poor';
export type DealCategory = 'kit-apparel' | 'arena-venue' | 'broadcast' | 'financial' | 'automotive' | 'technology' | 'beverage' | 'travel' | 'gambling' | 'local-business' | 'other';
export type OfferStatus = 'interested' | 'negotiation' | 'neutral' | 'not-interested';
export type DealType = 'sponsorship' | 'endorsement';
export type SortKey = 'potential-high' | 'potential-low' | 'value-high' | 'value-low' | 'fit-best';
export const ENDORSEMENT_SLOT_CAP = 4;

export interface MockOffer {
  id: string;
  brand: string;
  slot: SponsorshipSlot;
  category: DealCategory;
  industry: SponsorIndustry | 'generic';
  archetype: 'premium' | 'gambling' | 'tech' | 'local' | 'generic';
  interestLevel: InterestLevel;
  interestSub: string;
  status: OfferStatus;
  dealType: DealType;
  offerLabel: string;
  slotLabel: string;
  valuePerYear: number;
  contractYears: number;
  oneTime?: boolean;
  marketFit: MarketFit;
  brandGets?: string[];
  clubGets?: string[];
  pitch?: string;
}

export const CATEGORY_LABEL: Record<DealCategory, string> = {
  'kit-apparel': 'Kit & Apparel',
  'arena-venue': 'Arena & Venue',
  broadcast: 'Broadcast',
  financial: 'Financial',
  automotive: 'Automotive',
  technology: 'Technology',
  beverage: 'Beverage',
  travel: 'Travel',
  gambling: 'Gambling',
  'local-business': 'Local Business',
  other: 'Other',
};

export const CATEGORY_ICON: Record<DealCategory, React.ComponentType<{ size?: number; className?: string }>> = {
  'kit-apparel': Shirt,
  'arena-venue': Building2,
  broadcast: Tv,
  financial: Landmark,
  automotive: Car,
  technology: Cpu,
  beverage: Beer,
  travel: Plane,
  gambling: Dice5,
  'local-business': Store,
  other: MoreHorizontal,
};

export const CATEGORY_TINT: Record<DealCategory, string> = {
  'kit-apparel': 'text-emerald-300',
  'arena-venue': 'text-amber-300',
  broadcast: 'text-sky-300',
  financial: 'text-violet-300',
  automotive: 'text-orange-300',
  technology: 'text-cyan-300',
  beverage: 'text-rose-300',
  travel: 'text-indigo-300',
  gambling: 'text-fuchsia-300',
  'local-business': 'text-pink-300',
  other: 'text-slate-300',
};

export const INTEREST_TINT: Record<InterestLevel, { dot: string; text: string }> = {
  'very-interested': { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  interested: { dot: 'bg-emerald-500/80', text: 'text-emerald-400' },
  neutral: { dot: 'bg-slate-500', text: 'text-slate-400' },
  'not-interested': { dot: 'bg-rose-500', text: 'text-rose-400' },
};

export const INTEREST_LABEL: Record<InterestLevel, string> = {
  'very-interested': 'Very Interested',
  interested: 'Interested',
  neutral: 'Neutral',
  'not-interested': 'Not Interested',
};

export const FIT_TINT: Record<MarketFit, { bar: string; text: string; pct: number }> = {
  excellent: { bar: 'bg-emerald-400', text: 'text-emerald-300', pct: 95 },
  'very-good': { bar: 'bg-emerald-400', text: 'text-emerald-300', pct: 80 },
  good: { bar: 'bg-emerald-500', text: 'text-emerald-400', pct: 65 },
  fair: { bar: 'bg-amber-400', text: 'text-amber-300', pct: 45 },
  poor: { bar: 'bg-rose-500', text: 'text-rose-400', pct: 25 },
};

export const FIT_LABEL: Record<MarketFit, string> = {
  excellent: 'Excellent',
  'very-good': 'Very Good',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

const SLOT_OFFER_LABEL: Record<SponsorshipSlot, string> = {
  kit: 'Kit Sponsor',
  sleeve: 'Sleeve Sponsor',
  back: 'Back of Shirt',
  shorts: 'Shorts Sponsor',
  training: 'Training Kit',
  court: 'Court Logo',
  stadium: 'Arena Naming',
  practice: 'Practice Facility',
};

export const SORT_LABEL: Record<SortKey, string> = {
  'potential-high': 'Potential Value (High)',
  'potential-low': 'Potential Value (Low)',
  'value-high': 'Annual Value (High)',
  'value-low': 'Annual Value (Low)',
  'fit-best': 'Market Fit (Best)',
};

function industryToCategory(ind: SponsorIndustry | 'generic'): DealCategory {
  switch (ind) {
    case 'fashion':
      return 'kit-apparel';
    case 'bank':
      return 'financial';
    case 'auto':
      return 'automotive';
    case 'tech':
      return 'technology';
    case 'telecom':
      return 'broadcast';
    case 'beer':
    case 'water':
    case 'energy_drink':
      return 'beverage';
    case 'airline':
      return 'travel';
    case 'gambling':
      return 'gambling';
    case 'sportswashing':
      return 'other';
    default:
      return 'other';
  }
}

function seedRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface EndorsementSpec {
  brand: string;
  dealTypeLabel: string;
  subLabel: string;
  category: DealCategory;
  industry: SponsorIndustry | 'generic';
  slot: SponsorshipSlot;
  baseValuePerYear: number;
  years: number;
  oneTime?: boolean;
  tiers: TycoonTier[];
  brandGets: string[];
  clubGets: string[];
  pitch: string;
}

const ENDORSEMENT_CATALOGUE: EndorsementSpec[] = [
  {
    brand: 'Nike', dealTypeLabel: 'Lifestyle Campaign', subLabel: 'Global Sportswear Brand',
    category: 'kit-apparel', industry: 'fashion', slot: 'kit', baseValuePerYear: 1_200_000, years: 4, tiers: ['S', 'A'],
    pitch: 'Global lifestyle campaign starring your top players — photoshoots, billboards, and city activations.',
    brandGets: ['Star player photoshoots', 'Global social media campaigns', 'City billboard placements', 'Sponsored youth basketball clinics'],
    clubGets: ['Boosts player popularity', 'Higher jersey & merchandise sales', 'Global brand prestige', 'Attracts free-agent interest'],
  },
  {
    brand: 'Adidas', dealTypeLabel: 'Lifestyle Campaign', subLabel: 'Global Sports Brand',
    category: 'kit-apparel', industry: 'fashion', slot: 'kit', baseValuePerYear: 750_000, years: 4, tiers: ['S', 'A'],
    pitch: 'Lifestyle co-branding featuring marquee players in social and outdoor campaigns.',
    brandGets: ['Player social media content', 'Outdoor & digital ad placements', 'Youth basketball clinic series', 'Co-branded apparel drops'],
    clubGets: ['Player visibility boost', 'Merchandise revenue boost', 'European brand prestige'],
  },
  {
    brand: 'Turkish Airlines', dealTypeLabel: 'Travel Partnership', subLabel: 'Official Airline Partner',
    category: 'travel', industry: 'airline', slot: 'stadium', baseValuePerYear: 900_000, years: 4, tiers: ['S', 'A'],
    pitch: 'Official travel partner for road trips and EuroLeague away-game exposure.',
    brandGets: ['EuroLeague broadcast visibility', 'Arena LED rotation ads', 'Co-branded social media campaigns', 'Away-game travel content series'],
    clubGets: ['Reduced travel costs', 'Lower away-game fatigue', 'Improved EuroLeague exposure'],
  },
  {
    brand: 'Gatorade', dealTypeLabel: 'Performance Campaign', subLabel: 'Sports Drink Partner',
    category: 'beverage', industry: 'energy_drink', slot: 'practice', baseValuePerYear: 400_000, years: 3, tiers: ['S', 'A', 'B'],
    pitch: 'Performance and hydration partnership — locker-room placement and training campaigns.',
    brandGets: ['Bench cooler placement', 'Locker-room hydration branding', 'Player performance commercials', 'Training facility branding'],
    clubGets: ['Recovery speed bonus', 'Sports-science prestige', 'Player conditioning support'],
  },
  {
    brand: 'Beko', dealTypeLabel: 'Equipment Endorsement', subLabel: 'Home Appliances',
    category: 'technology', industry: 'tech', slot: 'practice', baseValuePerYear: 500_000, years: 3, tiers: ['S', 'A', 'B'],
    pitch: 'Appliance partner outfitting the training kitchen and locker-room facilities.',
    brandGets: ['Training-facility kitchen branding', 'Player social media features', 'Team nutrition content series', 'Co-branded family events'],
    clubGets: ['Practice-facility upgrade', 'Brand-aligned premium positioning', 'European visibility'],
  },
  {
    brand: 'Spalding', dealTypeLabel: 'Equipment Endorsement', subLabel: 'Official Game Ball Partner',
    category: 'other', industry: 'fashion', slot: 'practice', baseValuePerYear: 180_000, years: 2, tiers: ['A', 'B', 'C'],
    pitch: 'Official warmup-ball and equipment partner with player content collabs.',
    brandGets: ['Official warmup balls supplied', 'Player social media posts', 'Shooting challenge events', 'Practice-facility logo placement'],
    clubGets: ['Training equipment quality bonus', 'Small player morale boost', 'Merchandise revenue boost'],
  },
  {
    brand: 'Local City Bank', dealTypeLabel: 'Financial Partnership Campaign', subLabel: 'Community Partner',
    category: 'financial', industry: 'bank', slot: 'court', baseValuePerYear: 75_000, years: 1, oneTime: true, tiers: ['B', 'C', 'D'],
    pitch: '"Back The City" one-season financial campaign with VIP events for season-ticket holders.',
    brandGets: ['Players in "Back The City" commercial', 'Timeout broadcast logo', 'VIP event with season-ticket holders', 'Co-branded debit card promo'],
    clubGets: ['Stable seasonal income', 'Premium-sponsor reputation boost', 'Unlocks future finance sponsors'],
  },
  {
    brand: 'Downtown Dental', dealTypeLabel: 'One-Time Community Campaign', subLabel: 'Local Business',
    category: 'local-business', industry: 'generic', slot: 'court', baseValuePerYear: 25_000, years: 1, oneTime: true, tiers: ['C', 'D'],
    pitch: 'Neighborhood dentist looking for two-player TV spot and clinic activation.',
    brandGets: ['2 players appear in local TV ad', 'Clinic branding at youth camp', 'Social media shoutout', 'Signed jersey display in clinic'],
    clubGets: ['Small cash injection', 'Free dental check-ups for the roster', 'Local fan goodwill', 'Community reputation boost'],
  },
  {
    brand: 'La Tasca Local', dealTypeLabel: 'One-Time Community Campaign', subLabel: 'Local Restaurant',
    category: 'local-business', industry: 'generic', slot: 'court', baseValuePerYear: 15_000, years: 1, oneTime: true, tiers: ['C', 'D'],
    pitch: 'Family-run restaurant wants a player visit and post-game tradition launch.',
    brandGets: ['Player appearance at re-opening', 'Social media promo posts', 'Mascot collaboration day', 'Signed memorabilia for the dining wall'],
    clubGets: ['Tiny cash injection', 'Free team meals after home wins', 'Fan engagement boost', 'Local neighborhood popularity'],
  },
  {
    brand: 'Panadería del Barrio', dealTypeLabel: 'One-Time Community Campaign', subLabel: 'Neighborhood Bakery',
    category: 'local-business', industry: 'generic', slot: 'court', baseValuePerYear: 8_000, years: 1, oneTime: true, tiers: ['C', 'D'],
    pitch: 'Family bakery wants a player visit for its anniversary and a signed-bread display.',
    brandGets: ['Player visit on bakery anniversary', 'Signed bread display in shop', 'Social media reel'],
    clubGets: ['Symbolic cash bump', 'Neighborhood pride', 'Tiny fan-engagement boost'],
  },
  {
    brand: 'Radio Local FM', dealTypeLabel: 'Community Broadcast Campaign', subLabel: 'Local Radio Partner',
    category: 'broadcast', industry: 'telecom', slot: 'court', baseValuePerYear: 22_000, years: 1, oneTime: true, tiers: ['C', 'D'],
    pitch: 'Local FM station wants a coach weekly show and community giveaway segments.',
    brandGets: ['Weekly coach radio show', 'Live game co-commentary slot', 'Community giveaway segments'],
    clubGets: ['Local broadcast goodwill', 'Recurring on-air presence', 'Community fan reach'],
  },
  {
    brand: 'Supermercado del Centro', dealTypeLabel: 'Retail Promotion', subLabel: 'Local Supermarket',
    category: 'local-business', industry: 'generic', slot: 'court', baseValuePerYear: 18_000, years: 1, oneTime: true, tiers: ['C', 'D'],
    pitch: 'Local supermarket wants an in-store appearance and kids meet-and-greet.',
    brandGets: ['In-store player appearance', 'Kids meet-and-greet day', 'Player photo aisle display'],
    clubGets: ['Small cash injection', 'Family-fan engagement', 'Local popularity boost'],
  },
];

export function generateMockOffers(tier: TycoonTier, league: 'spain', seed: number): MockOffer[] {
  const rand = seedRand(seed);
  const interestLevels: InterestLevel[] = ['very-interested', 'very-interested', 'interested', 'interested', 'interested', 'neutral', 'not-interested'];
  const fits: MarketFit[] = ['excellent', 'very-good', 'good', 'good', 'fair', 'poor'];
  const offers: MockOffer[] = [];
  let idCounter = 0;
  for (const slot of ALL_SLOTS) {
    const pool = getSponsorPool(league, tier, slot);
    for (const brand of pool.slice(0, 3)) {
      const meta = getBrandMeta(league, brand);
      const classified = classifySponsor(brand);
      const industry = meta?.industry ?? classified.industry ?? 'generic';
      const archetype = (classified.archetype ?? 'generic') as 'premium' | 'gambling' | 'tech' | 'local' | 'generic';
      const interestLevel = interestLevels[Math.floor(rand() * interestLevels.length)];
      const fit = interestLevel === 'not-interested'
        ? fits[3 + Math.floor(rand() * 3)]
        : interestLevel === 'neutral'
          ? fits[2 + Math.floor(rand() * 3)]
          : fits[Math.floor(rand() * 4)];
      const status: OfferStatus = interestLevel === 'not-interested'
        ? 'not-interested'
        : interestLevel === 'neutral'
          ? 'neutral'
          : 'interested';
      const baseValue = slot === 'kit' ? 1_000_000 : slot === 'stadium' ? 600_000 : slot === 'sleeve' ? 700_000 : slot === 'back' ? 450_000 : 250_000;
      const tierMult = tier === 'S' ? 1.4 : tier === 'A' ? 0.9 : tier === 'B' ? 0.45 : tier === 'C' ? 0.22 : 0.1;
      const valuePerYear = Math.round((baseValue * tierMult * (0.7 + rand() * 0.9)) / 10_000) * 10_000;
      const contractYears = 2 + Math.floor(rand() * 4);
      offers.push({
        id: `${slot}-${brand}-${idCounter++}`,
        brand,
        slot,
        category: industryToCategory(industry),
        industry,
        archetype,
        interestLevel,
        interestSub: interestLevel === 'very-interested'
          ? 'Actively pursuing'
          : interestLevel === 'interested'
            ? 'Open to discussion'
            : interestLevel === 'neutral'
              ? 'Not enough info'
              : 'Not a focus',
        status,
        dealType: 'sponsorship',
        offerLabel: 'Sponsorship',
        slotLabel: SLOT_OFFER_LABEL[slot],
        valuePerYear,
        contractYears,
        marketFit: fit,
      });
    }
  }

  for (const spec of ENDORSEMENT_CATALOGUE) {
    if (!spec.tiers.includes(tier)) continue;
    const noise = 0.85 + rand() * 0.3;
    const valuePerYear = Math.round((spec.baseValuePerYear * noise) / 1_000) * 1_000;
    const interestLevel = interestLevels[Math.floor(rand() * interestLevels.length)];
    const fit = interestLevel === 'not-interested'
      ? fits[3 + Math.floor(rand() * 3)]
      : interestLevel === 'neutral'
        ? fits[2 + Math.floor(rand() * 3)]
        : fits[Math.floor(rand() * 4)];
    const status: OfferStatus = interestLevel === 'not-interested'
      ? 'not-interested'
      : interestLevel === 'neutral'
        ? 'neutral'
        : 'interested';
    const meta = getBrandMeta(league, spec.brand);
    const industry = meta?.industry ?? spec.industry;
    const archetype = (classifySponsor(spec.brand).archetype ?? 'generic') as 'premium' | 'gambling' | 'tech' | 'local' | 'generic';
    offers.push({
      id: `endorsement-${spec.brand}-${idCounter++}`,
      brand: spec.brand,
      slot: spec.slot,
      category: spec.category,
      industry,
      archetype,
      interestLevel,
      interestSub: interestLevel === 'very-interested'
        ? 'Actively pursuing'
        : interestLevel === 'interested'
          ? 'Open to discussion'
          : interestLevel === 'neutral'
            ? 'Not enough info'
            : 'Not a focus',
      status,
      dealType: 'endorsement',
      offerLabel: spec.dealTypeLabel,
      slotLabel: spec.subLabel,
      valuePerYear,
      contractYears: spec.oneTime ? 1 : spec.years,
      oneTime: spec.oneTime,
      marketFit: fit,
      brandGets: spec.brandGets,
      clubGets: spec.clubGets,
      pitch: spec.pitch,
    });
  }

  return offers.sort((a, b) => (b.valuePerYear * (b.oneTime ? 1 : b.contractYears)) - (a.valuePerYear * (a.oneTime ? 1 : a.contractYears)));
}

export function buildStartNegotiationData(offer: MockOffer, leagueYear: number, tycoon: any): StartNegotiationModalData {
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 24 * 3600_000);
  const expiresOn = expires.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  const interestLabel = offer.interestLevel === 'very-interested'
    ? 'Very Interested'
    : offer.interestLevel === 'interested'
      ? 'Interested'
      : offer.interestLevel === 'neutral'
        ? 'Neutral'
        : 'Not Interested';
  const baseFrontMultiplier = offer.slot === 'kit' ? 1
    : offer.slot === 'sleeve' ? 1 / 0.55
    : offer.slot === 'back' ? 1 / 0.45
    : offer.slot === 'shorts' ? 1 / 0.25
    : offer.slot === 'training' ? 1 / 0.30
    : 1;
  const baseValuePerYear = Math.round(offer.valuePerYear * baseFrontMultiplier);
  const occupiedSlots = new Set<SponsorshipSlot>();
  for (const slot of ALL_SLOTS) {
    if (tycoon?.sponsorships?.[slot]) occupiedSlots.add(slot);
  }
  return {
    brand: offer.brand,
    industry: offer.industry,
    slot: offer.slot,
    baseValuePerYear,
    interestLabel,
    exclusivityScope: offer.slotLabel,
    expiresOn,
    negotiationDaysLeft: 12,
    currentSeasonYear: leagueYear,
    occupiedSlots,
    oneTime: offer.oneTime,
    dealTypeLabel: offer.offerLabel,
  };
}

export function buildSponsorOfferData(offer: MockOffer, tycoon: any, leagueYear: number): SponsorOfferModalData {
  const startYear = leagueYear;
  const endYear = startYear + offer.contractYears;
  const startSeason = `${startYear}/${String(startYear + 1).slice(-2)}`;
  const endSeason = `${endYear - 1}/${String(endYear).slice(-2)}`;
  const fitGrade = offer.marketFit === 'excellent'
    ? 'A+'
    : offer.marketFit === 'very-good'
      ? 'A'
      : offer.marketFit === 'good'
        ? 'B'
        : offer.marketFit === 'fair'
          ? 'C'
          : 'D';
  const interestLabel = offer.interestLevel === 'very-interested'
    ? 'Very Interested'
    : offer.interestLevel === 'interested'
      ? 'Interested'
      : offer.interestLevel === 'neutral'
        ? 'Neutral'
        : 'Not Interested';
  const currentRevenue = Object.values(tycoon?.sponsorships ?? {}).reduce<number>((sum, sponsorship: any) => sum + (sponsorship?.valuePerYear ?? 0), 0);
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 24 * 3600_000);
  const expiresOn = expires.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  return {
    brand: offer.brand,
    industry: offer.industry,
    archetype: offer.archetype,
    slot: offer.slot,
    dealType: offer.dealType,
    oneTime: offer.oneTime,
    pitch: offer.pitch,
    dealTypeLabel: offer.offerLabel,
    brandGets: offer.brandGets,
    clubGets: offer.clubGets,
    valuePerYear: offer.valuePerYear,
    contractYears: offer.contractYears,
    contractStartSeason: startSeason,
    contractEndSeason: endSeason,
    exclusivity: offer.dealType === 'endorsement' ? 'Slot Exclusive' : 'Category Exclusive',
    exclusivityScope: offer.dealType === 'endorsement' ? (offer.slotLabel ?? 'Player Endorsement') : offer.slotLabel,
    interestLabel,
    interestSub: offer.interestSub,
    strategicFit: fitGrade,
    negotiationDaysLeft: 12,
    expiresOn,
    currentSponsorRevenue: currentRevenue,
  };
}

export const KpiCard: React.FC<{ tint: string; label: string; value: string }> = ({ tint, label, value }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
    <div className={`text-2xl font-black tabular-nums ${tint}`}>{value}</div>
    <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
  </div>
);

export const FilterSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{title}</div>
    <div className="space-y-1">{children}</div>
  </div>
);

export const FilterRow: React.FC<{
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
}> = ({ label, count, checked, onToggle, icon }) => (
  <button
    onClick={onToggle}
    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition ${
      checked ? 'bg-emerald-500/10' : 'hover:bg-slate-900/60'
    }`}
  >
    <span className={`w-4 h-4 rounded border flex items-center justify-center ${
      checked ? 'border-emerald-400 bg-emerald-500/20' : 'border-slate-700'
    }`}>
      {checked && <span className="w-2 h-2 rounded-sm bg-emerald-400" />}
    </span>
    {icon}
    <span className={`flex-1 text-sm ${checked ? 'text-slate-100' : 'text-slate-400'}`}>{label}</span>
    <span className="text-[11px] font-bold text-slate-500 tabular-nums">{count}</span>
  </button>
);

export function formatOpenMarketCurrency(value: number, currency: string) {
  return formatCurrencyWithCode(value, currency, false);
}
