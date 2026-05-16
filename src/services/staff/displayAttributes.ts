
/**
 * Single source of truth for staff attribute display.
 *
 * Three consumers use this:
 *   - StaffSection card (front-office staff list)
 *   - StaffSigningModal Key Attributes section
 *   - StaffRatingsModal full detail view
 *
 * They MUST agree on which attributes a role shows and what to call them —
 * the user noticed earlier that the three views had drifted apart with
 * different subsets and labels. Don't add another role→attr map elsewhere;
 * extend this one.
 */

import type { StaffAttributes } from '../../TeamTraining/types';
import { getCoachRatings } from '../staffService';

export type AttrKey = keyof StaffAttributes;

/** Card + signing-modal display: 8 most-relevant attributes per role.
 *  Always includes defense for any coaching role — Assistant Coaches drill
 *  defensive concepts daily, hiding it on the card was a regression. */
export const ROLE_DISPLAY_KEYS: Record<string, Array<[AttrKey, string]>> = {
  'Head Coach': [
    ['tactics', 'Tactics'], ['offense', 'Offense'], ['defense', 'Defense'],
    ['motivating', 'Motivation'], ['manManagement', 'Man-Mgmt'],
    ['levelOfDiscipline', 'Discipline'], ['adaptability', 'Adaptability'],
    ['determination', 'Determination'],
  ],
  'Assistant Coach': [
    ['tactics', 'Tactics'], ['offense', 'Offense'], ['defense', 'Defense'],
    ['development', 'Development'], ['adaptability', 'Adaptability'],
    ['levelOfDiscipline', 'Discipline'], ['motivating', 'Motivation'],
    ['determination', 'Determination'],
  ],
  'Head of Sports Science': [
    ['sportsScience', 'Sports Sci'], ['conditioning', 'Conditioning'],
    ['determination', 'Determination'], ['adaptability', 'Adaptability'],
    ['development', 'Development'], ['manManagement', 'Man-Mgmt'],
    ['levelOfDiscipline', 'Discipline'], ['motivating', 'Motivation'],
  ],
  'Head Physio': [
    ['physiotherapy', 'Physio'], ['sportsScience', 'Sports Sci'],
    ['conditioning', 'Conditioning'], ['determination', 'Determination'],
    ['adaptability', 'Adaptability'], ['manManagement', 'Man-Mgmt'],
    ['levelOfDiscipline', 'Discipline'], ['motivating', 'Motivation'],
  ],
  'Player Development Coach': [
    ['development', 'Development'], ['motivating', 'Motivation'],
    ['manManagement', 'Man-Mgmt'], ['adaptability', 'Adaptability'],
    ['tactics', 'Tactical IQ'], ['offense', 'Offense'],
    ['defense', 'Defense'], ['determination', 'Determination'],
  ],
  'Chief Scout': [
    ['judgingPlayerAbility', 'Ability'], ['judgingPlayerPotential', 'Potential'],
    ['negotiating', 'Negotiating'], ['determination', 'Determination'],
    ['adaptability', 'Adaptability'], ['manManagement', 'Man-Mgmt'],
    ['tactics', 'Tactical IQ'], ['levelOfDiscipline', 'Discipline'],
  ],
  'Head of Analytics': [
    ['sportsScience', 'Data Systems'], ['judgingPlayerAbility', 'Player Models'],
    ['judgingPlayerPotential', 'Pot. Models'], ['tactics', 'Tactical IQ'],
    ['offense', 'Offense'], ['defense', 'Defense'],
    ['adaptability', 'Adaptability'], ['determination', 'Determination'],
  ],
};

/** All 15 attributes grouped by category for the detail/ratings modal. */
export const STAFF_ATTRIBUTE_GROUPS: Array<{ label: string; keys: Array<[AttrKey, string]> }> = [
  { label: 'Coaching', keys: [
    ['tactics', 'Tactics'], ['offense', 'Offense'], ['defense', 'Defense'],
    ['motivating', 'Motivating'], ['manManagement', 'Man Management'],
    ['levelOfDiscipline', 'Discipline'],
  ]},
  { label: 'Performance & Care', keys: [
    ['conditioning', 'Conditioning'], ['physiotherapy', 'Physiotherapy'],
    ['sportsScience', 'Sports Science'],
  ]},
  { label: 'Development & Character', keys: [
    ['development', 'Development'], ['adaptability', 'Adaptability'],
    ['determination', 'Determination'],
  ]},
  { label: 'Scouting & Front Office', keys: [
    ['judgingPlayerAbility', 'Judging Ability'],
    ['judgingPlayerPotential', 'Judging Potential'],
    ['negotiating', 'Negotiating'],
  ]},
];

