import { normalizeFibaPersonName } from './countryIdentity';
import { readJsonResponse } from '../utils/jsonResponse';

export interface FibaPortraitFallbackCatalog {
  byIdentity: ReadonlyMap<string, string>;
  byUniqueName: ReadonlyMap<string, string>;
}

interface FibaPortraitFallbackRow {
  name: string;
  bornYear: number;
  url: string;
}

let catalogPromise: Promise<FibaPortraitFallbackCatalog> | undefined;
const sourceUrl = `${import.meta.env?.BASE_URL ?? '/'}data/fiba/fiba-portrait-fallbacks.json`;

const identityKey = (name: string, bornYear: number | undefined) =>
  `${normalizeFibaPersonName(name)}|${bornYear ?? ''}`;

export function buildFibaPortraitFallbackCatalog(rows: readonly FibaPortraitFallbackRow[]): FibaPortraitFallbackCatalog {
  const byIdentity = new Map<string, string>();
  const urlsByName = new Map<string, Set<string>>();
  for (const row of rows) {
    const name = normalizeFibaPersonName(row.name);
    if (!name || !Number.isFinite(row.bornYear) || !row.url) continue;
    byIdentity.set(identityKey(name, row.bornYear), row.url);
    const urls = urlsByName.get(name) ?? new Set<string>();
    urls.add(row.url);
    urlsByName.set(name, urls);
  }
  const byUniqueName = new Map<string, string>();
  for (const [name, urls] of urlsByName) {
    if (urls.size === 1) byUniqueName.set(name, [...urls][0]);
  }
  return { byIdentity, byUniqueName };
}

export function getFibaPortraitFallback(
  catalog: FibaPortraitFallbackCatalog | undefined,
  name: string,
  bornYear?: number,
): string | undefined {
  if (!catalog) return undefined;
  return catalog.byIdentity.get(identityKey(name, bornYear))
    ?? catalog.byUniqueName.get(normalizeFibaPersonName(name));
}

export function loadFibaPortraitFallbackCatalog(): Promise<FibaPortraitFallbackCatalog> {
  catalogPromise ??= fetch(sourceUrl)
    .then(response => readJsonResponse<{ portraits?: FibaPortraitFallbackRow[] }>(response, 'FIBA portrait fallbacks'))
    .then(data => buildFibaPortraitFallbackCatalog(data.portraits ?? []))
    .catch(() => buildFibaPortraitFallbackCatalog([]));
  return catalogPromise;
}
