import { normalizePortraitName } from '../utils/portraitName';
import { readJsonResponse } from './utils/jsonResponse';
import { BUNDLED_REMOVED_PLAYERS_URL } from '../data/historicalNbaRosterSources';
import type { NBAPlayer } from '../types';
import { getPlayerIdentityEvidenceTokens, resolveCanonicalPersonId } from '../utils/playerIdentity';
import { isPortraitUrlUnavailable } from '../utils/portraitAvailability';

export const NBA_ERA_PORTRAIT_SOURCE_PATH = '/data/external/portraits/nba-2kratings-portrait-library-2026.json';
export const NBA_CURRENT_PORTRAIT_OVERRIDE_PATH = '/data/external/portraits/nba-current-portrait-overrides-2026.json';
const NBA_HISTORICAL_PORTRAIT_RAW_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/NBA-Historical-Portraits/refs/heads/main/';
const NBA_HISTORICAL_PORTRAIT_MEDIA_BASE = 'https://media.githubusercontent.com/media/aljohnpolyglot/NBA-Historical-Portraits/refs/heads/main/';
export const NBA_HISTORICAL_PORTRAIT_MANIFEST_PATH = `${NBA_HISTORICAL_PORTRAIT_RAW_BASE}MANIFEST.csv`;

export function isBlackBackedNbaHistoricalPortrait(url: string | null | undefined): boolean {
  return String(url ?? '').startsWith(NBA_HISTORICAL_PORTRAIT_MEDIA_BASE);
}

export type NbaEraPortraitRow = {
  name?: string;
  year?: number | null;
  url?: string | null;
  filename?: string | null;
  playerUrl?: string | null;
  currentSupplemental?: boolean;
  likely2KRender?: boolean;
  personId?: string;
  sourceIds?: Record<string, string | string[]>;
  srID?: string;
  slug?: string;
};

export type NbaEraPortraitSnapshot = {
  schemaVersion?: number;
  currentPortraitYear?: number;
  portraits?: NbaEraPortraitRow[];
};

type RemovedPortraitSnapshot = {
  players?: Array<{
    name?: string;
    imgURL?: string | null;
    draft?: { year?: number | null };
  }>;
};

type MutablePortraitEntry = {
  dated: Map<number, string[]>;
  overall: string[];
};

export type NbaEraPortraitEntry = {
  dated: ReadonlyMap<number, readonly string[]>;
  overall: readonly string[];
};

export type NbaEraPortraitCatalog = ReadonlyMap<string, NbaEraPortraitEntry>;

type PortraitResolutionOptions = {
  season?: number;
  isProspect?: boolean;
};

type PortraitIdentity = Pick<NBAPlayer,
  'internalId' | 'personId' | 'sourceIds' | 'srID' | 'slug' | 'nbaId' | 'name' | 'born' | 'draft' | 'gender' | 'status' | 'historicalEndesaSource' | 'historicalPbaSource' | 'historicalEuropeSource'
>;

let installedCatalog: NbaEraPortraitCatalog | null = null;
let installedArchivePlayerCatalog: NbaEraPortraitCatalog | null = null;
let installedArchiveStaffCatalog: NbaEraPortraitCatalog | null = null;
let catalogPromise: Promise<NbaEraPortraitCatalog> | null = null;
let runtimeContext: { enabled: boolean; season?: number } = { enabled: false };
const catalogAliases = new WeakMap<NbaEraPortraitCatalog, ReadonlyMap<string, string>>();
const catalogIdentityTargets = new WeakMap<NbaEraPortraitCatalog, ReadonlyMap<string, string>>();
const catalogStringResolutionCandidates = new WeakMap<NbaEraPortraitCatalog, Map<string, readonly string[]>>();
const catalogObjectResolutionCandidates = new WeakMap<NbaEraPortraitCatalog, WeakMap<object, Map<string, readonly string[]>>>();

