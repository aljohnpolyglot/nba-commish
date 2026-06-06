/**
 * Newgen procedural portrait resolver.
 *
 * 14,000 256×256 PNG portraits hosted at
 *   https://github.com/aljohnpolyglot/nba-commish-portraits
 * served via jsDelivr.
 *
 * Use this to assign `player.imgURL` at spawn time. UI components already
 * render imgURL — no UI changes needed.
 */
import { NEWGEN_PORTRAIT_BASE, NEWGEN_MALE_IDS, NEWGEN_FEMALE_IDS } from '../data/newgenPortraits';
import {
  REGEN_ASIAN_PATHS,
  REGEN_BLACK_PATHS,
  REGEN_BROWN_PATHS,
  REGEN_ASIAN_BASE,
  REGEN_EURO_PATHS,
  REGEN_FILIPINO_PATHS,
  REGEN_FILIPINO_BASE,
  REGEN_PORTRAIT_BASE,
} from '../data/regenPortraitPackManifest';

export type NewgenGender = 'male' | 'female';
export type RegenRace = 'black' | 'asian' | 'brown' | 'white';

const LOCAL_REGEN_PORTRAIT_BASE = '/@fs/C:/Users/user-MSI/Downloads/nba-store-data/playerfaces_regen_replacements';

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic portrait URL for a given seed + gender. Never returns null — always picks a face. */
export function getNewgenPortraitUrl(seed: string, gender: NewgenGender = 'male'): string {
  const pool = gender === 'female' ? NEWGEN_FEMALE_IDS : NEWGEN_MALE_IDS;
  const idx = hashString(seed) % pool.length;
  return `${NEWGEN_PORTRAIT_BASE}/portrait_${gender}-${pool[idx]}.png`;
}

/** Deterministic gate — returns true for ~ratio fraction of seeds. */
export function newgenRoll(seed: string, ratio: number): boolean {
  if (ratio >= 1) return true;
  if (ratio <= 0) return false;
  return (hashString(seed + '_gate') / 0xffffffff) < ratio;
}

function pickFromPool(seed: string, pool: readonly string[]): string | null {
  if (pool.length === 0) return null;
  const idx = hashString(seed) % pool.length;
  return pool[idx] ?? null;
}

function normalizeCountry(raw?: string): string {
  return (raw ?? '').trim().toLowerCase();
}

function isFilipinoCountry(country: string): boolean {
  return country.includes('philippines') || country.includes('filipino');
}

function isAsianCountry(country: string): boolean {
  return [
    'china',
    'japan',
    'korea',
    'mongolia',
    'vietnam',
    'malaysia',
    'singapore',
    'indonesia',
    'philippines',
    'india',
    'pakistan',
    'bangladesh',
    'sri lanka',
    'nepal',
    'kazakhstan',
    'uzbek',
    'tajik',
    'kyrgyz',
    'turkmen',
  ].some(token => country.includes(token));
}

function isBrownCountry(country: string): boolean {
  return [
    'brazil',
    'argentina',
    'chile',
    'colombia',
    'venezuela',
    'peru',
    'ecuador',
    'bolivia',
    'paraguay',
    'uruguay',
    'suriname',
    'guyana',
    'mexico',
    'puerto rico',
    'dominican',
    'cuba',
    'jamaica',
    'trinidad',
    'barbados',
    'bahamas',
    'arab',
    'iran',
    'iraq',
    'israel',
    'jordan',
    'lebanon',
    'syria',
    'morocco',
    'algeria',
    'tunisia',
    'libya',
    'egypt',
    'saudi',
    'uae',
    'qatar',
    'oman',
    'bahrain',
    'kuwait',
    'yemen',
    'armenia',
    'azerbaijan',
    'georgia',
  ].some(token => country.includes(token));
}

function racePool(seed: string, race: RegenRace, nationality?: string): readonly string[] {
  const country = normalizeCountry(nationality);
  if (isFilipinoCountry(country)) return REGEN_FILIPINO_PATHS;
  if (isAsianCountry(country)) return REGEN_ASIAN_PATHS;
  if (isBrownCountry(country)) return REGEN_BROWN_PATHS;
  if (race === 'black') return REGEN_BLACK_PATHS;
  if (race === 'asian') return REGEN_ASIAN_PATHS;
  if (race === 'white') return REGEN_EURO_PATHS;
  return newgenRoll(seed + '_brown_black_mix', 0.2) ? REGEN_BLACK_PATHS : REGEN_BROWN_PATHS;
}

function resolveRegenBase(country: string): string {
  if (isFilipinoCountry(country)) return REGEN_FILIPINO_BASE;
  if (isAsianCountry(country)) return REGEN_ASIAN_BASE;
  return REGEN_PORTRAIT_BASE;
}

/** New regen portrait pack (nba-store-data) for generated prospects.
 *  Returns null when no matching race pool exists so callers can fall back. */
export function getRegenPortraitUrl(
  seed: string,
  race: RegenRace,
  options?: { nationality?: string; bornLoc?: string },
): string | null {
  const country = normalizeCountry(options?.nationality ?? options?.bornLoc);
  const relPath = pickFromPool(
    seed + '_regen_pack',
    racePool(seed, race, country),
  );
  if (!relPath) return null;
  const base = resolveRegenBase(country);
  const finalPath = isFilipinoCountry(country) ? relPath.split('/').pop() ?? relPath : relPath;
  return `${base}/${finalPath}`;
}

export function getLocalRegenPortraitFallbackUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const legacyMarker = '/playerfaces_regen_replacements/';
  const legacyIndex = url.indexOf(legacyMarker);
  const asiaMatch = url.match(/raw\.githubusercontent\.com\/aljohnpolyglot\/ng-regens-asia\/(?:refs\/heads\/)?main\/(.+)$/);
  const filipinoMatch = url.match(/raw\.githubusercontent\.com\/aljohnpolyglot\/ng-regens-filipino\/(?:refs\/heads\/)?main\/(.+)$/);
  const repoMatch = url.match(/raw\.githubusercontent\.com\/aljohnpolyglot\/nba-store-data\/(?:refs\/heads\/)?main\/playerfaces_regen_replacements\/(.+)$/);
  const rawPath = legacyIndex >= 0
    ? url.slice(legacyIndex + legacyMarker.length)
    : asiaMatch?.[1]
      ? asiaMatch[1]
    : filipinoMatch?.[1]
      ? `Filipino/${filipinoMatch[1]}`
      : repoMatch?.[1];
  if (!rawPath) return null;
  const relPath = rawPath.split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');
  return `${LOCAL_REGEN_PORTRAIT_BASE}/${relPath}`;
}
