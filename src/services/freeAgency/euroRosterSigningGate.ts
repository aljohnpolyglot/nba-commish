import type { NBAPlayer } from '../../types';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { isOnRoster } from '../../utils/teamLookup';

export function getEuroSeniorRosterSigningGate(
  players: readonly NBAPlayer[],
  teamId: number,
  leagueStats?: { maxStandardPlayersPerTeam?: number } | null,
) {
  const standardCount = players.filter(player => player.tid === teamId && isOnRoster(player)).length;
  const maxStandard = getStandardRosterLimit(leagueStats);
  return {
    standardCount,
    maxStandard,
    full: standardCount >= maxStandard,
  };
}