function isUsablePortraitUrl(value: unknown): value is string {
  const url = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(url)) return false;
  if (isPortraitUrlUnavailable(url)) return false;
  const normalized = url.toLowerCase();
  return !normalized.endsWith('/player_photo.jpg')
    && !normalized.endsWith('/1x1.png')
    && !normalized.includes('/default.')
    && !normalized.includes('/blank-face')
    && !normalized.includes('/undefined')
    && !normalized.includes('/null');
}

function appendIdentityValue(target: Set<string>, namespace: string, value: string | string[] | undefined): void {
  for (const entry of Array.isArray(value) ? value : [value]) {
    const normalized = String(entry ?? '').trim().toLowerCase();
    if (normalized) target.add(`${namespace.toLowerCase()}:${normalized}`);
  }
}

function getRowIdentityTokens(row: NbaEraPortraitRow): string[] {
  const tokens = new Set<string>();
  const personId = String(row.personId ?? '').trim().toLowerCase().replace(/^person:/, '');
  if (personId) tokens.add(`person:${personId}`);
  appendIdentityValue(tokens, 'bref', row.srID);
  appendIdentityValue(tokens, 'bref', row.slug);
  for (const [namespace, value] of Object.entries(row.sourceIds ?? {})) {
    appendIdentityValue(tokens, namespace, value);
  }
  return [...tokens];
}

function isPortraitIdentity(value: unknown): value is PortraitIdentity {
  return typeof value === 'object' && value !== null && typeof (value as PortraitIdentity).name === 'string';
}

function addUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

function withoutGenerationSuffix(value: string): string {
  return value.replace(/\s+\b(?:jr|sr|ii|iii|iv|v)\.?\s*$/i, '').trim();
}

function currentPlayerUrlName(row: NbaEraPortraitRow): string {
  if (!row.currentSupplemental || !row.playerUrl) return '';
  try {
    const segment = new URL(row.playerUrl).pathname.split('/').filter(Boolean).at(-1) ?? '';
    return decodeURIComponent(segment).replace(/-/g, ' ');
  } catch {
    return '';
  }
}

function shortenedGivenName(value: string): string {
  const parts = withoutGenerationSuffix(value).split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts[0].length <= 3) return '';
  return [parts[0].slice(0, 3), ...parts.slice(1)].join(' ');
}

function addAliasTarget(targets: Map<string, Set<string>>, alias: string, exactKey: string): void {
  const aliasKey = normalizePortraitName(alias);
  if (!aliasKey || aliasKey === exactKey) return;
  const matches = targets.get(aliasKey) ?? new Set<string>();
  matches.add(exactKey);
  targets.set(aliasKey, matches);
}

