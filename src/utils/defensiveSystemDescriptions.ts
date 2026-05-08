/**
 * defensiveSystemDescriptions — parallel to systemDescriptions (offensive).
 * Defensive system names listed here can be drilled in DailyPlanModal's
 * System Practice picker (Defense tab) and selected as the team's base
 * scheme in Coaching → Defense.
 *
 * Phase 1 wires this for selection + display only. Per-system Familiarity
 * tracking + Sim multiplier scaling lands in Phase 4 of
 * COACHING_DEPTH_ROADMAP.md.
 */

import type { SystemRequirement } from './systemDescriptions';

export const defensiveSystemDescriptions: Record<
  string,
  { desc: string; pos: string[]; neg: string[]; requirements: SystemRequirement[] }
> = {
  'Man-to-Man': {
    desc: 'Standard one-on-one assignments. The baseline every team starts with.',
    pos: ['Always available', 'No special personnel needed', 'Easy to teach'],
    neg: ['Vulnerable to elite isolation scorers', 'Demands matched-up assignments'],
    requirements: [
      { slot: 'Generalist Defender', archetypes: ['Defensive Wing', 'Two-Way Wing', 'Generalist', '3&D Wing'], importance: 'Essential' },
    ],
  },
  'Switch Everything': {
    desc: 'Switch every screen 1–4 (or 1–5) — modern small-ball anti-PnR scheme.',
    pos: ['Neutralizes pick-and-rolls', 'Prevents open shooters', 'Hard to scheme around'],
    neg: ['Mismatches in the post', 'Demands like-sized roster', 'Rebounding suffers'],
    requirements: [
      { slot: 'Switchable Wing', archetypes: ['Two-Way Wing', '3&D Wing', 'D&3 Wing', 'All-Around Wing'], importance: 'Essential' },
      { slot: 'Mobile Big', archetypes: ['Stretch Big', 'Two-Way Big', 'The Unicorn'], importance: 'Essential' },
    ],
  },
  'Drop Coverage': {
    desc: 'Big stays back at the rim on PnR — lives with mid-range, protects the paint.',
    pos: ['Elite rim protection', 'Stops drives', 'Keeps big out of foul trouble'],
    neg: ['Concedes mid-range jumpers', 'Hurts vs. pull-up shooters'],
    requirements: [
      { slot: 'Rim Protector', archetypes: ['Defensive Anchor', 'Traditional Center'], importance: 'Essential' },
      { slot: 'Point-of-Attack', archetypes: ['Defensive Pest', 'Two-Way PG'], importance: 'Secondary' },
    ],
  },
  'Hedge / Show': {
    desc: 'Big steps out on the ball-handler at the screen, then recovers to the roller.',
    pos: ['Disrupts ball-handler', 'Forces back-out passes', 'Breaks rhythm'],
    neg: ['Roll-man can leak free', 'Demands lateral big', 'Recovery windows are tight'],
    requirements: [
      { slot: 'Mobile Big', archetypes: ['Two-Way Big', 'Stretch Big', 'Defensive Anchor'], importance: 'Essential' },
      { slot: 'Tag Help', archetypes: ['Defensive Wing', 'Glue Guy', 'Two-Way Wing'], importance: 'Secondary' },
    ],
  },
  'Ice / Down': {
    desc: 'Force the PnR to the baseline — big stays behind, no middle penetration.',
    pos: ['Removes middle-third drives', 'Funnels into help', 'Predictable for help defenders'],
    neg: ['Concedes baseline drives', 'Corner-3 vulnerability'],
    requirements: [
      { slot: 'Active POA', archetypes: ['Defensive Pest', 'Two-Way PG', '3&D Guard'], importance: 'Essential' },
      { slot: 'Backline Anchor', archetypes: ['Defensive Anchor', 'Traditional Center'], importance: 'Secondary' },
    ],
  },
  'Blitz / Trap': {
    desc: 'Aggressive double on the ball-handler at the screen — force the give-up pass.',
    pos: ['Forces turnovers', 'Disrupts elite scorers', 'Speeds up tempo'],
    neg: ['4-on-3 if rotations break', 'Foul-prone', 'Demands hyperactive helpers'],
    requirements: [
      { slot: 'Active Big', archetypes: ['Two-Way Big', 'Defensive Anchor'], importance: 'Essential' },
      { slot: 'Lockdown Guard', archetypes: ['Defensive Pest', 'Two-Way PG'], importance: 'Essential' },
      { slot: 'Rotation Wing', archetypes: ['Defensive Wing', 'Two-Way Wing', 'Glue Guy'], importance: 'Secondary' },
    ],
  },
  'Pack Line': {
    desc: 'Compress the paint, dare opponents to shoot from outside.',
    pos: ['Shuts down drives', 'Limits free throws', 'Strong DREB positioning'],
    neg: ['Concedes open 3PT', 'Vulnerable to elite shooting teams'],
    requirements: [
      { slot: 'Help Anchor', archetypes: ['Defensive Anchor', 'Traditional Center', 'Interior Enforcer'], importance: 'Essential' },
      { slot: 'Recovery Wing', archetypes: ['Defensive Wing', '3&D Wing', 'Glue Guy'], importance: 'Secondary' },
    ],
  },
  'No Middle': {
    desc: 'Force every drive to the sideline or baseline — never let the middle open up.',
    pos: ['Predictable shape', 'Forces tough angles', 'Pairs with strong-side help'],
    neg: ['Foul-rate spikes', 'Concedes corner-3s when help blows'],
    requirements: [
      { slot: 'Athletic Wing', archetypes: ['Defensive Wing', 'Two-Way Wing', '3&D Wing'], importance: 'Essential' },
      { slot: 'Helper Big', archetypes: ['Defensive Anchor', 'Two-Way Big'], importance: 'Secondary' },
    ],
  },
  '2-3 Zone': {
    desc: 'Two guards top, three forwards/big across the baseline — protect the paint.',
    pos: ['Hides poor on-ball defenders', 'Saves legs', 'Disrupts isolation scorers'],
    neg: ['Vulnerable to skip passes', 'Bad rebounding positioning', 'High-IQ teams pick it apart'],
    requirements: [
      { slot: 'Long Wings', archetypes: ['Defensive Wing', 'Two-Way Wing', 'All-Around Wing'], importance: 'Essential' },
      { slot: 'Backline Big', archetypes: ['Defensive Anchor', 'Traditional Center'], importance: 'Essential' },
    ],
  },
  '3-2 Zone': {
    desc: 'Three top, two back — emphasizes perimeter pressure over rim protection.',
    pos: ['Pressures shooters', 'Forces middle-drive turnovers', 'Disrupts ball-screens'],
    neg: ['Open paint vs. post', 'Bad vs. high-low offense'],
    requirements: [
      { slot: 'Active Top Three', archetypes: ['Defensive Pest', 'Defensive Wing', '3&D Wing'], importance: 'Essential' },
      { slot: 'Anchor', archetypes: ['Defensive Anchor', 'Two-Way Big'], importance: 'Secondary' },
    ],
  },
  'Match-Up Zone': {
    desc: 'Hybrid — zone shape but defenders pick up nearest man, switching as cutters move.',
    pos: ['Confuses offenses', 'Hides matchup weaknesses', 'Strong vs. motion sets'],
    neg: ['High IQ requirement', 'Easy to break with simple ball reversal if untrained'],
    requirements: [
      { slot: 'High-IQ Wings', archetypes: ['Two-Way Wing', 'Defensive Wing', 'Glue Guy'], importance: 'Essential' },
      { slot: 'Smart Big', archetypes: ['Two-Way Big', 'Defensive Anchor'], importance: 'Secondary' },
    ],
  },
  'Box-and-1': {
    desc: 'Junk defense — four in a box zone, one defender chases their star.',
    pos: ['Frustrates one-man offenses', 'Saves bench legs in zone shape', 'Surprise factor'],
    neg: ['Open opposite-side shooters', 'Useless if star has elite running mates'],
    requirements: [
      { slot: 'Lockdown Wing', archetypes: ['Defensive Wing', 'Defensive Pest', 'Two-Way Wing'], importance: 'Essential' },
    ],
  },
  'Triangle-and-2': {
    desc: 'Three-man zone with two defenders chasing the opponent\'s top scorers.',
    pos: ['Shuts down dual scoring threats', 'Effective vs. star-driven offenses'],
    neg: ['Three open zones for role players', 'Falls apart vs. balanced rosters'],
    requirements: [
      { slot: 'Two Lockdowns', archetypes: ['Defensive Wing', 'Defensive Pest', 'Two-Way Wing'], importance: 'Essential' },
    ],
  },
  'Full-Court Press': {
    desc: 'Pressure the inbound and ball-handler the entire length of the floor.',
    pos: ['Forces turnovers', 'Speeds up tempo', 'Wears down opposing guards'],
    neg: ['Foul-rate spikes', 'Easy buckets in transition if broken', 'Demands elite conditioning'],
    requirements: [
      { slot: 'Active Guards', archetypes: ['Defensive Pest', 'Two-Way PG', 'Explosive Slasher'], importance: 'Essential' },
      { slot: 'Tall Wings', archetypes: ['Defensive Wing', 'Two-Way Wing'], importance: 'Essential' },
    ],
  },
  'Half-Court Trap': {
    desc: 'Spring the trap on the ball-handler once they cross half-court.',
    pos: ['Disrupts set offense', 'Surprise factor', 'Forces inexperienced PGs into mistakes'],
    neg: ['4-on-3 if not rotated', 'Vulnerable to PG-led offenses', 'Demands timing'],
    requirements: [
      { slot: 'Active Trap Pair', archetypes: ['Defensive Pest', 'Defensive Wing', 'Two-Way Wing'], importance: 'Essential' },
    ],
  },
  '3/4-Court Pickup': {
    desc: 'Pickup the ball-handler at the free-throw-line extended of the offensive end.',
    pos: ['Saves energy vs. full press', 'Still disrupts tempo', 'Forces early read decisions'],
    neg: ['Less turnover-forcing than full press', 'Still demands rotational discipline'],
    requirements: [
      { slot: 'Mobile POA', archetypes: ['Defensive Pest', 'Two-Way PG'], importance: 'Essential' },
    ],
  },
};
