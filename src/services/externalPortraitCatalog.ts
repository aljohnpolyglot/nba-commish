import type { NBAPlayer } from '../types';
import { isDefaultProballers, isLowQualityPlayerPortrait, isUsablePlayerPortraitUrl } from '../utils/playerImage';
import { normalizePortraitName } from '../utils/portraitName';
import { readJsonResponse } from './utils/jsonResponse';

type PortraitSourcePlayer = {
  name?: string;
  aliases?: string[];
  portraitUrl?: string | null;
  portraitArchiveUrl?: string | null;
  imgURL?: string | null;
  status?: string;
};

export type ExternalPortraitSourceSnapshot = {
  scrapedAt?: string;
  waybackTimestamp?: string;
  players?: PortraitSourcePlayer[];
};

type PortraitSourceDescriptor = {
  path: string;
  sourceSeason: number;
};

export const EXTERNAL_PORTRAIT_SOURCES: Readonly<Record<string, PortraitSourceDescriptor>> = {
  PBA: { path: '/data/external/portraits/pba-2026-stored-hd-portraits.json', sourceSeason: 2026 },
  WNBA: { path: '/data/external/portraits/wnba-2026-hd-portraits.json', sourceSeason: 2026 },
  'G-League': { path: '/data/external/portraits/gleague-2026-hd-portraits.json', sourceSeason: 2026 },
  'B-League': { path: '/data/external/portraits/bleague-2026-hd-portraits.json', sourceSeason: 2026 },
  'China CBA': { path: '/data/external/portraits/china-cba-2026-hd-portraits.json', sourceSeason: 2026 },
  'NBL Australia': { path: '/data/external/portraits/nbl-australia-2026-hd-portraits.json', sourceSeason: 2026 },
  Endesa: { path: '/data/external/portraits/endesa-2019-hd-portraits.json', sourceSeason: 2019 },
  'France Elite': { path: '/data/external/portraits/france-2026-hd-portraits.json', sourceSeason: 2026 },
  'Germany BBL': { path: '/data/external/portraits/germany-2026-hd-portraits.json', sourceSeason: 2026 },
  'Italy Serie A': { path: '/data/external/portraits/italy-2026-hd-portraits.json', sourceSeason: 2026 },
  'Turkey BSL': { path: '/data/external/portraits/turkey-2026-hd-portraits.json', sourceSeason: 2026 },
  ABA: { path: '/data/external/portraits/aba-2026-hd-portraits.json', sourceSeason: 2026 },
  'Greece A1': { path: '/data/external/portraits/greece-2026-hd-portraits.json', sourceSeason: 2026 },
  'Israel BSL': { path: '/data/external/portraits/israel-2026-hd-portraits.json', sourceSeason: 2026 },
  'Lithuania LKL': { path: '/data/external/portraits/lithuania-2026-hd-portraits.json', sourceSeason: 2026 },
  VTB: { path: '/data/external/portraits/vtb-2026-hd-portraits.json', sourceSeason: 2026 },
};

export const EXTERNAL_PORTRAIT_SOURCE_ARCHIVES: Readonly<Record<string, readonly PortraitSourceDescriptor[]>> = {
  PBA: [
    { path: '/data/external/portraits/pba-missing-portrait-fallbacks.json', sourceSeason: 1899 },
    { path: '/data/external/portraits/pba-historical-portrait-fallbacks.json', sourceSeason: 1900 },
    { path: '/data/external/portraits/pba-2018-hd-portraits.json', sourceSeason: 2018 },
    EXTERNAL_PORTRAIT_SOURCES.PBA,
  ],
  WNBA: [
    { path: '/data/external/wnba/wnba-2026-bbgm.json', sourceSeason: 2026 },
    EXTERNAL_PORTRAIT_SOURCES.WNBA,
    { path: '/data/external/portraits/wnba-current-portrait-overrides-2026.json', sourceSeason: 2026 },
  ],
};

const catalogPromises = new Map<string, Promise<ReadonlyMap<string, string>>>();
const cachedCatalogs = new Map<string, ReadonlyMap<string, string>>();

function descriptorsForLeague(league: string): readonly PortraitSourceDescriptor[] {
  return EXTERNAL_PORTRAIT_SOURCE_ARCHIVES[league] ?? (EXTERNAL_PORTRAIT_SOURCES[league]
    ? [EXTERNAL_PORTRAIT_SOURCES[league]]
    : []);
}

function eligibleDescriptors(league: string, season?: number): readonly PortraitSourceDescriptor[] {
  return descriptorsForLeague(league)
    .filter(descriptor => league === 'PBA' || !Number.isFinite(season) || Number(season) >= descriptor.sourceSeason)
    .sort((left, right) => left.sourceSeason - right.sourceSeason);
}

