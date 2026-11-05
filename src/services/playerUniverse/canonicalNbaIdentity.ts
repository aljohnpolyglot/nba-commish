import type { NBAPlayer } from '../../types';
import { STATIC_NBA_TEAMS } from '../../data/staticNbaTeams';
import { normalizeHistoricalNbaTeamAbbrev } from '../../utils/historicalNbaTeamAbbrev';

type PlayerIdentityIndex = {
  has(player: NBAPlayer): boolean;
};

const isNbaTeamId = (value: unknown): boolean => {
  const tid = Number(value);
  return Number.isInteger(tid) && tid >= 0 && tid < 100;
};

const NBA_ABBREVS = new Set(STATIC_NBA_TEAMS.map(team => team.abbrev));

const isNbaTeamAbbrev = (value: unknown): boolean => {
  const abbrev = normalizeHistoricalNbaTeamAbbrev(value);
  return abbrev !== null && NBA_ABBREVS.has(abbrev);
};

export function hasNbaCareerFootprint(player: NBAPlayer): boolean {
  if (isNbaTeamId(player.tid)) return true;
  if ((player.stats ?? []).some(row => isNbaTeamId(row.tid) || isNbaTeamAbbrev((row as { abbrev?: unknown }).abbrev))) return true;
  if ((player.transactions ?? []).some(row => isNbaTeamId(row.tid))) return true;

  const round = Number(player.draft?.round ?? 0);
  const pick = Number(player.draft?.pick ?? 0);
  const draftAbbrev = String(
    player.draftAbbrev ?? (player.draft as { abbrev?: unknown } | undefined)?.abbrev ?? '',
  ).trim();
  return round > 0 && pick > 0 && (isNbaTeamId(player.draft?.tid) || draftAbbrev.length > 0);
}

export function shouldRetainNbaMasterPlayer(
  player: NBAPlayer,
  externalIdentityIndex: PlayerIdentityIndex,
  externalStatuses: ReadonlySet<string>,
): boolean {
  if (externalStatuses.has(String(player.status ?? ''))) return false;
  if (hasNbaCareerFootprint(player)) return true;
  return !externalIdentityIndex.has(player);
}
