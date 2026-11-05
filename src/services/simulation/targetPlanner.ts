import type { GameState, SeasonLifecyclePhase } from '../../types';
import { TimeService } from '../time/TimeService';
import { getPlayoffCompletionEvidence } from '../playoffs/playoffCompletion';
import { getLeagueLabels } from '../../utils/leagueLabels';
import { hasPrematureLegacyLotteryEvidence } from '../lifecycle/leagueSeasonLifecycle';

export type TargetName =
  | 'ONE_DAY'
  | 'UNTIL_NEXT_GAME'
  | 'UNTIL_TRADE_DEADLINE'
  | 'TO_PLAYOFFS'
  | 'SIM_ROUND'
  | 'TO_CHAMPION'
  | 'TO_OFFSEASON'
  | 'UNTIL_DRAFT_LOTTERY'
  | 'SKIP_TO_PRESEASON'
  | 'SIMULATE_TO_DATE';

export type SimulationBoundaryKind = 'ALL_STAR_WEEKEND' | 'DRAFT_LOTTERY' | 'TRADE_DEADLINE';
export type DraftLotteryBoundaryPolicy = 'STOP_AND_WATCH' | 'AUTO_RESOLVE_CONTINUE';
export type TradeDeadlineBoundaryPolicy = 'STOP' | 'CONTINUE';
export type AllStarWeekendBoundaryPolicy = 'STOP_AND_WATCH' | 'AUTO_RESOLVE_CONTINUE';

export type SimulationBoundaryPolicy = Readonly<{
  allStarWeekend: AllStarWeekendBoundaryPolicy;
  draftLottery: DraftLotteryBoundaryPolicy;
  tradeDeadline: TradeDeadlineBoundaryPolicy;
}>;

export type TargetPlan = {
  name: TargetName;
  sourceAction: string;
  /** User-facing semantic destination. All target surfaces consume this value. */
  semanticName: string;
  startDate: string;
  targetDate: string;
  /** The next lifecycle/event boundary the command is compiled to cross or stop at. */
  nextBoundary: string;
  /** Honest stop known at compile time; committed state may only move this earlier. */
  finalStopDate: string;
  stopMode: 'before' | 'through' | 'transition';
  requiredTransitions: SeasonLifecyclePhase[];
  delegatedEvents: string[];
  manualStopEvents: string[];
  /** Run-owned decisions compiled before any canonical simulation work begins. */
  boundaryPolicy: SimulationBoundaryPolicy;
  /** Boundaries for which a visible preflight supplied the run policy. */
  confirmedBoundaries: readonly SimulationBoundaryKind[];
  successCondition: string;
  failureCondition: string;
};

