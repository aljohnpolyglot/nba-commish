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

export type PbaConferencePhase = 'regularSeason' | 'playoffs' | 'offseason' | 'complete';

export function isPbaActiveConferencePhase(phase?: string | null): phase is 'regularSeason' | 'playoffs' {
  return phase === 'regularSeason' || phase === 'playoffs';
}

export function isPbaOffseasonPhase(phase?: string | null): phase is 'offseason' {
  return phase === 'offseason';
}

export function getPbaCompetitionIdForConference(conference?: string | null): string {
  if (conference === 'commissioners') return 'pba-commissioners-cup';
  if (conference === 'governors') return 'pba-governors-cup';
  return 'pba-philippine-cup';
}

export function getActivePbaCompetitionId(state: {
  leagueStats?: { uiMode?: string | null; pbaConference?: string | null; pbaConferencePhase?: string | null };
}): string | null {
  const leagueStats = state.leagueStats;
  if (leagueStats?.uiMode !== 'pba_isolated') return null;
  const phase = leagueStats.pbaConferencePhase;
  if (phase === 'offseason' || phase === 'complete') return null;
  return getPbaCompetitionIdForConference(leagueStats.pbaConference);
}

export function isPbaActiveConferenceMode(state: {
  leagueStats?: { uiMode?: string | null; pbaConferencePhase?: string | null };
}): boolean {
  return state.leagueStats?.uiMode === 'pba_isolated'
    && isPbaActiveConferencePhase(state.leagueStats?.pbaConferencePhase);
}

export function isPbaOffseasonMode(state: {
  leagueStats?: { uiMode?: string | null; pbaConferencePhase?: string | null };
}): boolean {
  return state.leagueStats?.uiMode === 'pba_isolated'
    && isPbaOffseasonPhase(state.leagueStats?.pbaConferencePhase);
}

export function isNonNbaIsolatedMode(state: {
  leagueStats?: { uiMode?: string | null };
}): boolean {
  return state.leagueStats?.uiMode === 'euro_isolated'
    || state.leagueStats?.uiMode === 'pba_isolated';
}