/** Build the full 15-attribute StaffAttributes object from a single seed.
 *  Same seed → same attributes — used at staff generation and re-derived
 *  on demand for the ratings detail modal. */
export function buildStaffAttrs(seed: number): StaffAttributes {
  const v = (base: number, off: number) =>
    Math.max(40, Math.min(95, base + ((Math.abs(seed + off * 37) % 21) - 10)));
  return {
    offense:              v(72, 1),
    defense:              v(70, 2),
    tactics:              v(75, 3),
    development:          v(73, 4),
    conditioning:         v(68, 5),
    adaptability:         v(71, 6),
    determination:        v(74, 7),
    levelOfDiscipline:    v(70, 8),
    manManagement:        v(72, 9),
    motivating:           v(73, 10),
    physiotherapy:        v(75, 11),
    sportsScience:        v(72, 12),
    judgingPlayerAbility: v(74, 13),
    judgingPlayerPotential:v(76, 14),
    negotiating:          v(70, 15),
  };
}

/** Build attributes for a real NBA coach. If the name matches an entry in the
 *  `nbacoachesratings` gist (curated HC or seeded AC), use those values so
 *  Doc Rivers really does show 58 tactics while Steve Kerr shows 99 offense.
 *  Falls back to the local seeded values for unknown names (fictional coaches,
 *  Euro staff, etc.). */
export function attrsForCoach(name: string | undefined | null, fallbackSeed: number): StaffAttributes {
  if (name) {
    const entry = getCoachRatings(name);
    if (entry) return entry.attributes as StaffAttributes;
  }
  return buildStaffAttrs(fallbackSeed);
}

/** Build the card/signing-modal display rows for a role. Slot variants like
 *  'Assistant Coach 2' fall back to the base role's keys. */
export function buildDisplayAttributes(role: string, seed: number): Array<[string, number]> {
  const attrs = buildStaffAttrs(seed);
  const baseRole = role.replace(/ \d+$/, '');
  const keys = ROLE_DISPLAY_KEYS[baseRole] ?? ROLE_DISPLAY_KEYS['Head Coach'];
  return keys.map(([key, label]) => [label, attrs[key]]);
}

/** Descending weights for the 8 role-display attributes. The first attribute
 *  in ROLE_DISPLAY_KEYS is the most important for the position (e.g. Tactics
 *  for HC, Physiotherapy for Head Physio), so it carries the most weight. */
const OVERALL_WEIGHTS = [5, 4, 3, 3, 2, 2, 1, 1] as const;

/** Compute a role-weighted overall rating from the full attribute object.
 *  Single source of truth used by StaffSection card, signing modal, and the
 *  ratings detail modal — all three must display identical numbers. */
export function computeStaffOverall(role: string, attrs: StaffAttributes): number {
  const baseRole = role.replace(/ \d+$/, '');
  const keys = ROLE_DISPLAY_KEYS[baseRole] ?? ROLE_DISPLAY_KEYS['Head Coach'];
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < keys.length; i++) {
    const w = OVERALL_WEIGHTS[i] ?? 1;
    weighted += attrs[keys[i][0]] * w;
    total += w;
  }
  return Math.round(weighted / total);
}

/** Convenience: compute overall directly from a person record. Real NBA
 *  coaches use their curated/seeded gist entry; everyone else uses the
 *  hashed-name seed → buildStaffAttrs path. */
export function staffOverallFor(role: string, person: { attributeSeed?: number; rating?: number; reputation?: number; name?: string }): number {
  const attrs = attrsForCoach(person.name, seedForStaff(person));
  return computeStaffOverall(role, attrs);
}

/** Deterministic seed for a staff person — use their stored seed if available,
 *  otherwise hash their name. Lets all three views derive identical attrs. */
export function seedForStaff(person: { attributeSeed?: number; rating?: number; reputation?: number; name?: string }): number {
  if (typeof person.attributeSeed === 'number') return person.attributeSeed;
  const baseRating = person.rating ?? person.reputation ?? 65;
  const name = person.name ?? '';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (Math.imul(31, hash) + name.charCodeAt(i)) | 0;
  return baseRating * 1000 + Math.abs(hash);
}
