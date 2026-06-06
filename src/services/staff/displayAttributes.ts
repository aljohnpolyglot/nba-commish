
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
export type StaffAttributeProfile = 'default' | 'nba';
export type StaffRatingEntity = {
  attributeSeed?: number;
  attributeProfile?: StaffAttributeProfile;
  attributeOverrides?: Partial<StaffAttributes>;
  rating?: number;
  reputation?: number;
  name?: string;
  role?: string;
  position?: string;
  coachingYears?: number;
  playingYears?: number;
};
type StaffAttrContext = {
  role?: string;
  attributeProfile?: StaffAttributeProfile;
  attributeOverrides?: Partial<StaffAttributes>;
};

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

const ATTRIBUTE_TOOLTIPS: Record<AttrKey, string> = {
  tactics: 'How well this staff member prepares game plans and adjusts during games.',
  offense: 'How much this staff member helps your team create better offense.',
  defense: 'How much this staff member helps your team defend better.',
  motivating: 'How well this staff member keeps players confident and focused.',
  manManagement: 'How well this staff member handles personalities and locker-room balance.',
  levelOfDiscipline: 'How strongly this staff member sets standards and accountability.',
  conditioning: 'How well this staff member supports fitness and stamina over the season.',
  physiotherapy: 'How well this staff member supports recovery and return from injuries.',
  sportsScience: 'How well this staff member manages workload and injury prevention.',
  development: 'How well this staff member helps players improve over time.',
  adaptability: 'How quickly this staff member adjusts to new players and situations.',
  determination: 'How consistently this staff member pushes daily improvement.',
  judgingPlayerAbility: 'How well this staff member reads current player quality.',
  judgingPlayerPotential: 'How well this staff member reads long-term upside.',
  negotiating: 'How well this staff member handles contract and deal talks.',
};

export function getStaffAttributeTooltip(key: AttrKey): string {
  return ATTRIBUTE_TOOLTIPS[key];
}

/** Build the full 15-attribute StaffAttributes object from a single seed.
 *  Same seed → same attributes — used at staff generation and re-derived
 *  on demand for the ratings detail modal. */
const STAFF_ATTR_KEYS = [
  'offense',
  'defense',
  'tactics',
  'development',
  'conditioning',
  'adaptability',
  'determination',
  'levelOfDiscipline',
  'manManagement',
  'motivating',
  'physiotherapy',
  'sportsScience',
  'judgingPlayerAbility',
  'judgingPlayerPotential',
  'negotiating',
] as const satisfies AttrKey[];

const NBA_ROLE_BASES: Record<string, Partial<StaffAttributes>> = {
  'Head Coach': {
    tactics: 90, offense: 92, defense: 82, motivating: 89, manManagement: 87,
    levelOfDiscipline: 78, adaptability: 85, determination: 86,
  },
  'Assistant Coach': {
    tactics: 86, offense: 88, defense: 85, development: 82, adaptability: 76,
    levelOfDiscipline: 70, motivating: 71, determination: 75,
  },
  'Head of Sports Science': {
    sportsScience: 78, conditioning: 73, determination: 79, adaptability: 69,
    development: 73, manManagement: 71, levelOfDiscipline: 73, motivating: 68,
  },
  'Head Physio': {
    physiotherapy: 82, sportsScience: 76, conditioning: 72, determination: 80,
    adaptability: 68, manManagement: 70, levelOfDiscipline: 73, motivating: 67,
  },
  'Player Development Coach': {
    development: 80, motivating: 77, manManagement: 79, adaptability: 74,
    tactics: 71, offense: 77, defense: 72, determination: 73,
  },
  'Chief Scout': {
    judgingPlayerAbility: 79, judgingPlayerPotential: 76, negotiating: 67,
    determination: 69, adaptability: 70, manManagement: 75, tactics: 68,
    levelOfDiscipline: 77,
  },
  'Head of Analytics': {
    sportsScience: 70, judgingPlayerAbility: 68, judgingPlayerPotential: 81,
    tactics: 74, offense: 79, defense: 74, adaptability: 76, determination: 74,
  },
};

