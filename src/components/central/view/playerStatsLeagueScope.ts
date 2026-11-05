import type { NBAPlayer } from '../../../types';
import { isPlayerInLeagueScope } from '../../../utils/playerLeagueScope';
import { scopeHistoryPlayersToLeague, type HistoryLeagueBucket } from './historyLeagueScope';

export function scopePlayerStatsPlayersToLeague(
  players: readonly NBAPlayer[],
  teams: readonly { id: number; abbrev?: string }[],
  bucket: HistoryLeagueBucket,
): NBAPlayer[] {
  const teamIds = new Set(teams.map(team => Number(team.id)).filter(Number.isFinite));
  const scoped = scopeHistoryPlayersToLeague(players, teams, bucket);
  return scoped.filter((player, index) => {
    if ((player.stats ?? []).some(stat => Number(stat.gp ?? 0) > 0)) return true;
    const original = players[index];
    if (bucket === 'nba') return isPlayerInLeagueScope(original, 'nba', teamIds);
    return teamIds.has(Number(original.tid))
      || original.status === 'WNBA'
      || original.gender === 'female'
      || String(original.internalId ?? '').toLowerCase().startsWith('wnba-');
  });
}
