/**
 * nameDataFetcher.ts
 *
 * Fetches the ZenGM names.json once per session, caches it in localStorage for offline
 * use, and exposes a module-level singleton that the draft-class generator reads.
 *
 * Called early in game init so `generateDraftClassForGame` always has a populated
 * name table before rollover tries to synthesize new prospects.
 */

import { NAMES_URL } from '../genplayersconstants';
import type { NameData } from '../genplayersconstants';

const CACHE_KEY = 'nba-commish:namedata-v2'; // bumped when schema changes — v1 cached bad data

function isValidNameData(data: any): data is NameData {
  if (!data || typeof data !== 'object' || !data.countries) return false;
  const usa = data.countries.USA;
  if (!usa || !usa.first || !usa.last) return false;
  return Object.keys(usa.first).length > 0 && Object.keys(usa.last).length > 0;
}

/** Normalize ZenGM's `names.json` (top-level `first`/`last` → country maps) to our shape. */
function normalizeZenGMSchema(raw: any): NameData | null {
  if (!raw || typeof raw !== 'object') return null;
  const firstMap = raw.first ?? {};
  const lastMap = raw.last ?? {};
  const countries: NameData['countries'] = {};
  for (const country of new Set([...Object.keys(firstMap), ...Object.keys(lastMap)])) {
    const first = firstMap[country];
    const last = lastMap[country];
    // ZenGM stores name entries as arrays of [name, frequency] tuples — convert to Record.
    const toRecord = (v: any): Record<string, number> => {
      if (!v) return {};
      if (Array.isArray(v)) {
        const r: Record<string, number> = {};
        for (const entry of v) {
          if (Array.isArray(entry) && entry.length >= 2) r[String(entry[0])] = Number(entry[1]) || 1;
          else if (typeof entry === 'string') r[entry] = 1;
        }
        return r;
      }
      if (typeof v === 'object') return v as Record<string, number>;
      return {};
    };
    countries[country] = { first: toRecord(first), last: toRecord(last) };
  }
  const out: NameData = { countries };
  return isValidNameData(out) ? out : null;
}

// Tiny fallback — enough to keep generation from crashing if we're offline AND the cache is empty.
// Weighted toward USA/Canada so the mix still looks plausible; real fetch will replace this.
const FALLBACK_NAME_DATA: NameData = {
  countries: {
    USA: {
      first: { Jalen: 30, Jayson: 20, DeAndre: 18, Trae: 15, Anthony: 22, Tyrese: 18, Marcus: 24, James: 35, Michael: 28, Chris: 25, Kevin: 20, Cameron: 16, Jordan: 20, Isaiah: 18 },
      last: { Williams: 40, Johnson: 35, Brown: 32, Jones: 30, Davis: 28, Miller: 25, Thomas: 24, Jackson: 24, Harris: 22, Martin: 20, Robinson: 20, Walker: 18, Young: 18, Allen: 17 },
    },
    Canada: {
      first: { Jamal: 18, Shai: 12, Andrew: 20, Tristan: 15, Kelly: 10 },
      last: { Murray: 20, Wiggins: 12, Bennett: 10, Barrett: 15 },
    },
    Spain: { first: { Luka: 14, Marc: 12, Ricky: 10, Usman: 8 }, last: { Gasol: 14, Rubio: 10, Garbajosa: 8 } },
    France: { first: { Rudy: 14, Tony: 10, Nicolas: 10, Evan: 12 }, last: { Gobert: 14, Parker: 10, Batum: 10, Fournier: 10 } },
    Germany: { first: { Dirk: 12, Daniel: 10, Isaac: 10 }, last: { Nowitzki: 12, Theis: 10, Bonga: 8 } },
    Serbia: { first: { Nikola: 20, Bogdan: 12, Miloš: 10 }, last: { Jokic: 20, Bogdanovic: 12, Teodosic: 10 } },
    Nigeria: { first: { Giannis: 18, Precious: 12, Festus: 10 }, last: { Antetokounmpo: 18, Achiuwa: 12, Ezeli: 10 } },
    Australia: { first: { Patty: 12, Joe: 10, Ben: 14, Matthew: 10 }, last: { Mills: 12, Ingles: 10, Simmons: 14, Dellavedova: 10 } },
  },
};

let cachedNameData: NameData | null = null;
let inFlight: Promise<NameData> | null = null;

/**
 * Load name data — fetched once per session, cached in localStorage for offline.
 * Safe to call multiple times; subsequent calls return the cached value.
 */
export async function loadNameData(): Promise<NameData> {
  if (cachedNameData) return cachedNameData;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // 1. Try localStorage first — fastest path, works offline. Validate before trusting.
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidNameData(parsed)) {
          cachedNameData = parsed;
          return parsed;
        }
        // Cached payload was malformed — wipe and re-fetch.
        try { localStorage.removeItem(CACHE_KEY); } catch {}
      }
    } catch {}

    // 2. Fetch from ZenGM — only needed once per install.
    try {
      const res = await fetch(NAMES_URL);
      if (res.ok) {
        const data = await res.json();
        // ZenGM ships a few different shapes; try a couple before giving up.
        const normalized = normalizeZenGMSchema(data)
          ?? (isValidNameData(data) ? data as NameData : null);
        if (normalized) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(normalized)); } catch {}
          cachedNameData = normalized;
          return normalized;
        }
      }
    } catch {}

    // 3. Offline with no cache — use the embedded fallback.
    cachedNameData = FALLBACK_NAME_DATA;
    return FALLBACK_NAME_DATA;
  })();

  return inFlight;
}

/** Synchronous accessor — returns whatever's cached, or the fallback. Use after loadNameData() has resolved. */
export function getNameData(): NameData {
  return cachedNameData ?? FALLBACK_NAME_DATA;
}
