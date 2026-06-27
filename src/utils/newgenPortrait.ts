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
  REGEN_BROWN_BASE,
  REGEN_EURO_PATHS,
  REGEN_FILIPINO_PATHS,
  REGEN_FILIPINO_BASE,
  REGEN_PORTRAIT_BASE,
} from '../data/regenPortraitPackManifest';

export type NewgenGender = 'male' | 'female';
export type RegenRace = 'black' | 'asian' | 'brown' | 'white';

const LOCAL_REGEN_PORTRAIT_BASE = '/@fs/C:/Users/user-MSI/Downloads/nba-store-data/playerfaces_regen_replacements';
const REGEN_ALL_PATHS: string[] = [
  ...REGEN_BLACK_PATHS,
  ...REGEN_ASIAN_PATHS,
  ...REGEN_BROWN_PATHS,
  ...REGEN_EURO_PATHS,
  ...REGEN_FILIPINO_PATHS,
] ;
const REGEN_PATHS_BY_FOLDER = new Map<string, string[]>();

for (const relPath of REGEN_ALL_PATHS) {
  const folder = relPath.split('/')[0];
  if (!folder) continue;
  const bucket = REGEN_PATHS_BY_FOLDER.get(folder);
  if (bucket) {
    bucket.push(relPath);
  } else {
    REGEN_PATHS_BY_FOLDER.set(folder, [relPath]);
  }
}

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

function isBrownRepoCountry(country: string): boolean {
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
    'spain',
    'portugal',
  ].some(token => country.includes(token));
}

function folderPool(...folders: string[]): readonly string[] {
  const paths: string[] = [];
  for (const folder of folders) {
    const bucket = REGEN_PATHS_BY_FOLDER.get(folder);
    if (bucket) {
      paths.push(...bucket);
    }
  }
  return paths;
}

