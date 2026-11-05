import type { NBAPlayer, NonNBATeam } from '../../types';
import { getSpainClubMatchKeys } from '../../data/templates/spain/teamPopulations';
import { historicalEndesaIdentityKey } from '../historicalEndesa/identity';

export function buildSpainClubAliasMap(
  endesaTeams: NonNBATeam[],
  euroleagueTeams: NonNBATeam[],
): { clubAliasMap: Record<number, number>; mergedEuroTeamTids: Set<number> } {
  const endesaTeamsByClubKey = new Map<string, NonNBATeam[]>();
  for (const team of endesaTeams) {
    for (const key of getSpainClubMatchKeys(team)) {
      endesaTeamsByClubKey.set(key, [...(endesaTeamsByClubKey.get(key) ?? []), team]);
    }
  }

  const clubAliasMap: Record<number, number> = {};
  const mergedEuroTeamTids = new Set<number>();
  for (const team of euroleagueTeams) {
    const canonicalTeam = getSpainClubMatchKeys(team)
      .map(key => endesaTeamsByClubKey.get(key))
      .find(matches => matches?.length === 1)?.[0];
    if (!canonicalTeam) continue;
    clubAliasMap[team.tid] = canonicalTeam.tid;
    mergedEuroTeamTids.add(team.tid);
  }
  return { clubAliasMap, mergedEuroTeamTids };
}

export function canonicalizeEuroleaguePlayerForSpain(
  player: NBAPlayer,
  clubAliasMap: Record<number, number>,
): NBAPlayer {
  return {
    ...player,
    tid: clubAliasMap[player.tid] ?? player.tid,
    stats: player.stats?.map(row => ({
      ...row,
      tid: clubAliasMap[row.tid] ?? row.tid,
    })),
    transactions: player.transactions?.map(row => ({
      ...row,
      tid: clubAliasMap[row.tid] ?? row.tid,
    })),
  };
}

export function getSpainCrossSourcePlayerIdentityKey(player: Pick<NBAPlayer, 'name' | 'born'>): string {
  return historicalEndesaIdentityKey(player.name, player.born?.year);
}

function compareEuroleagueOpeningUsage(left: NBAPlayer, right: NBAPlayer, sourceSeason: number): number {
  const row = (player: NBAPlayer) => (player.stats ?? [])
    .filter(stat => stat.season === sourceSeason && stat.playoffs !== true && stat.competitionId === 'euroleague')
    .sort((a, b) => Number(b.gp ?? 0) - Number(a.gp ?? 0) || Number(b.min ?? 0) - Number(a.min ?? 0))[0];
  const leftRow = row(left);
  const rightRow = row(right);
  return Number(rightRow?.gp ?? 0) - Number(leftRow?.gp ?? 0)
    || Number(rightRow?.min ?? 0) - Number(leftRow?.min ?? 0)
    || Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0)
    || left.internalId.localeCompare(right.internalId);
}

export function fitEuroleaguePlayersIntoSpainOpeningRosters({
  endesaPlayers,
  euroleaguePlayers,
  endesaTeams,
  sourceSeason,
  rosterLimit,
}: {
  endesaPlayers: NBAPlayer[];
  euroleaguePlayers: NBAPlayer[];
  endesaTeams: NonNBATeam[];
  sourceSeason: number;
  rosterLimit: number;
}): NBAPlayer[] {
  const endesaTeamIds = new Set(endesaTeams.map(team => team.tid));
  const rosterCounts = new Map<number, number>();
  for (const player of endesaPlayers) {
    if (!endesaTeamIds.has(player.tid) || player.status === 'Retired') continue;
    rosterCounts.set(player.tid, (rosterCounts.get(player.tid) ?? 0) + 1);
  }

  const admittedIds = new Set<string>();
  const candidatesByTid = new Map<number, NBAPlayer[]>();
  for (const player of euroleaguePlayers) {
    if (!endesaTeamIds.has(player.tid)) continue;
    candidatesByTid.set(player.tid, [...(candidatesByTid.get(player.tid) ?? []), player]);
  }
  for (const [tid, candidates] of candidatesByTid) {
    const openSlots = Math.max(0, rosterLimit - (rosterCounts.get(tid) ?? 0));
    for (const player of candidates.sort((a, b) => compareEuroleagueOpeningUsage(a, b, sourceSeason)).slice(0, openSlots)) {
      admittedIds.add(player.internalId);
    }
  }

  return euroleaguePlayers.map(player => {
    if (!endesaTeamIds.has(player.tid) || admittedIds.has(player.internalId)) return player;
    return {
      ...player,
      tid: -1,
      status: 'Free Agent' as const,
      euroMarketSalaryStatus: player.euroMarketSalaryStatus ?? player.status,
      contract: undefined,
    };
  });
}
