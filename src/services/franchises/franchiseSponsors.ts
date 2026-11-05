import type {
  FranchiseCommercialDeal,
  FranchiseLeagueEventDeal,
  FranchiseLeagueEventState,
  FranchiseOperationsState,
  FranchiseSponsorOffer,
  FranchiseSponsorSlot,
  GameState,
  NBATeam,
} from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { TEAM_ARENAS } from '../../data/arenas';
import { FICTIONAL_FRANCHISE_BRANDS } from '../../data/fictionalFranchiseBrands';
import { resolveSponsorLogoUrl } from '../../utils/sponsorLogos';
import { resolveArenaNamingRightsSponsor } from '../../utils/arenaData';
import jerseyPatchData from '../../data/franchises/jersey_patches.json';
import {
  finiteFranchiseValue,
  franchiseSeed,
  getFranchiseMarketFactor,
  getFranchisePerformanceFactor,
  getFranchiseSourceSeason,
} from './franchiseMath';
import {
  getAvailableEventBrands,
  getEventSponsorBrand,
  getFranchiseEventAssets,
  getFranchiseEventEconomyScale,
  getHistoricalEventAssignment,
} from './franchiseEventCatalog';

type JerseyPatchSource = {
  teamId: string;
  teamName: string;
  currentPatch: {
    sponsor: string;
    domain: string;
    valuePerYear: number;
    contractYears: number;
    signedSeason: number;
  };
  history: Array<{
    sponsor: string;
    domain: string;
    valuePerYear: number;
    contractYears: number;
    yearsActive: string;
  }>;
};

const JERSEY_PATCH_DATA = jerseyPatchData as JerseyPatchSource[];

type SponsorSeed = {
  brand: string;
  domain?: string;
  logoUrl?: string;
  industry?: string;
  minSeason: number;
  maxSeason?: number;
};

const SPONSOR_CATALOG: SponsorSeed[] = [
  { brand: 'RCA', domain: 'rca.com', minSeason: 1946, maxSeason: 1986 },
  { brand: 'Zenith', minSeason: 1946, maxSeason: 1999 },
  { brand: 'Gulf', domain: 'gulf.com', minSeason: 1950, maxSeason: 1994 },
  { brand: 'Sears', domain: 'sears.com', minSeason: 1950, maxSeason: 2004 },
  { brand: 'TWA', minSeason: 1960, maxSeason: 2001 },
  { brand: 'Coca-Cola', domain: 'coca-cola.com', minSeason: 1960 },
  { brand: 'McDonald’s', domain: 'mcdonalds.com', minSeason: 1970 },
  { brand: 'Converse', domain: 'converse.com', minSeason: 1970 },
  { brand: 'Nike', domain: 'nike.com', minSeason: 1980 },
  { brand: 'Gatorade', domain: 'gatorade.com', minSeason: 1980 },
  { brand: 'Adidas', domain: 'adidas.com', minSeason: 1985 },
  { brand: 'State Farm', domain: 'statefarm.com', minSeason: 1995 },
  { brand: 'AT&T', domain: 'att.com', minSeason: 1995 },
  { brand: 'Chase', domain: 'chase.com', minSeason: 2000 },
  { brand: 'Emirates', domain: 'emirates.com', minSeason: 2005 },
  { brand: 'Google', domain: 'google.com', minSeason: 2005 },
  { brand: 'Amazon', domain: 'amazon.com', minSeason: 2010 },
];

const sponsorLogo = (domain?: string) =>
  domain
    ? resolveSponsorLogoUrl({ domain, industry: 'generic', logoOverride: null }) ?? undefined
    : undefined;

export const getFranchiseSponsorLogo = (brand: string, domain?: string) => {
  const matchedDomain = domain || getEventSponsorBrand(brand)?.domain;
  return sponsorLogo(matchedDomain || undefined);
};

const getJerseyPatchSource = (state: GameState, team: NBATeam) => {
  if (
    state.leagueType !== 'modded'
    || (state.moddedLeagueBase != null && state.moddedLeagueBase !== 'nba')
  ) return undefined;
  const fullName = getTeamFullName(team).toLowerCase();
  return JERSEY_PATCH_DATA.find(row =>
    row.teamId.toUpperCase() === team.abbrev.toUpperCase()
    || row.teamName.toLowerCase() === fullName,
  );
};

const parsePatchRange = (yearsActive: string) => {
  const years = [...yearsActive.matchAll(/\d{4}/g)].map(match => Number(match[0]));
  if (years.length === 0) return null;
  const startSeason = years[0];
  const endSeason = Math.max(startSeason, (years[1] ?? startSeason + 1) - 1);
  return { startSeason, endSeason };
};

