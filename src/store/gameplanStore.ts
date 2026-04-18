/**
 * gameplanStore — per-team starter order + minute overrides.
 *
 * Backed by localStorage so the plan survives refresh. Written from the
 * Coaching → Gameplan tab (GM mode), read by WatchGamePreviewModal and the
 * StatGenerator sim engine so the coach's call is respected everywhere.
 */

export interface Gameplan {
  /** internalIds of the 5 starters, in position order (PG→SG→SF→PF→C). */
  starterIds: string[];
  /** internalId → minutes per game (user override). */
  minuteOverrides: Record<string, number>;
}

const STORAGE_KEY = 'nba-commish-gameplans';
const cache: Map<number, Gameplan> = new Map();
let hydrated = false;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, Gameplan>;
    for (const [k, v] of Object.entries(obj)) cache.set(Number(k), v);
  } catch {
    // Swallow — corrupt storage just means we start fresh.
  }
}

function persist() {
  try {
    const obj: Record<number, Gameplan> = {};
    for (const [k, v] of cache) obj[k] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Storage quota / disabled — not worth crashing for.
  }
}

export function getGameplan(teamId: number): Gameplan | null {
  hydrate();
  return cache.get(teamId) ?? null;
}

export function saveGameplan(teamId: number, plan: Gameplan) {
  hydrate();
  cache.set(teamId, plan);
  persist();
}

export function clearGameplan(teamId: number) {
  hydrate();
  cache.delete(teamId);
  persist();
}
