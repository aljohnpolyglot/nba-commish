import type { GameState } from '../../types';
import { getOffseasonState } from '../../services/offseason/offseasonState';
import { resolveLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';

export function isDraftHistoryLiveSession(
  state: GameState,
  viewDraftYear: number,
  leagueYear: number,
  pbaMode: boolean,
): boolean {
  const draftComplete = resolveLeagueSeasonLifecycle(state).draft.draft === 'complete';
  if (pbaMode || viewDraftYear !== leagueYear || draftComplete) return false;
  const openingFantasyIncomplete = state.gameMode === 'gm' && (
    (state.leagueStats?.openingRosterMode === 'fantasy_draft'
      && state.leagueStats?.openingFantasyDraftCompleted !== true)
    || (state.leagueStats?.fictionalRosterMode === 'fantasy_draft'
      && state.leagueStats?.fictionalFantasyDraftCompleted !== true)
  );
  if (openingFantasyIncomplete) return false;
  if (!state.activeDraftOrder?.length) return false;
  return getOffseasonState(
    state.date,
    state.leagueStats,
    state.schedule,
    { draftComplete },
  ).phase === 'draftDay';
}
