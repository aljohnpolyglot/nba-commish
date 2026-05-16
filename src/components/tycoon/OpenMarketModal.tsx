import React, { useMemo, useState } from 'react';
import {
  X, Handshake, Search, RefreshCw, ArrowRight, List as ListIcon, LayoutGrid,
  Shirt, Building2, Tv, Landmark, Car, Cpu, Beer, Plane, MoreHorizontal, Dice5, Store,
} from 'lucide-react';
import { SponsorOfferModal, type SponsorOfferModalData } from './SponsorOfferModal';
import { StartNegotiationModal, type StartNegotiationModalData, KIT_FAMILY_SLOTS } from './StartNegotiationModal';
import { useGame } from '../../store/GameContext';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { getSponsorPool, getBrandMeta } from '../../data/sponsorCatalogFetcher';
import { classifySponsor, applyRenewal, type SponsorshipOffer } from '../../services/tycoon/sponsorshipEngine';
import { ALL_SLOTS, type SponsorshipSlot, type SponsorIndustry, type TycoonTier } from '../../types/tycoon';
import { SponsorLogo } from './SponsorLogo';

interface Props {
  open: boolean;
  onClose: () => void;
}

type InterestLevel = 'very-interested' | 'interested' | 'neutral' | 'not-interested';
type MarketFit = 'excellent' | 'very-good' | 'good' | 'fair' | 'poor';
type DealCategory =
  | 'kit-apparel' | 'arena-venue' | 'broadcast' | 'financial'
  | 'automotive' | 'technology' | 'beverage' | 'travel' | 'gambling' | 'local-business' | 'other';
type OfferStatus = 'interested' | 'negotiation' | 'neutral' | 'not-interested';
type DealType = 'sponsorship' | 'endorsement';
const ENDORSEMENT_SLOT_CAP = 4;

