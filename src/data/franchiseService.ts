/**
 * franchiseService.ts
 * Fetches franchise-level historical data from the nba-store-data repository.
 * Provides live-stat merge helpers so active sim players override gist data.
 */

import { readJsonResponse } from '../services/utils/jsonResponse';
import { normalizePortraitName } from '../utils/portraitName';

const REGULAR_RECORDS_URL  = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbaregularfranchiserecords';
const PLAYOFF_RECORDS_URL  = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbaplayofffranchiserecords';
const CAREER_LEADERS_URL   = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbacareerfranchiseleaders2';
const AVERAGE_LEADERS_URL  = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbafranchiseaverageleaders';
const MISSING_PORTRAITS_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbamissingportraits5000pts';

// ─── In-memory cache ─────────────────────────────────────────────────────────
// Bust cache on each app load so updated gists are always picked up
const _BUST = Date.now();
const _cache: Record<string, any[] | null> = {};
const _inFlight: Record<string, Promise<any[]>> = {};

async function fetchCached(key: string, url: string): Promise<any[]> {
  if (_cache[key]) return _cache[key]!;
  if (!_inFlight[key]) {
    const bustedUrl = `${url}?v=${_BUST}`;
    _inFlight[key] = fetch(bustedUrl)
      .then(r => readJsonResponse<unknown>(r, `NBA franchise ${key}`))
      .then(data => {
        if (!Array.isArray(data)) throw new Error(`NBA franchise ${key} returned a non-array payload.`);
        _cache[key] = data;
        return data;
      })
      .catch(e => { delete _inFlight[key]; throw e; });
  }
  return _inFlight[key];
}

// ─── Public fetchers ──────────────────────────────────────────────────────────

export async function fetchRegularRecords(): Promise<any[]> {
  return fetchCached('regular', REGULAR_RECORDS_URL);
}
export async function fetchPlayoffRecords(): Promise<any[]> {
  return fetchCached('playoff', PLAYOFF_RECORDS_URL);
}
export async function fetchCareerLeaders(): Promise<any[]> {
  return fetchCached('career', CAREER_LEADERS_URL);
}
export async function fetchAverageLeaders(): Promise<any[]> {
  return fetchCached('average', AVERAGE_LEADERS_URL);
}
export async function fetchMissingPortraits(): Promise<any[]> {
  return fetchCached('portraits', MISSING_PORTRAITS_URL);
}

// ─── Portrait lookup helper ────────────────────────────────────────────────────
// Returns portrait URL from the missing-portraits gist, or null if not found.
// Uses a module-level map so it's built once per session.

let _portraitMap: Map<string, string> | null = null;

export async function lookupPortrait(name: string): Promise<string | null> {
  if (!_portraitMap) {
    try {
      const portraits = await fetchMissingPortraits();
      _portraitMap = new Map<string, string>();
      for (const p of portraits) {
        if (p.name && p.portrait) {
          _portraitMap.set(p.name.toLowerCase().trim(), p.portrait);
        }
      }
    } catch {
      _portraitMap = new Map(); // empty on error — don't retry indefinitely
    }
  }
  return _portraitMap.get(name.toLowerCase().trim()) ?? null;
}

// ─── Name cleaning ────────────────────────────────────────────────────────────
// Gist data has names like "Dominique Wilkins D. Wilkins" — strip the abbreviated suffix.

export function cleanName(raw: string): string {
  if (!raw) return '';
  const parts = raw.trim().split(/\s+/);
  if (parts.length >= 4) {
    for (let index = 2; index < parts.length - 1; index += 1) {
      if (!/^[A-Z]\.$/.test(parts[index])) continue;
      const full = parts.slice(0, index);
      const abbreviated = parts.slice(index + 1);
      const initialMatches = full[0]?.[0]?.toUpperCase() === parts[index][0];
      const remainderMatches = full.slice(1).join(' ').toLowerCase() === abbreviated.join(' ').toLowerCase();
      if (initialMatches && remainderMatches) return full.join(' ');
    }
  }
  // Dedup: "Reggie Miller Reggie Miller" → "Reggie Miller"
  const half = Math.ceil(parts.length / 2);
  if (parts.length >= 4 && parts.slice(0, half).join(' ') === parts.slice(half).join(' ')) {
    return parts.slice(0, half).join(' ');
  }
  return parts.join(' ');
}

