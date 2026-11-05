import type { NBAPlayer } from '../types';
import { isExternalLeagueStatus } from '../constants';
import { getPlayerContractType } from './contractTypes';
import { isOnRoster } from './teamLookup';

export interface TeamRosterContractCounts {
  rosterPlayers: NBAPlayer[];
  total: number;
  standardCount: number;
  guaranteedCount: number;
  nonGuaranteedCount: number;
  twoWayCount: number;
}

function matchesLeagueScope(player: NBAPlayer, teamLeague: string): boolean {
  if (teamLeague === 'NBA') return !isExternalLeagueStatus(player.status);
  if (!player.status) return false;
  return player.status === teamLeague;
}

export function getTeamRosterContractCounts(
  players: NBAPlayer[],
  teamId: number,
  leagueStats?: unknown,
  teamLeague = 'NBA',
): TeamRosterContractCounts {
  const rosterPlayers = players.filter(player => (
    player.tid === teamId
    && isOnRoster(player)
    && matchesLeagueScope(player, teamLeague)
    && getPlayerContractType(player, leagueStats) !== 'none'
  ));
  const twoWayCount = rosterPlayers.filter(player => getPlayerContractType(player, leagueStats) === 'twoWay').length;
  const nonGuaranteedCount = rosterPlayers.filter(player => getPlayerContractType(player, leagueStats) === 'nonGuaranteed').length;
  const standardCount = rosterPlayers.length - twoWayCount;
  return {
    rosterPlayers,
    total: rosterPlayers.length,
    standardCount,
    guaranteedCount: Math.max(0, standardCount - nonGuaranteedCount),
    nonGuaranteedCount,
    twoWayCount,
  };
}
