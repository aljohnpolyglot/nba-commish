/**
 * wikiHistoryFetcher  (src/data/brefFetcher.ts)
 *
 * Fetches NBA season history from the aljohnpolyglot/nba-store-data GitHub repo.
 * Replaces the old Cloudflare-proxied Basketball-Reference scraper.
 * Same exported interface so all existing imports keep working with zero changes.
 *
 * Source URL: https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/wikipedianbahistory
 * Format: JSON array of 79 seasons (1946–47 → 2024–25), newest first.
 */

import { readJsonResponse } from '../services/utils/jsonResponse';
import { seasonLabelToEndYear } from '../utils/historicalTimeline';
import { fetchWorkerNbaSeasonHistory } from './basketballDataWorkerHistory';

const WIKI_URL =
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/wikipedianbahistory';

// ─────────────────────────────────────────────────────────────────────────────
// Types  (kept identical to old brefFetcher so nothing breaks)
// ─────────────────────────────────────────────────────────────────────────────

export interface BRefAwardEntry {
  name: string;
  team: string;
  statLine?: string;
}

export interface BRefTeamRecord {
  conference: string;
  name: string;
  wins: number;
  losses: number;
}

export interface BRefAllTeam {
  teamName: string;
  players: { name: string; team: string }[];
}

export interface BRefNamedAward {
  awardName: string;
  recipients: BRefAwardEntry[];
}

export interface BRefSeasonData {
  year: number;
  champion?: BRefAwardEntry;
  runnerUp?: BRefAwardEntry;           // bonus — not in old interface but useful
  finalsMvp?: BRefAwardEntry;
  semifinalsMvps: BRefAwardEntry[];    // not in Wikipedia data — always []
  mvp?: BRefAwardEntry;
  dpoy?: BRefAwardEntry;
  smoy?: BRefAwardEntry;
  clutch?: BRefAwardEntry;
  mip?: BRefAwardEntry;
  roy?: BRefAwardEntry;
  coy?: BRefAwardEntry;
  bestRecords: BRefTeamRecord[];
  teamRecords?: BRefTeamRecord[];
  allNBA: BRefAllTeam[];
  allDefensive: BRefAllTeam[];
  allRookie: BRefAllTeam[];
  otherAwards: BRefNamedAward[];
  allStars: { name: string; team: string; conference: string }[];  // not in Wikipedia data — always []
}

// ─────────────────────────────────────────────────────────────────────────────
// Franchise merge map — historical team names → current franchise nickname
// Used when matching Wikipedia champion/runnerUp names to state.teams
// ─────────────────────────────────────────────────────────────────────────────

export const FRANCHISE_MERGE: Record<string, string> = {
  // Lakers
  'minneapolis lakers': 'lakers',
  // Thunder (Seattle SuperSonics)
  'seattle supersonics': 'thunder',
  'seattle super sonics': 'thunder',
  // Wizards (Bullets era)
  'baltimore bullets': 'wizards',
  'capital bullets': 'wizards',
  'washington bullets': 'wizards',
  'chicago packers': 'wizards',
  'chicago zephyrs': 'wizards',
  // 76ers
  'syracuse nationals': '76ers',
  'philadelphia warriors': 'warriors',
  // Kings (Rochester/Cincinnati/KC)
  'rochester royals': 'kings',
  'cincinnati royals': 'kings',
  'kansas city-omaha kings': 'kings',
  'kansas city kings': 'kings',
  // Clippers
  'buffalo braves': 'clippers',
  'san diego clippers': 'clippers',
  // Nets
  'new jersey nets': 'nets',
  'new york nets': 'nets',
  // Grizzlies
  'vancouver grizzlies': 'grizzlies',
  // Thunder / SuperSonics II
  'oklahoma city thunder': 'thunder',
  // Pelicans
  'new orleans hornets': 'pelicans',
  'new orleans/oklahoma city hornets': 'pelicans',
  // Raptors (relocations)
  // Pistons
  'fort wayne pistons': 'pistons',
  // Hawks
  'tri-cities blackhawks': 'hawks',
  'milwaukee hawks': 'hawks',
  'st. louis hawks': 'hawks',
  // Rockets
  'san diego rockets': 'rockets',
  // Warriors
  'san francisco warriors': 'warriors',
  // Jazz
  'new orleans jazz': 'jazz',
  // Spurs
  'dallas chaparrals': 'spurs',
  // Cavaliers (no rename)
};

