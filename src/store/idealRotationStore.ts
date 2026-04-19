/**
 * idealRotationStore — per-team "ideal" rotation (full-strength, no injuries).
 *
 * Distinct from gameplanStore:
 *  - gameplanStore is the ACTIVE game-day plan (respects injuries)
 *  - idealRotationStore is the coach's perfect-world rotation baseline
 *
 * The idea: 90% of users will set an ideal once and let the sim derive the
 * game-day rotation from it (minus injuries, with minutes redistributed to
 * healthy players). Only power-users will tweak the active Gameplan tab per
 * matchup. Locking freezes the ideal against roster/injury shifts.
 *
 * Per-saveId scoped like every other store. No cross-save leak.
 */

export interface IdealRotation {
  /** internalIds of the 5 starters in position order (PG→SG→SF→PF→C). */
  starterIds: string[];
  /** internalId → minutes per game (in a perfect, injury-free game). */
  minutes: Record<string, number>;
  /** User-locked flag. When false, UI auto-recomputes from roster ratings. */
  locked: boolean;
  /** Epoch ms of last edit — useful for debugging stale entries. */
  lastEdited: number;
}

const STORAGE_PREFIX = 'nba-commish-ideal-rotation::';
const DEFAULT_SAVE_ID = '__default';

let activeSaveId: string = DEFAULT_SAVE_ID;
let cache: Map<number, IdealRotation> = new Map();
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
    const obj = JSON.parse(raw) as Record<string, IdealRotation>;
    for (const [k, v] of Object.entries(obj)) cache.set(Number(k), v);
  } catch {
    // Corrupt storage — start fresh rather than crash.
  }
}

function persist() {
  try {
    const obj: Record<number, IdealRotation> = {};
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

export function getIdealRotation(teamId: number): IdealRotation | null {
  hydrate();
  return cache.get(teamId) ?? null;
}

export function saveIdealRotation(teamId: number, plan: Omit<IdealRotation, 'lastEdited'>) {
  hydrate();
  cache.set(teamId, { ...plan, lastEdited: Date.now() });
  persist();
}

export function clearIdealRotation(teamId: number) {
  hydrate();
  cache.delete(teamId);
  persist();
}

/**
 * Redistribute minutes when roster changes have invalidated some stored ids.
 * Returns a fresh `minutes` record where:
 *   - IDs still on the team keep their stored minutes
 *   - Departing players' minutes are split across remaining rostered ids,
 *     weighted by their existing minute share so bigger rotation pieces
 *     absorb more of the vacated time
 *   - New roster additions land at 0 unless the caller assigns them
 *
 * The total is NOT renormalized to 240 here — leave that to the UI's auto-
 * distribute pass or the sim's own normalization.
 */
export function reconcileIdealMinutes(
  stored: Record<string, number>,
  currentRosterIds: string[]
): Record<string, number> {
  const rosterSet = new Set(currentRosterIds);
  const survivors: Record<string, number> = {};
  let orphanedMinutes = 0;
  for (const [id, mins] of Object.entries(stored)) {
    if (rosterSet.has(id)) survivors[id] = mins;
    else orphanedMinutes += mins;
  }
  if (orphanedMinutes > 0) {
    const survivorTotal = Object.values(survivors).reduce((a, b) => a + b, 0);
    if (survivorTotal > 0) {
      // Redistribute proportionally to existing share — starters absorb more.
      for (const id of Object.keys(survivors)) {
        const share = survivors[id] / survivorTotal;
        survivors[id] = Math.round(survivors[id] + orphanedMinutes * share);
      }
    } else if (currentRosterIds.length > 0) {
      // No survivors had minutes — split evenly across current roster.
      const per = Math.round(orphanedMinutes / currentRosterIds.length);
      for (const id of currentRosterIds) survivors[id] = (survivors[id] ?? 0) + per;
    }
  }
  // Ensure every current roster id has a key (even if 0) so UI can render.
  for (const id of currentRosterIds) {
    if (!(id in survivors)) survivors[id] = 0;
  }
  return survivors;
}

/**
 * Filter stored starters against current roster, then backfill any vacated
 * slots with the next best rotation player not already starting. Callers
 * typically pass the projected-starter list from StarterService as fallback.
 */
export function reconcileStarters(
  storedStarters: string[],
  currentRosterIds: string[],
  fallbackOrder: string[],
): string[] {
  const rosterSet = new Set(currentRosterIds);
  const kept = storedStarters.filter(id => rosterSet.has(id));
  const keptSet = new Set(kept);
  for (const id of fallbackOrder) {
    if (kept.length >= 5) break;
    if (keptSet.has(id) || !rosterSet.has(id)) continue;
    kept.push(id);
    keptSet.add(id);
  }
  return kept.slice(0, 5);
}
