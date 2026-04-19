/**
 * coachStrategyLockStore — per-team user lock on Coach Sliders (Strategy +
 * Preferences tabs). coachSliders are normally recomputed every render from
 * the team's roster, which means trades/injuries can quietly shift a team's
 * identity (Tempo drops, Shot 3PT falls off, etc). Locking snapshots the
 * current values so roster churn doesn't silently rewrite strategy.
 *
 * Persisted to localStorage, scoped per saveId. Same pattern as
 * scoringOptionsStore / gameplanStore / tradingBlockStore. GameContext wires
 * setActiveSaveId() whenever state.saveId changes so no cross-save leak.
 *
 * The sim (engine.ts) reads via getLockedStrategy() and falls back to a
 * fresh roster-derived computation when not locked.
 */
import type { CoachSliders } from '../utils/coachSliders';

export interface LockedStrategy {
  sliders: CoachSliders;
  lockedAt: number;
}

const STORAGE_PREFIX = 'nba-commish-coach-strategy::';
const DEFAULT_SAVE_ID = '__default';

let activeSaveId: string = DEFAULT_SAVE_ID;
let cache: Map<number, LockedStrategy> = new Map();
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
    const obj = JSON.parse(raw) as Record<string, LockedStrategy>;
    for (const [k, v] of Object.entries(obj)) cache.set(Number(k), v);
  } catch {
    // Corrupt storage — start fresh rather than crash.
  }
}

function persist() {
  try {
    const obj: Record<number, LockedStrategy> = {};
    for (const [k, v] of cache) obj[k] = v;
    localStorage.setItem(storageKey(activeSaveId), JSON.stringify(obj));
  } catch {
    // Quota / disabled storage — silent.
  }
}

export function setActiveSaveId(saveId: string | undefined | null) {
  const next = saveId && saveId.length > 0 ? saveId : DEFAULT_SAVE_ID;
  if (next === activeSaveId) return;
  activeSaveId = next;
  hydratedFor = null;
}

export function getLockedStrategy(teamId: number): LockedStrategy | null {
  hydrate();
  return cache.get(teamId) ?? null;
}

export function isStrategyLocked(teamId: number): boolean {
  return getLockedStrategy(teamId) !== null;
}

export function lockStrategy(teamId: number, sliders: CoachSliders) {
  hydrate();
  cache.set(teamId, { sliders: { ...sliders }, lockedAt: Date.now() });
  persist();
}

export function unlockStrategy(teamId: number) {
  hydrate();
  cache.delete(teamId);
  persist();
}
