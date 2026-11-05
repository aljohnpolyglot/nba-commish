import { normalizeDate } from './helpers';

export type NewsMediaEra = 'newspaper' | 'tv' | 'earlyInternet' | 'web2' | 'modern';
export type InsiderEraKey = 'woj' | 'shams';

export const TWITTER_LAUNCH_ISO = '2006-03-21';
export const WOJ_RETIREMENT_ISO = '2024-09-18';

function normalizedIso(date?: string | null): string {
  if (!date) return '';
  const norm = normalizeDate(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(norm) ? norm : '';
}

export function getNewsMediaEra(year?: number | null): NewsMediaEra {
  const y = Number(year) || new Date().getFullYear();
  if (y < 1980) return 'newspaper';
  if (y < 1996) return 'tv';
  if (y < 2006) return 'earlyInternet';
  if (y < 2014) return 'web2';
  return 'modern';
}

export function isTwitterAvailable(date?: string | null, seasonYear?: number | null): boolean {
  const norm = normalizedIso(date);
  if (norm) return norm >= TWITTER_LAUNCH_ISO;
  const year = Number(seasonYear);
  return Number.isFinite(year) ? year >= 2006 : new Date().getFullYear() >= 2006;
}

export function isBeforeWojRetirement(date?: string | null, seasonYear?: number | null): boolean {
  const norm = normalizedIso(date);
  if (norm) return norm < WOJ_RETIREMENT_ISO;
  const year = Number(seasonYear);
  return Number.isFinite(year) ? year < 2025 : new Date().getFullYear() < 2025;
}

export function getPrimaryInsiderKey(date?: string | null, seasonYear?: number | null): InsiderEraKey {
  return isBeforeWojRetirement(date, seasonYear) ? 'woj' : 'shams';
}
