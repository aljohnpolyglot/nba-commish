/**
 * matchupAssignmentsStore — per-team Hunt/Avoid defensive priorities for the
 * Coaching → Defense tab. Stores three "Lockdown" picks (our defenders ranked
 * by who gets the toughest assignment) and three "Hide" picks (defenders the
 * sim should keep AWAY from elite scorers).
 *
 * Mirrors scoringOptionsStore + the FIRST/SECOND/THIRD chevron pattern used
 * in Coaching → Preferences.
 *
 * Phase 1 stores presentation + persistence. Sim wiring (skewed defender-vs-
 * scorer matchup probabilities, FT-rate vs hunted defenders, etc.) is deferred
 * to Phase 3 of COACHING_DEPTH_ROADMAP.md.
 */

import { createSaveScopedMapStore } from './saveScopedMapStore';

export interface MatchupAssignments {
  /** internalIds of our top-3 lockdown defenders, in priority order. */
  lockdownIds: string[];
  /** internalIds of our top-3 hide candidates (won't be matched onto opp scorers). */
  hideIds: string[];
  lastEdited: number;
}

const store = createSaveScopedMapStore<MatchupAssignments>('nba-commish-matchup-assignments');

export const setActiveSaveId = store.setActiveSaveId;

export function getMatchupAssignments(teamId: number): MatchupAssignments | null {
  return store.get(teamId) ?? null;
}

export function saveMatchupAssignments(teamId: number, lockdownIds: string[], hideIds: string[]) {
  store.set(teamId, {
    lockdownIds: lockdownIds.slice(0, 3),
    hideIds: hideIds.slice(0, 3),
    lastEdited: Date.now(),
  });
}
