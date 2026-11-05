import { NEWGEN_PORTRAIT_BASE, NEWGEN_MALE_IDS, NEWGEN_FEMALE_IDS } from '../data/newgenPortraits';
import {
  REGEN_PORTRAIT_GROUPS,
  type SequentialPortraitPathGroup,
} from '../data/regenPortraitPackManifest';
import {
  REGEN_STAFF_BASE,
  REGEN_STAFF_FOLDERS,
  REGEN_WOMEN_BASE,
  REGEN_WOMEN_FOLDERS,
  type SequentialPortraitFolder,
} from '../data/portraitPackCatalog';
import { normalizeNationality } from './countryFlags';
import { getRaceFrequencies } from '../genplayersconstants';
import {
  claimGenericPortraitUrl,
  claimHairPortraitUrl,
  claimPortraitUrl,
  createPortraitUsageSet,
  hashPortraitSeed,
} from './portraitPoolAllocator';

export { createPortraitUsageSet } from './portraitPoolAllocator';

export type NewgenGender = 'male' | 'female';
export type RegenRace = 'black' | 'asian' | 'brown' | 'white';
export type RegenPortraitKind = 'player' | 'staff';

type RegenPortraitOptions = {
  nationality?: string;
  bornLoc?: string;
  gender?: NewgenGender;
  kind?: RegenPortraitKind;
  usedPortraitUrls?: Set<string>;
};

const LOCAL_REGEN_PORTRAIT_BASE = '/@fs/C:/Users/user-MSI/Downloads/nba-store-data/playerfaces_regen_replacements';
const REGEN_MAINPACK_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/ng-regens-mainpack/refs/heads/main';
const REGEN_BLACK_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/ng-regens-black/refs/heads/main';
const REGEN_AFROAMERICAN_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/ng-regens-afroamerican/refs/heads/main';
const REGEN_ASIAN_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/ng-regens-asia/refs/heads/main';
const REGEN_BROWN_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/ng-regens-brown/refs/heads/main';
const REGEN_FILIPINO_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/ng-regens-filipino/refs/heads/main';
const BLACK_FOLDERS = new Set(['Afroamerican', 'Afrocaribbean', 'CentralAfrica', 'EastAfrica', 'HornOfAfrica', 'SahelianAfrica', 'SouthernAfrica', 'WestAfrica']);
const ASIAN_FOLDERS = new Set(['CentralAsian', 'China', 'Indonesia', 'Japan', 'Korea', 'MainlandSEA', 'Malaysia', 'Mongolia', 'Singapore', 'SouthAsia', 'Tajikistan', 'Uzbekistan', 'Vietnam']);
const BROWN_FOLDERS = new Set(['ArabGulf', 'Armenian', 'Azerbaijan', 'BrazilMixed', 'Caucasus', 'IndigenousSA', 'Iran', 'Israel', 'Maghreb', 'Mashriq', 'Mestizo', 'MixedRace', 'NorthernSA', 'PacificIslanders', 'Portugal', 'SouthConeSA', 'Spain']);

const REGEN_GROUPS_BY_FOLDER = new Map<string, SequentialPortraitPathGroup[]>();

for (const group of REGEN_PORTRAIT_GROUPS) {
  const bucket = REGEN_GROUPS_BY_FOLDER.get(group.folder);
  if (bucket) bucket.push(group);
  else REGEN_GROUPS_BY_FOLDER.set(group.folder, [group]);
}

export function getNewgenPortraitUrl(seed: string, gender: NewgenGender = 'male'): string {
  const pool = gender === 'female' ? NEWGEN_FEMALE_IDS : NEWGEN_MALE_IDS;
  const index = hashPortraitSeed(seed) % pool.length;
  return `${NEWGEN_PORTRAIT_BASE}/portrait_${gender}-${pool[index]}.png`;
}

export function newgenRoll(seed: string, ratio: number): boolean {
  if (ratio >= 1) return true;
  if (ratio <= 0) return false;
  return hashPortraitSeed(`${seed}_gate`) / 0xffffffff < ratio;
}

function normalizedCountry(raw?: string): string {
  const tail = String(raw ?? '').split(',').pop()?.trim() ?? '';
  const normalized = normalizeNationality(tail).toLowerCase();
  return normalized === 'american' ? 'usa' : normalized;
}

