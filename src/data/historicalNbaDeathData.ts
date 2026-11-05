import { readJsonResponse } from '../services/utils/jsonResponse';
import { BUNDLED_PLAYER_DEATHS_URL } from './historicalNbaRosterSources';

export type HistoricalNbaDeathSource = {
  slug?: string;
  name: string;
  bornYear: number;
  diedDate?: string;
  diedYear: number;
  wikidataId: string;
  wikipediaUrl: string;
  deathIndexUrl?: string;
};

type HistoricalNbaDeathFile = {
  entries?: HistoricalNbaDeathSource[];
};

type DeathFields = {
  diedDate?: string;
  diedYear?: number;
};

let loadPromise: Promise<void> | null = null;
let loaded = false;
let bySlug = new Map<string, HistoricalNbaDeathSource>();
let byIdentity = new Map<string, HistoricalNbaDeathSource>();

const normalizeName = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[.,'’`]/g, '')
  .replace(/[-_]/g, ' ')
  .replace(/\s+\b(jr|sr|ii|iii|iv|v)\b\s*$/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const identityKey = (name: string, bornYear: unknown): string =>
  `${normalizeName(name)}|${Number(bornYear)}`;

export function setHistoricalNbaDeathDataForTests(entries: HistoricalNbaDeathSource[]): void {
  bySlug = new Map();
  byIdentity = new Map();
  for (const entry of entries) {
    if (entry.slug) bySlug.set(entry.slug.toLowerCase(), entry);
    byIdentity.set(identityKey(entry.name, entry.bornYear), entry);
  }
  loaded = true;
}

export function ensureHistoricalNbaDeathDataLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = fetch(BUNDLED_PLAYER_DEATHS_URL)
    .then(response => readJsonResponse<HistoricalNbaDeathFile>(response, 'Historical NBA death data'))
    .then(data => setHistoricalNbaDeathDataForTests(data.entries ?? []))
    .catch(() => setHistoricalNbaDeathDataForTests([]))
    .finally(() => { loadPromise = null; });
  return loadPromise;
}

export function getHistoricalNbaDeathSource(player: {
  slug?: string | null;
  srID?: string | null;
  name?: string | null;
  bornYear?: number | null;
  born?: { year?: number | null } | null;
}): HistoricalNbaDeathSource | null {
  const slug = String(player.slug ?? player.srID ?? '').trim().toLowerCase();
  const slugMatch = slug ? bySlug.get(slug) : undefined;
  const name = String(player.name ?? '').trim();
  const bornYear = Number(player.bornYear ?? player.born?.year ?? 0);
  if (slugMatch && normalizeName(slugMatch.name) === normalizeName(name) && slugMatch.bornYear === bornYear) {
    return slugMatch;
  }
  return byIdentity.get(identityKey(name, bornYear)) ?? null;
}

export function mergeHistoricalNbaDeathSources<T extends {
  name?: string;
  bornYear?: number;
  diedDate?: string;
  diedYear?: number;
}>(bios: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(bios).map(([slug, bio]) => {
    const source = getHistoricalNbaDeathSource({ slug, name: bio.name, bornYear: bio.bornYear });
    if (!source) return [slug, bio];
    return [slug, {
      ...bio,
      diedDate: bio.diedDate ?? source.diedDate,
      diedYear: bio.diedYear ?? source.diedYear,
    }];
  }));
}

export function historicalDeathBeforeBranch(
  source: DeathFields | null | undefined,
  branchStart: number | string | Date,
): DeathFields {
  const diedYear = Number(source?.diedYear ?? 0);
  if (!Number.isFinite(diedYear) || diedYear <= 0) return {};
  const numericBranchYear = typeof branchStart === 'number' ? branchStart : Number.NaN;
  if (Number.isFinite(numericBranchYear)) {
    if (diedYear >= numericBranchYear) return {};
  } else {
    const branchDate = branchStart instanceof Date ? branchStart : new Date(branchStart);
    if (!Number.isFinite(branchDate.getTime())) return {};
    const branchYear = branchDate.getUTCFullYear();
    if (diedYear > branchYear) return {};
    if (diedYear === branchYear) {
      const diedDate = String(source?.diedDate ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(diedDate) || diedDate > branchDate.toISOString().slice(0, 10)) return {};
    }
  }
  return {
    diedYear,
    ...(source?.diedDate ? { diedDate: source.diedDate } : {}),
  };
}
