import { GameState, LazySimProgress } from '../../types';
import { runSimulation } from '../../store/logic/turn/simulationHandler';
import { generatePaychecks, getPaycheckContext } from './financialService';
import { SettingsManager } from '../SettingsManager';
import { normalizeDate } from '../../utils/helpers';
import { getDraftLotteryDate, getRolloverDate, getTradeDeadlineDate, getTrainingCampDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString } from '../../utils/dateUtils';
import { applySeasonRollover } from './seasonRollover';
import {
  isCanonicalDraftComplete,
  resolveLeagueSeasonLifecycle,
} from '../lifecycle/leagueSeasonLifecycle';
import { finalizeChampionTransition } from '../lifecycle/finalizeChampionTransition';
import { indexDueNativeAnnouncements } from '../news/nativeLeagueAnnouncements';
import { applyEuroTycoonDailyOps } from '../tycoon/euroTycoonOps';
import { getOffseasonDayPlan, logPlanEvent } from '../offseason/offseasonPlan';
import {
  autoResolveAllStarHosts,
  buildHistoricalAllStarHostsByYear,
  buildHistoricalAllStarHostYears,
} from '../allStar/hostAutoResolver';
import {
  isAssistantGMDraftEventAuthorized,
  setAssistantGMActive,
  shouldPauseForManualDraftEvent,
} from '../assistantGMFlag';
import {
  applyDraftLotteryCalendarEvent,
  isLotteryBoundaryOwnedByTargetPlan,
  resolveCalendarEventDisposition,
} from '../lifecycle/calendarEventDisposition';
import { logPbaLazySimAudit, shouldLogPbaLazySimCheckpoint } from '../../utils/pbaLazySimDebug';
import { applyPbaConferenceLifecycle, repairPbaConferenceForDate } from '../pba/conferenceTransition';
import {
  advanceDateByOne,
  autoResolveEuroSetupOffseasonTasks,
  autoResolvePbaSetupOffseasonTasks,
  buildAutoResolveEvents,
  daysBetween,
  getPhaseLabel,
  hasDueUnplayedEuroCompetitionGames,
  hasDueUnplayedPbaCompetitionGames,
  repairEuroCompetitionScheduleForToday,
} from './lazySimRunnerHelpers';
import { buildLazySimPlayoffOutcomes } from './lazySimRunnerPlayoffAwards';
import { finalizeHistoricalNbaSeason } from '../historicalNbaSeasonFinalizer';
import { recordSimulationPerf } from '../simulation/simulationPerfDebug';
import { completeInternationalTournamentTask } from '../fiba/tournamentTask';
import { fetchAllStarHistory } from '../../data/allStarHistoryFetcher';
import { isHistoricalNbaWhatIfTimeline, timelineInputFromState } from '../../utils/historicalTimeline';
import { tick as tickTycoonEvents } from '../tycoon/eventChecker';
import { getAllStarWeekendDates } from '../allStar/allStarWeekendDates';
import { getAllStarWeekendCompletion } from '../allStar/allStarCompletion';
import { prepareAllStarWeekendForWatch } from '../allStar/allStarWeekendEvents';
import {
  getPbaAllStarFirstEventDate,
  getPbaAllStarLastEventDate,
  isPbaAllStarWeekendPending,
} from '../pba/allStar';
import { getBlockingCommissionerTask } from '../commissionerTasks/taskRegistry';
import { resolveCommissionerTask } from '../commissionerTasks/taskResolution';
import {
  createLongSimYieldBudget,
  yieldLongSimIfDue,
} from '../simulation/longSimCoordinator';
import { autoResolveDueDeathMemorials } from '../playerDevelopment/deathMemorial';
import { appendMediaProjectInboxForRange } from '../mediaProjects';
import {
  evaluateTargetPlan,
  resolveSimulationProgressPresentation,
  type SimulationBoundaryKind,
  type TargetPlan,
} from '../simulation/targetPlanner';
import { materializePlayoffBracket } from '../playoffs/materializePlayoffBracket';
import { isPlayoffCompletionProvable } from '../playoffs/playoffCompletion';
import {
  detectPostseasonRegularSeasonConflict,
  type PostseasonRegularSeasonConflict,
} from '../lifecycle/postseasonRegularSeasonConflict';
import {
  appendMediaFacts,
  buildAutoEventMediaFact,
  buildSimulationMediaFacts,
} from '../media/mediaFacts';
import { calculateBulkDailyStats } from '../simulation/bulkDailyStats';
import {
  resolveLongSimulationExecutionProfile,
  type SimulationExecutionProfile,
} from '../simulation/executionProfile';
import {
  beginGameSimulationWorkerSession,
  endGameSimulationWorkerSession,
} from '../simulation/GameSimulationWorkerPool';
import { SocialEngine } from '../social/SocialEngine';
import { generateLazySimNews } from '../news/lazySimNewsGenerator';
import { getActiveLeagueTeams } from '../../utils/teamLookup';
import { isTwitterAvailable } from '../../utils/mediaTimeline';
export { buildAutoResolveEvents } from './lazySimRunnerHelpers';

const mergePresentationRows = <T extends { id: string; date: string }>(
  rows: T[],
  limit: number,
): T[] => {
  const byId = new Map<string, T>();
  for (const row of rows) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, limit);
};

export interface LazySimOptions {
  /** 'overlay' = show progress UI (long skips, load game). 'silent' = no UI, collect lastSimResults (short skips). */
  mode?: 'overlay' | 'silent';
  /** Days per batch. Default 14 for overlay, 1 for silent. */
  batchSize?: number;
  /** Persistent same-day browser worker placement. Unsupported browsers fall back serially. */
  gameWorkerPool?: boolean;
  gameWorkerPoolSize?: number;
  gameWorkerThreshold?: number;
  /** If true, stop AT target date without simulating target day's games.
   *  Use for "Sim to Date" from ScheduleView where the user wants to land on that date
   *  and decide whether to watch/sim those games manually.
   *  Default false — target day is simmed (needed for Sim Round / Sim Playoffs). */
  stopBefore?: boolean;
  /** If true, AI handles the user's team for all transactions during this lazy sim
   *  (re-signings, FA signings, waivings, trades, extensions, two-way promotions).
   *  Clears automatically when the sim completes. Default false. */
  assistantGM?: boolean;
  /** Auto-complete due commissioner and mode-specific offseason tasks as their date windows pass. */
  autoResolveOffseasonTasks?: boolean;
  /** Preserve a replayable summary for the Euro transfer-market day advanced by this run. */
  transferMarketDailySummary?: boolean;
  /** Called after each individual game result during silent-mode short sims.
   *  Use with flushSync in GameContext to stream results to the ticker in real-time. */
  onGame?: (result: any) => void;
  onCheckpoint?: (state: GameState, progress: LazySimProgress) => void;
  /** Non-committed liveness signal. Date, records and percent remain pinned to
   *  the last atomic checkpoint while expensive canonical work is running. */
  onHeartbeat?: (progress: LazySimProgress) => void;
  /** Immutable user intent compiled before the runner starts. */
  targetPlan?: TargetPlan;
  /** Saved/compiled execution policy. Long targets default to Bulk + On-Demand Media. */
  executionProfile?: Partial<SimulationExecutionProfile>;
  /** Maximum main-thread work interval between cooperative browser yields. */
  yieldBudgetMs?: number;
  /** Opt-in synchronous diagnostic hook. It observes the live simulation state
   *  without cloning or committing it and must never mutate the supplied data. */
  onDayTrace?: (trace: LazySimDayTrace) => void;
}

