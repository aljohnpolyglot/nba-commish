import React, { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import { GameState, UserAction, Tab, Bet, BetLeg } from '../types';
import { processTurn, handleStartGame, handleAnnounceChange } from './logic/gameLogic';
import { useGameActions } from './useGameActions';
import { initialState } from './initialState';
import { sendChatMessage } from '../services/llm/llm';
import { prefetchPlayerBio } from '../components/central/view/bioCache';
import { SettingsManager } from '../services/SettingsManager';

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
  pendingStatSort: { type: 'player' | 'team'; field: string; order: 'asc' | 'desc' } | null;
  setPendingStatSort: (sort: { type: 'player' | 'team'; field: string; order: 'asc' | 'desc' } | null) => void;
  placeBet: (bet: { type: Bet['type']; wager: number; potentialPayout: number; legs: BetLeg[] }) => void;
  updatePlayerRatings: (playerId: string, season: number, ratings: Record<string, number>) => void;
  healPlayer: (playerId: string) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<GameState>(initialState);
  const [currentView, setCurrentView] = useState<Tab>('Schedule');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [pendingStatSort, setPendingStatSort] = useState<{ type: 'player' | 'team'; field: string; order: 'asc' | 'desc' } | null>(null);
  const generationIdRef = useRef(0);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const actions = useGameActions(setState);

  const navigateToTeam = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('NBA Central');
  };

  const navigateToTeamFinances = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('Team Finances');
  };

  const dispatchAction = async (action: UserAction) => {
    if (action.type === 'CLEAR_OUTCOME') {
      actions.clearOutcome();
      return;
    }

    // Social-only actions — never advance the game day
    if (action.type === 'UPDATE_USER_PROFILE') {
      setState(prev => ({
        ...prev,
        userProfile: { ...(prev.userProfile || {}), ...(action as any).payload },
      }));
      return;
    }

    if (action.type === 'ADD_USER_POST') {
      setState(prev => ({
        ...prev,
        socialFeed: [(action as any).payload, ...prev.socialFeed],
      }));
      return;
    }

    if (action.type === 'CACHE_PROFILE') {
      const { handle, profile } = (action as any).payload;
      setState(prev => ({
        ...prev,
        cachedProfiles: {
          ...(prev.cachedProfiles || {}),
          [handle.replace('@', '')]: profile,
        },
      }));
      return;
    }

    if (action.type === 'SAVE_SOCIAL_THREAD') {
      actions.saveSocialThread(action.payload.postId, action.payload.replies);
      return;
    }

    if (action.type === 'ADD_PENDING_HYPNOSIS') {
      setState(prev => ({
        ...prev,
        pendingHypnosis: [...(prev.pendingHypnosis || []), action.payload]
      }));
      return;
    }

    if (action.type === 'UPDATE_SAVE_ID') {
      setState(prev => ({ ...prev, saveId: action.payload }));
      return;
    }

    if (action.type === 'SAVE_CONTEST_RESULT') {
      const { contest, result } = action.payload;
      setState(prev => {
        if (!prev.allStar) return prev;
        return {
          ...prev,
          allStar: {
            ...prev.allStar,
            ...(contest === 'dunk' ? { dunkContest: result } : { threePointContest: result }),
          }
        };
      });
      return;
    }

    if (action.type === 'RECORD_WATCHED_GAME') {
      const { gameId, result } = action.payload;
      setState(prev => {
        const newSchedule = prev.schedule.map((g: any) =>
          g.gid === gameId ? { ...g, played: true, homeScore: result.homeScore, awayScore: result.awayScore } : g
        );
        const boxScoreEntry = { ...result, gameId, date: prev.date };
        const existing = (prev.boxScores || []).findIndex((b: any) => b.gameId === gameId);
        const newBoxScores = existing >= 0
          ? (prev.boxScores || []).map((b: any, i: number) => i === existing ? boxScoreEntry : b)
          : [...(prev.boxScores || []), boxScoreEntry];
        // Update wins/losses for real teams only (not exhibition)
        let newTeams = prev.teams;
        if (result.homeTeamId > 0 && result.awayTeamId > 0) {
          newTeams = prev.teams.map((t: any) => {
            if (t.id === result.homeTeamId) {
              const won = result.homeScore > result.awayScore;
              return {
                ...t,
                wins: won ? t.wins + 1 : t.wins,
                losses: won ? t.losses : t.losses + 1,
                streak: won
                  ? (t.streak?.type === 'W' ? { type: 'W', count: t.streak.count + 1 } : { type: 'W', count: 1 })
                  : (t.streak?.type === 'L' ? { type: 'L', count: t.streak.count + 1 } : { type: 'L', count: 1 })
              };
            }
            if (t.id === result.awayTeamId) {
              const won = result.awayScore > result.homeScore;
              return {
                ...t,
                wins: won ? t.wins + 1 : t.wins,
                losses: won ? t.losses : t.losses + 1,
                streak: won
                  ? (t.streak?.type === 'W' ? { type: 'W', count: t.streak.count + 1 } : { type: 'W', count: 1 })
                  : (t.streak?.type === 'L' ? { type: 'L', count: t.streak.count + 1 } : { type: 'L', count: 1 })
              };
            }
            return t;
          });
        }
        return { ...prev, schedule: newSchedule, boxScores: newBoxScores, teams: newTeams };
      });

      // Fire photo fetch for watched game — non-blocking
      const watchedHome = state.teams.find(t => t.id === result.homeTeamId);
      const watchedAway = state.teams.find(t => t.id === result.awayTeamId);
      if (watchedHome && watchedAway) {
        import('../services/ImagnPhotoService').then(({ fetchGamePhotos }) => {
          fetchGamePhotos({ homeTeam: watchedHome, awayTeam: watchedAway }).catch(() => {});
        });
      }
      return;
    }

    if (action.type === 'STORE_PURCHASE') {
      const { amountMillion } = action.payload as { amountMillion: number };
      setState(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          personalWealth: Math.max(0, Number((prev.stats.personalWealth - amountMillion).toFixed(4))),
        },
      }));
      return;
    }

    if (action.type === 'REAL_ESTATE_INVENTORY_UPDATE') {
      setState(prev => ({ ...prev, realEstateInventory: action.payload.inventory }));
      return;
    }

    if (action.type === 'COMMISH_STORE_INVENTORY_UPDATE') {
      setState(prev => ({ ...prev, commishStoreInventory: action.payload.inventory }));
      return;
    }

    if (action.type === 'RIG_ALL_STAR_VOTING') {
      const { playerId, ghostVotes } = action.payload as { playerId: string; ghostVotes: number };
      setState(prev => ({
        ...prev,
        allStar: prev.allStar ? {
          ...prev.allStar,
          hasRiggedVoting: true,
          votes: prev.allStar.votes.map(v =>
            v.playerId === playerId ? { ...v, votes: v.votes + ghostVotes } : v
          ),
        } : prev.allStar,
      }));
      return;
    }

    if (action.type === 'SET_DUNK_CONTESTANTS') {
      const { contestants } = action.payload as { contestants: any[] };
      setState(prev => ({
        ...prev,
        allStar: prev.allStar ? { ...prev.allStar, dunkContestContestants: contestants, dunkContestAnnounced: true } : prev.allStar,
      }));
      return;
    }

    if (action.type === 'SET_THREE_POINT_CONTESTANTS') {
      const { contestants } = action.payload as { contestants: any[] };
      setState(prev => ({
        ...prev,
        allStar: prev.allStar ? { ...prev.allStar, threePointContestants: contestants, threePointAnnounced: true } : prev.allStar,
      }));
      return;
    }

    if (action.type === 'ADD_ALL_STAR_REPLACEMENT') {
      const { injuredId, replacementId, replacementName, conference, position } = action.payload as any;
      setState(prev => {
        if (!prev.allStar) return prev;
        const replacementPlayer = prev.players.find(p => p.internalId === replacementId);
        const replacementTeam = prev.teams.find(t => t.id === replacementPlayer?.tid);
        // Mark injured player as DNP
        const updatedRoster = prev.allStar.roster.map(r =>
          r.playerId === injuredId ? { ...r, isInjuredDNP: true } : r
        );
        // Only add replacement if not already in roster
        const alreadyIn = updatedRoster.some(r => r.playerId === replacementId);
        if (!alreadyIn && replacementPlayer) {
          updatedRoster.push({
            playerId: replacementPlayer.internalId,
            playerName: replacementPlayer.name,
            teamAbbrev: replacementTeam?.abbrev ?? '',
            nbaId: null,
            teamNbaId: null,
            conference: conference || (replacementTeam?.conference ?? 'East'),
            isStarter: false,
            position: replacementPlayer.pos ?? 'F',
            category: (replacementPlayer.pos?.includes('G') ? 'Guard' : 'Frontcourt') as 'Guard' | 'Frontcourt',
            ovr: replacementPlayer.overallRating,
            isInjuryReplacement: true,
            injuredPlayerId: injuredId,
          });
        }
        return { ...prev, allStar: { ...prev.allStar, roster: updatedRoster } };
      });
      return;
    }

    if (action.type === 'LOAD_GAME') {
      setState({
        ...initialState,
        ...action.payload,
        isProcessing: false
      });
      return;
    }

    const isClubbing = action.type === 'GO_TO_CLUB';
    const isWatchingGame = action.payload?.isWatchingGame === true;
    setState(prev => ({
      ...prev,
      isProcessing: true,
      isClubbing: isClubbing,
      isWatchingGame: isWatchingGame,
      pendingStartPayload: action.type === 'START_GAME' ? action.payload : prev.pendingStartPayload,
      lastActionType: action.type,
      lastActionPayload: action.payload,
      lastSimResults: [],
      tickerSimResults: [],
      prevTeams: prev.teams,
    }));

    if (isClubbing) {
        setTimeout(() => {
            setState(prev => ({ ...prev, isClubbing: false }));
        }, SettingsManager.getDelay(5000));
    }

    try {
      let newStatePatch: Partial<GameState> = {};

      if (action.type === 'START_GAME') {
        const genId = ++generationIdRef.current;
        setState(prev => ({ ...prev, isProcessing: true, pendingStartPayload: action.payload }));

        const payloadWithProgress = {
          ...action.payload,
          onProgress: (progress: any) => {
            setState(prev => ({ ...prev, lazySimProgress: progress }));
          },
        };

        const newStatePatch = await handleStartGame(payloadWithProgress);

        setState(prev => {
          if (genId === generationIdRef.current) {
            return { ...prev, ...newStatePatch, lazySimProgress: undefined, pendingStartPayload: undefined };
          }
          return prev;
        });
        return;
      } else if (action.type === 'ANNOUNCE_CHANGE') {
        newStatePatch = await handleAnnounceChange(state, action.payload);
      } else if (action.type === 'UPDATE_RULES') {
        const updatedLeagueStats = { ...state.leagueStats, ...action.payload };
        let updatedSchedule = state.schedule;
        // When a media deal is finalized, re-attach broadcasters to all unplayed games
        if (action.payload.mediaRights) {
          const { attachBroadcastersToGames } = await import('../utils/broadcastingUtils');
          updatedSchedule = attachBroadcastersToGames(state.schedule, action.payload.mediaRights, state.teams);
        }
        newStatePatch = {
          leagueStats: updatedLeagueStats,
          schedule: updatedSchedule,
          isProcessing: false
        };
      } else if (action.type === 'SEND_CHAT_MESSAGE') {
        // Handle chat message
        const { chatId, text, imageUrl, targetId, targetName, targetRole, targetOrg, avatarUrl, isHypnotized } = action.payload;
        
        // 1. Add user message immediately
        let newChats = [...stateRef.current.chats];
        let chatIndex = newChats.findIndex(c => c.id === chatId);
        let chat = chatIndex !== -1 ? { ...newChats[chatIndex] } : null;

        if (!chat && targetId) {
          // Check if a chat with this target already exists by participants
          const existingChatIndex = newChats.findIndex(c => 
            c.participants.includes('commissioner') && c.participants.includes(targetId)
          );
          
          if (existingChatIndex !== -1) {
            chat = { ...newChats[existingChatIndex] };
            chatIndex = existingChatIndex;
          }
        }

        if (!chat) {
          // Create new chat
          chat = {
            id: chatId || `chat-${Date.now()}`,
            participants: ['commissioner', targetId],
            participantDetails: [
              { id: 'commissioner', name: stateRef.current.commissionerName, role: 'Commissioner' },
              { id: targetId, name: targetName, role: targetRole, avatarUrl }
            ],
            messages: [],
            unreadCount: 0,
            isTyping: true
          };
          newChats.unshift(chat);
          chatIndex = 0;
        } else {
          chat.isTyping = true;
          chat.messages = chat.messages.map(m => ({ ...m, seen: true })); // Mark previous messages as seen when user replies
          newChats[chatIndex] = chat;
          // Move to top
          newChats.splice(chatIndex, 1);
          newChats.unshift(chat);
          chatIndex = 0;
        }

        const gameDate = new Date(stateRef.current.date);
        const now = new Date();
        gameDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        const timestamp = gameDate.toISOString();

        const userMessage = {
          id: `msg-${Date.now()}`,
          senderId: 'commissioner',
          senderName: stateRef.current.commissionerName,
          text,
          imageUrl,
          timestamp,
          read: true,
          seen: false,
          type: 'text' as const
        };

        chat.messages = [...chat.messages, userMessage];
        // Limit history to 100 messages in state (50 for prompt is handled in llm service)
        if (chat.messages.length > 100) {
          chat.messages = chat.messages.slice(-100);
        }
        chat.lastMessage = userMessage;

        setState(prev => ({ ...prev, chats: newChats, isProcessing: false })); // Update UI immediately

        // 2. Get LLM response asynchronously
        try {
          const responseText = await sendChatMessage(stateRef.current, targetName, targetRole, targetOrg, chat.messages, isHypnotized);

          // If hypnotized, add to pending hypnosis to be processed next day
          if (isHypnotized) {
              const commandText = text.replace('[HYPNOTIC COMMAND]: ', '').trim();
              dispatchAction({
                  type: 'ADD_PENDING_HYPNOSIS',
                  payload: { targetName, command: commandText }
              });
              
              // Set outcome for hypnotize so the user knows it worked
              setState(prev => ({
                  ...prev,
                  lastOutcome: `Hypnotic command transmitted to ${targetName}. They are now under your influence. The effects will manifest as the simulation progresses.`
              }));
          }

          // 3. Add bot message with realistic delay and potential splitting
          if (responseText && responseText.trim().length > 0 && !responseText.toLowerCase().includes("[seen zone]")) {
            // Split by sentences or paragraphs for realism if long
            const parts = responseText.split(/\n\n+/).filter(p => p.trim().length > 0);
            
            for (let i = 0; i < parts.length; i++) {
              // Typing delay based on length
              const part = parts[i];
              const baseDelay = Math.min(3000, Math.max(1000, part.length * 20));
              const delay = SettingsManager.getDelay(baseDelay);
              await new Promise(resolve => setTimeout(resolve, delay));

              setState(prev => {
                const updatedChats = [...prev.chats];
                const updatedChatIndex = updatedChats.findIndex(c => c.id === chat!.id);
                if (updatedChatIndex !== -1) {
                  const updatedChat = { ...updatedChats[updatedChatIndex] };
                  // Only stop typing on the last part
                  if (i === parts.length - 1) {
                    updatedChat.isTyping = false;
                  }
                  
                  const botTimestamp = new Date(timestamp);
                  botTimestamp.setSeconds(botTimestamp.getSeconds() + i + 1);

                  const botMessage = {
                    id: `msg-${Date.now()}-${i}`,
                    senderId: targetId,
                    senderName: targetName,
                    text: part,
                    timestamp: botTimestamp.toISOString(),
                    read: false,
                    seen: false,
                    type: 'text' as const
                  };
                  updatedChat.messages = [...updatedChat.messages, botMessage];
                  updatedChat.lastMessage = botMessage;
                  updatedChat.unreadCount += 1;
                  updatedChats[updatedChatIndex] = updatedChat;
                }
                return { ...prev, chats: updatedChats };
              });
            }
          } else {
            // Seen zone or empty response
            const baseDelay = 1500 + Math.random() * 2000;
            const delay = SettingsManager.getDelay(baseDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            setState(prev => {
              const updatedChats = [...prev.chats];
              const updatedChatIndex = updatedChats.findIndex(c => c.id === chat!.id);
              if (updatedChatIndex !== -1) {
                const updatedChat = { ...updatedChats[updatedChatIndex], isTyping: false };
                // Mark user message as seen
                updatedChat.messages = updatedChat.messages.map(m => 
                  m.senderId === 'commissioner' ? { ...m, seen: true } : m
                );
                updatedChats[updatedChatIndex] = updatedChat;
              }
              return { ...prev, chats: updatedChats };
            });
          }
        } catch (error) {
          console.error("Chat LLM Error:", error);
          setState(prev => {
            const updatedChats = [...prev.chats];
            const updatedChatIndex = updatedChats.findIndex(c => c.id === chat!.id);
            if (updatedChatIndex !== -1) {
              const updatedChat = { ...updatedChats[updatedChatIndex], isTyping: false };
              updatedChats[updatedChatIndex] = updatedChat;
            }
            return { ...prev, chats: updatedChats };
          });
        }
        return;
      } else {
        newStatePatch = await processTurn(stateRef.current, action, (simResults) => {
          setState(prev => ({ ...prev, tickerSimResults: simResults }));
        });
      }

      // Phase 1 (immediate — show modal)
      setState(prev => ({
        ...prev,
        ...newStatePatch,
        stats: newStatePatch.stats || prev.stats,
        leagueStats: newStatePatch.leagueStats || prev.leagueStats,
        lastOutcome: newStatePatch.lastOutcome || prev.lastOutcome,
        lastConsequence: newStatePatch.lastConsequence || prev.lastConsequence,
        date: newStatePatch.date || prev.date,
        day: newStatePatch.day || prev.day,
        teams: newStatePatch.teams || prev.teams,
        players: newStatePatch.players || prev.players,
        schedule: newStatePatch.schedule || prev.schedule,
        lastSimResults: newStatePatch.lastSimResults || [],
        isProcessing: false,
      }));

      // Phase 2 (background — silent patch inbox/news/social)
      setTimeout(() => {
        setState(prev => {
          // Merge new chats with existing — don't overwrite if patch is empty
          const patchChats = newStatePatch.chats;
          const mergedChats = patchChats && patchChats.length > 0
            ? patchChats
            : prev.chats;
          return {
            ...prev,
            inbox: (newStatePatch.inbox ?? []).length > 0 ? newStatePatch.inbox : prev.inbox,
            news: (newStatePatch.news ?? []).length > 0 ? newStatePatch.news : prev.news,
            socialFeed: (newStatePatch.socialFeed ?? []).length > 0
              ? newStatePatch.socialFeed
              : prev.socialFeed,
            chats: mergedChats,
          };
        });
      }, 100);

      // Phase 3 — fire generateLeaguePulse in background
      // Only for ADVANCE_DAY and similar non-action turns
      if (!action || action.type === 'ADVANCE_DAY' || action.type === 'SIMULATE_TO_DATE') {
        const shouldRunPulse = Math.random() < ((newStatePatch as any).daysSimulated > 1 ? 0.90 : 0.60);
        if (shouldRunPulse) {
          import('../services/llm/llm').then(({ generateLeaguePulse }) => {
            generateLeaguePulse(stateRef.current, (newStatePatch as any).lastSimResults || []).then(pulse => {
              if (!pulse || (!pulse.newNews?.length && !pulse.newSocialPosts?.length && !pulse.newEmails?.length)) return;
              setState(prev => {
                const existingPostIds = new Set(prev.socialFeed.map((p: any) => p.id));
                const existingNewsIds = new Set(prev.news.map((n: any) => n.id));
                const existingEmailIds = new Set(prev.inbox.map((e: any) => e.id));
                const newPosts = (pulse.newSocialPosts || [])
                  .filter((p: any) => !existingPostIds.has(p.id))
                  .map((p: any, i: number) => ({ ...p, id: p.id || `pulse-${Date.now()}-${i}`, isNew: true }));
                const newNews = (pulse.newNews || [])
                  .filter((n: any) => !existingNewsIds.has(n.id))
                  .map((n: any, i: number) => ({ ...n, id: n.id || `pulse-news-${Date.now()}-${i}`, isNew: true }));
                const newEmails = (pulse.newEmails || [])
                  .filter((e: any) => !existingEmailIds.has(e.id));
                return {
                  ...prev,
                  socialFeed: [...newPosts, ...prev.socialFeed].slice(0, 500),
                  news: [...newNews, ...prev.news],
                  inbox: [...newEmails, ...prev.inbox],
                };
              });
            }).catch(err => console.warn('[Pulse] Background league pulse failed:', err));
          });
        }
      }
    } catch (error) {
      console.error("Failed to process action:", error);
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        lastOutcome: "An error occurred while processing your action. The simulation glitched." 
      }));
    }
  };
  useEffect(() => {
    if (!state.players || state.players.length === 0) return;
    const sorted = [...state.players]
      .filter(p => p.status === 'Active')
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
    sorted.forEach((player, i) => {
      setTimeout(() => prefetchPlayerBio(player), i * 4000);
    });
  }, [!!state.players?.length]);

  // Lazy-load staff when the browser is idle after game init
  useEffect(() => {
    if (!state.isDataLoaded || state.staff || !state.players?.length || !state.teams?.length) return;

    const load = () => {
      import('../services/staffService').then(({ getStaffData }) => {
        const teamNameMap = new Map(state.teams.map(t => [t.name.toLowerCase(), t]));
        getStaffData(state.players, teamNameMap).then(staff => {
          setState(prev => ({ ...prev, staff }));
        });
      });
    };

    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(load, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(load, 2000);
      return () => clearTimeout(id);
    }
  }, [state.isDataLoaded, !!state.staff]);

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
    <GameContext.Provider value={{
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
      ...actions
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};


