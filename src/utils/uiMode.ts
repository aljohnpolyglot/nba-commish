export function isEuroIsolatedMode(state: {
  leagueStats?: { uiMode?: string | null };
}): boolean {
  return state.leagueStats?.uiMode === 'euro_isolated';
}

export function isPbaIsolatedMode(state: {
  leagueStats?: { uiMode?: string | null };
}): boolean {
  return state.leagueStats?.uiMode === 'pba_isolated';
}

export function isNonNbaIsolatedMode(state: {
  leagueStats?: { uiMode?: string | null };
}): boolean {
  return state.leagueStats?.uiMode === 'euro_isolated'
    || state.leagueStats?.uiMode === 'pba_isolated';
}
