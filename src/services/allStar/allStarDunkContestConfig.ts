import { ApproachType, DeliveryType, DunkComposition, ObstacleType } from './allStarDunkContestTypes';

export const TIERS = [
  { tier: 1, req: 0, baseProb: 0.88, scoreRange: [32, 40] as [number, number], moves: ['two_hand', 'one_hand', 'tomahawk', 'reverse', 'rim_grazer', 'back_scratcher'] },
  { tier: 2, req: 76, baseProb: 0.72, scoreRange: [38, 44] as [number, number], moves: ['windmill', 'cradle', 'double_clutch', 'side_windmill', 'leaner', 'front_windmill'] },
  { tier: 3, req: 83, baseProb: 0.55, scoreRange: [42, 47] as [number, number], moves: ['three_sixty', 'elbow_hang', 'behind_the_back', 'super_scoop', 'wrong_way_360', 'self_alley_reverse'] },
  { tier: 4, req: 89, baseProb: 0.36, scoreRange: [46, 49] as [number, number], moves: ['eastbay', 'under_legs', 'soccer_flip', 'spinning_honey', 'windmill_switch', 'three_sixty_windmill'] },
  { tier: 5, req: 94, baseProb: 0.20, scoreRange: [48, 50] as [number, number], moves: ['scorpion', 'lost_and_found', 'the_540', 'btl_btb', 'rivera_360_btb_btl', 'rivera_kamikaze', 'rivera_double_btl', 'double_spin'] },
];

export const APPROACH_CEILING_MOD: Record<ApproachType, number> = { standard: 0, free_throw_line: 2, beyond_ft_line: 4, halfcourt: 6 };
export const DELIVERY_CEILING_MOD: Record<DeliveryType, number> = { self: 0, self_lob: 1, self_glass: 2, teammate_pass: 1, teammate_alley: 2, teammate_glass: 3 };
export const OBSTACLE_CEILING_MOD: Record<ObstacleType, number> = { none: 0, over_chair: 2, over_mascot: 2, over_car: 3, over_person_crouching: 3, over_person_standing: 5 };
export const APPROACH_PROB_MOD: Record<ApproachType, number> = { standard: 0, free_throw_line: -0.06, beyond_ft_line: -0.12, halfcourt: -0.2 };
export const DELIVERY_PROB_MOD: Record<DeliveryType, number> = { self: 0, self_lob: -0.02, self_glass: -0.05, teammate_pass: -0.02, teammate_alley: -0.04, teammate_glass: -0.07 };
export const OBSTACLE_PROB_MOD: Record<ObstacleType, number> = { none: 0, over_chair: -0.05, over_mascot: -0.04, over_car: -0.03, over_person_crouching: -0.08, over_person_standing: -0.15 };

export const INVALID_COMBOS: Array<{ reason: string; check: (c: DunkComposition) => boolean }> = [
  { reason: 'Cannot have obstacle AND halfcourt approach', check: c => c.approach === 'halfcourt' && c.obstacle !== 'none' },
  { reason: 'Teammate glass + obstacle = too chaotic', check: c => c.delivery === 'teammate_glass' && c.obstacle !== 'none' },
  { reason: 'Over car + halfcourt impossible', check: c => c.obstacle === 'over_car' && (c.approach === 'free_throw_line' || c.approach === 'beyond_ft_line' || c.approach === 'halfcourt') },
  { reason: 'Standard approach + self + no obstacle = boring (Tier 3+ only)', check: c => c.approach === 'standard' && c.delivery === 'self' && c.obstacle === 'none' && c.tier >= 3 },
  { reason: 'Halfcourt + teammate delivery', check: c => c.approach === 'halfcourt' && (c.delivery === 'teammate_alley' || c.delivery === 'teammate_glass') },
];

export function isValidCombo(comp: DunkComposition): boolean {
  return !INVALID_COMBOS.some(rule => rule.check(comp));
}

export const LEGENDARY_STACKS: Array<{ label: string; check: (c: DunkComposition) => boolean; forcedMin: number }> = [
  { label: 'FT line + under legs = Vince Carter', check: c => c.approach === 'free_throw_line' && c.move === 'under_legs', forcedMin: 50 },
  { label: 'FT line + eastbay = classic eastbay', check: c => c.approach === 'free_throw_line' && c.move === 'eastbay', forcedMin: 49 },
  { label: 'Over standing person + any BTL = insane', check: c => c.obstacle === 'over_person_standing' && ['eastbay', 'under_legs'].includes(c.move), forcedMin: 50 },
  { label: 'Over standing person + any move = minimum 49', check: c => c.obstacle === 'over_person_standing', forcedMin: 49 },
  { label: 'Teammate glass + under legs = creative masterpiece', check: c => c.delivery === 'teammate_glass' && ['under_legs', 'windmill', 'three_sixty'].includes(c.move), forcedMin: 48 },
  { label: 'Halfcourt self glass + any move = absolute chaos', check: c => c.approach === 'beyond_ft_line' && c.delivery === 'self_glass', forcedMin: 48 },
  { label: 'Over person crouching + BTL/windmill/360 = 48 minimum', check: c => c.obstacle === 'over_person_crouching' && ['under_legs', 'windmill', 'three_sixty', 'behind_the_back'].includes(c.move), forcedMin: 48 },
  { label: 'Signature Legendary Move - Floor at 49', check: c => ['scorpion', 'lost_and_found', 'the_540', 'btl_btb', 'rivera_360_btb_btl', 'rivera_double_btl'].includes(c.move), forcedMin: 49 },
  { label: 'Clean Tier 5 first attempt — floor at 48', check: c => c.tier === 5, forcedMin: 48 },
];

export const TOSS_TYPES = ['none', 'self_lob', 'off_backboard', 'behind_back', 'btl_toss'];

export const LEGENDARY_COMBOS = [
  { moves: ['eastbay', 'under_legs', 'spinning_honey'], props: ['leapover_short', 'leapover_tall'], forcedMin: 50, label: 'BTL/Eastbay + leapover = automatic 50' },
  { moves: ['windmill', 'behind_the_back', 'three_sixty', 'wrong_way_360', 'elbow_hang', 'spinning_honey', 'double_spin'], props: ['leapover_short', 'leapover_tall'], forcedMin: 48, label: 'Acrobatic + leapover = 48 minimum' },
  { moves: ['*'], props: ['leapover_tall'], forcedMin: 49, label: 'Any move + giant leapover = 49 minimum' },
  { moves: ['between_legs', 'eastbay', 'windmill', 'three_sixty'], props: ['alley_oop_assist'], forcedMin: 47, label: 'Flashy move + alley-oop assist = 47 minimum' },
  { moves: ['double_spin', 'honey_dip_360', 'eastbay_360', 'under_legs_rev', 'windmill_switch'], props: ['none'], forcedMin: 48, label: 'Clean Tier 5 first attempt floor' },
];