export interface LazySimDayTrace {
  phase: 'before-games' | 'after-day';
  date: string;
  state: Readonly<GameState>;
  results: readonly any[];
}

export interface LazySimNonProgressDiagnostic {
  currentDate: string;
  targetDate: string;
  currentLifecyclePhase: string;
  nextScheduledEvent: string | null;
  unresolvedTaskOrBlocker: string | null;
  targetPlan: TargetPlan | null;
  lastTransitionAttempted: string | null;
  lifecycleIntegrity?: PostseasonRegularSeasonConflict;
}

export interface LazySimResult {
  state: GameState;
  /** Box scores from the LAST batch — used by silent mode so GameContext can show game results modal. */
  lastSimResults: any[];
  status: 'progressed' | 'arrived' | 'blocked' | 'failed';
  boundaryStop?: { kind: SimulationBoundaryKind; date: string };
  blocker?: string;
  nonProgressDiagnostic?: LazySimNonProgressDiagnostic;
}

const perfNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const perfMs = (start: number) => Math.round((perfNow() - start) * 10) / 10;

const logLazySim = (...args: unknown[]) => {
  if ((globalThis as any).__lazySimTrace) console.log(...args);
};

const PBA_ALL_STAR_EVENT_KEYS = new Set([
  'allstar_votes',
  'allstar_reserves',
  'dunk_contestants',
  'threepoint_contestants',
  'skills_challenge_contestants',
  'allstar_weekend',
]);

const DRAFT_RUNTIME_EVENT_TYPES = {
  draft_lottery: 'lottery',
  draft_order_review: 'draftOrderReview',
  draft_execute: 'draft',
  rookie_contracts: 'rookieContracts',
} as const;

const DRAFT_RUNTIME_EVENT_KEYS = new Set(Object.keys(DRAFT_RUNTIME_EVENT_TYPES));

const autoResolveDueCommissionerTasks = async (
  initialState: GameState,
  targetDate: string,
  enabled: boolean,
  targetPlan?: TargetPlan,
): Promise<GameState> => {
  if (!enabled) return initialState;
  let state = initialState;
  for (let guard = 0; guard < 64; guard += 1) {
    const blocker = getBlockingCommissionerTask(state, targetDate);
    if (!blocker || blocker.openDate > normalizeDate(state.date)) return state;
    if (blocker.taskId === 'draft_lottery' && isLotteryBoundaryOwnedByTargetPlan(targetPlan)) {
      const disposition = resolveCalendarEventDisposition(state, {
        eventKey: 'draft_lottery',
        eventDate: blocker.openDate,
        targetPlan,
        commandType: targetPlan?.name ?? 'LAZY_SIM',
      });
      if (disposition === 'TARGET_BOUNDARY' || disposition === 'MANUAL_BLOCKER') return state;
    }
    const patch = await resolveCommissionerTask(state, blocker.taskId, {
      mode: 'auto',
      targetPlan,
      commandType: targetPlan?.name ?? 'LAZY_SIM',
      deferPresentation: true,
    });
    state = { ...state, ...patch };
    const unresolved = getBlockingCommissionerTask(state, targetDate);
    if (unresolved?.key === blocker.key && unresolved.openDate <= normalizeDate(state.date)) {
      throw new Error(`Commissioner task ${blocker.key} could not be completed automatically.`);
    }
  }
  throw new Error('Commissioner task automation exceeded its safety limit.');
};