export function buildNbaEraPortraitCatalog(snapshot: NbaEraPortraitSnapshot): NbaEraPortraitCatalog {
  const mutable = new Map<string, MutablePortraitEntry>();
  const aliasTargets = new Map<string, Set<string>>();
  const exactNameTargets = new Map<string, Set<string>>();
  const identityTargets = new Map<string, Set<string>>();
  for (const row of snapshot.portraits ?? []) {
    if (!isUsablePortraitUrl(row.url)) continue;
    const name = String(row.name ?? '').trim();
    if (!name || /^\d{4}(?:-\d{2})?\s/.test(name)) continue;
    const key = normalizePortraitName(name);
    if (!key) continue;
    const rowIdentityTokens = getRowIdentityTokens(row);
    const targetKey = rowIdentityTokens.length > 0 ? `identity:${rowIdentityTokens[0]}` : key;
    const nameMatches = exactNameTargets.get(key) ?? new Set<string>();
    nameMatches.add(targetKey);
    exactNameTargets.set(key, nameMatches);
    addAliasTarget(aliasTargets, withoutGenerationSuffix(name), targetKey);
    const playerUrlName = currentPlayerUrlName(row);
    if (playerUrlName) {
      addAliasTarget(aliasTargets, playerUrlName, targetKey);
      addAliasTarget(aliasTargets, withoutGenerationSuffix(playerUrlName), targetKey);
      addAliasTarget(aliasTargets, shortenedGivenName(playerUrlName), targetKey);
    }
    for (const token of rowIdentityTokens) {
      const matches = identityTargets.get(token) ?? new Set<string>();
      matches.add(targetKey);
      identityTargets.set(token, matches);
    }
    const entry = mutable.get(targetKey) ?? { dated: new Map<number, string[]>(), overall: [] };
    const year = Number(row.year);
    if (Number.isFinite(year) && year > 0) {
      const urls = entry.dated.get(year) ?? [];
      addUnique(urls, row.url);
      entry.dated.set(year, urls);
    } else {
      addUnique(entry.overall, row.url);
    }
    mutable.set(targetKey, entry);
  }
  const catalog: NbaEraPortraitCatalog = new Map([...mutable].map(([key, entry]) => [key, {
    dated: new Map([...entry.dated].sort(([left], [right]) => left - right)),
    overall: [...entry.overall],
  }]));
  const aliases = new Map<string, string>();
  for (const [nameKey, targets] of exactNameTargets) {
    if (targets.size === 1) aliases.set(nameKey, [...targets][0]);
  }
  for (const [alias, targets] of aliasTargets) {
    if (!aliases.has(alias) && !catalog.has(alias) && targets.size === 1) aliases.set(alias, [...targets][0]);
  }
  const identities = new Map<string, string>();
  for (const [identity, targets] of identityTargets) {
    if (targets.size === 1) identities.set(identity, [...targets][0]);
  }
  catalogAliases.set(catalog, aliases);
  catalogIdentityTargets.set(catalog, identities);
  return catalog;
}

