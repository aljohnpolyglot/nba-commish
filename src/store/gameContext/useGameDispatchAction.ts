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
import { shouldAdvanceAfterAllStarEventDay } from '../../services/allStar/allStarSaturdayCompletion';
import { ensureEuroUserAcademyProspects } from '../../services/externalLeagueSustainer';
import { generateAIBids, isPlausibleActiveMarket } from '../../services/freeAgencyBidding';
import { tickTransferMarket } from '../../services/transfer/transferMarketTicker';
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
import { coerceInsiderPostToEra } from '../../data/social/handles';
import { isTwitterAvailable } from '../../utils/mediaTimeline';
import {
  defaultOffseasonChecklist,
  initialEuroOffseasonChecklist,
  initialPbaChecklist,
  initialPbaInterConferenceChecklist,
  initialPbaEndOfSeasonChecklist,
  setRowStatus,
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
import { handleEuroScoutingDispatchAction } from './euroScoutingDispatchActions';
import { handleSpecialCareerDispatchAction } from './specialCareerDispatchActions';
import { handleCommunicationDispatchAction } from './communicationDispatchActions';
import { validateExecutiveTradeAssets } from '../../services/trade/tradeAssetValidation';
import { getBlockingCommissionerTask } from '../../services/commissionerTasks/taskRegistry';
import { isLotteryBoundaryOwnedByTargetPlan } from '../../services/lifecycle/calendarEventDisposition';
import { getNativeEffectActionLabel, isNativeEffectAction } from '../../services/nativeActionEffects';

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
      'ASSISTANT_RESIGN_EXPIRING_CONTRACTS',
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

    let commissionerBoundaryReached = false;
    if (action.type === 'ADVANCE_DAY' || action.type === 'SIMULATE_TO_DATE') {
      const currentDate = normalizeDate(stateRef.current.date);
      const targetDate = action.type === 'SIMULATE_TO_DATE'
        ? normalizeDate(action.payload.targetDate)
        : (() => {
            const next = new Date(`${currentDate}T00:00:00Z`);
            next.setUTCDate(next.getUTCDate() + 1);
            return next.toISOString().slice(0, 10);
          })();
      const completingAllStarSaturday = action.type === 'ADVANCE_DAY'
        && shouldAdvanceAfterAllStarEventDay(stateRef.current);
      const centralFreeAgencySimulation = action.payload?.freeAgencyDayStart !== undefined;
      const autoResolvingOffseason = action.type === 'SIMULATE_TO_DATE'
        && action.payload?.autoResolveOffseasonTasks === true;
      const blocker = completingAllStarSaturday || centralFreeAgencySimulation || autoResolvingOffseason
        ? null
        : getBlockingCommissionerTask(stateRef.current, targetDate);
      const targetPlanOwnsBlocker = blocker?.taskId === 'draft_lottery'
        && isLotteryBoundaryOwnedByTargetPlan(action.payload?.targetPlan);
      if (blocker && !targetPlanOwnsBlocker) {
        if (blocker.openDate <= currentDate) {
          setCurrentView('Commissioner Tasks');
          return;
        }
        action = {
          type: 'SIMULATE_TO_DATE',
          payload: {
            ...action.payload,
            targetDate: blocker.openDate,
            stopBefore: true,
          },
        };
        commissionerBoundaryReached = true;
      }
    }

    if (action.type === 'EXECUTIVE_TRADE') {
      const assetError = validateExecutiveTradeAssets(stateRef.current, action.payload);
      if (assetError) {
        setState(prev => ({ ...prev, isProcessing: false, lastOutcome: assetError }));
        return;
      }
    }

    if (action.type === 'HYPNOTIZE' && stateRef.current.godModeEnabled !== true) {
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

    if (handleEuroScoutingDispatchAction({ action, setState, stateRef })) {
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
    const processingAction = isNativeEffectAction(action.type)
      ? { type: action.type, label: getNativeEffectActionLabel(action.type, action.payload) }
      : undefined;
    setState(prev => ({
      ...prev,
      isProcessing: true,
      processingAction,
      isClubbing,
      isWatchingGame,
      pendingStartPayload: action.type === 'START_GAME' ? action.payload : prev.pendingStartPayload,
      lastActionType: action.type,
      lastActionPayload: action.payload,
      lastActionEffect: null,
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

      const commitState = () => {
        setState(prev => {
          const merged = {
            ...prev,
            ...newStatePatch,
            stats: newStatePatch.stats || prev.stats,
            leagueStats: newStatePatch.leagueStats || prev.leagueStats,
            lastOutcome: newStatePatch.lastOutcome !== undefined ? newStatePatch.lastOutcome : prev.lastOutcome,
            lastConsequence: newStatePatch.lastConsequence || prev.lastConsequence,
            lastActionEffect: newStatePatch.lastActionEffect !== undefined ? newStatePatch.lastActionEffect : prev.lastActionEffect,
            actionAffinities: newStatePatch.actionAffinities || prev.actionAffinities,
            date: newStatePatch.date || prev.date,
            day: newStatePatch.day || prev.day,
            teams: newStatePatch.teams || prev.teams,
            players: newStatePatch.players || prev.players,
            schedule: newStatePatch.schedule || prev.schedule,
            lastSimResults: newStatePatch.lastSimResults || [],
            isProcessing: false,
            processingAction: undefined,
          };
          stateRef.current = merged as any;
          return merged;
        });
      };
      if (action.type === 'START_GAME') {
        flushSync(commitState);
      } else {
        commitState();
      }
      if (commissionerBoundaryReached) {
        setCurrentView('Commissioner Tasks');
      }

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
                const socialAvailable = isTwitterAvailable(prev.date, prev.leagueStats?.year);
                const newPosts = socialAvailable
                  ? (pulse.newSocialPosts || [])
                    .filter((p: any) => !existingPostIds.has(p.id))
                    .map((p: any, i: number) => ({
                      ...coerceInsiderPostToEra(p, prev.leagueType, prev.date, prev.leagueStats?.year, prev.leagueStats?.uiMode),
                      id: p.id || `pulse-${Date.now()}-${i}`,
                      isNew: true,
                    }))
                  : [];
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
      const message = error instanceof Error ? error.message : 'The simulation could not complete this action.';
      setState(prev => ({
        ...prev,
        isProcessing: false,
        processingAction: undefined,
        lazySimProgress: undefined,
        lastOutcome: action.type === 'START_GAME'
          ? `Could not start the league. ${message}`
          : 'An error occurred while processing your action. The simulation glitched.',
      }));
      if (action.type === 'START_GAME' || action.type === 'LOAD_GAME') throw error;
    }
  }, [actions, generationIdRef, setCurrentView, setState, state, stateRef]);

  return dispatchAction;
};