export function getHistoricalJerseyPatchDeal(
  state: GameState,
  team: NBATeam,
): FranchiseCommercialDeal | undefined {
  const season = getFranchiseSourceSeason(state);
  const source = getJerseyPatchSource(state, team);
  if (!source || season < 2017) return undefined;
  const currentEnd = Math.max(
    source.currentPatch.signedSeason + source.currentPatch.contractYears - 1,
    2026,
  );
  if (season >= source.currentPatch.signedSeason && season <= currentEnd) {
    return {
      id: `${team.id}-jerseyPatch-${source.currentPatch.signedSeason}-source`,
      slot: 'jerseyPatch',
      brand: source.currentPatch.sponsor,
      logoUrl: sponsorLogo(source.currentPatch.domain),
      annualValueUSD: source.currentPatch.valuePerYear,
      startSeason: source.currentPatch.signedSeason,
      endSeason: currentEnd,
    };
  }
  const historical = source.history
    .map(row => ({ row, range: parsePatchRange(row.yearsActive) }))
    .find(item =>
      item.range
      && season >= item.range.startSeason
      && season <= item.range.endSeason,
    );
  if (!historical?.range) return undefined;
  return {
    id: `${team.id}-jerseyPatch-${historical.range.startSeason}-source`,
    slot: 'jerseyPatch',
    brand: historical.row.sponsor,
    logoUrl: sponsorLogo(historical.row.domain),
    annualValueUSD: historical.row.valuePerYear,
    startSeason: historical.range.startSeason,
    endSeason: historical.range.endSeason,
  };
}

export function getLatestHistoricalJerseyPatchDeal(
  state: GameState,
  team: NBATeam,
): FranchiseCommercialDeal | undefined {
  const season = getFranchiseSourceSeason(state);
  const source = getJerseyPatchSource(state, team);
  if (!source || season < 2017 || source.currentPatch.signedSeason > season) return undefined;
  const currentEnd = Math.max(
    source.currentPatch.signedSeason + source.currentPatch.contractYears - 1,
    2026,
  );
  return {
    id: `${team.id}-jerseyPatch-${source.currentPatch.signedSeason}-source`,
    slot: 'jerseyPatch',
    brand: source.currentPatch.sponsor,
    logoUrl: sponsorLogo(source.currentPatch.domain),
    annualValueUSD: source.currentPatch.valuePerYear,
    startSeason: source.currentPatch.signedSeason,
    endSeason: currentEnd,
  };
}

export function getHistoricalJerseyPatchTimeline(
  state: GameState,
  team: NBATeam,
): FranchiseOperationsState['history'] {
  const season = getFranchiseSourceSeason(state);
  const source = getJerseyPatchSource(state, team);
  if (!source) return [];
  const historical = source.history.flatMap(row => {
    const range = parsePatchRange(row.yearsActive);
    if (!range || range.startSeason > season) return [];
    return [{
      id: `${team.id}-patch-history-${range.startSeason}-${row.sponsor}`,
      season: range.startSeason,
      title: `${row.sponsor} jersey patch`,
      detail: `${row.sponsor} became the club’s jersey patch partner through ${Math.min(range.endSeason, season)}.`,
      kind: 'sponsor' as const,
      logoUrl: sponsorLogo(row.domain),
    }];
  });
  const current = source.currentPatch.signedSeason <= season
    ? [{
        id: `${team.id}-patch-history-${source.currentPatch.signedSeason}-${source.currentPatch.sponsor}`,
        season: source.currentPatch.signedSeason,
        title: `${source.currentPatch.sponsor} jersey patch`,
        detail: `${source.currentPatch.sponsor} became the club’s jersey patch partner.`,
        kind: 'sponsor' as const,
        logoUrl: sponsorLogo(source.currentPatch.domain),
      }]
    : [];
  return [...current, ...historical].sort((left, right) => right.season - left.season);
}

const fictionalSponsors = (): SponsorSeed[] =>
  FICTIONAL_FRANCHISE_BRANDS.map(brand => ({
    brand: brand.name,
    logoUrl: brand.logoUrl,
    industry: brand.category,
    minSeason: 1946,
  }));

const availableSponsors = (state: GameState) => {
  const season = state.leagueStats.year;
  const catalog = state.leagueType === 'fictional'
    ? fictionalSponsors()
    : SPONSOR_CATALOG;
  return catalog.filter(sponsor =>
    season >= sponsor.minSeason
    && (sponsor.maxSeason == null || season <= sponsor.maxSeason),
  );
};