export function resolveNbaEraPortraitCandidates(
  catalog: NbaEraPortraitCatalog | null | undefined,
  playerIdentity: unknown,
  options: PortraitResolutionOptions = {},
): string[] {
  const season = Number(options.season);
  const querySeasonKey = `${Number.isFinite(season) ? season : 'undated'}|${options.isProspect ? 'prospect' : 'player'}`;
  const cachedQuery = catalog
    ? isPortraitIdentity(playerIdentity)
      ? catalogObjectResolutionCandidates.get(catalog)?.get(playerIdentity)?.get(querySeasonKey)
      : catalogStringResolutionCandidates.get(catalog)?.get(`${String(playerIdentity ?? '')}|${querySeasonKey}`)
    : undefined;
  if (cachedQuery) return cachedQuery.filter(portrait => !isPortraitUrlUnavailable(portrait));
  const playerName = isPortraitIdentity(playerIdentity) ? playerIdentity.name : playerIdentity;
  const key = normalizePortraitName(playerName);
  const suffixFreeKey = normalizePortraitName(withoutGenerationSuffix(String(playerName ?? '')));
  const aliases = catalog ? catalogAliases.get(catalog) : undefined;
  const identityTargets = catalog ? catalogIdentityTargets.get(catalog) : undefined;
  const identityKey = isPortraitIdentity(playerIdentity)
    ? [resolveCanonicalPersonId(playerIdentity), ...getPlayerIdentityEvidenceTokens(playerIdentity)]
      .map(token => identityTargets?.get(token))
      .find(Boolean)
    : undefined;
  const aliasKey = key ? aliases?.get(key) : undefined;
  const suffixFreeAliasKey = suffixFreeKey ? aliases?.get(suffixFreeKey) : undefined;
  const entryKey = key ? [identityKey, aliasKey, key, suffixFreeKey, suffixFreeAliasKey]
    .find(candidate => candidate && catalog?.has(candidate)) : undefined;
  const entry = entryKey ? catalog?.get(entryKey) : undefined;
  if (!entry) return [];
  const years = [...entry.dated.keys()].filter(year => Number.isFinite(year) && year > 0);
  const draftYear = isPortraitIdentity(playerIdentity) ? Number(playerIdentity.draft?.year) : NaN;
  const firstPortraitYear = years.length > 0 ? Math.min(...years) : NaN;
  const lastPortraitYear = years.length > 0 ? Math.max(...years) : NaN;
  // A draft class beyond every real anchor is a time-shifted career: preserve years-since-draft, not calendar year.
  const portraitSeason = Number.isFinite(season) && Number.isFinite(draftYear) && draftYear > lastPortraitYear
    ? firstPortraitYear + Math.max(0, season - draftYear)
    : season;
  const reachedYears = Number.isFinite(portraitSeason)
    ? years.filter(year => year <= portraitSeason).sort((left, right) => right - left)
    : [];
  const fallbackYears = reachedYears.length > 0
    ? reachedYears
    : Number.isFinite(portraitSeason) && years.length > 0
      ? [Math.min(...years)]
      : [];
  const candidates: string[] = [];
  for (const year of fallbackYears) {
    for (const portrait of entry.dated.get(year) ?? []) {
      addUnique(candidates, portrait);
    }
  }
  if (!Number.isFinite(portraitSeason) || reachedYears.length > 0 || years.length === 0 || options.isProspect) {
    for (const portrait of entry.overall) addUnique(candidates, portrait);
  }
  if (catalog && isPortraitIdentity(playerIdentity)) {
    const objectCache = catalogObjectResolutionCandidates.get(catalog) ?? new WeakMap<object, Map<string, readonly string[]>>();
    const queryCache = objectCache.get(playerIdentity) ?? new Map<string, readonly string[]>();
    queryCache.set(querySeasonKey, candidates);
    objectCache.set(playerIdentity, queryCache);
    catalogObjectResolutionCandidates.set(catalog, objectCache);
  } else if (catalog) {
    const stringCache = catalogStringResolutionCandidates.get(catalog) ?? new Map<string, readonly string[]>();
    stringCache.set(`${String(playerIdentity ?? '')}|${querySeasonKey}`, candidates);
    catalogStringResolutionCandidates.set(catalog, stringCache);
  }
  return candidates.filter(portrait => !isPortraitUrlUnavailable(portrait));
}

export function installNbaEraPortraitSnapshot(snapshot: NbaEraPortraitSnapshot): NbaEraPortraitCatalog {
  installedCatalog = buildNbaEraPortraitCatalog(snapshot);
  return installedCatalog;
}

export function setNbaEraPortraitRuntimeContext(context: { enabled: boolean; season?: number }): void {
  runtimeContext = {
    enabled: context.enabled,
    season: Number.isFinite(context.season) ? Number(context.season) : undefined,
  };
}

export function getCachedNbaEraPortraitCandidates(
  playerName: unknown,
  options?: PortraitResolutionOptions,
): string[] {
  if (!options && !runtimeContext.enabled) return [];
  const resolutionOptions = {
    season: options?.season ?? runtimeContext.season,
    isProspect: options?.isProspect,
  };
  return [...new Set([
    ...resolveNbaEraPortraitCandidates(installedArchivePlayerCatalog, playerName, resolutionOptions),
    ...resolveNbaEraPortraitCandidates(installedCatalog, playerName, resolutionOptions),
  ])];
}

export function getCachedNbaHistoricalStaffPortraitCandidates(
  staffName: unknown,
  season?: number,
): string[] {
  if (!runtimeContext.enabled) return [];
  return resolveNbaEraPortraitCandidates(installedArchiveStaffCatalog, staffName, {
    season: season ?? runtimeContext.season,
  });
}

export function getNbaEraPortraitCatalogEntryCount(): number {
  return (installedCatalog?.size ?? 0)
    + (installedArchivePlayerCatalog?.size ?? 0)
    + (installedArchiveStaffCatalog?.size ?? 0);
}

