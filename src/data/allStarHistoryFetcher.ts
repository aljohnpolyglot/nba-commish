/**
 * All-Star history fetcher — pulls official NBA All-Star Game history from gist.
 * Cached in-memory per-session; not persisted. Same pattern as brefFetcher.
 */

export interface AllStarHistoryEntry {
  year: number;
  teams: string[];         // e.g. ["East", "West"] or ["Team LeBron", "Team Durant"]
  winner: string;
  final_score: Record<string, number>;
  host_arena: string;
  host_city: string;
  host_teams: string[];    // team names as strings (wiki-style)
  mvps: Array<{ name: string; team: string }>;
}

const GIST_URL =
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbaallstarhistory';

let cache: AllStarHistoryEntry[] | null = null;
let inflight: Promise<AllStarHistoryEntry[]> | null = null;

export async function fetchAllStarHistory(): Promise<AllStarHistoryEntry[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(GIST_URL);
      if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);
      const data = await res.json();
      cache = Array.isArray(data) ? data : [];
      return cache;
    } catch (e) {
      console.error('[AllStarHistory] fetch failed', e);
      cache = [];
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getCachedAllStarHistory(): AllStarHistoryEntry[] | null {
  return cache;
}