export function createDefaultFranchiseDeal(
  state: GameState,
  team: NBATeam,
  slot: FranchiseSponsorSlot,
): FranchiseCommercialDeal {
  const season = state.leagueStats.year;
  const economy = getFranchiseEventEconomyScale(state, season);
  const fictional = state.leagueType === 'fictional';
  const fictionalCatalog = fictional ? fictionalSponsors() : [];
  const fictionalSponsor = fictionalCatalog.length > 0
    ? fictionalCatalog[franchiseSeed(`${team.id}:${slot}:${season}:initial`) % fictionalCatalog.length]
    : undefined;
  const venueName = slot === 'namingRights'
    ? TEAM_ARENAS[getTeamFullName(team)] ?? `${getTeamFullName(team)} Arena`
    : undefined;
  const arenaSponsor = venueName
    ? resolveArenaNamingRightsSponsor({ name: venueName })
    : null;
  const brand = fictional
    ? fictionalSponsor?.brand ?? `${team.region ?? team.name} Partners`
    : slot === 'namingRights'
      ? arenaSponsor ?? 'Open Naming Rights'
      : 'Community Partner';
  const annualBase = slot === 'namingRights' ? 11_000_000 : 7_500_000;
  return {
    id: `${team.id}-${slot}-${season}-initial`,
    slot,
    brand,
    logoUrl: fictionalSponsor?.logoUrl,
    annualValueUSD: Math.round(annualBase * getFranchiseMarketFactor(team) * economy),
    startSeason: season,
    endSeason: season + (slot === 'namingRights' ? 4 : 2),
    venueName,
  };
}

export function getFranchiseSponsorOffers(
  state: GameState,
  team: NBATeam,
  slot: FranchiseSponsorSlot,
): FranchiseSponsorOffer[] {
  const season = state.leagueStats.year;
  const economy = getFranchiseEventEconomyScale(state, season);
  const catalog = availableSponsors(state);
  const baseValue = slot === 'namingRights' ? 12_000_000 : 8_000_000;
  const seed = franchiseSeed(`${team.id}:${slot}:${season}`);
  const incumbentDeal = team.franchiseOperations?.deals[slot];
  const incumbent = incumbentDeal && !['Open Naming Rights', 'Community Partner'].includes(incumbentDeal.brand)
    ? {
        brand: incumbentDeal.brand,
        logoUrl: incumbentDeal.logoUrl,
        minSeason: 1946,
      } satisfies SponsorSeed
    : undefined;
  const challengers = Array.from({ length: catalog.length }, (_, index) =>
    catalog[(seed + index * 7) % catalog.length]
  ).filter((sponsor, index, candidates) =>
    sponsor.brand !== incumbent?.brand
    && candidates.findIndex(candidate => candidate.brand === sponsor.brand) === index
  );
  const candidates: SponsorSeed[] = [...(incumbent ? [incumbent] : []), ...challengers]
    .slice(0, Math.min(6, catalog.length + (incumbent ? 1 : 0)));
  return candidates.map((sponsor, index) => {
    const variance = 0.9 + ((franchiseSeed(`${seed}:${sponsor.brand}`) % 31) / 100);
    const years = slot === 'namingRights'
      ? 5 + ((seed + index) % 6)
      : 2 + ((seed + index) % 4);
    const fit = Math.min(
      99,
      Math.round(68 + getFranchiseMarketFactor(team) * 12 + ((seed + index) % 13)),
    );
    return {
      id: `${team.id}-${slot}-${season}-${index}`,
      slot,
      brand: sponsor.brand,
      logoUrl: sponsor.logoUrl ?? sponsorLogo(sponsor.domain),
      venueName: slot === 'namingRights'
        ? sponsor.brand === incumbent?.brand
          ? incumbentDeal?.venueName ?? `${sponsor.brand} Arena`
          : `${sponsor.brand} Arena`
        : undefined,
      annualValueUSD: Math.round(
        baseValue
        * economy
        * getFranchiseMarketFactor(team)
        * getFranchisePerformanceFactor(team)
        * variance,
      ),
      years,
      fit,
    };
  }).sort((left, right) => right.annualValueUSD - left.annualValueUSD);
}