export const runLazySim = async (
  initialState: GameState,
  targetDateStr: string,
  onProgress?: (progress: LazySimProgress) => void,
  options?: LazySimOptions,
): Promise<LazySimResult> => {
  const runLazySimStart = perfNow();
  const mode = options?.mode ?? 'overlay';
  const defaultBatch = mode === 'silent' ? 1 : 14;
  const BATCH_SIZE = options?.batchSize ?? defaultBatch;
  const stopBefore = options?.stopBefore ?? false;
  const assistantGM = options?.assistantGM ?? false;
  const yieldBudget = createLongSimYieldBudget(options?.yieldBudgetMs);

  const targetNorm = normalizeDate(targetDateStr);
  const startNorm = normalizeDate(initialState.date);
  const daysTotal = daysBetween(startNorm, targetNorm);

  const lifecycleConflict = detectPostseasonRegularSeasonConflict(initialState);
  if (lifecycleConflict) {
    return {
      state: initialState,
      lastSimResults: [],
      status: 'blocked',
      blocker: lifecycleConflict.code,
      nonProgressDiagnostic: {
        currentDate: startNorm,
        targetDate: targetNorm,
        currentLifecyclePhase: resolveLeagueSeasonLifecycle(initialState).currentPhase,
        nextScheduledEvent: null,
        unresolvedTaskOrBlocker: lifecycleConflict.code,
        targetPlan: options?.targetPlan ?? null,
        lastTransitionAttempted: null,
        lifecycleIntegrity: lifecycleConflict,
      },
    };
  }

  setAssistantGMActive(assistantGM);

  logLazySim('[LAZY_SIM] start', {
    rawTargetDate: targetDateStr,
    targetNorm,
    rawStartDate: initialState.date,
    startNorm,
    daysTotal,
    mode,
    BATCH_SIZE,
  });
  logPbaLazySimAudit(initialState, 'start');

  if (daysTotal < 0) {
    logLazySim('[LAZY_SIM] daysTotal < 0 - returning initial state');
    return {
      state: initialState,
      lastSimResults: [],
      status: 'failed',
      nonProgressDiagnostic: {
        currentDate: startNorm,
        targetDate: targetNorm,
        currentLifecyclePhase: resolveLeagueSeasonLifecycle(initialState).currentPhase,
        nextScheduledEvent: null,
        unresolvedTaskOrBlocker: 'target_before_current_date',
        targetPlan: options?.targetPlan ?? null,
        lastTransitionAttempted: null,
      },
    };
  }

  const originalSettings = SettingsManager.getSettings();
  SettingsManager.saveSettings({ ...originalSettings, enableLLM: false, gameSpeed: 10 });
  beginGameSimulationWorkerSession();
  const restoreOnUnload = () => SettingsManager.saveSettings(originalSettings);
  window.addEventListener('beforeunload', restoreOnUnload);

  let state = { ...initialState };
  let lastDailyProgressionDate = normalizeDate(
    state.simulationLastDailyProgressionDate ?? startNorm,
  );
  const activeInternational = state.internationalTournament;
  const trainingCampDate = toISODateString(getTrainingCampDate(state.leagueStats.year, state.leagueStats));
  if (activeInternational && !activeInternational.readOnly && !activeInternational.reviewed && activeInternational.status !== 'reviewed' && targetNorm >= trainingCampDate) {
    state = completeInternationalTournamentTask(state, { simulateRemaining: true });
  }
  let lastBatchSimResults: any[] = []; // Track last batch for silent mode
  const firedEvents = new Set<string>();
  const executionProfile = resolveLongSimulationExecutionProfile(
    state.leagueStats.simulationEnginePolicy ?? SettingsManager.getSettings().simulatorMode ?? 'hybrid',
    options?.executionProfile,
  );

  const initialPresentation = resolveSimulationProgressPresentation(options?.targetPlan, null, state);
  onProgress?.({
    currentDate: normalizeDate(state.date),
    targetDate: targetNorm,
    daysComplete: 0,
    daysTotal,
    currentPhase: 'Preparing schedule and events...',
    percentComplete: 0,
    targetName: options?.targetPlan?.name,
    targetSemanticName: initialPresentation.targetLabel,
    nextCheckpointLabel: initialPresentation.nextCheckpointLabel,
    nextCheckpointRequiresAction: initialPresentation.nextCheckpointRequiresAction,
    finalStopDate: options?.targetPlan?.finalStopDate,
  });
  await yieldLongSimIfDue(yieldBudget, { force: true, reason: 'prepare' });

  {
    const eagerSeasonYear = state.leagueStats.year;
    const eagerKeys = ['broadcasting_default', 'global_games', 'intl_preseason', 'schedule_generation'];
    const hasRegularSeason = state.schedule.some(
      (g: any) => !g.isPreseason && !g.isPlayoff && !g.isPlayIn
    );
    if (!hasRegularSeason) {
      for (const event of buildAutoResolveEvents(eagerSeasonYear, state.leagueStats, state.gameMode)) {
        if (!eagerKeys.includes(event.key)) continue;
        if (event.date >= targetNorm) continue; // target is before this event
        const compositeKey = `${eagerSeasonYear}:${event.key}`;
        if (firedEvents.has(compositeKey)) continue;
        try {
          const eventResolverStart = perfNow();
          const patch = await event.resolver(state);
          if (patch && Object.keys(patch).length > 0) {
            state = { ...state, ...patch };
          }
          recordSimulationPerf({
            engine: 'calendar-event-fired',
            stage: 'eager',
            eventKey: event.key,
            eventDate: event.date,
            mutated: !!patch && Object.keys(patch).length > 0,
            resolverMs: perfMs(eventResolverStart),
          });
        } catch (err) {
          console.warn(`[lazySim eager] ${event.key} failed:`, err);
        }
        firedEvents.add(compositeKey);
      }
    }
  }
  let daysComplete = 0;
  let currentPhase = 'Starting...';
  let lastProgressKey = '';
  let manualBlocker: string | null = null;
  let boundaryStop: LazySimResult['boundaryStop'];
  let lastTransitionAttempted: string | null = null;

  const boundaryFallsWithinPlan = (date: string): boolean => {
    const plan = options?.targetPlan;
    if (!plan || date < plan.startDate) return false;
    return plan.stopMode === 'through' ? date <= targetNorm : date < targetNorm;
  };

  const tradeDeadlineBoundaryForState = (): string | null => {
    if (options?.targetPlan?.boundaryPolicy?.tradeDeadline !== 'STOP') return null;
    if (state.leagueStats.tradeDeadlineEnabled === false) return null;
    const date = toISODateString(getTradeDeadlineDate(state.leagueStats.year, state.leagueStats));
    return boundaryFallsWithinPlan(date) ? date : null;
  };

  const allStarBoundaryForState = (): string | null => {
    const plan = options?.targetPlan;
    if (!plan || plan.boundaryPolicy?.allStarWeekend !== 'STOP_AND_WATCH') return null;
    if (!plan.confirmedBoundaries.includes('ALL_STAR_WEEKEND')) return null;
    if (state.leagueStats?.uiMode === 'euro_isolated' || state.leagueStats?.uiMode === 'pba_isolated') return null;
    const completion = getAllStarWeekendCompletion(state);
    if (!completion.scheduled || completion.complete) return null;
    const weekendStart = toISODateString(getAllStarWeekendDates(state.leagueStats.year, state.leagueStats).risingStars);
    if (weekendStart < plan.startDate) return plan.startDate;
    return boundaryFallsWithinPlan(weekendStart) ? weekendStart : null;
  };

  const buildProgress = (override?: Partial<LazySimProgress>): LazySimProgress => {
    const currentNorm = normalizeDate(state.date);
    const presentation = resolveSimulationProgressPresentation(options?.targetPlan, manualBlocker, state);
    return {
      currentDate: currentNorm,
      targetDate: targetNorm,
      daysComplete,
      daysTotal,
      currentPhase,
      percentComplete: daysTotal > 0 ? Math.min(99, Math.round((daysComplete / daysTotal) * 100)) : 99,
      targetName: options?.targetPlan?.name,
      targetSemanticName: presentation.targetLabel,
      nextCheckpointLabel: presentation.nextCheckpointLabel,
      nextCheckpointRequiresAction: presentation.nextCheckpointRequiresAction,
      finalStopDate: options?.targetPlan?.finalStopDate,
      ...override,
    };
  };

  const report = (override?: Partial<LazySimProgress>) => {
    const progress = buildProgress(override);
    const key = `${progress.currentDate}|${progress.currentPhase}|${progress.percentComplete}|${progress.daysComplete}`;
    if (key === lastProgressKey) return progress;
    lastProgressKey = key;
    onProgress?.(progress);
    return progress;
  };

  const ensureAllStarCompleteBeforeTransition = async (stage: string): Promise<void> => {
    if (state.leagueStats?.uiMode === 'euro_isolated' || state.leagueStats?.uiMode === 'pba_isolated') return;
    const completion = getAllStarWeekendCompletion(state);
    if (!completion.scheduled || completion.complete) return;
    const currentDate = normalizeDate(state.date);
    const event = buildAutoResolveEvents(state.leagueStats.year, state.leagueStats, state.gameMode)
      .find(candidate => candidate.key === 'allstar_weekend' && candidate.required && candidate.date <= currentDate);
    if (!event) return;

    const resolverStart = perfNow();
    const patch = await event.resolver(state);
    if ((patch as any)?._deferred) {
      throw new Error(`Required All-Star Weekend completion deferred at ${stage}`);
    }
    if (patch && Object.keys(patch).length > 0) state = { ...state, ...patch };
    const resolved = getAllStarWeekendCompletion(state);
    if (!resolved.complete) {
      throw new Error(`All-Star Weekend closure incomplete at ${stage}: ${resolved.missing.join(', ') || 'completion marker'}`);
    }
    const compositeKey = `${state.leagueStats.year}:${event.key}`;
    firedEvents.add(compositeKey);
    state = appendMediaFacts(state, [buildAutoEventMediaFact(state, event.key, event.date)]);
    recordSimulationPerf({
      engine: 'calendar-event-fired',
      stage,
      eventKey: event.key,
      eventDate: event.date,
      currentDate,
      mutated: !!patch && Object.keys(patch).length > 0,
      resolverMs: perfMs(resolverStart),
    });
  };

  options?.onCheckpoint?.(state, buildProgress());

  try {
    let iterNum = 0;
    while (true) {
      iterNum++;
      const iterStart = perfNow();
      let currentNorm = normalizeDate(state.date);
      state = autoResolveDueDeathMemorials(state);
      state = await autoResolveDueCommissionerTasks(
        state,
        targetNorm,
        options?.autoResolveOffseasonTasks === true,
        options?.targetPlan,
      );
      state = autoResolveEuroSetupOffseasonTasks(state, options?.autoResolveOffseasonTasks === true);
      state = autoResolvePbaSetupOffseasonTasks(state, options?.autoResolveOffseasonTasks === true, targetNorm);
      state = repairPbaConferenceForDate(state);
      state = repairEuroCompetitionScheduleForToday(state);
      currentNorm = normalizeDate(state.date);
      currentPhase = getPhaseLabel(currentNorm, state.leagueStats.year, state.leagueStats);
      const eventsForDay = buildAutoResolveEvents(state.leagueStats.year, state.leagueStats, state.gameMode);

      const transitionPlan = options?.targetPlan != null && [
        'TO_PLAYOFFS', 'TO_CHAMPION', 'TO_OFFSEASON', 'SKIP_TO_PRESEASON',
      ].includes(options.targetPlan.name);
      if (transitionPlan && evaluateTargetPlan(state, options.targetPlan!).satisfied) {
        await ensureAllStarCompleteBeforeTransition('target-closure-top');
        break;
      }

      const lotteryBoundaryDate = toISODateString(getDraftLotteryDate(state.leagueStats.year, state.leagueStats));
      const preparedLotteryReveal = options?.targetPlan?.boundaryPolicy?.draftLottery === 'STOP_AND_WATCH'
        && boundaryFallsWithinPlan(lotteryBoundaryDate)
        && currentNorm >= lotteryBoundaryDate
        && Number(state.draftLotteryReplayPendingYear) === state.leagueStats.year;
      if (preparedLotteryReveal) {
        boundaryStop = { kind: 'DRAFT_LOTTERY', date: lotteryBoundaryDate };
        currentPhase = 'Draft Lottery';
        report();
        break;
      }

      const tradeDeadlineBoundary = tradeDeadlineBoundaryForState();
      if (tradeDeadlineBoundary && currentNorm >= tradeDeadlineBoundary) {
        boundaryStop = { kind: 'TRADE_DEADLINE', date: tradeDeadlineBoundary };
        currentPhase = 'Trade Deadline';
        report();
        break;
      }

      const allStarBoundary = allStarBoundaryForState();
      if (allStarBoundary && currentNorm >= allStarBoundary) {
        state = prepareAllStarWeekendForWatch(state);
        boundaryStop = { kind: 'ALL_STAR_WEEKEND', date: allStarBoundary };
        currentPhase = 'All-Star Weekend';
        report();
        break;
      }

      if (
        state.leagueStats?.uiMode === 'pba_isolated'
        && isPbaAllStarWeekendPending(state)
        && options?.autoResolveOffseasonTasks !== true
      ) {
        const firstEventDate = getPbaAllStarFirstEventDate(state)
          ?? toISODateString(getAllStarWeekendDates(state.leagueStats.year, state.leagueStats).breakStart);
        if (currentNorm >= firstEventDate && targetNorm > currentNorm) {
          state = prepareAllStarWeekendForWatch(state);
          currentPhase = 'PBA All-Star Weekend';
          manualBlocker = 'PBA_ALL_STAR_WEEKEND';
          report();
          break;
        }
      }

      if (state.gameMode === 'gm' || state.gameMode === 'commissioner') {
        const lifecycle = resolveLeagueSeasonLifecycle(state);
        const draftEvent = eventsForDay
          .find(event => {
            if (event.date > currentNorm || firedEvents.has(`${state.leagueStats.year}:${event.key}`)) return false;
            if (event.key === 'draft_lottery') return lifecycle.draft.lottery === 'pending';
            if (event.key === 'draft_order_review') {
              const seasonComplete = lifecycle.completedSeason === lifecycle.activeSeason
                && lifecycle.offseasonCycle === lifecycle.activeSeason;
              return lifecycle.draft.lottery === 'complete'
                && lifecycle.draft.orderLedger.length > 0
                && lifecycle.draft.orderReview !== 'complete'
                && seasonComplete;
            }
            if (event.key === 'draft_execute') {
              return lifecycle.draft.orderReview === 'complete'
                && !isCanonicalDraftComplete(state)
                && !isDraftBlockedByUnresolvedPlayoffs(state);
            }
            if (event.key === 'rookie_contracts') {
              return lifecycle.draft.draft === 'complete'
                && lifecycle.draft.rookieContracts !== 'complete';
            }
            return false;
          });
        if (draftEvent) {
          const eventType = DRAFT_RUNTIME_EVENT_TYPES[draftEvent.key as keyof typeof DRAFT_RUNTIME_EVENT_TYPES];
          const savedAuthority = lifecycle.draft.authority[eventType];
          const transientAuthority = (eventType === 'lottery' || eventType === 'draft')
            && isAssistantGMDraftEventAuthorized(eventType, draftEvent.date);
          const targetDelegatesEvent = eventType === 'lottery'
            && options?.targetPlan?.delegatedEvents.includes('DRAFT_LOTTERY') === true;
          const lotteryDisposition = eventType === 'lottery'
            ? resolveCalendarEventDisposition(state, {
                eventKey: 'draft_lottery',
                eventDate: draftEvent.date,
                targetPlan: options?.targetPlan,
                transientAuthorized: transientAuthority || targetDelegatesEvent,
                commandType: options?.targetPlan?.name ?? 'LAZY_SIM',
              })
            : null;
          const manualDraftBlock = eventType === 'lottery'
            ? lotteryDisposition === 'MANUAL_BLOCKER'
            : shouldPauseForManualDraftEvent(
                state.gameMode,
                assistantGM,
                savedAuthority !== 'manual' || transientAuthority,
              );
          if (manualDraftBlock) {
            currentPhase = eventType === 'lottery'
              ? 'Draft Lottery'
              : eventType === 'draftOrderReview'
                ? 'Draft Order Review'
                : eventType === 'draft'
                  ? 'NBA Draft'
                  : 'Rookie Contracts';
            manualBlocker = eventType === 'lottery' ? 'MANUAL_LOTTERY' : `MANUAL_${eventType.toUpperCase()}`;
            lastTransitionAttempted = draftEvent.key;
            report();
            break;
          }
        }
      }

      if (state.leagueStats?.uiMode === 'euro_isolated') {
        try {
          const eventsBefore = ((state as any).tycoonEvents ?? []).length;
          tickTycoonEvents({ state, gameDate: currentNorm });
          const eventsAfter = ((state as any).tycoonEvents ?? []).length;
          if (eventsAfter > eventsBefore) {
            const HIGH_PRIORITY_KINDS = new Set(['bankAlarm', 'crisisMeeting', 'sponsorMidTermBonus', 'sponsorPoachingOffer']);
            const newEvents = ((state as any).tycoonEvents as any[]).slice(eventsBefore);
            const userTeamId = (state as any).userTeamId;
            const hasUserHighPrio = newEvents.some(e => e.teamId === userTeamId && HIGH_PRIORITY_KINDS.has(e.kind));
            if (hasUserHighPrio) {
              logLazySim(`[LAZY_SIM] tycoon event break - ${newEvents.filter(e => e.teamId === userTeamId).map(e => e.kind).join(', ')}`);
              currentPhase = 'Front Office Alert';
              manualBlocker = 'FRONT_OFFICE_ALERT';
              report();
              break;
            }
          }
        } catch (e) {
          console.warn('[tycoon] daily tick failed', e);
        }
      }
      logLazySim(`[LAZY_SIM] iter ${iterNum} - currentNorm=${currentNorm}, targetNorm=${targetNorm}, state.day=${state.day}, stopBefore=${stopBefore}`);
      const pendingDueEuroGamesAtTop = hasDueUnplayedEuroCompetitionGames(state, currentNorm);
      const pendingDuePbaGamesAtTop = hasDueUnplayedPbaCompetitionGames(state, currentNorm);
      const shouldBreakTop = stopBefore
        ? currentNorm >= targetNorm
        : currentNorm > targetNorm && !pendingDueEuroGamesAtTop && !pendingDuePbaGamesAtTop;
      if (shouldBreakTop && options?.targetPlan?.name === 'TO_PLAYOFFS') {
        state = materializePlayoffBracket(state);
        currentNorm = normalizeDate(state.date);
        lastTransitionAttempted = 'PLAYOFFS_MATERIALIZED';
      }
      if (shouldBreakTop) {
        logLazySim(`[LAZY_SIM] iter ${iterNum} - break at top (stopBefore=${stopBefore})`);
        break;
      }

      const seasonYear = state.leagueStats.year;
      let resolvedRuntimeEvent = false;
      const runtimeEventScanStart = perfNow();
      let dueRuntimeEvents = 0;
      let firedRuntimeEvents = 0;
      for (const event of eventsForDay) {
        if (
          state.leagueStats?.uiMode === 'pba_isolated'
          && !isPbaAllStarWeekendPending(state)
          && PBA_ALL_STAR_EVENT_KEYS.has(event.key)
        ) {
          continue;
        }
        const compositeKey = `${seasonYear}:${event.key}`;
        if (!firedEvents.has(compositeKey) && event.date <= currentNorm) {
          dueRuntimeEvents += 1;
          currentPhase = event.phase;
          report();
          await yieldLongSimIfDue(yieldBudget, { force: true, reason: 'runtime-event' });
          let indexedCanonicalEvent = false;
          const eventResolverStart = perfNow();
          try {
            const lotteryEvent = event.key === 'draft_lottery'
              ? applyDraftLotteryCalendarEvent(state, {
                  eventDate: event.date,
                  targetPlan: options?.targetPlan,
                  transientAuthorized: isAssistantGMDraftEventAuthorized('lottery', event.date),
                  commandType: options?.targetPlan?.name ?? 'LAZY_SIM',
                })
              : null;
            const patch = lotteryEvent ? lotteryEvent.patch : await event.resolver(state);
            if (lotteryEvent?.disposition === 'TARGET_BOUNDARY' || lotteryEvent?.disposition === 'MANUAL_BLOCKER') continue;
            if ((patch as any)?._deferred) continue; // resolver asked to retry next iteration
            if (patch && Object.keys(patch).length > 0) {
              state = lotteryEvent?.state ?? { ...state, ...patch };
              indexedCanonicalEvent = true;
            }
            if (
              lotteryEvent?.disposition === 'PREPARE_VISUAL_REVEAL'
              && lotteryEvent.evidenceWritten
            ) {
              boundaryStop = { kind: 'DRAFT_LOTTERY', date: event.date };
            }
          } catch (err) {
            console.warn(`Auto-resolver ${event.key} failed:`, err);
            if (event.required) throw err;
          }
          firedEvents.add(compositeKey);
          firedRuntimeEvents += 1;
          recordSimulationPerf({
            engine: 'calendar-event-fired',
            stage: 'runtime',
            eventKey: event.key,
            eventDate: event.date,
            currentDate: currentNorm,
            mutated: indexedCanonicalEvent,
            resolverMs: perfMs(eventResolverStart),
          });
          if (indexedCanonicalEvent) {
            state = appendMediaFacts(state, [buildAutoEventMediaFact(state, event.key, event.date)]);
          }
          resolvedRuntimeEvent = true;
        }
      }
      recordSimulationPerf({
        engine: 'calendar-event-scan',
        stage: 'runtime',
        currentDate: currentNorm,
        listedEvents: eventsForDay.length,
        dueEvents: dueRuntimeEvents,
        firedEvents: firedRuntimeEvents,
        zeroEventWork: dueRuntimeEvents === 0,
        totalMs: perfMs(runtimeEventScanStart),
      });

      if (boundaryStop) {
        currentPhase = boundaryStop.kind === 'DRAFT_LOTTERY'
          ? 'Draft Lottery'
          : boundaryStop.kind === 'ALL_STAR_WEEKEND'
            ? 'All-Star Weekend'
            : 'Trade Deadline';
        report();
        break;
      }

      if (
        state.leagueStats?.uiMode === 'pba_isolated'
        && isPbaAllStarWeekendPending(state)
        && options?.autoResolveOffseasonTasks === true
      ) {
        const weekendCompletion = getPbaAllStarLastEventDate(state)
          ?? toISODateString(getAllStarWeekendDates(state.leagueStats.year, state.leagueStats).allStarGame);
        if (currentNorm >= weekendCompletion && targetNorm > currentNorm) {
          state = prepareAllStarWeekendForWatch(state);
          currentPhase = 'PBA All-Star Weekend';
          manualBlocker = 'PBA_ALL_STAR_WEEKEND';
          report();
          break;
        }
      }

      currentPhase = getPhaseLabel(currentNorm, seasonYear, state.leagueStats);
      report();
      if (resolvedRuntimeEvent) {
        await yieldLongSimIfDue(yieldBudget, { force: true, reason: 'runtime-event-commit' });
      }

      const lazyPlan = getOffseasonDayPlan(state);
      const pendingEuroCompetitionGames = hasDueUnplayedEuroCompetitionGames(state, currentNorm);
      const pbaIsolatedMode = state.leagueStats?.uiMode === 'pba_isolated';
      if (lazyPlan.actions.rollover === 'fire' && pendingEuroCompetitionGames) {
        currentPhase = 'Finishing European competition games...';
        report();
      } else if (lazyPlan.actions.rollover === 'fire' && !pbaIsolatedMode) {
        logPlanEvent('lazySimRunner.rollover', 'fire', `date=${currentNorm}`);
        const rolloverPatch = applySeasonRollover(state);
        lastTransitionAttempted = 'NEXT_SEASON_PREPARED';
        state = { ...state, ...rolloverPatch };
        const isNba = state.leagueType === 'modded' && (state.moddedLeagueBase ?? 'nba') === 'nba';
        const historicalTimeline = isHistoricalNbaWhatIfTimeline(timelineInputFromState(state));
        const branchCutoff = Number(state.nbaStartYear ?? state.leagueStats.historicalEraStartYear);
        const hostHistoryCutoff = historicalTimeline && Number.isFinite(branchCutoff)
          ? branchCutoff
          : state.leagueStats.year - 1;
        const hostHistory = isNba ? await fetchAllStarHistory() : [];
        const historicalHostYears = isNba
          ? buildHistoricalAllStarHostYears(hostHistory, state.teams, hostHistoryCutoff)
          : undefined;
        const historicalHostsByYear = isNba
          ? new Map(
              [...buildHistoricalAllStarHostsByYear(hostHistory, state.teams)]
                .filter(([year]) => year <= hostHistoryCutoff),
            )
          : undefined;
        const resolvedHosts = autoResolveAllStarHosts(state.leagueStats, state.teams, {
          horizon: 1,
          historicalHostYears,
          historicalHostsByYear,
        });
        if (resolvedHosts !== state.leagueStats.allStarHosts) {
          state = { ...state, leagueStats: { ...state.leagueStats, allStarHosts: resolvedHosts } };
        }
        currentPhase = 'Season Rollover...';
        report();
      }

      const rolloverDate = toISODateString(getRolloverDate(state.leagueStats.year, state.leagueStats as any, state.schedule as any));
      const nearRolloverStart = toISODateString(new Date(getRolloverDate(state.leagueStats.year, state.leagueStats as any, state.schedule as any).getTime() - 5 * 86_400_000));
      const nearRollover = currentNorm >= nearRolloverStart && currentNorm < rolloverDate;
      const remaining = daysBetween(currentNorm, targetNorm);
      const effectiveBatch = nearRollover ? 1 : BATCH_SIZE;
      let batchDays = Math.max(1, Math.min(effectiveBatch, remaining));

      const nextRuntimeEventDate = buildAutoResolveEvents(state.leagueStats.year, state.leagueStats, state.gameMode)
        .filter(e => !firedEvents.has(`${state.leagueStats.year}:${e.key}`) && e.date > currentNorm)
        .map(e => e.date)
        .sort()[0];
      const nextTradeDeadlineBoundary = tradeDeadlineBoundaryForState();
      const nextAllStarBoundary = allStarBoundaryForState();
      const nextEventDate = [nextRuntimeEventDate, nextTradeDeadlineBoundary, nextAllStarBoundary]
        .filter((date): date is string => !!date && date > currentNorm)
        .sort()[0];
      if (nextEventDate) {
        const daysToEvent = daysBetween(currentNorm, nextEventDate);
        if (daysToEvent > 0 && daysToEvent < batchDays) batchDays = daysToEvent;
      }
      logLazySim(`[LAZY_SIM] iter ${iterNum} - remaining=${remaining}, batchDays=${batchDays}, nearRollover=${nearRollover}, nextEvent=${nextEventDate ?? 'none'}`);
      if (remaining < 0) {
        logLazySim(`[LAZY_SIM] iter ${iterNum} - remaining < 0, breaking`);
        break;
      }

      const runSimulationStart = perfNow();
      const simulationAction = {
        type: 'SIMULATE_TO_DATE',
        payload: {
          ...(options?.transferMarketDailySummary ? { transferMarketDailySummary: true } : {}),
          mediaProcessing: executionProfile.mediaProcessing,
          longSimYieldBudget: yieldBudget,
          processResultsPerDay: true,
          // Browser scaling on the exact-save fixture shows that dispatch and
          // return cloning still outweigh the parallel engine gain. Keep the
          // verified pool opt-in until the measured wall-time crossover exists.
          useGameWorkerPool: options?.gameWorkerPool === true,
          gameWorkerPoolSize: options?.gameWorkerPoolSize,
          gameWorkerThreshold: options?.gameWorkerThreshold,
          lastDailyProgressionDate,
          ...(options?.onDayTrace ? { onDayTrace: options.onDayTrace } : {}),
          ...(options?.targetPlan ? { targetPlan: options.targetPlan } : {}),
        },
      };
      await yieldLongSimIfDue(yieldBudget, { reason: 'batch-start' });
      const committedHeartbeat = buildProgress({ currentPhase: 'Simulating games...' });
      onProgress?.(committedHeartbeat);
      options?.onHeartbeat?.(committedHeartbeat);
      const heartbeatTimer = setInterval(() => {
        const heartbeat = buildProgress({ currentPhase: 'Simulating games...' });
        onProgress?.(heartbeat);
        options?.onHeartbeat?.(heartbeat);
      }, 1_000);
      let simulationOutput: Awaited<ReturnType<typeof runSimulation>>;
      try {
        simulationOutput = await runSimulation(state, batchDays, simulationAction, options?.onGame);
      } finally {
        clearInterval(heartbeatTimer);
      }
      let { stateWithSim, allSimResults, perDayResults, userInterrupted } = simulationOutput;
      lastDailyProgressionDate = simulationOutput.lastDailyProgressionDate;
      const runSimulationMs = perfMs(runSimulationStart);
      logLazySim(`[LAZY_SIM] iter ${iterNum} - after runSimulation: state.date=${stateWithSim.date}, simResults=${allSimResults.length}, perDayResults=${perDayResults.length}, userInterrupted=${!!userInterrupted}`);
      lastBatchSimResults = allSimResults; // track for silent mode return
      logLazySim(`[LAZY_SIM] post-runSimulation - iter ${iterNum}`);

      const postProcessStart = perfNow();
      let updatedPlayers = stateWithSim.players;
      const updatedDraftPicks = stateWithSim.draftPicks;
      const postProcessMs = perfMs(postProcessStart);
      logLazySim(`[LAZY_SIM] post-processSimulationResults - iter ${iterNum}, updatedPlayers=${updatedPlayers.length}`);

      const batchCalendarDays = Math.max(0, daysBetween(currentNorm, normalizeDate(stateWithSim.date)));
      const pbaLifecyclePatch = applyPbaConferenceLifecycle(
        { ...stateWithSim, players: updatedPlayers } as GameState,
        allSimResults,
      );
      if (Object.keys(pbaLifecyclePatch).length > 0) {
        stateWithSim = { ...stateWithSim, ...pbaLifecyclePatch } as GameState;
        updatedPlayers = (pbaLifecyclePatch.players ?? updatedPlayers) as GameState['players'];
      }
      const trainingTickMs = simulationOutput.dailyProgressionMs;
      logLazySim(`[LAZY_SIM] trainingTick - iter ${iterNum}, days=${batchCalendarDays}, ms=${trainingTickMs}`);

      const historicalStatsStart = perfNow();
      const bulkStats = calculateBulkDailyStats(state, perDayResults);
      const runningState = {
        ...state,
        stats: bulkStats.stats,
        leagueStats: bulkStats.leagueStats,
      };
      const newHistoricalPoints = bulkStats.historicalPoints;
      const historicalStatsMs = perfMs(historicalStatsStart);

      logLazySim(`[LAZY_SIM] post-perDayLoop - iter ${iterNum}, histPoints=${newHistoricalPoints.length}`);

      const playoffOutcomesStart = perfNow();
      const {
        updatedPlayers: updatedPlayersWithPlayoffAwards,
        champHistoricalAwards,
        semifinalsMvpAwards,
        champTeamsWithRoundsWon,
        seasonHistoryPatch,
      } = buildLazySimPlayoffOutcomes({
        state,
        stateWithSim,
        allSimResults,
        updatedPlayers,
      });
      const playoffOutcomesMs = perfMs(playoffOutcomesStart);
      logLazySim(`[LAZY_SIM] post-playoffOutcomes - iter ${iterNum}`);

      const batchPayResult = generatePaychecks(
        state.lastPayDate || normalizeDate(initialState.date),
        normalizeDate(stateWithSim.date),
        state.salary || 10000000,
        getPaycheckContext(state),
      );
      const batchPayWealth = batchPayResult.totalNetPay / 1_000_000;

      const monthlyPassive = (state.realEstateInventory ?? [])
        .reduce((s: number, a: any) => s + Math.floor(a.price * 0.004), 0);
      const passiveBatchWealth = monthlyPassive > 0
        ? (monthlyPassive * (batchDays / 30)) / 1_000_000
        : 0;

      const tycoonOps = applyEuroTycoonDailyOps(
        {
          ...stateWithSim,
          teams: champTeamsWithRoundsWon ?? stateWithSim.teams,
          players: updatedPlayersWithPlayoffAwards,
        } as GameState,
        champTeamsWithRoundsWon ?? stateWithSim.teams,
        state.date,
        stateWithSim.date,
        batchCalendarDays,
      );
      const mediaFactStart = perfNow();
      const batchMediaFacts = buildSimulationMediaFacts({
        before: stateWithSim,
        after: stateWithSim,
        results: [],
        awards: [...semifinalsMvpAwards, ...champHistoricalAwards],
      });
      const mediaIndexedState = appendMediaFacts(stateWithSim, batchMediaFacts);
      const mediaFactMs = perfMs(mediaFactStart);

      // Keep the rich, account-specific presentation layer alive in long sim.
      // MediaFacts remain the compact canonical index, while NewsGenerator and
      // SocialEngine own visible editorial copy, photos and handle voices.
      const activeLeagueTeams = getActiveLeagueTeams({
        teams: champTeamsWithRoundsWon ?? stateWithSim.teams,
        nonNBATeams: stateWithSim.nonNBATeams,
        userTeamId: stateWithSim.userTeamId,
        leagueStats: stateWithSim.leagueStats,
      });
      const activeTeamIds = new Set(activeLeagueTeams.map(team => team.id));
      const activeLeaguePlayers = updatedPlayersWithPlayoffAwards.filter(player => activeTeamIds.has(player.tid));
      const reportedInjuries = new Set<string>(
        (stateWithSim.news ?? [])
          .map(item => String((item as typeof item & { injuryPlayerId?: string }).injuryPlayerId ?? ''))
          .filter(Boolean),
      );
      const generatedNews = allSimResults.length > 0
        ? generateLazySimNews(
            activeLeagueTeams,
            updatedPlayersWithPlayoffAwards,
            allSimResults,
            stateWithSim.date,
            reportedInjuries,
            false,
            getActiveLeagueTeams(state),
            stateWithSim.playoffs,
            stateWithSim.schedule,
            stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
            stateWithSim.leagueStats,
          )
        : [];
      const generatedSocial = allSimResults.length > 0
        && stateWithSim.leagueStats?.uiMode !== 'pba_isolated'
        && isTwitterAvailable(stateWithSim.date, stateWithSim.leagueStats?.year)
        ? await new SocialEngine().generateDailyPosts(
            allSimResults,
            activeLeaguePlayers,
            activeLeagueTeams,
            stateWithSim.date,
            Math.max(1, batchCalendarDays),
            stateWithSim.playoffs,
            stateWithSim.schedule,
            stateWithSim.leagueType,
            { fetchAvatars: false, uiMode: stateWithSim.leagueStats?.uiMode },
          )
        : [];

      const yearAdvanced = stateWithSim.leagueStats.year !== state.leagueStats.year;
      const safeSchedule = !yearAdvanced && stateWithSim.schedule.length === 0 && state.schedule.length > 0
        ? state.schedule
        : stateWithSim.schedule;
      const committedLeagueStats = yearAdvanced || stateWithSim.leagueStats?.uiMode === 'pba_isolated'
        ? {
            ...runningState.leagueStats,
            ...stateWithSim.leagueStats,
          }
        : runningState.leagueStats;

      const commitStart = perfNow();
      state = {
        ...stateWithSim,
        simulationLastDailyProgressionDate: lastDailyProgressionDate,
        schedule: safeSchedule,
        stats: {
          ...runningState.stats,
          personalWealth: Number((runningState.stats.personalWealth + batchPayWealth + passiveBatchWealth).toFixed(2)),
        },
        leagueStats: committedLeagueStats,
        teams: tycoonOps.teams,
        nonNBATeams: tycoonOps.nonNBATeams,
        players: updatedPlayersWithPlayoffAwards,
        draftPicks: updatedDraftPicks,
        historicalStats: [...(state.historicalStats || []), ...newHistoricalPoints].slice(-365),
        boxScores: stateWithSim.boxScores,
        mediaFacts: mediaIndexedState.mediaFacts,
        mediaEventRevision: mediaIndexedState.mediaEventRevision,
        news: mergePresentationRows([
          ...tycoonOps.news,
          ...generatedNews,
          ...(stateWithSim.news || []),
        ], 200),
        socialFeed: mergePresentationRows([
          ...generatedSocial,
          ...(stateWithSim.socialFeed || []),
        ], 500),
        lastPayDate: batchPayResult.newLastPayDate,
        payslips: [...(state.payslips || []), ...batchPayResult.newPayslips].slice(-50),
        historicalAwards: (champHistoricalAwards.length > 0 || semifinalsMvpAwards.length > 0)
          ? [...(stateWithSim.historicalAwards ?? []), ...semifinalsMvpAwards, ...champHistoricalAwards]
          : stateWithSim.historicalAwards,
        ...(seasonHistoryPatch ?? {}),
      };
      state = finalizeHistoricalNbaSeason(state, state.leagueStats.year);
      if (isPlayoffCompletionProvable(state.playoffs, state.schedule)) state = finalizeChampionTransition(state);
      state = indexDueNativeAnnouncements(state, state.date);
      state = autoResolveDueDeathMemorials(state);
      state = appendMediaProjectInboxForRange(state, currentNorm, state.date);
      const commitMs = perfMs(commitStart);
      const currentNormAfterSim = normalizeDate(state.date);
      daysComplete = Math.max(0, Math.min(daysTotal, daysBetween(startNorm, currentNormAfterSim)));
      currentPhase = getPhaseLabel(currentNormAfterSim, state.leagueStats.year, state.leagueStats);
      const committedProgress = report();
      options?.onCheckpoint?.(state, committedProgress);
      await yieldLongSimIfDue(yieldBudget, { force: true, reason: 'batch-commit' });

      if (shouldLogPbaLazySimCheckpoint(runningState, state)) {
        logPbaLazySimAudit(state, `post-batch ${iterNum}`);
      }
      logLazySim(`[LAZY_SIM] post-batch - iter ${iterNum}: state.date=${state.date}, currentNormAfterSim=${currentNormAfterSim}, daysComplete=${daysComplete}`);
      recordSimulationPerf({
        engine: 'lazy-sim',
        iter: iterNum,
        startDate: currentNorm,
        endDate: currentNormAfterSim,
        batchDays,
        games: allSimResults.length,
        runSimulationMs,
        postProcessMs,
        historicalStatsMs,
        mediaFactMs,
        mediaFacts: batchMediaFacts.length,
        dayProcessing: executionProfile.dayProcessing,
        mediaProcessing: executionProfile.mediaProcessing,
        persistence: executionProfile.persistence,
        playoffOutcomesMs,
        trainingTickMs,
        commitMs,
        totalIterMs: perfMs(iterStart),
      });
      if (transitionPlan && evaluateTargetPlan(state, options!.targetPlan!).satisfied) {
        await ensureAllStarCompleteBeforeTransition('target-closure-post-batch');
        lastTransitionAttempted = options!.targetPlan!.nextBoundary;
        break;
      }
      if (currentNormAfterSim >= targetNorm) {
        if (hasDueUnplayedEuroCompetitionGames(state, currentNormAfterSim) && allSimResults.length > 0) {
          logLazySim(`[LAZY_SIM] iter ${iterNum} - continuing for newly injected due Euro competition games`);
          currentPhase = 'Finishing European competition games...';
          report();
          continue;
        }
        if (hasDueUnplayedPbaCompetitionGames(state, currentNormAfterSim)) {
          logLazySim(`[LAZY_SIM] iter ${iterNum} - continuing for newly injected due PBA competition games`);
          currentPhase = 'Finishing PBA playoff games...';
          report();
          continue;
        }
        logLazySim(`[LAZY_SIM] iter ${iterNum} - target reached`);
        break;
      }
      if (userInterrupted && !transitionPlan) {
        logLazySim(`[LAZY_SIM] iter ${iterNum} - userInterrupted=true, breaking before target`);
        manualBlocker = 'USER_INTERRUPTED';
        break;
      }
      state = advanceDateByOne(state);
      logLazySim(`[LAZY_SIM] advanceDateByOne - iter ${iterNum}: state.date=${state.date}, state.day=${state.day}`);

      currentPhase = getPhaseLabel(normalizeDate(state.date), state.leagueStats.year, state.leagueStats);

      await yieldLongSimIfDue(yieldBudget, { reason: 'outer-loop' });
    }

    const finalSeasonYear = state.leagueStats.year;
    const finalCommittedDate = normalizeDate(state.date);
    for (const event of buildAutoResolveEvents(finalSeasonYear, state.leagueStats, state.gameMode)) {
      const compositeKey = `${finalSeasonYear}:${event.key}`;
      if (DRAFT_RUNTIME_EVENT_KEYS.has(event.key)) continue;
      const eventWasCrossed = stopBefore ? event.date < finalCommittedDate : event.date <= finalCommittedDate;
      if (!firedEvents.has(compositeKey) && eventWasCrossed) {
        let indexedCanonicalEvent = false;
        const eventResolverStart = perfNow();
        try {
          const patch = await event.resolver(state);
          if ((patch as any)?._deferred) continue;
          if (patch && Object.keys(patch).length > 0) {
            state = { ...state, ...patch };
            indexedCanonicalEvent = true;
          }
        } catch (err) {
          console.warn(`Auto-resolver ${event.key} (post-loop) failed:`, err);
          if (event.required) throw err;
        }
        firedEvents.add(compositeKey);
        recordSimulationPerf({
          engine: 'calendar-event-fired',
          stage: 'post-loop',
          eventKey: event.key,
          eventDate: event.date,
          currentDate: finalCommittedDate,
          mutated: indexedCanonicalEvent,
          resolverMs: perfMs(eventResolverStart),
        });
        if (indexedCanonicalEvent) {
          state = appendMediaFacts(state, [buildAutoEventMediaFact(state, event.key, event.date)]);
        }
      }
    }
  } catch (error) {
    daysComplete = Math.max(0, Math.min(daysTotal, daysBetween(startNorm, normalizeDate(state.date))));
    currentPhase = 'Simulation stopped safely';
    const stoppedProgress = report();
    options?.onCheckpoint?.(state, stoppedProgress);
    throw error;
  } finally {
    setAssistantGMActive(false);
    endGameSimulationWorkerSession();
    window.removeEventListener('beforeunload', restoreOnUnload);
    SettingsManager.saveSettings(originalSettings);
  }

  daysComplete = Math.max(0, Math.min(daysTotal, daysBetween(startNorm, normalizeDate(state.date))));
  state = repairPbaConferenceForDate(state);
  state = autoResolveDueDeathMemorials(state);
  state = indexDueNativeAnnouncements(state, state.date);

  const finalNorm = normalizeDate(state.date);
  const progressed = finalNorm > startNorm;
  const reachedDateBoundary = finalNorm >= targetNorm;
  const targetEvaluation = options?.targetPlan
    ? evaluateTargetPlan(state, options.targetPlan)
    : { satisfied: true, reason: null };
  const transitionTarget = options?.targetPlan != null && [
    'TO_PLAYOFFS', 'TO_CHAMPION', 'TO_OFFSEASON', 'SKIP_TO_PRESEASON',
  ].includes(options.targetPlan.name);
  const arrived = targetEvaluation.satisfied && (reachedDateBoundary || transitionTarget);
  report(arrived
    ? {
        percentComplete: 100,
        currentPhase: 'Done!',
        daysComplete,
        finalStopDate: finalNorm,
      }
    : { daysComplete });

  logLazySim('[LAZY_SIM] DONE', {
    finalStateDate: state.date,
    finalNorm: normalizeDate(state.date),
    finalDay: state.day,
    targetNorm,
    reachedTarget: reachedDateBoundary,
    lastBatchCount: lastBatchSimResults.length,
  });
  logPbaLazySimAudit(state, 'final');

  const nextEvent = [
    ...buildAutoResolveEvents(state.leagueStats.year, state.leagueStats, state.gameMode)
      .filter(event => event.date >= finalNorm)
      .map(event => `${event.key}@${event.date}`),
    ...state.schedule
      .filter(game => !game.played && normalizeDate(game.date) >= finalNorm)
      .sort((left, right) => normalizeDate(left.date).localeCompare(normalizeDate(right.date)) || left.gid - right.gid)
      .slice(0, 1)
      .map(game => `game:${game.gid}@${normalizeDate(game.date)}`),
  ].sort()[0] ?? null;
  const unresolvedTask = getBlockingCommissionerTask(state, targetNorm);
  const transitionFailure = reachedDateBoundary && !targetEvaluation.satisfied
    ? targetEvaluation.reason
    : null;
  const nonProgressDiagnostic: LazySimNonProgressDiagnostic | undefined = !boundaryStop
    && ((!progressed && !arrived) || transitionFailure != null)
    ? {
        currentDate: finalNorm,
        targetDate: targetNorm,
        currentLifecyclePhase: resolveLeagueSeasonLifecycle(state).currentPhase,
        nextScheduledEvent: nextEvent,
        unresolvedTaskOrBlocker: manualBlocker ?? unresolvedTask?.key ?? transitionFailure,
        targetPlan: options?.targetPlan ?? null,
        lastTransitionAttempted,
      }
    : undefined;
  const status: LazySimResult['status'] = arrived
    ? 'arrived'
    : boundaryStop
      ? 'progressed'
      : manualBlocker || unresolvedTask
        ? 'blocked'
        : transitionFailure
          ? 'failed'
          : progressed
            ? 'progressed'
            : 'failed';
  recordSimulationPerf({
    engine: 'run-lazy-sim',
    startDate: startNorm,
    endDate: finalNorm,
    status,
    totalMs: perfMs(runLazySimStart),
    yieldBudgetMs: yieldBudget.budgetMs,
    yieldCount: yieldBudget.yieldCount,
    yieldSkippedCount: yieldBudget.skippedCount,
    yieldWaitMs: Math.round(yieldBudget.waitMs * 10) / 10,
  });
  return {
    state,
    lastSimResults: lastBatchSimResults,
    status,
    ...(boundaryStop ? { boundaryStop } : {}),
    ...(status !== 'arrived' && !boundaryStop && (manualBlocker || unresolvedTask || transitionFailure)
      ? { blocker: manualBlocker ?? unresolvedTask?.key ?? transitionFailure ?? undefined }
      : {}),
    ...(nonProgressDiagnostic ? { nonProgressDiagnostic } : {}),
  };
};