function exactCountryPool(country: string): readonly string[] | null {
  if (!country) return null;
  if (isFilipinoCountry(country)) return folderPool('Filipino');
  if (country.includes('japan')) return folderPool('Japan');
  if (country.includes('china') || country.includes('taiwan')) return folderPool('China');
  if (country.includes('korea')) return folderPool('Korea');
  if (country.includes('vietnam')) return folderPool('Vietnam');
  if (country.includes('malaysia')) return folderPool('Malaysia');
  if (country.includes('singapore')) return folderPool('Singapore');
  if (country.includes('indonesia')) return folderPool('Indonesia');
  if (country.includes('mongolia')) return folderPool('Mongolia');
  if (country.includes('uzbek')) return folderPool('Uzbekistan');
  if (country.includes('tajik')) return folderPool('Tajikistan');
  if (country.includes('kazakhstan') || country.includes('kyrgyz') || country.includes('turkmen')) return folderPool('CentralAsian');
  if (country.includes('india') || country.includes('pakistan') || country.includes('bangladesh') || country.includes('sri lanka') || country.includes('nepal')) return folderPool('SouthAsia');
  if (country.includes('spain')) return folderPool('Spain');
  if (country.includes('portugal')) return folderPool('Portugal');
  if (country.includes('france')) return folderPool('France');
  if (country.includes('italy')) return folderPool('Italia');
  if (country.includes('ireland')) return folderPool('Ireland');
  if (country.includes('netherlands') || country.includes('dutch')) return folderPool('Netherlands');
  if (country.includes('poland')) return folderPool('Poland');
  if (country.includes('romania')) return folderPool('Romania');
  if (country.includes('hungary')) return folderPool('Hungary');
  if (country.includes('iceland')) return folderPool('Iceland');
  if (country.includes('finland') || country.includes('estonia')) return folderPool('Finstonia');
  if (country.includes('latvia') || country.includes('lithuania')) return folderPool('Baltics');
  if (country.includes('sweden') || country.includes('norway') || country.includes('denmark')) return folderPool('Scandinavian');
  if (country.includes('england') || country.includes('scotland') || country.includes('wales') || country.includes('united kingdom')) return folderPool('Anglosphere');
  if (country === 'usa' || country.includes('united states') || country.includes('canada') || country.includes('australia') || country.includes('new zealand')) return folderPool('Anglosphere');
  if (country.includes('germany') || country.includes('austria') || country.includes('switzerland') || country.includes('belgium') || country.includes('czech') || country.includes('slovak')) return folderPool('CentralEurope');
  if (country.includes('serbia') || country.includes('croatia') || country.includes('bosnia') || country.includes('slovenia') || country.includes('montenegro')) return folderPool('WestBalkan');
  if (country.includes('greece') || country.includes('albania')) return folderPool('AlbanianGreek');
  if (country.includes('bulgaria') || country.includes('north macedonia')) return folderPool('EastBalkan');
  if (country.includes('russia') || country.includes('ukraine') || country.includes('belarus')) return folderPool('EastSlavic');
  if (country.includes('turkey')) return folderPool('Turkish');
  if (country.includes('brazil')) return folderPool('BrazilMixed');
  if (country.includes('argentina') || country.includes('chile') || country.includes('uruguay') || country.includes('paraguay')) return folderPool('SouthConeSA');
  if (country.includes('peru') || country.includes('bolivia') || country.includes('ecuador')) return folderPool('IndigenousSA');
  if (country.includes('colombia') || country.includes('venezuela')) return folderPool('NorthernSA');
  if (country.includes('mexico') || country.includes('dominican') || country.includes('puerto rico') || country.includes('cuba') || country.includes('jamaica') || country.includes('trinidad') || country.includes('bahamas') || country.includes('barbados')) return folderPool('Mestizo');
  if (country.includes('morocco') || country.includes('algeria') || country.includes('tunisia') || country.includes('libya')) return folderPool('Maghreb');
  if (country.includes('saudi') || country.includes('uae') || country.includes('qatar') || country.includes('oman') || country.includes('bahrain') || country.includes('kuwait') || country.includes('yemen')) return folderPool('ArabGulf');
  if (country.includes('lebanon') || country.includes('syria') || country.includes('jordan') || country.includes('iraq') || country.includes('palest')) return folderPool('Mashriq');
  if (country.includes('iran')) return folderPool('Iran');
  if (country.includes('israel')) return folderPool('Israel');
  if (country.includes('armenia')) return folderPool('Armenian');
  if (country.includes('azerbaijan')) return folderPool('Azerbaijan');
  if (country.includes('georgia')) return folderPool('Caucasus');
  if (country.includes('nigeria') || country.includes('ghana') || country.includes('senegal') || country.includes('ivory coast') || country.includes('cote d')) return folderPool('WestAfrica');
  if (country.includes('ethiopia') || country.includes('kenya') || country.includes('uganda') || country.includes('tanzania')) return folderPool('EastAfrica');
  if (country.includes('somalia') || country.includes('eritrea') || country.includes('djibouti')) return folderPool('HornOfAfrica');
  if (country.includes('cameroon') || country.includes('congo') || country.includes('gabon') || country.includes('angola')) return folderPool('CentralAfrica');
  if (country.includes('south africa') || country.includes('zimbabwe') || country.includes('zambia') || country.includes('botswana') || country.includes('namibia')) return folderPool('SouthernAfrica');
  return null;
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
  const exactPool = exactCountryPool(country);
  if (exactPool && exactPool.length > 0) return exactPool;
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
  if (isBrownRepoCountry(country)) return REGEN_BROWN_BASE;
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
  const brownMatch = url.match(/raw\.githubusercontent\.com\/aljohnpolyglot\/ng-regens-brown\/(?:refs\/heads\/)?main\/(.+)$/);
  const filipinoMatch = url.match(/raw\.githubusercontent\.com\/aljohnpolyglot\/ng-regens-filipino\/(?:refs\/heads\/)?main\/(.+)$/);
  const repoMatch = url.match(/raw\.githubusercontent\.com\/aljohnpolyglot\/nba-store-data\/(?:refs\/heads\/)?main\/playerfaces_regen_replacements\/(.+)$/);
  const rawPath = legacyIndex >= 0
    ? url.slice(legacyIndex + legacyMarker.length)
    : asiaMatch?.[1]
      ? asiaMatch[1]
    : brownMatch?.[1]
      ? brownMatch[1]
    : filipinoMatch?.[1]
      ? `Filipino/${filipinoMatch[1]}`
      : repoMatch?.[1];
  if (!rawPath) return null;
  const relPath = rawPath.split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');
  return `${LOCAL_REGEN_PORTRAIT_BASE}/${relPath}`;
}
