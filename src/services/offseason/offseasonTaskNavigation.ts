import type { GameState, OffseasonChecklistRow, Tab } from '../../types';
import { isFranchiseExperienceAvailable } from '../franchises/franchiseState';
import { OFFSEASON_ROW_TAB } from './offseasonChecklistState';

type NavigationState = Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats'>;

export function resolveOffseasonTaskView(
  row: OffseasonChecklistRow,
  state: NavigationState,
): Tab | null {
  if (row !== 'sponsorRenewals') return OFFSEASON_ROW_TAB[row];
  if (isFranchiseExperienceAvailable(state)) return 'Franchises';
  return state.leagueStats.uiMode === 'euro_isolated'
    ? 'Front Office Sponsorships'
    : null;
}
