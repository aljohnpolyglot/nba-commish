import type { LeagueStats, NBAPlayer } from '../../types';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { isOnRoster } from '../../utils/teamLookup';

export function buildEuroTransferRosterCounts(
  players: readonly NBAPlayer[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const player of players) {
    const tid = Number(player.tid);
    if (!Number.isFinite(tid) || tid < 0 || !isOnRoster(player)) continue;
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }
  return counts;
}

export function hasEuroTransferRosterCapacityFromCounts(
  rosterCounts: ReadonlyMap<number, number>,
  teamId: number,
  leagueStats: LeagueStats,
): boolean {
  return (rosterCounts.get(teamId) ?? 0) < getStandardRosterLimit(leagueStats);
}

export function hasEuroTransferRosterCapacity(
  players: readonly NBAPlayer[],
  teamId: number,
  leagueStats: LeagueStats,
): boolean {
  return hasEuroTransferRosterCapacityFromCounts(
    buildEuroTransferRosterCounts(players),
    teamId,
    leagueStats,
  );
}