export function getNationalityPortraitRace(seed: string, nationality?: string): RegenRace {
  const raw = String(nationality ?? '').split(',').pop()?.trim() ?? '';
  const normalized = normalizeNationality(raw);
  const frequencies = getRaceFrequencies(normalized === 'American' ? 'USA' : normalized);
  const entries = (Object.entries(frequencies) as Array<[RegenRace, number]>)
    .filter(([race, frequency]) => ['black', 'asian', 'brown', 'white'].includes(race) && frequency > 0);
  const total = entries.reduce((sum, [, frequency]) => sum + frequency, 0);
  if (total <= 0) return 'white';
  let roll = (hashPortraitSeed(`${seed}_portrait_race`) / 0xffffffff) * total;
  for (const [race, frequency] of entries) {
    roll -= frequency;
    if (roll <= 0) return race;
  }
  return entries.at(-1)?.[0] ?? 'white';
}

function includesCountry(country: string, ...tokens: string[]): boolean {
  return tokens.some(token => country.includes(token));
}

function isFilipinoCountry(country: string): boolean {
  return includesCountry(country, 'philippines', 'filipino');
}

function isUnitedStatesCountry(country: string): boolean {
  return country === 'usa' || includesCountry(country, 'united states');
}

function isMultiracialAnglosphere(country: string): boolean {
  return isUnitedStatesCountry(country)
    || includesCountry(country, 'canada', 'australia', 'new zealand');
}

function folderPool(...folders: string[]): readonly SequentialPortraitPathGroup[] {
  return folders.flatMap(folder => REGEN_GROUPS_BY_FOLDER.get(folder) ?? []);
}

function exactMaleFolders(country: string): string[] {
  if (!country) return [];
  if (isFilipinoCountry(country)) return ['Filipino'];
  if (includesCountry(country, 'japan')) return ['Japan'];
  if (includesCountry(country, 'china', 'taiwan')) return ['China'];
  if (includesCountry(country, 'korea')) return ['Korea'];
  if (includesCountry(country, 'vietnam')) return ['Vietnam'];
  if (includesCountry(country, 'malaysia')) return ['Malaysia'];
  if (includesCountry(country, 'singapore')) return ['Singapore'];
  if (includesCountry(country, 'indonesia')) return ['Indonesia'];
  if (includesCountry(country, 'mongolia')) return ['Mongolia'];
  if (includesCountry(country, 'uzbek')) return ['Uzbekistan'];
  if (includesCountry(country, 'tajik')) return ['Tajikistan'];
  if (includesCountry(country, 'kazakhstan', 'kyrgyz', 'turkmen')) return ['CentralAsian'];
  if (includesCountry(country, 'india', 'pakistan', 'bangladesh', 'sri lanka', 'nepal')) return ['SouthAsia'];
  if (includesCountry(country, 'spain')) return ['Spain'];
  if (includesCountry(country, 'portugal')) return ['Portugal'];
  if (includesCountry(country, 'france')) return ['France'];
  if (includesCountry(country, 'italy')) return ['Italia'];
  if (includesCountry(country, 'ireland')) return ['Ireland'];
  if (includesCountry(country, 'netherlands', 'dutch')) return ['Netherlands'];
  if (includesCountry(country, 'poland')) return ['Poland'];
  if (includesCountry(country, 'romania')) return ['Romania'];
  if (includesCountry(country, 'hungary')) return ['Hungary'];
  if (includesCountry(country, 'iceland')) return ['Iceland'];
  if (includesCountry(country, 'finland', 'estonia')) return ['Finstonia'];
  if (includesCountry(country, 'latvia', 'lithuania')) return ['Baltics'];
  if (includesCountry(country, 'sweden', 'norway', 'denmark')) return ['Scandinavian'];
  if (includesCountry(country, 'england', 'scotland', 'wales', 'united kingdom')) return ['Anglosphere'];
  if (isMultiracialAnglosphere(country)) return ['Anglosphere'];
  if (includesCountry(country, 'germany', 'austria', 'switzerland', 'belgium', 'czech', 'slovak')) return ['CentralEurope'];
  if (includesCountry(country, 'serbia', 'croatia', 'bosnia', 'slovenia', 'montenegro')) return ['WestBalkan'];
  if (includesCountry(country, 'greece', 'albania')) return ['AlbanianGreek'];
  if (includesCountry(country, 'bulgaria', 'north macedonia')) return ['EastBalkan'];
  if (includesCountry(country, 'russia', 'ukraine', 'belarus')) return ['EastSlavic'];
  if (includesCountry(country, 'turkey')) return ['Turkish'];
  if (includesCountry(country, 'brazil')) return ['BrazilMixed'];
  if (includesCountry(country, 'argentina', 'chile', 'uruguay', 'paraguay')) return ['SouthConeSA'];
  if (includesCountry(country, 'peru', 'bolivia', 'ecuador')) return ['IndigenousSA'];
  if (includesCountry(country, 'colombia', 'venezuela')) return ['NorthernSA'];
  if (includesCountry(country, 'mexico', 'dominican', 'puerto rico', 'cuba', 'jamaica', 'trinidad', 'bahamas', 'barbados')) return ['Mestizo'];
  if (includesCountry(country, 'morocco', 'algeria', 'tunisia', 'libya')) return ['Maghreb'];
  if (includesCountry(country, 'saudi', 'uae', 'qatar', 'oman', 'bahrain', 'kuwait', 'yemen')) return ['ArabGulf'];
  if (includesCountry(country, 'lebanon', 'syria', 'jordan', 'iraq', 'palest')) return ['Mashriq'];
  if (includesCountry(country, 'iran')) return ['Iran'];
  if (includesCountry(country, 'israel')) return ['Israel'];
  if (includesCountry(country, 'armenia')) return ['Armenian'];
  if (includesCountry(country, 'azerbaijan')) return ['Azerbaijan'];
  if (includesCountry(country, 'georgia')) return ['Caucasus'];
  if (includesCountry(country, 'nigeria', 'ghana', 'senegal', 'ivory coast', 'cote d')) return ['WestAfrica'];
  if (includesCountry(country, 'ethiopia', 'kenya', 'uganda', 'tanzania')) return ['EastAfrica'];
  if (includesCountry(country, 'somalia', 'eritrea', 'djibouti')) return ['HornOfAfrica'];
  if (includesCountry(country, 'cameroon', 'congo', 'gabon', 'angola')) return ['CentralAfrica'];
  if (includesCountry(country, 'south africa', 'zimbabwe', 'zambia', 'botswana', 'namibia')) return ['SouthernAfrica'];
  return [];
}

