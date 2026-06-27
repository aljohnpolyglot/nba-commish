export const PBA_STANDARD_ROSTER_LIMIT = 18;
export const PBA_TRAINING_CAMP_ROSTER_LIMIT = 18;

type LeagueRosterLimits = {
  uiMode?: string | null;
  maxStandardPlayersPerTeam?: number | null;
  maxTrainingCampRoster?: number | null;
  maxTwoWayPlayersPerTeam?: number | null;
  twoWayContractsEnabled?: boolean | null;
};

export function getStandardRosterLimit(leagueStats?: LeagueRosterLimits | null): number {
  if (leagueStats?.uiMode === 'pba_isolated') return PBA_STANDARD_ROSTER_LIMIT;
  return Number(leagueStats?.maxStandardPlayersPerTeam ?? 15);
}

export function getTrainingCampRosterLimit(leagueStats?: LeagueRosterLimits | null): number {
  if (leagueStats?.uiMode === 'pba_isolated') return PBA_TRAINING_CAMP_ROSTER_LIMIT;
  return Number(leagueStats?.maxTrainingCampRoster ?? 21);
}

export function getTwoWayRosterLimit(leagueStats?: LeagueRosterLimits | null): number {
  if (leagueStats?.uiMode === 'pba_isolated' || leagueStats?.twoWayContractsEnabled === false) return 0;
  return Number(leagueStats?.maxTwoWayPlayersPerTeam ?? 3);
}
