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

import type { NBAPlayer, GameState } from '../../types';
import {
  EXTERNAL_SALARY_SCALE, NATIONALITY_LEAGUE_BIAS, NATIONALITY_LEAGUE_WEIGHTS, CLUB_NATIONALITY_MAP,
  LEAGUE_HEIGHT_CEILING, COUNTRY_HEIGHT_MULT, YOUTH_EXTERNAL_OVR_CAP,
} from '../../constants';
import type { LeagueWeightEntry } from '../../constants';
import { getNameData } from '../../data/nameDataFetcher';
import { generateDraftClassForGame, pickWeighted } from '../genDraftPlayers';
import { EUROLEAGUE_TEAMS, getRaceFrequencies } from '../../genplayersconstants';
import { getNewgenPortraitUrl } from '../../utils/newgenPortrait';

// ── Seeded RNG — same convention as retirementChecker.ts ─────────────────────
export const GENERATED_EXTERNAL_OVR_NERF = 8;
export const GENERATED_EXTERNAL_VERSION = 5;
export const GENERATED_EXTERNAL_SCALE_ATTRS = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'] as const;

export function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

export function pickGeneratedExternalDraftYear(targetAge: number, bornYear: number, year: number, seed: string): number {
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

export function getGeneratedExternalOvrCap(league: string, age: number): number {
  const adultCap: Record<string, number> = {
    Euroleague: 46,
    Endesa: 44,
    'NBL Australia': 42,
    'China CBA': 41,
    'B-League': 40,
    PBA: 39,
    'G-League': 38,
    WNBA: 44,
  };
  const youthCap: Record<string, number> = {
    Euroleague: 40,
    Endesa: 39,
    'NBL Australia': 38,
    'China CBA': 37,
    'B-League': 36,
    PBA: 35,
    'G-League': 35,
    WNBA: 38,
  };
  return age < 19 ? (youthCap[league] ?? 38) : (adultCap[league] ?? 40);
}

/** Leagues that use female face/name pools. */
const WOMENS_LEAGUES = new Set(['WNBA']);
export function genderForLeague(league: string): 'male' | 'female' {
  return WOMENS_LEAGUES.has(league) ? 'female' : 'male';
}

// Newgen face pack is Euro-feature-leaning. Skip Asian-population leagues —
// those facial features aren't represented in the pack.
export const NEWGEN_SKIP_LEAGUES = new Set(['B-League', 'China CBA', 'PBA']);

export function getClubCountry(tid: number | undefined): string | undefined {
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
export const WITH_YOUTH_LEAGUES = new Set(['Euroleague', 'Endesa', 'NBL Australia', 'B-League']);
// WNBA: adult-direct (NCAA pipeline, not youth academies). Track B in repopulate.
const ADULT_DIRECT_LEAGUES = new Set(['PBA', 'China CBA', 'WNBA']);

// BBGM raw OVR ceiling per league (most players land 45–58, rare hit cap)
// Kept in lockstep with constants.ts EXTERNAL_LEAGUE_OVR_CAP.
export const LEAGUE_OVR_CAP: Record<string, number> = {
  Euroleague:      58,
  Endesa:          55,
  'NBL Australia': 52,
  'China CBA':     50,
  'B-League':      48,
  PBA:             46,
  'G-League':      45,
  WNBA:            54,
};

// Default nationality for adult-direct leagues
export const ADULT_DIRECT_NATIONALITY: Record<string, string> = {
  PBA:         'Philippines',
  'China CBA': 'China',
  WNBA:        'USA',
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

export function pickNationalFeederAffiliation(country: string, team: any, seed: string): string | null {
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

// ── Country synonym / legacy map (Fix 1) ─────────────────────────────────────

const COUNTRY_SYNONYMS: Record<string, string> = {
  'United States': 'USA',
  'United-Kingdom': 'United Kingdom',
  'Serbia-Montenegro': 'Serbia',
  Yugoslavia: 'Serbia',
  UAE: 'Egypt',
  'United Arab Emirates': 'Egypt',
  'DR Congo': 'Congo',
  DRC: 'Congo',
  'Democratic Republic of the Congo': 'Congo',
  'Republic of Congo': 'Congo',
  'Côte d\'Ivoire': 'Ivory Coast',
  Czech_Republic: 'Czech Republic',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const US_STATE_OR_CITY_LOCATIONS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida',
  'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
  'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska',
  'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas',
  'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  'Tuscaloosa', 'Federal Way', 'Minnetonka',
]);

function extractCountryToken(raw?: string): string {
  if (!raw) return '';
  if (raw.includes(' - Country: ')) return raw.split(' - Country: ').pop()?.trim() ?? '';
  if (raw.includes(',')) return raw.split(',').pop()?.trim() ?? '';
  return raw.trim();
}

function normalizeCountryToken(raw?: string): string {
  const token = extractCountryToken(raw);
  if (!token || US_STATE_OR_CITY_LOCATIONS.has(token)) return '';
  return COUNTRY_SYNONYMS[token] ?? token;
}

function isNameDataCountry(country: string): boolean {
  if (!country) return false;
  const nameData = getNameData();
  const canonical = COUNTRY_SYNONYMS[country] ?? country;
  return !!(
    nameData.countries[canonical]?.first ||
    nameData.countries[canonical.replace(/ /g, '_')]?.first ||
    COUNTRY_NAME_FALLBACK[canonical] ||
    COUNTRY_NAME_FALLBACK[canonical.replace(/ /g, '_')]
  );
}

export function getPlayerCountry(player: NBAPlayer): string {
  const born = (player as any).born ?? {};
  const candidates = [born.country, (player as any).nationality, born.loc];
  for (const raw of candidates) {
    const country = normalizeCountryToken(raw);
    if (isNameDataCountry(country)) return country;
  }
  return '';
}

export function computeCareerGP(player: NBAPlayer): number {
  return (player.stats ?? [])
    .filter((s: any) => !s.playoffs)
    .reduce((sum: number, s: any) => sum + (s.gp ?? 0), 0);
}

/**
 * Resolve name pool for a country.
 * Handles dual-citizenship strings, synonyms, legacy country names, and
 * regional fallbacks — warns once per missing country, never silently uses USA.
 */
export function resolveNamePool(country: string, nameData: ReturnType<typeof getNameData>): { first: Record<string, number>; last: Record<string, number> } | null {
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