function maleRegionalFolders(country: string, race: RegenRace): string[] {
  if (race === 'black') {
    if (includesCountry(country, 'jamaica', 'haiti', 'dominican', 'puerto rico', 'cuba', 'trinidad', 'bahamas', 'barbados')) return ['Afrocaribbean'];
    if (includesCountry(country, 'nigeria', 'ghana', 'senegal', 'ivory coast', 'cote d', 'mali', 'guinea')) return ['WestAfrica', 'SahelianAfrica'];
    if (includesCountry(country, 'ethiopia', 'kenya', 'uganda', 'tanzania')) return ['EastAfrica', 'HornOfAfrica'];
    if (includesCountry(country, 'somalia', 'eritrea', 'djibouti')) return ['HornOfAfrica', 'EastAfrica'];
    if (includesCountry(country, 'cameroon', 'congo', 'gabon', 'angola')) return ['CentralAfrica'];
    if (includesCountry(country, 'south africa', 'zimbabwe', 'zambia', 'botswana', 'namibia')) return ['SouthernAfrica'];
    if (isUnitedStatesCountry(country) || includesCountry(country, 'canada')) return ['Afroamerican', 'Afrocaribbean'];
    return ['WestAfrica', 'EastAfrica', 'CentralAfrica', 'SouthernAfrica'];
  }
  if (race === 'asian') {
    if (isFilipinoCountry(country)) return ['Filipino', 'MainlandSEA', 'Malaysia', 'Indonesia'];
    if (includesCountry(country, 'vietnam', 'thailand', 'laos', 'cambodia', 'myanmar')) return ['Vietnam', 'MainlandSEA'];
    if (includesCountry(country, 'malaysia', 'singapore', 'indonesia')) return ['Malaysia', 'Singapore', 'Indonesia', 'MainlandSEA'];
    if (includesCountry(country, 'china', 'taiwan', 'japan', 'korea', 'mongolia')) return ['China', 'Japan', 'Korea', 'Mongolia'];
    if (includesCountry(country, 'india', 'pakistan', 'bangladesh', 'sri lanka', 'nepal')) return ['SouthAsia'];
    if (includesCountry(country, 'kazakhstan', 'uzbek', 'tajik', 'kyrgyz', 'turkmen')) return ['CentralAsian', 'Uzbekistan', 'Tajikistan'];
    return ['China', 'Japan', 'Korea', 'MainlandSEA', 'SouthAsia'];
  }
  if (race === 'brown') {
    if (includesCountry(country, 'mexico', 'dominican', 'puerto rico', 'cuba', 'jamaica', 'trinidad', 'bahamas', 'barbados')) return ['Mestizo', 'MixedRace'];
    if (includesCountry(country, 'brazil')) return ['BrazilMixed', 'MixedRace'];
    if (includesCountry(country, 'argentina', 'chile', 'uruguay', 'paraguay')) return ['SouthConeSA', 'MixedRace'];
    if (includesCountry(country, 'peru', 'bolivia', 'ecuador')) return ['IndigenousSA', 'NorthernSA'];
    if (includesCountry(country, 'colombia', 'venezuela')) return ['NorthernSA', 'Mestizo'];
    if (includesCountry(country, 'morocco', 'algeria', 'tunisia', 'libya', 'egypt')) return ['Maghreb', 'Mashriq'];
    if (includesCountry(country, 'saudi', 'uae', 'qatar', 'oman', 'bahrain', 'kuwait', 'yemen')) return ['ArabGulf', 'Mashriq'];
    if (includesCountry(country, 'lebanon', 'syria', 'jordan', 'iraq', 'palest')) return ['Mashriq', 'ArabGulf'];
    if (includesCountry(country, 'iran', 'israel', 'armenia', 'azerbaijan', 'georgia')) return ['Iran', 'Israel', 'Armenian', 'Azerbaijan', 'Caucasus'];
    return ['MixedRace', 'Mestizo', 'BrazilMixed', 'Maghreb'];
  }
  if (includesCountry(country, 'serbia', 'croatia', 'bosnia', 'slovenia', 'montenegro')) return ['WestBalkan', 'EastBalkan'];
  if (includesCountry(country, 'russia', 'ukraine', 'belarus')) return ['EastSlavic', 'WestSlavic'];
  if (includesCountry(country, 'poland', 'czech', 'slovak')) return ['WestSlavic', 'CentralEurope'];
  if (includesCountry(country, 'sweden', 'norway', 'denmark', 'finland', 'iceland')) return ['Scandinavian', 'Finstonia', 'Iceland'];
  if (includesCountry(country, 'spain', 'portugal', 'italy', 'greece', 'albania', 'turkey')) return ['Spain', 'Portugal', 'Italia', 'AlbanianGreek', 'Turkish'];
  if (includesCountry(country, 'latvia', 'lithuania', 'estonia')) return ['Baltics', 'Finstonia'];
  if (isMultiracialAnglosphere(country) || includesCountry(country, 'england', 'scotland', 'wales', 'ireland')) return ['CaucasianNA', 'Anglosphere', 'Ireland'];
  return ['CentralEurope', 'France', 'Netherlands', 'WestSlavic'];
}