export function signFranchiseSponsor(
  franchise: FranchiseOperationsState,
  offer: FranchiseSponsorOffer,
  season: number,
): void {
  franchise.deals[offer.slot] = {
    id: offer.id,
    slot: offer.slot,
    brand: offer.brand,
    logoUrl: offer.logoUrl,
    venueName: offer.venueName,
    annualValueUSD: offer.annualValueUSD,
    startSeason: season,
    endSeason: season + offer.years - 1,
  };
  if (offer.slot === 'namingRights' && offer.venueName) {
    franchise.arena.displayName = offer.venueName;
  }
  franchise.history.unshift({
    id: `${offer.id}-signed`,
    season,
    title: offer.slot === 'namingRights' ? 'Naming rights signed' : 'Jersey patch signed',
    detail: `${offer.brand} agreed to a ${offer.years}-year partnership worth $${Math.round(offer.annualValueUSD * offer.years).toLocaleString()} in total.`,
    kind: 'sponsor',
    logoUrl: offer.logoUrl,
  });
}

export function getFranchiseSponsorRevenue(
  franchise: FranchiseOperationsState,
  season: number,
  jerseyPatchAvailable = true,
): number {
  return Object.entries(franchise.deals).reduce((sum, [slot, deal]) =>
    slot === 'jerseyPatch' && !jerseyPatchAvailable
      ? sum
      : deal && deal.startSeason <= season && deal.endSeason >= season
        ? sum + finiteFranchiseValue(deal.annualValueUSD)
        : sum,
  0);
}

function createLeagueEventDeals(state: GameState): FranchiseLeagueEventDeal[] {
  const season = state.leagueStats.year;
  const sourceSeason = getFranchiseSourceSeason(state, season);
  const economy = getFranchiseEventEconomyScale(state, season);
  const nbaContext = state.leagueType !== 'fictional'
    && (state.leagueStats.uiMode == null || state.leagueStats.uiMode === 'nba');
  return getFranchiseEventAssets(state).map(asset => {
    const assignment = !nbaContext || season > sourceSeason
      ? null
      : getHistoricalEventAssignment(asset.id, season);
    const sponsor = assignment?.brand;
    return {
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.assetType,
      categoryGroup: asset.categoryGroup,
      day: asset.day,
      durationDays: asset.durationDays,
      metricType: asset.metricType,
      exposure: asset.base2020sExposure,
      prestige: asset.prestige,
      required: asset.required,
      baseAnnualValueUSD: asset.baseAnnualValue,
      namingTemplate: asset.namingTemplate,
      sponsorId: sponsor?.id,
      sponsorDomain: assignment?.sponsorDomain || sponsor?.domain || undefined,
      industry: assignment?.industry || sponsor?.industry,
      brand: assignment?.sponsorName ?? 'Unbranded',
      logoUrl: state.leagueType === 'fictional'
        ? undefined
        : sponsorLogo(assignment?.sponsorDomain || sponsor?.domain),
      annualValueUSD: assignment?.annualValueUSD
        || (sponsor ? Math.round(asset.baseAnnualValue * economy) : 0),
      startSeason: assignment?.startSeason ?? season,
      endSeason: assignment?.endSeason ?? season,
    };
  });
}

const getLeagueEventScope = (state: GameState): string => {
  if (state.leagueStats.uiMode) return state.leagueStats.uiMode;
  if (state.leagueType === 'fictional') return 'fictional';
  return state.moddedLeagueBase === 'nba' || state.moddedLeagueBase == null ? 'nba' : state.moddedLeagueBase;
};

const leagueEventSnapshot = (portfolio: FranchiseLeagueEventState) => ({
  season: portfolio.season,
  reviewedSeason: portfolio.reviewedSeason,
  aiResolvedSeason: portfolio.aiResolvedSeason,
  deals: portfolio.deals,
});

export function ensureFranchiseLeagueEvents(state: GameState): FranchiseLeagueEventState {
  const generated = createLeagueEventDeals(state);
  const existing = state.franchiseLeagueEvents;
  const scope = getLeagueEventScope(state);
  const legacyScope = existing?.scope == null ? 'nba' : existing.scope;
  const archived = existing?.scoped?.[scope];
  const current = legacyScope === scope
    ? existing
    : archived
      ? { version: 2 as const, scope, scoped: existing?.scoped, ...archived }
      : undefined;
  let scoped = existing?.scoped;
  if (existing && legacyScope !== scope) {
    scoped = {
      ...(existing.scoped ?? {}),
      [legacyScope]: leagueEventSnapshot(existing),
    };
  }
  const sameInventory = current?.version === 2
    && current.season === state.leagueStats.year
    && current.deals.length === generated.length
    && generated.every(replacement =>
      current.deals.some(deal => deal.assetId === replacement.assetId),
    );
  if (sameInventory && current) {
    let changed = false;
    const healedDeals = current.deals.map(deal => {
      const replacement = generated.find(candidate => candidate.assetId === deal.assetId);
      if (!replacement || deal.brand !== 'Unbranded' || replacement.brand === 'Unbranded') return deal;
      changed = true;
      return replacement;
    });
    const normalized = {
      ...current,
      scope,
      ...(scoped && Object.keys(scoped).length > 0 ? { scoped } : {}),
      deals: healedDeals,
    };
    return changed
      || current.scope !== scope
      || current.scoped !== normalized.scoped
      ? normalized
      : current;
  }
  return {
    version: 2,
    scope,
    season: state.leagueStats.year,
    reviewedSeason: current?.version === 2 ? current.reviewedSeason : undefined,
    aiResolvedSeason: undefined,
    ...(scoped && Object.keys(scoped).length > 0 ? { scoped } : {}),
    deals: generated.map(replacement =>
      current?.deals.find(deal => deal.assetId === replacement.assetId)
        ? {
            ...replacement,
            ...current.deals.find(deal => deal.assetId === replacement.assetId)!,
            assetName: replacement.assetName,
            assetType: replacement.assetType,
            categoryGroup: replacement.categoryGroup,
            day: replacement.day,
            durationDays: replacement.durationDays,
            metricType: replacement.metricType,
            exposure: replacement.exposure,
            prestige: replacement.prestige,
            required: replacement.required,
            baseAnnualValueUSD: replacement.baseAnnualValueUSD,
            namingTemplate: replacement.namingTemplate,
          }
        : replacement,
    ),
  };
}

