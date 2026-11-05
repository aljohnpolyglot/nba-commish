import type { NBAPlayer } from '../types';
import { getPlayerIdentityEvidenceTokens, resolveCanonicalPersonId } from './playerIdentity';

export interface FranchiseCareerLoyalty {
  playerKey: 'kobe-bryant' | 'dirk-nowitzki' | 'tim-duncan' | 'udonis-haslem';
  franchiseTid: number;
  franchiseAbbrev: 'LAL' | 'DAL' | 'SAS' | 'MIA';
}

const CAREER_LOYALTY_BY_IDENTITY = new Map<string, FranchiseCareerLoyalty>([
  ['bryanko01', { playerKey: 'kobe-bryant', franchiseTid: 13, franchiseAbbrev: 'LAL' }],
  ['nowitdi01', { playerKey: 'dirk-nowitzki', franchiseTid: 6, franchiseAbbrev: 'DAL' }],
  ['duncati01', { playerKey: 'tim-duncan', franchiseTid: 25, franchiseAbbrev: 'SAS' }],
  ['hasleud01', { playerKey: 'udonis-haslem', franchiseTid: 15, franchiseAbbrev: 'MIA' }],
]);

function getStrongBasketballReferenceIdentity(player: NBAPlayer): string | undefined {
  const personId = resolveCanonicalPersonId(player).toLowerCase();
  const personMatch = personId.match(/^person:bref:([a-z0-9]+)$/);
  if (personMatch) return personMatch[1];

  for (const token of getPlayerIdentityEvidenceTokens(player)) {
    const match = token.toLowerCase().match(/^bref:([a-z0-9]+)$/);
    if (match) return match[1];
  }
  return undefined;
}

export function getFranchiseCareerLoyalty(player: NBAPlayer): FranchiseCareerLoyalty | undefined {
  const identity = getStrongBasketballReferenceIdentity(player);
  return identity ? CAREER_LOYALTY_BY_IDENTITY.get(identity) : undefined;
}

function getLatestNbaRegularSeasonTid(player: NBAPlayer): number {
  const rows = (player.stats ?? [])
    .filter(row => !row.playoffs && Number(row.gp ?? 0) > 0)
    .filter(row => Number(row.tid) >= 0 && Number(row.tid) < 100)
    .sort((left, right) => Number(right.season ?? 0) - Number(left.season ?? 0));
  return Number(rows[0]?.tid ?? -1);
}

/**
 * True only while the canonical real player is still with his designated NBA
 * franchise, or is a free agent whose most recent NBA season was there. This
 * deliberately does not move or heal a player who already left in an old save.
 */
export function isFranchiseCareerLoyaltyActive(player: NBAPlayer): boolean {
  const designation = getFranchiseCareerLoyalty(player);
  if (!designation || player.status === 'Retired' || player.diedYear != null) return false;
  if (player.tid >= 0) return player.tid === designation.franchiseTid;
  return getLatestNbaRegularSeasonTid(player) === designation.franchiseTid;
}

export function getFranchiseCareerLoyaltyTid(player: NBAPlayer): number {
  const designation = getFranchiseCareerLoyalty(player);
  return designation && isFranchiseCareerLoyaltyActive(player)
    ? designation.franchiseTid
    : -1;
}

export function withFranchiseCareerLoyalty<T extends NBAPlayer>(player: T): T {
  if (!isFranchiseCareerLoyaltyActive(player)) return player;
  const traits = new Set<string>((player.moodTraits ?? []).filter(trait => trait !== 'MERCENARY'));
  traits.add('LOYAL');
  const moodTraits = [...traits] as T['moodTraits'];
  if (
    moodTraits.length === player.moodTraits?.length
    && moodTraits.every((trait, index) => trait === player.moodTraits?.[index])
  ) return player;
  return { ...player, moodTraits };
}