function malePortraitTiers(
  country: string,
  race: RegenRace,
): readonly (readonly SequentialPortraitPathGroup[])[] {
  const exact = isMultiracialAnglosphere(country)
    ? race === 'black'
      ? ['Afroamerican']
      : race === 'white'
        ? [isUnitedStatesCountry(country) ? 'CaucasianNA' : 'Anglosphere']
        : race === 'brown'
          ? ['MixedRace']
          : []
    : exactMaleFolders(country);
  const folders = [...new Set([...exact, ...maleRegionalFolders(country, race)])];
  return folders.map(folder => folderPool(folder)).filter(pool => pool.length > 0);
}

function malePortraitUrl(relPath: string): string {
  const folder = relPath.split('/')[0] ?? '';
  const filename = relPath.split('/').pop() ?? relPath;
  if (folder === 'Afroamerican') return `${REGEN_AFROAMERICAN_BASE}/${filename}`;
  if (folder === 'Filipino') return `${REGEN_FILIPINO_BASE}/${filename}`;
  if (BLACK_FOLDERS.has(folder)) return `${REGEN_BLACK_BASE}/${relPath}`;
  if (ASIAN_FOLDERS.has(folder)) return `${REGEN_ASIAN_BASE}/${relPath}`;
  if (BROWN_FOLDERS.has(folder)) {
    const spainNumber = folder === 'Spain' ? Number(filename.match(/PP16Spain(\d+)\.png$/)?.[1]) : 0;
    const directPath = spainNumber > 3001 ? `Spain/Spain/${filename}` : relPath;
    return `${REGEN_BROWN_BASE}/${directPath}`;
  }
  return `${REGEN_MAINPACK_BASE}/${relPath}`;
}

