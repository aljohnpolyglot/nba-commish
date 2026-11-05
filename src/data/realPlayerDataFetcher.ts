/**
 * realPlayerDataFetcher.ts
 *
 * Two lazy data sources keyed by Basketball-Reference slug (srID):
 *   1. player-photos.json (~200 KB) — portrait URLs for historical + active players
 *   2. ZenGM real-player-data.basketball.json (17 MB) — biographical data for retired/historical players
 *
 * Both are cached in module memory (never localStorage — too large).
 * Photos load eagerly when first needed (small). ZenGM bios load lazily on first
 * retired-player bio click (slow first load, instant thereafter).
 */

import { fetchMissingPortraits } from './franchiseService';
import { dataUrlCandidates } from '../services/utils/dataProxy';
import { ROSTER_URL } from '../constants';
import type { NBAGMStat, NBAPlayer } from '../types';
import { mergeNormalizedPlayerAwards, normalizePlayerAwardRows } from '../utils/playerAwardNormalizer';
import { readJsonResponse } from '../services/utils/jsonResponse';
import {
  BUNDLED_REAL_PLAYER_DATA_URL,
  BUNDLED_REAL_PLAYER_STATS_URL,
} from './historicalNbaRosterSources';
import {
  ensureHistoricalNbaDeathDataLoaded,
  historicalDeathBeforeBranch,
  mergeHistoricalNbaDeathSources,
} from './historicalNbaDeathData';
import { calculateOverallFromRating, estimatePotentialBbgm } from '../utils/playerRatings';
import { getPlayerNationalityCountries } from '../utils/playerNationality';

const PHOTOS_URL =
  'https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/player-photos.json';