export function getLeagueEventSponsorOffers(
  state: GameState,
  current: FranchiseLeagueEventDeal,
): FranchiseLeagueEventDeal[] {
  const season = state.leagueStats.year;
  const economy = getFranchiseEventEconomyScale(state, season);
  const asset = getFranchiseEventAssets(state)
    .find(item => item.id === current.assetId);
  if (!asset) return [];
  const catalog = getAvailableEventBrands(state)
    .filter(sponsor => sponsor.name !== current.brand)
    .filter(sponsor => {
      if (!sponsor.isRestricted || !asset.restrictedCategories?.length) return true;
      const industry = sponsor.industry.toLowerCase();
      return !asset.restrictedCategories.some(category =>
        industry.includes(category.toLowerCase())
        || (category.toLowerCase() === 'sportsbook' && industry.includes('sportsbook')),
      );
    })
    .map(sponsor => ({
      sponsor,
      fit: sponsor.preferredAssets.includes(asset.id)
        ? 96
        : 72 + franchiseSeed(`${sponsor.id}:${asset.id}:${season}`) % 22,
    }))
    .sort((left, right) => right.fit - left.fit || left.sponsor.tier - right.sponsor.tier)
    .slice(0, 8);
  return catalog.map(({ sponsor, fit }) => {
    const variance = 0.94
      + (franchiseSeed(`${sponsor.name}:${current.assetId}`) % 25) / 100;
    const tierMultiplier = sponsor.tier === 1 ? 1.25 : sponsor.tier === 2 ? 1 : sponsor.tier === 3 ? 0.72 : 0.45;
    return {
      ...current,
      sponsorId: sponsor.id,
      sponsorDomain: sponsor.domain || undefined,
      industry: sponsor.industry,
      brandFit: fit,
      brand: sponsor.name,
      logoUrl: state.leagueType === 'fictional'
        ? FICTIONAL_FRANCHISE_BRANDS.find(brand => brand.name === sponsor.name)?.logoUrl
        : sponsorLogo(sponsor.domain),
      annualValueUSD: Math.round(asset.baseAnnualValue * economy * tierMultiplier * variance),
      startSeason: season,
      endSeason: season + (sponsor.tier === 1 ? 3 : 2) - 1,
    };
  }).sort((left, right) => right.annualValueUSD - left.annualValueUSD);
}

export function resolveGmLeagueEventSponsors(state: GameState): FranchiseLeagueEventState {
  const season = state.leagueStats.year;
  const portfolio = ensureFranchiseLeagueEvents(state);
  if (portfolio.aiResolvedSeason === season) return portfolio;
  const sourceSeason = getFranchiseSourceSeason(state);
  const nbaContext = state.leagueType !== 'fictional'
    && (state.leagueStats.uiMode == null || state.leagueStats.uiMode === 'nba');
  const deals = portfolio.deals.map(deal => {
    const historicalAssignment = nbaContext && season <= sourceSeason
      ? getHistoricalEventAssignment(deal.assetId, season)
      : null;
    if (historicalAssignment) return deal;
    const due = deal.brand === 'Unbranded' || deal.endSeason < season;
    return due ? getLeagueEventSponsorOffers(state, deal)[0] ?? deal : deal;
  });
  return {
    ...portfolio,
    reviewedSeason: season,
    aiResolvedSeason: season,
    deals,
  };
}
