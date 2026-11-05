import { normalizePlayerAwardType } from './playerAwardNormalizer';
import { FIRST_BASKETBALL_YEAR } from '../services/era/basketballEraRules';

type AwardLike = {
  season?: number;
  type?: string;
  competitionId?: string;
  introducedSeason?: number;
};

type ScopedPlayerAward = AwardLike & {
  season: number;
  type: string;
  competitionId?: string;
};

type HistoricalAwardIdentity = ScopedPlayerAward & {
  pid?: string;
  name?: string;
};

const AWARD_INTRODUCTION_SEASONS: Array<{ pattern: RegExp; firstSeason: number }> = [
  { pattern: /conference finals mvp|semifinals mvp|eastern conference finals|western conference finals|larry bird|magic johnson/i, firstSeason: 2022 },
  { pattern: /clutch player/i, firstSeason: 2023 },
  { pattern: /nba cup|in-season tournament/i, firstSeason: 2024 },
  { pattern: /defensive player of the year|^dpoy$/i, firstSeason: 1983 },
  { pattern: /sixth man|^smoy$/i, firstSeason: 1983 },
  { pattern: /most improved|^mip$/i, firstSeason: 1986 },
  { pattern: /all-nba third team/i, firstSeason: 1989 },
  { pattern: /finals mvp/i, firstSeason: 1969 },
  { pattern: /^(most valuable player|mvp)$/i, firstSeason: 1956 },
  { pattern: /all-defensive/i, firstSeason: 1969 },
  { pattern: /coach of the year|^coy$/i, firstSeason: 1963 },
  { pattern: /rookie of the year|^roy$/i, firstSeason: 1953 },
  { pattern: /all-star/i, firstSeason: 1951 },
];

export function isValidAwardSeason(season: unknown): boolean {
  const value = Number(season);
  return Number.isFinite(value) && value >= FIRST_BASKETBALL_YEAR;
}

export function getAwardIntroductionSeason(
  type: unknown,
  competitionId?: unknown,
  introducedSeason?: unknown,
): number {
  const explicit = Number(introducedSeason);
  if (Number.isFinite(explicit) && explicit >= 1900) return explicit;
  if (String(competitionId ?? '').trim()) return FIRST_BASKETBALL_YEAR;
  const text = normalizePlayerAwardType(type) || String(type ?? '').trim();
  if (!text) return 1947;
  return AWARD_INTRODUCTION_SEASONS.find(entry => entry.pattern.test(text))?.firstSeason ?? 1947;
}

export function isAwardIntroducedForSeason(
  type: unknown,
  season: unknown,
  competitionId?: unknown,
  introducedSeason?: unknown,
): boolean {
  const value = Number(season);
  if (!Number.isFinite(value)) return false;
  return value >= getAwardIntroductionSeason(type, competitionId, introducedSeason);
}

export function isAwardVisibleInTimeline(award: AwardLike | undefined, maxSeason = Infinity): boolean {
  if (!award || !isValidAwardSeason(award.season)) return false;
  const season = Number(award.season);
  return season <= maxSeason && isAwardIntroducedForSeason(
    award.type,
    season,
    award.competitionId,
    award.introducedSeason,
  );
}

export function filterAwardsToVisibleTimeline<T extends AwardLike>(awards: T[] | undefined, maxSeason: number): T[] {
  return (awards ?? []).filter(award => isAwardVisibleInTimeline(award, maxSeason));
}

export function getPlayerStatsAwardMaxSeason(
  selectedSeason: number | 'all' | 'career',
  currentSeason: number,
  historicalCutoff: number,
): number {
  return selectedSeason === currentSeason ? currentSeason : historicalCutoff;
}

export function getAllStarSelectionSeasons(awards: AwardLike[] | undefined, maxSeason = Infinity): number[] {
  return [...new Set(
    filterAwardsToVisibleTimeline(awards, maxSeason)
      .filter(award => normalizePlayerAwardType(award.type) === 'All-Star')
      .map(award => Number(award.season)),
  )].sort((left, right) => left - right);
}

export function scopeExternalPlayerAwards(
  awards: ScopedPlayerAward[] | undefined,
  historicalAwards: HistoricalAwardIdentity[] | undefined,
  playerId: string,
  playerName: string,
  currentSeason: number,
): ScopedPlayerAward[] {
  const normalizedName = playerName.trim().toLowerCase();
  const branchAwards = new Map<string, HistoricalAwardIdentity>();
  for (const award of historicalAwards ?? []) {
    if (Number(award.season) !== currentSeason || !award.competitionId) continue;
    if (award.pid !== playerId && String(award.name ?? '').trim().toLowerCase() !== normalizedName) continue;
    branchAwards.set(`${award.season}:${normalizePlayerAwardType(award.type)}`, award);
  }
  return (awards ?? []).flatMap(award => {
    const season = Number(award.season);
    if (!Number.isFinite(season) || season > currentSeason) return [];
    if (season < currentSeason || award.competitionId) return [award];
    const branchAward = branchAwards.get(`${season}:${normalizePlayerAwardType(award.type)}`);
    return branchAward ? [{ ...award, competitionId: branchAward.competitionId }] : [];
  });
}

export function scopeExternalPlayerAwardCompetition(
  award: ScopedPlayerAward,
  stats: Array<{ season?: number; tid?: number; competitionId?: string }> | undefined,
): ScopedPlayerAward {
  if (award.competitionId) return award;
  const seasonRows = (stats ?? []).filter(row => Number(row.season) === Number(award.season));
  const competitionIds = [...new Set(seasonRows.map(row => String(row.competitionId ?? '').trim().toLowerCase()).filter(Boolean))];
  if (competitionIds.length === 1) return { ...award, competitionId: competitionIds[0] };
  if (seasonRows.some(row => Number(row.tid) >= 0 && Number(row.tid) < 100)) {
    return { ...award, competitionId: 'nba' };
  }
  return award;
}

export function getExternalPlayerAwardLabel(
  award: ScopedPlayerAward,
  stats: Array<{ season?: number; tid?: number; competitionId?: string }> | undefined,
  competitions: Array<{ id: string; shortName?: string }> | undefined,
  uiMode?: string,
): string {
  const normalizedType = normalizePlayerAwardType(award.type);
  if (normalizedType === 'Champion' && award.competitionId === 'nba') return 'NBA Champion';
  if (!normalizedType.startsWith('All-NBA ')) return normalizedType;
  const seasonRows = (stats ?? []).filter(stat => Number(stat.season) === Number(award.season));
  const competitionId = String(award.competitionId ?? seasonRows.find(stat => stat.competitionId)?.competitionId ?? '');
  const hasNbaSeason = !competitionId && seasonRows.some(stat => Number(stat.tid) >= 0 && Number(stat.tid) < 100);
  if (hasNbaSeason || competitionId === 'nba') return normalizedType;
  const namespace = competitionId === 'euroleague'
    ? 'EuroLeague'
    : competitionId === 'eurocup'
      ? 'EuroCup'
      : competitions?.find(competition => competition.id === competitionId)?.shortName
        ?? (uiMode === 'pba_isolated' ? 'PBA' : 'League');
  return normalizedType.replace('All-NBA', `All-${namespace}`);
}
