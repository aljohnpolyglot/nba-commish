export type NormalizedPlayerAward = {
  season: number;
  type: string;
  competitionId?: string;
  uiMode?: string;
  source?: string;
  introducedSeason?: number;
  country?: string;
  countryIso2?: string;
};

const displayPlayerAwardType = (award: { type?: unknown; competitionId?: string }): string => {
  const raw = String(award.type ?? '').replace(/\s+/g, ' ').trim();
  return award.competitionId ? raw : normalizePlayerAwardType(raw);
};

const playerAwardKey = (award: { season: number; type: string; competitionId?: string }): string =>
  `${award.season}:${normalizePlayerAwardType(award.type)}:${String(award.competitionId ?? '').toLowerCase()}`;

export function normalizePlayerAwardType(rawType: unknown): string {
  const trimmed = String(rawType ?? '')
    .replace(/\([^)]*\)/g, '')
    .replace(/^\s*\d+x\s+/i, '')
    .trim();
  const normalized = trimmed.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
  const compact = normalized.replace(/\s+/g, '');
  if (!normalized) return '';
  if (normalized === 'mvp') return 'Most Valuable Player';
  if (normalized === 'dpoy') return 'Defensive Player of the Year';
  if (normalized === 'roy') return 'Rookie of the Year';
  if (normalized === 'smoy') return 'Sixth Man of the Year';
  if (normalized === 'mip') return 'Most Improved Player';
  if (normalized === 'coy' || normalized === 'coach of the year') return 'Coach of the Year';
  if (normalized === 'executive of the year' || normalized === 'basketball executive of the year') return 'Executive of the Year';
  if (normalized === 'clutch player of the year' || normalized === 'nba clutch player of the year') return 'Clutch Player of the Year';
  if (normalized === 'champion' || normalized === 'nba champion' || normalized === 'won championship') return 'Champion';
  if (normalized === 'finals mvp') return 'Finals MVP';
  if ([
    'allstar',
    'allstargame',
    'nbaallstar',
    'nbaallstargame',
    'wnbaallstar',
    'wnbaallstargame',
    'pbaallstar',
    'pbaallstargame',
  ].includes(compact)) return 'All-Star';
  if (compact === 'allstarmvp' || compact === 'allstargamemvp' || compact === 'pbaallstargamemvp') return 'All-Star MVP';
  if (compact === 'risingstarsmvp' || compact === 'risingstarschallengemvp') return 'Rising Stars MVP';
  if (normalized === 'slam dunk contest winner' || normalized === 'slam dunk winner') return 'Slam Dunk Contest Winner';
  if (normalized === 'three point contest winner' || normalized === 'three point shootout winner') return 'Three-Point Contest Winner';
  if (normalized === 'shooting stars winner') return 'Shooting Stars Winner';
  if (normalized === 'skills challenge winner') return 'Skills Challenge Winner';
  if (compact === 'horsewinner') return 'H-O-R-S-E Winner';
  if (normalized === 'league scoring leader' || normalized === 'scoring leader' || normalized === 'scoring title') return 'League Scoring Leader';
  if (normalized === 'first team all league' || normalized === 'all league first team' || normalized === 'all nba first team' || normalized === 'first team all nba') return 'All-NBA First Team';
  if (normalized === 'second team all league' || normalized === 'all league second team' || normalized === 'all nba second team' || normalized === 'second team all nba') return 'All-NBA Second Team';
  if (normalized === 'third team all league' || normalized === 'all league third team' || normalized === 'all nba third team' || normalized === 'third team all nba') return 'All-NBA Third Team';
  if (normalized === 'first team all defensive' || normalized === 'all defensive first team') return 'All-Defensive First Team';
  if (normalized === 'second team all defensive' || normalized === 'all defensive second team') return 'All-Defensive Second Team';
  if (normalized === 'first team all rookie' || normalized === 'all rookie first team') return 'All-Rookie First Team';
  if (normalized === 'second team all rookie' || normalized === 'all rookie second team') return 'All-Rookie Second Team';
  return trimmed;
}

