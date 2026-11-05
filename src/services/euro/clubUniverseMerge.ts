import type { NBAPlayer, NonNBATeam } from '../../types';
import { historicalEndesaIdentityKey } from '../historicalEndesa/identity';

export type EuroRosterBucket = { players: NBAPlayer[]; teams: NonNBATeam[] };

const normalize = (value?: string) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(basketball|basket|club|bc|bk|kk|cb|baloncesto)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const teamKeys = (team: NonNBATeam): string[] => [
  team.realgmTeamId != null ? `realgm:${team.realgmTeamId}` : '',
  normalize([team.region, team.name].filter(Boolean).join(' ')),
  normalize(team.region),
  normalize(team.name),
].filter(key => key.length >= 4 || key.startsWith('realgm:'));

const playerKey = (player: NBAPlayer) => historicalEndesaIdentityKey(player.name, player.born?.year);

function mapPlayerTeamIds(player: NBAPlayer, aliases: Record<number, number>): NBAPlayer {
  const remap = (tid: unknown) => typeof tid === 'number' && aliases[tid] !== undefined ? aliases[tid] : tid;
  return {
    ...player,
    tid: remap(player.tid) as number,
    stats: player.stats?.map(row => ({ ...row, tid: remap(row.tid) as number })),
    transactions: player.transactions?.map(row => ({ ...row, tid: remap((row as any).tid) as number })),
  } as NBAPlayer;
}

function mergeRows<T extends Record<string, any>>(existing: T[] | undefined, incoming: T[] | undefined, incomingWins: boolean): T[] | undefined {
  if (!existing?.length && !incoming?.length) return undefined;
  const rows = new Map<string, T>();
  const add = (row: T) => {
    const key = [row.season ?? '', row.tid ?? '', row.playoffs === true ? 'po' : 'rs', row.competitionId ?? '', row.type ?? ''].join(':');
    rows.set(key, row);
  };
  (incomingWins ? existing : incoming)?.forEach(add);
  (incomingWins ? incoming : existing)?.forEach(add);
  return [...rows.values()].sort((left, right) => Number(left.season ?? 0) - Number(right.season ?? 0));
}

function mergePlayers(existing: NBAPlayer, incoming: NBAPlayer, incomingWins: boolean, preserveExistingAssignment: boolean): NBAPlayer {
  const primary = incomingWins ? incoming : existing;
  const secondary = incomingWins ? existing : incoming;
  const merged = {
    ...secondary,
    ...primary,
    internalId: existing.internalId,
    ratings: mergeRows(existing.ratings as any[], incoming.ratings as any[], incomingWins) ?? primary.ratings,
    stats: mergeRows(existing.stats as any[], incoming.stats as any[], incomingWins),
    awards: mergeRows(existing.awards as any[], incoming.awards as any[], incomingWins),
    transactions: mergeRows(existing.transactions as any[], incoming.transactions as any[], incomingWins),
    imgURL: primary.imgURL ?? secondary.imgURL,
  };
  if (!preserveExistingAssignment) return merged;
  return {
    ...merged,
    tid: existing.tid,
    status: existing.status,
    contract: existing.contract,
    contractYears: (existing as any).contractYears,
    injury: existing.injury,
  } as NBAPlayer;
}

export function mergeEuroRosterBucket(
  base: EuroRosterBucket,
  incoming: EuroRosterBucket,
  options: { incomingOwnsDomesticIdentity: boolean; preserveExistingAssignments?: boolean },
): EuroRosterBucket & { aliases: Record<number, number> } {
  const teams = base.teams.map(team => ({ ...team }));
  const players = base.players.map(player => ({ ...player }));
  const teamIndexByKey = new Map<string, number>();
  teams.forEach((team, index) => teamKeys(team).forEach(key => teamIndexByKey.set(key, index)));
  const aliases: Record<number, number> = {};

  for (const incomingTeam of incoming.teams) {
    const matchIndex = teamKeys(incomingTeam)
      .map(key => teamIndexByKey.get(key))
      .find((index): index is number => index !== undefined);
    if (matchIndex === undefined) {
      teams.push({ ...incomingTeam });
      const index = teams.length - 1;
      teamKeys(incomingTeam).forEach(key => teamIndexByKey.set(key, index));
      continue;
    }
    const existing = teams[matchIndex];
    aliases[incomingTeam.tid] = existing.tid;
    teams[matchIndex] = options.incomingOwnsDomesticIdentity
      ? { ...existing, ...incomingTeam, tid: existing.tid }
      : { ...incomingTeam, ...existing, tid: existing.tid };
    teamKeys(teams[matchIndex]).forEach(key => teamIndexByKey.set(key, matchIndex));
  }

  const teamByTid = new Map(teams.map(team => [team.tid, team]));
  const playerIndexByKey = new Map(players.map((player, index) => [playerKey(player), index] as const));
  for (const sourcePlayer of incoming.players) {
    const player = mapPlayerTeamIds(sourcePlayer, aliases);
    const canonicalTeam = teamByTid.get(player.tid);
    const normalizedPlayer = canonicalTeam
      ? { ...player, status: canonicalTeam.league as NBAPlayer['status'] }
      : player;
    const key = playerKey(normalizedPlayer);
    const existingIndex = playerIndexByKey.get(key);
    if (existingIndex === undefined) {
      players.push(normalizedPlayer);
      playerIndexByKey.set(key, players.length - 1);
      continue;
    }
    players[existingIndex] = mergePlayers(
      players[existingIndex],
      normalizedPlayer,
      options.incomingOwnsDomesticIdentity,
      options.preserveExistingAssignments === true,
    );
  }

  return { teams, players, aliases };
}
