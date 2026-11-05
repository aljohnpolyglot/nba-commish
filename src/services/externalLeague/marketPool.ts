import type { NBAPlayer } from '../../types';

export function selectExternalMarketPlayers(
  players: readonly NBAPlayer[],
  _options: { showcaseRosterSize?: number } = {},
): NBAPlayer[] {
  return [...players]
    .sort((left, right) =>
      Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0)
      || Number(right.potential ?? 0) - Number(left.potential ?? 0)
      || left.name.localeCompare(right.name),
    );
}
