import type { NBAPlayer } from '../../types';
import { isDraftProspectEligibleForScope } from '../../utils/playerLeagueScope';

export const CANONICAL_PLAYER_LOAD_MIGRATION_VERSION = 3;

export function restoreCanonicalHistoricalDraftClasses(
  players: NBAPlayer[],
  sourceProspects: NBAPlayer[],
  currentSeasonYear: number,
): NBAPlayer[] {
  const eligibleYears = new Set(Array.from({ length: 4 }, (_, index) => currentSeasonYear + index));
  const existingIds = new Set(players.map(player => player.internalId));
  const additions = sourceProspects.filter(player => (
    eligibleYears.has(Number(player.draft?.year))
    && !existingIds.has(player.internalId)
  ));
  const completeYears = new Set<number>();
  for (const year of eligibleYears) {
    const canonicalCount = [...players, ...additions].filter(player => (
      player.tid === -2
      && Number(player.draft?.year) === year
      && !String(player.internalId).startsWith('gen-')
      && isDraftProspectEligibleForScope(player, 'nba', year)
    )).length;
    if (canonicalCount >= 25) completeYears.add(year);
  }
  if (completeYears.size === 0) return players;
  return [
    ...players.filter(player => !(
      player.tid === -2
      && completeYears.has(Number(player.draft?.year))
      && String(player.internalId).startsWith(`gen-${player.draft?.year}-`)
      && isDraftProspectEligibleForScope(player, 'nba', Number(player.draft?.year))
    )),
    ...additions.filter(player => completeYears.has(Number(player.draft?.year))),
  ];
}