// ─── Team filter ──────────────────────────────────────────────────────────────
// Safe matching: never matches empty strings; uses endsWith for nickname matching.

export function filterToTeam(data: any[], team: { region?: string; name: string; abbrev: string }): any[] {
  const abbrev     = (team.abbrev ?? '').toUpperCase();
  const nameLower  = (team.name ?? '').toLowerCase().trim();
  const fullLower  = `${team.region ?? ''} ${team.name}`.trim().toLowerCase();

  return data.filter(d => {
    // Exact abbreviation match (most reliable)
    if (abbrev && d.TM && d.TM.toUpperCase() === abbrev) return true;
    const fr = (d.Franchise ?? '').toLowerCase().trim();
    if (!fr || !nameLower) return false;
    // Direct name match: "golden state warriors" === "golden state warriors"
    if (fr === nameLower) return true;
    // Exact full name match (region + name, for teams where name is nickname only)
    if (fullLower && fr === fullLower) return true;
    // Franchise name ends with the team nickname: "atlanta hawks".endsWith(" hawks")
    if (nameLower.length >= 4 && fr.endsWith(' ' + nameLower)) return true;
    return false;
  });
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────

export const STAT_MAP: Record<string, string> = {
  'Points': 'PTS', 'Rebounds': 'REB', 'Assists': 'AST', 'Steals': 'STL', 'Blocks': 'BLK',
  'Field Goals Made': 'FGM', 'Field Goals Attempted': 'FGA',
  'Three-Pointers Made': '3PM', 'Three-Pointers Attempted': '3PA',
  'Free Throws Made': 'FTM', 'Free Throws Attempted': 'FTA',
  'Offensive Rebounds': 'OREB', 'Defensive Rebounds': 'DREB',
  'Turnovers': 'TOV', 'Personal Fouls': 'PF',
  'Minutes Played': 'MIN', 'Games Played': 'GP', 'Games Started': 'GS',
};

export function getStatValue(record: any, category: string): string {
  if (!record) return 'N/A';
  const key = STAT_MAP[category] ?? category;
  if (record[key] != null) return String(record[key]);
  if (record[category] != null) return String(record[category]);
  return record.Value ?? 'N/A';
}

/** Parse a stat string that may be comma-formatted ("4,837" → 4837). */
export function parseStatVal(val: any): number {
  if (val == null) return 0;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

export const CATEGORY_ORDER = [
  'Points', 'Rebounds', 'Assists', 'Blocks', 'Steals',
  'Field Goals Made', 'Field Goals Attempted', 'Three-Pointers Made', 'Three-Pointers Attempted',
  'Free Throws Made', 'Free Throws Attempted', 'Offensive Rebounds', 'Defensive Rebounds',
  'Turnovers', 'Personal Fouls', 'Minutes Played', 'Games Played', 'Games Started',
];

export const CATEGORY_ORDER_AVG = [
  'Points Per Game', 'Rebounds Per Game', 'Assists Per Game', 'Blocks Per Game', 'Steals Per Game',
  'Three-Pointers Made Per Game', 'Field Goals Made Per Game', 'Free Throws Made Per Game',
  'Turnovers Per Game', 'Minutes Per Game', 'Field Goal Percentage', 'Three Point Percentage', 'Free Throw Percentage',
];

// ─── Live stat computation ────────────────────────────────────────────────────
// Compute career totals for all state.players who played for a given team.

function computeLiveTotalsForRows(players: any[], rowFilter: (row: any) => boolean): any[] {
  const rows: any[] = [];
  for (const player of players) {
    const ts = (player.stats ?? []).filter(rowFilter);
    if (!ts.length) continue;
    const T = ts.reduce((a: any, s: any) => ({
      gp:  a.gp  + (s.gp  ?? 0),  gs:  a.gs  + (s.gs  ?? 0),
      min: a.min + (s.min ?? 0),  pts: a.pts + (s.pts ?? 0),
      trb: a.trb + (s.trb ?? (s.orb ?? 0) + (s.drb ?? 0)),
      ast: a.ast + (s.ast ?? 0),  stl: a.stl + (s.stl ?? 0),
      blk: a.blk + (s.blk ?? 0),  fg:  a.fg  + (s.fg  ?? 0),
      fga: a.fga + (s.fga ?? 0),  tp:  a.tp  + (s.tp  ?? 0),
      tpa: a.tpa + (s.tpa ?? 0),  ft:  a.ft  + (s.ft  ?? 0),
      fta: a.fta + (s.fta ?? 0),  orb: a.orb + (s.orb ?? 0),
      drb: a.drb + (s.drb ?? 0),  tov: a.tov + (s.tov ?? 0),
      pf:  a.pf  + (s.pf  ?? 0),
    }), { gp:0,gs:0,min:0,pts:0,trb:0,ast:0,stl:0,blk:0,fg:0,fga:0,tp:0,tpa:0,ft:0,fta:0,orb:0,drb:0,tov:0,pf:0 });
    rows.push({
      NAME: player.name,
      _playerId: player.internalId,
      GP: String(T.gp),  GS: String(T.gs),  MIN: String(Math.round(T.min)),
      PTS: String(T.pts),  REB: String(T.trb),
      AST: String(T.ast),  STL: String(T.stl),  BLK: String(T.blk),
      FGM: String(T.fg),  FGA: String(T.fga),
      '3PM': String(T.tp), '3PA': String(T.tpa),
      FTM: String(T.ft),  FTA: String(T.fta),
      OREB: String(T.orb), DREB: String(T.drb),
      TOV: String(T.tov),  PF: String(T.pf),
      _live: true,
      _ws: ts.reduce((s: number, r: any) => s + (r.ws ?? 0), 0),
    });
  }
  return rows;
}

export function normalizeLeaderNameKey(name: string): string {
  return normalizePortraitName(cleanName(name));
}

function bestRowsByName(rows: any[]): any[] {
  const byName = new Map<string, any>();
  for (const row of rows) {
    const key = normalizeLeaderNameKey(row._cleanName ?? row.NAME ?? '');
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || (row._val ?? 0) > (existing._val ?? 0)) byName.set(key, row);
  }
  return Array.from(byName.values());
}

function sourceAbbrev(row: any): string {
  return String(row?.abbrev ?? row?.teamAbbrev ?? row?.tm ?? row?.TM ?? '').trim().toUpperCase();
}

function rowLooksPerGame(row: any): boolean {
  const gp = Number(row?.gp ?? 0);
  const min = Number(row?.min ?? 0);
  const fga = Number(row?.fga ?? 0);
  const pts = Number(row?.pts ?? 0);
  return gp >= 20 && min > 0 && min <= 60 && fga > 0 && fga <= 60 && pts > 0 && pts <= 100;
}

function numericSourceTotal(row: any, key: string, gp: number, perGame: boolean): number {
  const directTotal = row?.[`${key}Total`] ?? row?.[`${key}Tot`] ?? row?.[`${key}_total`];
  const raw = Number(directTotal ?? row?.[key] ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return perGame && gp > 0 ? raw * gp : raw;
}

export function computeSourceHistoricalTotals(
  players: any[],
  options: {
    teamId?: number | null;
    teamAbbrevs?: Iterable<string>;
    seasons?: Set<number> | null;
    maxSeason?: number;
    excludeNames?: Set<string>;
    leagueWide?: boolean;
  } = {},
): any[] {
  const acceptedAbbrevs = new Set(
    Array.from(options.teamAbbrevs ?? [])
      .map(value => String(value ?? '').trim().toUpperCase())
      .filter(Boolean),
  );
  const byName = new Map<string, any>();
  const isLeagueWide = options.leagueWide === true;
  const teamId = options.teamId == null ? null : Number(options.teamId);

  for (const player of players ?? []) {
    const name = cleanName(String(player?.name ?? '').trim());
    if (!name) continue;
    const nameKey = normalizeLeaderNameKey(name);
    if (options.excludeNames?.has(nameKey)) continue;

    const rows = (player?.stats ?? []).filter((row: any) => {
      if (row?.playoffs) return false;
      const season = Number(row?.season ?? 0);
      if (!Number.isFinite(season) || season <= 0) return false;
      if (options.maxSeason != null && season > options.maxSeason) return false;
      if (options.seasons && !options.seasons.has(season)) return false;
      if (isLeagueWide) return Number(row?.tid ?? -1) >= 0 || !!sourceAbbrev(row);
      const abbrev = sourceAbbrev(row);
      if (abbrev) return acceptedAbbrevs.has(abbrev);
      return teamId != null && Number(row?.tid) === teamId;
    });
    if (!rows.length) continue;

    const total = rows.reduce((acc: any, row: any) => {
      const gp = Number(row?.gp ?? 0) || 0;
      const perGame = rowLooksPerGame(row);
      const orb = numericSourceTotal(row, 'orb', gp, perGame);
      const drb = numericSourceTotal(row, 'drb', gp, perGame);
      const trb = numericSourceTotal(row, 'trb', gp, perGame) || numericSourceTotal(row, 'reb', gp, perGame) || orb + drb;
      return {
        gp: acc.gp + gp,
        gs: acc.gs + (Number(row?.gs ?? 0) || 0),
        min: acc.min + numericSourceTotal(row, 'min', gp, perGame),
        pts: acc.pts + numericSourceTotal(row, 'pts', gp, perGame),
        trb: acc.trb + trb,
        ast: acc.ast + numericSourceTotal(row, 'ast', gp, perGame),
        stl: acc.stl + numericSourceTotal(row, 'stl', gp, perGame),
        blk: acc.blk + numericSourceTotal(row, 'blk', gp, perGame),
        fg: acc.fg + numericSourceTotal(row, 'fg', gp, perGame),
        fga: acc.fga + numericSourceTotal(row, 'fga', gp, perGame),
        tp: acc.tp + numericSourceTotal(row, 'tp', gp, perGame),
        tpa: acc.tpa + numericSourceTotal(row, 'tpa', gp, perGame),
        ft: acc.ft + numericSourceTotal(row, 'ft', gp, perGame),
        fta: acc.fta + numericSourceTotal(row, 'fta', gp, perGame),
        orb: acc.orb + orb,
        drb: acc.drb + drb,
        tov: acc.tov + numericSourceTotal(row, 'tov', gp, perGame),
        pf: acc.pf + numericSourceTotal(row, 'pf', gp, perGame),
        ws: acc.ws + (Number(row?.ws ?? 0) || 0),
      };
    }, { gp:0,gs:0,min:0,pts:0,trb:0,ast:0,stl:0,blk:0,fg:0,fga:0,tp:0,tpa:0,ft:0,fta:0,orb:0,drb:0,tov:0,pf:0,ws:0 });

    const existing = byName.get(nameKey);
    const next = {
      NAME: name,
      _sourcePlayer: player,
      GP: String(Math.round(total.gp)),
      GS: String(Math.round(total.gs)),
      MIN: String(Math.round(total.min)),
      PTS: String(Math.round(total.pts)),
      REB: String(Math.round(total.trb)),
      AST: String(Math.round(total.ast)),
      STL: String(Math.round(total.stl)),
      BLK: String(Math.round(total.blk)),
      FGM: String(Math.round(total.fg)),
      FGA: String(Math.round(total.fga)),
      '3PM': String(Math.round(total.tp)),
      '3PA': String(Math.round(total.tpa)),
      FTM: String(Math.round(total.ft)),
      FTA: String(Math.round(total.fta)),
      OREB: String(Math.round(total.orb)),
      DREB: String(Math.round(total.drb)),
      TOV: String(Math.round(total.tov)),
      PF: String(Math.round(total.pf)),
      _live: true,
      _sourceHistorical: true,
      _ws: total.ws,
    };
    if (!existing || parseStatVal(next.GP) > parseStatVal(existing.GP)) byName.set(nameKey, next);
  }

  return Array.from(byName.values());
}

export function computeLiveTotals(players: any[], teamId: number, maxSeason?: number, minSeasonExclusive?: number): any[] {
  return computeLiveTotalsForRows(players, (s: any) => {
    const season = Number(s.season ?? 0);
    return s.tid === teamId &&
      !s.playoffs &&
      (maxSeason == null || season <= maxSeason) &&
      (minSeasonExclusive == null || season > minSeasonExclusive);
  });
}

export function computeLiveTotalsForTeamSeasons(players: any[], teamId: number, seasons: Set<number>, maxSeason?: number, minSeasonExclusive?: number): any[] {
  return computeLiveTotalsForRows(players, (s: any) => {
    const season = Number(s.season ?? 0);
    return s.tid === teamId &&
      !s.playoffs &&
      seasons.has(season) &&
      (maxSeason == null || season <= maxSeason) &&
      (minSeasonExclusive == null || season > minSeasonExclusive);
  });
}

export function computeLeagueLiveTotals(players: any[], maxSeason?: number, minSeasonExclusive?: number): any[] {
  return computeLiveTotalsForRows(players, (s: any) => {
    const season = Number(s.season ?? 0);
    const tid = Number(s.tid ?? -1);
    const hasLeagueTeamEvidence = (tid >= 0 && tid < 100) || sourceAbbrev(s) !== '';
    return hasLeagueTeamEvidence &&
      !s.playoffs &&
      (maxSeason == null || season <= maxSeason) &&
      (minSeasonExclusive == null || season > minSeasonExclusive);
  });
}

export function buildCareerLeadersFromLiveTotals(liveTotals: any[]): any[] {
  const result: any[] = [];
  for (const cat of CATEGORY_ORDER) {
    const statKey = STAT_MAP[cat] ?? cat;
    const rows = liveTotals
      .map(row => ({
        ...row,
        Category: cat,
        Career_Leader_Category: cat,
        _cleanName: cleanName(row.NAME),
        _val: parseStatVal(row[statKey]),
      }))
      .filter(row => (row._val ?? 0) > 0 && parseInt(row.GP ?? '0', 10) >= 1);
    const sorted = bestRowsByName(rows)
      .sort((a, b) => (b._val ?? 0) - (a._val ?? 0))
      .slice(0, 100);
    sorted.forEach((row, i) => { row.Franchise_Rank = i + 1; });
    result.push(...sorted);
  }
  return result;
}

export function buildAverageLeadersFromLiveTotals(liveTotals: any[]): any[] {
  const liveAvgRows: any[] = [];
  for (const T of liveTotals) {
    const gp = parseInt(T.GP ?? '0', 10) || 0;
    if (gp <= 0) continue;
    const pts = parseInt(T.PTS ?? '0', 10) || 0;
    const trb = parseInt(T.REB ?? '0', 10) || 0;
    const ast = parseInt(T.AST ?? '0', 10) || 0;
    const stl = parseInt(T.STL ?? '0', 10) || 0;
    const blk = parseInt(T.BLK ?? '0', 10) || 0;
    const fg = parseInt(T.FGM ?? '0', 10) || 0;
    const fga = parseInt(T.FGA ?? '0', 10) || 0;
    const tp = parseInt(T['3PM'] ?? '0', 10) || 0;
    const tpa = parseInt(T['3PA'] ?? '0', 10) || 0;
    const ft = parseInt(T.FTM ?? '0', 10) || 0;
    const fta = parseInt(T.FTA ?? '0', 10) || 0;
    const tov = parseInt(T.TOV ?? '0', 10) || 0;
    const min = parseInt(T.MIN ?? '0', 10) || 0;
    liveAvgRows.push({
      ...T,
      NAME: T.NAME,
      GP: T.GP,
      _live: true,
      'Points Per Game':              (pts / gp).toFixed(1),
      'Rebounds Per Game':            (trb / gp).toFixed(1),
      'Assists Per Game':             (ast / gp).toFixed(1),
      'Steals Per Game':              (stl / gp).toFixed(2),
      'Blocks Per Game':              (blk / gp).toFixed(2),
      'Three-Pointers Made Per Game': (tp / gp).toFixed(1),
      'Field Goals Made Per Game':    (fg / gp).toFixed(1),
      'Free Throws Made Per Game':    (ft / gp).toFixed(1),
      'Turnovers Per Game':           (tov / gp).toFixed(1),
      'Minutes Per Game':             (min / gp).toFixed(1),
      'Field Goal Percentage':        fga > 0 ? ((fg / fga) * 100).toFixed(1) : '0',
      'Three Point Percentage':       tpa > 0 ? ((tp / tpa) * 100).toFixed(1) : '0',
      'Free Throw Percentage':        fta > 0 ? ((ft / fta) * 100).toFixed(1) : '0',
    });
  }

  const result: any[] = [];
  for (const cat of CATEGORY_ORDER_AVG) {
    const rows = liveAvgRows
      .map(row => ({
        ...row,
        Category: cat,
        Rank: 0,
        Value: row[cat],
        _cleanName: cleanName(row.NAME),
        _val: parseStatVal(row[cat]),
      }))
      .filter(row => (row._val ?? 0) > 0 && parseInt(row.GP ?? '0', 10) >= 1);
    const sorted = bestRowsByName(rows)
      .sort((a, b) => (b._val ?? 0) - (a._val ?? 0))
      .slice(0, 100);
    sorted.forEach((row, i) => { row.Rank = i + 1; });
    result.push(...sorted);
  }
  return result;
}

// ─── Merge career leaders (totals) ───────────────────────────────────────────
// For each category, live player data overrides gist if their total is higher.

export function mergeCareerLeaders(gistLeaders: any[], liveTotals: any[]): any[] {
  const result: any[] = [];

  for (const cat of CATEGORY_ORDER) {
    const statKey = STAT_MAP[cat] ?? cat;
    const gistRows = gistLeaders.filter(r => r.Category === cat);

    // Map: playerName → best row; normalise value into _val for reliable comparison
    const byName = new Map<string, any>();
    for (const row of gistRows) {
      const val = parseStatVal(getStatValue(row, cat));
      const key = normalizeLeaderNameKey(row.NAME);
      if (key) byName.set(key, { ...row, _cleanName: cleanName(row.NAME), _val: val });
    }
    for (const live of liveTotals) {
      const liveVal = parseStatVal(live[statKey]);
      if (liveVal <= 0) continue;
      const key = normalizeLeaderNameKey(live.NAME);
      if (!key) continue;
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { ...live, Career_Leader_Category: cat, Franchise_Rank: 0, _cleanName: cleanName(live.NAME), _val: liveVal });
      } else if (liveVal > (existing._val ?? 0)) {
        byName.set(key, { ...existing, ...live, Career_Leader_Category: cat, _cleanName: cleanName(live.NAME), _val: liveVal });
      }
    }

    // Sort, re-rank, cap at 100; require ≥50 GP so 1-game cup-of-coffee players don't pollute the list
    const sorted = Array.from(byName.values())
      .filter(r => (r._val ?? 0) > 0 && parseInt(r.GP ?? '0') >= 50)
      .sort((a, b) => (b._val ?? 0) - (a._val ?? 0))
      .slice(0, 100);
    sorted.forEach((row, i) => { row.Franchise_Rank = i + 1; row.Category = cat; row.Career_Leader_Category = cat; });
    result.push(...sorted);
  }
  return result;
}