function portraitGroupCount(group: SequentialPortraitPathGroup): number {
  return group.end - group.start + 1 - (group.excluded?.length ?? 0);
}

function portraitPathAt(group: SequentialPortraitPathGroup, ordinal: number): string {
  let index = group.start + ordinal;
  for (const excluded of group.excluded ?? []) {
    if (excluded <= index) index++;
  }
  return `${group.folder}/${group.prefix}${String(index).padStart(4, '0')}.png`;
}

function claimFromPathPool(
  seed: string,
  pool: readonly SequentialPortraitPathGroup[],
  used: Set<string>,
): string | null {
  const total = pool.reduce((sum, group) => sum + portraitGroupCount(group), 0);
  if (total === 0) return null;
  const start = hashPortraitSeed(seed) % total;
  for (let offset = 0; offset < total; offset++) {
    let ordinal = (start + offset) % total;
    let selected = pool[0];
    for (const group of pool) {
      const count = portraitGroupCount(group);
      if (ordinal < count) {
        selected = group;
        break;
      }
      ordinal -= count;
    }
    if (!selected) continue;
    const relPath = portraitPathAt(selected, ordinal);
    const claimed = relPath ? claimPortraitUrl(malePortraitUrl(relPath), used) : null;
    if (claimed) return claimed;
  }
  return null;
}

function womenExactFolders(country: string, race: RegenRace): string[] {
  if (isUnitedStatesCountry(country) || includesCountry(country, 'canada')) {
    if (race === 'black') return ['African'];
    if (race === 'asian') return ['China'];
    if (race === 'brown') return ['Maghreb'];
    return ['CaucasianNA'];
  }
  if (includesCountry(country, 'australia', 'new zealand')) return ['Australia'];
  if (includesCountry(country, 'china', 'taiwan')) return ['China'];
  if (includesCountry(country, 'japan')) return ['Japan'];
  if (includesCountry(country, 'korea')) return ['Korea'];
  if (includesCountry(country, 'denmark')) return ['Denmark'];
  if (includesCountry(country, 'england', 'scotland', 'wales', 'united kingdom', 'ireland')) return ['England'];
  if (includesCountry(country, 'france')) return ['France'];
  if (includesCountry(country, 'germany', 'austria', 'switzerland', 'netherlands', 'belgium')) return ['Germany'];
  if (includesCountry(country, 'italy')) return ['Italy'];
  if (includesCountry(country, 'morocco', 'algeria', 'tunisia', 'libya', 'egypt')) return ['Maghreb'];
  if (includesCountry(country, 'norway')) return ['Norway'];
  if (includesCountry(country, 'spain', 'portugal')) return ['Spain'];
  if (includesCountry(country, 'sweden', 'finland')) return ['Sweden'];
  if (includesCountry(country, 'poland', 'czech', 'slovak', 'slovenia', 'croatia', 'serbia', 'ukraine', 'russia')) return ['WestSlavic'];
  return [];
}

function womenRaceFolders(race: RegenRace): string[] {
  if (race === 'black') return ['African'];
  if (race === 'asian') return ['China', 'Japan', 'Korea'];
  if (race === 'brown') return ['Maghreb', 'Spain'];
  return ['CaucasianNA', 'Australia', 'England', 'France', 'Germany', 'Italy', 'Denmark', 'Norway', 'Sweden', 'WestSlavic'];
}