function baseRoleFor(role: string | undefined): string {
  return String(role ?? '').replace(/ \d+$/, '').trim();
}

function defaultStaffAttrs(seed: number): StaffAttributes {
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

function buildNbaStaffAttrs(seed: number, role: string | undefined): StaffAttributes {
  const baseRole = baseRoleFor(role);
  const overrides = NBA_ROLE_BASES[baseRole];
  if (!overrides) return defaultStaffAttrs(seed);
  const next = defaultStaffAttrs(seed);
  for (let i = 0; i < STAFF_ATTR_KEYS.length; i++) {
    const key = STAFF_ATTR_KEYS[i];
    const target = overrides[key];
    if (target == null) continue;
    const drift = ((Math.abs(seed * 17 + i * 41) % 9) - 4);
    next[key] = Math.max(45, Math.min(99, target + drift));
  }
  return next;
}

export function buildStaffAttrs(seed: number, context?: StaffAttrContext): StaffAttributes {
  const base = context?.attributeProfile === 'nba'
    ? buildNbaStaffAttrs(seed, context.role)
    : defaultStaffAttrs(seed);
  return context?.attributeOverrides ? { ...base, ...context.attributeOverrides } : base;
}

/** Build attributes for a real NBA coach. If the name matches an entry in the
 *  `nbacoachesratings` gist (curated HC or seeded AC), use those values so
 *  Doc Rivers really does show 58 tactics while Steve Kerr shows 99 offense.
 *  Falls back to the local seeded values for unknown names (fictional coaches,
 *  Euro staff, etc.). */
export function attrsForCoach(name: string | undefined | null, fallbackSeed: number, context?: StaffAttrContext): StaffAttributes {
  if (context?.attributeOverrides) return buildStaffAttrs(fallbackSeed, context);
  if (name) {
    const entry = getCoachRatings(name);
    if (entry) return entry.attributes as StaffAttributes;
  }
  return buildStaffAttrs(fallbackSeed, context);
}

/** Build the card/signing-modal display rows for a role. Slot variants like
 *  'Assistant Coach 2' fall back to the base role's keys. */
export function buildDisplayAttributes(role: string, seed: number, name?: string | null, context?: StaffAttrContext): Array<[string, number]> {
  const attrs = attrsForCoach(name, seed, { ...context, role });
  const baseRole = baseRoleFor(role);
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

function capNewCoachRating(role: string, rating: number): number {
  const baseRole = role.replace(/ \d+$/, '');
  const caps: Record<string, number> = {
    'Head Coach': 82,
    'Assistant Coach': 80,
    'Player Development Coach': 81,
    'Head of Sports Science': 79,
    'Head Physio': 79,
    'Chief Scout': 79,
    'Head of Analytics': 79,
  };
  const cap = caps[baseRole] ?? 80;
  return Math.min(cap, rating);
}

function isFreshPlayerToStaff(person: { coachingYears?: number; playingYears?: number }): boolean {
  const coachingYears = Number(person?.coachingYears ?? 0);
  const playingYears = Number(person?.playingYears ?? 0);
  return coachingYears <= 0 && playingYears > 0;
}

export function resolveStaffRating(role: string, person: StaffRatingEntity): number {
  if (Number.isFinite(Number(person.rating))) {
    const persisted = Math.round(Number(person.rating));
    return isFreshPlayerToStaff(person) ? capNewCoachRating(role, persisted) : persisted;
  }
  const attrs = attrsForCoach(person.name, seedForStaff(person), {
    role,
    attributeProfile: person.attributeProfile,
    attributeOverrides: person.attributeOverrides,
  });
  const computed = computeStaffOverall(role, attrs);
  return isFreshPlayerToStaff(person) ? capNewCoachRating(role, computed) : computed;
}

/** Convenience: compute overall directly from a person record. Real NBA
 *  coaches use their curated/seeded gist entry; everyone else uses the
 *  hashed-name seed → buildStaffAttrs path. */
export function staffOverallFor(role: string, person: StaffRatingEntity): number {
  return resolveStaffRating(role, person);
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
