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
  /**
   * Per-team bench depth (0–100). Controls how many players get meaningful
   * minutes when auto-seeding: 0=5-man, 50=9-man (default), 100=13-man.
   * Only affects the Ideal Rotation UI — live game sims are unaffected.
   * When undefined, auto-computes from roster depth (AI teams use this path).
   */
  benchDepth?: number;
  /**
   * Explicit bench ordering (internalIds). When present and locked, the Ideal
   * tab renders bench players in this order instead of sorting by minutes.
   * Populated when the user copies a Gameplan to Ideal so the gameplan's
   * drag-arranged order is preserved.
   */
  benchOrder?: string[];
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
  const PER_PLAYER_CAP = 48;
  const rosterSet = new Set(currentRosterIds);
  const survivors: Record<string, number> = {};
  let orphanedMinutes = 0;
  for (const [id, mins] of Object.entries(stored)) {
    // Clamp stored values too — a pre-existing save could have been written
    // with a buggy redistribution that pushed someone over 48.
    const clamped = Math.max(0, Math.min(PER_PLAYER_CAP, mins));
    if (rosterSet.has(id)) survivors[id] = clamped;
    else orphanedMinutes += clamped;
  }
  if (orphanedMinutes > 0) {
    // Proportionally redistribute orphaned minutes, but respect the per-player
    // 48-min cap. Any overflow from capped players spills to survivors that
    // still have headroom, in repeated passes.
    const allocate = () => {
      const eligible = Object.keys(survivors).filter(id => survivors[id] < PER_PLAYER_CAP);
      if (eligible.length === 0) return 0;
      const eligibleTotal = eligible.reduce((a, id) => a + survivors[id], 0);
      let absorbed = 0;
      if (eligibleTotal > 0) {
        for (const id of eligible) {
          const share = survivors[id] / eligibleTotal;
          const want = orphanedMinutes * share;
          const room = PER_PLAYER_CAP - survivors[id];
          const add = Math.min(want, room);
          survivors[id] = Math.round(survivors[id] + add);
          absorbed += add;
        }
      } else {
        // No survivor has minutes — split evenly across the eligible pool.
        const per = orphanedMinutes / eligible.length;
        for (const id of eligible) {
          const room = PER_PLAYER_CAP - survivors[id];
          const add = Math.min(per, room);
          survivors[id] = Math.round(survivors[id] + add);
          absorbed += add;
        }
      }
      return absorbed;
    };
    // Iterate until the orphaned pool is absorbed or no headroom remains.
    let guard = 5;
    while (orphanedMinutes > 0.5 && guard-- > 0) {
      const taken = allocate();
      if (taken <= 0) break;
      orphanedMinutes -= taken;
    }
    // Any leftover (everyone hit 48) is simply dropped — UI will show the
    // team under 240 and the Auto-Distribute button can reshape it.
  }
  // Ensure every current roster id has a key (even if 0) so UI can render.
  for (const id of currentRosterIds) {
    if (!(id in survivors)) survivors[id] = 0;
    else survivors[id] = Math.max(0, Math.min(PER_PLAYER_CAP, survivors[id]));
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