interface MockOffer {
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

const CATEGORY_LABEL: Record<DealCategory, string> = {
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

const CATEGORY_ICON: Record<DealCategory, React.ComponentType<{ size?: number; className?: string }>> = {
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

const CATEGORY_TINT: Record<DealCategory, string> = {
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

const INTEREST_TINT: Record<InterestLevel, { dot: string; text: string }> = {
  'very-interested': { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  interested:        { dot: 'bg-emerald-500/80', text: 'text-emerald-400' },
  neutral:           { dot: 'bg-slate-500', text: 'text-slate-400' },
  'not-interested':  { dot: 'bg-rose-500', text: 'text-rose-400' },
};

const INTEREST_LABEL: Record<InterestLevel, string> = {
  'very-interested': 'Very Interested',
  interested: 'Interested',
  neutral: 'Neutral',
  'not-interested': 'Not Interested',
};

const FIT_TINT: Record<MarketFit, { bar: string; text: string; pct: number }> = {
  excellent:   { bar: 'bg-emerald-400', text: 'text-emerald-300', pct: 95 },
  'very-good': { bar: 'bg-emerald-400', text: 'text-emerald-300', pct: 80 },
  good:        { bar: 'bg-emerald-500', text: 'text-emerald-400', pct: 65 },
  fair:        { bar: 'bg-amber-400',   text: 'text-amber-300',   pct: 45 },
  poor:        { bar: 'bg-rose-500',    text: 'text-rose-400',    pct: 25 },
};

const FIT_LABEL: Record<MarketFit, string> = {
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

function industryToCategory(ind: SponsorIndustry | 'generic'): DealCategory {
  switch (ind) {
    case 'fashion': return 'kit-apparel';
    case 'bank': return 'financial';
    case 'auto': return 'automotive';
    case 'tech': return 'technology';
    case 'telecom': return 'broadcast';
    case 'beer':
    case 'water':
    case 'energy_drink': return 'beverage';
    case 'airline': return 'travel';
    case 'gambling': return 'gambling';
    case 'sportswashing': return 'other';
    default: return 'other';
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
  dealTypeLabel: string;     // shown as Offer Type primary line
  subLabel: string;          // shown as Offer Type secondary line
  category: DealCategory;
  industry: SponsorIndustry | 'generic';
  slot: SponsorshipSlot;     // re-used slot bucket (no separate state)
  baseValuePerYear: number;  // EUR
  years: number;             // ignored if oneTime
  oneTime?: boolean;
  tiers: TycoonTier[];       // which club tiers see this offer
  /** Brand-specific list of what the sponsor gets — overrides slot-based perks. */
  brandGets: string[];
  /** Brand-specific list of what the club gets — overrides industry-based benefits. */
  clubGets: string[];
  /** Plain-English line shown in the offer header. */
  pitch: string;
}

const ENDORSEMENT_CATALOGUE: EndorsementSpec[] = [
  // Big-club lifestyle / premium endorsements
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

  // Mid-tier official equipment / finance
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

  // Small-club / community campaigns
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

function generateMockOffers(tier: TycoonTier, league: 'spain', seed: number): MockOffer[] {
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
      const status: OfferStatus = interestLevel === 'not-interested' ? 'not-interested'
        : interestLevel === 'neutral' ? 'neutral'
        : 'interested';
      const dealType: DealType = 'sponsorship';
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
        interestSub: interestLevel === 'very-interested' ? 'Actively pursuing'
          : interestLevel === 'interested' ? 'Open to discussion'
          : interestLevel === 'neutral' ? 'Not enough info'
          : 'Not a focus',
        status,
        dealType,
        offerLabel: 'Sponsorship',
        slotLabel: SLOT_OFFER_LABEL[slot],
        valuePerYear,
        contractYears,
        marketFit: fit,
      });
    }
  }

  // Endorsement / community deals — curated tier-gated catalogue.
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
    const status: OfferStatus = interestLevel === 'not-interested' ? 'not-interested'
      : interestLevel === 'neutral' ? 'neutral'
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
      interestSub: interestLevel === 'very-interested' ? 'Actively pursuing'
        : interestLevel === 'interested' ? 'Open to discussion'
        : interestLevel === 'neutral' ? 'Not enough info'
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

type SortKey = 'potential-high' | 'potential-low' | 'value-high' | 'value-low' | 'fit-best';

const SORT_LABEL: Record<SortKey, string> = {
  'potential-high': 'Potential Value (High)',
  'potential-low': 'Potential Value (Low)',
  'value-high': 'Annual Value (High)',
  'value-low': 'Annual Value (Low)',
  'fit-best': 'Market Fit (Best)',
};

export const OpenMarketModal: React.FC<Props> = ({ open, onClose }) => {
  const { state, applyTycoonMutation } = useGame() as any;
  const userTeamId = state?.userTeamId;
  const team = state?.teams?.find((t: any) => (t.id ?? t.tid) === userTeamId)
    ?? state?.nonNBATeams?.find((t: any) => (t.id ?? t.tid) === userTeamId);
  const tycoon = team?.tycoon;
  const tier: TycoonTier = tycoon?.tier ?? 'A';
  const currency = state?.leagueStats?.currency ?? 'EUR';
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const activeEndorsements = ((tycoon?.oneTimePayouts ?? []) as any[]).filter((p) => p.kind === 'endorsement');
  const activeEndorsementBrands = new Set(activeEndorsements.map((p) => p.brand).filter(Boolean));
  const endorsementCapReached = activeEndorsements.length >= ENDORSEMENT_SLOT_CAP;

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('potential-high');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [categoryFilter, setCategoryFilter] = useState<Set<DealCategory | 'all'>>(new Set(['all']));
  const [statusFilter, setStatusFilter] = useState<Set<OfferStatus | 'all'>>(new Set(['all']));
  const [dealTypeFilter, setDealTypeFilter] = useState<Set<DealType>>(new Set(['sponsorship', 'endorsement']));
  const [minValue, setMinValue] = useState(0);
  const [selectedOffer, setSelectedOffer] = useState<MockOffer | null>(null);
  const [negotiationOffer, setNegotiationOffer] = useState<MockOffer | null>(null);

  const allOffers = useMemo(() => {
    if (!open) return [];
    return generateMockOffers(tier, 'spain', userTeamId ?? 1);
  }, [open, tier, userTeamId]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allOffers.length };
    for (const o of allOffers) counts[o.category] = (counts[o.category] ?? 0) + 1;
    return counts;
  }, [allOffers]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allOffers.length };
    for (const o of allOffers) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return counts;
  }, [allOffers]);

  const dealTypeCounts = useMemo(() => {
    const counts: Record<DealType, number> = { sponsorship: 0, endorsement: 0 };
    for (const o of allOffers) counts[o.dealType]++;
    return counts;
  }, [allOffers]);

  const availableCount = useMemo(() => {
    const sponsorships = tycoon?.sponsorships ?? {};
    const signedBrands = new Set([
      ...Object.values(sponsorships).map((s: any) => s?.sponsor).filter(Boolean),
      ...((tycoon?.oneTimePayouts ?? []) as any[]).filter((p) => p.kind === 'endorsement').map((p) => p.brand).filter(Boolean),
    ]);
    const endorsementsSigned = ((tycoon?.oneTimePayouts ?? []) as any[]).filter((p) => p.kind === 'endorsement').length;
    return allOffers.filter((o) => {
      if (o.interestLevel === 'not-interested') return false;
      if (signedBrands.has(o.brand)) return false;
      if (o.dealType === 'endorsement' && endorsementsSigned >= ENDORSEMENT_SLOT_CAP) return false;
      if (o.dealType !== 'endorsement') {
        const isKitFamily = (KIT_FAMILY_SLOTS as string[]).includes(o.slot);
        if (isKitFamily && KIT_FAMILY_SLOTS.every((s) => sponsorships[s])) return false;
        if (!isKitFamily && sponsorships[o.slot]) return false;
      }
      return true;
    }).length;
  }, [allOffers, tycoon]);

  const conflictIndustries = useMemo(() => {
    const set = new Set<SponsorIndustry | 'generic'>();
    const sponsorships = Object.values(tycoon?.sponsorships ?? {}) as Array<{ industry?: SponsorIndustry } | null>;
    const gambling = sponsorships.filter((s) => s?.industry === 'gambling').length;
    const beerEnergy = sponsorships.filter((s) => s?.industry === 'beer' || s?.industry === 'energy_drink').length;
    if (gambling >= 1) set.add('gambling');
    if (beerEnergy >= 2) { set.add('beer'); set.add('energy_drink'); }
    return set;
  }, [tycoon]);

  const filteredOffers = useMemo(() => {
    let list = allOffers.slice();
    if (!categoryFilter.has('all')) {
      list = list.filter((o) => categoryFilter.has(o.category));
    }
    if (!statusFilter.has('all')) {
      list = list.filter((o) => statusFilter.has(o.status));
    }
    list = list.filter((o) => dealTypeFilter.has(o.dealType));
    list = list.filter((o) => o.valuePerYear >= minValue);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) => o.brand.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const totalA = a.valuePerYear * a.contractYears;
      const totalB = b.valuePerYear * b.contractYears;
      switch (sortKey) {
        case 'potential-high': return totalB - totalA;
        case 'potential-low': return totalA - totalB;
        case 'value-high': return b.valuePerYear - a.valuePerYear;
        case 'value-low': return a.valuePerYear - b.valuePerYear;
        case 'fit-best': return FIT_TINT[b.marketFit].pct - FIT_TINT[a.marketFit].pct;
      }
    });
    return list;
  }, [allOffers, categoryFilter, statusFilter, dealTypeFilter, minValue, search, sortKey]);

  const kpis = useMemo(() => {
    const totalAnnual = filteredOffers.reduce((sum, o) => sum + o.valuePerYear, 0);
    const totalValue = filteredOffers.reduce((sum, o) => sum + o.valuePerYear * o.contractYears, 0);
    const avg = filteredOffers.length > 0 ? totalAnnual / filteredOffers.length : 0;
    const avgFitPct = filteredOffers.length > 0
      ? filteredOffers.reduce((sum, o) => sum + FIT_TINT[o.marketFit].pct, 0) / filteredOffers.length
      : 0;
    const attractiveness = avgFitPct >= 85 ? 'A+'
      : avgFitPct >= 75 ? 'A'
      : avgFitPct >= 65 ? 'A-'
      : avgFitPct >= 55 ? 'B+'
      : avgFitPct >= 45 ? 'B'
      : avgFitPct >= 35 ? 'C'
      : 'D';
    return { count: filteredOffers.length, totalAnnual, totalValue, avg, attractiveness };
  }, [filteredOffers]);

  if (!open) return null;

  const toggleCategory = (cat: DealCategory | 'all') => {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (cat === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      if (next.size === 0) next.add('all');
      return next;
    });
  };
  const toggleStatus = (s: OfferStatus | 'all') => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (s === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(s)) next.delete(s); else next.add(s);
      if (next.size === 0) next.add('all');
      return next;
    });
  };
  const toggleDealType = (d: DealType) => {
    setDealTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      if (next.size === 0) { next.add('sponsorship'); next.add('endorsement'); }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-[1600px] w-full max-h-[94vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-7 py-5 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Handshake size={22} className="text-emerald-300" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-wide">OPEN MARKET</h2>
              <p className="text-sm text-slate-400">Review sponsor offers from brands interested in partnering with your club.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={22} className="text-slate-400 hover:text-white" /></button>
        </div>

        {/* Section header */}
        <div className="flex items-center gap-3 px-7 py-3 border-b border-slate-800">
          <span className="text-xs font-black uppercase tracking-widest text-emerald-300">Interested Sponsors</span>
          <span className="inline-flex items-center justify-center min-w-[26px] h-[22px] rounded-full px-2 text-[11px] font-black bg-emerald-500/25 text-emerald-300">{availableCount}</span>
          <span className={`ml-auto inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${
            endorsementCapReached ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          }`}>
            Endorsements {Math.min(activeEndorsements.length, ENDORSEMENT_SLOT_CAP)}/{ENDORSEMENT_SLOT_CAP}
          </span>
          <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-emerald-400 hidden" />
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-5 gap-3 px-7 py-4 border-b border-slate-800 bg-slate-950">
          <KpiCard tint="text-emerald-300" label="Interested Brands" value={String(kpis.count)} />
          <KpiCard tint="text-sky-300" label="Total Potential Value / Year" value={fmt(kpis.totalAnnual)} />
          <KpiCard tint="text-amber-300" label="Total Potential Value" value={fmt(kpis.totalValue)} />
          <KpiCard tint="text-violet-300" label="Avg. Market Value" value={fmt(Math.round(kpis.avg))} />
          <KpiCard tint="text-amber-300" label="Market Attractiveness" value={kpis.attractiveness} />
        </div>

        {/* Body: filters + main */}
        <div className="flex-1 overflow-hidden grid grid-cols-[280px_1fr]">
          {/* Filters sidebar */}
          <aside className="overflow-y-auto border-r border-slate-800 p-5 space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Filters</div>
              <button
                onClick={() => {
                  setCategoryFilter(new Set(['all']));
                  setStatusFilter(new Set(['all']));
                  setDealTypeFilter(new Set(['sponsorship', 'endorsement']));
                  setMinValue(0);
                  setSearch('');
                }}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                Clear All <RefreshCw size={11} />
              </button>
            </div>

            <FilterSection title="Category">
              <FilterRow
                label="All Categories"
                count={categoryCounts.all ?? 0}
                checked={categoryFilter.has('all')}
                onToggle={() => toggleCategory('all')}
                icon={null}
              />
              {(Object.keys(CATEGORY_LABEL) as DealCategory[]).map((cat) => {
                const Icon = CATEGORY_ICON[cat];
                return (
                  <FilterRow
                    key={cat}
                    label={CATEGORY_LABEL[cat]}
                    count={categoryCounts[cat] ?? 0}
                    checked={categoryFilter.has(cat)}
                    onToggle={() => toggleCategory(cat)}
                    icon={<Icon size={14} className={CATEGORY_TINT[cat]} />}
                  />
                );
              })}
            </FilterSection>

            <FilterSection title="Offer Status">
              <FilterRow label="All Status" count={statusCounts.all ?? 0} checked={statusFilter.has('all')} onToggle={() => toggleStatus('all')} icon={null} />
              <FilterRow label="Interested" count={statusCounts.interested ?? 0} checked={statusFilter.has('interested')} onToggle={() => toggleStatus('interested')} icon={<span className="w-2 h-2 rounded-full bg-emerald-400" />} />
              <FilterRow label="Negotiation" count={2} checked={statusFilter.has('negotiation')} onToggle={() => toggleStatus('negotiation')} icon={<span className="w-2 h-2 rounded-full bg-violet-400" />} />
              <FilterRow label="Neutral" count={statusCounts.neutral ?? 0} checked={statusFilter.has('neutral')} onToggle={() => toggleStatus('neutral')} icon={<span className="w-2 h-2 rounded-full bg-slate-500" />} />
              <FilterRow label="Not Interested" count={statusCounts['not-interested'] ?? 0} checked={statusFilter.has('not-interested')} onToggle={() => toggleStatus('not-interested')} icon={<span className="w-2 h-2 rounded-full bg-rose-500" />} />
            </FilterSection>

            <FilterSection title="Deal Type">
              <FilterRow label="Sponsorship" count={dealTypeCounts.sponsorship} checked={dealTypeFilter.has('sponsorship')} onToggle={() => toggleDealType('sponsorship')} icon={null} />
              <FilterRow label="Endorsement" count={dealTypeCounts.endorsement} checked={dealTypeFilter.has('endorsement')} onToggle={() => toggleDealType('endorsement')} icon={null} />
            </FilterSection>

            <div>
              <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Minimum Value / Year</div>
              <input
                type="range"
                min={0}
                max={2_000_000}
                step={50_000}
                value={minValue}
                onChange={(e) => setMinValue(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>{fmt(0)}</span>
                <span>{fmt(2_000_000)}+</span>
              </div>
            </div>
          </aside>

          {/* Main area */}
          <main className="overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
              <div className="relative flex-1 max-w-[420px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search brands..."
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-400/60"
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-400/60"
                >
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <option key={k} value={k}>Sort by: {SORT_LABEL[k]}</option>
                  ))}
                </select>
                <div className="flex border border-slate-800 rounded-lg overflow-hidden">
                  <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-slate-300'}`}><ListIcon size={14} /></button>
                  <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-slate-300'}`}><LayoutGrid size={14} /></button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredOffers.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">No offers match the current filters.</div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-950 z-10">
                    <tr className="border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <th className="text-left px-6 py-3">Brand</th>
                      <th className="text-left px-3 py-3">Category</th>
                      <th className="text-left px-3 py-3">Interest Level</th>
                      <th className="text-left px-3 py-3">Offer Type</th>
                      <th className="text-left px-3 py-3">Value / Year</th>
                      <th className="text-left px-3 py-3">Contract Length</th>
                      <th className="text-left px-3 py-3">Total Value</th>
                      <th className="text-left px-3 py-3">Market Fit</th>
                      <th className="text-left px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOffers.map((o) => {
                      const CatIcon = CATEGORY_ICON[o.category];
                      const fitMeta = FIT_TINT[o.marketFit];
                      const interest = INTEREST_TINT[o.interestLevel];
                      const isKitFamily = (KIT_FAMILY_SLOTS as string[]).includes(o.slot);
                      const slotOccupied = o.dealType !== 'endorsement' && (
                        isKitFamily
                          ? KIT_FAMILY_SLOTS.every((s) => Boolean(tycoon?.sponsorships?.[s]))
                          : Boolean(tycoon?.sponsorships?.[o.slot])
                      );
                      const sponsorBrandAlreadySigned = Object.values(tycoon?.sponsorships ?? {}).some(
                        (s: any) => s?.sponsor === o.brand,
                      );
                      const endorsementAlreadySigned = activeEndorsementBrands.has(o.brand);
                      const industryConflict = conflictIndustries.has(o.industry);
                      const endorsementBlocked = o.dealType === 'endorsement' && endorsementCapReached && !endorsementAlreadySigned;
                      const unavailable = o.interestLevel === 'not-interested' || slotOccupied || industryConflict || sponsorBrandAlreadySigned || endorsementAlreadySigned || endorsementBlocked;
                      const unavailReason = endorsementAlreadySigned ? 'Endorsement already signed this season'
                        : sponsorBrandAlreadySigned ? 'Brand already partnered with club'
                        : endorsementBlocked ? 'Endorsement cap reached'
                        : slotOccupied ? 'Slot already filled'
                        : industryConflict ? 'Conflicts with current sponsor'
                        : o.interestLevel === 'not-interested' ? 'Not interested'
                        : '';
                      return (
                        <tr
                          key={o.id}
                          title={unavailReason || undefined}
                          className={`border-b border-slate-900 transition ${unavailable ? 'opacity-50' : 'hover:bg-slate-900/30'}`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <SponsorLogo name={o.brand} meta={getBrandMeta('spain', o.brand)} industry={o.industry} size={36} />
                              <span className="font-bold text-white">{o.brand}</span>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-2">
                              <CatIcon size={14} className={CATEGORY_TINT[o.category]} />
                              <span className="text-sm text-slate-300">{CATEGORY_LABEL[o.category]}</span>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${interest.dot}`} />
                              <div>
                                <div className={`text-sm font-bold ${interest.text}`}>{INTEREST_LABEL[o.interestLevel]}</div>
                                <div className="text-[11px] text-slate-500">{o.interestSub}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="text-sm text-slate-200">{o.offerLabel}</div>
                            <div className="text-[11px] text-slate-500">{o.slotLabel}</div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="text-sm font-bold text-white tabular-nums">{fmt(o.valuePerYear)}</div>
                            <div className="text-[11px] text-slate-500">per year</div>
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-300 tabular-nums">{o.oneTime ? 'One-Time' : `${o.contractYears} Years`}</td>
                          <td className="px-3 py-4 text-sm font-bold text-white tabular-nums">{fmt(o.oneTime ? o.valuePerYear : o.valuePerYear * o.contractYears)}</td>
                          <td className="px-3 py-4">
                            <div className={`text-xs font-bold ${fitMeta.text}`}>{FIT_LABEL[o.marketFit]}</div>
                            <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-800 overflow-hidden">
                              <div className={`h-full ${fitMeta.bar}`} style={{ width: `${fitMeta.pct}%` }} />
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <button
                              disabled={unavailable}
                              onClick={() => !unavailable && setSelectedOffer(o)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                unavailable
                                  ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                                  : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                              }`}
                            >
                              {endorsementAlreadySigned ? 'Signed' : unavailable ? 'Unavailable' : o.dealType === 'endorsement' ? 'View Details' : 'View Offer'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </main>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-7 py-4 border-t border-slate-800 bg-slate-950">
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Very Interested</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500/80" /> Interested</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-500" /> Neutral</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Not Interested</span>
          </div>
          <div className="flex-1 text-center text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">ⓘ Interest level is based on brand fit, market value, and your club's current profile.</span>
          </div>
        </div>
      </div>

      <SponsorOfferModal
        open={selectedOffer !== null}
        onClose={() => setSelectedOffer(null)}
        data={selectedOffer ? buildSponsorOfferData(selectedOffer, tycoon, state?.leagueStats?.year ?? new Date().getFullYear()) : null}
        onDismiss={() => setSelectedOffer(null)}
        onStartNegotiation={() => {
          if (!selectedOffer) return;
          setNegotiationOffer(selectedOffer);
          setSelectedOffer(null);
        }}
      />
      <StartNegotiationModal
        open={negotiationOffer !== null}
        onClose={() => setNegotiationOffer(null)}
        data={negotiationOffer ? buildStartNegotiationData(negotiationOffer, state?.leagueStats?.year ?? new Date().getFullYear(), tycoon) : null}
        onSubmit={(sub) => {
          if (!negotiationOffer || userTeamId == null) return;
          const year = state?.leagueStats?.year ?? new Date().getFullYear();
          // One-time community / endorsement deal — immediate payout, no ongoing slot occupation.
          if (negotiationOffer.oneTime) {
            if (negotiationOffer.dealType === 'endorsement' && ((tycoon?.oneTimePayouts ?? []) as any[]).filter((p) => p.kind === 'endorsement').length >= ENDORSEMENT_SLOT_CAP) return;
            const payout = sub.valuePerYear;
            const brand = negotiationOffer.brand;
            applyTycoonMutation(userTeamId, (t: any) => {
              const ledger: any[] = t.tycoon.oneTimePayouts ?? (t.tycoon.oneTimePayouts = []);
              const alreadySigned = ledger.some((p: any) =>
                p.year === year &&
                p.brand === brand &&
                p.kind === (negotiationOffer.dealType === 'endorsement' ? 'endorsement' : 'sponsorship')
              );
              if (alreadySigned) return;
              t.tycoon.cashOnHand = (t.tycoon.cashOnHand ?? 0) + payout;
              ledger.push({
                id: `one-time-${year}-${brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
                year,
                brand,
                amount: payout,
                kind: negotiationOffer.dealType === 'endorsement' ? 'endorsement' : 'sponsorship',
                date: new Date().toISOString().slice(0, 10),
                expiresAfterYear: year + 1,
                offerLabel: negotiationOffer.offerLabel,
                slotLabel: negotiationOffer.slotLabel,
                industry: negotiationOffer.industry,
              });
            });
            return;
          }
          const classified = classifySponsor(negotiationOffer.brand);
          const signed: SponsorshipOffer = {
            slot: sub.slot,
            sponsor: negotiationOffer.brand,
            industry: classified.industry,
            archetype: classified.archetype,
            personality: classified.personality,
            personalityProse: classified.personalityProse,
            valuePerYear: sub.valuePerYear,
            signingBonus: Math.round(sub.valuePerYear * 0.6),
            years: sub.contractYears,
          };
          applyTycoonMutation(userTeamId, (t: any) => applyRenewal(t.tycoon, sub.slot, signed, year));
        }}
      />
    </div>
  );
};

function buildStartNegotiationData(offer: MockOffer, leagueYear: number, tycoon: any): StartNegotiationModalData {
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 24 * 3600_000);
  const expiresOn = expires.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  const interestLabel = offer.interestLevel === 'very-interested' ? 'Very Interested'
    : offer.interestLevel === 'interested' ? 'Interested'
    : offer.interestLevel === 'neutral' ? 'Neutral'
    : 'Not Interested';
  // valuePerYear was already scaled by slot in the generator. Normalize to "front of shirt" base
  // so the placement picker's multipliers produce sensible numbers.
  const front = 1.0;
  const baseFrontMultiplier = offer.slot === 'kit' ? 1
    : offer.slot === 'sleeve' ? 1 / 0.55
    : offer.slot === 'back' ? 1 / 0.45
    : offer.slot === 'shorts' ? 1 / 0.25
    : offer.slot === 'training' ? 1 / 0.30
    : 1;
  const baseValuePerYear = Math.round(offer.valuePerYear * baseFrontMultiplier * front);
  const occupiedSlots = new Set<SponsorshipSlot>();
  for (const s of ALL_SLOTS) {
    if (tycoon?.sponsorships?.[s]) occupiedSlots.add(s);
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

function buildSponsorOfferData(offer: MockOffer, tycoon: any, leagueYear: number): SponsorOfferModalData {
  const startYear = leagueYear;
  const endYear = startYear + offer.contractYears;
  const startSeason = `${startYear}/${String(startYear + 1).slice(-2)}`;
  const endSeason = `${endYear - 1}/${String(endYear).slice(-2)}`;
  const fitGrade = offer.marketFit === 'excellent' ? 'A+'
    : offer.marketFit === 'very-good' ? 'A'
    : offer.marketFit === 'good' ? 'B'
    : offer.marketFit === 'fair' ? 'C'
    : 'D';
  const interestLabel = offer.interestLevel === 'very-interested' ? 'Very Interested'
    : offer.interestLevel === 'interested' ? 'Interested'
    : offer.interestLevel === 'neutral' ? 'Neutral'
    : 'Not Interested';
  const slotExclusivity = (offer.dealType === 'endorsement' ? 'Slot Exclusive' : 'Category Exclusive') as 'Category Exclusive' | 'Slot Exclusive' | 'Non-Exclusive';
  const currentRevenue: number = Object.values(tycoon?.sponsorships ?? {}).reduce<number>((sum, s: any) => sum + (s?.valuePerYear ?? 0), 0);
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
    exclusivity: slotExclusivity,
    exclusivityScope: offer.dealType === 'endorsement' ? (offer.slotLabel ?? 'Player Endorsement') : offer.slotLabel,
    interestLabel,
    interestSub: offer.interestSub,
    strategicFit: fitGrade,
    negotiationDaysLeft: 12,
    expiresOn,
    currentSponsorRevenue: currentRevenue,
  };
}

const KpiCard: React.FC<{ tint: string; label: string; value: string }> = ({ tint, label, value }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
    <div className={`text-2xl font-black tabular-nums ${tint}`}>{value}</div>
    <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
  </div>
);

const FilterSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{title}</div>
    <div className="space-y-1">{children}</div>
  </div>
);

const FilterRow: React.FC<{ label: string; count: number; checked: boolean; onToggle: () => void; icon: React.ReactNode }> = ({ label, count, checked, onToggle, icon }) => (
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
