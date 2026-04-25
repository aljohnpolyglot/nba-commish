/**
 * externalLeagueSustainer.ts
 *
 * Population-maintenance pipeline for external leagues. Prevents foreign leagues
 * from shrinking over multi-season sims and drains mid-tier NBA FA pool overseas.
 *
 * BIO REALISM CONTRACT: every generated player must have nationality-matched names.
 * Franz Wagner (Germany) retires → replacement has German name, born.loc = 'Germany'.
 *
 * Call order in seasonRollover.ts:
 *   1. retireExternalLeaguePlayers  — outflow tracking, history entries
 *   2. (19y auto-declare already in rollover age-increment step)
 *   3. repopulateExternalLeagues    — two-track, 1:1 country matching
 *   4. enforceExternalMinRoster     — safety net (also at init)
 *
 * Call in autoResolvers.ts after autoRunDraft:
 *   returnUndraftedToHomeLeague
 */

import type { NBAPlayer, GameState } from '../types';
import {
  EXTERNAL_SALARY_SCALE, NATIONALITY_LEAGUE_BIAS, NATIONALITY_LEAGUE_WEIGHTS, CLUB_NATIONALITY_MAP,
  LEAGUE_HEIGHT_CEILING, COUNTRY_HEIGHT_MULT, YOUTH_EXTERNAL_OVR_CAP,
} from '../constants';
import type { LeagueWeightEntry } from '../constants';
import { getNameData } from '../data/nameDataFetcher';
import { generateDraftClassForGame, pickWeighted } from './genDraftPlayers';
import { EUROLEAGUE_TEAMS, getRaceFrequencies } from '../genplayersconstants';

// ── Seeded RNG — same convention as retirementChecker.ts ─────────────────────
const GENERATED_EXTERNAL_OVR_NERF = 8;
const GENERATED_EXTERNAL_VERSION = 5;
const GENERATED_EXTERNAL_SCALE_ATTRS = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'] as const;

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function pickGeneratedExternalDraftYear(targetAge: number, bornYear: number, year: number, seed: string): number {
  // Youth prospects should look draft-eligible in the future, not "this year".
  if (targetAge < 19) return bornYear + 19;

  // Adult filler pros should read like old NBA attempts, not current rookies.
  // Randomize the "undrafted" year inside the common 19-22 entry window, but
  // never let it land in the current season year.
  const minYear = bornYear + 19;
  const maxYear = Math.min(bornYear + 22, year - 1);
  if (maxYear <= minYear) return minYear;
  const span = maxYear - minYear + 1;
  return minYear + Math.floor(seededRandom(seed) * span);
}

function getGeneratedExternalOvrCap(league: string, age: number): number {
  const adultCap: Record<string, number> = {
    Euroleague: 46,
    Endesa: 44,
    'NBL Australia': 42,
    'China CBA': 41,
    'B-League': 40,
    PBA: 39,
    'G-League': 38,
  };
  const youthCap: Record<string, number> = {
    Euroleague: 40,
    Endesa: 39,
    'NBL Australia': 38,
    'China CBA': 37,
    'B-League': 36,
    PBA: 35,
    'G-League': 35,
  };
  return age < 19 ? (youthCap[league] ?? 38) : (adultCap[league] ?? 40);
}

function getClubCountry(tid: number | undefined): string | undefined {
  if (tid == null) return undefined;
  const euro = EUROLEAGUE_TEAMS[String(tid)]?.country;
  return euro ?? CLUB_NATIONALITY_MAP[tid];
}

function pickRaceForCountry(country: string, seed: string): string {
  const freqs = getRaceFrequencies(country);
  const total = Object.values(freqs).reduce((sum, value) => sum + value, 0);
  let roll = seededRandom(seed) * total;
  for (const [race, weight] of Object.entries(freqs)) {
    roll -= weight;
    if (roll <= 0) return race;
  }
  return Object.keys(freqs)[0] ?? 'white';
}

