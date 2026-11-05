import type { GameResult, GameState, HistoricalStatPoint } from '../../types';
import { calculateNewStats } from '../../store/logic/turn/statUpdater';
import { getSimulationSeed } from '../saveIdentity';
import { withDeterministicRandom } from './deterministicRandom';

export type SimulatedDayResults = { date: string; results: GameResult[] };

export interface BulkDailyStatsResult {
  stats: GameState['stats'];
  leagueStats: GameState['leagueStats'];
  historicalPoints: HistoricalStatPoint[];
  daysProcessed: number;
  /** Contract diagnostic: the accumulator mutates one private shell in place. */
  fullStateReconstructions: 0;
}

/**
 * Preserves the legacy day-by-day RNG and financial/viewership semantics while
 * avoiding a new full GameState-shaped object for every historical point.
 */
export function calculateBulkDailyStats(
  state: GameState,
  days: SimulatedDayResults[],
): BulkDailyStatsResult {
  const workingState = {
    ...state,
    stats: { ...state.stats },
    leagueStats: { ...state.leagueStats },
  };
  const historicalPoints: HistoricalStatPoint[] = [];
  for (const day of days) {
    // Revenue/viewership helpers read state.date to resolve the canonical
    // calendar phase. A private accumulator must therefore advance with each
    // semantic day; retaining the batch-start date makes a chunk that crosses
    // Opening Week (or any other phase boundary) observably batch-size dependent.
    workingState.date = day.date;
    const { newStats, newLeagueStats } = withDeterministicRandom(
      `${getSimulationSeed(state)}:bulk-daily-stats:${day.date}`,
      () => calculateNewStats(
        workingState,
        { type: 'ADVANCE_DAY' } as never,
        {},
        day.results,
        0,
        day.date,
      ),
    );
    Object.assign(workingState.stats, newStats);
    workingState.leagueStats = newLeagueStats;
    historicalPoints.push({
      date: day.date,
      publicApproval: newStats.publicApproval,
      ownerApproval: newStats.ownerApproval,
      playerApproval: newStats.playerApproval,
      legacy: newStats.legacy,
      revenue: newLeagueStats.revenue,
      annualRevenue: newLeagueStats.mediaRights?.totalRev
        ? newLeagueStats.mediaRights.totalRev * 1000
        : newLeagueStats.revenue,
      leagueReserve: newStats.leagueReserve,
      availableBudget: newStats.availableBudget,
      viewership: newLeagueStats.viewership,
    });
  }
  return {
    stats: workingState.stats,
    leagueStats: workingState.leagueStats,
    historicalPoints,
    daysProcessed: days.length,
    fullStateReconstructions: 0,
  };
}
