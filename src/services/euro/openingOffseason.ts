import type { GameState } from '../../types';
import { initializeLeagueSeasonLifecycle } from '../lifecycle/leagueSeasonLifecycle';
import { initialEuroOffseasonChecklist } from '../offseason/offseasonState';

/** New Euro careers review the completed year before their first playable season. */
export function openEuroCareerOffseason(state: GameState): GameState {
  if (state.leagueStats.uiMode !== 'euro_isolated') return state;
  const season = Number(state.leagueStats.year);
  const offseasonChecklist = initialEuroOffseasonChecklist(state.gameMode === 'gm');
  const lifecycle = initializeLeagueSeasonLifecycle({ ...state, offseasonChecklist });
  return {
    ...state,
    offseasonChecklist,
    seasonLifecycle: {
      ...lifecycle,
      completedSeason: season - 1,
      currentPhase: 'OFFSEASON_TASKS_ACTIVE',
      offseasonCycle: season,
      offseasonOpen: true,
      taskCycle: { id: `euro:${season}`, season, status: 'pending' },
      nextValidTransition: 'NEXT_SEASON_PREPARED',
    },
  };
}
