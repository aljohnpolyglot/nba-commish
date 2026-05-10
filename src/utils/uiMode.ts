export function isEuroIsolatedMode(state: {
  leagueStats?: { uiMode?: string | null };
}): boolean {
  return state.leagueStats?.uiMode === 'euro_isolated';
}