export function repairGeneratedExternalPlayer(player: NBAPlayer, referenceYear: number): NBAPlayer {
  if (!player.internalId?.startsWith('ext-gen-')) return player;
  const nameData = getNameData();
  const bornYear = player.born?.year;
  if (typeof bornYear !== 'number' || !Number.isFinite(bornYear)) return player;

  const age = typeof player.age === 'number' && Number.isFinite(player.age)
    ? player.age
    : Math.max(0, referenceYear - bornYear);
  const draftYear = pickGeneratedExternalDraftYear(age, bornYear, referenceYear, `${player.internalId}_repair_draft`);
  const clubCountry = getClubCountry(player.tid);
  const currentCountry = player.born?.loc ?? (player as any).nationality ?? '';
  const extGenVersion = Number((player as any).extGenVersion ?? 1);
  const shouldRecastIdentity =
    !!clubCountry &&
    ['Euroleague', 'Endesa', 'B-League', 'NBL Australia'].includes(player.status ?? '') &&
    extGenVersion < GENERATED_EXTERNAL_VERSION &&
    currentCountry !== clubCountry;
  const targetCountry = shouldRecastIdentity ? clubCountry! : currentCountry;
  const namePool = targetCountry ? resolveNamePool(targetCountry, nameData) : null;
  const firstName = shouldRecastIdentity
    ? (namePool?.first ? pickWeighted(namePool.first) : ((player as any).firstName ?? player.name.split(' ')[0] ?? 'Unknown'))
    : ((player as any).firstName ?? player.name.split(' ')[0] ?? 'Unknown');
  const lastName = shouldRecastIdentity
    ? (namePool?.last && Object.keys(namePool.last).length > 0
        ? pickWeighted(namePool.last)
        : ((player as any).lastName ?? player.name.split(' ').slice(1).join(' ') ?? 'Player'))
    : ((player as any).lastName ?? player.name.split(' ').slice(1).join(' ') ?? 'Player');
  const alreadyNerfed = extGenVersion >= 2;
  const rawOvr = Math.max(1, player.overallRating ?? player.ratings?.[player.ratings.length - 1]?.ovr ?? 40);
  const generatedCap = getGeneratedExternalOvrCap(player.status ?? '', age);
  const nerfedBaseOvr = alreadyNerfed ? rawOvr : Math.max(25, rawOvr - GENERATED_EXTERNAL_OVR_NERF);
  const nerfedOvr = Math.min(nerfedBaseOvr, generatedCap);
  const scaleFactor = rawOvr > 0 ? nerfedOvr / rawOvr : 1;
  const ratings = Array.isArray(player.ratings) ? player.ratings : [];
  const lastIdx = ratings.length - 1;
  const needsRescale = !alreadyNerfed || nerfedOvr !== rawOvr;
  const patchedRatings = lastIdx >= 0
    ? ratings.map((r: any, idx: number) => {
        if (idx !== lastIdx) return r;
        const next = { ...r };
        if (needsRescale) {
          for (const attr of GENERATED_EXTERNAL_SCALE_ATTRS) {
            if (typeof next[attr] === 'number') {
              next[attr] = Math.max(10, Math.min(99, Math.round(next[attr] * scaleFactor)));
            }
          }
          const prevPot = typeof next.pot === 'number' ? next.pot : nerfedOvr;
          const potCap = generatedCap + (age < 21 ? 8 : 4);
          next.ovr = nerfedOvr;
          next.pot = Math.max(nerfedOvr, Math.min(potCap, prevPot - (alreadyNerfed ? 0 : GENERATED_EXTERNAL_OVR_NERF)));
        }
        return next;
      })
    : ratings;

  return {
    ...player,
    name: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    overallRating: nerfedOvr,
    potential: Math.max(
      nerfedOvr,
      Math.min(generatedCap + (age < 21 ? 8 : 4), ((player as any).potential ?? nerfedOvr) - (alreadyNerfed ? 0 : GENERATED_EXTERNAL_OVR_NERF)),
    ),
    ratings: patchedRatings,
    extGenVersion: GENERATED_EXTERNAL_VERSION,
    born: {
      ...(player.born ?? { year: bornYear, loc: targetCountry || currentCountry || 'USA' }),
      year: bornYear,
      loc: targetCountry || currentCountry || 'USA',
    },
    nationality: targetCountry || currentCountry || 'USA',
    race: shouldRecastIdentity ? pickRaceForCountry(targetCountry || 'USA', `${player.internalId}_repair_race`) : (player as any).race,
    draft: {
      ...(player.draft ?? {}),
      year: draftYear,
      tid: player.draft?.tid ?? -1,
      round: player.draft?.round ?? 0,
      pick: player.draft?.pick ?? 0,
      originalTid: player.draft?.originalTid ?? -1,
    },
  } as any as NBAPlayer;
}

// ── League constants ──────────────────────────────────────────────────────────

// G-League is a feeder for grown American pros, not a youth academy system.
// Spawning 15-18yo "youth" at G-League teams produced nonsense colleges like
// "Maine Celtics Youth" showing up in the UI. Keep it adult-direct.
const WITH_YOUTH_LEAGUES = new Set(['Euroleague', 'Endesa', 'NBL Australia', 'B-League']);
const ADULT_DIRECT_LEAGUES = new Set(['PBA', 'China CBA']);

// BBGM raw OVR ceiling per league (most players land 45–58, rare hit cap)
// Kept in lockstep with constants.ts EXTERNAL_LEAGUE_OVR_CAP.
const LEAGUE_OVR_CAP: Record<string, number> = {
  Euroleague:      58,
  Endesa:          55,
  'NBL Australia': 52,
  'China CBA':     50,
  'B-League':      48,
  PBA:             46,
  'G-League':      45,
};

// Default nationality for adult-direct leagues
const ADULT_DIRECT_NATIONALITY: Record<string, string> = {
  PBA:         'Philippines',
  'China CBA': 'China',
};

// When nameData lacks a country, fall through to a regional proxy
const COUNTRY_NAME_FALLBACK: Record<string, string> = {
  // Germanic / Nordic
  Austria: 'Germany', Switzerland: 'Germany', Netherlands: 'Germany',
  Belgium: 'Germany', Denmark: 'Germany', Norway: 'Germany', Sweden: 'Germany',
  Finland: 'Germany', Poland: 'Germany', Czech_Republic: 'Germany',
  // Slavic
  Serbia: 'Serbia', Croatia: 'Germany', Slovenia: 'Germany',
  Bosnia_and_Herzegovina: 'Germany', Montenegro: 'Germany',
  Macedonia: 'Germany', Bulgaria: 'Germany', Slovakia: 'Germany',
  // Romance
  Italy: 'Spain', Portugal: 'Spain', Romania: 'Spain',
  // Balkan / Eastern
  Greece: 'Spain', Turkey: 'Germany', Russia: 'Germany',
  Ukraine: 'Germany', Belarus: 'Germany', Georgia: 'Germany',
  Armenia: 'Germany', Lithuania: 'Germany', Latvia: 'Germany',
  Estonia: 'Germany', Hungary: 'Germany',
  // Middle East / North Africa
  Israel: 'Germany', Egypt: 'Nigeria', Morocco: 'Nigeria',
  // Sub-Saharan Africa → Nigeria proxy
  Senegal: 'Nigeria', Cameroon: 'Nigeria', Ghana: 'Nigeria',
  Angola: 'Nigeria', Congo: 'Nigeria', Mali: 'Nigeria',
  'Ivory Coast': 'Nigeria', Kenya: 'Nigeria',
  // Oceania
  'New Zealand': 'Australia',
  // Asia
  Japan: 'China', Philippines: 'China', South_Korea: 'China',
  Taiwan: 'China', Indonesia: 'China', Malaysia: 'China',
  Vietnam: 'China', Thailand: 'China',
  // Latin America → existing pools
  Brazil: 'Nigeria', Argentina: 'Spain', Colombia: 'Spain',
  Venezuela: 'Spain', Mexico: 'Spain',
};

// Youth-club tids per league — prefer real academies for Track A spawns
const YOUTH_CLUB_TIDS: Record<string, number[]> = {
  Euroleague:      [1002, 1000, 1006, 1001, 1013, 1014, 1015], // Barcelona, Madrid, Baskonia, Olympiacos, Partizan, Crvena Zvezda, Virtus
  Endesa:          [5006, 5012, 5001],                          // Barcelona, Real Madrid, Baskonia
  'NBL Australia': [8008, 8000],                               // Sydney Kings, Adelaide 36ers
  'B-League':      [4003, 4008, 4002],                         // Chiba Jets, Kawasaki, Alvark Tokyo
  'G-League':      [],                                         // any team (feeder — no formal academy)
};

