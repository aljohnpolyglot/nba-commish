import type { NBAPlayer } from '../types';
import { extractNbaId, hdPortrait } from './helpers';
import { getCachedImageUrl } from '../services/imageCache';
import { SettingsManager } from '../services/SettingsManager';
import { getPhotoBySlug } from '../data/realPlayerDataFetcher';

const EXTERNAL_STATUSES = new Set([
  'WNBA',
  'Euroleague',
  'PBA',
  'B-League',
  'G-League',
  'Endesa',
  'China CBA',
  'NBL Australia',
  'Draft Prospect',
  'Prospect',
]);

export function isDefaultProballers(url: string): boolean {
  return url.includes('head-par-defaut');
}

export function getPlayerImage(player: NBAPlayer): string | undefined {
  if (player.imgURL && player.imgURL.trim() !== '' && !isDefaultProballers(player.imgURL)) {
    if (SettingsManager.getSettings().enableImageCache) {
      const cached = getCachedImageUrl(player.imgURL);
      if (cached) return cached;
    }
    return player.imgURL;
  }

  if (player.srID) {
    const fromPhotos = getPhotoBySlug(player.srID);
    if (fromPhotos) return fromPhotos;
  }

  if (EXTERNAL_STATUSES.has(player.status ?? '')) return undefined;

  const nbaId = extractNbaId('', player.name);
  if (!nbaId) return undefined;

  const cdnUrl = hdPortrait(nbaId);
  if (SettingsManager.getSettings().enableImageCache) {
    const cached = getCachedImageUrl(cdnUrl);
    if (cached) return cached;
  }

  return cdnUrl;
}
