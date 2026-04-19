/**
 * scoringOptionsStore — per-team user override for the Coaching → Preferences
 * "Scoring Options" (1st / 2nd / 3rd option) editor.
 *
 * Persisted to localStorage and scoped per saveId so edits on one save don't
 * leak into another. Mirrors the gameplanStore pattern — GameContext calls
 * setActiveSaveId() whenever state.saveId changes.
 *
 * Design note on leak-safety: the baseline ordering (by usage*overall) is
 * recomputed live from roster ratings every render. This store only holds
 * the user's override IDs. If a player is traded/retired, the ID simply
 * vanishes from the roster and the UI falls back to baseline at that slot.
 *
 * Injured picks are preserved intentionally — the user explicitly asked that
 * "first option can still be injured, doesn't matter." The sim-side bias
 * helper decides whether to honor an injured override.
 */

export interface ScoringOptionsOverride {
  /** internalIds for 1st, 2nd, 3rd options (in that order). Length 3. */
  optionIds: string[];
  /** Epoch ms when the user last edited this team's options. */
  lastEdited: number;
}

const STORAGE_PREFIX = 'nba-commish-scoring-options::';
const DEFAULT_SAVE_ID = '__default';

let activeSaveId: string = DEFAULT_SAVE_ID;
let cache: Map<number, ScoringOptionsOverride> = new Map();
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
    const obj = JSON.parse(raw) as Record<string, ScoringOptionsOverride>;
    for (const [k, v] of Object.entries(obj)) cache.set(Number(k), v);
  } catch {
    // Corrupt storage — start fresh rather than crash.
  }
}

function persist() {
  try {
    const obj: Record<number, ScoringOptionsOverride> = {};
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

export function getScoringOptions(teamId: number): ScoringOptionsOverride | null {
  hydrate();
  return cache.get(teamId) ?? null;
}

export function saveScoringOptions(teamId: number, optionIds: string[]) {
  hydrate();
  cache.set(teamId, {
    optionIds: optionIds.slice(0, 3),
    lastEdited: Date.now(),
  });
  persist();
}

export function clearScoringOptions(teamId: number) {
  hydrate();
  cache.delete(teamId);
  persist();
}

/**
 * Computes per-player pts/efficiency multipliers from the gap between the
 * roster's baseline usage order and the user's override. Returned multipliers
 * are keyed by internalId and should be applied on top of existing gamePlan
 * mults in initial.ts (multiplicatively).
 *
 * Design: the "gap" is the slot distance a player moved. Moving #5 to the
 * #1 slot is a big promotion → larger ptsMult boost, larger efficiency
 * penalty (pushed past natural usage). Swapping #1 ↔ #2 is a small nudge.
 * If the user's override matches baseline, all mults are 1.0.
 *
 * @param baselineOrder internalIds sorted by usage*overall, descending
 * @param override      user's 3-option override (optionIds)
 * @returns             map: internalId → { ptsMult, effMult }
 */
export function getScoringOptionBiases(
  baselineOrder: string[],
  override: ScoringOptionsOverride | null
): Map<string, { ptsMult: number; effMult: number }> {
  const biases = new Map<string, { ptsMult: number; effMult: number }>();
  if (!override || override.optionIds.length === 0) return biases;

  // Slot-distance boosts: bigger slot jumps → bigger usage/efficiency swing.
  // Values tuned so a #1↔#2 swap is a ~5% nudge, #5→#1 a ~25% reach.
  const PTS_STEP = 0.05;   // +5% pts target per slot jumped
  const EFF_STEP = 0.025;  // -2.5% efficiency per slot jumped past natural

  override.optionIds.forEach((pid, userSlot) => {
    if (!pid) return;
    const baseSlot = baselineOrder.indexOf(pid);
    if (baseSlot < 0) return; // player not in rotation any more

    // delta > 0 = promoted (more usage, less efficient)
    // delta < 0 = demoted (less usage, slightly more efficient)
    const delta = baseSlot - userSlot;
    if (delta === 0) return; // matches baseline, no bias

    const ptsMult = 1 + delta * PTS_STEP;
    const effMult = 1 - Math.max(0, delta) * EFF_STEP + Math.max(0, -delta) * EFF_STEP * 0.5;
    biases.set(pid, {
      ptsMult: Math.max(0.7, Math.min(1.4, ptsMult)),
      effMult: Math.max(0.9, Math.min(1.05, effMult)),
    });
  });

  // Also slightly demote whoever held the 1st/2nd/3rd slots baseline but got
  // bumped out of the user's top-3 — they naturally lose some usage.
  baselineOrder.slice(0, 3).forEach((pid, baseSlot) => {
    if (override.optionIds.includes(pid)) return;
    // bumped out of top-3 entirely
    const delta = -(3 - baseSlot); // negative slot jump
    biases.set(pid, {
      ptsMult: Math.max(0.75, 1 + delta * PTS_STEP * 0.6),
      effMult: 1 + Math.abs(delta) * EFF_STEP * 0.3, // slight efficiency bump (less load)
    });
  });

  return biases;
}

/**
 * Team-strength penalty for picking the wrong 1st/2nd/3rd option. Unlike
 * getScoringOptionBiases (which just redistributes pts within a fixed team
 * total), this actually nerfs the W/L dice — coach fighting the roster loses
 * games, not just stat share.
 *
 * Only promotions past natural usage order count (delta > 0). Slot 0 is
 * weighted heaviest since the 1st option choice defines the team's identity;
 * getting #3 slightly wrong is forgivable.
 *
 * Returns a non-negative number in strength-points. Caller subtracts from
 * team strength in the winner-determination path. Capped at 5 so even a
 * maximal bad call isn't an auto-loss.
 *
 * Scale: #5→#1 pick = ~3.0 penalty (≈ losing home-court). Matches baseline = 0.
 */
export function getCoachingPenalty(
  baselineOrder: string[],
  override: ScoringOptionsOverride | null
): number {
  if (!override || override.optionIds.length === 0) return 0;

  const SLOT_WEIGHTS = [1.0, 0.6, 0.3]; // slot 0 hurts most
  let penalty = 0;

  override.optionIds.forEach((pid, userSlot) => {
    if (!pid) return;
    const baseSlot = baselineOrder.indexOf(pid);
    if (baseSlot < 0) return;
    const delta = baseSlot - userSlot;
    if (delta <= 0) return; // only penalize promotions, not demotions
    penalty += delta * (SLOT_WEIGHTS[userSlot] ?? 0.2) * 0.6;
  });

  return Math.min(5, penalty);
}
