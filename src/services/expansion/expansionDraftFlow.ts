import type { GameState } from '../../types';

export function isExpansionDraftDueNow(state: Pick<GameState, 'expansionSchedule' | 'leagueStats'>): boolean {
  const leagueYear = state.leagueStats?.year;
  return !!state.expansionSchedule && leagueYear != null && state.expansionSchedule.year === leagueYear;
}

export function hasPreparedExpansionDraft(state: Partial<GameState>): boolean {
  return (
    Object.keys(state.activeExpansionDraftPicks ?? {}).length > 0 ||
    Object.keys(state.expansionDraftProtections ?? {}).length > 0 ||
    Array.isArray(state.expansionEligiblePlayers)
  );
}
