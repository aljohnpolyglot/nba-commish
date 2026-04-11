/**
 * franchiseService.ts
 * Fetches franchise-level historical data from GitHub gists.
 * Provides live-stat merge helpers so active sim players override gist data.
 */

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
      .then(r => { if (!r.ok) throw new Error(`franchiseService: ${r.status} ${url}`); return r.json(); })
      .then(data => { _cache[key] = data; return data; })
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
    const secondLast = parts[parts.length - 2];
    if (/^[A-Z]\.$/.test(secondLast)) {            // matches "D." pattern
      return parts.slice(0, parts.length - 2).join(' ');
    }
  }
  // Dedup: "Reggie Miller Reggie Miller" → "Reggie Miller"
  const half = Math.ceil(parts.length / 2);
  if (parts.length >= 4 && parts.slice(0, half).join(' ') === parts.slice(half).join(' ')) {
    return parts.slice(0, half).join(' ');
  }
  return raw;
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

export function computeLiveTotals(players: any[], teamId: number): any[] {
  const rows: any[] = [];
  for (const player of players) {
    const ts = (player.stats ?? []).filter((s: any) => s.tid === teamId && !s.playoffs);
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
      byName.set(cleanName(row.NAME), { ...row, _cleanName: cleanName(row.NAME), _val: val });
    }
    for (const live of liveTotals) {
      const liveVal = parseStatVal(live[statKey]);
      if (liveVal <= 0) continue;
      const existing = byName.get(live.NAME);
      if (!existing) {
        byName.set(live.NAME, { ...live, Career_Leader_Category: cat, Franchise_Rank: 0, _cleanName: live.NAME, _val: liveVal });
      } else if (liveVal > (existing._val ?? 0)) {
        byName.set(live.NAME, { ...existing, ...live, Career_Leader_Category: cat, _cleanName: live.NAME, _val: liveVal });
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
      byName.set(cleanName(row.NAME), { ...row, _cleanName: cleanName(row.NAME), Value: rawVal || row.Value, _val: rawVal });
    }
    for (const live of liveAvgRows) {
      const liveVal = parseFloat(live[cat] ?? '0') || 0;
      if (liveVal <= 0) continue;
      const existing = byName.get(live.NAME);
      if (!existing) {
        byName.set(live.NAME, { ...live, Category: cat, Rank: 0, Value: String(liveVal), _cleanName: live.NAME, _val: liveVal });
      } else if (liveVal > (existing._val ?? 0)) {
        byName.set(live.NAME, { ...existing, ...live, Category: cat, Value: String(liveVal), _cleanName: live.NAME, _val: liveVal });
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
