import { dataUrlCandidates } from '../services/utils/dataProxy';
import {
  BUNDLED_REAL_PLAYER_DATA_URL,
  BUNDLED_REAL_PLAYER_STATS_URL,
} from './historicalNbaRosterSources';
import { ROSTER_URL } from '../constants';
import { mergeNormalizedPlayerAwards, normalizePlayerAwardRows } from '../utils/playerAwardNormalizer';
import type { NBAPlayer } from '../types';
import { readJsonResponse } from '../services/utils/jsonResponse';
import {
  ensurePortraitLookupsLoaded,
  getPhotoByPlayerIdentity,
} from './realPlayerDataFetcher';
import { recordSimulationPerf } from '../services/simulation/simulationPerfDebug';

export interface Player {
  name?: string;
  firstName?: string;
  lastName?: string;
  srID?: string;
  slug?: string;
  tid: number;
  pos: string;
  hgt: number;
  weight: number;
  imgURL?: string;
  born: {
    year: number;
    loc: string;
  };
  draft: {
    year: number;
    pick: number;
  };
  hof?: boolean;
  retiredYear?: number;
  awards?: {
    season: number;
    type: string;
  }[];
  ratings?: any[];
  stats?: any[];
}

export interface HOFInductee {
  year: string | number;
  name: string;
  position: string;
}

export interface ProcessedHOFPlayer extends Player {
  name: string;
  inductionYear: number;
}

export function adaptProcessedHOFPlayer(p: ProcessedHOFPlayer): NBAPlayer {
  const sourceId = String(p.srID ?? p.slug ?? '').trim();
  return {
    internalId: `ext-${normalizeName(p.name)}`,
    name: p.name,
    tid: p.tid ?? -3,
    pos: p.pos,
    hgt: p.hgt,
    weight: p.weight,
    imgURL: p.imgURL,
    born: p.born,
    draft: p.draft as any,
    awards: p.awards,
    ratings: (p as any).ratings ?? [],
    stats: (p as any).stats,
    hof: true,
    retiredYear: p.retiredYear,
    hofInductionYear: p.inductionYear,
    status: 'Retired',
    overallRating: 0,
    injury: { type: 'Healthy', gamesRemaining: 0 },
    srID: p.srID ?? p.slug,
    slug: p.slug ?? p.srID,
    ...(sourceId ? {
      personId: `person:nba-history:${sourceId}`,
      sourceIds: { srID: sourceId },
    } : {}),
  } as NBAPlayer;
}

interface FetchHOFDataOptions {
  inductionYear?: number;
  maxInductionYear?: number;
}

type ZenBio = {
  name?: string;
  pos?: string;
  height?: number;
  weight?: number;
  bornYear?: number;
  country?: string;
  draftYear?: number;
  draftPick?: number;
  awards?: unknown;
};

type ZenRealPlayerData = {
  bios?: Record<string, ZenBio>;
};

type ZenStat = {
  slug?: string;
  season?: number;
  tid?: number;
  abbrev?: string;
  playoffs?: boolean;
  gp?: number;
  gs?: number;
  min?: number;
  fg?: number;
  fga?: number;
  tp?: number;
  tpa?: number;
  ft?: number;
  fta?: number;
  orb?: number;
  drb?: number;
  trb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tov?: number;
  pf?: number;
  pts?: number;
  per?: number;
  ws?: number;
  vorp?: number;
};

type ZenRealPlayerStats = {
  stats?: ZenStat[];
};

const ZENGM_DATA_URLS = [
  BUNDLED_REAL_PLAYER_DATA_URL,
  ...dataUrlCandidates([
    'https://play.basketball-gm.com/gen/real-player-data-a92bc04ee3.json',
    'https://raw.githubusercontent.com/zengm-games/zengm/master/data/real-player-data.basketball.json',
  ]),
];