const COUNTRY_FEEDER_AFFILIATIONS: Record<string, string[]> = {
  France: ['INSEP', 'LDLC ASVEL', 'Monaco AS', 'Nanterre 92', 'Limoges CSP'],
  Spain: ['Joventut Badalona', 'Real Madrid', 'FC Barcelona', 'Baskonia', 'Valencia Basket'],
  Germany: ['Alba Berlin', 'FC Bayern Munich'],
  Italy: ['Virtus Bologna', 'EA7 Emporio Armani Milan'],
  Serbia: ['Partizan Belgrade', 'Crvena Zvezda'],
  Greece: ['Olympiacos', 'Panathinaikos', 'AEK Athens'],
  Turkey: ['Fenerbahce', 'Anadolu Efes'],
  Lithuania: ['Zalgiris Kaunas', 'Rytas Vilnius'],
  Montenegro: ['Buducnost'],
  Slovenia: ['Olimpija Ljubljana'],
  Israel: ['Maccabi Tel Aviv', 'Hapoel Tel Aviv'],
  Russia: ['CSKA Moscow'],
  Czech_Republic: ['Nymburk'],
  'Czech Republic': ['Nymburk'],
  Australia: ['Centre of Excellence', 'Sydney Kings', 'Melbourne United'],
  'New Zealand': ['New Zealand Breakers'],
  Japan: ['Alvark Tokyo', 'Chiba Jets', 'Kawasaki Brave Thunders'],
};

function pickNationalFeederAffiliation(country: string, team: any, seed: string): string | null {
  const canonicalCountry = COUNTRY_SYNONYMS[country] ?? country;
  const affiliations =
    COUNTRY_FEEDER_AFFILIATIONS[canonicalCountry]
    ?? COUNTRY_FEEDER_AFFILIATIONS[canonicalCountry.replace(/ /g, '_')];
  if (!affiliations || affiliations.length === 0) return null;

  const teamName = team ? `${team.region ?? ''} ${team.name ?? ''}`.trim() : '';
  const clubCountry = getClubCountry(team?.tid);
  const normalizedTeam = teamName.toLowerCase();
  const weighted: Record<string, number> = {};

  for (const aff of affiliations) {
    weighted[aff] = 1;
  }

  if (teamName && clubCountry === canonicalCountry) {
    const sameClubEntry = affiliations.find(aff => aff.toLowerCase() === normalizedTeam);
    if (sameClubEntry) {
      weighted[sameClubEntry] = canonicalCountry === 'Spain' ? 7 : 5;
    } else if (canonicalCountry === 'Spain') {
      // Spain has many plausible domestic clubs, so keep more "lifers" by letting
      // the current club itself appear as the affiliation when country matches.
      weighted[teamName] = 6;
    } else {
      weighted[teamName] = 4;
    }
  }

  return pickWeighted(weighted);
}

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ExternalRetireeRecord {
  player: NBAPlayer;
  league: string;
  country: string; // born.loc at retirement — drives 1:1 nationality replacement
  careerGP: number;
}

export interface ExternalHistoryEntry {
  text: string;
  date: string;
  type: 'Retirement' | 'Signing' | 'Draft';
  playerIds: string[];
}

// ── Module-level state ────────────────────────────────────────────────────────

/** Warn only once per missing country (Fix 1). */
const warnedMissingCountries = new Set<string>();

/** Per-league college frequency map, built from current roster at init (Fix 2). */
let collegesByLeague: Record<string, Map<string, number>> = {};

/** College outflow per league × college, accumulated as players retire (Fix 2). */
let retireCollegeOutflow: Record<string, Record<string, number>> = {};

// ── Country synonym / legacy map (Fix 1) ─────────────────────────────────────

