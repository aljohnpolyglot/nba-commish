import type { GameState } from '../../types';
import type { TargetPlan } from '../simulation/targetPlanner';
import { autoRunLottery } from '../logic/autoResolvers';
import { resolveLeagueSeasonLifecycle } from './leagueSeasonLifecycle';
import { simDebug } from '../../utils/simDebug';

export type CalendarEventDisposition =
  | 'MUTATION_ONLY'
  | 'AUTO_RESOLVE_AND_CONTINUE'
  | 'PREPARE_VISUAL_REVEAL'
  | 'MANUAL_BLOCKER'
  | 'TARGET_BOUNDARY';

export interface CalendarEventContext {
  eventKey: 'draft_lottery' | 'draft_combine';
  eventDate: string;
  targetPlan?: TargetPlan;
  transientAuthorized?: boolean;
  commandType?: string;
}

export interface DraftLotteryCalendarEventResult {
  state: GameState;
  patch: Partial<GameState>;
  disposition: CalendarEventDisposition;
  resolverInvoked: boolean;
  evidenceWritten: boolean;
  deferred: boolean;
  blocker?: 'MANUAL_LOTTERY';
}

export interface DraftCombineCalendarEventResult {
  state: GameState;
  patch: Partial<GameState>;
  disposition: 'MUTATION_ONLY';
  evidenceWritten: boolean;
}

/** Every compiled run owns its Lottery disposition; route/UI state never does. */
export function isLotteryBoundaryOwnedByTargetPlan(targetPlan?: TargetPlan): boolean {
  return targetPlan != null;
}

type LotteryDiagnostic = {
  eventDate: string;
  stateDate: string;
  commandType: string | null;
  targetName: string | null;
  authority: string;
  targetDelegates: boolean;
  disposition: CalendarEventDisposition;
  resolverInvoked: boolean;
  evidenceWritten: boolean;
};

const lotteryDiagnostics: LotteryDiagnostic[] = [];
let lotteryResolverInvocations = 0;

export const resetDraftLotteryCalendarDiagnostics = () => {
  lotteryDiagnostics.length = 0;
  lotteryResolverInvocations = 0;
};

export const getDraftLotteryCalendarDiagnostics = () => ({
  resolverInvocations: lotteryResolverInvocations,
  timeline: lotteryDiagnostics.map(row => ({ ...row })),
});

export function resolveCalendarEventDisposition(
  state: GameState,
  context: CalendarEventContext,
): CalendarEventDisposition {
  if (context.eventKey === 'draft_combine') return 'MUTATION_ONLY';
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  const savedLotteryAuthority = state.leagueStats.draftLotteryAuthority
    ?? lifecycle.draft.authority.lottery;
  const explicitManualRule = state.leagueStats.draftLotteryAuthority === 'manual';
  if (lifecycle.draft.lottery === 'complete') return 'MUTATION_ONLY';
  if (context.targetPlan?.name === 'UNTIL_DRAFT_LOTTERY') return 'TARGET_BOUNDARY';
  if (context.targetPlan?.manualStopEvents.includes('DRAFT_LOTTERY')) return 'MANUAL_BLOCKER';
  if (explicitManualRule && !context.transientAuthorized) return 'MANUAL_BLOCKER';
  if (context.targetPlan?.boundaryPolicy?.draftLottery === 'STOP_AND_WATCH') {
    return 'PREPARE_VISUAL_REVEAL';
  }
  if (context.targetPlan?.delegatedEvents.includes('DRAFT_LOTTERY')) return 'AUTO_RESOLVE_AND_CONTINUE';
  if (savedLotteryAuthority === 'manual' && !context.transientAuthorized) return 'MANUAL_BLOCKER';
  if (context.transientAuthorized || savedLotteryAuthority !== 'manual') {
    return 'AUTO_RESOLVE_AND_CONTINUE';
  }
  return 'MANUAL_BLOCKER';
}

/**
 * Canonical Lottery calendar boundary. It may mutate the exact Lottery/order
 * evidence once, but never decides that the caller's simulation target ended.
 */
export function applyDraftLotteryCalendarEvent(
  state: GameState,
  context: Omit<CalendarEventContext, 'eventKey'>,
): DraftLotteryCalendarEventResult {
  const fullContext: CalendarEventContext = { ...context, eventKey: 'draft_lottery' };
  const disposition = resolveCalendarEventDisposition(state, fullContext);
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  const savedLotteryAuthority = state.leagueStats.draftLotteryAuthority
    ?? lifecycle.draft.authority.lottery;
  let patch: Partial<GameState> = {};
  let resolverInvoked = false;
  let evidenceWritten = false;
  let deferred = false;
  let next = state;

  if (
    (disposition === 'AUTO_RESOLVE_AND_CONTINUE' || disposition === 'PREPARE_VISUAL_REVEAL')
    && lifecycle.draft.lottery !== 'complete'
  ) {
    resolverInvoked = true;
    lotteryResolverInvocations += 1;
    patch = autoRunLottery(state);
    deferred = (patch as { _deferred?: boolean })._deferred === true;
    if (!deferred && Object.keys(patch).length > 0) {
      if (disposition === 'PREPARE_VISUAL_REVEAL') {
        patch = {
          ...patch,
          draftLotteryReplayPendingYear: lifecycle.draft.year ?? state.leagueStats.year,
        };
      }
      next = { ...state, ...patch };
      evidenceWritten = resolveLeagueSeasonLifecycle(next).draft.lottery === 'complete'
        && (next.draftLotteryResult?.length ?? 0) > 0;
    }
  }

  const diagnostic: LotteryDiagnostic = {
    eventDate: context.eventDate,
    stateDate: state.date,
    commandType: context.commandType ?? null,
    targetName: context.targetPlan?.name ?? null,
    authority: savedLotteryAuthority,
    targetDelegates: context.targetPlan?.delegatedEvents.includes('DRAFT_LOTTERY') === true,
    disposition,
    resolverInvoked,
    evidenceWritten,
  };
  lotteryDiagnostics.push(diagnostic);
  if (lotteryDiagnostics.length > 32) lotteryDiagnostics.shift();
  simDebug('lifecycle', () => `Draft Lottery ${disposition} on ${context.eventDate}`, diagnostic);

  return {
    state: next,
    patch,
    disposition,
    resolverInvoked,
    evidenceWritten,
    deferred,
    ...(disposition === 'MANUAL_BLOCKER' ? { blocker: 'MANUAL_LOTTERY' as const } : {}),
  };
}

/**
 * Canonical Draft Combine calendar mutation. Availability is persisted once
 * when the configured date is crossed; the event never terminates a command.
 */
export function applyDraftCombineCalendarEvent(
  state: GameState,
  seasonYear: number,
): DraftCombineCalendarEventResult {
  if (state.draftCombineResultsAvailableYear === seasonYear) {
    return {
      state,
      patch: {},
      disposition: 'MUTATION_ONLY',
      evidenceWritten: false,
    };
  }
  const patch: Partial<GameState> = {
    draftCombineResultsAvailableYear: seasonYear,
    pendingDraftCombineToast: { year: seasonYear },
  };
  return {
    state: { ...state, ...patch },
    patch,
    disposition: 'MUTATION_ONLY',
    evidenceWritten: true,
  };
}
