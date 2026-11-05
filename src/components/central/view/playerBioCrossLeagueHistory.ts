import type { NBAGMStat, NBAPlayer } from '../../../types';
import { getCanonicalEuroStatCompetitionId } from '../../../services/euro/statsArchive';
import { getHistoricalAwardsForIdentity, getVerifiedBioForPlayerIdentity } from '../../../data/realPlayerDataFetcher';

export function getPlayerBioNbaSourceAwards(player: NBAPlayer, completedThrough: number): NonNullable<NBAPlayer['awards']> {
  const identity = getVerifiedBioForPlayerIdentity(player);
  if (!identity) return [];
  return getHistoricalAwardsForIdentity({ ...player, srID: identity.slug }, completedThrough + 1)
    .map(award => ({ ...award, competitionId: award.competitionId ?? 'nba' }));
}

const normalizeScope = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export interface PlayerBioLeagueContext {
  tag: string;
  title: string;
  calendarYearSeason?: boolean;
}

export function getPlayerBioDefaultLeagueContext(uiMode: unknown): PlayerBioLeagueContext | undefined {
  if (normalizeScope(uiMode) === 'wnba_isolated') {
    return { tag: 'WNBA', title: 'WNBA', calendarYearSeason: true };
  }
  return undefined;
}

export function formatPlayerBioSeasonLabel(
  season: number,
  context?: PlayerBioLeagueContext,
): string {
  return context?.calendarYearSeason
    ? String(season)
    : `${season - 1}-${String(season).slice(2)}`;
}

export function getPlayerBioStatCompetitionKey(row: NBAGMStat, defaultLeagueTag?: string): string {
  const raw = row as NBAGMStat & Record<string, unknown>;
  const archive = normalizeScope(raw._archiveCompetitionId);
  if (archive) return archive;
  const canonical = getCanonicalEuroStatCompetitionId(raw);
  if (canonical) return canonical;
  const explicit = normalizeScope(row.competitionId);
  if (explicit) return explicit;
  const source = normalizeScope(raw._source);
  const league = normalizeScope(raw.league ?? raw.leagueTag ?? raw.tag ?? raw.title);
  if (source.includes('pba') || league === 'pba' || (Number(row.tid) >= 2000 && Number(row.tid) < 3000)) return 'pba';
  if (league === 'wnba' || normalizeScope(defaultLeagueTag) === 'wnba') return 'wnba';
  if (source.includes('summer-league')) return 'nba-summer-league';
  return 'nba';
}

const richness = (row: NBAGMStat): number => Object.values(row).filter(value => value !== undefined && value !== null && value !== '').length;

export function mergePlayerBioStatScopeRows(primary: NBAGMStat[], enrichment: NBAGMStat[]): NBAGMStat[] {
  const rows = new Map<string, NBAGMStat>();
  for (const row of [...enrichment, ...primary]) {
    const raw = row as NBAGMStat & Record<string, unknown>;
    const abbrev = normalizeScope(raw.abbrev ?? raw.teamAbbrev ?? raw.tm);
    const team = abbrev || String(Number(row.tid ?? -1));
    const key = `${Number(row.season)}|${row.playoffs ? 1 : 0}|${getPlayerBioStatCompetitionKey(row)}|${team}`;
    const previous = rows.get(key);
    if (!previous || richness(row) >= richness(previous)) rows.set(key, row);
  }
  return [...rows.values()].sort((left, right) => Number(left.season) - Number(right.season));
}
