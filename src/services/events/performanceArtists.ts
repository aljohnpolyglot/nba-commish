export interface PerformanceArtist {
  id: string;
  name: string;
  decade: string;
  imageUrl?: string;
}

interface ArtistSourceRow {
  name?: unknown;
  decade?: unknown;
  imageUrl?: unknown;
}

export const NBA_PERFORMANCE_ARTISTS_URL =
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/invite_performance_artists.json';
export const PBA_PERFORMANCE_ARTISTS_URL = '/data/pba/pba_invite_performance_artists.json';

export function selectPerformanceArtistsForYear(
  data: unknown,
  year: number,
): { artists: PerformanceArtist[]; decade: string } {
  if (!Array.isArray(data)) throw new Error('Invalid artist list');
  const rows = data.filter((row): row is ArtistSourceRow => typeof row === 'object' && row !== null);
  const availableDecades = Array.from(new Set(rows.map(row => (
    typeof row.decade === 'string' ? Number.parseInt(row.decade, 10) : Number.NaN
  ))))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (availableDecades.length === 0) throw new Error('Artist list has no decades');

  const requestedDecade = Math.floor(year / 10) * 10;
  const selectedDecade = [...availableDecades].reverse().find(decade => decade <= requestedDecade)
    ?? availableDecades[0];
  const decade = `${selectedDecade}s`;
  const processed = new Map<string, PerformanceArtist>();
  for (const row of rows) {
    if (row.decade !== decade || typeof row.name !== 'string') continue;
    const name = row.name.trim();
    if (!name) continue;
    const imageUrl = typeof row.imageUrl === 'string' && row.imageUrl.trim()
      ? row.imageUrl.trim()
      : undefined;
    const existing = processed.get(name);
    if (!existing) {
      processed.set(name, { id: `${decade}:${name}`, name, decade, imageUrl });
    } else if (!existing.imageUrl && imageUrl) {
      processed.set(name, { ...existing, imageUrl });
    }
  }
  const artists = Array.from(processed.values()).sort((left, right) => left.name.localeCompare(right.name));
  if (artists.length === 0) throw new Error(`Artist list has no entries for ${decade}`);
  return { artists, decade };
}

export function getRecommendedPerformanceArtists(
  artists: PerformanceArtist[],
  year: number,
  count: number,
): PerformanceArtist[] {
  const photographed = artists.filter(artist => artist.imageUrl);
  const pool = photographed.length >= count ? photographed : artists;
  if (pool.length < count) return [];
  const start = Math.abs(year) % pool.length;
  const selected: PerformanceArtist[] = [];
  for (let offset = 0; selected.length < count && offset < pool.length; offset += 1) {
    const candidate = pool[(start + offset * 7) % pool.length];
    if (!selected.some(artist => artist.id === candidate.id)) selected.push(candidate);
  }
  return selected;
}

export async function loadPerformanceArtists(
  year: number,
  usePbaPool: boolean,
): Promise<{ artists: PerformanceArtist[]; decade: string }> {
  const response = await fetch(usePbaPool ? PBA_PERFORMANCE_ARTISTS_URL : NBA_PERFORMANCE_ARTISTS_URL);
  if (!response.ok) throw new Error(`Artist list request failed with ${response.status}`);
  return selectPerformanceArtistsForYear(await response.json(), year);
}
