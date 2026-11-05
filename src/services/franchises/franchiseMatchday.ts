import type {
  FranchiseAncillaryPrice,
  FranchiseOperationsState,
  FranchiseTicketTier,
  GameState,
  NBATeam,
} from '../../types';
import {
  finiteFranchiseValue,
  getLeagueAttendanceTarget,
  getFranchiseMarketFactor,
  getFranchisePerformanceFactor,
} from './franchiseMath';
import { getFranchiseEventEconomyScale } from './franchiseEventCatalog';
import { matchesScheduleSeason } from '../competition/competitionSeasonState';

export const FRANCHISE_TICKET_TIERS: readonly FranchiseTicketTier[] = [
  'courtside',
  'floor',
  'lowerBowl',
  'vip',
  'upperBowl',
  'suites',
];

export const FRANCHISE_TICKET_LABELS: Record<FranchiseTicketTier, string> = {
  courtside: 'Courtside Seats',
  floor: 'Floor Seats',
  lowerBowl: 'Lower Bowl',
  vip: 'VIP / Club Seats',
  upperBowl: 'Upper Bowl',
  suites: 'Luxury Suites',
};

export const FRANCHISE_TICKET_STEPS: Record<FranchiseTicketTier, number> = {
  courtside: 50,
  floor: 20,
  lowerBowl: 10,
  vip: 25,
  upperBowl: 5,
  suites: 100,
};

export const FRANCHISE_ANCILLARY_LABELS: Record<FranchiseAncillaryPrice, string> = {
  parking: 'Parking',
  hotdog: 'Hotdog',
  beer: 'Beer',
};

export const FRANCHISE_ANCILLARY_STEPS: Record<FranchiseAncillaryPrice, number> = {
  parking: 2,
  hotdog: 1,
  beer: 1,
};

export const FRANCHISE_BASE_TICKET_PRICES: Record<FranchiseTicketTier, number> = {
  courtside: 950,
  floor: 420,
  lowerBowl: 165,
  vip: 300,
  upperBowl: 65,
  suites: 1800,
};

export const FRANCHISE_BASE_ANCILLARY_PRICES: Record<FranchiseAncillaryPrice, number> = {
  parking: 25,
  hotdog: 8,
  beer: 12,
};

export const roundFranchiseCurrency = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0.01, Math.round((value + Number.EPSILON) * 100) / 100);
};

const historicalStep = (modernStep: number, economy: number): number => {
  const scaled = modernStep * economy;
  if (scaled < 0.1) return 0.05;
  if (scaled < 0.25) return 0.1;
  if (scaled < 0.5) return 0.25;
  if (scaled < 1) return 0.5;
  return Math.max(1, Math.round(scaled));
};

export function getFranchiseTicketPriceControls(
  state: GameState,
  tier: FranchiseTicketTier,
): { min: number; max: number; step: number } {
  const economy = Math.max(0.0001, getFranchiseEventEconomyScale(state, state.leagueStats.year));
  const step = historicalStep(FRANCHISE_TICKET_STEPS[tier], economy);
  const reference = roundFranchiseCurrency(FRANCHISE_BASE_TICKET_PRICES[tier] * economy);
  return { min: step, max: roundFranchiseCurrency(Math.max(reference * 5, step * 20)), step };
}

export function getFranchiseAncillaryPriceControls(
  state: GameState,
  item: FranchiseAncillaryPrice,
): { min: number; max: number; step: number } {
  const economy = Math.max(0.0001, getFranchiseEventEconomyScale(state, state.leagueStats.year));
  const step = historicalStep(FRANCHISE_ANCILLARY_STEPS[item], economy);
  const reference = roundFranchiseCurrency(FRANCHISE_BASE_ANCILLARY_PRICES[item] * economy);
  return { min: step, max: roundFranchiseCurrency(Math.max(reference * 5, step * 20)), step };
}

const CAPACITY_SHARES: Record<FranchiseTicketTier, number> = {
  courtside: 0.025,
  floor: 0.045,
  lowerBowl: 0.42,
  vip: 0.08,
  upperBowl: 0.38,
  suites: 0.05,
};

export function updateFranchiseTicketPrice(
  franchise: FranchiseOperationsState,
  tier: FranchiseTicketTier,
  nextPrice: number,
  season: number,
): void {
  franchise.ticketPrices[tier] = {
    priceUSD: roundFranchiseCurrency(finiteFranchiseValue(nextPrice)),
    updatedSeason: season,
  };
}

export function updateFranchiseAncillaryPrice(
  franchise: FranchiseOperationsState,
  item: FranchiseAncillaryPrice,
  nextPrice: number,
  season: number,
): void {
  franchise.ancillaryPrices = franchise.ancillaryPrices ?? Object.fromEntries(
    (Object.keys(FRANCHISE_BASE_ANCILLARY_PRICES) as FranchiseAncillaryPrice[]).map(key => [
      key,
      { priceUSD: FRANCHISE_BASE_ANCILLARY_PRICES[key], updatedSeason: season },
    ]),
  ) as NonNullable<FranchiseOperationsState['ancillaryPrices']>;
  franchise.ancillaryPrices[item] = {
    priceUSD: roundFranchiseCurrency(finiteFranchiseValue(nextPrice)),
    updatedSeason: season,
  };
}

