/**
 * defenderDetailStore — per-defender coverage configuration for the
 * Coaching → Defense → "Defender Detail" section. Roadmap §3.2.
 *
 * Each entry is keyed by our defender's internalId (not by opponent — these
 * are the baseline tendencies we want each player to play with, regardless of
 * matchup). Per-game opponent-specific overrides are a future Phase 3 layer.
 *
 * Phase 1 stores presentation + persistence. Sim wiring (per-player closeout
 * speed, deny effectiveness, foul-rate from body pressure) lands in a separate
 * StatGenerator-knob pass.
 */

import { createSaveScopedMapStore } from './saveScopedMapStore';

export type BodyPressure = 'Tight (Body-Up)' | 'Standard' | 'Sag Off' | 'Bump-and-Recover';
export type DenyLevel = 'Full Deny' | 'Standard Deny' | 'Allow Catch';
export type CloseoutStyle = 'Hard / Run-By Risk' | 'Controlled (Short)' | 'Stunt & Recover';
export type HelpBehavior = 'Always Help' | 'Stunt Only' | 'Stay Attached';
export type ReboundBehavior = 'Crash' | 'Standard' | 'Stay Home for Transition';

/** Per-defender override of the team-wide scheme. `undefined` = inherit team default.
 *  Mirrors Roadmap §3.2 vs-Luka / vs-Steph examples (one defender blitzes every PnR
 *  even though team is Drop, etc.). */
export type PnrOverride = 'Inherit' | 'Drop' | 'Switch' | 'Hard Hedge' | 'Blitz' | 'Ice / Down';
export type DoublingOverride = 'Inherit' | 'Never Double' | 'Always Double';

export interface SchemeOverride {
  pnr: PnrOverride;
  doubling: DoublingOverride;
}

export interface DefenderDetail {
  bodyPressure: BodyPressure;
  denyLevel: DenyLevel;
  closeout: CloseoutStyle;
  help: HelpBehavior;
  rebound: ReboundBehavior;
  /** Optional per-defender scheme override. Default = both Inherit (no override). */
  scheme?: SchemeOverride;
}

export const DEFAULT_DEFENDER_DETAIL: DefenderDetail = {
  bodyPressure: 'Standard',
  denyLevel: 'Standard Deny',
  closeout: 'Controlled (Short)',
  help: 'Stunt Only',
  rebound: 'Standard',
  scheme: { pnr: 'Inherit', doubling: 'Inherit' },
};

type TeamMap = Record<string, DefenderDetail>;

const store = createSaveScopedMapStore<TeamMap>('nba-commish-defender-detail');

export const setActiveSaveId = store.setActiveSaveId;

export function getDefenderDetail(teamId: number, defenderId: string): DefenderDetail {
  return store.get(teamId)?.[defenderId] ?? DEFAULT_DEFENDER_DETAIL;
}

export function getTeamDefenderDetails(teamId: number): TeamMap {
  return store.get(teamId) ?? {};
}

export function saveDefenderDetail(teamId: number, defenderId: string, detail: DefenderDetail) {
  const existing = store.get(teamId) ?? {};
  store.set(teamId, { ...existing, [defenderId]: detail });
}

export function resetDefenderDetail(teamId: number, defenderId: string) {
  const existing = store.get(teamId);
  if (!existing || !existing[defenderId]) return;
  const next = { ...existing };
  delete next[defenderId];
  store.set(teamId, next);
}

export function resetAllDefenderDetails(teamId: number) {
  store.delete(teamId);
}