const ZENGM_STATS_URLS = [
  BUNDLED_REAL_PLAYER_STATS_URL,
  ...dataUrlCandidates([
    'https://play.basketball-gm.com/gen/real-player-stats-cdaae70215.json',
    'https://raw.githubusercontent.com/zengm-games/zengm/master/data/real-player-stats.basketball.json',
    'https://play.basketball-gm.com/gen/real-player-stats-9fb936681c.json',
  ]),
];

const BUNDLED_WNBA_ROSTER_URL = '/data/external/wnba/wnba-2026-bbgm.json';
const BUNDLED_HOF_URL = '/data/historical/hof/naismith-player-inductees.json';
const OPTIONAL_FETCH_TIMEOUT_MS = 20_000;

let hofDataCache: ProcessedHOFPlayer[] | null = null;
let hofDataPromise: Promise<ProcessedHOFPlayer[]> | null = null;

const perfNow = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();
const recordHofLeaf = (
  leaf: string,
  startedAt: number,
  items: number,
  extra: Record<string, string | number | boolean | undefined> = {},
): void => recordSimulationPerf({
  engine: 'hof-resolver-leaf',
  leaf,
  items,
  totalMs: perfNow() - startedAt,
  ...extra,
});

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function parseInductionYear(value: string | number | undefined): number {
  const year = Number(value ?? 0);
  return Number.isFinite(year) && year > 0 ? year : 0;
}

function statKey(stat: any): string {
  return [
    stat?.season ?? '',
    stat?.tid ?? '',
    stat?.abbrev ?? '',
    stat?.playoffs ? 1 : 0,
  ].join('|');
}

function mergeStats(existingStats: any[] | undefined, nextStats: any[] | undefined): any[] | undefined {
  if (!Array.isArray(existingStats) || existingStats.length === 0) return Array.isArray(nextStats) ? nextStats : existingStats;
  if (!Array.isArray(nextStats) || nextStats.length === 0) return existingStats;
  const byKey = new Map<string, any>();
  for (const stat of existingStats) {
    byKey.set(statKey(stat), stat);
  }
  for (const stat of nextStats) {
    byKey.set(statKey(stat), stat);
  }
  return Array.from(byKey.values());
}

function groupStatsBySlug(rows: ZenStat[] | undefined): Map<string, ZenStat[]> {
  const map = new Map<string, ZenStat[]>();
  for (const row of rows ?? []) {
    const slug = String(row?.slug ?? '').trim();
    if (!slug) continue;
    const existing = map.get(slug) ?? [];
    existing.push(row);
    map.set(slug, existing);
  }
  return map;
}

function toCareerStat(row: ZenStat): any | null {
  const gp = Number(row.gp ?? 0);
  const season = Number(row.season ?? 0);
  if (!Number.isFinite(season) || season <= 0) return null;
  return {
    season,
    abbrev: row.abbrev,
    tid: Number.isFinite(Number(row.tid)) ? Number(row.tid) : -1,
    playoffs: Boolean(row.playoffs),
    gp: Number.isFinite(gp) ? gp : 0,
    gs: Number(row.gs ?? 0) || 0,
    min: Number(row.min ?? 0) || 0,
    fg: Number(row.fg ?? 0) || 0,
    fga: Number(row.fga ?? 0) || 0,
    tp: Number(row.tp ?? 0) || 0,
    tpa: Number(row.tpa ?? 0) || 0,
    ft: Number(row.ft ?? 0) || 0,
    fta: Number(row.fta ?? 0) || 0,
    orb: Number(row.orb ?? 0) || 0,
    drb: Number(row.drb ?? 0) || 0,
    trb: Number(row.trb ?? ((row.orb ?? 0) + (row.drb ?? 0))) || 0,
    ast: Number(row.ast ?? 0) || 0,
    stl: Number(row.stl ?? 0) || 0,
    blk: Number(row.blk ?? 0) || 0,
    tov: Number(row.tov ?? 0) || 0,
    pf: Number(row.pf ?? 0) || 0,
    pts: Number(row.pts ?? 0) || 0,
    per: row.per,
    ws: row.ws,
    vorp: row.vorp,
  };
}

