import type { LeagueStats, PlayoffBracket } from '../../types';

export function resolveFinalsRound(
  leagueStats?: Pick<LeagueStats, 'numGamesPlayoffSeries'> | null,
  playoffs?: Pick<PlayoffBracket, 'series'> | null,
): number {
  const configuredRounds = leagueStats?.numGamesPlayoffSeries?.length ?? 0;
  if (configuredRounds > 0) return configuredRounds;
  return Math.max(1, ...(playoffs?.series ?? []).map(series => Number(series.round) || 0));
}
