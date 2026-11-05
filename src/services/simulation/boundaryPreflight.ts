import type { GameState } from '../../types';
import { getDraftLotteryDate, getTradeDeadlineDate, toISODateString } from '../../utils/dateUtils';
import { getLeagueLabels } from '../../utils/leagueLabels';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';
import { isNoDraftLeague } from '../offseason/offseasonState';
import { TimeService } from '../time/TimeService';
import { resolveLeagueSeasonLifecycle } from '../lifecycle/leagueSeasonLifecycle';
import { getAllStarWeekendCompletion } from '../allStar/allStarCompletion';
import { getAllStarWeekendDates } from '../allStar/allStarWeekendDates';
import {
  isDraftLotteryEvidenceComplete,
  withSimulationBoundaryPolicy,
  type AllStarWeekendBoundaryPolicy,
  type DraftLotteryBoundaryPolicy,
  type SimulationBoundaryKind,
  type TargetPlan,
  type TradeDeadlineBoundaryPolicy,
} from './targetPlanner';

export type SimulationBoundaryChoice = AllStarWeekendBoundaryPolicy | DraftLotteryBoundaryPolicy | TradeDeadlineBoundaryPolicy;

export interface SimulationPreflightBoundary {
  kind: SimulationBoundaryKind;
  date: string;
  season: number;
  title: string;
  description: string;
  requiresConfirmation: true;
  allowedChoices: readonly SimulationBoundaryChoice[];
  defaultChoice: SimulationBoundaryChoice;
  manualOnly?: boolean;
}

export interface SimulationBoundaryPreflight {
  requestedIntent: TargetPlan['name'];
  requestedTargetDate: string;
  targetLabel: string;
  boundaries: readonly SimulationPreflightBoundary[];
}

export type SimulationBoundarySelections = Partial<Record<SimulationBoundaryKind, SimulationBoundaryChoice>>;

function crossesBoundary(plan: TargetPlan, boundaryDate: string): boolean {
  if (TimeService.compare(boundaryDate, plan.startDate) < 0) return false;
  const targetComparison = TimeService.compare(boundaryDate, plan.targetDate);
  return plan.stopMode === 'through' ? targetComparison <= 0 : targetComparison < 0;
}

