import { Dispatch, MutableRefObject, SetStateAction, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { GameState, NBAPlayer, OffseasonChecklistRow, Tab, UserAction } from '../../types';
import { processTurn, handleStartGame, handleAnnounceChange } from '../logic/gameLogic';
import { migrateAllEuroTeams } from '../../services/tycoon/migrate';
import { getStaffMarketSalary } from '../../services/tycoon/economyScale';
import type { EuroCareerSeed } from '../../services/euro/careerSeed';
import { scaleEuroPlayerContracts } from '../../services/euro/payrollScale';
import { ensureStaffPoolDepth } from '../../services/euro/staffPool';
import { mapSetupTierToTycoonTier } from '../../utils/tierMapping';
import { sendChatMessage } from '../../services/llm/llm';
import { SettingsManager } from '../../services/SettingsManager';
import { initImageCache } from '../../services/imageCache';
import { normalizeDate } from '../../utils/helpers';
import { ensureEuroUserAcademyProspects } from '../../services/externalLeagueSustainer';
import { generateAIBids, isPlausibleActiveMarket } from '../../services/freeAgencyBidding';
import { tickTransferMarket } from '../../services/transfer/transferMarketTicker';
import { isTransferMarketEligibleTid } from '../../services/transfer/marketEligibility';
import { setAssistantGMActive } from '../../services/assistantGMFlag';
import {
  getCurrentOffseasonEffectiveFAStart,
  getCurrentOffseasonFAMoratoriumEnd,
  getTrainingCampDate,
  parseGameDate,
  toISODateString,
} from '../../utils/dateUtils';
import { clearWaiverMarkers } from '../../utils/contractCleanup';
import { resolveAnyTeam } from '../../utils/teamLookup';
import {
  defaultOffseasonChecklist,
  initialEuroOffseasonChecklist,
  initialPbaChecklist,
  initialPbaInterConferenceChecklist,
  initialPbaEndOfSeasonChecklist,
  setRowStatus,
  OFFSEASON_ROW_TAB,
  computeUpcomingSeasonYear,
} from '../../services/offseason/offseasonState';
import { EURO_ISOLATED_DEFAULTS, PBA_ISOLATED_DEFAULTS } from '../../constants';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { isEuroVisibleScheduleGame } from '../../utils/euroLeagueDefaults';
import { generateForCompetition, selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import {
  buildSetupSponsorships,
  EURO_TRANSFER_MARKET_DEFAULTS,
  getClubId,
  getClubLabel,
  loadGameState,
  mergeTycoonStaffMembers,
} from './loadGameState';
import { handleOffseasonDispatchAction } from './offseasonDispatchActions';
import { handleExpansionDispatchAction } from './expansionDispatchActions';
import { handleTransferMarketDispatchAction } from './transferMarketDispatchActions';
import { handleFaBiddingDispatchAction } from './faBiddingDispatchActions';
import { handleDirectDispatchAction } from './directDispatchActions';
import { handleSpecialCareerDispatchAction } from './specialCareerDispatchActions';
import { handleCommunicationDispatchAction } from './communicationDispatchActions';

type SetGameState = Dispatch<SetStateAction<GameState>>;

interface GameActionHelpers {
  clearOutcome: () => void;
  saveSocialThread: (postId: string, replies: any[]) => void;
}

interface UseGameDispatchActionParams {
  state: GameState;
  setState: SetGameState;
  setCurrentView: (view: Tab) => void;
  stateRef: MutableRefObject<GameState>;
  generationIdRef: MutableRefObject<number>;
  actions: GameActionHelpers;
}

export const useGameDispatchAction = ({
  state,
  setState,
  setCurrentView,
  stateRef,
  generationIdRef,
  actions,
}: UseGameDispatchActionParams) => {
  const dispatchAction = useCallback(async (action: UserAction) => {
    const portalBlockedActions = new Set<string>([
      'SIGN_FREE_AGENT',
      'SUBMIT_FA_BID',
      'MATCH_RFA_OFFER',
      'DECLINE_RFA_OFFER',
      'WAIVE_PLAYER',
      'EXECUTIVE_TRADE',
      'FORCE_TRADE',
      'SET_TRAINING_DAILY_PLAN',
      'SET_TRAINING_NORMAL_DEFAULT',
      'SET_PLAYER_DEV_FOCUS',
      'SET_PLAYER_MENTOR',
      'SET_PLAYER_TRAINING_INTENSITY',
      'AUTOFILL_TEAM_TRAINING_CALENDAR',
    ]);
    const portalAllowsUpdateState = action.type === 'UPDATE_STATE'
      && action.payload
      && Object.keys(action.payload as Record<string, unknown>).every(key => key === 'portalTarget');
    if (stateRef.current.portalTarget != null && !portalAllowsUpdateState && portalBlockedActions.has(action.type)) {
      setState(prev => ({ ...prev, lastOutcome: 'Close the Portal to make changes.' }));
      return;
    }

    if (await handleDirectDispatchAction({
      action,
      setState,
      stateRef,
      actions,
    })) {
      return;
    }

    if (await handleOffseasonDispatchAction({
      action,
      setState,
      setCurrentView,
      stateRef,
      dispatchAction,
    })) {
      return;
    }

    if (handleExpansionDispatchAction({ action, setState })) {
      return;
    }

    if (handleTransferMarketDispatchAction({ action, setState, stateRef })) {
      return;
    }

    if (handleFaBiddingDispatchAction({ action, setState, stateRef })) {
      return;
    }

    const isClubbing = action.type === 'GO_TO_CLUB';
    const isWatchingGame = action.payload?.isWatchingGame === true;
    setState(prev => ({
      ...prev,
      isProcessing: true,
      isClubbing,
      isWatchingGame,
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
      const specialCareer = await handleSpecialCareerDispatchAction({
        action,
        state,
        setState,
        stateRef,
        generationIdRef,
        dispatchAction,
      });
      if (specialCareer.handled) {
        if (specialCareer.newStatePatch) {
          newStatePatch = specialCareer.newStatePatch;
        } else {
          return;
        }
      } else {
        const communication = await handleCommunicationDispatchAction({
          action,
          setState,
          stateRef,
          generationIdRef,
          dispatchAction,
        });
        if (communication.handled) {
          if (communication.newStatePatch) {
            newStatePatch = communication.newStatePatch;
          } else {
            return;
          }
        } else {
        const assistantGM = action.payload?.assistantGM === true;
        if (assistantGM) setAssistantGMActive(true);
        try {
          newStatePatch = await processTurn(
            stateRef.current,
            action,
            undefined,
            undefined,
          );
        } finally {
          if (assistantGM) setAssistantGMActive(false);
        }
      }
      }

      if (action?.type === 'WAIVE_PLAYER') {
        const targetId = (action as any).payload?.targetId ?? (action as any).payload?.contacts?.[0]?.id;
        const before = stateRef.current.players.find((p: any) => p.internalId === targetId);
        const after = newStatePatch.players?.find((p: any) => p.internalId === targetId);
        console.log('[GameContext] WAIVE_PLAYER result merge', {
          targetId,
          patchHasPlayers: !!newStatePatch.players,
          patchPlayersCount: newStatePatch.players?.length,
          beforeTid: before?.tid,
          beforeStatus: before?.status,
          afterTid: after?.tid,
          afterStatus: after?.status,
        });
      }

      setState(prev => {
        const merged = {
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
        };
        stateRef.current = merged as any;
        return merged;
      });

      setTimeout(() => {
        setState(prev => {
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

      if (!action || action.type === 'ADVANCE_DAY') {
        const shouldRunPulse = Math.random() < ((newStatePatch as any).daysSimulated > 1 ? 0.90 : 0.60);
        if (shouldRunPulse) {
          import('../../services/llm/llm').then(({ generateLeaguePulse }) => {
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
      console.error('Failed to process action:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        lazySimProgress: undefined,
        lastOutcome: 'An error occurred while processing your action. The simulation glitched.',
      }));
    }
  }, [actions, generationIdRef, setCurrentView, setState, state, stateRef]);

  return dispatchAction;
};