export function compileTargetPlan(
  state: Pick<GameState, 'date' | 'leagueStats'> & Partial<Pick<GameState, 'leagueType' | 'draftLotteryResult' | 'seasonLifecycle' | 'offseasonChecklist'>>,
  name: TargetName,
  targetDate: string,
): TargetPlan {
  const lotteryManualOnly = state.leagueStats.draftLotteryAuthority === 'manual';
  const lotteryComplete = isDraftLotteryEvidenceComplete(state);
  const phase = state.seasonLifecycle?.currentPhase;
  const alreadyInOffseason = phase === 'OFFSEASON_OPEN' || phase === 'OFFSEASON_TASKS_ACTIVE';
  const labels = getLeagueLabels(state.leagueType, state.leagueStats.uiMode, state.leagueStats.leagueName);
  const semanticName: Record<TargetName, string> = {
    ONE_DAY: 'Next Day',
    UNTIL_NEXT_GAME: 'Next Game',
    UNTIL_TRADE_DEADLINE: 'Trade Deadline',
    TO_PLAYOFFS: 'Playoffs',
    SIM_ROUND: 'End of Round',
    TO_CHAMPION: `${labels.leagueName} Champion`,
    TO_OFFSEASON: alreadyInOffseason ? 'Season Review' : 'Offseason',
    UNTIL_DRAFT_LOTTERY: labels.draftLottery,
    SKIP_TO_PRESEASON: 'Preseason',
    SIMULATE_TO_DATE: 'Selected Date',
  };
  const nextBoundary: Partial<Record<TargetName, string>> = {
    TO_PLAYOFFS: 'PLAYOFFS_MATERIALIZED',
    TO_CHAMPION: 'CHAMPION_FINALIZED',
    TO_OFFSEASON: alreadyInOffseason ? 'SEASON_REVIEW' : 'OFFSEASON_OPEN',
    UNTIL_DRAFT_LOTTERY: lotteryComplete ? 'DRAFT_ORDER_REVIEW' : 'DRAFT_LOTTERY',
    SKIP_TO_PRESEASON: 'PRESEASON_ACTIVE',
  };
  const transitions: Partial<Record<TargetName, SeasonLifecyclePhase[]>> = {
    TO_PLAYOFFS: ['REGULAR_SEASON_COMPLETE', 'PLAYOFFS_MATERIALIZED'],
    TO_CHAMPION: ['PLAYOFFS_ACTIVE', 'CHAMPION_FINALIZED'],
    TO_OFFSEASON: ['REGULAR_SEASON_COMPLETE', 'PLAYOFFS_MATERIALIZED', 'PLAYOFFS_ACTIVE', 'CHAMPION_FINALIZED', 'OFFSEASON_OPEN', 'OFFSEASON_TASKS_ACTIVE'],
    SKIP_TO_PRESEASON: ['NEXT_SEASON_PREPARED', 'PRESEASON_ACTIVE'],
  };
  const boundaryPolicy: SimulationBoundaryPolicy = Object.freeze({
    allStarWeekend: 'AUTO_RESOLVE_CONTINUE',
    draftLottery: name === 'UNTIL_DRAFT_LOTTERY' || lotteryManualOnly
      ? 'STOP_AND_WATCH'
      : 'AUTO_RESOLVE_CONTINUE',
    tradeDeadline: name === 'UNTIL_TRADE_DEADLINE' ? 'STOP' : 'CONTINUE',
  });
  return freezeTargetPlan({
    name,
    sourceAction: name,
    semanticName: semanticName[name],
    startDate: TimeService.normalize(state.date),
    targetDate: TimeService.normalize(targetDate),
    nextBoundary: nextBoundary[name] ?? name,
    finalStopDate: alreadyInOffseason && name === 'TO_OFFSEASON'
      ? TimeService.normalize(state.date)
      : TimeService.normalize(targetDate),
    stopMode: name === 'UNTIL_NEXT_GAME' || name === 'UNTIL_TRADE_DEADLINE' || name === 'UNTIL_DRAFT_LOTTERY' || name === 'TO_PLAYOFFS'
      ? 'before'
      : name === 'SIMULATE_TO_DATE' ? 'before' : 'transition',
    requiredTransitions: transitions[name] ?? [],
    delegatedEvents: (name === 'TO_OFFSEASON' || name === 'TO_CHAMPION') && !lotteryComplete && !lotteryManualOnly ? ['DRAFT_LOTTERY'] : [],
    manualStopEvents: (!lotteryComplete && name === 'UNTIL_DRAFT_LOTTERY')
      || (!lotteryComplete && (name === 'TO_OFFSEASON' || name === 'TO_CHAMPION') && lotteryManualOnly)
      ? ['DRAFT_LOTTERY']
      : [],
    boundaryPolicy,
    confirmedBoundaries: [],
    successCondition: name === 'TO_OFFSEASON'
      ? 'lifecycle.currentPhase is OFFSEASON_OPEN or OFFSEASON_TASKS_ACTIVE'
      : `target ${TimeService.normalize(targetDate)} reached with required transitions committed`,
    failureCondition: 'no committed date/transition progress and no named manual blocker',
  });
}

function freezeTargetPlan(plan: TargetPlan): TargetPlan {
  Object.freeze(plan.requiredTransitions);
  Object.freeze(plan.delegatedEvents);
  Object.freeze(plan.manualStopEvents);
  Object.freeze(plan.confirmedBoundaries);
  return Object.freeze(plan);
}

