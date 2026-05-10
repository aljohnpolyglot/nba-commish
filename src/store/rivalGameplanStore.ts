/**
 * rivalGameplanStore — per-opponent-team targeting plans for our team.
 * Per Roadmap §3.3 + the 2K-style brainstorm: each rival team gets up to
 * two priority targets we want the sim to hunt down with a specific action.
 *
 * Persistence model:
 *  - Keyed by `ourTeamId → opponentTid → RivalPlan`.
 *  - Set once, lives the whole season — NOT a per-game thing. The "kein defense
 *    weil das kann tag nach tag andern" directive: per-rival is set once and
 *    sticks, day-to-day variation comes from Defender Detail / Lockdown-Hide.
 *  - Auto-reconciles: when a target player is no longer on the opponent's
 *    roster (trade / cut / retirement), the entry is silently dropped at read
 *    time — UI re-prompts for a new pick on next open.
 *
 * Sim-wiring is its own follow-up.
 */

import { createSaveScopedMapStore } from './saveScopedMapStore';

export type RivalAction =
  | 'Always Double'        // any catch in their hand triggers a double
  | 'Blitz on PnR'         // every screen they touch gets trapped
  | 'Force Weak Hand'      // stay on strong shoulder, push to weak side
  | 'Top Lock Off-Ball'    // deny the catch (pure shooter)
  | 'Switch & Hunt'        // smaller defender attacks them on switches
  | 'Pack & Sag';          // dare the jumper, no help, no double

export const RIVAL_ACTIONS: RivalAction[] = [
  'Always Double',
  'Blitz on PnR',
  'Force Weak Hand',
  'Top Lock Off-Ball',
  'Switch & Hunt',
  'Pack & Sag',
];

export interface RivalPlan {
  primaryTargetId?: string;
  primaryAction?: RivalAction;
  secondaryTargetId?: string;
  secondaryAction?: RivalAction;
  /** Free-text scouting note — coach memo, not consumed by sim. */
  notes?: string;
  lastEdited: number;
}

/** ourTeamId → (opponentTid → RivalPlan) */
type OpponentMap = Record<number, RivalPlan>;

const store = createSaveScopedMapStore<OpponentMap>('nba-commish-rival-gameplan');

export const setActiveSaveId = store.setActiveSaveId;

export function getRivalPlan(ourTeamId: number, opponentTid: number): RivalPlan | null {
  return store.get(ourTeamId)?.[opponentTid] ?? null;
}

export function getAllRivalPlans(ourTeamId: number): OpponentMap {
  return store.get(ourTeamId) ?? {};
}

export function saveRivalPlan(ourTeamId: number, opponentTid: number, plan: Omit<RivalPlan, 'lastEdited'>) {
  const existing = store.get(ourTeamId) ?? {};
  store.set(ourTeamId, {
    ...existing,
    [opponentTid]: { ...plan, lastEdited: Date.now() },
  });
}

export function clearRivalPlan(ourTeamId: number, opponentTid: number) {
  const existing = store.get(ourTeamId);
  if (!existing || !existing[opponentTid]) return;
  const next = { ...existing };
  delete next[opponentTid];
  store.set(ourTeamId, next);
}

export function clearAllRivalPlans(ourTeamId: number) {
  store.delete(ourTeamId);
}

/**
 * Returns the plan with traded/missing target IDs blanked out. Caller should
 * decide whether to delete a fully-empty plan or keep it for the user to fill in.
 */
export function reconcileRivalPlan(plan: RivalPlan, opponentRosterIds: Set<string>): RivalPlan {
  const next: RivalPlan = { ...plan };
  if (next.primaryTargetId && !opponentRosterIds.has(next.primaryTargetId)) {
    next.primaryTargetId = undefined;
    next.primaryAction = undefined;
  }
  if (next.secondaryTargetId && !opponentRosterIds.has(next.secondaryTargetId)) {
    next.secondaryTargetId = undefined;
    next.secondaryAction = undefined;
  }
  return next;
}