function careerStatsForSlug(slug: string | undefined, statsBySlug: Map<string, ZenStat[]>): any[] | undefined {
  if (!slug) return undefined;
  const stats = (statsBySlug.get(slug) ?? [])
    .map(toCareerStat)
    .filter((stat): stat is any => Boolean(stat));
  return stats.length > 0 ? stats : undefined;
}

async function fetchJsonFromFirstAvailable<T>(urls: string[], signal?: AbortSignal): Promise<T | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, signal ? { signal } : undefined);
      return await readJsonResponse<T>(res, `NBA Hall of Fame source ${url}`);
    } catch {}
  }
  return null;
}

async function fetchOptionalJson<T>(urls: string[]): Promise<T | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>(resolve => {
      timeoutId = setTimeout(() => {
        controller?.abort();
        resolve(null);
      }, OPTIONAL_FETCH_TIMEOUT_MS);
    });
    return await Promise.race([
      fetchJsonFromFirstAvailable<T>(urls, controller?.signal),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function buildZenBioByName(data: ZenRealPlayerData | null): Map<string, { slug: string; bio: ZenBio }> {
  const byName = new Map<string, { slug: string; bio: ZenBio }>();
  for (const [slug, bio] of Object.entries(data?.bios ?? {})) {
    if (!bio?.name) continue;
    byName.set(normalizeName(bio.name), { slug, bio });
  }
  return byName;
}

function resolveZenIdentity(
  player: Player | undefined,
  item: HOFInductee,
  zenBioByName: Map<string, { slug: string; bio: ZenBio }>,
  statsBySlug: Map<string, ZenStat[]>,
) {
  const explicitSlug = String(player?.slug ?? player?.srID ?? '').trim();
  if (explicitSlug && statsBySlug.has(explicitSlug)) return { slug: explicitSlug, bio: undefined };
  return zenBioByName.get(normalizeName(player?.name ?? item.name))
    ?? (explicitSlug ? { slug: explicitSlug, bio: undefined } : undefined);
}

function enrichFromZen(player: ProcessedHOFPlayer, item: HOFInductee, zenIdentity: { slug: string; bio?: ZenBio } | undefined, statsBySlug: Map<string, ZenStat[]>): ProcessedHOFPlayer {
  const bio = zenIdentity?.bio;
  const stats = careerStatsForSlug(zenIdentity?.slug, statsBySlug);
  const bornYear = player.born?.year || bio?.bornYear || 0;
  const draftYear = player.draft?.year || bio?.draftYear || 0;
  const sourceAwards = normalizePlayerAwardRows(bio?.awards);
  return {
    ...player,
    srID: player.srID ?? zenIdentity?.slug,
    slug: player.slug ?? zenIdentity?.slug,
    pos: player.pos || bio?.pos || item.position || '',
    hgt: player.hgt || bio?.height || 0,
    weight: player.weight || bio?.weight || 0,
    born: {
      year: bornYear,
      loc: player.born?.loc || bio?.country || '',
    },
    draft: {
      year: draftYear,
      pick: player.draft?.pick || bio?.draftPick || 0,
    },
    awards: mergeNormalizedPlayerAwards(player.awards, sourceAwards),
    stats: mergeStats(player.stats, stats),
  };
}

function buildFallbackPlayer(item: HOFInductee, inductionYear: number): ProcessedHOFPlayer {
  return {
    name: item.name,
    tid: -3,
    pos: item.position ?? '',
    hgt: 0,
    weight: 0,
    born: {
      year: 0,
      loc: '',
    },
    draft: {
      year: 0,
      pick: 0,
    },
    awards: [],
    hof: true,
    inductionYear,
  };
}

function isRelevantHOFItem(item: HOFInductee, options: FetchHOFDataOptions): boolean {
  const inductionYear = parseInductionYear(item.year);
  if (!item?.name || !inductionYear) return false;
  if (options.inductionYear && inductionYear !== options.inductionYear) return false;
  if (options.maxInductionYear && inductionYear > options.maxInductionYear) return false;
  return true;
}

function filterProcessedHOFData(data: ProcessedHOFPlayer[], options: FetchHOFDataOptions): ProcessedHOFPlayer[] {
  return data.filter(player => {
    if (options.inductionYear && player.inductionYear !== options.inductionYear) return false;
    if (options.maxInductionYear && player.inductionYear > options.maxInductionYear) return false;
    return true;
  });
}

async function loadHOFDataFromSources(): Promise<ProcessedHOFPlayer[]> {
  try {
    const hofUrl = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbahalloffame';
    const missingUrl = 'https://api.npoint.io/d94bdfeeecf4246b481d';

    const listStartedAt = perfNow();
    const hofListData = await fetchJsonFromFirstAvailable<any>([BUNDLED_HOF_URL, hofUrl]);
    const hofItems: HOFInductee[] = (Array.isArray(hofListData) ? hofListData : (hofListData?.data || []))
      .filter((item: HOFInductee) => isRelevantHOFItem(item, {}));
    recordHofLeaf('static-hof-list-load-parse-filter', listStartedAt, hofItems.length, { cacheMisses: 1 });

    if (hofItems.length === 0) {
      return [];
    }

    const hydrationStartedAt = perfNow();
    const [rosterData, missingData, wnbaRosterData, zenData, zenStats] = await Promise.all([
      fetchOptionalJson<any>([ROSTER_URL]),
      fetchOptionalJson<any>([missingUrl]),
      fetchOptionalJson<{ players?: Player[] }>([BUNDLED_WNBA_ROSTER_URL]),
      fetchOptionalJson<ZenRealPlayerData>(ZENGM_DATA_URLS),
      fetchOptionalJson<ZenRealPlayerStats>(ZENGM_STATS_URLS),
      ensurePortraitLookupsLoaded(),
    ]);
    recordHofLeaf('historical-source-hydration', hydrationStartedAt, hofItems.length, {
      rosterRows: Array.isArray(rosterData) ? rosterData.length : (rosterData?.players?.length ?? 0),
      missingRows: Array.isArray(missingData) ? missingData.length : (missingData?.players?.length ?? 0),
      wnbaRows: Array.isArray(wnbaRosterData) ? wnbaRosterData.length : (wnbaRosterData?.players?.length ?? 0),
      bioRows: Object.keys(zenData?.bios ?? {}).length,
      statRows: zenStats?.stats?.length ?? 0,
    });

    const indexStartedAt = perfNow();
    const players: Player[] = Array.isArray(rosterData) ? rosterData : (rosterData?.players || []);
    const missingPlayers: Player[] = Array.isArray(missingData) ? missingData : (missingData?.players || []);
    const wnbaPlayers: Player[] = Array.isArray(wnbaRosterData)
      ? wnbaRosterData
      : (wnbaRosterData?.players ?? []);
    const zenBioByName = buildZenBioByName(zenData);
    const statsBySlug = groupStatsBySlug(zenStats?.stats);

    const combinedPlayersMap = new Map<string, Player>();

    const processPlayer = (player: Player) => {
      let fullName = player.name?.trim();
      if (!fullName && player.firstName && player.lastName) {
        fullName = `${player.firstName.trim()} ${player.lastName.trim()}`;
      }
      if (!fullName) return;

      const key = normalizeName(fullName);
      const existing = combinedPlayersMap.get(key);
      if (existing) {
        if (player.awards) {
          const mergedAwards = [...(existing.awards || []), ...player.awards];
          const uniqueAwards = new Map<string, { season: number; type: string }>();
          mergedAwards.forEach(award => uniqueAwards.set(`${award.season}-${award.type}`, award));
          existing.awards = Array.from(uniqueAwards.values());
        }
        existing.stats = mergeStats(existing.stats, player.stats);
        if ((!existing.ratings || existing.ratings.length === 0) && player.ratings) existing.ratings = player.ratings;
        if (!existing.hof && player.hof) existing.hof = player.hof;
        if (!existing.imgURL && player.imgURL) existing.imgURL = player.imgURL;
        return;
      }

      combinedPlayersMap.set(key, { ...player, name: fullName });
    };

    players.forEach(processPlayer);
    missingPlayers.forEach(processPlayer);
    wnbaPlayers.forEach(processPlayer);
    recordHofLeaf('historical-source-index-construction', indexStartedAt, combinedPlayersMap.size, {
      playerRows: players.length + missingPlayers.length + wnbaPlayers.length,
      bioRows: zenBioByName.size,
      statPlayers: statsBySlug.size,
    });

    const materializeStartedAt = perfNow();
    const processed = hofItems
      .map(item => {
        const inductionYear = parseInductionYear(item.year);
        const matched = combinedPlayersMap.get(normalizeName(item.name));
        const zenIdentity = resolveZenIdentity(matched, item, zenBioByName, statsBySlug);
        if (!matched && !zenIdentity) return null;
        if (!matched) {
          const player = enrichFromZen(buildFallbackPlayer(item, inductionYear), item, zenIdentity, statsBySlug);
          return {
            ...player,
            imgURL: getPhotoByPlayerIdentity({ srID: player.srID, slug: player.slug, name: player.name }) ?? undefined,
          };
        }

        const hofAward = matched.awards?.find(award =>
          award.type.toLowerCase().includes('inducted into the hall of fame') ||
          award.type.toLowerCase() === 'hall of fame',
        );

        const player = enrichFromZen({
          ...matched,
          name: matched.name ?? item.name,
          pos: matched.pos ?? item.position ?? '',
          hof: true,
          inductionYear: hofAward?.season ?? inductionYear,
        }, item, zenIdentity, statsBySlug);
        return {
          ...player,
          imgURL: player.imgURL ?? getPhotoByPlayerIdentity({ srID: player.srID, slug: player.slug, name: player.name }) ?? undefined,
        };
      })
      .filter((player): player is NonNullable<typeof player> => player !== null)
      .sort((a, b) => b.inductionYear - a.inductionYear);
    recordHofLeaf('all-class-materialization-sort', materializeStartedAt, hofItems.length, {
      materialized: processed.length,
    });
    return processed;
  } catch (error) {
    console.error('Error fetching HOF data:', error);
    return [];
  }
}

export function preloadHOFData(): Promise<ProcessedHOFPlayer[]> {
  if (hofDataCache) {
    recordSimulationPerf({ engine: 'hof-resolver-cache', cache: 'static-source', cacheHits: 1, cacheMisses: 0 });
    return Promise.resolve(hofDataCache);
  }
  if (!hofDataPromise) {
    recordSimulationPerf({ engine: 'hof-resolver-cache', cache: 'static-source', cacheHits: 0, cacheMisses: 1 });
    hofDataPromise = loadHOFDataFromSources().then(data => {
      hofDataCache = data;
      return data;
    });
  } else {
    recordSimulationPerf({ engine: 'hof-resolver-cache', cache: 'static-source-promise', cacheHits: 1, cacheMisses: 0 });
  }
  return hofDataPromise;
}

export function getCachedHOFData(options: FetchHOFDataOptions = {}): ProcessedHOFPlayer[] {
  return hofDataCache ? filterProcessedHOFData(hofDataCache, options) : [];
}

export async function fetchHOFData(options: FetchHOFDataOptions = {}): Promise<ProcessedHOFPlayer[]> {
  const data = await preloadHOFData();
  return filterProcessedHOFData(data, options);
}
