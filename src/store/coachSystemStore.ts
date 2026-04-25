import { getSystemMods, SystemKnobMods } from '../services/simulation/SimulatorKnobs';

/**
 * coachSystemStore — per-team selected coaching system, localStorage-backed,
 * saveId-scoped. Mirrors the scoringOptionsStore pattern.
 *
 * When the user changes their system away from the best fit, the stored
 * proficiency scores feed getSystemFitPenalty(), which the game engine
 * applies as a W/L strength deduction + shooting-efficiency penalty.
 *
 * Teams that have never had their system changed return null → zero penalty
 * (i.e. all teams default to their best-fit system at game start).
 */

const STORAGE_PREFIX = 'nba-commish-coach-system::';
const DEFAULT_SAVE_ID = '__default';

export interface CoachSystemOverride {
  selectedSystem: string;
  selectedProfScore: number;
  bestProfScore: number;
}

let activeSaveId: string = DEFAULT_SAVE_ID;
let cache: Map<number, CoachSystemOverride> = new Map();
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
    const obj = JSON.parse(raw) as Record<string, CoachSystemOverride>;
    for (const [k, v] of Object.entries(obj)) cache.set(Number(k), v);
  } catch {
    // Corrupt storage — start fresh.
  }
}

function persist() {
  try {
    const obj: Record<number, CoachSystemOverride> = {};
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

export function getCoachSystem(teamId: number): CoachSystemOverride | null {
  hydrate();
  return cache.get(teamId) ?? null;
}

export function saveCoachSystem(
  teamId: number,
  selectedSystem: string,
  selectedProfScore: number,
  bestProfScore: number,
) {
  hydrate();
  cache.set(teamId, { selectedSystem, selectedProfScore, bestProfScore });
  persist();
}

/**
 * Returns the penalty for choosing a system that doesn't fit the roster.
 *
 * strengthPenalty — subtracted from baseTeamStrength in the engine (affects W/L).
 *   Scale: 1-star diff ≈ 0.6 pts (mild), 3-star ≈ 5.4 pts, 5-star ≈ 15 pts (max).
 *
 * efficiencyMult  — multiplied into the knobs.efficiencyMultiplier (affects FG%).
 *   Scale: 1-star ≈ ×0.96, 5-star ≈ ×0.80 (floor).
 *
 * Both are identity (0 / 1.0) when no override exists so teams that never
 * changed their system are unaffected.
 */
export function getSystemFitPenalty(teamId: number): {
  strengthPenalty: number;
  efficiencyMult: number;
} {
  hydrate();
  const override = cache.get(teamId);
  if (!override) return { strengthPenalty: 0, efficiencyMult: 1.0 };

  const rawDiff = Math.max(0, override.bestProfScore - override.selectedProfScore);
  const starDiff = Math.min(5, rawDiff / 10);

  return {
    strengthPenalty: Math.min(15, starDiff * starDiff * 0.6),
    efficiencyMult:  Math.max(0.80, 1.0 - starDiff * 0.04),
  };
}

/**
 * Returns the system-specific knob modifiers for the team's active system.
 * Falls back to best-fit system mods when no override stored.
 */
export function getSystemKnobMods(teamId: number): SystemKnobMods {
  hydrate();
  const override = cache.get(teamId);
  if (!override) return getSystemMods('Balanced'); // no penalty & no bonus until user sets system
  return getSystemMods(override.selectedSystem);
}