export function getFranchiseMatchdayProjection(
  state: GameState,
  team: NBATeam,
  franchise: FranchiseOperationsState,
) {
  const capacity = franchise.arena.capacity;
  const economy = Math.max(0.01, getFranchiseEventEconomyScale(state, state.leagueStats.year));
  const leagueAttendanceTarget = getLeagueAttendanceTarget(state.leagueStats.year, state.leagueStats.uiMode);
  const marketFactor = getFranchiseMarketFactor(team);
  const leagueMarketFactor = state.teams.length > 0
    ? state.teams.reduce((sum, candidate) => sum + getFranchiseMarketFactor(candidate), 0) / state.teams.length
    : 1;
  const unanchoredDemand = Math.min(
    1,
    0.48
    + getFranchiseMarketFactor(team) * 0.2
    + getFranchisePerformanceFactor(team) * 0.22,
  );
  const marketDemand = leagueAttendanceTarget == null
    ? unanchoredDemand
    : Math.max(0.08, Math.min(
      1,
      leagueAttendanceTarget / Math.max(1, capacity)
        + (marketFactor - leagueMarketFactor) * 0.18
        + (getFranchisePerformanceFactor(team) - 1.25) * 0.35,
    ));
  const visible = (tier: FranchiseTicketTier) => {
    if (tier === 'upperBowl') return capacity >= 12_000;
    if (tier === 'suites' || tier === 'vip') return capacity >= 15_000;
    return true;
  };
  const visibleCapacityShare = FRANCHISE_TICKET_TIERS
    .filter(visible)
    .reduce((sum, tier) => sum + CAPACITY_SHARES[tier], 0);
  const tiers = FRANCHISE_TICKET_TIERS.map(tier => {
    if (!visible(tier)) return { tier, capacity: 0, attendance: 0, revenue: 0, demand: 0 };
    const tierCapacity = Math.round(capacity * CAPACITY_SHARES[tier] / visibleCapacityShare);
    const price = finiteFranchiseValue(franchise.ticketPrices[tier]?.priceUSD);
    const reference = Math.max(1, FRANCHISE_BASE_TICKET_PRICES[tier] * economy);
    const ratio = price / reference;
    const elasticity = ratio <= 1
      ? 1 + (1 - ratio) * 0.18
      : Math.exp(-0.72 * (ratio - 1));
    const demand = Math.max(0, Math.min(1, marketDemand * elasticity));
    const attendance = Math.round(tierCapacity * demand);
    return { tier, capacity: tierCapacity, attendance, revenue: Math.round(attendance * price), demand };
  });
  const attendance = tiers.reduce((sum, tier) => sum + tier.attendance, 0);
  const revenuePerGame = tiers.reduce((sum, tier) => sum + tier.revenue, 0);
  const ancillary = (Object.keys(FRANCHISE_BASE_ANCILLARY_PRICES) as FranchiseAncillaryPrice[])
    .map(item => {
      const price = finiteFranchiseValue(
        franchise.ancillaryPrices?.[item]?.priceUSD,
        FRANCHISE_BASE_ANCILLARY_PRICES[item] * economy,
      );
      const reference = Math.max(1, FRANCHISE_BASE_ANCILLARY_PRICES[item] * economy);
      const elasticity = price <= reference
        ? 1
        : Math.exp(-0.8 * (price / reference - 1));
      const baseVolume = item === 'parking'
        ? Math.min(capacity * 0.35, attendance * 0.35)
        : attendance * (item === 'hotdog' ? 0.44 : 0.29);
      const volume = Math.max(0, Math.round(baseVolume * elasticity));
      return { item, price, volume, revenue: Math.round(price * volume) };
    });
  const ancillaryRevenuePerGame = ancillary.reduce((sum, item) => sum + item.revenue, 0);
  const scheduledHomeGames = new Map(
    (state.schedule ?? [])
      .filter(game =>
        matchesScheduleSeason(game, state.leagueStats.year)
        && game.homeTid === team.id
        && game.homeTid !== game.awayTid
        && !game.isPreseason
        && !game.isAllStar
        && !game.isExhibition
        && !game.isPlayoff
        && !game.isPlayIn
        && !game.excludeFromRecord,
      )
      .map(game => [
        game.gid != null
          ? `${game.competitionId ?? 'nba'}:${game.gid}`
          : `${game.date}:${game.homeTid}:${game.awayTid}`,
        game,
      ]),
  ).size;
  const configuredGames = finiteFranchiseValue(state.leagueStats.gamesPerSeason);
  const expectedHomeGames = configuredGames > 0 ? Math.max(1, Math.round(configuredGames / 2)) : 0;
  const homeGames = scheduledHomeGames > 0 ? scheduledHomeGames : expectedHomeGames;
  return {
    tiers,
    ancillary,
    attendance,
    capacity,
    fillRate: capacity > 0 ? attendance / capacity : 0,
    revenuePerGame,
    ancillaryRevenuePerGame,
    matchdayRevenuePerGame: revenuePerGame + ancillaryRevenuePerGame,
    annualTicketRevenue: revenuePerGame * homeGames,
    annualMatchdayRevenue: (revenuePerGame + ancillaryRevenuePerGame) * homeGames,
    homeGames,
    homeGamesSource: scheduledHomeGames > 0 ? 'schedule' as const : 'leagueRules' as const,
  };
}
