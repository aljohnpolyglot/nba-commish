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

const PHOTOS_URL =
  'https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/player-photos.json';
const ZENGM_URL =
  'https://raw.githubusercontent.com/zengm-games/zengm/master/data/real-player-data.basketball.json';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ZenGMBio {
  name?: string;
  bornYear?: number;
  diedYear?: number;
  country?: string;   // birth country / nationality
  height?: number;    // inches (BBGM convention)
  weight?: number;    // lbs
  pos?: string;
  college?: string;
  draftYear?: number;
  draftRound?: number;
  draftPick?: number;
  draftAbbrev?: string; // drafting team abbrev
}

// ─────────────────────────────────────────────────────────────────────────────
// Photos (player-photos.json)  — srID → photo URL
// ─────────────────────────────────────────────────────────────────────────────

let _photosMap: Map<string, string> | null = null;
let _photosPromise: Promise<void> | null = null;

export function ensurePhotosLoaded(): Promise<void> {
  if (_photosMap) return Promise.resolve();
  if (_photosPromise) return _photosPromise;
  _photosPromise = fetch(PHOTOS_URL)
    .then(r => (r.ok ? r.json() : {}))
    .then((data: Record<string, string>) => {
      _photosMap = new Map(Object.entries(data));
    })
    .catch(() => {
      _photosMap = new Map(); // empty on error so we don't retry endlessly
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
let _nameMap: Map<string, string> | null = null; // normalizedName → srID
let _bioPromise: Promise<void> | null = null;
export type BioLoadState = 'idle' | 'loading' | 'done' | 'error';
let _bioLoadState: BioLoadState = 'idle';

export function getBioLoadState(): BioLoadState { return _bioLoadState; }
export function isBiosReady(): boolean { return _biosMap !== null; }

export function ensureBiosLoaded(): Promise<void> {
  if (_biosMap) return Promise.resolve();
  if (_bioPromise) return _bioPromise;
  _bioLoadState = 'loading';
  _bioPromise = fetch(ZENGM_URL)
    .then(r => (r.ok ? r.json() : null))
    .then((data: any) => {
      _biosMap = new Map();
      _nameMap = new Map();
      const bios: Record<string, any> = data?.bios ?? {};
      for (const [srID, bio] of Object.entries(bios)) {
        const entry: ZenGMBio = {
          name:        bio.name,
          bornYear:    bio.bornYear,
          diedYear:    bio.diedYear,
          country:     bio.country,
          height:      bio.height,
          weight:      bio.weight,
          pos:         bio.pos,
          college:     bio.college,
          draftYear:   bio.draftYear,
          draftRound:  bio.draftRound,
          draftPick:   bio.draftPick,
          draftAbbrev: bio.draftAbbrev,
        };
        _biosMap!.set(srID, entry);
        if (bio.name) _nameMap!.set(bio.name.toLowerCase().trim(), srID);
      }
      _bioLoadState = 'done';
    })
    .catch(() => {
      _biosMap  = new Map();
      _nameMap  = new Map();
      _bioLoadState = 'error';
    })
    .finally(() => { _bioPromise = null; });
  return _bioPromise;
}

/** Returns ZenGM bio for a given srID, or null if not found / not loaded. */
export function getBioBySlug(srID: string): ZenGMBio | null {
  return _biosMap?.get(srID) ?? null;
}

/**
 * Name-based photo lookup — only works once ZenGM bio data is loaded
 * (builds an internal name→srID map on load).
 * Used in TeamHistoryView for historical players that have no srID.
 */
export function getPhotoByName(name: string): string | null {
  if (!_nameMap || !_photosMap) return null;
  const srID = _nameMap.get(name.toLowerCase().trim());
  return srID ? (_photosMap.get(srID) ?? null) : null;
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
