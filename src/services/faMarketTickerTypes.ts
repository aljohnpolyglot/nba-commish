import type { GameState, HistoryEntry, NBAPlayer } from '../types';
import type { AspireSideDeal } from './aspireSideDeals';

export interface MarketTickResult {
  updatedMarkets: any[];
  leagueStats?: GameState['leagueStats'];
  signedPlayerIds: Set<string>;
  playerMutations: Map<string, Partial<NBAPlayer>>;
  historyEntries: HistoryEntry[];
  newsItems: any[];
  socialPosts: any[];
  pendingPlayerIds: Set<string>;
  userBidResolutions: {
    playerName: string;
    accepted: boolean;
    winnerTeamName?: string;
    annualM: number;
    salaryUSD?: number;
    years: number;
    rejectionReason?: string;
  }[];
  rfaOfferSheets: {
    playerId: string;
    playerName: string;
    signingTeamName: string;
    annualM: number;
    salaryUSD?: number;
    years: number;
    expiresInDays: number;
  }[];
  rfaMatchResolutions: {
    playerName: string;
    priorTeamName: string;
    signingTeamName: string;
    matched: boolean;
    userInvolved: boolean;
  }[];
  aspireOutcomes: {
    playerId: string;
    playerName: string;
    teamId: number;
    sideDeal: AspireSideDeal;
  }[];
  shouldStopSim: boolean;
}