const COUNTRY_SYNONYMS: Record<string, string> = {
  'United States': 'USA',
  'United-Kingdom': 'United Kingdom',
  'Serbia-Montenegro': 'Serbia',
  Yugoslavia: 'Serbia',
  'DR Congo': 'Congo',
  'Republic of Congo': 'Congo',
  'Côte d\'Ivoire': 'Ivory Coast',
  'Czech Republic': 'Czech_Republic',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeCareerGP(player: NBAPlayer): number {
  return (player.stats ?? [])
    .filter((s: any) => !s.playoffs)
    .reduce((sum: number, s: any) => sum + (s.gp ?? 0), 0);
}

/**
 * Resolve name pool for a country.
 * Handles dual-citizenship strings, synonyms, legacy country names, and
 * regional fallbacks — warns once per missing country, never silently uses USA.
 */
function resolveNamePool(country: string, nameData: ReturnType<typeof getNameData>): { first: Record<string, number>; last: Record<string, number> } | null {
  type Pool = { first: Record<string, number>; last: Record<string, number> };

  const tryLookup = (c: string): Pool | null => {
    // Apply synonym normalization
    const canonical = COUNTRY_SYNONYMS[c] ?? c;
    const d1 = nameData.countries[canonical];
    if (d1?.first && Object.keys(d1.first).length > 0) return d1 as Pool;
    // Also try underscore variant (nameData stores some as "Czech_Republic")
    const u = nameData.countries[canonical.replace(/ /g, '_')];
    if (u?.first && Object.keys(u.first).length > 0) return u as Pool;
    return null;
  };

  // Split dual-citizenship strings: "Senegal, France" → ["Senegal", "France"]
  const tokens = country.split(', ').map(t => t.trim()).filter(Boolean);

  for (const token of tokens) {
    const r = tryLookup(token);
    if (r) return r;
  }

  // Try COUNTRY_NAME_FALLBACK with primary (first) token
  const primary = COUNTRY_SYNONYMS[tokens[0] ?? country] ?? (tokens[0] ?? country);
  const fallbackKey = COUNTRY_NAME_FALLBACK[primary] ?? COUNTRY_NAME_FALLBACK[primary.replace(/ /g, '_')];
  if (fallbackKey) {
    const fb = nameData.countries[fallbackKey];
    if (fb?.first && Object.keys(fb.first).length > 0) {
      if (!warnedMissingCountries.has(primary)) {
        warnedMissingCountries.add(primary);
        console.warn(`[ExternalSustainer] nameData missing for "${primary}" — using "${fallbackKey}" proxy`);
      }
      return fb as Pool;
    }
  }

  // Try same-league country as regional fallback (e.g. Taiwan → B-League → Japan)
  const homeLeague = (NATIONALITY_LEAGUE_WEIGHTS[primary]?.[0]?.league) ?? (NATIONALITY_LEAGUE_BIAS as Record<string, string>)[primary];
  if (homeLeague) {
    const leagueCountries = Object.entries(NATIONALITY_LEAGUE_BIAS as Record<string, string>)
      .filter(([, l]) => l === homeLeague)
      .map(([c]) => c);
    for (const lc of leagueCountries) {
      const r = tryLookup(lc);
      if (r) {
        if (!warnedMissingCountries.has(primary)) {
          warnedMissingCountries.add(primary);
          console.warn(`[ExternalSustainer] nameData missing for "${primary}" — using "${lc}" (same league: ${homeLeague}) proxy`);
        }
        return r;
      }
    }
  }

  if (!warnedMissingCountries.has(primary)) {
    warnedMissingCountries.add(primary);
    console.warn(`[ExternalSustainer] nameData missing for "${primary}" — no proxy found, falling back to USA`);
  }
  return (nameData.countries['USA'] ?? null) as Pool | null;
}

/** Derive college/pre-draft affiliation based on league convention, nationality, team, and retirement outflow. */
function deriveCollege(league: string, isYouth: boolean, team: any, country: string, seed: string): string {
  const teamName = team ? `${team.region ?? ''} ${team.name ?? ''}`.trim() : '';
  if (!isYouth) {
    // Adult-direct leagues: no college data
    if (league === 'PBA' || league === 'China CBA') return '';
    const feederAffiliation = pickNationalFeederAffiliation(country, team, seed);
    if (feederAffiliation) return feederAffiliation;
    // Try league college tracking first; if empty, show the feeder club rather than blank.
    return pickCollegeForLeague(league, Math.random()) || teamName;
  }
  // Youth: use team name + Youth/Development suffix
  if (!teamName) return '';
  if (league === 'B-League') return `${teamName} Development`;
  if (league === 'NBL Australia') return 'NBL Next Stars';
  return `${teamName} Youth`;
}

/**
 * Generate a single external-league NBAPlayer with correct nationality-matched bio.
 * `country` controls the name pool and born.loc — must be set for 1:1 replacement.
 */
function spawnExternalPlayer(opts: {
  league: string;
  targetAge: number;
  year: number;
  rngBase: string;
  tid: number;
  team: any;
  salaryCap: number;
  isYouth: boolean;
  country: string; // explicit nationality — drives names, face race, born.loc
}): NBAPlayer | null {
  const { league, targetAge, year, rngBase, tid, team, salaryCap, isYouth, country } = opts;

  try {
    const nameData = getNameData();

    // ── Generate base ratings/archetype/physical from the existing pipeline ──
    const generated = generateDraftClassForGame(year, 1, Math.random, nameData, year);
    const base = generated[0];
    if (!base) return null;

    // ── Name: pull from correct country's pool ──────────────────────────────
    const namePool = resolveNamePool(country, nameData);
    const firstName = namePool?.first
      ? pickWeighted(namePool.first)
      : (base as any).firstName ?? 'Unknown';
    const lastName = namePool?.last && Object.keys(namePool.last).length > 0
      ? pickWeighted(namePool.last)
      : (base as any).lastName ?? 'Player';

    // ── OVR: skewed toward lower-mid (70% bottom half, 30% top half) ────────
    const ovrCap = Math.min(LEAGUE_OVR_CAP[league] ?? 55, getGeneratedExternalOvrCap(league, targetAge));
    const ovrFloor = Math.max(35, ovrCap - 18);
    const rngOvr = seededRandom(rngBase + '_ovr');
    const rawFrac = rngOvr < 0.70 ? (rngOvr / 0.70) * 0.50 : 0.50 + ((rngOvr - 0.70) / 0.30) * 0.50;
    let targetOvr = Math.round(ovrFloor + rawFrac * (ovrCap - ovrFloor));

    // Fix 6: USA imports in foreign leagues are journeymen (G-League exempt — it's the US feeder)
    if (country === 'USA' && league !== 'G-League') {
      targetOvr = Math.min(targetOvr, ovrCap - 8);
    }

    // Fix 9: Youth generation hard cap (age < 19 in external leagues → K2 ~64 max)
    if (targetAge < 19) {
      targetOvr = Math.min(targetOvr, YOUTH_EXTERNAL_OVR_CAP);
    }
    targetOvr = Math.max(25, Math.min(ovrCap, targetOvr - GENERATED_EXTERNAL_OVR_NERF));

    // POT: youth has more room to grow (Fix 3 — youth POT stays high even with OVR cap)
    const potCap = isYouth ? ovrCap + 8 : ovrCap + 4;
    const potGap = Math.max(0, potCap - targetOvr);
    const targetPot = Math.min(potCap, targetOvr + Math.round(seededRandom(rngBase + '_pot') * potGap));

    // ── Fix 4 + 5: Height ceiling + country multiplier ──────────────────────
    const baseHgt: number = (base as any).hgt ?? 78; // bio inches from generator
    const hgtMult = COUNTRY_HEIGHT_MULT[country] ?? 1.0;
    const hgtCeil = LEAGUE_HEIGHT_CEILING[league] ?? 88;
    const adjHgt = Math.min(Math.round(baseHgt * hgtMult), hgtCeil);
    // Back-derive hgt rating attribute from adjusted bio height
    const adjHgtRating = Math.round(Math.max(0, Math.min(99, ((adjHgt - 68) / 22) * 99)));
    // Recompute weight proportionally
    const stre = (base as any).ratings?.[0]?.stre ?? 50;
    const adjBMI = 20 + (stre / 99) * 8;
    const adjWeight = Math.round((adjBMI * Math.pow(adjHgt, 2)) / 703);

    // ── Salary proportional to OVR within league band ───────────────────────
    const scale = EXTERNAL_SALARY_SCALE[league] ?? { minPct: 0.001, maxPct: 0.005 };
    const ovrNorm = Math.max(0, Math.min(1, (targetOvr - ovrFloor) / Math.max(1, ovrCap - ovrFloor)));
    const salaryUSD = Math.round(salaryCap * (scale.minPct + ovrNorm * (scale.maxPct - scale.minPct)));
    const contractExp = year + (targetOvr >= ovrCap - 5 ? 2 : 1);

    const college = deriveCollege(league, isYouth, team, country, `${rngBase}_college`);
    const uniqueId = `ext-gen-${league.replace(/[\s-]/g, '')}-${rngBase.slice(-10)}-${Date.now().toString(36)}`;
    const bornYear = year - targetAge;
    const draftYear = pickGeneratedExternalDraftYear(targetAge, bornYear, year, `${rngBase}_draft`);

    // Scale all skill attributes proportionally to targetOvr so that when this player
    // later becomes a Draft Prospect (external cap lifts), calculatePlayerOverallForYear
    // reads the scaled attrs and doesn't compute a wildly higher OVR from unscaled values.
    const baseRatings = Array.isArray((base as any).ratings) ? (base as any).ratings[(base as any).ratings.length - 1] : {};
    const currentAvg = GENERATED_EXTERNAL_SCALE_ATTRS.reduce((s: number, a: string) => s + (baseRatings[a] ?? 50), 0) / GENERATED_EXTERNAL_SCALE_ATTRS.length;
    const scaleFactor = currentAvg > 0 ? targetOvr / currentAvg : 1;
    const scaledLastRating: Record<string, number> = { ...baseRatings, hgt: adjHgtRating, ovr: targetOvr, pot: targetPot };
    for (const a of GENERATED_EXTERNAL_SCALE_ATTRS) {
      scaledLastRating[a] = Math.max(10, Math.min(99, Math.round((baseRatings[a] ?? 50) * scaleFactor)));
    }
    const patchedRatings = Array.isArray((base as any).ratings)
      ? (base as any).ratings.map((r: any, i: number) =>
          i === (base as any).ratings.length - 1 ? scaledLastRating : r)
      : [scaledLastRating];

    return {
      ...base,
      internalId: uniqueId,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      tid,
      status: league as NBAPlayer['status'],
      overallRating: targetOvr,
      potential: targetPot,
      age: targetAge,
      born: { year: bornYear, loc: country },
      nationality: country,
      college,
      draft: {
        year: draftYear,
        tid: -1,
        round: 0,
        pick: 0,
        originalTid: -1,
      },
      hgt: adjHgt,
      weight: adjWeight,
      finalHgt: adjHgt,
      finalWeight: adjWeight,
      ratings: patchedRatings,
      contract: {
        amount: Math.round(salaryUSD / 1_000), // BBGM thousands convention
        exp: contractExp,
      },
      stats: [],
      hof: false,
      extGenVersion: GENERATED_EXTERNAL_VERSION,
    } as any as NBAPlayer;
  } catch (err) {
    console.warn('[ExternalSustainer] spawnExternalPlayer failed:', err);
    return null;
  }
}

/** Pick the least-rostered team from a list. */
function pickUnderRosteredTeam(teams: any[], players: NBAPlayer[]): any {
  if (teams.length === 0) return null;
  return [...teams].sort((a, b) => {
    const ac = players.filter(p => p.tid === a.tid && (p as any).status !== 'Retired').length;
    const bc = players.filter(p => p.tid === b.tid && (p as any).status !== 'Retired').length;
    return ac - bc;
  })[0];
}

/** Sample a league's country distribution based on nationality of existing players. */
function sampleLeagueCountry(league: string, nonNBATeams: any[], players: NBAPlayer[], rng: number): string {
  const leagueTeams = nonNBATeams.filter(t => t.league === league);
  const leaguePlayers = players.filter(p => (p as any).status === league);

  const baselineWeights: Record<string, number> = {};
  if (league === 'Endesa') {
    Object.assign(baselineWeights, {
      Spain: 5,
      France: 2,
      Germany: 2,
      Italy: 2,
      Serbia: 2,
      Lithuania: 2,
      Greece: 1,
      Turkey: 1,
      Slovenia: 1,
      Montenegro: 1,
    });
  }

  // Build frequency from existing league players
  const freq: Record<string, number> = { ...baselineWeights };
  for (const p of leaguePlayers) {
    const c = p.born?.loc ?? (p as any).nationality ?? '';
    if (c) freq[c] = (freq[c] ?? 0) + (league === 'Endesa' ? 0.75 : 1);
  }

  if (Object.keys(freq).length > 0) {
    return pickWeighted(freq);
  }

  // Fallback: use NATIONALITY_LEAGUE_BIAS + NATIONALITY_LEAGUE_WEIGHTS in reverse
  const simpleBias = Object.entries(NATIONALITY_LEAGUE_BIAS as Record<string, string>)
    .filter(([, l]) => l === league)
    .map(([c]) => c);
  const weightedBias = Object.entries(NATIONALITY_LEAGUE_WEIGHTS)
    .filter(([, entries]) => (entries as LeagueWeightEntry[]).some(e => e.league === league))
    .map(([c]) => c);
  const biasCountries = [...new Set([...simpleBias, ...weightedBias])];
  if (biasCountries.length > 0) {
    return biasCountries[Math.floor(rng * biasCountries.length)];
  }

  return 'USA'; // absolute last resort
}

function sampleTeamCountry(
  league: string,
  team: any,
  nonNBATeams: any[],
  players: NBAPlayer[],
  rng: number,
): string {
  const clubCountry = getClubCountry(team?.tid);
  const teamPlayers = players.filter(p => p.tid === team?.tid && (p as any).status !== 'Retired');
  const isMappedClubLeague = !!clubCountry && ['Euroleague', 'B-League', 'NBL Australia'].includes(league);
  const isSoftMappedClubLeague = !!clubCountry && league === 'Endesa';
  if (isMappedClubLeague) {
    const domesticCount = teamPlayers.filter(p => {
      const country = p.born?.loc ?? (p as any).nationality ?? '';
      return country === clubCountry;
    }).length;
    if (domesticCount === 0) return clubCountry!;
  }
  const weights: Record<string, number> = {};

  for (const p of teamPlayers) {
    const country = p.born?.loc ?? (p as any).nationality ?? '';
    if (!country) continue;
    const isClubCountry = clubCountry && country === clubCountry;
    weights[country] = (weights[country] ?? 0) + (isClubCountry ? 1.25 : 0.15);
  }

  const leagueCountry = sampleLeagueCountry(league, nonNBATeams, players, rng);
  if (leagueCountry) weights[leagueCountry] = (weights[leagueCountry] ?? 0) + (isMappedClubLeague ? 1.25 : 2);
  if (clubCountry) {
    const boost = isMappedClubLeague ? 8 : isSoftMappedClubLeague ? 3.5 : 16;
    weights[clubCountry] = (weights[clubCountry] ?? 0) + boost;
  }

  return pickWeighted(weights) ?? clubCountry ?? leagueCountry ?? 'USA';
}

function pickTeamForGeneratedPlayer(
  teams: any[],
  players: NBAPlayer[],
  additions: NBAPlayer[],
  country: string,
  seed: string,
): any | null {
  if (teams.length === 0) return null;

  const weightedTeams = teams.map(team => {
    const existingCount =
      players.filter(p => p.tid === team.tid && (p as any).status !== 'Retired').length +
      additions.filter(p => p.tid === team.tid).length;
    const deficitWeight = Math.max(1, 13 - existingCount);
    const affinityWeight = resolveClubAffinity(team.tid, country);
    return {
      team,
      weight: deficitWeight * affinityWeight,
    };
  }).filter(entry => entry.weight > 0);

  if (weightedTeams.length === 0) return pickUnderRosteredTeam(teams, [...players, ...additions]);

  const total = weightedTeams.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = seededRandom(seed) * total;
  for (const entry of weightedTeams) {
    roll -= entry.weight;
    if (roll <= 0) return entry.team;
  }
  return weightedTeams[weightedTeams.length - 1].team;
}

// ── Fix 1 helper — Nationality → league resolver (exported for externalSigningRouter) ──

/**
 * Resolve the home league for a nationality, using weighted distribution when available.
 * rng must be [0, 1). Exported so externalSigningRouter.ts can use the USA weights.
 */
export function resolveNationalityLeague(country: string, rng: number): string | null {
  const weighted = NATIONALITY_LEAGUE_WEIGHTS[country];
  if (weighted && weighted.length > 0) {
    const total = weighted.reduce((s, e) => s + e.weight, 0);
    let r = rng * total;
    for (const entry of weighted) {
      r -= entry.weight;
      if (r <= 0) return entry.league;
    }
    return weighted[weighted.length - 1].league;
  }
  return (NATIONALITY_LEAGUE_BIAS as Record<string, string>)[country] ?? null;
}

// ── Fix 2 — College tracking helpers ─────────────────────────────────────────

/**
 * Rebuild per-league college frequency map from the current player roster.
 * Called from enforceExternalMinRoster on game init and each rollover.
 */
export function initCollegeTracking(players: NBAPlayer[]): void {
  collegesByLeague = {};
  for (const p of players) {
    const league = (p as any).status ?? '';
    const college = (p as any).college ?? '';
    if (!league || !college) continue;
    if (!collegesByLeague[league]) collegesByLeague[league] = new Map();
    const cur = collegesByLeague[league].get(college) ?? 0;
    collegesByLeague[league].set(college, cur + 1);
  }
}

/**
 * Pick a college for a newly spawned player in a given league.
 * 70% from retirement outflow (preserve departing school identity), 30% from pool.
 * Returns '' when no data available — never 'Unknown'.
 */
export function pickCollegeForLeague(league: string, rng: number): string {
  const outflow = retireCollegeOutflow[league] ?? {};
  const outflowKeys = Object.keys(outflow);
  const pool = collegesByLeague[league];

  if (rng < 0.70 && outflowKeys.length > 0) {
    return pickWeighted(outflow) ?? '';
  }
  if (pool && pool.size > 0) {
    const obj: Record<string, number> = {};
    pool.forEach((count, college) => { obj[college] = count; });
    return pickWeighted(obj) ?? '';
  }
  return '';
}

// ── Fix 10 — Club-nationality affinity helper ─────────────────────────────────

const EUROPEAN_NATIONALITIES = new Set([
  'Spain', 'France', 'Germany', 'Italy', 'Serbia', 'Greece', 'Turkey', 'Russia',
  'Lithuania', 'Latvia', 'Estonia', 'Croatia', 'Slovenia', 'Bosnia', 'Montenegro',
  'North Macedonia', 'Bulgaria', 'Romania', 'Poland', 'Czech Republic', 'Slovakia',
  'Hungary', 'Austria', 'Switzerland', 'Netherlands', 'Belgium', 'Portugal',
  'Ukraine', 'Belarus', 'Georgia', 'Armenia', 'Israel', 'Sweden', 'Norway',
  'Denmark', 'Finland',
]);

const APAC_NATIONALITIES = new Set([
  'Japan', 'Australia', 'New Zealand', 'China', 'Philippines', 'South Korea',
  'Taiwan', 'Hong Kong', 'Indonesia', 'Malaysia', 'Vietnam', 'Thailand',
]);

/**
 * Returns the affinity weight for assigning a player of `playerCountry` to team `tid`.
 * domestic 3×, regional 1.5×, non-fit 0.5×.
 * Exported so T1 (spawnExternalPlayer) can call it when picking assignment teams.
 */
export function resolveClubAffinity(tid: number, playerCountry: string): number {
  const clubCountry = CLUB_NATIONALITY_MAP[tid];
  if (!clubCountry) return 1.0; // no mapping → neutral
  if (clubCountry === playerCountry) return 3.0;
  // Regional match: both European or both APAC
  const isEuroClub = EUROPEAN_NATIONALITIES.has(clubCountry);
  const isEuroPlayer = EUROPEAN_NATIONALITIES.has(playerCountry);
  if (isEuroClub && isEuroPlayer) return 1.5;
  const isApacClub = APAC_NATIONALITIES.has(clubCountry);
  const isApacPlayer = APAC_NATIONALITIES.has(playerCountry);
  if (isApacClub && isApacPlayer) return 1.5;
  return 0.5;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX #1 — External-league retirement pass
// ═══════════════════════════════════════════════════════════════════════════════

export function retireExternalLeaguePlayers(
  players: NBAPlayer[],
  year: number,
  stateDate: string,
): {
  players: NBAPlayer[];
  retirees: ExternalRetireeRecord[];
  historyEntries: ExternalHistoryEntry[];
} {
  const EXTERNAL_FOR_RETIRE = new Set([
    'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'PBA', 'B-League', 'G-League',
  ]);
  const retirees: ExternalRetireeRecord[] = [];
  const historyEntries: ExternalHistoryEntry[] = [];

  const updated = players.map(p => {
    const status = (p as any).status ?? '';
    if (!EXTERNAL_FOR_RETIRE.has(status)) return p;
    if ((p as any).diedYear) return p;

    const age = p.born?.year
      ? year - p.born.year
      : (typeof p.age === 'number' && p.age > 0 ? p.age : 0);
    const ovr = p.overallRating ?? 60;

    let prob = 0;
    if (status === 'G-League') {
      if (age >= 35) prob = 1.0;
      else if (age >= 32 && ovr < 45) prob = 0.50;
      else if (age >= 30 && ovr < 40) prob = 0.30;
    } else if (status === 'PBA') {
      // PBA is a craft/finesse league — late 30s is PRIME (LA Tenorio, Paul Lee,
      // June Mar Fajardo all played starter-quality into their 40s). Only true
      // wash-outs retire; anyone still producing stays on indefinitely.
      if (age >= 46) prob = 1.0;
      else if (age >= 43 && ovr < 40) prob = 0.30;
      else if (age >= 40 && ovr < 35) prob = 0.15;
    } else if (status === 'China CBA' || status === 'NBL Australia') {
      // Similar finesse-pro leagues — careers into early 40s realistic
      if (age >= 44) prob = 1.0;
      else if (age >= 41 && ovr < 42) prob = 0.30;
      else if (age >= 38 && ovr < 38) prob = 0.15;
    } else {
      // Euroleague, Endesa, B-League — higher athletic demand, slightly earlier churn
      if (age >= 42) prob = 1.0;
      else if (age >= 39 && ovr < 42) prob = 0.30;
      else if (age >= 36 && ovr < 38) prob = 0.15;
    }

    if (prob <= 0) return p;

    const roll = seededRandom(`retire_ext_${p.internalId}_${year}`);
    if (roll >= prob) return p;

    const careerGP = computeCareerGP(p);
    const country = p.born?.loc ?? (p as any).nationality ?? '';
    retirees.push({ player: { ...p } as NBAPlayer, league: status, country, careerGP });

    // Fix 2: track college outflow so replacements get league-appropriate schools
    const college = (p as any).college ?? '';
    if (college) {
      retireCollegeOutflow[status] = retireCollegeOutflow[status] ?? {};
      retireCollegeOutflow[status][college] = (retireCollegeOutflow[status][college] ?? 0) + 1;
    }

    historyEntries.push({
      text: `${p.name} retired from the ${status} after ${careerGP} career games.`,
      date: stateDate,
      type: 'Retirement',
      playerIds: [p.internalId],
    });

    console.log(`[ExternalRetire] ${p.name} (${country}, age ${age}, OVR ${ovr}, ${status}) → RETIRED`);

    return {
      ...p,
      status: 'Retired' as const,
      retiredYear: year,
      farewellTour: undefined,
      contract: undefined,
    } as any as NBAPlayer;
  });

  return { players: updated, retirees, historyEntries };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX #2 — Minimum 12 per team (safety net — runs at init + end of rollover)
// ═══════════════════════════════════════════════════════════════════════════════

export function enforceExternalMinRoster(
  state: GameState & { nonNBATeams?: any[] },
  year: number,
): { additions: NBAPlayer[] } {
  const EXTERNAL_LEAGUES = new Set([
    'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'PBA', 'B-League', 'G-League',
  ]);
  const MIN_ROSTER = 12;
  const MAX_ROSTER = 15;
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];

  // Fix 2: rebuild college frequency map from current roster
  initCollegeTracking(state.players);
  const additions: NBAPlayer[] = [];

  for (const team of nonNBATeams) {
    if (!EXTERNAL_LEAGUES.has(team.league)) continue;

    const currentCount =
      state.players.filter(p => p.tid === team.tid && (p as any).status !== 'Retired').length +
      additions.filter(p => p.tid === team.tid).length;

    const deficit = Math.min(MIN_ROSTER - currentCount, MAX_ROSTER - currentCount);
    if (deficit <= 0) continue;

    for (let i = 0; i < deficit; i++) {
      const rngBase = `safety_${team.tid}_${year}_${i}`;

      // Journeymen ages: 26:0.30, 27:0.25, 28:0.20, 29:0.15, 30:0.10
      const rngAge = seededRandom(rngBase + '_age');
      let targetAge = 30;
      const ageTable: [number, number][] = [[26, 0.30], [27, 0.55], [28, 0.75], [29, 0.90], [30, 1.00]];
      for (const [a, cumulative] of ageTable) {
        if (rngAge <= cumulative) { targetAge = a; break; }
      }

      // Nationality: sample from existing league players for bio realism
      const country = sampleTeamCountry(
        team.league,
        team,
        nonNBATeams,
        [...state.players, ...additions],
        seededRandom(rngBase + '_nat'),
      ) || (ADULT_DIRECT_NATIONALITY[team.league] ?? '');

      const player = spawnExternalPlayer({
        league: team.league,
        targetAge,
        year,
        rngBase,
        tid: team.tid,
        team,
        salaryCap,
        isYouth: false, // safety net always spawns adult journeymen
        country,
      });
      if (player) additions.push(player);
    }
  }

  if (additions.length > 0) {
    console.log(`[ExternalSustainer] enforceExternalMinRoster: +${additions.length} safety players`);
  }
  return { additions };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX #3 — Two-track repopulation (1:1 nationality matching)
// ═══════════════════════════════════════════════════════════════════════════════

export function repopulateExternalLeagues(
  state: GameState & { nonNBATeams?: any[] },
  retirees: ExternalRetireeRecord[],
  year: number,
  nextYear: number,
): { additions: NBAPlayer[] } {
  const EXTERNAL_LEAGUES = new Set([
    'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'PBA', 'B-League', 'G-League',
  ]);
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];
  const additions: NBAPlayer[] = [];

  // ── Build outflow per league × country ─────────────────────────────────────
  // outflow[league][country] = count of players who left
  const outflow: Record<string, Record<string, number>> = {};

  // Retirees — already have country from retireExternalLeaguePlayers
  for (const r of retirees) {
    if (!EXTERNAL_LEAGUES.has(r.league)) continue;
    const country = r.country || sampleLeagueCountry(r.league, nonNBATeams, state.players, 0.5);
    outflow[r.league] = outflow[r.league] ?? {};
    outflow[r.league][country] = (outflow[r.league][country] ?? 0) + 1;
  }

  // 19y auto-declarers this rollover: born.year === year - 18 (turned 19 at this rollover)
  const declarers = state.players.filter(p =>
    p.tid === -2 &&
    (p as any).status === 'Draft Prospect' &&
    ((p as any).draft?.year ?? 0) === nextYear &&
    ((p.born?.year ?? 0) === year - 18),
  );
  for (const d of declarers) {
    const country = d.born?.loc ?? (d as any).nationality ?? '';
    const homeLeague = resolveNationalityLeague(country, 0.5);
    if (homeLeague && EXTERNAL_LEAGUES.has(homeLeague)) {
      outflow[homeLeague] = outflow[homeLeague] ?? {};
      outflow[homeLeague][country] = (outflow[homeLeague][country] ?? 0) + 1;
    }
  }

  // ── Spawn replacements 1:1 by league × country ─────────────────────────────
  let spawnIdx = 0;
  for (const [league, countryMap] of Object.entries(outflow)) {
    const leagueTeams = nonNBATeams.filter(t => t.league === league);
    if (leagueTeams.length === 0) continue;
    const isYouth = WITH_YOUTH_LEAGUES.has(league);

    for (const [country, count] of Object.entries(countryMap)) {
      for (let i = 0; i < count; i++) {
        const rngBase = `repop_${league.replace(/[\s-]/g, '')}_${year}_${spawnIdx++}`;

        if (isYouth) {
          // Track A: spawn 15-18yo at a youth-club team
          const rngAge = seededRandom(rngBase + '_yage');
          const youthAge = rngAge < 0.25 ? 15 : rngAge < 0.55 ? 16 : rngAge < 0.80 ? 17 : 18;

          const team = pickTeamForGeneratedPlayer(leagueTeams, state.players, additions, country, rngBase + '_team');
          if (!team) continue;
          const spawnCountry = sampleTeamCountry(
            league,
            team,
            nonNBATeams,
            [...state.players, ...additions],
            seededRandom(rngBase + '_spawn_nat'),
          ) || country;

          const player = spawnExternalPlayer({ league, targetAge: youthAge, year, rngBase, tid: team.tid, team, salaryCap, isYouth: true, country: spawnCountry });
          if (player) additions.push(player);
        } else {
          // Track B: adult-direct (PBA, China CBA) — 22-26yo
          const rngAge = seededRandom(rngBase + '_aage');
          const adultAge = rngAge < 0.30 ? 22 : rngAge < 0.55 ? 23 : rngAge < 0.75 ? 24 : rngAge < 0.90 ? 25 : 26;

          const team = pickTeamForGeneratedPlayer(leagueTeams, state.players, additions, country, rngBase + '_team');
          if (!team) continue;
          const spawnCountry = sampleTeamCountry(
            league,
            team,
            nonNBATeams,
            [...state.players, ...additions],
            seededRandom(rngBase + '_spawn_nat'),
          ) || country;

          const player = spawnExternalPlayer({ league, targetAge: adultAge, year, rngBase, tid: team.tid, team, salaryCap, isYouth: false, country: spawnCountry });
          if (player) additions.push(player);
        }
      }
    }
  }

  if (additions.length > 0) {
    const summary = Object.entries(outflow).map(([l, cm]) =>
      `${l}:${Object.values(cm).reduce((a, b) => a + b, 0)}`).join(', ');
    console.log(`[ExternalSustainer] repopulate: +${additions.length} players (${summary})`);
  }

  return { additions };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX #3b — Undrafted-returns-home (call after autoRunDraft)
// ═══════════════════════════════════════════════════════════════════════════════

export function returnUndraftedToHomeLeague(
  players: NBAPlayer[],
  draftYear: number,
  state: GameState & { nonNBATeams?: any[] },
): { players: NBAPlayer[]; historyEntries: ExternalHistoryEntry[] } {
  const EXTERNAL_LEAGUES = new Set([
    'Euroleague', 'Endesa', 'China CBA', 'NBL Australia', 'PBA', 'B-League', 'G-League',
  ]);
  const DOMESTIC = new Set(['USA', 'Canada', '']);
  const nonNBATeams: any[] = (state as any).nonNBATeams ?? [];
  const salaryCap = state.leagueStats?.salaryCap ?? 154_600_000;
  const historyEntries: ExternalHistoryEntry[] = [];

  const updated = players.map(p => {
    if (p.tid !== -1 || (p as any).status !== 'Free Agent') return p;
    const draft = (p as any).draft ?? {};
    if (draft.year !== draftYear || draft.round !== 0) return p;

    const country = p.born?.loc ?? '';
    if (DOMESTIC.has(country)) return p;

    const homeLeague = resolveNationalityLeague(country, seededRandom(`undrafted_${p.internalId}_rng`));
    if (!homeLeague || !EXTERNAL_LEAGUES.has(homeLeague)) return p;

    const leagueTeams = nonNBATeams.filter(t => t.league === homeLeague);
    if (leagueTeams.length === 0) return p;

    const team = pickUnderRosteredTeam(leagueTeams, players);
    if (!team) return p;

    const scale = EXTERNAL_SALARY_SCALE[homeLeague] ?? { minPct: 0.001, maxPct: 0.005 };
    const salaryUSD = Math.round(salaryCap * (scale.minPct * 1.5));

    historyEntries.push({
      text: `${p.name} returned to the ${homeLeague} after going undrafted in the ${draftYear} NBA Draft.`,
      date: state.date ?? `Jun 30, ${draftYear}`,
      type: 'Draft',
      playerIds: [p.internalId],
    });

    return {
      ...p,
      tid: team.tid,
      status: homeLeague as NBAPlayer['status'],
      contract: {
        amount: Math.round(salaryUSD / 1_000),
        exp: draftYear + 1,
      },
    };
  });

  if (historyEntries.length > 0) {
    console.log(`[ExternalSustainer] returnUndrafted: ${historyEntries.length} players returned home from ${draftYear} draft`);
  }

  return { players: updated, historyEntries };
}
