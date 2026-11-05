import type { GameState } from '../../types';
import { getAllStarWeekendStartDate, toISODateString } from '../../utils/dateUtils';
import { compileTargetPlan } from '../simulation/targetPlanner';

export function getAllStarEventsSimulationTarget(
  seasonYear: number,
  leagueStats?: GameState['leagueStats'],
): string {
  return toISODateString(getAllStarWeekendStartDate(seasonYear, leagueStats));
}

export function createDraftLotterySimulationPayload(targetDate: string, state?: GameState) {
  return {
    targetDate,
    stopBefore: true,
    ...(state ? { targetPlan: compileTargetPlan(state, 'UNTIL_DRAFT_LOTTERY', targetDate) } : {}),
  } as const;
}

export function createOffseasonSimulationPayload(targetDate: string, state?: GameState) {
  return {
    targetDate,
    stopBefore: true,
    assistantGM: true,
    autoResolveOffseasonTasks: true,
    ...(state ? { targetPlan: compileTargetPlan(state, 'TO_OFFSEASON', targetDate) } : {}),
  } as const;
}