export function discoverSimulationBoundaries(
  state: GameState,
  plan: TargetPlan,
): SimulationBoundaryPreflight {
  const boundaries: SimulationPreflightBoundary[] = [];
  const season = Number(state.leagueStats.year);
  const leagueLabels = getLeagueLabels(
    state.leagueType,
    state.leagueStats.uiMode,
    state.leagueStats.leagueName,
  );
  const nbaStyleCalendar = !isEuroIsolatedMode(state) && !isPbaIsolatedMode(state);

  const allStarCompletion = getAllStarWeekendCompletion(state);
  if (nbaStyleCalendar && allStarCompletion.scheduled && !allStarCompletion.complete) {
    const dates = getAllStarWeekendDates(season, state.leagueStats);
    const date = toISODateString(dates.risingStars);
    const weekendEnd = toISODateString(dates.breakEnd);
    const unresolvedOverdueWeekend = TimeService.compare(date, plan.startDate) < 0
      && TimeService.compare(weekendEnd, plan.startDate) <= 0
      && TimeService.compare(plan.targetDate, plan.startDate) > 0;
    if (crossesBoundary(plan, date) || unresolvedOverdueWeekend) {
      boundaries.push(Object.freeze({
        kind: 'ALL_STAR_WEEKEND',
        date: TimeService.compare(date, plan.startDate) < 0 ? plan.startDate : date,
        season,
        title: 'All-Star Weekend Ahead',
        description: `This simulation will cross the ${season} ${leagueLabels.leagueName} All-Star Weekend. Would you like to stop and watch the events, or let the weekend resolve automatically and continue?`,
        requiresConfirmation: true,
        allowedChoices: Object.freeze(['STOP_AND_WATCH', 'AUTO_RESOLVE_CONTINUE'] as const),
        defaultChoice: 'STOP_AND_WATCH',
      }));
    }
  }

  if (
    nbaStyleCalendar
    && plan.name !== 'UNTIL_TRADE_DEADLINE'
    && state.leagueStats.tradeDeadlineEnabled !== false
  ) {
    const date = toISODateString(getTradeDeadlineDate(season, state.leagueStats));
    if (crossesBoundary(plan, date)) {
      boundaries.push(Object.freeze({
        kind: 'TRADE_DEADLINE',
        date,
        season,
        title: 'Trade Deadline Ahead',
        description: `This simulation will pass the ${season} ${leagueLabels.leagueName} Trade Deadline. Would you like to stop at the deadline or continue through it?`,
        requiresConfirmation: true,
        allowedChoices: Object.freeze(['STOP', 'CONTINUE'] as const),
        defaultChoice: 'STOP',
      }));
    }
  }

  const lifecycle = resolveLeagueSeasonLifecycle(state);
  const noDraft = isNoDraftLeague(state.leagueStats);
  if (
    nbaStyleCalendar
    && plan.name !== 'UNTIL_DRAFT_LOTTERY'
    && lifecycle.draft.lotteryEnabled
    && !noDraft
    && !isDraftLotteryEvidenceComplete(state)
  ) {
    const date = toISODateString(getDraftLotteryDate(season, state.leagueStats));
    if (crossesBoundary(plan, date)) {
      // Only an explicit saved league/rule setting removes the automatic choice.
      // The lifecycle fallback may be "manual" simply because no run policy has
      // delegated this UI-owned event yet; that is not a rules-level blocker.
      const manualOnly = state.leagueStats.draftLotteryAuthority === 'manual';
      boundaries.push(Object.freeze({
        kind: 'DRAFT_LOTTERY',
        date,
        season,
        title: 'Draft Lottery Ahead',
        description: manualOnly
          ? `League rules require you to run the ${season} ${leagueLabels.draftLottery}. This simulation will stop there.`
          : `This simulation will cross the ${season} ${leagueLabels.draftLottery}. Would you like to stop and watch the lottery, or let it resolve automatically and continue?`,
        requiresConfirmation: true,
        allowedChoices: Object.freeze(manualOnly
          ? ['STOP_AND_WATCH'] as const
          : ['STOP_AND_WATCH', 'AUTO_RESOLVE_CONTINUE'] as const),
        defaultChoice: 'STOP_AND_WATCH',
        ...(manualOnly ? { manualOnly: true } : {}),
      }));
    }
  }

  boundaries.sort((left, right) => left.date.localeCompare(right.date) || left.kind.localeCompare(right.kind));
  return Object.freeze({
    requestedIntent: plan.name,
    requestedTargetDate: plan.targetDate,
    targetLabel: plan.semanticName,
    boundaries: Object.freeze(boundaries),
  });
}

export function compileConfirmedBoundaryPlan(
  plan: TargetPlan,
  preflight: SimulationBoundaryPreflight,
  selections: SimulationBoundarySelections,
): TargetPlan {
  const confirmedKinds: SimulationBoundaryKind[] = [];
  let draftLottery: DraftLotteryBoundaryPolicy | undefined;
  let tradeDeadline: TradeDeadlineBoundaryPolicy | undefined;
  let allStarWeekend: AllStarWeekendBoundaryPolicy | undefined;
  for (const boundary of preflight.boundaries) {
    const choice = selections[boundary.kind];
    if (!choice || !boundary.allowedChoices.includes(choice)) {
      throw new Error(`Simulation boundary ${boundary.kind} requires a valid preflight choice.`);
    }
    confirmedKinds.push(boundary.kind);
    if (boundary.kind === 'ALL_STAR_WEEKEND') allStarWeekend = choice as AllStarWeekendBoundaryPolicy;
    if (boundary.kind === 'DRAFT_LOTTERY') draftLottery = choice as DraftLotteryBoundaryPolicy;
    if (boundary.kind === 'TRADE_DEADLINE') tradeDeadline = choice as TradeDeadlineBoundaryPolicy;
  }
  return withSimulationBoundaryPolicy(plan, { allStarWeekend, draftLottery, tradeDeadline }, confirmedKinds);
}

export function shouldOpenSimulationBoundaryPreflight(preflight: SimulationBoundaryPreflight): boolean {
  return preflight.boundaries.length > 0;
}
