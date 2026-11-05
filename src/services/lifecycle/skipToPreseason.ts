import type { GameState, OffseasonChecklist, OffseasonChecklistRow } from '../../types';
import { resolveLeagueSeasonLifecycle } from './leagueSeasonLifecycle';
import { getOffseasonRowLabel } from '../offseason/offseasonChecklistState';
import {
  completeStaffHiresReview,
  findCurrentStaffHiresReviewEvidence,
  projectStaffHiringRequirements,
} from '../offseason/staffHiringRequirements';
import { compareGameDates } from '../../utils/dateUtils';

type SkipToPreseasonOptions = {
  targetDate: string;
  manualBlockers?: OffseasonChecklistRow[];
  staffHiresAuthority?: 'manual' | 'delegated';
};

const terminal = (value: unknown) => value === 'done' || value === 'skipped';

/** Composite lifecycle command. Calling it again for the same cycle is state-neutral. */
export function skipToPreseason(state: GameState, options: SkipToPreseasonOptions): GameState {
  let workingState = state;
  const finalStopDate = state.date && compareGameDates(state.date, options.targetDate) > 0
    ? state.date
    : options.targetDate;
  const hasStaffHiresTask = !!state.offseasonChecklist
    && Object.prototype.hasOwnProperty.call(state.offseasonChecklist, 'staffSignings');
  const staffRetirementsCommitted = terminal(state.offseasonChecklist?.staffRetirements);
  if (hasStaffHiresTask && staffRetirementsCommitted) {
    const requirements = projectStaffHiringRequirements(state);
    const reviewed = requirements ? findCurrentStaffHiresReviewEvidence(state, requirements) : undefined;
    if (!reviewed && options.staffHiresAuthority === 'delegated' && requirements && !requirements.actionRequired) {
      workingState = completeStaffHiresReview(state, {
        reviewedBy: state.gameMode === 'commissioner' ? 'commissioner_auto' : 'assistant_gm',
        delegated: true,
      });
    }
  }
  const lifecycle = resolveLeagueSeasonLifecycle(workingState);
  const season = lifecycle.offseasonCycle ?? lifecycle.activeSeason;
  const cycleId = `${lifecycle.mode}:${season}`;
  const manualBlocker = new Set(options.manualBlockers ?? []);
  const currentStaffRequirements = projectStaffHiringRequirements(workingState);
  const currentStaffEvidence = currentStaffRequirements
    ? findCurrentStaffHiresReviewEvidence(workingState, currentStaffRequirements)
    : undefined;
  if (
    hasStaffHiresTask
    && staffRetirementsCommitted
    && currentStaffRequirements
    && !currentStaffEvidence
  ) {
    manualBlocker.add('staffSignings');
  }
  const checklist = workingState.offseasonChecklist;
  if (!checklist) {
    if (lifecycle.currentPhase === 'PRESEASON_ACTIVE') return state;
    return {
      ...workingState,
      date: finalStopDate,
      seasonLifecycle: {
        ...lifecycle,
        currentPhase: 'PRESEASON_ACTIVE',
        nextValidTransition: 'REGULAR_SEASON_ACTIVE',
        offseasonOpen: false,
        offseasonCycle: null,
        taskCycle: { ...lifecycle.taskCycle, status: 'complete' },
      },
    };
  }

  const prior = workingState.offseasonTaskDispositions ?? [];
  const dispositionKey = new Set(prior.map(row => `${row.cycleId}:${row.task}`));
  const additions: NonNullable<GameState['offseasonTaskDispositions']> = [];
  if (
    hasStaffHiresTask
    && currentStaffEvidence
    && !dispositionKey.has(`${cycleId}:staffSignings`)
  ) {
    additions.push({
      cycleId,
      season,
      task: 'staffSignings',
      disposition: 'resolved',
      atDate: finalStopDate,
      summary: currentStaffEvidence.disposition === 'delegated_no_action'
        ? 'No hires required'
        : 'Required staff actions complete',
    });
    dispositionKey.add(`${cycleId}:staffSignings`);
  }
  const resolvedChecklist = { ...checklist } as OffseasonChecklist;
  const seasonReview: OffseasonChecklistRow = 'seasonSummary';
  for (const task of Object.keys(checklist) as OffseasonChecklistRow[]) {
    if (terminal(checklist[task])) continue;
    const disposition = manualBlocker.has(task) ? 'manual-blocker' : task === seasonReview ? 'resolved' : 'skipped';
    if (!dispositionKey.has(`${cycleId}:${task}`)) {
      additions.push({ cycleId, season, task, disposition, atDate: finalStopDate });
    }
    if (!manualBlocker.has(task)) {
      (resolvedChecklist as unknown as Record<string, unknown>)[task] = disposition === 'resolved' ? 'done' : 'skipped';
    }
  }
  if (manualBlocker.size > 0) {
    const firstBlocker = [...manualBlocker][0];
    const blockerLabel = getOffseasonRowLabel(firstBlocker, workingState.leagueStats?.uiMode);
    return {
      ...workingState,
      offseasonChecklist: checklist,
      seasonLifecycle: lifecycle,
      offseasonTaskDispositions: prior.some(row => row.cycleId === cycleId && row.task === firstBlocker)
        ? prior
        : [...prior, {
            cycleId,
            season,
            task: firstBlocker,
            disposition: 'manual-blocker',
            atDate: String(workingState.date ?? finalStopDate),
          }],
      lastOutcome: `Finish ${blockerLabel} before the new season begins.`,
    };
  }
  return {
    ...workingState,
    date: finalStopDate,
    offseasonChecklist: undefined,
    offseasonTaskDispositions: [...prior, ...additions],
    lastOutcome: null,
    draftLotteryResult: undefined,
    draftLotteryReplayPendingYear: undefined,
    activeDraftPicks: undefined,
    activeDraftPassedPicks: undefined,
    activeDraftOrder: undefined,
    seasonLifecycle: {
      ...lifecycle,
      currentPhase: 'PRESEASON_ACTIVE',
      nextValidTransition: 'REGULAR_SEASON_ACTIVE',
      offseasonOpen: false,
      offseasonCycle: null,
      taskCycle: { ...lifecycle.taskCycle, status: 'complete' },
    },
  };
}
