import fictionalDecadePoolsSource from '../../data/sources/celebrities/fictional-decade-pools.json';
import historicalCelebrityGamesSource from '../../data/sources/celebrities/historical-games.json';
import celebrityImageFollowupSource from '../../data/sources/celebrities/image-followup.json';
import realDecadePoolsSource from '../../data/sources/celebrities/real-decade-pools.json';
import {
  getCelebrityDecadeLabel,
  getOfflineCelebrityDecadeEntries,
  readCelebrityDecadeEntries,
  type CelebrityDecadePoolEntry,
  type CelebrityDecadePoolSource,
} from './celebrityDecadePools';
import {
  attachCelebrityImages,
  getDecadeRatedCelebrities,
  getHistoricalRatedCelebritiesForYear,
  mergeRatedCelebritiesByPriority,
  normalizeCelebrityImageNameKey,
  readHistoricalCelebrityGames,
  type RatedCelebrity,
} from './celebrities';

type LocalPoolSource = Exclude<CelebrityDecadePoolSource, 'pba'>;

const bundledEntries: Record<LocalPoolSource, CelebrityDecadePoolEntry[]> = {
  real: readCelebrityDecadeEntries(realDecadePoolsSource),
  fictional: readCelebrityDecadeEntries(fictionalDecadePoolsSource),
};

const bundledHistoricalGames = readHistoricalCelebrityGames(historicalCelebrityGamesSource);
const bundledCelebrityImages = new Map<string, string>(
  (celebrityImageFollowupSource as Array<{ name?: unknown; imageUrl?: unknown }>)
    .filter((row): row is { name: string; imageUrl: string } => (
      typeof row?.name === 'string'
      && typeof row?.imageUrl === 'string'
      && row.imageUrl.trim().length > 0
    ))
    .map(row => [normalizeCelebrityImageNameKey(row.name), row.imageUrl.trim()]),
);

const getBundledDecadePool = (
  year: number,
  source: LocalPoolSource,
): CelebrityDecadePoolEntry[] => {
  const decade = getCelebrityDecadeLabel(year, source);
  const matching = bundledEntries[source].filter(entry => entry.decade === decade);
  if (matching.length >= 20) return matching;
  const used = new Set(matching.map(entry => entry.name.trim().toLowerCase()));
  const fallback = getOfflineCelebrityDecadeEntries(decade, source)
    .filter(entry => !used.has(entry.name.toLowerCase()));
  return [...matching, ...fallback].slice(0, 20);
};

/**
 * Immutable, bundled participant source for canonical long-sim resolution.
 * UI-owned source refreshes remain in celebrities.ts and never enter this
 * resolver-only module or its deterministic ordering.
 */
export const getLocalRatedCelebritiesForYear = (
  year: number,
  poolSource: LocalPoolSource = 'real',
): RatedCelebrity[] => {
  const decadePool = getDecadeRatedCelebrities(getBundledDecadePool(year, poolSource));
  if (poolSource === 'fictional') return decadePool;

  const historical = getHistoricalRatedCelebritiesForYear(bundledHistoricalGames, year);
  return attachCelebrityImages(
    mergeRatedCelebritiesByPriority(historical, decadePool),
    bundledCelebrityImages,
  );
};
