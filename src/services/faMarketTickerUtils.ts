import type { GameState, NBAPlayer } from '../types';
import type { FreeAgentBid } from './freeAgencyBidding';
import { getRFAPriorTid } from './freeAgencyBidding';
import { getDisplayAge, getDisplayOverall } from '../store/playerRatingStore';
import type { MarketTickResult } from './faMarketTickerTypes';

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

export function isPostPreseason(stateDate: string | undefined): boolean {
  if (!stateDate) return false;
  const match = stateDate.match(/^([A-Za-z]{3}) (\d{1,2}),/);
  if (!match) return false;
  const monthMap: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  const m = monthMap[match[1]] ?? 0;
  const day = parseInt(match[2], 10) || 0;
  if (m >= 7 && m <= 9) return false;
  if (m === 10 && day <= 21) return false;
  return true;
}

export function isPreseasonCampWindow(stateDate: string | undefined, leagueStats: any): boolean {
  if ((leagueStats?.nonGuaranteedContractsEnabled ?? true) === false) return false;
  if (!stateDate) return false;
  const match = stateDate.match(/^([A-Za-z]{3}) (\d{1,2}),/);
  if (!match) return false;
  const monthMap: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  const m = monthMap[match[1]] ?? 0;
  const day = parseInt(match[2], 10) || 0;
  return (m >= 7 && m <= 9) || (m === 10 && day <= 21);
}

export function isCampInviteBid(
  k2: number,
  bid: Pick<FreeAgentBid, 'salaryUSD' | 'years'>,
  state: GameState,
): boolean {
  if (!isPreseasonCampWindow(state.date, state.leagueStats as any)) return false;
  if (bid.years > 1) return false;
  const cap = (((state.leagueStats as any)?.salaryCap as number | undefined) ?? 140_000_000);
  const pct = bid.salaryUSD / cap;
  if (pct <= 0.05 && k2 < 78) return true;
  if (pct <= 0.07 && k2 < 72) return true;
  if (pct <= 0.09 && k2 < 65) return true;
  return false;
}

export function isLoyalMarketBlocked(player: NBAPlayer, bidTeamIds: number[], currentYear: number): boolean {
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
    shouldStopSim: false,
  };
}
