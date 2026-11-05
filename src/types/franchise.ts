export type FranchiseTicketTier =
  | 'courtside'
  | 'floor'
  | 'lowerBowl'
  | 'vip'
  | 'upperBowl'
  | 'suites';

export type FranchiseSponsorSlot = 'namingRights' | 'jerseyPatch';

export type FranchiseAncillaryPrice = 'parking' | 'hotdog' | 'beer';

export interface FranchiseTicketPrice {
  priceUSD: number;
  updatedSeason: number;
}

export interface FranchiseCommercialDeal {
  id: string;
  slot: FranchiseSponsorSlot;
  brand: string;
  logoUrl?: string;
  venueName?: string;
  annualValueUSD: number;
  startSeason: number;
  endSeason: number;
}

export interface FranchiseArenaState {
  baseName: string;
  displayName: string;
  location: string;
  capacity: number;
  openedSeason?: number;
  imageUrl?: string;
  formerNames?: Array<{ season: number; name: string }>;
  tenants?: string[];
  pendingNewArena?: {
    proposedName: string;
    location: string;
    capacity: number;
    announcedSeason: number;
  };
}

export interface FranchiseHistoryEntry {
  id: string;
  season: number;
  title: string;
  detail: string;
  kind: 'arena' | 'sponsor' | 'ticketing';
  logoUrl?: string;
  imageUrl?: string;
}

export interface FranchiseOperationsState {
  version: 2 | 3;
  initializedSeason: number;
  lastProcessedSeason: number;
  lastArenaReviewSeason?: number;
  arena: FranchiseArenaState;
  ticketPrices: Record<FranchiseTicketTier, FranchiseTicketPrice>;
  ancillaryPrices?: Record<FranchiseAncillaryPrice, FranchiseTicketPrice>;
  deals: Partial<Record<FranchiseSponsorSlot, FranchiseCommercialDeal>>;
  history: FranchiseHistoryEntry[];
}

export interface FranchiseSponsorOffer {
  id: string;
  slot: FranchiseSponsorSlot;
  brand: string;
  logoUrl?: string;
  venueName?: string;
  annualValueUSD: number;
  years: number;
  fit: number;
}

export interface FranchiseLeagueEventDeal {
  assetId: string;
  assetName: string;
  assetType?: string;
  categoryGroup?: string;
  day?: string;
  durationDays?: string;
  metricType?: string;
  exposure?: string;
  prestige?: number;
  required?: boolean;
  baseAnnualValueUSD?: number;
  namingTemplate?: string;
  sponsorId?: string;
  sponsorDomain?: string;
  industry?: string;
  brandFit?: number;
  brand: string;
  logoUrl?: string;
  annualValueUSD: number;
  startSeason: number;
  endSeason: number;
}

export interface FranchiseLeagueEventState {
  version: 2;
  scope?: string;
  season: number;
  reviewedSeason?: number;
  aiResolvedSeason?: number;
  deals: FranchiseLeagueEventDeal[];
  scoped?: Record<string, {
    season: number;
    reviewedSeason?: number;
    aiResolvedSeason?: number;
    deals: FranchiseLeagueEventDeal[];
  }>;
}
