import { NBAPlayer } from '../types';

/**
 * Returns teammates who are listed as relatives of the given player.
 * Relatives come from BBGM roster data (brother/father/son) and are matched by name
 * since BBGM `pid` numbers don't line up with our `internalId`.
 */
export function getFamilyOnRoster(player: NBAPlayer, roster: NBAPlayer[]): NBAPlayer[] {
  const rel = player.relatives;
  if (!rel || rel.length === 0) return [];
  const relNames = new Set(rel.map(r => r.name));
  return roster.filter(p => p.internalId !== player.internalId && relNames.has(p.name));
}

export function hasFamilyOnRoster(player: NBAPlayer, roster: NBAPlayer[]): boolean {
  return getFamilyOnRoster(player, roster).length > 0;
}