const PHOTOS_URLS = dataUrlCandidates([PHOTOS_URL]);
const NCAA_PORTRAITS_URL = '/data/college/realgm-ncaa-portraits-2025-26.json';
const EUROLEAGUE_PORTRAITS_URL = '/data/external/euroleague/euroleague-portrait-overrides-2025.json';
const ZENGM_URLS = [
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
const FULL_ROSTER_URLS = dataUrlCandidates([ROSTER_URL]);
const PLAYER_NAME_ALIASES: Record<string, string[]> = {
  'lew alcindor': ['Kareem Abdul-Jabbar'],
  'kareem abdul jabbar': ['Lew Alcindor'],
  'kareem abdul-jabbar': ['Lew Alcindor'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ZenGMBio {
  name?: string;
  bornYear?: number;
  diedYear?: number;
  diedDate?: string;
  country?: string;   // birth country / nationality
  height?: number;    // inches (BBGM convention)
  weight?: number;    // lbs
  pos?: string;
  college?: string;
  draftYear?: number;
  draftRound?: number;
  draftPick?: number;
  draftAbbrev?: string; // drafting team abbrev
  awards?: unknown;
}

type ZenGMStat = {
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
  ows?: number;
  dws?: number;
  vorp?: number;
  jerseyNumber?: string | number;
};

type ZenGMSalary = {
  slug?: string;
  start?: number;
  amounts?: number[];
};

type ZenGMRating = Record<string, unknown> & {
  slug?: string;
  season?: number;
  ovr?: number;
  pot?: number;
};

type FullRosterPlayer = Record<string, any> & {
  name?: string;
  firstName?: string;
  lastName?: string;
  srID?: string;
  slug?: string;
  awards?: unknown;
  stats?: any[];
};

type FullRosterTeam = Record<string, any> & {
  abbrev?: string;
  region?: string;
  name?: string;
  seasons?: any[];
  retiredJerseyNumbers?: any[];
};

type FullRosterLoadAttempt = {
  url: string;
  ok: boolean;
  status?: number;
  players?: number;
  error?: string;
};

type FullRosterLoadDiagnostics = {
  state: BioLoadState;
  selectedUrl?: string;
  players: number;
  attempts: FullRosterLoadAttempt[];
};

export type NativeRetiredJerseySourceRecord = {
  number: string;
  seasonRetired: number;
  playerId: string;
  text: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Photos (player-photos.json)  — srID → photo URL
// ─────────────────────────────────────────────────────────────────────────────

let _photosMap: Map<string, string> | null = null;
let _photoSlugsByUrl: Map<string, Set<string>> | null = null;
let _photosPromise: Promise<void> | null = null;

function portraitIdentityKey(url: string): string {
  const nbaId = url.match(/headshots\/(?:nba|gleague)\/[^/]+\/[^/]+\/(\d+)\.png/i)?.[1];
  return nbaId ? `nba:${nbaId}` : url.trim().toLowerCase();
}

export function ensurePhotosLoaded(): Promise<void> {
  if (_photosMap) return Promise.resolve();
  if (_photosPromise) return _photosPromise;
  _photosPromise = fetchFirstJson<Record<string, string>>(PHOTOS_URLS)
    .then((data) => {
      _photosMap = new Map(Object.entries(data ?? {}));
      _photoSlugsByUrl = new Map();
      for (const [slug, url] of _photosMap) {
        const key = portraitIdentityKey(url);
        const owners = _photoSlugsByUrl.get(key) ?? new Set<string>();
        owners.add(slug);
        _photoSlugsByUrl.set(key, owners);
      }
    })
    .catch(() => {
      _photosMap = new Map(); // empty on error so we don't retry endlessly
      _photoSlugsByUrl = new Map();
    })
    .finally(() => { _photosPromise = null; });
  return _photosPromise;
}

/** Returns portrait URL for a given srID, or null if not found / not loaded yet. */
export function getPhotoBySlug(srID: string): string | null {
  return _photosMap?.get(srID) ?? null;
}

export function isPhotosReady(): boolean {
  return _photosMap !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZenGM bio data — srID → biographical fields
// ─────────────────────────────────────────────────────────────────────────────

let _biosMap: Map<string, ZenGMBio> | null = null;
let _salariesBySlug: Map<string, ZenGMSalary[]> | null = null;
let _ratingsBySlug: Map<string, ZenGMRating[]> | null = null;
let _nativeRetiredJerseysByTeam: Map<string, NativeRetiredJerseySourceRecord[]> | null = null;
let _nameMap: Map<string, string> | null = null; // normalizedName → srID
let _normalizedNameMap: Map<string, string> | null = null;
let _ambiguousNormalizedNames: Set<string> | null = null;
let _bioPromise: Promise<void> | null = null;
let _statsBySlug: Map<string, ZenGMStat[]> | null = null;
let _statsPromise: Promise<void> | null = null;
let _missingPortraitsMap: Map<string, string> | null = null;
let _missingPortraitsPromise: Promise<void> | null = null;
let _ncaaPortraitsMap: Map<string, string> | null = null;
let _ncaaPortraitsPromise: Promise<void> | null = null;
let _euroleaguePortraitsMap: Map<string, string> | null = null;
let _euroleaguePortraitsPromise: Promise<void> | null = null;
let _fullRosterBySlug: Map<string, FullRosterPlayer> | null = null;
let _fullRosterByName: Map<string, FullRosterPlayer> | null = null;
let _fullRosterTeamByAbbrev: Map<string, FullRosterTeam> | null = null;
let _fullRosterPromise: Promise<void> | null = null;
let _fullRosterDiagnostics: FullRosterLoadDiagnostics = { state: 'idle', players: 0, attempts: [] };
const _nativeSeasonPlayersCache = new Map<number, NBAPlayer[]>();
const _nativeThroughSeasonPlayersCache = new Map<number, NBAPlayer[]>();
export type BioLoadState = 'idle' | 'loading' | 'done' | 'error';
let _bioLoadState: BioLoadState = 'idle';

export function normalizePlayerName(name: string): string {
  const tokens = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,'’]/g, '')
    .replace(/[-`]/g, ' ')
    .replace(/\s+\b(jr|sr|ii|iii|iv|v)\b\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const merged: string[] = [];
  for (let index = 0; index < tokens.length;) {
    if (tokens[index].length === 1) {
      let end = index + 1;
      while (end < tokens.length && tokens[end].length === 1) end += 1;
      if (end > index + 1) {
        merged.push(tokens.slice(index, end).join(''));
        index = end;
        continue;
      }
    }
    merged.push(tokens[index]);
    index += 1;
  }
  return merged.join(' ');
}

function normalizeIdentityName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,'’]/g, '')
    .replace(/[-`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addUniqueNormalizedName(
  map: Map<string, string>,
  ambiguous: Set<string>,
  name: string,
  slug: string,
): void {
  const key = normalizePlayerName(name);
  if (!key || ambiguous.has(key)) return;
  const existing = map.get(key);
  if (existing && existing !== slug) {
    map.delete(key);
    ambiguous.add(key);
    return;
  }
  map.set(key, slug);
}

function nameLookupKeys(name: string): string[] {
  const raw = name.trim();
  if (!raw) return [];
  const keys = new Set<string>([raw.toLowerCase(), normalizePlayerName(raw)]);
  for (const key of [...keys]) {
    for (const alias of PLAYER_NAME_ALIASES[key] ?? []) {
      keys.add(alias.toLowerCase().trim());
      keys.add(normalizePlayerName(alias));
    }
  }
  return [...keys].filter(Boolean);
}

export function getBioLoadState(): BioLoadState { return _bioLoadState; }
export function isBiosReady(): boolean { return _biosMap !== null; }

async function fetchFirstJson<T>(urls: string[]): Promise<T | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      return await readJsonResponse<T>(res, `NBA player source ${url}`);
    } catch {}
  }
  return null;
}

export function ensureBiosLoaded(): Promise<void> {
  if (_biosMap) return Promise.resolve();
  if (_bioPromise) return _bioPromise;
  _bioLoadState = 'loading';
  _bioPromise = Promise.all([fetchFirstJson<any>(ZENGM_URLS), ensureHistoricalNbaDeathDataLoaded()])
    .then(([data]: [any, void]) => {
      _nativeSeasonPlayersCache.clear();
      _nativeThroughSeasonPlayersCache.clear();
      _biosMap = new Map();
      _nameMap = new Map();
      _normalizedNameMap = new Map();
      _ambiguousNormalizedNames = new Set();
      _salariesBySlug = new Map();
      _ratingsBySlug = new Map();
      _nativeRetiredJerseysByTeam = new Map();
      const bios = mergeHistoricalNbaDeathSources(data?.bios ?? {}) as Record<string, any>;
      const awardsBySlug: Record<string, unknown> = data?.awards ?? {};
      for (const [srID, bio] of Object.entries(bios)) {
        const entry: ZenGMBio = {
          name:        bio.name,
          bornYear:    bio.bornYear,
          diedYear:    bio.diedYear,
          diedDate:    bio.diedDate,
          country:     bio.country,
          height:      bio.height,
          weight:      bio.weight,
          pos:         bio.pos,
          college:     bio.college,
          draftYear:   bio.draftYear,
          draftRound:  bio.draftRound,
          draftPick:   bio.draftPick,
          draftAbbrev: bio.draftAbbrev,
          awards:      bio.awards ?? awardsBySlug[srID],
        };
        _biosMap!.set(srID, entry);
        if (bio.name) {
          _nameMap!.set(bio.name.toLowerCase().trim(), srID);
          addUniqueNormalizedName(_normalizedNameMap!, _ambiguousNormalizedNames!, bio.name, srID);
        }
      }
      for (const salary of (data?.salaries ?? []) as ZenGMSalary[]) {
        const slug = String(salary?.slug ?? '').trim();
        if (!slug) continue;
        const rows = _salariesBySlug.get(slug) ?? [];
        rows.push(salary);
        _salariesBySlug.set(slug, rows);
      }
      for (const rating of (data?.ratings ?? []) as ZenGMRating[]) {
        const slug = String(rating?.slug ?? '').trim();
        const season = Number(rating?.season ?? 0);
        if (!slug || !Number.isFinite(season) || season <= 0) continue;
        const rows = _ratingsBySlug.get(slug) ?? [];
        rows.push(rating);
        _ratingsBySlug.set(slug, rows);
      }
      for (const [teamAbbrev, records] of Object.entries(data?.retiredJerseyNumbers ?? {})) {
        const normalizedTeam = String(teamAbbrev ?? '').trim().toUpperCase();
        if (!normalizedTeam || !Array.isArray(records)) continue;
        const normalizedRecords = records
          .map((record: any): NativeRetiredJerseySourceRecord | null => {
            const number = String(record?.number ?? '').trim();
            const playerId = String(record?.slug ?? record?.playerId ?? '').trim();
            const seasonRetired = Number(record?.season ?? record?.seasonRetired ?? 0);
            if (!number || !playerId) return null;
            return {
              number,
              seasonRetired: Number.isFinite(seasonRetired) && seasonRetired > 0 ? seasonRetired : 0,
              playerId,
              text: String(bios[playerId]?.name ?? '').trim(),
            };
          })
          .filter((record: NativeRetiredJerseySourceRecord | null): record is NativeRetiredJerseySourceRecord => Boolean(record));
        _nativeRetiredJerseysByTeam.set(normalizedTeam, normalizedRecords);
      }
      _bioLoadState = 'done';
    })
    .catch(() => {
      _biosMap  = new Map();
      _nameMap  = new Map();
      _normalizedNameMap = new Map();
      _ambiguousNormalizedNames = new Set();
      _salariesBySlug = new Map();
      _ratingsBySlug = new Map();
      _nativeRetiredJerseysByTeam = new Map();
      _bioLoadState = 'error';
    })
    .finally(() => { _bioPromise = null; });
  return _bioPromise;
}

/** Returns ZenGM bio for a given srID, or null if not found / not loaded. */
export function getBioBySlug(srID: string): ZenGMBio | null {
  return _biosMap?.get(srID) ?? null;
}

export function getNativeRetiredJerseyRecords(
  teamAbbrevs: readonly string[],
  maxSeason = Infinity,
): NativeRetiredJerseySourceRecord[] {
  if (!_nativeRetiredJerseysByTeam) return [];
  const rows = new Map<string, NativeRetiredJerseySourceRecord>();
  for (const abbrev of teamAbbrevs) {
    const key = String(abbrev ?? '').trim().toUpperCase();
    if (!key) continue;
    for (const record of _nativeRetiredJerseysByTeam.get(key) ?? []) {
      if (record.seasonRetired > 0 && record.seasonRetired > maxSeason) continue;
      const identity = `${record.number}|${record.playerId}`;
      if (!rows.has(identity)) rows.set(identity, record);
    }
  }
  return [...rows.values()];
}

export function getSlugByPlayerName(name: string): string | null {
  if (!_nameMap) return null;
  const exactKeys = new Set<string>([name.toLowerCase().trim()]);
  for (const alias of PLAYER_NAME_ALIASES[name.toLowerCase().trim()] ?? []) {
    exactKeys.add(alias.toLowerCase().trim());
  }
  for (const key of exactKeys) {
    const slug = _nameMap.get(key);
    if (slug) return slug;
  }
  for (const key of nameLookupKeys(name).map(normalizePlayerName)) {
    const slug = _normalizedNameMap?.get(key);
    if (slug) return slug;
  }
  return null;
}

export function getBioByName(name: string): (ZenGMBio & { slug: string }) | null {
  const slug = getSlugByPlayerName(name);
  if (!slug) return null;
  const bio = getBioBySlug(slug);
  return bio ? { ...bio, slug } : null;
}

export function getBioForPlayerIdentity(
  player: { srID?: string | null; slug?: string | null; name?: string | null },
): (ZenGMBio & { slug: string }) | null {
  const explicitSlug = String(player.srID ?? player.slug ?? '').trim();
  if (explicitSlug) {
    const explicitBio = getBioBySlug(explicitSlug);
    if (explicitBio) return { ...explicitBio, slug: explicitSlug };
  }
  return player.name ? getBioByName(player.name) : null;
}

export function getVerifiedBioForPlayerIdentity(
  player: {
    srID?: string | null;
    slug?: string | null;
    name?: string | null;
    born?: { year?: number | null } | null;
    hgt?: number | null;
  },
): (ZenGMBio & { slug: string }) | null {
  const explicitSlug = String(player.srID ?? player.slug ?? '').trim();
  if (explicitSlug) {
    const explicitBio = getBioBySlug(explicitSlug);
    return explicitBio ? { ...explicitBio, slug: explicitSlug } : null;
  }
  const key = normalizePlayerName(String(player.name ?? ''));
  const slug = key ? _normalizedNameMap?.get(key) : undefined;
  const bio = slug ? getBioBySlug(slug) : null;
  if (!bio || !slug) return null;
  const playerBirthYear = Number(player.born?.year);
  const bioBirthYear = Number(bio.bornYear);
  if (
    !Number.isInteger(playerBirthYear)
    || playerBirthYear <= 0
    || !Number.isInteger(bioBirthYear)
    || bioBirthYear !== playerBirthYear
  ) return null;
  const playerHeight = Number(player.hgt);
  const bioHeight = Number(bio.height);
  if (
    Number.isFinite(playerHeight)
    && playerHeight > 0
    && Number.isFinite(bioHeight)
    && bioHeight > 0
    && Math.abs(playerHeight - bioHeight) > 2
  ) return null;
  return { ...bio, slug };
}

export function getNativeDraftProfileForIdentity(
  player: { srID?: string | null; slug?: string | null; name?: string | null },
): { year: number; round: number; pick: number; abbrev?: string } | null {
  const bio = getBioForPlayerIdentity(player);
  const year = Number(bio?.draftYear ?? 0);
  const round = Number(bio?.draftRound ?? 0);
  const pick = Number(bio?.draftPick ?? 0);
  if (!Number.isFinite(year) || year <= 0 || !Number.isFinite(round) || round <= 0 || !Number.isFinite(pick) || pick <= 0) {
    return null;
  }
  const abbrev = String(bio?.draftAbbrev ?? '').trim().toUpperCase();
  return { year, round, pick, ...(abbrev ? { abbrev } : {}) };
}

export function getNativeHistoricalRatingsForIdentity(
  player: { srID?: string | null; slug?: string | null; name?: string | null },
  maxSeason = Infinity,
): NonNullable<NBAPlayer['ratings']> {
  const bio = getBioForPlayerIdentity(player);
  if (!bio) return [];
  const rows = _ratingsBySlug?.get(bio.slug) ?? [];
  return rows
    .filter(row => Number(row.season ?? 0) <= maxSeason)
    .sort((left, right) => Number(left.season ?? 0) - Number(right.season ?? 0))
    .map(row => {
      const season = Number(row.season);
      const overall = Number.isFinite(Number(row.ovr))
        ? Number(row.ovr)
        : calculateOverallFromRating(row);
      const age = Math.max(0, season - Number(bio.bornYear ?? season - 25));
      const potential = Number.isFinite(Number(row.pot))
        ? Number(row.pot)
        : estimatePotentialBbgm(overall, age);
      return { ...row, season, ovr: overall, pot: potential } as NonNullable<NBAPlayer['ratings']>[number];
    });
}

function fullRosterSlug(player: FullRosterPlayer | undefined | null): string {
  return String(player?.srID ?? player?.slug ?? '').trim();
}

export function getFullRosterPlayerName(player: FullRosterPlayer | undefined | null): string {
  return String(player?.name ?? [player?.firstName, player?.lastName].filter(Boolean).join(' ')).trim();
}

function fullRosterPlayerSignal(player: FullRosterPlayer | undefined | null): number {
  if (!player) return -1;
  const awards = Array.isArray(player.awards) ? player.awards.length : 0;
  const stats = Array.isArray(player.stats) ? player.stats.length : 0;
  const ratings = Array.isArray(player.ratings) ? player.ratings.length : 0;
  const hof = player.hof ? 1 : 0;
  const retired = player.retiredYear ? 1 : 0;
  const img = player.imgURL ? 1 : 0;
  const bio = player.born || player.draft || player.hgt || player.height || player.weight ? 1 : 0;
  return awards * 10000 + stats * 100 + ratings * 10 + hof * 8 + retired * 4 + img * 2 + bio;
}

function pickRicherFullRosterPlayer(
  left: FullRosterPlayer | null | undefined,
  right: FullRosterPlayer | null | undefined,
): FullRosterPlayer | null {
  if (!left) return right ?? null;
  if (!right) return left;
  return fullRosterPlayerSignal(right) > fullRosterPlayerSignal(left) ? right : left;
}

function setPreferredFullRosterPlayer(map: Map<string, FullRosterPlayer>, key: string, player: FullRosterPlayer): void {
  if (!key) return;
  const existing = map.get(key);
  map.set(key, pickRicherFullRosterPlayer(existing, player) ?? player);
}

function setFullRosterTeam(map: Map<string, FullRosterTeam>, key: string | undefined, team: FullRosterTeam): void {
  const normalized = String(key ?? '').trim().toUpperCase();
  if (!normalized || map.has(normalized)) return;
  map.set(normalized, team);
}

async function fetchFullRosterPlayers(): Promise<FullRosterPlayer[]> {
  const attempts: FullRosterLoadAttempt[] = [];
  _fullRosterDiagnostics = { state: 'loading', players: 0, attempts };

  for (const url of FULL_ROSTER_URLS) {
    const attempt: FullRosterLoadAttempt = { url, ok: false };
    attempts.push(attempt);
    try {
      const res = await fetch(url);
      attempt.status = res.status;
      attempt.ok = res.ok;
      const data = await readJsonResponse<{ players?: FullRosterPlayer[] } | FullRosterPlayer[]>(res, `NBA full roster ${url}`);
      const players = Array.isArray(data) ? data : data?.players;
      const teams = Array.isArray(data) ? [] : ((data as any)?.teams ?? []);
      attempt.players = Array.isArray(players) ? players.length : 0;
      if (Array.isArray(players) && players.length > 0) {
        _fullRosterTeamByAbbrev = new Map();
        if (Array.isArray(teams)) {
          for (const team of teams as FullRosterTeam[]) {
            setFullRosterTeam(_fullRosterTeamByAbbrev, team?.abbrev, team);
            for (const season of team?.seasons ?? []) {
              setFullRosterTeam(_fullRosterTeamByAbbrev, season?.abbrev, team);
            }
          }
        }
        _fullRosterDiagnostics = {
          state: 'done',
          selectedUrl: url,
          players: players.length,
          attempts: attempts.map(entry => ({ ...entry })),
        };
        return players;
      }
      attempt.error = 'no players array';
    } catch (error) {
      attempt.error = error instanceof Error ? error.message : String(error);
    }
  }

  _fullRosterDiagnostics = {
    state: 'error',
    players: 0,
    attempts: attempts.map(entry => ({ ...entry })),
  };
  _fullRosterTeamByAbbrev = new Map();
  return [];
}

export function ensureFullRosterPlayerDataLoaded(): Promise<void> {
  if (_fullRosterBySlug && _fullRosterByName && _fullRosterTeamByAbbrev) return Promise.resolve();
  if (_fullRosterPromise) return _fullRosterPromise;
  _fullRosterPromise = fetchFullRosterPlayers()
    .then((players) => {
      _nativeSeasonPlayersCache.clear();
      _nativeThroughSeasonPlayersCache.clear();
      _fullRosterBySlug = new Map();
      _fullRosterByName = new Map();
      if (!_fullRosterTeamByAbbrev) _fullRosterTeamByAbbrev = new Map();
      for (const player of players) {
        const slug = fullRosterSlug(player);
        if (slug) setPreferredFullRosterPlayer(_fullRosterBySlug, slug.toLowerCase(), player);
        const name = getFullRosterPlayerName(player);
        if (name) {
          setPreferredFullRosterPlayer(_fullRosterByName, name.toLowerCase().trim(), player);
          setPreferredFullRosterPlayer(_fullRosterByName, normalizePlayerName(name), player);
        }
      }
    })
    .catch(() => {
      _nativeSeasonPlayersCache.clear();
      _nativeThroughSeasonPlayersCache.clear();
      _fullRosterBySlug = new Map();
      _fullRosterByName = new Map();
      _fullRosterTeamByAbbrev = new Map();
      _fullRosterDiagnostics = { state: 'error', players: 0, attempts: _fullRosterDiagnostics.attempts };
    })
    .finally(() => { _fullRosterPromise = null; });
  return _fullRosterPromise;
}

export function getFullRosterPlayerBySlug(slug: string | null | undefined): FullRosterPlayer | null {
  const key = String(slug ?? '').trim().toLowerCase();
  return key ? _fullRosterBySlug?.get(key) ?? null : null;
}

export function getFullRosterPlayerByName(name: string | null | undefined): FullRosterPlayer | null {
  const raw = String(name ?? '').trim();
  if (!raw) return null;
  for (const key of nameLookupKeys(raw)) {
    const player = _fullRosterByName?.get(key);
    if (!player) continue;
    const sourceName = getFullRosterPlayerName(player);
    if (key === raw.toLowerCase().trim() || normalizeIdentityName(sourceName) === normalizeIdentityName(raw)) {
      return player;
    }
  }
  return null;
}

export function getFullRosterPlayerForIdentity(player: { srID?: string | null; slug?: string | null; name?: string | null }): FullRosterPlayer | null {
  const explicitSlug = String(player.srID ?? player.slug ?? '').trim();
  const bySlug = getFullRosterPlayerBySlug(explicitSlug);
  if (bySlug) return bySlug;
  const byName = getFullRosterPlayerByName(player.name);
  if (!explicitSlug || !byName || !player.name) return byName;
  return normalizeIdentityName(getFullRosterPlayerName(byName)) === normalizeIdentityName(player.name)
    ? byName
    : null;
}

export function getExplicitFullRosterNationality(source: Record<string, any> | null | undefined): string | undefined {
  if (!source) return undefined;
  const direct = source.nationality ?? source.country ?? source.born?.country;
  const birthLocation = String(source.born?.loc ?? '').trim();
  const markedBirthLocation = /(?:^|[-–—,;|])\s*country\s*:/i.test(birthLocation)
    ? birthLocation
    : undefined;
  const countries = getPlayerNationalityCountries({
    nationality: direct,
    born: markedBirthLocation ? { loc: markedBirthLocation } : undefined,
  });
  return countries.length > 0 ? countries.join(' / ') : undefined;
}

export function getExplicitFullRosterNationalityForIdentity(
  player: { srID?: string | null; slug?: string | null; name?: string | null },
): string | undefined {
  return getExplicitFullRosterNationality(getFullRosterPlayerForIdentity(player));
}

export function getFullRosterTeamByAbbrev(abbrev: string | null | undefined): FullRosterTeam | null {
  const key = String(abbrev ?? '').trim().toUpperCase();
  return key ? _fullRosterTeamByAbbrev?.get(key) ?? null : null;
}

export function getFullRosterAwardsForIdentity(
  player: { srID?: string | null; slug?: string | null; name?: string | null },
  maxExclusiveSeason?: number,
) {
  return normalizePlayerAwardRows(getFullRosterPlayerForIdentity(player)?.awards, maxExclusiveSeason);
}

export function getHistoricalAwardsForIdentity(
  player: { srID?: string | null; slug?: string | null; name?: string | null },
  maxExclusiveSeason?: number,
) {
  const slug = String(player.srID ?? player.slug ?? getSlugByPlayerName(String(player.name ?? '')) ?? '').trim();
  return mergeNormalizedPlayerAwards(
    normalizePlayerAwardRows(slug ? getBioBySlug(slug)?.awards : undefined, maxExclusiveSeason),
    getFullRosterAwardsForIdentity(player, maxExclusiveSeason),
  );
}

function fullRosterLoadedPlayerCount(): number {
  if (_fullRosterDiagnostics.players > 0) return _fullRosterDiagnostics.players;
  if (_fullRosterBySlug?.size) return _fullRosterBySlug.size;
  if (_fullRosterByName?.size) return new Set(_fullRosterByName.values()).size;
  return 0;
}

export function getFullRosterPlayerDataCount(): number {
  return fullRosterLoadedPlayerCount();
}

export function getFullRosterPlayerDataDiagnostics(): FullRosterLoadDiagnostics {
  return {
    ..._fullRosterDiagnostics,
    players: fullRosterLoadedPlayerCount(),
    attempts: _fullRosterDiagnostics.attempts.map(entry => ({ ...entry })),
  };
}

export function getAllFullRosterPlayers(): Array<Record<string, any>> {
  return Array.from(new Set([
    ...(_fullRosterBySlug?.values() ?? []),
    ...(_fullRosterByName?.values() ?? []),
  ]));
}

function pct(made = 0, attempted = 0): number {
  return attempted > 0 ? (made / attempted) * 100 : 0;
}

function copySourceStatExtras(row: object | null | undefined): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    if (
      key.endsWith('Max')
      || ['ewa', 'ows', 'dws', 'ws', 'vorp', 'dd', 'td', 'qd', 'fiveBy5', 'pm', 'gmsc', 'gmSc'].includes(key)
    ) {
      extras[key] = value;
    }
  }
  return extras;
}

function getHallOfFameInductionYear(awards: Array<{ season: number; type: string }>): number | undefined {
  const years = awards
    .filter(award => /hall\s+of\s+fame/i.test(award.type))
    .map(award => Number(award.season))
    .filter(season => Number.isFinite(season) && season > 0);
  return years.length ? Math.min(...years) : undefined;
}

function toNativeHistoricalStat(row: ZenGMStat): NBAGMStat | null {
  const season = Number(row.season ?? 0);
  if (!Number.isFinite(season) || season <= 0) return null;
  const fg = Number(row.fg ?? 0) || 0;
  const fga = Number(row.fga ?? 0) || 0;
  const tp = Number(row.tp ?? 0) || 0;
  const tpa = Number(row.tpa ?? 0) || 0;
  const ft = Number(row.ft ?? 0) || 0;
  const fta = Number(row.fta ?? 0) || 0;
  const orb = Number(row.orb ?? 0) || 0;
  const drb = Number(row.drb ?? 0) || 0;
  return {
    ...copySourceStatExtras(row),
    season,
    tid: Number.isFinite(Number(row.tid)) ? Number(row.tid) : -1,
    abbrev: row.abbrev,
    playoffs: Boolean(row.playoffs),
    gp: Number(row.gp ?? 0) || 0,
    gs: Number(row.gs ?? 0) || 0,
    min: Number(row.min ?? 0) || 0,
    fg,
    fga,
    fgp: pct(fg, fga),
    tp,
    tpa,
    tpp: pct(tp, tpa),
    ft,
    fta,
    ftp: pct(ft, fta),
    orb,
    drb,
    trb: Number(row.trb ?? (orb + drb)) || 0,
    ast: Number(row.ast ?? 0) || 0,
    stl: Number(row.stl ?? 0) || 0,
    blk: Number(row.blk ?? 0) || 0,
    tov: Number(row.tov ?? 0) || 0,
    pf: Number(row.pf ?? 0) || 0,
    pts: Number(row.pts ?? 0) || 0,
    per: Number(row.per ?? 0) || 0,
    ws: row.ws,
    ows: row.ows,
    dws: row.dws,
    vorp: row.vorp,
    jerseyNumber: row.jerseyNumber,
  } as NBAGMStat;
}

export function getFullRosterStatsForIdentity(player: { srID?: string | null; slug?: string | null; name?: string | null }): NBAGMStat[] {
  const source = getFullRosterPlayerForIdentity(player);
  return (source?.stats ?? [])
    .map(row => toNativeHistoricalStat(row))
    .filter((stat): stat is NBAGMStat => Boolean(stat));
}

function statTeamKey(stat: NBAGMStat): string {
  const raw = stat as any;
  return String(raw.abbrev ?? raw.teamAbbrev ?? raw.tm ?? raw.TM ?? stat.tid ?? '').trim().toUpperCase();
}

function statMatch(left: NBAGMStat, right: NBAGMStat): boolean {
  if (Number(left.season) !== Number(right.season)) return false;
  if (Boolean(left.playoffs) !== Boolean(right.playoffs)) return false;
  const leftTeam = statTeamKey(left);
  const rightTeam = statTeamKey(right);
  if (leftTeam && rightTeam && leftTeam === rightTeam) return true;
  return Number(left.gp ?? 0) === Number(right.gp ?? 0) &&
    Number(left.pts ?? 0) === Number(right.pts ?? 0) &&
    Number(left.min ?? 0) === Number(right.min ?? 0);
}

function mergeStatExtras(base: NBAGMStat, source: NBAGMStat): NBAGMStat {
  const extras = copySourceStatExtras(source as any);
  if (Object.keys(extras).length === 0) return base;
  const next = { ...base } as any;
  for (const [key, value] of Object.entries(extras)) {
    if (next[key] === undefined || next[key] === null || (Array.isArray(next[key]) && next[key].length === 0)) {
      next[key] = value;
    }
  }
  return next as NBAGMStat;
}

export function mergeHistoricalSourceStats(
  baseStats: NBAGMStat[] | undefined,
  sourceStats: NBAGMStat[] | undefined,
  maxSeason = Infinity,
): NBAGMStat[] {
  const base = [...(baseStats ?? [])];
  const source = (sourceStats ?? []).filter(stat => Number(stat.season ?? 0) <= maxSeason);
  const merged = base.map(stat => {
    const match = source.find(candidate => statMatch(stat, candidate));
    return match ? mergeStatExtras(stat, match) : stat;
  });
  for (const sourceStat of source) {
    if (!merged.some(stat => statMatch(stat, sourceStat))) merged.push(sourceStat);
  }
  return merged;
}

export function ensureNativeHistoricalStatsLoaded(): Promise<void> {
  if (_statsBySlug) return Promise.resolve();
  if (_statsPromise) return _statsPromise;
  _statsPromise = fetchFirstJson<{ stats?: ZenGMStat[] }>(ZENGM_STATS_URLS)
    .then((data) => {
      _nativeSeasonPlayersCache.clear();
      _nativeThroughSeasonPlayersCache.clear();
      _statsBySlug = new Map();
      for (const row of data?.stats ?? []) {
        const slug = String(row.slug ?? '').trim();
        if (!slug) continue;
        const list = _statsBySlug.get(slug) ?? [];
        list.push(row);
        _statsBySlug.set(slug, list);
      }
    })
    .catch(() => {
      _nativeSeasonPlayersCache.clear();
      _nativeThroughSeasonPlayersCache.clear();
      _statsBySlug = new Map();
    })
    .finally(() => { _statsPromise = null; });
  return _statsPromise;
}

export function getNativeHistoricalStatsBySlug(slug: string): NBAGMStat[] {
  const compactStats = (_statsBySlug?.get(slug) ?? [])
    .map(toNativeHistoricalStat)
    .filter((stat): stat is NBAGMStat => Boolean(stat));
  return mergeHistoricalSourceStats(compactStats, getFullRosterStatsForIdentity({ srID: slug, slug }));
}

export function getNativeHistoricalStatsForIdentity(player: { srID?: string | null; slug?: string | null; name?: string | null }): NBAGMStat[] {
  const slug = String(player.srID ?? player.slug ?? getSlugByPlayerName(String(player.name ?? '')) ?? '').trim();
  return slug ? getNativeHistoricalStatsBySlug(slug) : getFullRosterStatsForIdentity(player);
}

function getNativeHistoricalSalaryRows(slug: string, maxSeason: number): Array<{ season: number; amount: number }> {
  const bySeason = new Map<number, { season: number; amount: number }>();
  for (const salary of _salariesBySlug?.get(slug) ?? []) {
    const start = Number(salary.start ?? 0);
    if (!Number.isFinite(start) || start <= 0) continue;
    (salary.amounts ?? []).forEach((rawAmount, index) => {
      const season = start + index;
      const amount = Number(rawAmount);
      if (season > maxSeason || !Number.isFinite(amount) || amount <= 0) return;
      const row = { season, amount: Math.round(amount / 1_000) };
      const existing = bySeason.get(season);
      if (!existing || row.amount > existing.amount) bySeason.set(season, row);
    });
  }
  return [...bySeason.values()].sort((left, right) => left.season - right.season);
}

export function getNativeHistoricalSalaryRowsForIdentity(
  player: { srID?: string | null; slug?: string | null; name?: string | null },
  maxSeason: number,
): Array<{ season: number; amount: number }> {
  const bio = getBioForPlayerIdentity(player);
  return bio ? getNativeHistoricalSalaryRows(bio.slug, maxSeason) : [];
}

type NativeHistoricalPlayerOptions = {
  hof?: boolean;
  hofInductionYear?: number;
  branchCutoffYear?: number;
};

function buildNativeHistoricalPlayerFromSources(
  identity: (ZenGMBio & { slug: string }) | null,
  source: FullRosterPlayer | null,
  fallbackName: string,
  options: NativeHistoricalPlayerOptions,
): NBAPlayer | null {
  if (!identity && !source) return null;
  const slug = String(identity?.slug ?? source?.srID ?? source?.slug ?? '').trim();
  const resolvedName = identity?.name ?? source?.name ?? fallbackName;
  const stats = slug
    ? getNativeHistoricalStatsBySlug(slug)
    : getFullRosterStatsForIdentity({ name: resolvedName });
  const regularSeasons = stats
    .filter(stat => !stat.playoffs && (stat.gp ?? 0) > 0)
    .map(stat => stat.season)
    .filter(Number.isFinite);
  const lastSeason = regularSeasons.length ? Math.max(...regularSeasons) : undefined;
  const salaryCutoff = options.branchCutoffYear
    ? options.branchCutoffYear - 1
    : Number.MAX_SAFE_INTEGER;
  const salaries = slug ? getNativeHistoricalSalaryRows(slug, salaryCutoff) : [];
  const awards = mergeNormalizedPlayerAwards(
    normalizePlayerAwardRows(identity?.awards),
    normalizePlayerAwardRows(source?.awards),
  );
  if (options.hof && options.hofInductionYear && !awards.some(award => award.type === 'Inducted into the Hall of Fame')) {
    awards.push({ season: options.hofInductionYear, type: 'Inducted into the Hall of Fame' });
  }
  const hofInductionYear = options.hofInductionYear ?? getHallOfFameInductionYear(awards);
  const isHallOfFame = options.hof ?? Boolean(source?.hof || hofInductionYear != null);
  const bornYear = Number(identity?.bornYear ?? source?.bornYear ?? source?.born?.year ?? 0);
  const draftYear = Number(identity?.draftYear ?? source?.draftYear ?? source?.draft?.year ?? 0);
  const ratingCutoff = options.branchCutoffYear
    ? options.branchCutoffYear - 1
    : Number.MAX_SAFE_INTEGER;
  const ratings = getNativeHistoricalRatingsForIdentity({ srID: slug, slug, name: resolvedName }, ratingCutoff);
  const latestRating = ratings[ratings.length - 1];
  return {
    internalId: `native-hist-${slug || normalizePlayerName(resolvedName).replace(/\s+/g, '-')}`,
    personId: slug ? `person:bref:${slug}` : undefined,
    sourceIds: slug ? { bref: slug } : undefined,
    name: resolvedName,
    tid: isHallOfFame || source?.tid === -3 ? -3 : -1,
    pos: identity?.pos ?? source?.pos ?? 'G',
    hgt: identity?.height ?? source?.hgt ?? source?.height,
    weight: identity?.weight ?? source?.weight,
    college: identity?.college ?? source?.college,
    born: { year: Number.isFinite(bornYear) && bornYear > 0 ? bornYear : 0, loc: identity?.country ?? source?.born?.loc ?? source?.country ?? '' },
    draft: {
      year: Number.isFinite(draftYear) && draftYear > 0 ? draftYear : 0,
      tid: source?.draft?.tid != null && Number.isFinite(Number(source.draft.tid)) ? Number(source.draft.tid) : -1,
      originalTid: source?.draft?.originalTid != null && Number.isFinite(Number(source.draft.originalTid))
        ? Number(source.draft.originalTid)
        : source?.draft?.tid != null && Number.isFinite(Number(source.draft.tid))
          ? Number(source.draft.tid)
          : -1,
      round: identity?.draftRound ?? source?.draftRound ?? source?.draft?.round,
      pick: identity?.draftPick ?? source?.draftPick ?? source?.draft?.pick,
    },
    draftAbbrev: identity?.draftAbbrev ?? source?.draftAbbrev ?? source?.draft?.abbrev,
    awards,
    ratings,
    stats,
    ...(salaries.length > 0 ? { salaries } : {}),
    hof: isHallOfFame,
    hofInductionYear,
    retiredYear: source?.retiredYear ?? lastSeason,
    ...(options.branchCutoffYear
      ? historicalDeathBeforeBranch({
          diedYear: identity?.diedYear ?? source?.diedYear,
          diedDate: identity?.diedDate ?? source?.diedDate,
        }, options.branchCutoffYear)
      : {}),
    status: 'Retired',
    overallRating: Number(latestRating?.ovr ?? 0),
    injury: { type: 'Healthy', gamesRemaining: 0 },
    imgURL: source?.imgURL ?? getPhotoByPlayerIdentity({ srID: slug, slug, name: resolvedName }) ?? undefined,
    srID: slug || undefined,
    slug: slug || undefined,
  };
}

export function buildNativeHistoricalPlayerByName(
  name: string,
  options: NativeHistoricalPlayerOptions = {},
): NBAPlayer | null {
  const identity = getBioByName(name);
  const source = getFullRosterPlayerForIdentity({
    srID: identity?.slug,
    slug: identity?.slug,
    name: identity?.name ?? name,
  });
  return buildNativeHistoricalPlayerFromSources(identity, source, name, options);
}

export function buildNativeHistoricalPlayerForIdentity(
  player: Pick<NBAPlayer, 'srID' | 'slug' | 'name'>,
  options: NativeHistoricalPlayerOptions = {},
): NBAPlayer | null {
  const identity = getBioForPlayerIdentity(player);
  const source = getFullRosterPlayerForIdentity(player);
  return buildNativeHistoricalPlayerFromSources(identity, source, player.name, options);
}

export function buildNativeHistoricalPlayersForSeason(season: number): NBAPlayer[] {
  if (!_statsBySlug || !_biosMap) return [];
  const targetSeason = Number(season);
  if (!Number.isFinite(targetSeason) || targetSeason <= 0) return [];
  const cached = _nativeSeasonPlayersCache.get(targetSeason);
  if (cached) return cached;
  const players: NBAPlayer[] = [];
  const seen = new Set<string>();
  const pushPlayer = (slug: string, source?: FullRosterPlayer | null) => {
    const bio = getBioBySlug(slug);
    if (!bio?.name && !source?.name) return;
    const stats = getNativeHistoricalStatsBySlug(slug);
    const regularSeasons = stats
      .filter(stat => !stat.playoffs && (stat.gp ?? 0) > 0)
      .map(stat => stat.season)
      .filter(Number.isFinite);
    const lastSeason = regularSeasons.length ? Math.max(...regularSeasons) : undefined;
    const name = bio?.name ?? source?.name ?? slug;
    const bornYear = Number(bio?.bornYear ?? source?.bornYear ?? source?.born?.year ?? 0);
    const draftYear = Number(bio?.draftYear ?? source?.draftYear ?? source?.draft?.year ?? 0);
    const awards = mergeNormalizedPlayerAwards(
      normalizePlayerAwardRows(bio?.awards),
      normalizePlayerAwardRows(source?.awards),
    );
    const hofInductionYear = getHallOfFameInductionYear(awards);
    const isHallOfFame = Boolean(source?.hof || hofInductionYear);
    const ratings = getNativeHistoricalRatingsForIdentity({ srID: slug, slug, name }, targetSeason);
    const latestRating = ratings[ratings.length - 1];

    players.push({
      internalId: `native-season-${targetSeason}-${slug}`,
      personId: `person:bref:${slug}`,
      sourceIds: { bref: slug },
      name,
      tid: isHallOfFame || source?.tid === -3 ? -3 : -1,
      pos: bio?.pos ?? source?.pos ?? 'G',
      hgt: bio?.height ?? source?.hgt ?? source?.height,
      weight: bio?.weight ?? source?.weight,
      born: { year: Number.isFinite(bornYear) && bornYear > 0 ? bornYear : 0, loc: bio?.country ?? source?.born?.loc ?? source?.country ?? '' },
      draft: {
        year: Number.isFinite(draftYear) && draftYear > 0 ? draftYear : 0,
        tid: -1,
        round: bio?.draftRound ?? source?.draftRound ?? source?.draft?.round,
        pick: bio?.draftPick ?? source?.draftPick ?? source?.draft?.pick,
      },
      awards,
      ratings,
      stats,
      hof: isHallOfFame,
      hofInductionYear,
      retiredYear: source?.retiredYear ?? lastSeason,
      ...historicalDeathBeforeBranch({
        diedYear: bio?.diedYear ?? source?.diedYear,
        diedDate: bio?.diedDate ?? source?.diedDate,
      }, targetSeason + 1),
      status: 'Retired',
      overallRating: Number(latestRating?.ovr ?? 0),
      injury: { type: 'Healthy', gamesRemaining: 0 },
      imgURL: source?.imgURL ?? getPhotoByPlayerIdentity({ srID: slug, slug, name }) ?? undefined,
      srID: slug,
      slug,
    } as NBAPlayer);
  };
  for (const [slug, rows] of _statsBySlug.entries()) {
    if (!rows.some(row => Number(row.season) === targetSeason && !row.playoffs && Number(row.gp ?? 0) > 0)) continue;
    const source = getFullRosterPlayerBySlug(slug);
    pushPlayer(slug, source);
    seen.add(slug.toLowerCase());
  }
  for (const source of _fullRosterBySlug?.values() ?? []) {
    const slug = fullRosterSlug(source);
    if (!slug || seen.has(slug.toLowerCase())) continue;
    const hasSeason = (source.stats ?? []).some((row: any) =>
      Number(row?.season) === targetSeason && !row?.playoffs && Number(row?.gp ?? 0) > 0,
    );
    if (!hasSeason) continue;
    pushPlayer(slug, source);
    seen.add(slug.toLowerCase());
  }
  _nativeSeasonPlayersCache.set(targetSeason, players);
  return players;
}

export function buildNativeHistoricalPlayersThroughSeason(maxSeason: number): NBAPlayer[] {
  if (!_statsBySlug || !_biosMap) return [];
  const cutoff = Number(maxSeason);
  if (!Number.isFinite(cutoff) || cutoff <= 0) return [];
  const cached = _nativeThroughSeasonPlayersCache.get(cutoff);
  if (cached) return cached;
  const players: NBAPlayer[] = [];
  const seen = new Set<string>();
  for (const [slug, rows] of _statsBySlug.entries()) {
    if (!rows.some(row => Number(row.season) <= cutoff && !row.playoffs && Number(row.gp ?? 0) > 0)) continue;
    const bio = getBioBySlug(slug);
    const source = getFullRosterPlayerBySlug(slug);
    const name = bio?.name ?? source?.name;
    if (!name) continue;
    const player = buildNativeHistoricalPlayerByName(name, { branchCutoffYear: cutoff + 1 });
    if (!player) continue;
    const key = String(player.slug ?? slug).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    players.push(player);
  }
  for (const source of _fullRosterBySlug?.values() ?? []) {
    const slug = fullRosterSlug(source);
    if (!slug || seen.has(slug.toLowerCase())) continue;
    const hasVisibleSeason = (source.stats ?? []).some((row: any) =>
      Number(row?.season) <= cutoff && !row?.playoffs && Number(row?.gp ?? 0) > 0,
    );
    if (!hasVisibleSeason || !source.name) continue;
    const player = buildNativeHistoricalPlayerByName(source.name, { branchCutoffYear: cutoff + 1 });
    if (!player) continue;
    seen.add(slug.toLowerCase());
    players.push(player);
  }
  _nativeThroughSeasonPlayersCache.set(cutoff, players);
  return players;
}

export function getNativeHistoricalStatSeasons(maxSeason: number): number[] {
  const cutoff = Number(maxSeason);
  if (!Number.isFinite(cutoff) || cutoff <= 0) return [];
  const seasons = new Set<number>();
  const addRows = (rows: readonly any[]) => {
    for (const row of rows) {
      const season = Number(row?.season ?? 0);
      if (season > 0 && season <= cutoff && row?.playoffs !== true && Number(row?.gp ?? 0) > 0) seasons.add(season);
    }
  };
  for (const rows of _statsBySlug?.values() ?? []) addRows(rows);
  for (const source of _fullRosterBySlug?.values() ?? []) addRows(source.stats ?? []);
  return [...seasons].sort((left, right) => right - left);
}

export async function fetchNativeHistoricalPlayerByName(
  name: string,
  options: { hof?: boolean; hofInductionYear?: number; branchCutoffYear?: number } = {},
): Promise<NBAPlayer | null> {
  await Promise.all([ensurePortraitLookupsLoaded(), ensureNativeHistoricalStatsLoaded(), ensureFullRosterPlayerDataLoaded()]);
  return buildNativeHistoricalPlayerByName(name, options);
}

function ensureMissingPortraitsLoaded(): Promise<void> {
  if (_missingPortraitsMap) return Promise.resolve();
  if (_missingPortraitsPromise) return _missingPortraitsPromise;
  _missingPortraitsPromise = fetchMissingPortraits()
    .then(portraits => {
      _missingPortraitsMap = new Map();
      for (const portrait of portraits) {
        if (!portrait?.name || !portrait?.portrait) continue;
        _missingPortraitsMap.set(portrait.name.toLowerCase().trim(), portrait.portrait);
        _missingPortraitsMap.set(normalizePlayerName(portrait.name), portrait.portrait);
      }
    })
    .catch(() => {
      _missingPortraitsMap = new Map();
    })
    .finally(() => {
      _missingPortraitsPromise = null;
    });
  return _missingPortraitsPromise;
}

function ensureNcaaPortraitsLoaded(): Promise<void> {
  if (_ncaaPortraitsMap) return Promise.resolve();
  if (_ncaaPortraitsPromise) return _ncaaPortraitsPromise;
  _ncaaPortraitsPromise = fetchFirstJson<{ portraits?: Array<{ n?: string; u?: string }> }>([NCAA_PORTRAITS_URL])
    .then(data => {
      _ncaaPortraitsMap = new Map();
      for (const portrait of data?.portraits ?? []) {
        if (!portrait?.n || !portrait?.u) continue;
        _ncaaPortraitsMap.set(portrait.n.toLowerCase().trim(), portrait.u);
        _ncaaPortraitsMap.set(normalizePlayerName(portrait.n), portrait.u);
      }
    })
    .catch(() => {
      _ncaaPortraitsMap = new Map();
    })
    .finally(() => {
      _ncaaPortraitsPromise = null;
    });
  return _ncaaPortraitsPromise;
}

function ensureEuroleaguePortraitsLoaded(): Promise<void> {
  if (_euroleaguePortraitsMap) return Promise.resolve();
  if (_euroleaguePortraitsPromise) return _euroleaguePortraitsPromise;
  _euroleaguePortraitsPromise = fetchFirstJson<{ portraits?: Array<{ n?: string; u?: string }> }>([EUROLEAGUE_PORTRAITS_URL])
    .then(data => {
      _euroleaguePortraitsMap = new Map();
      for (const portrait of data?.portraits ?? []) {
        if (!portrait?.n || !portrait?.u) continue;
        _euroleaguePortraitsMap.set(portrait.n.toLowerCase().trim(), portrait.u);
        _euroleaguePortraitsMap.set(normalizePlayerName(portrait.n), portrait.u);
      }
    })
    .catch(() => {
      _euroleaguePortraitsMap = new Map();
    })
    .finally(() => {
      _euroleaguePortraitsPromise = null;
    });
  return _euroleaguePortraitsPromise;
}

export function ensurePortraitLookupsLoaded(): Promise<void> {
  return Promise.all([
    ensurePhotosLoaded(),
    ensureBiosLoaded(),
    ensureMissingPortraitsLoaded(),
    ensureEuroleaguePortraitsLoaded(),
    ensureNcaaPortraitsLoaded(),
  ]).then(() => undefined);
}

export function getPortraitLookupCount(): number {
  return (_photosMap?.size ?? 0)
    + (_missingPortraitsMap?.size ?? 0)
    + (_euroleaguePortraitsMap?.size ?? 0)
    + (_ncaaPortraitsMap?.size ?? 0);
}

export function retryPortraitLookupsLoaded(): Promise<void> {
  _photosMap = null;
  _photoSlugsByUrl = null;
  _photosPromise = null;
  _missingPortraitsMap = null;
  _missingPortraitsPromise = null;
  _ncaaPortraitsMap = null;
  _ncaaPortraitsPromise = null;
  _euroleaguePortraitsMap = null;
  _euroleaguePortraitsPromise = null;
  return ensurePortraitLookupsLoaded();
}

export function getPhotoByPlayerIdentity(player: { srID?: string | null; slug?: string | null; name?: string | null }): string | null {
  if (!_photosMap && !_missingPortraitsMap && !_euroleaguePortraitsMap && !_ncaaPortraitsMap) return null;
  const candidates = [
    player.srID,
    player.slug,
  ];
  if (player.name && _nameMap) {
    candidates.push(getSlugByPlayerName(player.name));
  }
  for (const slug of candidates) {
    if (!slug) continue;
    const photo = _photosMap?.get(slug);
    if (photo) return photo;
  }
  if (player.name && _missingPortraitsMap) {
    const fromMissing = _missingPortraitsMap.get(player.name.toLowerCase().trim())
      ?? _missingPortraitsMap.get(normalizePlayerName(player.name));
    if (fromMissing) return fromMissing;
  }
  if (player.name && _euroleaguePortraitsMap) {
    const fromEuroleague = _euroleaguePortraitsMap.get(player.name.toLowerCase().trim())
      ?? _euroleaguePortraitsMap.get(normalizePlayerName(player.name));
    if (fromEuroleague) return fromEuroleague;
  }
  if (player.name && _ncaaPortraitsMap) {
    const fromNcaa = _ncaaPortraitsMap.get(player.name.toLowerCase().trim())
      ?? _ncaaPortraitsMap.get(normalizePlayerName(player.name));
    if (fromNcaa) return fromNcaa;
  }
  return null;
}

export function isPhotoIdentityConflict(
  player: { srID?: string | null; slug?: string | null },
  photoUrl: string,
): boolean {
  const explicitSlugs = new Set(
    [player.srID, player.slug]
      .map(slug => String(slug ?? '').trim())
      .filter(Boolean),
  );
  if (explicitSlugs.size === 0) return false;
  const canonicalSlug = [...explicitSlugs].find(slug => _photosMap?.has(slug));
  const owners = _photoSlugsByUrl?.get(portraitIdentityKey(photoUrl));
  if (!canonicalSlug || !owners?.size) return false;
  return [...explicitSlugs].every(slug => !owners.has(slug));
}

/**
 * Name-based photo lookup — only works once ZenGM bio data is loaded
 * (builds an internal name→srID map on load).
 * Used in TeamHistoryView for historical players that have no srID.
 */
export function getPhotoByName(name: string): string | null {
  return getPhotoByPlayerIdentity({ name });
}

// ─────────────────────────────────────────────────────────────────────────────
// Height formatting helper  (exported so views can share it)
// ─────────────────────────────────────────────────────────────────────────────

/** Format height in inches to feet'inches" string. */
export function fmtHeight(inches: number): string {
  const ft   = Math.floor(inches / 12);
  const inch = inches % 12;
  return `${ft}'${inch}"`;
}