type HistoricalPortraitManifestRow = {
  File?: string;
  Person?: string;
  Year?: string;
  Role?: string;
  SchemaOK?: string;
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function parseNbaHistoricalPortraitManifest(csv: string): {
  players: NbaEraPortraitSnapshot;
  staff: NbaEraPortraitSnapshot;
} {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift() ?? '');
  const players: NbaEraPortraitRow[] = [];
  const staff: NbaEraPortraitRow[] = [];
  for (const line of lines) {
    const fields = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ''])) as HistoricalPortraitManifestRow;
    const file = String(row.File ?? '').trim().replace(/\\/g, '/');
    const legacyRootFile = !file.includes('/')
      ? file.match(/^(.+)_((?:18|19|20)\d{2})\.(?:png|jpe?g|webp)$/i)
      : null;
    const schemaAccepted = String(row.SchemaOK).toLowerCase() === 'true' || legacyRootFile != null;
    const person = String(row.Person ?? '').trim()
      || legacyRootFile?.[1].replace(/_/g, ' ').trim()
      || '';
    if (!file || !person || file.startsWith('_DUPLICATE_PURGE/') || !schemaAccepted) continue;
    const role = String(row.Role ?? '').toUpperCase();
    if (role !== 'PLAYER' && role !== 'STAFF') continue;
    const parsedYear = Number(String(row.Year ?? '').trim() || legacyRootFile?.[2]);
    const encodedFile = file.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const portrait: NbaEraPortraitRow = {
      name: person,
      year: Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : undefined,
      url: `${NBA_HISTORICAL_PORTRAIT_MEDIA_BASE}${encodedFile}`,
    };
    (role === 'STAFF' ? staff : players).push(portrait);
  }
  return {
    players: { schemaVersion: 1, portraits: players },
    staff: { schemaVersion: 1, portraits: staff },
  };
}

export async function loadNbaEraPortraitCatalog(): Promise<NbaEraPortraitCatalog> {
  if (installedCatalog) return installedCatalog;
  if (catalogPromise) return catalogPromise;
  catalogPromise = Promise.all([
    fetch(NBA_ERA_PORTRAIT_SOURCE_PATH, { cache: 'no-store' })
      .then(response => readJsonResponse<NbaEraPortraitSnapshot>(response, 'NBA era portrait catalog')),
    fetch(BUNDLED_REMOVED_PLAYERS_URL, { cache: 'no-store' })
      .then(response => readJsonResponse<RemovedPortraitSnapshot>(response, 'NBA removed-player portraits'))
      .catch(() => ({ players: [] })),
    fetch(NBA_CURRENT_PORTRAIT_OVERRIDE_PATH, { cache: 'no-store' })
      .then(response => readJsonResponse<NbaEraPortraitSnapshot>(response, 'NBA current portrait overrides'))
      .catch(() => ({ portraits: [] })),
    fetch(NBA_HISTORICAL_PORTRAIT_MANIFEST_PATH, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`NBA historical portrait manifest: HTTP ${response.status}`);
        return parseNbaHistoricalPortraitManifest(await response.text());
      })
      .catch(() => ({ players: { portraits: [] }, staff: { portraits: [] } })),
  ])
    .then(([base, removed, overrides, archive]) => {
      installedArchivePlayerCatalog = buildNbaEraPortraitCatalog(archive.players);
      installedArchiveStaffCatalog = buildNbaEraPortraitCatalog(archive.staff);
      return installNbaEraPortraitSnapshot({
        ...base,
        portraits: [
          ...(base.portraits ?? []),
          ...(removed.players ?? []).flatMap(player => isUsablePortraitUrl(player.imgURL) && player.name
            ? [{
                name: player.name,
                year: Number(player.draft?.year) || undefined,
                url: player.imgURL,
                currentSupplemental: true,
              }]
            : []),
          ...(overrides.portraits ?? []),
        ],
      });
    })
    .catch(error => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}
