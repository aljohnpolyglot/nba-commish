import type { GameTimingConfig } from '../../utils/gameClock';
import { distributeBudgets } from './inline-pbp/budgetDistributor';
import type { PlayerQuarterBudget } from './inline-pbp/types';
import type { PlayerGameStats } from './types';

const pointsFromBudget = (budget?: PlayerQuarterBudget): number => budget
  ? budget.fg2 * 2 + budget.fg3 * 3 + budget.fg4 * 4 + budget.ftm
  : 0;

const reboundsFromBudget = (budget?: PlayerQuarterBudget): number => budget
  ? budget.orb + budget.drb
  : 0;

export function annotateFourthQuarterPoints(
  homeStats: PlayerGameStats[],
  awayStats: PlayerGameStats[],
  quarterScores: { home: number[]; away: number[] },
  otCount: number,
  timingConfig: GameTimingConfig,
): void {
  if (timingConfig.numQuarters < 4 || quarterScores.home.length < 4 || quarterScores.away.length < 4) {
    for (const stat of [...homeStats, ...awayStats]) {
      stat.q4Pts = 0;
      stat.q4Reb = 0;
      stat.q4Ast = 0;
    }
    return;
  }

  const fourth = distributeBudgets({
    homeStats,
    awayStats,
    players: [],
    quarterScores,
    otCount,
    timingConfig,
  })[3];

  for (const stat of homeStats) {
    const budget = fourth?.homeByPid.get(stat.playerId);
    stat.q4Pts = pointsFromBudget(budget);
    stat.q4Reb = reboundsFromBudget(budget);
    stat.q4Ast = budget?.ast ?? 0;
  }
  for (const stat of awayStats) {
    const budget = fourth?.awayByPid.get(stat.playerId);
    stat.q4Pts = pointsFromBudget(budget);
    stat.q4Reb = reboundsFromBudget(budget);
    stat.q4Ast = budget?.ast ?? 0;
  }
}
