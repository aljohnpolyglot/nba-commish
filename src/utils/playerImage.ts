import type { NBAPlayer } from '../types';
import { extractNbaId, hdPortrait } from './helpers';
import { getCachedImageUrl } from '../services/imageCache';
import { SettingsManager } from '../services/SettingsManager';
import { getPhotoByPlayerIdentity, getPhotoBySlug, isPhotoIdentityConflict } from '../data/realPlayerDataFetcher';
import { isExternalLeagueStatus } from '../constants';
import { getCachedNbaEraPortraitCandidates } from '../services/nbaEraPortraitCatalog';
import { isPortraitUrlUnavailable } from './portraitAvailability';

const NON_NBA_PORTRAIT_STATUSES = new Set(['Draft Prospect', 'Prospect']);

export function normalizePlayerPortraitUrl(url: string): string {
  const trimmed = url.trim();
  const legacyProballers = trimmed.match(/^https:\/\/www\.proballers\.com\/media\/cache\/resize_\d+_[^/]+\/https---www\.proballers\.com\/(ul\/player\/.+)$/i);
  return legacyProballers ? `https://www.proballers.com/${legacyProballers[1]}` : trimmed;
}

export function isDefaultProballers(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.includes('head-par-defaut')
    || (normalized.includes('proballers.com')
      && (normalized.includes('/default.svg') || normalized.endsWith('/player.png')));
}

export function isUsablePlayerPortraitUrl(value: unknown): value is string {
  const url = String(value ?? '').trim();
  if (!url || isPortraitUrlUnavailable(url)) return false;
  const normalized = url.toLowerCase().split(/[?#]/)[0];
  return !isDefaultProballers(url)
    && !normalized.endsWith('/player_photo.jpg')
    && !normalized.endsWith('/1x1.png')
    && !normalized.includes('/default.')
    && !normalized.includes('/blank-face')
    && !normalized.includes('/undefined')
    && !normalized.includes('/null');
}

export function isLowQualityPlayerPortrait(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.includes('basketball.realgm.com')
    || normalized.includes('basketball-reference.com')
    || normalized.includes('eurobasket.com')
    || normalized.includes('asia-basket.com');
}

export function isPba2021FallbackPortrait(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.startsWith('/img/portraits/pba-fallback/')
    || normalized.includes('raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/pbamissingportraits/');
}

export function resolveWnbaPlayerPortrait(
  existingPortrait?: string,
  curatedPortrait?: string,
): string | undefined {
  const existing = existingPortrait?.trim() ? normalizePlayerPortraitUrl(existingPortrait) : undefined;
  const curated = curatedPortrait?.trim() ? normalizePlayerPortraitUrl(curatedPortrait) : undefined;
  const usableExisting = existing && !isDefaultProballers(existing) ? existing : undefined;
  const usableCurated = curated && !isDefaultProballers(curated) ? curated : undefined;
  return [usableExisting, usableCurated].find(url => url && !isLowQualityPlayerPortrait(url))
    ?? usableExisting
    ?? usableCurated;
}

interface PlayerImageOptions {
  preferCanonicalNbaPortrait?: boolean;
  portraitSeason?: number;
  isDraftProspect?: boolean;
}

export function resolvePersistentPlayerImage(
  player: Pick<NBAPlayer, 'imgURL' | 'srID' | 'slug' | 'name' | 'status'> & Partial<Pick<NBAPlayer, 'tid' | 'draft'>> & { face?: unknown; internalId?: string },
  options: PlayerImageOptions = {},
): string | undefined {
  const explicitPortrait = isUsablePlayerPortraitUrl(player.imgURL)
    ? normalizePlayerPortraitUrl(player.imgURL)
    : undefined;
  const explicitHigh = explicitPortrait && !isLowQualityPlayerPortrait(explicitPortrait) ? explicitPortrait : undefined;
  const isProspect = options.isDraftProspect
    ?? (player.tid === -2 || NON_NBA_PORTRAIT_STATUSES.has(player.status ?? ''));
  const eraOptions = options.portraitSeason !== undefined || isProspect
    ? { season: options.portraitSeason, isProspect }
    : undefined;
  const eraPortrait = getCachedNbaEraPortraitCandidates(player, eraOptions)[0];
  if (player.status === 'WNBA') return explicitPortrait;
  if (isExternalLeagueStatus(player.status)) {
    if (player.status !== 'PBA' && eraPortrait) return eraPortrait;
    if (explicitPortrait) return explicitPortrait;
    const stableNbaIdentity = !!String(player.srID ?? player.slug ?? '').trim()
      || /^(?:zengm|nba|native|hist)[-_:]/i.test(String(player.internalId ?? ''));
    if (player.status !== 'G-League' || !stableNbaIdentity) return undefined;
  }
  if (eraPortrait) return eraPortrait;
  if (isProspect) return explicitPortrait;
  const resolvedCanonicalPortrait = getPhotoByPlayerIdentity(player) ?? undefined;
  const canonicalPortrait = resolvedCanonicalPortrait && !isPortraitUrlUnavailable(resolvedCanonicalPortrait)
    ? resolvedCanonicalPortrait
    : undefined;
  const explicitConflict = explicitPortrait ? isPhotoIdentityConflict(player, explicitPortrait) : false;
  if (explicitConflict && canonicalPortrait) return canonicalPortrait;

  const nbaSource = [canonicalPortrait, explicitPortrait]
    .find(url => url?.toLowerCase().includes('nba.com')) ?? '';
  const nbaId = extractNbaId('', player.name) ?? extractNbaId(nbaSource);
  const nbaPortrait = nbaId ? hdPortrait(nbaId) : undefined;
  const canonicalHigh = canonicalPortrait && !isLowQualityPlayerPortrait(canonicalPortrait) ? canonicalPortrait : undefined;

  if (options.preferCanonicalNbaPortrait && nbaPortrait) return nbaPortrait;
  if (explicitHigh) return explicitHigh;
  if (nbaPortrait) return nbaPortrait;
  if (canonicalHigh) return canonicalHigh;
  if (explicitPortrait) return explicitPortrait;
  if (canonicalPortrait) return canonicalPortrait;

  if (player.face || String(player.internalId ?? '').startsWith('gen-')) return undefined;

  const fallbackNbaId = extractNbaId('', player.name);
  return fallbackNbaId ? hdPortrait(fallbackNbaId) : undefined;
}

export function getPlayerImage(player: NBAPlayer, options: PlayerImageOptions = {}): string | undefined {
  const persistent = resolvePersistentPlayerImage(player, options);
  if (persistent) {
    if (SettingsManager.getSettings().enableImageCache) {
      const cached = getCachedImageUrl(persistent);
      if (cached) return cached;
    }
    return persistent;
  }

  if (player.face || String(player.internalId ?? '').startsWith('gen-')) return undefined;

  if (player.srID) {
    const fromPhotos = getPhotoBySlug(player.srID);
    if (fromPhotos) return fromPhotos;
  }

  return undefined;
}
