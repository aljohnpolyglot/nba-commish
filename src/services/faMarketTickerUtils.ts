import type { GameState, NBAPlayer } from '../types';
import type { FreeAgentBid } from './freeAgencyBidding';
import { getRFAPriorTid } from './freeAgencyBidding';
import { getDisplayAge, getDisplayOverall } from '../store/playerRatingStore';
import type { MarketTickResult } from './faMarketTickerTypes';
import { getLeagueCalendarDates, getLeagueSeasonForDate, isLeagueTrainingCampWindow } from './leagueCalendar';
import { parseGameDate } from '../utils/dateUtils';
import { getFranchiseCareerLoyaltyTid } from '../utils/franchiseCareerLoyalty';

export const MARKET_K2_THRESHOLD = 70;
export const MAX_NEW_MARKETS_PER_DAY = 8;
export const MAX_NEW_MARKETS_BURST = 30;
export const LATE_SEASON_K2_THRESHOLD = 92;
export const MAX_MARKETS_RESOLVING_PER_DAY = 20;

export function optionTag(option: FreeAgentBid['option']): string {
  if (option === 'PLAYER') return ' (player option)';
  if (option === 'TEAM') return ' (team option)';
  return '';
}

export function lastYearOptionLabel(option: FreeAgentBid['option']): 'Player' | 'Team' | '' {
  if (option === 'PLAYER') return 'Player';
  if (option === 'TEAM') return 'Team';
  return '';
}

export function isPostPreseason(stateDate: string | undefined, leagueStats: any): boolean {
  if (!stateDate) return false;
  const season = getLeagueSeasonForDate(stateDate, leagueStats);
  if (!Number.isFinite(season) || season <= 0) return false;
  return parseGameDate(stateDate) >= getLeagueCalendarDates(season, leagueStats).regularSeasonStart;
}

export function isPreseasonCampWindow(stateDate: string | undefined, leagueStats: any): boolean {
  if ((leagueStats?.nonGuaranteedContractsEnabled ?? true) === false) return false;
  return !!stateDate && isLeagueTrainingCampWindow(stateDate, leagueStats);
}

export function isCampInviteBid(
  k2: number,
  bid: Pick<FreeAgentBid, 'salaryUSD' | 'years'>,
  state: GameState,
): boolean {
  const lateCentralMarket = state.offseasonChecklist?.freeAgency === 'in-progress'
    && Number(state.faTagsTotal) > 15
    && Number(state.faTagCounter) > 15;
  if (!lateCentralMarket && !isPreseasonCampWindow(state.date, state.leagueStats as any)) return false;
  if (bid.years > 1) return false;
  const cap = (((state.leagueStats as any)?.salaryCap as number | undefined) ?? 140_000_000);
  const pct = bid.salaryUSD / cap;
  if (pct <= 0.05 && k2 < 78) return true;
  if (pct <= 0.07 && k2 < 72) return true;
  if (pct <= 0.09 && k2 < 65) return true;
  return false;
}

export function isLoyalMarketBlocked(player: NBAPlayer, bidTeamIds: number[], currentYear: number): boolean {
  const careerLoyaltyTid = getFranchiseCareerLoyaltyTid(player);
  if (careerLoyaltyTid >= 0) return !bidTeamIds.includes(careerLoyaltyTid);
  const traits: string[] = (player as any).moodTraits ?? [];
  if (!traits.includes('LOYAL')) return false;
  if ((player as any).status === 'Retired' || (player as any).diedYear) return false;
  const age = getDisplayAge(player, currentYear);
  if (age < 30) return false;
  const yearsOfService = ((player as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
  if (yearsOfService < 8) return false;
  const priorTid = getRFAPriorTid(player);
  if (priorTid < 0) return false;
  return !bidTeamIds.includes(priorTid);
}

export function getK2(player: NBAPlayer): number {
  return getDisplayOverall(player);
}

export function buildEmptyMarketTickResult(): MarketTickResult {
  return {
    updatedMarkets: [],
    signedPlayerIds: new Set<string>(),
    playerMutations: new Map<string, Partial<NBAPlayer>>(),
    historyEntries: [],
    newsItems: [],
    socialPosts: [],
    pendingPlayerIds: new Set<string>(),
    userBidResolutions: [],
    rfaOfferSheets: [],
    rfaMatchResolutions: [],
    aspireOutcomes: [],
    shouldStopSim: false,
  };
}
