import type { LeagueKey } from '../../data/sponsorCatalogFetcher';
import type { ArenaVenueIdentity, StadiumFacilityState, TycoonState } from '../../types/tycoon';
import {
  findEuroCityForClubName,
  getEuroCityPool,
  getStableCityRoll,
  pickWeightedEuroCity,
  preloadEuroCityPools,
} from '../euroScouting/cityPools';
import { getClubFinanceSnapshot, postClubTransaction } from './clubFinance';
import { SPONSOR_LEAGUE_COUNTRY } from './sponsorHeadquarters';

export interface ArenaVenueCandidate extends ArenaVenueIdentity {
  availableFromYear: number;
  priceEUR: number;
  relocationCostEUR: number;
  relocatesClub: boolean;
}

interface InitialVenueInput {
  state: TycoonState;
  league: LeagueKey;
  teamName: string;
  arenaName: string;
  capacity: number;
  openingYear?: number;
  currentYear: number;
}

const normalizeId = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const roundCapitalCost = (value: number): number => Math.max(50_000, Math.round(value / 50_000) * 50_000);

const uniqueCitiesByPopulation = (iso2: string): Array<[string, number]> => {
  const cities = new Map<string, number>();
  for (const [name, population] of getEuroCityPool(iso2)) {
    cities.set(name, Math.max(cities.get(name) ?? 0, population));
  }
  return [...cities].sort((a, b) => b[1] - a[1]);
};

export async function buildMissingArenaVenue(input: InitialVenueInput): Promise<ArenaVenueIdentity | null> {
  await preloadEuroCityPools();
  if (input.state.facilities.stadium.venue) return null;
  const market = SPONSOR_LEAGUE_COUNTRY[input.league];
  const city = findEuroCityForClubName(market.iso2, input.teamName)
    ?? pickWeightedEuroCity(market.iso2, getStableCityRoll(`${input.league}:${input.teamName}`))
    ?? market.country;
  return {
    id: `existing-${normalizeId(input.teamName)}`,
    name: input.arenaName,
    city,
    country: market.country,
    iso2: market.iso2,
    openingYear: input.openingYear && input.openingYear <= input.currentYear ? input.openingYear : undefined,
    kind: 'existing',
    baseCapacity: Math.max(1_000, Math.round(input.capacity)),
  };
}

export function buildArenaVenueMarket(args: {
  stadium: StadiumFacilityState;
  league: LeagueKey;
  teamName: string;
  currentYear: number;
  economyIndex: number;
}): ArenaVenueCandidate[] {
  const market = SPONSOR_LEAGUE_COUNTRY[args.league];
  const currentCity = args.stadium.venue?.city
    ?? findEuroCityForClubName(market.iso2, args.teamName)
    ?? uniqueCitiesByPopulation(market.iso2)[0]?.[0]
    ?? market.country;
  const cities = uniqueCitiesByPopulation(market.iso2);
  const currentPopulation = cities.find(([name]) => name === currentCity)?.[1] ?? 250_000;
  const relocationCities = cities.filter(([name]) => name !== currentCity).slice(0, 2);
  const currentCapacity = Math.max(3_000, args.stadium.capacity ?? args.stadium.baseCapacity ?? 3_000);
  const localBuilds = [
    { key: 'club', label: 'Club Arena', capacity: Math.max(6_000, Math.ceil((currentCapacity + 1_000) / 500) * 500), costPerSeat: 720 },
    { key: 'regional', label: 'Regional Arena', capacity: Math.max(10_000, Math.ceil((currentCapacity + 3_000) / 500) * 500), costPerSeat: 880 },
    { key: 'national', label: 'National Arena', capacity: Math.max(15_000, Math.ceil((currentCapacity + 6_000) / 500) * 500), costPerSeat: 1_050 },
  ];
  const candidates: ArenaVenueCandidate[] = localBuilds.map(build => {
    const marketCost = 1 + Math.min(0.35, currentPopulation / 12_000_000);
    return {
      id: `new-${args.currentYear}-${normalizeId(currentCity)}-${build.key}`,
      name: `${currentCity} ${build.label}`,
      city: currentCity,
      country: market.country,
      iso2: market.iso2,
      openingYear: args.currentYear,
      acquiredYear: args.currentYear,
      kind: 'new-build',
      baseCapacity: build.capacity,
      availableFromYear: args.currentYear,
      relocationCostEUR: 0,
      relocatesClub: false,
      priceEUR: roundCapitalCost(build.capacity * build.costPerSeat * marketCost * Math.max(0.05, args.economyIndex)),
    };
  });
  for (const [city, population] of relocationCities) {
    const capacity = Math.max(9_000, Math.ceil((currentCapacity + 2_000) / 500) * 500);
    const relocationCostEUR = roundCapitalCost((750_000 + Math.min(1_500_000, population * 0.35)) * Math.max(0.05, args.economyIndex));
    const constructionCost = capacity * 850 * (1 + Math.min(0.35, population / 12_000_000)) * Math.max(0.05, args.economyIndex);
    candidates.push({
      id: `new-${args.currentYear}-${normalizeId(city)}-relocation`,
      name: `${city} Basketball Arena`,
      city,
      country: market.country,
      iso2: market.iso2,
      openingYear: args.currentYear,
      acquiredYear: args.currentYear,
      kind: 'new-build',
      baseCapacity: capacity,
      availableFromYear: args.currentYear,
      relocationCostEUR,
      relocatesClub: true,
      priceEUR: roundCapitalCost(constructionCost + relocationCostEUR),
    });
  }
  return candidates.filter(candidate => candidate.openingYear == null || candidate.openingYear <= args.currentYear);
}

export function purchaseArenaVenue(
  state: TycoonState,
  candidate: ArenaVenueCandidate,
  currentDate: string,
  currentYear: number,
): boolean {
  if (candidate.availableFromYear > currentYear || (candidate.openingYear ?? currentYear) > currentYear) return false;
  const stadium = state.facilities.stadium;
  if (stadium.venue?.id === candidate.id || getClubFinanceSnapshot(state, currentDate).availableEUR < candidate.priceEUR) return false;
  const transaction = postClubTransaction(state, {
    sourceId: `arena-venue:${candidate.id}`,
    date: currentDate,
    season: currentYear,
    category: 'facility',
    label: `${candidate.name}${candidate.relocatesClub ? ` relocation to ${candidate.city}` : ' construction'}`,
    amountEUR: -candidate.priceEUR,
  });
  if (!transaction) return false;
  if (stadium.venue) {
    stadium.venueHistory = [...(stadium.venueHistory ?? []), {
      ...stadium.venue,
      leftYear: currentYear,
      finalCapacity: stadium.capacity,
      installedArenaFeatures: [...(stadium.installedArenaFeatures ?? [])],
      completedArenaProjects: [...(stadium.completedArenaProjects ?? [])],
    }];
  }
  const { availableFromYear: _availableFromYear, priceEUR: _priceEUR, relocationCostEUR: _relocationCostEUR, relocatesClub: _relocatesClub, ...venue } = candidate;
  stadium.venue = venue;
  stadium.baseCapacity = candidate.baseCapacity;
  stadium.capacity = candidate.baseCapacity;
  stadium.installedArenaFeatures = [];
  stadium.completedArenaProjects = [];
  return true;
}