function expandSeasonToken(token: string): number[] {
  const cleaned = token.trim().replace(/[–—]/g, '-');
  const seasonLabel = cleaned.match(/^(\d{4})\s*-\s*(\d{2})(?:\s*-\s*(\d{2,4}))?$/);
  if (seasonLabel) {
    const start = Number(seasonLabel[1]);
    const firstEndRaw = Number(seasonLabel[2]);
    let firstEnd = Math.floor(start / 100) * 100 + firstEndRaw;
    if (firstEnd < start) firstEnd += 100;
    const lastRaw = seasonLabel[3];
    if (!lastRaw) return Number.isFinite(firstEnd) ? [firstEnd] : [];
    let lastEnd = lastRaw.length === 2 ? Math.floor(firstEnd / 100) * 100 + Number(lastRaw) : Number(lastRaw);
    if (lastEnd < firstEnd) lastEnd += 100;
    if (!Number.isFinite(lastEnd) || lastEnd < firstEnd || lastEnd - firstEnd > 80) return [firstEnd];
    return Array.from({ length: lastEnd - firstEnd + 1 }, (_, index) => firstEnd + index);
  }

  const yearRange = cleaned.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (yearRange) {
    const start = Number(yearRange[1]);
    const end = Number(yearRange[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 80) {
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
  }

  const single = cleaned.match(/\d{4}/);
  return single ? [Number(single[0])] : [];
}

function extractAwardSeasons(rawAward: unknown): number[] {
  if (rawAward && typeof rawAward === 'object') {
    const award = rawAward as any;
    if (Array.isArray(award.seasons)) {
      return award.seasons.flatMap((season: any) => {
        const value = Number(season);
        return Number.isFinite(value) ? [value] : expandSeasonToken(String(season ?? ''));
      });
    }
    const directSeason = Number(award.season ?? award.year);
    if (Number.isFinite(directSeason)) return [directSeason];
    const rawSeason = award.season ?? award.year;
    if (rawSeason !== undefined && rawSeason !== null) return expandSeasonToken(String(rawSeason));
  }

  const text = String(rawAward ?? '');
  const match = text.match(/\(([^)]*)\)/);
  return match ? match[1].split(',').flatMap(expandSeasonToken) : [];
}

export function normalizePlayerAwardRows(rawAwards: unknown, maxExclusiveSeason?: number): NormalizedPlayerAward[] {
  if (!Array.isArray(rawAwards)) return [];
  const awards: NormalizedPlayerAward[] = [];
  const seen = new Set<string>();
  for (const rawAward of rawAwards) {
    const sourceAward = rawAward && typeof rawAward === 'object'
      ? rawAward as Record<string, unknown>
      : undefined;
    const rawType = typeof rawAward === 'string'
      ? rawAward
      : sourceAward?.type ?? sourceAward?.award ?? sourceAward?.name;
    const type = normalizePlayerAwardType(rawType);
    if (!type) continue;
    for (const season of extractAwardSeasons(rawAward)) {
      if (!Number.isFinite(season) || season < 1947) continue;
      if (maxExclusiveSeason != null && season >= maxExclusiveSeason) continue;
      const competitionId = String(sourceAward?.competitionId ?? '').trim() || undefined;
      const key = `${season}:${type}:${competitionId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      awards.push({
        season,
        type,
        ...(competitionId ? { competitionId } : {}),
        ...(typeof sourceAward?.uiMode === 'string' ? { uiMode: sourceAward.uiMode } : {}),
        ...(typeof sourceAward?.source === 'string' ? { source: sourceAward.source } : {}),
        ...(Number.isFinite(Number(sourceAward?.introducedSeason))
          ? { introducedSeason: Number(sourceAward?.introducedSeason) }
          : {}),
        ...(typeof sourceAward?.country === 'string' ? { country: sourceAward.country } : {}),
        ...(typeof sourceAward?.countryIso2 === 'string' ? { countryIso2: sourceAward.countryIso2 } : {}),
      });
    }
  }
  return awards;
}

export function mergeNormalizedPlayerAwards(
  existing: NormalizedPlayerAward[] | undefined,
  incoming: NormalizedPlayerAward[] | undefined,
): NormalizedPlayerAward[] {
  const merged: NormalizedPlayerAward[] = [];
  const seen = new Set<string>();
  for (const award of [...(existing ?? []), ...(incoming ?? [])]) {
    const season = Number(award?.season);
    const type = displayPlayerAwardType(award);
    if (!Number.isFinite(season) || !type) continue;
    const normalizedAward = { ...award, season, type };
    const key = playerAwardKey(normalizedAward);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalizedAward);
  }
  return merged;
}
