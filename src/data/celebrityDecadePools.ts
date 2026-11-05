export interface CelebrityDecadePoolEntry {
  name: string;
  occupation?: string;
  decade: string;
  ratings?: Record<string, number>;
  imgUrl?: string;
}

export type CelebrityDecadePoolSource = 'real' | 'fictional' | 'pba';

const CELEBRITY_DECADE_POOLS_URLS: Record<CelebrityDecadePoolSource, string> = {
  real: 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/celebrity_decade_pools.json',
  fictional: 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/public-domain-character-celebrity-decade-pools-hydrated.json',
  pba: '/data/pba/pba_celebrity_decade_pools.json',
};

const cachedEntries: Partial<Record<CelebrityDecadePoolSource, CelebrityDecadePoolEntry[]>> = {};
const cachedPromises: Partial<Record<CelebrityDecadePoolSource, Promise<CelebrityDecadePoolEntry[]>>> = {};

const REAL_OFFLINE_NAMES = [
  'Nelly',
  'Mark Jackson',
  'Tom Cavanagh',
  'Bill Bellamy',
  'Mark McGrath',
  'James Lafferty',
  'Floyd Mayweather Jr.',
  'Sean Paul',
  'Lauren Jackson',
  'Usher',
  'Steve Howey',
  'DJ Clue',
  'Danica Patrick',
  'Jay-Z',
  'Peyton Manning',
  'Venus Williams',
  'Michael Rapaport',
  'Marvin Harrison',
  'Rafael Nadal',
  'Tony Hawk',
];

const FICTIONAL_OFFLINE_NAMES = [
  'Avery Stone',
  'Jordan Vale',
  'Morgan Reed',
  'Cameron Lane',
  'Riley Brooks',
  'Parker Quinn',
  'Taylor Monroe',
  'Casey Rivers',
  'Skyler Hayes',
  'Emerson West',
  'Rowan Blake',
  'Finley Hart',
  'Dakota James',
  'Reese Morgan',
  'Sage Bennett',
  'Charlie Ellis',
  'Kendall Fox',
  'Alexis Gray',
  'Hayden Wells',
  'Jamie Cross',
];

export const getOfflineCelebrityDecadeEntries = (
  decade: string,
  source: CelebrityDecadePoolSource,
): CelebrityDecadePoolEntry[] => (source === 'real' ? REAL_OFFLINE_NAMES : FICTIONAL_OFFLINE_NAMES)
  .map(name => ({ name, occupation: source === 'real' ? 'Celebrity guest' : 'Community guest', decade }));

export const readCelebrityDecadeEntries = (payload: unknown): CelebrityDecadePoolEntry[] => {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? (payload as { celebrity_decade_pools?: unknown }).celebrity_decade_pools
      : [];
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is CelebrityDecadePoolEntry => {
    if (!row || typeof row !== 'object') return false;
    const entry = row as Partial<CelebrityDecadePoolEntry>;
    return typeof entry.name === 'string'
      && entry.name.trim().length > 0
      && typeof entry.decade === 'string';
  });
};

export const getCelebrityDecadeLabel = (
  year: number,
  source: CelebrityDecadePoolSource = 'real',
): string => {
  if (source === 'fictional' && year < 1900) return 'pre-1900';
  if (source === 'fictional' && year >= 2060) return 'future';
  return `${Math.floor(year / 10) * 10}s`;
};

export const fetchCelebrityDecadeEntries = async (
  source: CelebrityDecadePoolSource = 'real',
): Promise<CelebrityDecadePoolEntry[]> => {
  const cached = cachedEntries[source];
  if (cached) return cached;
  const pending = cachedPromises[source];
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await fetch(CELEBRITY_DECADE_POOLS_URLS[source]);
      if (!response.ok) throw new Error(`${source} celebrity decade pools returned ${response.status}`);
      const entries = readCelebrityDecadeEntries(await response.json());
      cachedEntries[source] = entries;
      return entries;
    } catch (error) {
      console.warn(`Failed to fetch ${source} celebrity decade pools; using the local fallback.`, error);
      const entries: CelebrityDecadePoolEntry[] = [];
      cachedEntries[source] = entries;
      return entries;
    } finally {
      delete cachedPromises[source];
    }
  })();

  cachedPromises[source] = request;
  return request;
};

export const fetchCelebrityDecadePool = async (
  year: number,
  source: CelebrityDecadePoolSource = 'real',
): Promise<CelebrityDecadePoolEntry[]> => {
  const decade = getCelebrityDecadeLabel(year, source);
  const matching = (await fetchCelebrityDecadeEntries(source)).filter(entry => entry.decade === decade);
  if (matching.length >= 20) return matching;
  const used = new Set(matching.map(entry => entry.name.trim().toLowerCase()));
  const fallback = getOfflineCelebrityDecadeEntries(decade, source).filter(entry => !used.has(entry.name.toLowerCase()));
  return [...matching, ...fallback].slice(0, 20);
};
