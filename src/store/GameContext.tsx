import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Bet, BetLeg, GameState, Tab, UserAction } from '../types';
import { initialState } from './initialState';
import { useGameActions } from './useGameActions';
import { useGameDispatchAction } from './gameContext/useGameDispatchAction';
import { useGameProviderBootstrapEffects, useGameProviderPostLoadEffects } from './providers/gameProviderEffects';
import { useOffseasonChecklistLifecycle } from './providers/useOffseasonChecklistLifecycle';

interface PendingStatSort {
  type: 'player' | 'team';
  field: string;
  order: 'asc' | 'desc';
  phase?: 'regular' | 'playoffs' | 'combined' | 'cup';
  competitionId?: string;
}

interface GameContextType {
  state: GameState;
  dispatchAction: (action: UserAction) => Promise<void>;
  markEmailRead: (id: string) => void;
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
  navigateToTeam: (teamId: number) => void;
  navigateToTeamFinances: (teamId: number) => void;
  pendingStatSort: PendingStatSort | null;
  setPendingStatSort: (sort: PendingStatSort | null) => void;
  placeBet: (bet: { type: Bet['type']; wager: number; potentialPayout: number; legs: BetLeg[] }) => void;
  updatePlayerRatings: (playerId: string, season: number, ratings: Record<string, number>) => void;
  createPlayer: (player: import('../types').NBAPlayer) => void;
  healPlayer: (playerId: string) => void;
  updateProfile: (profile: Partial<import('../types').UserProfile>) => void;
  addPost: (post: import('../types').SocialPost) => void;
  addReply: (postId: string, reply: import('../types').SocialPost) => void;
  generateReplies: (postId: string) => Promise<void>;
  isGeneratingReplies: Record<string, boolean>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const fallbackGameContext: GameContextType = {
  state: initialState,
  dispatchAction: async () => {},
  markEmailRead: () => {},
  clearOutcome: () => {},
  saveSocialThread: () => {},
  toggleLike: () => {},
  toggleRetweet: () => {},
  markSocialRead: () => {},
  markNewsRead: () => {},
  markChatRead: () => {},
  followUser: () => {},
  unfollowUser: () => {},
  markPayslipsRead: () => {},
  currentView: 'Schedule',
  setCurrentView: () => {},
  selectedTeamId: null,
  setSelectedTeamId: () => {},
  navigateToTeam: () => {},
  navigateToTeamFinances: () => {},
  pendingStatSort: null,
  setPendingStatSort: () => {},
  placeBet: () => {},
  updatePlayerRatings: () => {},
  createPlayer: () => {},
  healPlayer: () => {},
  updateProfile: () => {},
  addPost: () => {},
  addReply: () => {},
  generateReplies: async () => {},
  isGeneratingReplies: {},
};

let warnedMissingGameProvider = false;

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<GameState>(initialState);
  const [currentView, setCurrentView] = useState<Tab>('Schedule');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [pendingStatSort, setPendingStatSort] = useState<PendingStatSort | null>(null);
  const generationIdRef = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
    (window as any).__nbaGetLiveState = () => stateRef.current;
  }, [state]);

  useGameProviderBootstrapEffects({
    state,
    currentView,
    setCurrentView,
    setState,
    stateRef,
  });

  useOffseasonChecklistLifecycle(state, setState);

  const actions = useGameActions(setState, () => stateRef.current);

  const navigateToTeam = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('NBA Central');
  };

  const navigateToTeamFinances = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('Team Finances');
  };

  const dispatchAction = useGameDispatchAction({
    state,
    setState,
    setCurrentView,
    stateRef,
    generationIdRef,
    actions,
  });

  useGameProviderPostLoadEffects(state, setState);

  const placeBet = (bet: { type: Bet['type']; wager: number; potentialPayout: number; legs: BetLeg[] }) => {
    const newBet: Bet = {
      id: `bet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: state.date,
      type: bet.type,
      status: 'pending',
      wager: bet.wager,
      potentialPayout: bet.potentialPayout,
      legs: bet.legs,
    };
    setState(prev => ({
      ...prev,
      bets: [newBet, ...(prev.bets ?? [])],
      stats: {
        ...prev.stats,
        personalWealth: Math.max(0, Number((prev.stats.personalWealth - bet.wager / 1_000_000).toFixed(4))),
      },
    }));
  };

  return (
    <GameContext.Provider
      value={{
        state,
        dispatchAction,
        placeBet,
        currentView,
        setCurrentView,
        selectedTeamId,
        setSelectedTeamId,
        navigateToTeam,
        navigateToTeamFinances,
        pendingStatSort,
        setPendingStatSort,
        ...actions,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    if (!warnedMissingGameProvider) {
      warnedMissingGameProvider = true;
      console.error('useGame must be used within a GameProvider. Falling back to a safe no-op context.');
    }
    return fallbackGameContext;
  }
  return context;
};
