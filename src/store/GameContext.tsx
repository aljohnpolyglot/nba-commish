import React, { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { GameState, UserAction, Tab, Bet, BetLeg } from '../types';
import { processTurn, handleStartGame, handleAnnounceChange } from './logic/gameLogic';
import { useGameActions } from './useGameActions';
import { initialState } from './initialState';
import { sendChatMessage } from '../services/llm/llm';
import { prefetchPlayerBio } from '../components/central/view/bioCache';
import { SettingsManager } from '../services/SettingsManager';
import { initImageCache } from '../services/imageCache';
import { normalizeDate } from '../utils/helpers';
import { setActiveSaveId } from './gameplanStore';
import { setActiveSaveId as setTradingBlockSaveId } from './tradingBlockStore';
import { setActiveSaveId as setScoringOptionsSaveId } from './scoringOptionsStore';
import { setActiveSaveId as setCoachStrategySaveId } from './coachStrategyLockStore';
import { setActiveSaveId as setIdealRotationSaveId } from './idealRotationStore';

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

  useEffect(() => {
    setActiveSaveId(state.saveId);
    setTradingBlockSaveId(state.saveId);
    setScoringOptionsSaveId(state.saveId);
    setCoachStrategySaveId(state.saveId);
    setIdealRotationSaveId(state.saveId);
  }, [state.saveId]);

  // Set default view for GM mode when game first loads
  useEffect(() => {
    if (state.isDataLoaded && state.gameMode === 'gm' && currentView === 'Schedule') {
      setCurrentView('Team Office');
    }
  }, [state.isDataLoaded, state.gameMode]);

const actions = useGameActions(setState, () => stateRef.current);

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
        // NOTE: wins/losses are NOT updated here — ADVANCE_DAY handles that via the watchedGameResult
        // injection in simulateGames to avoid double-counting (RECORD_WATCHED_GAME + ADVANCE_DAY race).
        return { ...prev, schedule: newSchedule, boxScores: newBoxScores };
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
      const loaded = action.payload as any;
      // Portrait migration: external league players whose imgURL came from bio gists
      // (non-ProBallers URLs) get cleared so they show initials rather than wrong headshots.
      // The externalRosterService now correctly prefers item.imgURL (ProBallers) over bio.image,
      // but existing saves may still have bio.image stored. Clear them here.
      const EXTERNAL_STATUSES_SET = new Set(['WNBA','Euroleague','PBA','B-League','G-League','Endesa','China CBA','NBL Australia']);
      // Clear bad portrait URLs: only the ProBallers default "no photo" placeholder (head-par-defaut)
      // and NBA CDN headshots on external-league players (those are passport-style shots of wrong player).
      // Do NOT clear other URLs — external gists store legit portrait URLs (basketball-ref, ESPN, etc.)
      const isBadPortrait = (p: any) => {
        if (!p.imgURL) return false;
        if (p.imgURL.includes('head-par-defaut')) return true; // ProBallers default placeholder
        // NBA CDN headshots on external players = wrong person's passport photo
        if (EXTERNAL_STATUSES_SET.has(p.status ?? '') && p.imgURL.includes('cdn.nba.com/headshots')) return true;
        return false;
      };
      // Contract amount sync: update contract.amount from contractYears[] for the current season.
      // Without this, saved games always use the year the save was first created (e.g. $13.9M rookie opt
      // for Cade Cunningham in year 1, even after he signs a max extension for $46M+ in year 2+).
      const currentSeasonYear: number = loaded.leagueStats?.year ?? new Date().getFullYear();
      const currentSeasonStr = `${currentSeasonYear - 1}-${String(currentSeasonYear).slice(-2)}`;

      // Contract.amount is stored in BBGM thousands — even the richest max
      // contract tops out near 80,000 (= $80M). Anything above 250,000 (= $250M)
      // is garbage. The user reported Season-2 payrolls in the trillions per
      // team, which means some flow leaked a USD or inflated value into the
      // thousands slot. We don't know the upstream source yet, but we can
      // repair the save on LOAD_GAME: prefer contractYears[currentSeason]
      // (the source of truth), fall back to the closest season with a sane
      // guaranteed value, else clamp to a plausible max.
      const SANE_CONTRACT_CAP_THOUSANDS = 250_000; // $250M
      const SANE_GUARANTEED_CAP_USD     = 250_000_000; // $250M

      const recoverAmountFromContractYears = (p: any): number | undefined => {
        const cy = p.contractYears as Array<{ season: string; guaranteed: number }> | undefined;
        if (!Array.isArray(cy) || cy.length === 0) return undefined;
        // Exact current-season match first.
        const exact = cy.find(e => e.season === currentSeasonStr);
        const candidates: number[] = [];
        if (exact && exact.guaranteed > 0 && exact.guaranteed <= SANE_GUARANTEED_CAP_USD) {
          candidates.push(Math.round(exact.guaranteed / 1000));
        }
        // Any other season entry whose USD value looks sane (back-up path if the
        // exact-season entry itself is corrupt — grab the first reasonable one).
        for (const e of cy) {
          if (e === exact) continue;
          if (e.guaranteed > 0 && e.guaranteed <= SANE_GUARANTEED_CAP_USD) {
            candidates.push(Math.round(e.guaranteed / 1000));
          }
        }
        return candidates.find(v => v > 0 && v <= SANE_CONTRACT_CAP_THOUSANDS);
      };

      const migratedPlayers = (loaded.players as any[] | undefined)?.map(p => {
        let updated = isBadPortrait(p) ? { ...p, imgURL: undefined } : p;
        // Sync contract.amount to current season from contractYears[] if available.
        // Guard against corrupt guaranteed values — only apply the sync if the
        // result falls in a sane range.
        if (updated.contract && Array.isArray(updated.contractYears)) {
          const entry = updated.contractYears.find((cy: any) => cy.season === currentSeasonStr);
          if (entry && entry.guaranteed > 0 && entry.guaranteed <= SANE_GUARANTEED_CAP_USD) {
            const syncedAmount = Math.round(entry.guaranteed / 1000);
            if (syncedAmount > 0 && syncedAmount <= SANE_CONTRACT_CAP_THOUSANDS && syncedAmount !== updated.contract.amount) {
              updated = { ...updated, contract: { ...updated.contract, amount: syncedAmount } };
            }
          }
        }
        // Repair corrupt contract.amount — see comment above. Kicks in when a
        // prior session left the value in USD-like units, producing $16.7T
        // payrolls. Try contractYears first; if no sane source, fall back to
        // the league min ($1.3M = 1300 thousand).
        const amt = updated.contract?.amount;
        if (updated.contract && typeof amt === 'number' && (amt > SANE_CONTRACT_CAP_THOUSANDS || amt < 0 || !Number.isFinite(amt))) {
          const recovered = recoverAmountFromContractYears(updated) ?? 1300;
          console.warn(`[LOAD_GAME] Repaired corrupt contract.amount for ${updated.name}: ${amt} → ${recovered}`);
          updated = { ...updated, contract: { ...updated.contract, amount: recovered } };
        }
        // First-season two-way detection: BBGM data doesn't set twoWay:true, but two-way players
        // have ~$625K salary (< $800K threshold for grace). Mark them so roster-trim excludes them.
        if (!updated.twoWay && updated.tid >= 0 && (updated.contract?.amount ?? 0) > 0 && (updated.contract?.amount ?? 9999) < 800) {
          updated = { ...updated, twoWay: true };
        }
        // Repair off-by-one teamOptionExp for sim-generated draft picks.
        // Old formula: teamOptionExp = draftYear + guaranteedYrs  → fires 1 yr too early.
        // Correct:     teamOptionExp = draftYear + guaranteedYrs + 1 (after all guaranteed years).
        // exp had the same -1 error: old = draftYear + totalYrs - 1, correct = draftYear + totalYrs.
        // Only applies when hasTeamOption is still set (option not yet exercised/declined).
        if (updated.contract?.hasTeamOption && updated.draft?.year) {
          const draftYear: number = Number(updated.draft.year);
          const guaranteedYrs: number = loaded.leagueStats?.rookieContractLength ?? 2;
          if (updated.contract.teamOptionExp === draftYear + guaranteedYrs) {
            updated = {
              ...updated,
              contract: {
                ...updated.contract,
                teamOptionExp: draftYear + guaranteedYrs + 1,
                exp: (updated.contract.exp ?? 0) + 1,
              },
            };
          }
        }
        return updated;
      }) ?? loaded.players;

      const finalPlayers = migratedPlayers ?? loaded.players;
      setState({
        ...initialState,
        ...loaded,
        ...(migratedPlayers ? { players: migratedPlayers } : {}),
        isProcessing: false
      });

      // Kick off background image caching if enabled
      if (SettingsManager.getSettings().enableImageCache && finalPlayers) {
        initImageCache(finalPlayers).catch(() => {});
      }
      return;
    }
    if (action.type === 'UPDATE_STATE') {
      setState(prev => ({ ...prev, ...action.payload }));
      return;
    }

    if (action.type === 'SUBMIT_FA_BID') {
      // User enters the competitive FA market instead of signing instantly.
      // Creates a market if none exists, replaces any prior user bid on the
      // same player (only one active user bid at a time), and lets the daily
      // market ticker resolve at decidesOnDay. Does NOT mutate the player —
      // resolution is the only path that applies the contract.
      const { playerId, playerName, teamId, teamName, teamLogoUrl, salaryUSD, years, option } = action.payload as {
        playerId: string;
        playerName: string;
        teamId: number;
        teamName: string;
        teamLogoUrl?: string;
        salaryUSD: number;
        years: number;
        option: 'NONE' | 'PLAYER' | 'TEAM';
      };
      setState(prev => {
        const currentDay = prev.day ?? 0;
        const markets = prev.faBidding?.markets ? [...prev.faBidding.markets] : [];
        const newUserBid = {
          id: `user-bid-${playerId}-${teamId}-${Date.now()}`,
          playerId,
          teamId,
          teamName,
          teamLogoUrl,
          salaryUSD,
          years,
          option,
          isUserBid: true,
          submittedDay: currentDay,
          // Stay active until the market's decision day; if market doesn't exist
          // yet we'll seed a 4-day window.
          expiresDay: currentDay + 4,
          status: 'active' as const,
        };
        const existingIdx = markets.findIndex(m => m.playerId === playerId && !m.resolved);
        if (existingIdx >= 0) {
          const existing = markets[existingIdx];
          const withoutPrior = existing.bids.filter(b => !b.isUserBid);
          markets[existingIdx] = {
            ...existing,
            bids: [...withoutPrior, { ...newUserBid, expiresDay: existing.decidesOnDay }],
          };
        } else {
          markets.push({
            playerId,
            playerName,
            bids: [newUserBid],
            decidesOnDay: currentDay + 4,
            resolved: false,
          });
        }
        return { ...prev, faBidding: { markets } };
      });
      return;
    }

    // ── Social-only actions — pure state patches, never run the simulation ──
    if (action.type === 'CACHE_PROFILE') {
      const { handle, profile } = (action as any).payload;
      setState(prev => ({
        ...prev,
        cachedProfiles: { ...(prev.cachedProfiles || {}), [handle.replace('@', '')]: profile },
      }));
      return;
    }
    if (action.type === 'TOGGLE_LIKE') {
      const id = (action as any).payload;
      setState(prev => ({
        ...prev,
        socialFeed: prev.socialFeed.map((p: any) =>
          p.id === id ? { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 } : p
        ),
      }));
      return;
    }
    if (action.type === 'TOGGLE_RETWEET') {
      const id = (action as any).payload;
      setState(prev => ({
        ...prev,
        socialFeed: prev.socialFeed.map((p: any) =>
          p.id === id ? { ...p, isRetweeted: !p.isRetweeted, retweets: p.isRetweeted ? p.retweets - 1 : p.retweets + 1 } : p
        ),
      }));
      return;
    }
    if (action.type === 'ADD_POST') {
      setState(prev => ({ ...prev, socialFeed: [(action as any).payload, ...prev.socialFeed] }));
      return;
    }
    if (action.type === 'ADD_REPLY' || action.type === 'ADD_REPLIES') {
      const { replies, reply } = (action as any).payload;
      const newPosts: any[] = replies ?? (reply ? [reply] : []);
      if (newPosts.length > 0) {
        setState(prev => {
          const existingIds = new Set(prev.socialFeed.map((p: any) => p.id));
          const unique = newPosts.filter((p: any) => !existingIds.has(p.id));
          return unique.length > 0 ? { ...prev, socialFeed: [...prev.socialFeed, ...unique] } : prev;
        });
      }
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
      simCurrentDate: undefined,
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
          const responseText = await sendChatMessage(stateRef.current, targetName, targetRole, targetOrg, chat.messages, isHypnotized, targetId);

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
      } else if (action.type === 'SIMULATE_TO_DATE') {
        // ── UNIFIED: ALL simulate-to-date goes through runLazySim ──
        // Always overlay mode — shows the progress screen (phase labels, %).
        // Short skips (≤30d) use batch=1 for precise event ordering.
        // Long skips (>30d) use batch=7 for speed.
        const targetNorm = normalizeDate(action.payload.targetDate);
        const currentNorm = normalizeDate(stateRef.current.date);
        const diffDays = Math.round(
          (new Date(`${targetNorm}T00:00:00Z`).getTime() - new Date(`${currentNorm}T00:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24)
        );
        console.log('[SIM_TO_DATE] ▶️ dispatched', {
          rawTargetDate: action.payload.targetDate,
          targetNorm,
          currentStateDate: stateRef.current.date,
          currentNorm,
          diffDays,
          stateDay: stateRef.current.day,
        });
        const genId = ++generationIdRef.current;
        // Short sims (≤30 days, e.g. playoff round) use silent mode to avoid
        // the full-screen lazy-sim overlay that looks like the jumpstart screen.
        const simMode = diffDays > 30 ? 'overlay' : 'silent';
        const stopBefore = action.payload?.stopBefore === true;
        console.log('[SIM_TO_DATE] ⚙️ runLazySim options', {
          simMode,
          batchSize: diffDays > 30 ? 7 : 1,
          stopBefore,
        });
        // Overlay mode: pre-seed lazySimProgress BEFORE the dynamic import so the
        // full-screen progress ring renders immediately — no "Processing Executive
        // Order" flash while the chunk loads.
        if (simMode === 'overlay') {
          flushSync(() => setState(prev => ({
            ...prev,
            lazySimProgress: {
              currentDate: currentNorm,
              targetDate: targetNorm,
              daysComplete: 0,
              daysTotal: diffDays,
              currentPhase: 'Warming up simulation...',
              percentComplete: 0,
            },
          })));
        }
        const { runLazySim } = await import('../services/logic/lazySimRunner');
        const result = await runLazySim(
          stateRef.current,
          action.payload.targetDate,
          (progress: any) => {
            if (simMode === 'overlay') {
              setState(prev => ({ ...prev, lazySimProgress: progress }));
            } else {
              // Silent mode fallback: keep the date current on no-games days.
              // On game days, onGame takes over with finer-grained per-game updates.
              setState(prev =>
                prev.simCurrentDate === progress.currentDate ? prev : { ...prev, simCurrentDate: progress.currentDate }
              );
            }
          },
          {
            mode: simMode,
            batchSize: diffDays > 30 ? 7 : 1,
            stopBefore,
            // Silent mode: fire per-game so simCurrentDate "dances" with games as they
            // finish. flushSync defeats React 18 batching so each game's date paints
            // before the next game's sync sim call. Normalize to YYYY-MM-DD to stay
            // in lockstep with the progress-callback format.
            onGame: simMode === 'silent' ? (gameResult: any) => {
              const raw = gameResult?.date;
              if (!raw) return;
              const d = normalizeDate(raw);
              flushSync(() => {
                setState(prev => (prev.simCurrentDate === d ? prev : { ...prev, simCurrentDate: d }));
              });
            } : undefined,
          }
        );
        console.log('[SIM_TO_DATE] ✅ runLazySim returned', {
          endStateDate: result.state.date,
          endStateDay: result.state.day,
          endNorm: normalizeDate(result.state.date),
          lastSimResultsCount: result.lastSimResults.length,
          lastSimResultsDates: [...new Set(result.lastSimResults.map((r: any) => r.date))],
        });
        setState(prev => {
          if (genId !== generationIdRef.current) {
            console.log('[SIM_TO_DATE] ⚠️ genId mismatch — discarding result', { genId, current: generationIdRef.current });
            return prev;
          }
          return {
            ...prev,
            ...result.state,
            lazySimProgress: undefined,
            simCurrentDate: undefined,
            isProcessing: false,
            lastSimResults: result.lastSimResults.length > 0 ? result.lastSimResults : prev.lastSimResults,
          };
        });
        return;
      } else {
        newStatePatch = await processTurn(
          stateRef.current,
          action,
          undefined,
          undefined,
        );
      }

      // Phase 1 (immediate — show modal)
      setState(prev => ({
        ...prev,
        ...newStatePatch,
        stats: newStatePatch.stats || prev.stats,
        leagueStats: newStatePatch.leagueStats || prev.leagueStats,
        lastOutcome: newStatePatch.lastOutcome !== undefined ? newStatePatch.lastOutcome : prev.lastOutcome,
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
              inbox: (newStatePatch.inbox ?? []).length > 0 ? newStatePatch.inbox! : prev.inbox,
              news: (newStatePatch.news ?? []).length > 0 ? newStatePatch.news! : prev.news,
              socialFeed: (newStatePatch.socialFeed ?? []).length > 0
                ? newStatePatch.socialFeed!
                : prev.socialFeed,
              chats: mergedChats,
            };
          });
        }, 100);

      // Phase 3 — fire generateLeaguePulse in background
      // Only for ADVANCE_DAY and similar non-action turns
      if (!action || action.type === 'ADVANCE_DAY') {
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
        lazySimProgress: undefined,
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
      Promise.all([
        import('../services/staffService'),
        import('../data/photos/coaches'),
      ]).then(([staffMod, coachesMod]) => {
        const teamNameMap = new Map(state.teams.map(t => [t.name.toLowerCase(), t]));
        Promise.all([
          staffMod.getStaffData(state.players, teamNameMap),
          coachesMod.fetchCoachData(),
        ]).then(([staff]) => {
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


