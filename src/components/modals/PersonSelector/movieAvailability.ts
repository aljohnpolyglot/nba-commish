import { normalizeDate } from '../../../utils/helpers';
import type { Movie } from './types';

const ARCHIVE_BASE_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/highest-grossing-films-by-decade';
const FUTURE_MOVIE_FALLBACK_URL = 'https://raw.githubusercontent.com/sharmadhiraj/free-json-datasets/refs/heads/master/docs/sports-entertainment/imdb_top_movies.json';
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

interface ArchiveFilm {
  key?: string;
  title?: string;
  pageTitle?: string;
  releaseYear?: number;
  wikipediaUrl?: string;
  genres?: string[];
  grossingAppearances?: Array<{ year?: number; rank?: number; gross?: string; distributor?: string }>;
  wikipedia?: {
    lead?: string;
    genres?: string[];
    infobox?: {
      poster?: { imageUrl?: string };
      fields?: Record<string, string>;
      rows?: Array<{ key?: string; value?: string }>;
    };
  };
  synopsis?: { text?: string; value?: string } | string;
}

interface ArchivePayload {
  films?: ArchiveFilm[];
}

function extractReleaseDate(film: ArchiveFilm): string | undefined {
  const fields = film.wikipedia?.infobox?.fields;
  const row = film.wikipedia?.infobox?.rows?.find(entry =>
    String(entry.key ?? '').toLowerCase().startsWith('releasedate'),
  );
  const raw = String(fields?.releaseDates ?? fields?.releaseDate ?? row?.value ?? '');
  const year = Number(film.releaseYear);
  if (!raw || !Number.isFinite(year)) return undefined;
  const pattern = new RegExp(`(?:${MONTHS})\\s+\\d{1,2},\\s+${year}|\\d{1,2}\\s+(?:${MONTHS})\\s+${year}`, 'i');
  const value = raw.match(pattern)?.[0];
  if (!value) return undefined;
  const parsed = new Date(`${value} 12:00:00 UTC`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function wasReleased(releaseDate: string, gameDate: string): boolean {
  const release = new Date(`${releaseDate}T12:00:00Z`).getTime();
  const current = new Date(`${gameDate}T12:00:00Z`).getTime();
  return current >= release;
}

function archiveMovie(film: ArchiveFilm, index: number, releaseDate?: string): Movie {
  const appearance = film.grossingAppearances?.find(row => row.year === film.releaseYear)
    ?? film.grossingAppearances?.[0];
  const synopsis = typeof film.synopsis === 'string'
    ? film.synopsis
    : film.synopsis?.text ?? film.synopsis?.value;
  return {
    id: String(film.key ?? film.wikipediaUrl ?? `${film.releaseYear}-${index}-${film.title}`),
    rank: Number(appearance?.rank ?? index + 1),
    title: String(film.title ?? film.pageTitle ?? 'Untitled Film'),
    url: String(film.wikipediaUrl ?? film.key ?? ''),
    image: String(film.wikipedia?.infobox?.poster?.imageUrl ?? ''),
    description: String(synopsis ?? film.wikipedia?.lead ?? ''),
    duration: String(film.wikipedia?.infobox?.fields?.runningTime ?? ''),
    genres: film.genres ?? film.wikipedia?.genres ?? [],
    releaseDate,
    releaseYear: Number(film.releaseYear),
    gross: appearance?.gross,
    distributor: appearance?.distributor,
    source: 'historical',
  };
}

async function loadHistoricalMovies(gameDate: string, year: number): Promise<Movie[]> {
  if (year < 1913) return [];
  const currentDecade = Math.floor(year / 10) * 10;
  const decades = [...new Set([currentDecade, Math.floor((year - 1) / 10) * 10])];
  const payloads = await Promise.allSettled(decades.map(async decade => {
    const response = await fetch(`${ARCHIVE_BASE_URL}/highest-grossing-films-${decade}s.json`);
    if (!response.ok) throw new Error(`Movie archive unavailable (${response.status})`);
    return response.json() as Promise<ArchivePayload>;
  }));
  const films = payloads.flatMap(result => result.status === 'fulfilled' ? result.value.films ?? [] : [])
    .filter(film => Number(film.releaseYear) <= year);
  const available = films
    .filter(film => film.releaseYear === year || film.releaseYear === year - 1)
    .flatMap((film, index) => {
      const releaseDate = extractReleaseDate(film);
      if (film.releaseYear === year) {
        return releaseDate && wasReleased(releaseDate, gameDate)
          ? [archiveMovie(film, index, releaseDate)]
          : [];
      }
      return [archiveMovie(film, index, releaseDate)];
    })
    .sort((left, right) =>
      String(right.releaseDate ?? '').localeCompare(String(left.releaseDate ?? ''))
      || left.rank - right.rank,
    );
  if (available.length > 0) return available;

  const latestPriorYear = Math.max(
    ...films.map(film => Number(film.releaseYear)).filter(releaseYear => releaseYear < year),
  );
  if (!Number.isFinite(latestPriorYear)) return [];
  return films
    .filter(film => film.releaseYear === latestPriorYear)
    .slice(0, 10)
    .map((film, index) => archiveMovie(film, index, extractReleaseDate(film)));
}

async function loadFutureFallbackMovies(): Promise<Movie[]> {
  const response = await fetch(FUTURE_MOVIE_FALLBACK_URL);
  if (!response.ok) throw new Error(`Future movie list unavailable (${response.status})`);
  const payload = await response.json() as { data?: Array<Record<string, unknown>> };
  return (payload.data ?? []).map((row, index) => ({
    id: String(row.url ?? `future-movie-${index}`),
    rank: Number(row.rank ?? index + 1),
    title: String(row.title ?? 'Untitled Film'),
    url: String(row.url ?? ''),
    image: String(row.image ?? ''),
    description: String(row.description ?? ''),
    contentRating: String(row.content_rating ?? ''),
    duration: String(row.duration ?? ''),
    genres: Array.isArray(row.genres) ? row.genres.map(String) : [],
    rating: Number(row.rating ?? 0),
    source: 'future-fallback',
  }));
}

export async function loadAvailableMovies(rawGameDate: string, fallbackYear: number): Promise<Movie[]> {
  const gameDate = normalizeDate(rawGameDate) || `${fallbackYear}-07-01`;
  const year = Number(gameDate.slice(0, 4)) || fallbackYear;
  if (year <= 2026) return loadHistoricalMovies(gameDate, year);
  try {
    const movies = await loadFutureFallbackMovies();
    if (movies.length > 0) return movies;
  } catch {
  }
  return loadHistoricalMovies('2026-12-31', 2026);
}
