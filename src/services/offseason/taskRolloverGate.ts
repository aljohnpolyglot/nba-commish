import type { GameState, OffseasonChecklistRow } from '../../types';
import { applySeasonRollover, shouldFireRollover } from '../logic/seasonRollover';
import { advanceHistoricalPbaSeason } from '../pba/historicalLifecycle';
import { getCachedHistoricalPbaSource } from '../pba/historicalLoader';
import { canActivateNextSeason } from '../lifecycle/leagueSeasonLifecycle';

const NBA_SEASON_TRANSITION_OWNER: OffseasonChecklistRow = 'retiredPlayersReview';
const PBA_ROLLOVER_DEPENDENT_ROWS = new Set<OffseasonChecklistRow>([
  'retiredPlayersReview',
  'memorialDecisions',
  'staffRetirements',
  'staffSignings',
  'options',
  'qualifyingOffers',
  'myFAs',
  'governorsBoardMeeting',
  'freeAgency',
  'summerLeague',
  'internationalTournament',
  'hofCeremony',
  'strategyReview',
  'trainingCamp',
  'pbaDraft',
]);

export function shouldPrepareSeasonRolloverForTask(
  state: GameState,
  row: OffseasonChecklistRow,
): boolean {
  if (state.leagueStats?.uiMode === 'pba_isolated') {
    if (!PBA_ROLLOVER_DEPENDENT_ROWS.has(row)) return false;
    const leagueStats = state.leagueStats;
    if (leagueStats.pbaConference !== 'governors' || leagueStats.pbaConferencePhase !== 'offseason') return false;
    if (state.offseasonChecklist?.pbaConferenceAwards !== 'done') return false;
    const completedSeason = Number(leagueStats.year);
    const preparedSeason = Number(leagueStats.pbaYearEndRolloverPreparedSeason);
    return !Number.isFinite(preparedSeason) || completedSeason !== preparedSeason + 1;
  }
  if (state.leagueStats?.uiMode === 'euro_isolated') return false;
  if (row !== NBA_SEASON_TRANSITION_OWNER) return false;
  if (!canActivateNextSeason(state)) return false;
  return shouldFireRollover(state, String(state.date ?? ''));
}

export function prepareSeasonRolloverForTask(
  state: GameState,
  row: OffseasonChecklistRow,
): GameState {
  if (!shouldPrepareSeasonRolloverForTask(state, row)) return state;
  if (state.leagueStats?.uiMode !== 'pba_isolated') {
    return { ...state, ...applySeasonRollover(state) };
  }
  const completedSeason = Number(state.leagueStats.year);
  const rolloverPatch = applySeasonRollover(state);
  const rolledState = {
    ...state,
    ...rolloverPatch,
    offseasonChecklist: state.offseasonChecklist,
    leagueStats: {
      ...(rolloverPatch.leagueStats ?? state.leagueStats),
      pbaConference: 'governors' as const,
      pbaConferencePhase: 'offseason' as const,
      pbaYearEndRolloverPreparedSeason: completedSeason,
      pbaDraftComplete: false,
      pbaDraftCompleteSeason: undefined,
    },
  } as GameState;
  const historicalSource = getCachedHistoricalPbaSource();
  const materializedState = historicalSource
    ? advanceHistoricalPbaSeason(rolledState, historicalSource)
    : rolledState;
  return {
    ...materializedState,
    pendingGovernorsBoardMeeting: state.pendingGovernorsBoardMeeting,
    offseasonChecklist: state.offseasonChecklist,
    leagueStats: {
      ...materializedState.leagueStats,
      pbaConference: 'governors',
      pbaConferencePhase: 'offseason',
      pbaYearEndRolloverPreparedSeason: completedSeason,
      pbaDraftComplete: false,
      pbaDraftCompleteSeason: undefined,
    },
  };
}
