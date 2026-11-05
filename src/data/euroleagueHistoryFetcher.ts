// Fetches cutoff-safe historical season data for supported European competitions.

import { readJsonResponse } from '../services/utils/jsonResponse';
import { seasonLabelToEndYear } from '../utils/historicalTimeline';
import { competitionAwardTypeFamily } from './competitionAwardTypes';
import {
  hasEuropeanCupHistorySource,
  normalizeDomesticCompetitionHistory,
  normalizeEuropeanCupHistory,
} from './euroDomesticHistoryAdapters';
import {
  fetchInternalCompetitionHistory,
  fetchInternalLeagueFileHistory,
  hasInternalCompetitionHistory,
  hasInternalLeagueFileHistory,
  type InternalLeagueFileHistoryKey,
} from './internalCompetitionHistory';

const HISTORY_SOURCE_ROOT = '/data/historical/competition-sources';
const EUROPE_CUPS_URL = `${HISTORY_SOURCE_ROOT}/european-cups.json`;
const VTB_HISTORY_URL = `${HISTORY_SOURCE_ROOT}/vtb-united-league.json`;
const ADRIATIC_HISTORY_URL = `${HISTORY_SOURCE_ROOT}/adriatic-league.json`;
const ITALIAN_CHAMPIONS_URL = `${HISTORY_SOURCE_ROOT}/italian-champions.json`;

const URLS = {
  euroleague: `${HISTORY_SOURCE_ROOT}/euroleague.json`,
  eurocup: `${HISTORY_SOURCE_ROOT}/eurocup.json`,
  endesa: `${HISTORY_SOURCE_ROOT}/endesa.json`,
  'french-jeep-elite': `${HISTORY_SOURCE_ROOT}/french-jeep-elite.json`,
  'greek-heba-a1': `${HISTORY_SOURCE_ROOT}/greek-heba-a1.json`,
  'german-bbl': `${HISTORY_SOURCE_ROOT}/german-bbl.json`,
  'lithuanian-lkl': `${HISTORY_SOURCE_ROOT}/lithuanian-lkl.json`,
  'italian-serie-a': `${HISTORY_SOURCE_ROOT}/italian-serie-a.json`,
  'turkish-bsl': `${HISTORY_SOURCE_ROOT}/turkish-bsl.json`,
  'vtb-united-league': VTB_HISTORY_URL,
  'adriatic-league': ADRIATIC_HISTORY_URL,
  'copa-del-rey': EUROPE_CUPS_URL,
  supercopa: EUROPE_CUPS_URL,
  'france-leaders-cup': EUROPE_CUPS_URL,
  'coppa-italia': EUROPE_CUPS_URL,
  'supercoppa-italiana': EUROPE_CUPS_URL,
  'greek-super-cup': EUROPE_CUPS_URL,
  'turkish-cup': EUROPE_CUPS_URL,
  'presidential-cup': EUROPE_CUPS_URL,
  'king-mindaugas-cup': EUROPE_CUPS_URL,
  'vtb-supercup': VTB_HISTORY_URL,
  'aba-supercup': ADRIATIC_HISTORY_URL,
} as const;

type DetailedCompetitionHistoryId = keyof typeof URLS;
export type CompetitionGistId = DetailedCompetitionHistoryId | InternalLeagueFileHistoryKey;
export type GameHandledCompetitionHistoryId = CompetitionGistId;

function hasDetailedCompetitionHistorySource(id: string): id is DetailedCompetitionHistoryId {
  return Object.prototype.hasOwnProperty.call(URLS, id);
}

export function hasCompetitionHistorySource(id: string): id is CompetitionGistId {
  return hasDetailedCompetitionHistorySource(id) || hasInternalLeagueFileHistory(id);
}

export function hasGameHandledCompetitionHistorySource(id: string): id is GameHandledCompetitionHistoryId {
  return hasCompetitionHistorySource(id);
}

export function competitionSeasonEndYear(season: CompetitionSeason | string | undefined): number | undefined {
  const label = typeof season === 'string' ? season : season?.Season ?? (season as any)?.season;
  return seasonLabelToEndYear(label);
}

export interface CompetitionSeason {
  // Identification
  Season_Title?: string;
  Wikipedia_URL?: string;
  League?: string;
  Season?: string;            // "2024–25" (en-dash)
  Sport?: string;
  Duration?: string;
  Dates?: string;

  // Format
  Games?: string;
  Games_played?: string;
  Matches_played?: string;
  Teams?: string;

