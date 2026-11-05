import { createContext, useContext } from 'react';
import type { Bet, BetLeg, Email, GameState, NBAPlayer, SocialPost, Tab, UserAction, UserProfile } from '../types';
import type { K2DetailOffsets } from '../services/simulation/k2DetailRatings';
import type { GameDeepLinkRoute } from '../services/navigation/gameDeepLinks';
import type { ExternalSaveNotice } from '../services/SaveManager';

export interface PendingStatSort {
  type: 'player' | 'team';
  field: string;
  order: 'asc' | 'desc';
  phase?: 'regular' | 'playoffs' | 'combined' | 'cup';
  competitionId?: string;
}

export interface PlayerRatingsUpdateOptions {
  k2DetailOffsets?: K2DetailOffsets;
  durability?: number;
  standingDunk?: number;
  drivingDunk?: number;
}

export interface GameContextType {
  state: GameState;
  dispatchAction: (action: UserAction) => Promise<void>;
  markEmailRead: (id: string) => void;
  addEmail: (email: Email) => void;
  dismissEmail: (id: string) => void;
  clearOutcome: () => void;
  saveSocialThread: (postId: string, replies: any[]) => void;
  toggleLike: (postId: string) => void;
  toggleRetweet: (postId: string) => void;
  markSocialRead: () => void;
  markNewsRead: () => void;
  markChatRead: (chatId: string) => void;
  followUser: (handle: string) => void;
  unfollowUser: (handle: string) => void;
  markPayslipsRead: () => void;
  currentView: Tab;
  setCurrentView: (view: Tab) => void;
  selectedTeamId: number | null;
  setSelectedTeamId: (id: number | null) => void;
  injuriesTeamFilter: number | null;
  setInjuriesTeamFilter: (id: number | null) => void;
  navigateToTeam: (teamId: number) => void;
  navigateToTeamFinances: (teamId: number) => void;
  pendingStatSort: PendingStatSort | null;
  setPendingStatSort: (sort: PendingStatSort | null) => void;
  navigationRoute: GameDeepLinkRoute | null;
  navigationError: string | null;
  navigationBootstrapPending: boolean;
  navigateToRoute: (route: GameDeepLinkRoute, options?: { replace?: boolean }) => void;
  navigateToPlayer: (player: NBAPlayer, options?: { replace?: boolean }) => void;
  closeDeepLink: (fallbackView?: Tab) => void;
  externalSaveNotice: ExternalSaveNotice | null;
  reloadExternallyUpdatedSave: () => Promise<void>;
  placeBet: (bet: { type: Bet['type']; wager: number; potentialPayout: number; legs: BetLeg[] }) => void;
  updatePlayerRatings: (
    playerId: string,
    season: number,
    ratings: Record<string, number>,
    options?: PlayerRatingsUpdateOptions,
  ) => void;
  createPlayer: (player: NBAPlayer) => void;
  healPlayer: (playerId: string) => void;
  updateProfile: (profile: Partial<UserProfile>) => void;
  addPost: (post: SocialPost) => void;
  addReply: (postId: string, reply: SocialPost) => void;
  generateReplies: (postId: string) => Promise<void>;
  isGeneratingReplies: Record<string, boolean>;
  applyTycoonMutation: (
    teamId: number,
    mutator: (team: GameState['teams'][number] | GameState['nonNBATeams'][number]) => void,
  ) => void;
}

export const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = (): GameContextType => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
