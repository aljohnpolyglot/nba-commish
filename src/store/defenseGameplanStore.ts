/**
 * defenseGameplanStore — per-team defensive scheme picks for the Coaching →
 * Defense tab. Persisted to localStorage via createSaveScopedMapStore.
 *
 * Phase 1 scope: stores the team-level defensive base. Per-game / per-night
 * overrides are not modeled here — that's Phase 3 of COACHING_DEPTH_ROADMAP.md.
 * Sim wiring is also out of scope; this is presentation + persistence only.
 */

import { createSaveScopedMapStore } from './saveScopedMapStore';

export type DefenseTemplate =
  | 'Drop & Recover'
  | 'Switch Everything'
  | 'Blitz the Stars'
  | 'Wall Up'
  | 'No Middle Death'
  | 'Custom';

export type PnrBallHandler =
  | 'Drop' | 'Soft Hedge' | 'Hard Hedge' | 'Ice / Down' | 'Switch' | 'Blitz';

export type PnrRollMan =
  | 'Tag' | 'X-Out' | 'Nail Help' | 'No Help';

export type OffBallScreens =
  | 'Lock & Trail' | 'Top Lock' | 'Chase / Top' | 'Switch' | 'Under';

export type IsoCoverage =
  | 'Force Baseline' | 'Force Middle' | 'No Middle' | 'Force Weak Hand';

export type DoublePolicy = 'Never' | 'Stars Only' | 'Always';
export type Pickup = 'Full Court' | '3/4 Court' | 'Half Court' | 'Pack Line';
export type ZoneVsMan = 'Man' | '2-3 Zone' | '3-2 Zone' | 'Match-Up Zone' | 'Box-and-1' | 'Triangle-and-2';

export interface DefenseGameplan {
  template: DefenseTemplate;
  pnrBallHandler: PnrBallHandler;
  pnrRollMan: PnrRollMan;
  offBallScreens: OffBallScreens;
  iso: IsoCoverage;
  doubleOnPost: DoublePolicy;
  doubleOnDrive: DoublePolicy;
  pickup: Pickup;
  zoneVsMan: ZoneVsMan;
  lastEdited: number;
}

export const DEFENSE_TEMPLATES: Record<Exclude<DefenseTemplate, 'Custom'>, Omit<DefenseGameplan, 'template' | 'lastEdited'>> = {
  'Drop & Recover': {
    pnrBallHandler: 'Drop', pnrRollMan: 'Tag', offBallScreens: 'Lock & Trail',
    iso: 'No Middle', doubleOnPost: 'Never', doubleOnDrive: 'Never',
    pickup: 'Half Court', zoneVsMan: 'Man',
  },
  'Switch Everything': {
    pnrBallHandler: 'Switch', pnrRollMan: 'No Help', offBallScreens: 'Switch',
    iso: 'Force Weak Hand', doubleOnPost: 'Never', doubleOnDrive: 'Never',
    pickup: 'Half Court', zoneVsMan: 'Man',
  },
  'Blitz the Stars': {
    pnrBallHandler: 'Blitz', pnrRollMan: 'X-Out', offBallScreens: 'Top Lock',
    iso: 'Force Baseline', doubleOnPost: 'Stars Only', doubleOnDrive: 'Stars Only',
    pickup: '3/4 Court', zoneVsMan: 'Man',
  },
  'Wall Up': {
    pnrBallHandler: 'Ice / Down', pnrRollMan: 'Tag', offBallScreens: 'Under',
    iso: 'Force Middle', doubleOnPost: 'Never', doubleOnDrive: 'Never',
    pickup: 'Pack Line', zoneVsMan: 'Man',
  },
  'No Middle Death': {
    pnrBallHandler: 'Hard Hedge', pnrRollMan: 'Nail Help', offBallScreens: 'Chase / Top',
    iso: 'No Middle', doubleOnPost: 'Stars Only', doubleOnDrive: 'Always',
    pickup: 'Half Court', zoneVsMan: 'Man',
  },
};

/** Maps a high-level game-plan template to its primary trainable system in
 *  `defensiveSystemDescriptions`. Used by the Defense tab to look up the
 *  team's per-system familiarity for that template. */
export const TEMPLATE_TO_SYSTEM: Record<Exclude<DefenseTemplate, 'Custom'>, string> = {
  'Drop & Recover': 'Drop Coverage',
  'Switch Everything': 'Switch Everything',
  'Blitz the Stars': 'Blitz / Trap',
  'Wall Up': 'Pack Line',
  'No Middle Death': 'No Middle',
};

export const DEFAULT_DEFENSE_GAMEPLAN: DefenseGameplan = {
  template: 'Drop & Recover',
  ...DEFENSE_TEMPLATES['Drop & Recover'],
  lastEdited: 0,
};

const store = createSaveScopedMapStore<DefenseGameplan>('nba-commish-defense-gameplan');

export const setActiveSaveId = store.setActiveSaveId;

export function getDefenseGameplan(teamId: number): DefenseGameplan {
  return store.get(teamId) ?? DEFAULT_DEFENSE_GAMEPLAN;
}

export function saveDefenseGameplan(teamId: number, plan: Omit<DefenseGameplan, 'lastEdited'>) {
  store.set(teamId, { ...plan, lastEdited: Date.now() });
}

export function applyDefenseTemplate(teamId: number, template: Exclude<DefenseTemplate, 'Custom'>) {
  saveDefenseGameplan(teamId, { template, ...DEFENSE_TEMPLATES[template] });
}