function staffExactFolders(country: string, race: RegenRace): string[] {
  if (isMultiracialAnglosphere(country)) {
    if (race === 'black') return ['African'];
    if (race === 'asian') return ['China', 'SEA'];
    if (race === 'brown') return ['LatinAmerica'];
    return ['CaucasianNA'];
  }
  if (isFilipinoCountry(country) || includesCountry(country, 'indonesia', 'malaysia', 'singapore', 'vietnam', 'thailand')) return ['SEA'];
  if (includesCountry(country, 'china', 'taiwan')) return ['China'];
  if (includesCountry(country, 'japan')) return ['Japan'];
  if (includesCountry(country, 'korea')) return ['Korea'];
  if (includesCountry(country, 'armenia')) return ['Armenian'];
  if (includesCountry(country, 'brazil')) return ['Brazil'];
  if (includesCountry(country, 'mexico', 'argentina', 'chile', 'colombia', 'venezuela', 'peru', 'ecuador', 'dominican', 'puerto rico', 'cuba')) return ['LatinAmerica'];
  if (includesCountry(country, 'morocco', 'algeria', 'tunisia', 'libya')) return ['Maghreb'];
  if (includesCountry(country, 'iran', 'iraq', 'israel', 'jordan', 'lebanon', 'syria', 'saudi', 'uae', 'qatar')) return ['MiddleEast'];
  if (includesCountry(country, 'nigeria', 'ghana', 'senegal', 'south africa', 'ethiopia', 'kenya')) return ['African'];
  if (includesCountry(country, 'cameroon', 'congo', 'gabon', 'angola')) return ['CentralAfrica'];
  if (includesCountry(country, 'russia', 'ukraine', 'belarus', 'poland', 'czech', 'slovak', 'romania', 'bulgaria')) return ['EasternEurope'];
  if (includesCountry(country, 'sweden', 'norway', 'denmark', 'finland', 'iceland')) return ['Scandinavian'];
  if (includesCountry(country, 'spain', 'portugal')) return ['SouthWestEurope'];
  if (includesCountry(country, 'italy', 'greece', 'serbia', 'croatia', 'slovenia')) return ['SouthEurope'];
  if (includesCountry(country, 'france', 'england', 'ireland', 'netherlands', 'belgium')) return ['NorthWestEurope'];
  if (includesCountry(country, 'germany', 'austria', 'switzerland', 'hungary')) return ['NorthCentralEurope'];
  return [];
}

function staffRaceFolders(race: RegenRace): string[] {
  if (race === 'black') return ['African', 'CentralAfrica'];
  if (race === 'asian') return ['China', 'Japan', 'Korea', 'SEA'];
  if (race === 'brown') return ['LatinAmerica', 'MiddleEast', 'Maghreb', 'Brazil'];
  return ['CaucasianNA', 'NorthCentralEurope', 'NorthWestEurope', 'EasternEurope', 'SouthEurope', 'SouthWestEurope', 'Scandinavian', 'Armenian'];
}

function availableCount(folder: SequentialPortraitFolder): number {
  return folder.max - (folder.excluded?.length ?? 0);
}

function sequenceIndex(folder: SequentialPortraitFolder, ordinal: number): number {
  const excluded = new Set(folder.excluded ?? []);
  let seen = -1;
  for (let index = 1; index <= folder.max; index++) {
    if (excluded.has(index)) continue;
    seen++;
    if (seen === ordinal) return index;
  }
  return 1;
}

