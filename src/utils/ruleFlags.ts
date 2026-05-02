export function isNbaCupEnabled(leagueStats?: any): boolean {
  return (leagueStats?.nbaCupEnabled ?? leagueStats?.inSeasonTournament) !== false;
}

export function isFourPointEnabled(leagueStats?: any): boolean {
  return (leagueStats?.fourPointLineEnabled ?? leagueStats?.fourPointLine) === true;
}

export function getFourPointDistance(leagueStats?: any): number {
  const distance = Number(leagueStats?.fourPointLineDistance);
  return Number.isFinite(distance) && distance > 0 ? distance : 27;
}

export function isRfaMatchingEnabled(leagueStats?: any): boolean {
  return (leagueStats?.rfaMatchingEnabled ?? leagueStats?.rfaEnabled) !== false;
}
