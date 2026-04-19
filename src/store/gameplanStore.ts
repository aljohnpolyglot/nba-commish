/**
 * gameplanStore — per-team starter order + minute overrides.
 *
 * Backed by localStorage so the plan survives refresh. Written from the
 * Coaching → Gameplan tab (GM mode), read by WatchGamePreviewModal and the
 * StatGenerator sim engine so the coach's call is respected everywhere.
 *
 * Scoped per saveId: each save keeps its own bucket so minutes don't leak
 * when the user switches saves. GameContext calls setActiveSaveId() whenever
 * state.saveId changes.
 */

export interface Gameplan {
  /** internalIds of the 5 starters, in position order (PG→SG→SF→PF→C). */
  starterIds: string[];
  /**
   * Optional explicit bench ordering. When present, the Gameplan tab renders
   * bench rows in this order rather than the rotation engine's default. IDs
   * absent from the roster are filtered out on read. Optional for backwards
   * compatibility with older saves.
   */
  benchOrder?: string[];
  /** internalId → minutes per game (user override). */
  minuteOverrides: Record<string, number>;
}

const STORAGE_PREFIX = 'nba-commish-gameplans::';
const DEFAULT_SAVE_ID = '__default';

let activeSaveId: string = DEFAULT_SAVE_ID;
let cache: Map<number, Gameplan> = new Map();
let hydratedFor: string | null = null;

function storageKey(saveId: string) {
  return STORAGE_PREFIX + saveId;
}

function hydrate() {
  if (hydratedFor === activeSaveId) return;
  cache = new Map();
  hydratedFor = activeSaveId;
  try {
    const raw = localStorage.getItem(storageKey(activeSaveId));
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
    localStorage.setItem(storageKey(activeSaveId), JSON.stringify(obj));
  } catch {
    // Storage quota / disabled — not worth crashing for.
  }
}

/**
 * Switch the store to a different save. Clears in-memory cache and forces a
 * rehydrate from that save's bucket on next access. Call whenever the active
 * saveId changes (load, new game, switch save).
 */
export function setActiveSaveId(saveId: string | undefined | null) {
  const next = saveId && saveId.length > 0 ? saveId : DEFAULT_SAVE_ID;
  if (next === activeSaveId) return;
  activeSaveId = next;
  hydratedFor = null;
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

/**
 * Signed delta between the configured minutes total and the 240-min team budget.
 * Positive → under-allocated (need to add minutes); negative → over-allocated.
 * Returns 0 when no plan exists (nothing to fix).
 */
export function getMinutesDiff(teamId: number): number {
  hydrate();
  const plan = cache.get(teamId);
  if (!plan) return 0;
  const total = Object.values(plan.minuteOverrides).reduce((a, b) => a + b, 0);
  return 240 - total;
}