export const normalizeExternalPortraitName = normalizePortraitName;

export function isUsableExternalPortraitUrl(value: unknown): value is string {
  const url = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(url) && !/^\/img\/(?!.*(?:^|\/)\.\.(?:\/|$))[^?#]+$/i.test(url)) return false;
  return isUsablePlayerPortraitUrl(url);
}

export function buildExternalPortraitCatalog(
  snapshot: ExternalPortraitSourceSnapshot,
): ReadonlyMap<string, string> {
  const entries = new Map<string, string | null>();
  for (const player of snapshot.players ?? []) {
    if (player.status === 'default') continue;
    const portrait = [player.portraitArchiveUrl, player.portraitUrl, player.imgURL]
      .find(isUsableExternalPortraitUrl);
    if (!portrait) continue;
    const keys = [player.name, ...(player.aliases ?? [])]
      .map(normalizeExternalPortraitName)
      .filter(Boolean);
    for (const key of new Set(keys)) {
      const current = entries.get(key);
      if (current === undefined) entries.set(key, portrait);
      else if (current !== portrait) entries.set(key, null);
    }
  }
  return new Map([...entries].filter((entry): entry is [string, string] => entry[1] !== null));
}

export function resolveExternalPortraitFromCatalog(
  catalog: ReadonlyMap<string, string> | null | undefined,
  playerName: unknown,
): string | undefined {
  const key = normalizeExternalPortraitName(playerName);
  return key ? catalog?.get(key) : undefined;
}

export function getCachedExternalPortraitForName(
  league: unknown,
  playerName: unknown,
  season?: number,
): string | undefined {
  return getCachedExternalPortraitCandidatesForName(league, playerName, season)[0];
}

export function getCachedExternalPortraitCandidatesForName(
  league: unknown,
  playerName: unknown,
  season?: number,
): string[] {
  const leagueName = String(league ?? '');
  const descriptors = eligibleDescriptors(leagueName, season);
  const candidates: string[] = [];
  for (let index = descriptors.length - 1; index >= 0; index--) {
    const portrait = resolveExternalPortraitFromCatalog(cachedCatalogs.get(descriptors[index].path), playerName);
    if (portrait && !candidates.includes(portrait)) candidates.push(portrait);
  }
  return candidates;
}

export async function loadExternalPortraitCatalog(
  league: string,
  season?: number,
): Promise<ReadonlyMap<string, string>> {
  const descriptors = eligibleDescriptors(league, season);
  if (descriptors.length === 0) return new Map();
  const catalogs = await Promise.all(descriptors.map(descriptor => {
    const cached = cachedCatalogs.get(descriptor.path);
    if (cached) return cached;
    const existing = catalogPromises.get(descriptor.path);
    if (existing) return existing;
    const pending = fetch(descriptor.path, { cache: 'no-store' })
      .then(response => readJsonResponse<ExternalPortraitSourceSnapshot>(response, `${league} portrait catalog`))
      .then(snapshot => {
        const catalog = buildExternalPortraitCatalog(snapshot);
        cachedCatalogs.set(descriptor.path, catalog);
        return catalog;
      })
      .catch(error => {
        catalogPromises.delete(descriptor.path);
        throw error;
      });
    catalogPromises.set(descriptor.path, pending);
    return pending;
  }));
  const merged = new Map<string, string>();
  for (const catalog of catalogs) {
    for (const [key, portrait] of catalog) merged.set(key, portrait);
  }
  return merged;
}

function shouldReplacePortrait(value: unknown): boolean {
  const current = String(value ?? '').trim();
  return !current || isDefaultProballers(current) || isLowQualityPlayerPortrait(current);
}

export function applyExternalPortraitCatalog(
  players: NBAPlayer[],
  league: string,
  catalog: ReadonlyMap<string, string> | null | undefined,
  season?: number,
): NBAPlayer[] {
  if (eligibleDescriptors(league, season).length === 0 || !catalog) return players;
  return players.map(player => {
    if (player.status !== league || !shouldReplacePortrait(player.imgURL)) return player;
    const portrait = resolveExternalPortraitFromCatalog(catalog, player.name);
    return portrait ? { ...player, imgURL: portrait } : player;
  });
}

export async function preloadExternalPortraitCatalogsForPlayers(
  players: Array<Pick<NBAPlayer, 'status' | 'imgURL'>>,
  season?: number,
): Promise<void> {
  const leagues = new Set(players
    .filter(player => shouldReplacePortrait(player.imgURL))
    .map(player => String(player.status ?? ''))
    .filter(league => !!EXTERNAL_PORTRAIT_SOURCES[league]));
  await Promise.all([...leagues].map(league => loadExternalPortraitCatalog(league, season).catch(() => new Map())));
}