  // Standings
  Top_seed?: string;
  Relegated?: string;          // Endesa only

  // Awards
  Season_MVP?: string;
  Regular_Season_MVP?: string;
  Finals_MVP?: string;
  Final_Four_MVP?: string;     // EL only
  Playoffs_MVP?: string;       // EL only
  Playin_MVP?: string;         // EL only
  Top_16_MVP?: string;         // EL legacy
  Alphonso_Ford_Trophy?: string; // EL only
  Best_Defender?: string;      // EL only
  Best_Sixth_Man?: string;
  Most_Improved_Player?: string;
  Most_Spectacular_Player?: string;
  Most_Popular_Player?: string;
  Best_Offensive_Player?: string;
  Most_Effective_Player?: string;
  Best_Young_Player?: string;  // Endesa only
  Best_Coach?: string;         // Endesa only
  Rising_Star?: string;
  Coach_of_the_Year?: string;  // EL only

  // Outcome
  Champions?: string;
  Season_champions?: string;   // Endesa legacy
  Runnersup?: string;
  Third_place?: string;        // EL only
  Fourth_place?: string;       // EL only
  Semifinalists?: string;

  // Stat leaders
  Top_scorer?: string;
  Points?: string;
  Rebounds?: string;
  Assists?: string;
  Steals?: string;
  Blocks?: string;
  Index_Rating?: string;

  // Highlights
  Biggest_home_win?: string;
  Biggest_away_win?: string;
  Highest_scoring?: string;
  Winning_streak?: string;
  Losing_streak?: string;
  Highest_attendance?: string;
  Lowest_attendance?: string;
  Attendance?: string;
  Average_attendance?: string;
  TV_partner?: string;
  TV_partners?: string;
  Note?: string;
  Awards?: CompetitionHistoryAward[];
  All_League_Teams?: CompetitionAllLeagueTeam[];
}

export interface CompetitionHistoryAward {
  type: string;
  name: string;
  team?: string;
  nationality?: string;
  role?: 'player' | 'coach' | 'executive';
  statLine?: string;
  sourceKey?: string;
}

export interface CompetitionAllLeagueTeam {
  name: string;
  players: Array<{
    name: string;
    team?: string;
    nationality?: string;
  }>;
}

const cache: Partial<Record<CompetitionGistId, CompetitionSeason[]>> = {};
const inflight: Partial<Record<CompetitionGistId, Promise<CompetitionSeason[]>>> = {};
const rawCache = new Map<string, unknown>();
const rawInflight = new Map<string, Promise<unknown>>();

async function fetchRawHistory(url: string, label: string): Promise<unknown> {
  if (rawCache.has(url)) return rawCache.get(url);
  const active = rawInflight.get(url);
  if (active) return active;
  const request = fetch(url)
    .then(response => readJsonResponse<unknown>(response, label))
    .then(raw => {
      rawCache.set(url, raw);
      rawInflight.delete(url);
      return raw;
    })
    .catch(error => {
      rawInflight.delete(url);
      throw error;
    });
  rawInflight.set(url, request);
  return request;
}