export function cleanWikiTeamName(value: unknown): string {
  return String(value ?? '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*(?:title|appearance|seed|record|champion|finals|playoffs)[^)]*\)/gi, '')
    .replace(/\(\s*\d+(?:st|nd|rd|th)?\s*\)/gi, '')
    .replace(/[†*‡]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalizeClubMatchName = (value: unknown): string =>
  cleanWikiTeamName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:basketball club|basketball|basket|baloncesto|bc|bk|cb|kk)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Match a Wikipedia team name string to a team in state.teams.
 * Handles franchise merges (Seattle SuperSonics → Thunder),
 * abbreviated names, and bidirectional partial matching.
 */
export function matchTeamByWikiName(
  wikiName: string,
  teams: { id: number; name?: string; region?: string; abbrev?: string }[],
): { id: number; name?: string; region?: string; abbrev?: string; [key: string]: any } | undefined {
  if (!wikiName) return undefined;
  const wl = cleanWikiTeamName(wikiName).toLowerCase();

  // 1. Check franchise merge map first
  const merged = FRANCHISE_MERGE[wl];
  if (merged) {
    const found = teams.find(t => (t.name ?? '').toLowerCase() === merged);
    if (found) return found;
  }

  // 2. Partial merge — check if wikiName starts with any merge key
  for (const [key, nick] of Object.entries(FRANCHISE_MERGE)) {
    if (wl.includes(key) || key.includes(wl)) {
      const found = teams.find(t => (t.name ?? '').toLowerCase() === nick);
      if (found) return found;
    }
  }

  // 3. Exact full-name match "region name" === wikiName
  const exact = teams.find(t =>
    `${(t.region ?? '')} ${t.name ?? ''}`.trim().toLowerCase() === wl
  );
  if (exact) return exact;

  const normalizedWikiName = normalizeClubMatchName(wikiName);
  const normalizedFullMatch = teams.find(t =>
    normalizeClubMatchName(`${t.region ?? ''} ${t.name ?? ''}`) === normalizedWikiName
  );
  if (normalizedFullMatch) return normalizedFullMatch;

  if (normalizedWikiName.length >= 4) {
    const regionMatches = teams.filter(t =>
      normalizeClubMatchName(t.region) === normalizedWikiName
    );
    if (regionMatches.length === 1) return regionMatches[0];
  }

  const normalizedNameMatch = teams.find(t =>
    normalizeClubMatchName(t.name) === normalizedWikiName
  );
  if (normalizedNameMatch) return normalizedNameMatch;

  // 4. Nickname-only match: wikiName contains team.name (bidirectional)
  const nickMatch = teams.find(t => {
    const tl = (t.name ?? '').toLowerCase();
    return tl && (wl.includes(tl) || tl.includes(wl));
  });
  return nickMatch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Abbreviation generator — fallback when team.abbrev is missing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a 3-letter abbreviation for a team name.
 * Rules:
 *   3+ words → first letter of each word (e.g. "Golden State Warriors" → "GSW")
 *   2 words  → first 2 of region + first of nickname (e.g. "Baltimore Bullets" → "BAL")
 *   1 word   → first 3 chars uppercased
 * @param existing  Set of already-used abbreviations (for dedup suffix)
 */
export function generateAbbrev(name: string, existing?: Set<string>): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let abbrev: string;
  if (words.length >= 3) {
    abbrev = words.map(w => w[0]).join('').toUpperCase().slice(0, 3);
  } else if (words.length === 2) {
    abbrev = (words[0].slice(0, 2) + words[1][0]).toUpperCase();
  } else {
    abbrev = (words[0] ?? 'UNK').slice(0, 3).toUpperCase();
  }
  if (!existing || !existing.has(abbrev)) return abbrev;
  // Dedup: try appending 2,3,4...
  for (let i = 2; i <= 9; i++) {
    const candidate = abbrev.slice(0, 2) + i;
    if (!existing.has(candidate)) return candidate;
  }
  return abbrev;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache (keyed by end year)
// ─────────────────────────────────────────────────────────────────────────────

const _cache = new Map<number, BRefSeasonData>();
const _inflight = new Map<number, Promise<BRefSeasonData>>();

// Populated once on first fetch — holds the raw Wikipedia JSON array
let _rawPromise: Promise<any[]> | null = null;

function getRawData(): Promise<any[]> {
  if (_rawPromise) return _rawPromise;
  _rawPromise = fetch(WIKI_URL)
    .then(r => readJsonResponse<unknown>(r, 'NBA season history'))
    .then(data => {
      if (!Array.isArray(data)) throw new Error('NBA season history returned a non-array payload.');
      return data;
    })
    .catch(e => { _rawPromise = null; throw e; });
  return _rawPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Shai Gilgeous-Alexander (Oklahoma City Thunder)"  → { name, team }
 * "Scott Brooks, Oklahoma City Thunder"              → { name, team }  (older seasons use comma)
 * Falls back gracefully if neither pattern matches.
 */
function parseAwardStr(raw: string | undefined): BRefAwardEntry | undefined {
  if (!raw?.trim()) return undefined;
  // Parens format: "Name (Team)" — used from ~2010s onward
  const paren = raw.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (paren) return { name: paren[1].trim(), team: paren[2].trim() };
  // Comma format: "Name, Team" — used in older seasons
  const comma = raw.match(/^(.+?),\s*(.+)$/);
  if (comma) return { name: comma[1].trim(), team: comma[2].trim() };
  return { name: raw.trim(), team: '' };
}

/**
 * "F Giannis Antetokounmpo, Milwaukee Bucks"  → { name, team }
 * "Stephon Castle, San Antonio Spurs"          → { name, team }
 * Strips leading position code (F/C/G/PG/SG/SF/PF/C).
 */
function parseTeamPlayer(s: string): { name: string; team: string } {
  const stripped = s.replace(/^[FCGPS]{1,2}\s+/, '');
  const idx = stripped.lastIndexOf(',');
  if (idx !== -1) {
    return { name: stripped.slice(0, idx).trim(), team: stripped.slice(idx + 1).trim() };
  }
  const dash = stripped.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  if (dash) return { name: dash[1].trim(), team: dash[2].trim() };
  return { name: stripped.trim(), team: '' };
}

function buildAllTeams(
  allLeagueTeams: Record<string, string[]>,
  prefix: string,
  suffixes: string[],
): BRefAllTeam[] {
  return suffixes.flatMap(suffix => {
    // Try both "All-NBA First Team" and "NBA All-Defensive First Team" key patterns
    const key1 = `${prefix} ${suffix}`;
    const key2 = `NBA ${prefix} ${suffix}`;
    const raw = allLeagueTeams[key1] ?? allLeagueTeams[key2] ?? [];
    if (!raw.length) return [];
    return [{ teamName: suffix, players: raw.map(parseTeamPlayer) }];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-season parser
// ─────────────────────────────────────────────────────────────────────────────

function parseRawSeason(raw: any): BRefSeasonData {
  const year = seasonLabelToEndYear(raw.season) ?? 0;
  const info: Record<string, string> = raw.infobox ?? {};
  const awards: Record<string, string> = raw.awards ?? {};
  const allLeagueTeams: Record<string, string[]> = raw.allLeagueTeams ?? {};
  const standings: { group: string; team: string; wins: number; losses: number }[] = raw.standings ?? [];

  // Awards — prefer infobox fields (cleaner), fall back to awards dict
  const mvpRaw       = info['Season MVP']        ?? awards['Most Valuable Player'];
  const dpoyRaw      = info['Defensive POY']     ?? awards['Defensive Player of the Year'];
  const smoyRaw      = info['Sixth Man']         ?? awards['Sixth Man of the Year'];
  const clutchRaw    = awards['Clutch Player of the Year'];
  const mipRaw       = info['Most Improved']     ?? awards['Most Improved Player'];
  const royRaw       = info['Rookie of Year']    ?? awards['Rookie of the Year'];
  const coyRaw       = info['Coach of Year']     ?? awards['Coach of the Year'];
  const fmvpRaw      = info['Finals MVP']        ?? awards['Finals MVP'];
  const champRaw     = info['Champions']         ?? info['Champion'];
  const runnerUpRaw  = info['Runners-up']        ?? info['Runner-up'];

  // Best records — first entry per Eastern/Western group.
  // Older seasons only have "Division" groups, so fall back to infobox conference champs.
  const bestRecords: BRefTeamRecord[] = [];
  const teamRecordByName = new Map<string, BRefTeamRecord>();
  const seenConf = new Set<string>();
  for (const s of standings) {
    const cleanedName = cleanWikiTeamName(s.team.replace(/^[a-z\*\-]+\s*/, ''));
    if (cleanedName && Number.isFinite(s.wins) && Number.isFinite(s.losses)) {
      teamRecordByName.set(cleanedName.toLowerCase(), {
        conference: s.group,
        name: cleanedName,
        wins: s.wins,
        losses: s.losses,
      });
    }
    if (s.group !== 'Eastern' && s.group !== 'Western') continue;
    if (seenConf.has(s.group)) continue;
    seenConf.add(s.group);
    // Strip seeding markers like "y-", "x-", "*" from team names
    bestRecords.push({ conference: s.group, name: s.team.replace(/^[a-z\*\-]+\s*/,''), wins: s.wins, losses: s.losses });
  }
  // Infobox fallback for seasons without Eastern/Western standings
  if (bestRecords.length === 0) {
    const eastChamp = info['Eastern champions'] ?? info['Eastern champion'];
    const westChamp = info['Western champions'] ?? info['Western champion'];
    // Try to get W-L from Division standings by matching team name
    const lookupWL = (champName: string): { wins: number; losses: number } => {
      if (!champName) return { wins: 0, losses: 0 };
      const cl = champName.trim().toLowerCase();
      const hit = standings.find(s =>
        s.team.replace(/^[a-z*\-]+\s*/, '').toLowerCase().includes(cl.split(' ').slice(-1)[0]) ||
        cl.includes(s.team.replace(/^[a-z*\-]+\s*/, '').toLowerCase().split(' ').slice(-1)[0])
      );
      return hit ? { wins: hit.wins, losses: hit.losses } : { wins: 0, losses: 0 };
    };
    if (eastChamp) {
      const wl = lookupWL(eastChamp);
      bestRecords.push({ conference: 'Eastern', name: eastChamp.trim(), ...wl });
    }
    if (westChamp) {
      const wl = lookupWL(westChamp);
      bestRecords.push({ conference: 'Western', name: westChamp.trim(), ...wl });
    }
  }

  return {
    year,
    champion:       champRaw    ? { name: cleanWikiTeamName(champRaw),    team: cleanWikiTeamName(champRaw)    } : undefined,
    runnerUp:       runnerUpRaw ? { name: cleanWikiTeamName(runnerUpRaw), team: cleanWikiTeamName(runnerUpRaw) } : undefined,
    finalsMvp:      parseAwardStr(fmvpRaw),
    semifinalsMvps: [],
    mvp:            parseAwardStr(mvpRaw),
    dpoy:           parseAwardStr(dpoyRaw),
    smoy:           parseAwardStr(smoyRaw),
    clutch:         parseAwardStr(clutchRaw),
    mip:            parseAwardStr(mipRaw),
    roy:            parseAwardStr(royRaw),
    coy:            parseAwardStr(coyRaw),
    bestRecords,
    teamRecords: [...teamRecordByName.values()],
    allNBA:         buildAllTeams(allLeagueTeams, 'All-NBA',         ['First Team', 'Second Team', 'Third Team']),
    allDefensive:   buildAllTeams(allLeagueTeams, 'All-Defensive',   ['First Team', 'Second Team']),
    allRookie:      buildAllTeams(allLeagueTeams, 'All-Rookie',      ['First Team', 'Second Team']),
    otherAwards:    [],
    allStars:       [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public fetcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single season by end year (e.g. 2025 for 2024-25).
 * All 79 seasons are loaded once and cached; subsequent calls are instant.
 */
export async function fetchBRefSeasonData(year: number): Promise<BRefSeasonData> {
  if (_cache.has(year)) return _cache.get(year)!;
  const existing = _inflight.get(year);
  if (existing) return existing;
  const request = (async () => {
    const workerSeason = await fetchWorkerNbaSeasonHistory(year);
    if (workerSeason) {
      _cache.set(year, workerSeason);
      return workerSeason;
    }
    const raw = await getRawData();
    for (const item of raw) {
      const parsed = parseRawSeason(item);
      if (parsed.year > 0) _cache.set(parsed.year, parsed);
    }
    if (!_cache.has(year)) throw new Error(`wikiHistory: no data for ${year}`);
    return _cache.get(year)!;
  })();
  _inflight.set(year, request);
  try {
    return await request;
  } finally {
    _inflight.delete(year);
  }
}

/** Synchronous read of the in-memory cache (populated after first fetch). */
export function getAllCachedSeasons(): Map<number, BRefSeasonData> {
  return new Map(_cache);
}

// ─────────────────────────────────────────────────────────────────────────────
// React hooks  (same signatures as old brefFetcher)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export function useBRefSeason(year: number | null): {
  data: BRefSeasonData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData]       = useState<BRefSeasonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  useEffect(() => {
    if (year == null) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchBRefSeasonData(year)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });

    return () => { cancelled = true; };
  }, [year]);

  return { data, loading, error };
}

export function useBRefSeasonsBatch(years: number[]): Map<number, BRefSeasonData> {
  const [brefMap, setBrefMap] = useState<Map<number, BRefSeasonData>>(new Map());
  const yearsKey = years.join(',');

  useEffect(() => {
    let cancelled = false;
    Promise.all(years.map(async year => {
      try {
        return [year, await fetchBRefSeasonData(year)] as const;
      } catch {
        return null;
      }
    })).then(entries => {
      if (cancelled) return;
      setBrefMap(previous => {
        const next = new Map(previous);
        entries.forEach(entry => { if (entry) next.set(entry[0], entry[1]); });
        return next;
      });
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsKey]);

  return brefMap;
}
