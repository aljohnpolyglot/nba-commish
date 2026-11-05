import type { NBAPlayer } from '../../types';

export type ExpansionLeague = 'nba' | 'pba' | 'wnba';

const NBA_EXCLUDED_STATUSES = new Set([
  'Retired',
  'WNBA',
  'Euroleague',
  'PBA',
  'B-League',
  'G-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
  'Free Agent',
  'Draft Prospect',
  'Prospect',
]);

export function getExpansionLeague(schedule?: { league?: ExpansionLeague } | null): ExpansionLeague {
  return schedule?.league ?? 'nba';
}

export function isPrimaryExpansionRosterPlayer(
  player: Pick<NBAPlayer, 'tid' | 'status'>,
  teamIds: ReadonlySet<number>,
  league: ExpansionLeague,
): boolean {
  if (!teamIds.has(Number(player.tid))) return false;
  if (league === 'wnba') return player.status === 'WNBA';
  if (league === 'pba') return player.status === 'PBA';
  return !NBA_EXCLUDED_STATUSES.has(String(player.status));
}

export function getPrimaryDraftRounds(league: ExpansionLeague): number {
  return league === 'wnba' ? 3 : 2;
}