export async function fetchCompetitionHistory(id: CompetitionGistId): Promise<CompetitionSeason[]> {
  const c = cache[id];
  if (c) return c;
  const f = inflight[id];
  if (f) return f;
  if (!hasDetailedCompetitionHistorySource(id)) {
    const primary = hasInternalCompetitionHistory(id)
      ? fetchInternalCompetitionHistory(id)
      : Promise.resolve([] as CompetitionSeason[]);
    const request = Promise.allSettled([fetchInternalLeagueFileHistory(id), primary])
      .then(([leagueFile, revisioned]) => {
        const baseline = leagueFile.status === 'fulfilled' ? leagueFile.value : [];
        const authoritative = revisioned.status === 'fulfilled' ? revisioned.value : [];
        if (baseline.length === 0 && authoritative.length === 0) {
          throw leagueFile.status === 'rejected' ? leagueFile.reason : new Error(`${id} competition history could not be loaded.`);
        }
        const rows = mergeCompetitionHistoryRows(baseline, authoritative, id);
        cache[id] = rows;
        delete inflight[id];
        return rows;
      })
      .catch(error => {
        delete inflight[id];
        throw error;
      });
    inflight[id] = request;
    return request;
  }
  if (id === 'euroleague' || id === 'eurocup') {
    const request = Promise.allSettled([
      fetchInternalCompetitionHistory(id),
      fetchRawHistory(URLS[id], `${id} competition history`),
    ]).then(([internal, external]) => {
      const externalRows = external.status === 'fulfilled'
        ? id === 'euroleague'
          ? (Array.isArray(external.value) ? external.value as CompetitionSeason[] : [])
          : normalizeEuropeanCupHistory(id, external.value)
        : [];
      const internalRows = internal.status === 'fulfilled' ? internal.value : [];
      if (externalRows.length === 0 && internalRows.length === 0) throw new Error(`${id} competition history could not be loaded.`);
      const rows = inferMissingSeasons(mergeCompetitionHistoryRows(externalRows, internalRows, id));
      cache[id] = rows;
      delete inflight[id];
      return rows;
    }).catch(error => {
      delete inflight[id];
      throw error;
    });
    inflight[id] = request;
    return request;
  }
  const source = id === 'italian-serie-a'
    ? Promise.all([
        fetchRawHistory(URLS[id], `${id} awards history`),
        fetchRawHistory(ITALIAN_CHAMPIONS_URL, `${id} championship history`),
      ]).then(([awards, championships]) => ({
        ...(awards && typeof awards === 'object' && !Array.isArray(awards) ? awards : {}),
        ...(championships && typeof championships === 'object' && !Array.isArray(championships) ? championships : {}),
      }))
    : fetchRawHistory(URLS[id], `${id} competition history`);
  const internal = hasInternalLeagueFileHistory(id)
    ? fetchInternalLeagueFileHistory(id)
    : Promise.resolve([] as CompetitionSeason[]);
  const p = Promise.allSettled([source, internal])
    .then(([detailed, baseline]) => {
      const detailedRows = detailed.status === 'fulfilled'
        ? hasEuropeanCupHistorySource(id)
          ? normalizeEuropeanCupHistory(id, detailed.value)
          : normalizeDomesticCompetitionHistory(id, detailed.value)
        : [];
      const baselineRows = baseline.status === 'fulfilled' ? baseline.value : [];
      if (detailedRows.length === 0 && baselineRows.length === 0) {
        throw detailed.status === 'rejected' ? detailed.reason : new Error(`${id} competition history could not be loaded.`);
      }
      const data = inferMissingSeasons(mergeCompetitionHistoryRows(baselineRows, detailedRows, id));
      cache[id] = data;
      delete inflight[id];
      return data;
    })
    .catch(err => {
      delete inflight[id];
      throw err;
    });
  inflight[id] = p;
  return p;
}

export async function fetchGameHandledCompetitionHistory(
  id: GameHandledCompetitionHistoryId,
): Promise<CompetitionSeason[]> {
  return fetchCompetitionHistory(id);
}

const awardSemanticKey = (competitionId: string, award: CompetitionHistoryAward): string => [
  competitionAwardTypeFamily(competitionId, award.type),
  award.role ?? '',
].join('|');