// ─── Merge average leaders ────────────────────────────────────────────────────

export function mergeAverageLeaders(gistLeaders: any[], liveTotals: any[]): any[] {
  // Build live averages
  const liveAvgRows: any[] = [];
  for (const T of liveTotals) {
    const gp = parseInt(T.GP) || 0;
    if (gp < 100) continue;
    const pts = parseInt(T.PTS)||0, trb = parseInt(T.REB)||0, ast = parseInt(T.AST)||0;
    const stl = parseInt(T.STL)||0, blk = parseInt(T.BLK)||0;
    const fg = parseInt(T.FGM)||0, fga = parseInt(T.FGA)||0;
    const tp = parseInt(T['3PM'])||0, tpa = parseInt(T['3PA'])||0;
    const ft = parseInt(T.FTM)||0, fta = parseInt(T.FTA)||0;
    const tov = parseInt(T.TOV)||0, min = parseInt(T.MIN)||0;
    liveAvgRows.push({
      ...T,
      NAME: T.NAME, GP: T.GP, _live: true,
      'Points Per Game':              (pts/gp).toFixed(1),
      'Rebounds Per Game':            (trb/gp).toFixed(1),
      'Assists Per Game':             (ast/gp).toFixed(1),
      'Steals Per Game':              (stl/gp).toFixed(2),
      'Blocks Per Game':              (blk/gp).toFixed(2),
      'Three-Pointers Made Per Game': (tp/gp).toFixed(1),
      'Field Goals Made Per Game':    (fg/gp).toFixed(1),
      'Free Throws Made Per Game':    (ft/gp).toFixed(1),
      'Turnovers Per Game':           (tov/gp).toFixed(1),
      'Minutes Per Game':             (min/gp).toFixed(1),
      'Field Goal Percentage':        fga > 0 ? ((fg/fga)*100).toFixed(1) : '0',
      'Three Point Percentage':       tpa > 0 ? ((tp/tpa)*100).toFixed(1) : '0',
      'Free Throw Percentage':        fta > 0 ? ((ft/fta)*100).toFixed(1) : '0',
    });
  }

  const result: any[] = [];
  for (const cat of CATEGORY_ORDER_AVG) {
    const gistRows = gistLeaders.filter(r => r.Category === cat);
    const byName = new Map<string, any>();
    for (const row of gistRows) {
      const rawVal = parseStatVal(getStatValue(row, cat));
      const key = normalizeLeaderNameKey(row.NAME);
      if (key) byName.set(key, { ...row, _cleanName: cleanName(row.NAME), Value: rawVal || row.Value, _val: rawVal });
    }
    for (const live of liveAvgRows) {
      const liveVal = parseFloat(live[cat] ?? '0') || 0;
      if (liveVal <= 0) continue;
      const key = normalizeLeaderNameKey(live.NAME);
      if (!key) continue;
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { ...live, Category: cat, Rank: 0, Value: String(liveVal), _cleanName: cleanName(live.NAME), _val: liveVal });
      } else if (liveVal > (existing._val ?? 0)) {
        byName.set(key, { ...existing, ...live, Category: cat, Value: String(liveVal), _cleanName: cleanName(live.NAME), _val: liveVal });
      }
    }
    const sorted = Array.from(byName.values())
      .filter(r => (r._val ?? 0) > 0 && parseInt(r.GP ?? '0') >= 100)
      .sort((a, b) => (b._val ?? 0) - (a._val ?? 0))
      .slice(0, 100);
    sorted.forEach((r, i) => { r.Rank = i + 1; });
    result.push(...sorted);
  }
  return result;
}