/** Compiles visible preflight choices into a new immutable run contract. */
export function withSimulationBoundaryPolicy(
  plan: TargetPlan,
  policy: Partial<SimulationBoundaryPolicy>,
  confirmedBoundaries: readonly SimulationBoundaryKind[],
): TargetPlan {
  const boundaryPolicy: SimulationBoundaryPolicy = Object.freeze({
    ...plan.boundaryPolicy,
    ...(policy.allStarWeekend ? { allStarWeekend: policy.allStarWeekend } : {}),
    ...(policy.draftLottery ? { draftLottery: policy.draftLottery } : {}),
    ...(policy.tradeDeadline ? { tradeDeadline: policy.tradeDeadline } : {}),
  });
  const delegatedEvents = plan.delegatedEvents.filter(event => event !== 'DRAFT_LOTTERY');
  const lotteryWasDelegated = plan.delegatedEvents.includes('DRAFT_LOTTERY');
  const lotteryWasConfirmed = confirmedBoundaries.includes('DRAFT_LOTTERY');
  if (
    boundaryPolicy.draftLottery === 'AUTO_RESOLVE_CONTINUE'
    && (lotteryWasDelegated || lotteryWasConfirmed)
  ) {
    delegatedEvents.push('DRAFT_LOTTERY');
  }
  return freezeTargetPlan({
    ...plan,
    delegatedEvents,
    manualStopEvents: [...plan.manualStopEvents],
    requiredTransitions: [...plan.requiredTransitions],
    boundaryPolicy,
    confirmedBoundaries: [...new Set(confirmedBoundaries)],
  });
}

export interface SimulationProgressPresentation {
  targetLabel?: string;
  nextCheckpointLabel?: string;
  nextCheckpointRequiresAction?: boolean;
}

type ProgressLeagueContext = Partial<Pick<GameState, 'leagueType'>> & {
  leagueStats?: Partial<Pick<GameState['leagueStats'], 'uiMode' | 'leagueName'>>;
};

const INTERNAL_IDENTIFIER = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

/**
 * Converts simulation intent into the only copy shape production progress UI
 * is allowed to consume. Lifecycle boundaries remain internal execution data.
 */
export function resolveSimulationProgressPresentation(
  plan?: TargetPlan,
  blocker?: string | null,
  context?: ProgressLeagueContext,
): SimulationProgressPresentation {
  const labels = getLeagueLabels(
    context?.leagueType,
    context?.leagueStats?.uiMode,
    context?.leagueStats?.leagueName,
  );
  const targetLabel = resolveUserFacingSimulationText(plan?.semanticName, undefined);

  if (blocker === 'MANUAL_LOTTERY') {
    return {
      targetLabel,
      nextCheckpointLabel: `${labels.draftLottery} requires your action`,
      nextCheckpointRequiresAction: true,
    };
  }
  if (blocker === 'PBA_ALL_STAR_WEEKEND') {
    return {
      targetLabel,
      nextCheckpointLabel: 'All-Star Weekend requires your action',
      nextCheckpointRequiresAction: true,
    };
  }
  if (blocker && INTERNAL_IDENTIFIER.test(blocker)) {
    return {
      targetLabel,
      nextCheckpointLabel: 'Your attention is required before simulation can continue',
      nextCheckpointRequiresAction: true,
    };
  }

  // A plain date target already renders its terminal date. Lifecycle targets
  // likewise render their semantic destination; only a deliberate manual-stop
  // command needs a separate checkpoint row.
  if (plan?.name === 'UNTIL_DRAFT_LOTTERY') {
    return {
      targetLabel,
      nextCheckpointLabel: plan.semanticName,
      nextCheckpointRequiresAction: false,
    };
  }
  return { targetLabel };
}

