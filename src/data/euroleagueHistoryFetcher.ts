// Fetches historical season data for international basketball competitions
// (Euroleague 1995-96 → 2024-25, Liga Endesa 2010-11 → 2024-25) from the
// nba-store-data gist. Module-level cache so repeated mounts don't re-hit
// the network. Used by CompetitionHistoryView for Aside "History" sub-view
// and by TeamHistoryView for trophy-cabinet crosslookups.

const URLS: Record<CompetitionGistId, string> = {
  euroleague: 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/euroleaguehistoryfull',
  endesa:     'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/ligaendesahistory',
};

export type CompetitionGistId = 'euroleague' | 'endesa';

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
}

const cache: Partial<Record<CompetitionGistId, CompetitionSeason[]>> = {};
const inflight: Partial<Record<CompetitionGistId, Promise<CompetitionSeason[]>>> = {};

export async function fetchCompetitionHistory(id: CompetitionGistId): Promise<CompetitionSeason[]> {
  const c = cache[id];
  if (c) return c;
  const f = inflight[id];
  if (f) return f;
  const p = fetch(URLS[id])
    .then(r => {
      if (!r.ok) throw new Error(`History fetch failed (${id}): ${r.status}`);
      return r.json();
    })
    .then((arr: CompetitionSeason[]) => {
      const raw = Array.isArray(arr) ? arr : [];
      const data = inferMissingSeasons(raw);
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
  // Endesa pattern: a digit run with no preceding space — chop everything
  // from the first digit onwards (titles concatenated like "16th ACB...").
  s = s.replace(/(\d).*/s, '');
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

export async function getTrophyCabinet(clubName: string): Promise<TrophyCabinet> {
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
    el.forEach(s => {
      if (matchesClub(s.Champions, clubName)) empty.euroleague.titles++;
      if (matchesClub(s.Runnersup, clubName)) empty.euroleague.runnerUps++;
      if (matchesClub(s.Third_place, clubName) || matchesClub(s.Fourth_place, clubName)) empty.euroleague.finalFours++;
    });
    en.forEach(s => {
      if (matchesClub(s.Champions, clubName) || matchesClub(s.Season_champions, clubName)) empty.endesa.titles++;
      if (matchesClub(s.Runnersup, clubName)) empty.endesa.runnerUps++;
      if (matchesClub(s.Semifinalists, clubName)) empty.endesa.semis++;
    });
    return empty;
  } catch {
    return { ...empty, loaded: false };
  }
}