function mergeCompetitionHistoryRows(
  externalRows: CompetitionSeason[],
  internalRows: CompetitionSeason[],
  competitionId: string,
): CompetitionSeason[] {
  const bySeason = new Map<number, CompetitionSeason>();
  for (const row of externalRows) {
    const season = competitionSeasonEndYear(row);
    if (season) bySeason.set(season, row);
  }
  for (const row of internalRows) {
    const season = competitionSeasonEndYear(row);
    if (!season) continue;
    const existing = bySeason.get(season);
    const authoritativeAwards = row.Awards ?? [];
    const authoritativeKeys = new Set(authoritativeAwards.map(award => awardSemanticKey(competitionId, award)));
    const awards = [
      ...authoritativeAwards,
      ...(existing?.Awards ?? []).filter(award => !authoritativeKeys.has(awardSemanticKey(competitionId, award))),
    ];
    const seen = new Set<string>();
    bySeason.set(season, {
      ...existing,
      ...row,
      Awards: awards.filter(award => {
        const key = `${award.type.toLowerCase()}|${award.name.toLowerCase()}|${award.team?.toLowerCase() ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      All_League_Teams: row.All_League_Teams?.length ? row.All_League_Teams : existing?.All_League_Teams,
    });
  }
  return [...bySeason.values()].sort((left, right) => (
    (competitionSeasonEndYear(right) ?? 0) - (competitionSeasonEndYear(left) ?? 0)
  ));
}

// ── Backwards-compat alias (some places already imported this name) ──────────
export const fetchEuroleagueHistory = () => fetchCompetitionHistory('euroleague');
export type EuroleagueSeason = CompetitionSeason;

// ── Season-string normalization ──────────────────────────────────────────────

/**
 * Format a starting year as a season string. Uses 4-digit suffix at century
 * boundaries (1999 → "1999–2000") and 2-digit suffix elsewhere (2005 → "2005–06").
 * Always uses an en-dash to match the dominant gist convention.
 */
function formatSeason(startYear: number): string {
  const next = startYear + 1;
  const suffix = next % 100 === 0 ? String(next) : String(next).slice(-2).padStart(2, '0');
  return `${startYear}–${suffix}`;
}

/**
 * Some gist entries have `Season: undefined` (e.g. EL 2006-07, 2003-04, 1995-96).
 * The array is ordered newest-first and mostly contiguous, so we anchor on the
 * first valid Season string and decrement by index offset to fill the blanks.
 */
function inferMissingSeasons(arr: CompetitionSeason[]): CompetitionSeason[] {
  if (arr.length === 0) return arr;
  const anchorIdx = arr.findIndex(s => s.Season && /\d{4}/.test(s.Season));
  if (anchorIdx < 0) return arr;
  const anchorYear = parseInt(arr[anchorIdx].Season!.match(/\d{4}/)![0], 10);

  return arr.map((s, i) => {
    if (s.Season) return s;
    const startYear = anchorYear - (i - anchorIdx);
    return { ...s, Season: formatSeason(startYear) };
  });
}

// ── Cleaning helpers ─────────────────────────────────────────────────────────

/**
 * Strip ranking decorations from a champion name.
 * EL gist:    "Real Madrid (11th title)" → "Real Madrid"
 * Endesa gist:"Real Madrid16th ACB title38th Spanish title" → "Real Madrid"
 */
export function cleanChampionName(raw: string | undefined): string {
  if (!raw) return '';
  let s = raw;
  // EL pattern: "(11th title)" / "(2nd title)"
  s = s.replace(/\s*\([^)]*\)\s*$/, '');
  // Endesa pattern: titles are concatenated directly after the club name.
  s = s.replace(/\d+(?:st|nd|rd|th)\s+(?:ACB|Spanish)\s+title.*$/i, '');
  return s.trim();
}

/** Strip the parenthetical team-affiliation tail e.g. "Joe Arlauckas (Real Madrid)" → "Joe Arlauckas". */
export function cleanPlayerName(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Trophy-cabinet crosslookup: returns counts of championships, runner-ups
 * and Final Four / Semifinalist appearances for a given club name across
 * BOTH Euroleague and Endesa gists. Matches by case-insensitive substring,
 * tolerant to "Real Madrid", "Regal FC Barcelona" → "Barcelona", etc.
 */
export interface TrophyCabinet {
  euroleague: { titles: number; runnerUps: number; finalFours: number };
  endesa:     { titles: number; runnerUps: number; semis: number };
  loaded: boolean;
}

const matchesClub = (raw: string | undefined, clubName: string): boolean => {
  if (!raw || !clubName) return false;
  const r = raw.toLowerCase();
  const tokens = clubName.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  // Match if at least one distinctive token (>3 chars) appears in the raw string.
  return tokens.some(t => r.includes(t));
};

export async function getTrophyCabinet(clubName: string, maxSeason = Infinity): Promise<TrophyCabinet> {
  const empty: TrophyCabinet = {
    euroleague: { titles: 0, runnerUps: 0, finalFours: 0 },
    endesa:     { titles: 0, runnerUps: 0, semis: 0 },
    loaded: true,
  };
  if (!clubName) return empty;
  try {
    const [el, en] = await Promise.all([
      fetchCompetitionHistory('euroleague'),
      fetchCompetitionHistory('endesa'),
    ]);
    el.filter(s => (competitionSeasonEndYear(s) ?? Infinity) <= maxSeason).forEach(s => {
      if (matchesClub(s.Champions, clubName)) empty.euroleague.titles++;
      if (matchesClub(s.Runnersup, clubName)) empty.euroleague.runnerUps++;
      if (matchesClub(s.Third_place, clubName) || matchesClub(s.Fourth_place, clubName)) empty.euroleague.finalFours++;
    });
    en.filter(s => (competitionSeasonEndYear(s) ?? Infinity) <= maxSeason).forEach(s => {
      if (matchesClub(s.Champions, clubName) || matchesClub(s.Season_champions, clubName)) empty.endesa.titles++;
      if (matchesClub(s.Runnersup, clubName)) empty.endesa.runnerUps++;
      if (matchesClub(s.Semifinalists, clubName)) empty.endesa.semis++;
    });
    return empty;
  } catch {
    return { ...empty, loaded: false };
  }
}
