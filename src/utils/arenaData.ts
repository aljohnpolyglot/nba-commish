/**
 * arenaData.ts
 * Lazy-loads NBA arena data from GitHub (no local copy).
 * Provides sync access once loaded, so it can be used anywhere.
 */

const ARENA_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbaarenas.json';

export interface ArenaInfo {
  team_name: string;
  arena_name: string;
  arena_location: string;
  seating_capacity: number;
  opening_year: number;
}

let arenaMap: Map<string, ArenaInfo> | null = null;
let loadPromise: Promise<void> | null = null;

/** Call once at app startup (GameContext) to pre-warm the cache. */
export function loadArenas(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(ARENA_URL)
    .then(r => r.json())
    .then((data: ArenaInfo[]) => {
      arenaMap = new Map();
      for (const a of data) {
        // Index by full team name, last word (e.g. "Lakers"), and abbreviation-like keys
        arenaMap.set(a.team_name.toLowerCase(), a);
        const lastWord = a.team_name.split(' ').pop()?.toLowerCase();
        if (lastWord) arenaMap.set(lastWord, a);
      }
    })
    .catch(() => {
      // Silently fail — arena data is supplementary
    });
  return loadPromise;
}

/**
 * Sync lookup once arenas are loaded. Returns null if not yet loaded or no match.
 * Matches by full team name ("Golden State Warriors") or last word ("Warriors").
 */
export function getArenaForTeam(teamName: string): ArenaInfo | null {
  if (!arenaMap) return null;
  const lower = teamName.toLowerCase();
  if (arenaMap.has(lower)) return arenaMap.get(lower)!;
  // Try last word
  const lastWord = lower.split(' ').pop();
  if (lastWord && arenaMap.has(lastWord)) return arenaMap.get(lastWord)!;
  return null;
}

export function isArenaDataLoaded(): boolean {
  return arenaMap !== null;
}