const SAFE_INTERNAL_PROGRESS_COPY: Readonly<Record<string, string>> = {
  REGULAR_SEASON_ACTIVE: 'Simulating regular season...',
  PLAYOFFS_ACTIVE: 'Simulating playoffs...',
  OFFSEASON_OPEN: 'Preparing offseason...',
  OFFSEASON_TASKS_ACTIVE: 'Preparing offseason...',
  PRESEASON_ACTIVE: 'Simulating preseason...',
  SIMULATE_TO_DATE: 'Selected Date',
  TO_OFFSEASON: 'Offseason',
  TO_CHAMPION: 'Season Champion',
  UNTIL_DRAFT_LOTTERY: 'Draft Lottery',
  UNTIL_TRADE_DEADLINE: 'Trade Deadline',
};

/** Last-line defense for stale saves/callers: raw identifiers never render. */
export function resolveUserFacingSimulationText(value: string | null | undefined, fallback?: string): string | undefined {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (!INTERNAL_IDENTIFIER.test(text)) return text;
  return SAFE_INTERNAL_PROGRESS_COPY[text] ?? fallback;
}

export function isDraftLotteryEvidenceComplete(
  state: Partial<Pick<GameState, 'date' | 'draftLotteryResult' | 'seasonLifecycle' | 'offseasonChecklist'>>,
): boolean {
  return (state.seasonLifecycle?.draft?.lottery === 'complete' && !hasPrematureLegacyLotteryEvidence(state))
    || (state.draftLotteryResult?.length ?? 0) > 0
    || state.offseasonChecklist?.draftLottery === 'done'
    || state.offseasonChecklist?.draftLottery === 'skipped';
}

export function isDraftLotteryActionAvailable(
  state: Partial<Pick<GameState, 'date' | 'draftLotteryResult' | 'seasonLifecycle' | 'offseasonChecklist'>>,
  lotteryEnabled: boolean,
  noDraft: boolean,
): boolean {
  return lotteryEnabled && !noDraft && !isDraftLotteryEvidenceComplete(state);
}

export interface TargetPlanEvaluation {
  satisfied: boolean;
  reason: string | null;
}

/**
 * Evaluates the immutable plan against committed state. Reaching a calendar
 * boundary alone is never success for a lifecycle target.
 */
export function evaluateTargetPlan(state: GameState, plan: TargetPlan): TargetPlanEvaluation {
  const postseason = state.leagueStats.playoffsEnabled === false
    ? { complete: true, reason: null }
    : getPlayoffCompletionEvidence(state.playoffs, state.schedule);
  switch (plan.name) {
    case 'TO_PLAYOFFS':
      return state.schedule.some(game => !game.played && !game.isPreseason && !game.isPlayoff && !game.isPlayIn && !game.competitionId)
        ? { satisfied: false, reason: 'REGULAR_SEASON_NOT_COMPLETE' }
        : state.playoffs?.graphVersion === 1 && (state.playoffs.nodes?.length ?? 0) > 0
        ? { satisfied: true, reason: null }
        : { satisfied: false, reason: 'PLAYOFF_BRACKET_NOT_MATERIALIZED' };
    case 'TO_CHAMPION':
      return postseason.complete
        ? { satisfied: true, reason: null }
        : { satisfied: false, reason: postseason.reason ?? 'CHAMPION_NOT_FINALIZED' };
    case 'TO_OFFSEASON': {
      const phase = state.seasonLifecycle?.currentPhase;
      const lifecycleOpen = phase === 'OFFSEASON_OPEN' || phase === 'OFFSEASON_TASKS_ACTIVE';
      if (!postseason.complete) return { satisfied: false, reason: 'POSTSEASON_NOT_COMPLETE' };
      return lifecycleOpen
        ? { satisfied: true, reason: null }
        : { satisfied: false, reason: 'OFFSEASON_NOT_OPEN' };
    }
    case 'SKIP_TO_PRESEASON':
      return state.seasonLifecycle?.currentPhase === 'PRESEASON_ACTIVE'
        ? { satisfied: true, reason: null }
        : { satisfied: false, reason: 'PRESEASON_NOT_ACTIVE' };
    default:
      return { satisfied: true, reason: null };
  }
}