function claimSequentialTier(params: {
  seed: string;
  folders: readonly string[];
  gender?: NewgenGender;
  kind: RegenPortraitKind;
  used: Set<string>;
}): string | null {
  const entries = params.folders.flatMap(folder => {
    const spec = params.kind === 'staff'
      ? REGEN_STAFF_FOLDERS[folder]?.[params.gender ?? 'male']
      : REGEN_WOMEN_FOLDERS[folder];
    return spec ? [{ folder, spec }] : [];
  });
  const total = entries.reduce((sum, entry) => sum + availableCount(entry.spec), 0);
  if (total === 0) return null;
  const start = hashPortraitSeed(params.seed) % total;
  for (let offset = 0; offset < total; offset++) {
    let ordinal = (start + offset) % total;
    let selected = entries[0];
    for (const entry of entries) {
      const count = availableCount(entry.spec);
      if (ordinal < count) {
        selected = entry;
        break;
      }
      ordinal -= count;
    }
    if (!selected) continue;
    const index = sequenceIndex(selected.spec, ordinal);
    const filename = `${selected.spec.prefix}${String(index).padStart(4, '0')}.png`;
    const base = params.kind === 'staff' ? REGEN_STAFF_BASE : REGEN_WOMEN_BASE;
    const path = params.kind === 'staff'
      ? `${selected.folder}/${params.gender ?? 'male'}/${filename}`
      : `${selected.folder}/${filename}`;
    const claimed = claimPortraitUrl(`${base}/${path}`, params.used);
    if (claimed) return claimed;
  }
  return null;
}

export function getRegenPortraitUrl(
  seed: string,
  race: RegenRace,
  options?: RegenPortraitOptions,
): string | null {
  const country = normalizedCountry(options?.nationality ?? options?.bornLoc);
  const used = options?.usedPortraitUrls ?? createPortraitUsageSet();
  const gender = options?.gender ?? 'male';
  if (options?.kind === 'staff') {
    const folders = [...new Set([...staffExactFolders(country, race), ...staffRaceFolders(race)])];
    const tiers = folders.map(folder => [folder]);
    for (let index = 0; index < tiers.length; index++) {
      const url = claimSequentialTier({ seed: `${seed}_staff_${index}`, folders: tiers[index], gender, kind: 'staff', used });
      if (url) return url;
    }
    if (gender === 'male') {
      const hairUrl = claimHairPortraitUrl(`${seed}_staff_hair`, race, used);
      if (hairUrl) return hairUrl;
    }
    return claimGenericPortraitUrl(`${seed}_staff_generic`, gender, used);
  }
  if (gender === 'female') {
    const folders = [...new Set([...womenExactFolders(country, race), ...womenRaceFolders(race)])];
    const tiers = folders.map(folder => [folder]);
    for (let index = 0; index < tiers.length; index++) {
      const url = claimSequentialTier({ seed: `${seed}_women_${index}`, folders: tiers[index], kind: 'player', used });
      if (url) return url;
    }
    return claimGenericPortraitUrl(`${seed}_women_generic`, 'female', used);
  }
  const tiers = malePortraitTiers(country, race);
  for (let index = 0; index < tiers.length; index++) {
    const url = claimFromPathPool(`${seed}_regen_${index}`, tiers[index], used);
    if (url) return url;
  }
  const hairUrl = claimHairPortraitUrl(`${seed}_hair`, race, used);
  if (hairUrl) return hairUrl;
  return claimGenericPortraitUrl(`${seed}_generic`, 'male', used);
}

export function getLocalRegenPortraitFallbackUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const legacyMarker = '/playerfaces_regen_replacements/';
  const legacyIndex = url.indexOf(legacyMarker);
  const repoMatch = url.match(/raw\.githubusercontent\.com\/aljohnpolyglot\/(?:nba-store-data|ng-regens-mainpack|ng-regens-black|ng-regens-asia|ng-regens-brown)\/(?:refs\/heads\/)?main\/(?:playerfaces_regen_replacements\/)?(.+)$/);
  const filipinoMatch = url.match(/raw\.githubusercontent\.com\/aljohnpolyglot\/ng-regens-filipino\/(?:refs\/heads\/)?main\/(.+)$/);
  const afroamericanMatch = url.match(/raw\.githubusercontent\.com\/aljohnpolyglot\/ng-regens-afroamerican\/(?:refs\/heads\/)?main\/(.+)$/);
  const rawPath = legacyIndex >= 0
    ? url.slice(legacyIndex + legacyMarker.length)
    : filipinoMatch?.[1]
      ? `Filipino/${filipinoMatch[1]}`
      : afroamericanMatch?.[1]
        ? `Afroamerican/${afroamericanMatch[1]}`
        : repoMatch?.[1];
  if (!rawPath) return null;
  const relPath = rawPath.split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');
  return `${LOCAL_REGEN_PORTRAIT_BASE}/${relPath}`;
}
