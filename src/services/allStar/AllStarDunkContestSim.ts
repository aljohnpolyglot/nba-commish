// ─── TRANSPLANT INTERFACE ──────────────────────────────────────────────────
// These are the ONLY things that change between sandbox and main game.
// Everything else stays identical.

// SANDBOX: hardcoded contestants
// TRANSPLANT: AllStarDunkContestSim.selectContestants(state.players)
// const SANDBOX_CONTESTANTS = CONTESTANTS; // from dunkData.ts

// SANDBOX: getBadgeProb returns deterministic sandbox values
// TRANSPLANT: import { getBadgeProb, loadBadges } from '../badgeService'
// and call await loadBadges() before simulate()

// SANDBOX: result stored in local React state
// TRANSPLANT: dispatch({ type: 'ALL_STAR_SIMULATE_DUNK_CONTEST', result })
// and read from state.allStar.dunkContest

// SANDBOX: judge selection from JUDGE_POOL constant
// TRANSPLANT: same — JUDGE_POOL stays, just exclude real current contestants
// by checking state.allStar.dunkContestContestants

// SANDBOX: year hardcoded as new Date().getFullYear()
// TRANSPLANT: use state.leagueStats.year
// ─────────────────────────────────────────────────────────────────────────────

import { 
  DUNK_PROPS, PropDefinition, SelectedProp, selectLeapoverTarget, SANDBOX_ASSIST_NAMES
} from "./dunkCommentary";
import {
  DUNK_INTRO_FIRST_TIMER, DUNK_INTRO_HIGH_RATED, DUNK_INTRO_PAST_WINNER
} from "./dunkCrowdCommentary";
import { buildDunkContestPlays } from "./dunkContestEngine";
import { DUNK_MOVES } from "./dunkMoves";
import { Judge, selectJudges } from "./judges";
import { getBadgeProb, loadBadges } from '../simulation/live/playback/badgeService';
import { DRIVING_DUNK } from '../../data/dunkData';
import { NBAPlayer } from '../../types';

const pick = <T>(a: T[]): T => a[~~(Math.random() * a.length)];
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);


export interface DunkPlayer extends NBAPlayer {
  ratings: { dnk: number; jmp: number; spd: number }[];
}

export interface PlayerRound {
  playerId: string;
  playerName: string;
  dunks: DunkAttempt[];
  totalScore: number;
}

export type ApproachType = 'standard' | 'free_throw_line' | 'beyond_ft_line' | 'halfcourt';
export type DeliveryType = 'self' | 'self_lob' | 'self_glass' | 'teammate_pass' | 'teammate_alley' | 'teammate_glass';
export type ObstacleType = 'none' | 'over_chair' | 'over_mascot' | 'over_car' | 'over_person_crouching' | 'over_person_standing';

export interface DunkComposition {
  approach: ApproachType;
  delivery: DeliveryType;  
  obstacle: ObstacleType;
  move: string;
  tier: number;
}

export interface DunkAttempt {
  tier: number;
  move: string;
  toss: string; // Keep for legacy/internal but composition is primary
  composition: DunkComposition;
  attemptNum: number;
  made: boolean;
  score: number;
  judges: number[];
  history: { tier: number; move: string; made: boolean }[];
  prop: SelectedProp | null;
}

export interface Play {
  id: string;
  type: 'section_header' | 'player_intro' | 'dunk_setup' | 'dunk_toss' | 'dunk_in_air' | 'dunk_outcome_made' | 'dunk_outcome_miss' | 'dunk_reveal' | 'score_reveal' | 'perfect' | 'retry' | 'bail' | 'standings' | 'winner' | 'crowd_reaction';
  text: string;
  subtext?: string;
  playerId?: string;
  activePlayer?: string;
  round?: 'round1' | 'finals' | 'tiebreaker';
  scoreUpdate?: { playerId: string; delta: number; newTotal: number };
  pauseMs?: number;
  triggerJudgeModal?: {
    playerId: string;
    playerName: string;
    judgeScores: number[];   // array of 5 scores
    total: number;
    moveName: string;        // revealed move name
    tier: number;
    attempts: number;
    made: boolean;
  };
  standings?: Array<{
    name: string;
    score: number;
    id: string;
    dunksDone: number;
  }>;
}

export interface DunkContestResult {
  round1: PlayerRound[];
  round2: PlayerRound[]; // finals
  winnerId: string;
  winnerName: string;
  mvpDunk?: string;
  log: string[];
  plays: Play[];
  judges?: Judge[];
}

// Mocking the DRIVING_DUNK data provided in context
// DRIVING_DUNK is now imported from '../../data/dunkData'

/**
 * Constants for the simulation
 */
export const TIERS = [
  { tier: 1, req: 0,  baseProb: 0.88, scoreRange: [32, 40] as [number,number],
    moves: ['two_hand', 'one_hand', 'tomahawk', 'reverse', 'rim_grazer', 'back_scratcher'] },
  { tier: 2, req: 76, baseProb: 0.72, scoreRange: [38, 44] as [number,number],
    moves: ['windmill', 'cradle', 'double_clutch', 'side_windmill', 'leaner', 'front_windmill'] },
  { tier: 3, req: 83, baseProb: 0.55, scoreRange: [42, 47] as [number,number],
    moves: ['three_sixty', 'elbow_hang', 'behind_the_back', 'super_scoop', 'wrong_way_360', 'self_alley_reverse'] },
  { tier: 4, req: 89, baseProb: 0.36, scoreRange: [46, 49] as [number,number],
    moves: ['eastbay', 'under_legs', 'soccer_flip', 'spinning_honey', 'windmill_switch', 'three_sixty_windmill'] },
  { tier: 5, req: 94, baseProb: 0.20, scoreRange: [48, 50] as [number,number],
    moves: [
      'scorpion', 'lost_and_found', 'the_540', 'btl_btb', 
      'rivera_360_btb_btl', 'rivera_kamikaze', 'rivera_double_btl', 'double_spin'
    ] },
];

export const APPROACH_CEILING_MOD: Record<ApproachType, number> = {
  standard:        0,
  free_throw_line: 2,
  beyond_ft_line:  4,
  halfcourt:       6,
};

export const DELIVERY_CEILING_MOD: Record<DeliveryType, number> = {
  self:             0,
  self_lob:         1,
  self_glass:       2,
  teammate_pass:    1,
  teammate_alley:   2,
  teammate_glass:   3,
};

export const OBSTACLE_CEILING_MOD: Record<ObstacleType, number> = {
  none:                  0,
  over_chair:            2,
  over_mascot:           2,
  over_car:              3,
  over_person_crouching: 3,
  over_person_standing:  5,
};

export const APPROACH_PROB_MOD: Record<ApproachType, number> = {
  standard:        0,
  free_throw_line: -0.06,
  beyond_ft_line:  -0.12,
  halfcourt:       -0.20,
};

export const DELIVERY_PROB_MOD: Record<DeliveryType, number> = {
  self:             0,
  self_lob:        -0.02,
  self_glass:      -0.05,
  teammate_pass:   -0.02,
  teammate_alley:  -0.04,
  teammate_glass:  -0.07,
};

export const OBSTACLE_PROB_MOD: Record<ObstacleType, number> = {
  none:                   0,
  over_chair:            -0.05,
  over_mascot:           -0.04,
  over_car:              -0.03,
  over_person_crouching: -0.08,
  over_person_standing:  -0.15,
};

export const INVALID_COMBOS: Array<{
  reason: string;
  check: (c: DunkComposition) => boolean;
}> = [
  {
    reason: 'Cannot have obstacle AND halfcourt approach',
    check: c => c.approach === 'halfcourt' && c.obstacle !== 'none',
  },
  {
    reason: 'Teammate glass + obstacle = too chaotic',
    check: c => c.delivery === 'teammate_glass' && c.obstacle !== 'none',
  },
  {
    reason: 'Standard approach + self + no obstacle = boring (Tier 3+ only)',
    check: c => c.approach === 'standard' && c.delivery === 'self' 
             && c.obstacle === 'none' && c.tier >= 3,
  },
  {
    reason: 'Halfcourt + teammate delivery',
    check: c => c.approach === 'halfcourt' 
             && (c.delivery === 'teammate_alley' || c.delivery === 'teammate_glass'),
  },
];

export function isValidCombo(comp: DunkComposition): boolean {
  return !INVALID_COMBOS.some(rule => rule.check(comp));
}

export const LEGENDARY_STACKS: Array<{
  label: string;
  check: (c: DunkComposition) => boolean;
  forcedMin: number;
}> = [
  {
    label: 'FT line + under legs = Vince Carter',
    check: c => c.approach === 'free_throw_line' && c.move === 'under_legs',
    forcedMin: 50,
  },
  {
    label: 'FT line + eastbay = classic eastbay',
    check: c => c.approach === 'free_throw_line' && c.move === 'eastbay',
    forcedMin: 49,
  },
  {
    label: 'Over standing person + any BTL = insane',
    check: c => c.obstacle === 'over_person_standing' 
             && ['eastbay','under_legs'].includes(c.move),
    forcedMin: 50,
  },
  {
    label: 'Over standing person + any move = minimum 49',
    check: c => c.obstacle === 'over_person_standing',
    forcedMin: 49,
  },
  {
    label: 'Teammate glass + under legs = creative masterpiece',
    check: c => c.delivery === 'teammate_glass' 
             && ['under_legs','windmill','three_sixty'].includes(c.move),
    forcedMin: 48,
  },
  {
    label: 'Halfcourt self glass + any move = absolute chaos',
    check: c => c.approach === 'beyond_ft_line' && c.delivery === 'self_glass',
    forcedMin: 48,
  },
  {
    label: 'Over person crouching + BTL/windmill/360 = 48 minimum',
    check: c => c.obstacle === 'over_person_crouching' 
             && ['under_legs','windmill','three_sixty','behind_the_back'].includes(c.move),
    forcedMin: 48,
  },
  {
    label: 'Signature Legendary Move - Floor at 49',
    check: c => ['scorpion', 'lost_and_found', 'the_540', 'btl_btb', 'rivera_360_btb_btl', 'rivera_double_btl'].includes(c.move),
    forcedMin: 49,
  },
  {
    label: 'Clean Tier 5 first attempt — floor at 48',
    check: c => c.tier === 5,
    forcedMin: 48,
  },
];

export const TOSS_TYPES = ['none','self_lob','off_backboard','behind_back','btl_toss'];

export const LEGENDARY_COMBOS = [
  // Keeping this for backward compatibility or merging into LEGENDARY_STACKS
  {
    moves: ['eastbay', 'under_legs', 'spinning_honey'],
    props: ['leapover_short', 'leapover_tall'],
    forcedMin: 50,
    label: 'BTL/Eastbay + leapover = automatic 50',
  },
  {
    moves: ['windmill', 'behind_the_back', 'three_sixty', 'wrong_way_360', 
            'elbow_hang', 'spinning_honey', 'double_spin'],
    props: ['leapover_short', 'leapover_tall'],
    forcedMin: 48,
    label: 'Acrobatic + leapover = 48 minimum',
  },
  {
    moves: ['*'], // any move
    props: ['leapover_tall'],
    forcedMin: 49,
    label: 'Any move + giant leapover = 49 minimum',
  },
  {
    moves: ['between_legs', 'eastbay', 'windmill', 'three_sixty'],
    props: ['alley_oop_assist'],
    forcedMin: 47,
    label: 'Flashy move + alley-oop assist = 47 minimum',
  },
  {
    // Clean Tier 5 first attempt — always floors at 48
    moves: ['double_spin', 'honey_dip_360', 'eastbay_360', 'under_legs_rev', 'windmill_switch'],
    props: ['none'],
    forcedMin: 48,
    label: 'Clean Tier 5 first attempt floor',
  },
];

/**
 * Core Simulation Logic
 */
export class AllStarDunkContestSim {
  
  static calcComposite(player: DunkPlayer): number {
    const latest = player.ratings[player.ratings.length - 1] || { dnk: 50, jmp: 50, spd: 50 };
    const dnk = latest.dnk;
    const jmp = latest.jmp;
    const spd = latest.spd;
    const drivingDunk = this.getDrivingDunk(player.name);

    let base: number;
    if (drivingDunk !== undefined) {
      base = drivingDunk * 0.65 + dnk * 0.25 + jmp * 0.10;
    } else {
      base = dnk * 0.55 + jmp * 0.35 + spd * 0.10;
    }
    
    const composite = clamp(base + this.calcBadgeBonus(player.name), 0, 99);
    console.log(`[DunkSim] Calculating composite for ${player.name}: drivingDunk=${drivingDunk}, dnk=${dnk}, jmp=${jmp}, spd=${spd} → ${composite.toFixed(1)}`);
    return composite;
  }

  static calcBadgeBonus(name: string): number {
    let bonus = 0;
    let breakdown = "";
    const BADGE_WEIGHTS = [
      { badge: 'Posterizer',   HOF: 8, Gold: 6, Silver: 4, Bronze: 2 },
      { badge: 'Rise Up',      HOF: 5, Gold: 4, Silver: 3, Bronze: 1 },
      { badge: 'Aerial Wizard',HOF: 4, Gold: 3, Silver: 2, Bronze: 1 },
      { badge: 'Acrobat',      HOF: 3, Gold: 2, Silver: 1, Bronze: 0 },
    ];
    for (const bw of BADGE_WEIGHTS) {
      const raw = getBadgeProb(name, bw.badge, 1.0);
      let b = 0;
      if (raw >= 1.5) b = bw.HOF;
      else if (raw >= 1.2) b = bw.Gold;
      else if (raw >= 1.0) b = bw.Silver;
      else if (raw > 0)    b = bw.Bronze;
      
      if (b > 0) {
        bonus += b;
        breakdown += `${bw.badge}(+${b}) `;
      }
    }
    if (bonus > 0) {
      console.log(`[DunkSim] Badge bonus for ${name}: +${bonus} (${breakdown.trim()})`);
    }
    return bonus;
  }

  static calcProb(composite: number, tier: typeof TIERS[0], propProbMod: number = 0): number {
    // Base probability adjusted by composite score. 
    // Higher tiers have higher "requirements" implicitly because they start lower.
    const tierReq = [0, 0, 76, 83, 89, 94][tier.tier];
    return clamp(tier.baseProb + (composite - tierReq) * 0.014 + propProbMod, 0.08, 0.93);
  }

  static selectMove(
    composite: number, 
    round: 'round1'|'finals', 
    dunkIdx: number, 
    trailingBy: number, 
    attemptNum: number, 
    lastFailedTier: number | null,
    usedMoves: Set<string>,
    roundMoveCounts: Map<string, number>,
    prop: SelectedProp | null = null
  ) {
    // Any player can attempt any tier now.
    const safetyTier = [...TIERS].reverse().find(t => this.calcProb(composite, t) > 0.65) ?? TIERS[0];
    const maxTier = TIERS[TIERS.length - 1];

    let tier: typeof TIERS[0];

    // On retry — drop one tier from what just failed
    if (attemptNum === 2 && lastFailedTier !== null) {
      const dropIdx = Math.max(0, TIERS.findIndex(t => t.tier === lastFailedTier) - 1);
      tier = TIERS[dropIdx];
    } else if (attemptNum === 3) {
      // On third attempt — just needs a make
      tier = TIERS.find(t => this.calcProb(composite, t) > 0.78) ?? TIERS[0];
    } else {
      if (round === 'round1') {
        tier = dunkIdx === 0 ? safetyTier : maxTier;
      } else {
        // Finals
        if (trailingBy > 8)  tier = maxTier;
        else if (trailingBy > 0)  tier = TIERS[Math.min(TIERS.findIndex(t => t === safetyTier) + 1, TIERS.length - 1)];
        else tier = safetyTier; // leading — protect it
      }
    }

    // Now select the move string, aware of the prop
    const candidates = [...tier.moves];
    
    // Filter moves: prefer unused moves
    const unused = candidates.filter(m => !usedMoves.has(m) && (roundMoveCounts.get(m) || 0) < 2);
    
    let move: string;

    if (unused.length > 0) {
      move = pick(unused);
    } else {
      // Fallback: pick any move, even if used
      move = pick(candidates);
    }

    // Update trackers
    usedMoves.add(move);
    roundMoveCounts.set(move, (roundMoveCounts.get(move) || 0) + 1);

    return { tier, move };
  }

  static calcScore(
    tier: typeof TIERS[0], 
    attempts: number, 
    made: boolean, 
    composition: DunkComposition,
    prop: SelectedProp | null
  ): { total: number, judges: number[] } {
    if (!made) {
      // Respect for the attempt
      const missBase = 12 + tier.tier * 1.5;
      const total = Math.round(missBase + Math.random() * 4);
      return { total, judges: this.distributeToJudges(total) };
    }
    
    const [lo, hi] = tier.scoreRange;
    
    // Multiplier stack ceiling mods
    const appMod = APPROACH_CEILING_MOD[composition.approach];
    const delMod = DELIVERY_CEILING_MOD[composition.delivery];
    const obsMod = OBSTACLE_CEILING_MOD[composition.obstacle];
    
    const adjustedCeiling = Math.min(hi + appMod + delMod + obsMod, 50);
    const penalty = attempts === 1 ? 0 : attempts === 2 ? (2 + Math.random() * 2) : (4 + Math.random() * 3);
    
    // Check legendary stacks
    let forcedMin: number | null = null;
    if (attempts === 1) {
      for (const stack of LEGENDARY_STACKS) {
        if (stack.check(composition)) {
          forcedMin = stack.forcedMin;
          console.log(`[DunkSim] LEGENDARY STACK: ${stack.label} → floor=${forcedMin}`);
          break;
        }
      }
      
      // Backward compatibility for prop-based combos if not covered by stacks
      if (forcedMin === null) {
        for (const combo of LEGENDARY_COMBOS) {
          const moveMatches = combo.moves.includes('*') || combo.moves.includes(composition.move);
          const propId = prop?.id ?? 'none';
          const propMatches = combo.props.includes(propId);
          if (moveMatches && propMatches) {
            forcedMin = combo.forcedMin;
            console.log(`[DunkSim] LEGENDARY COMBO (Prop): ${combo.label} → floor=${forcedMin}`);
            break;
          }
        }
      }
    }

    // Judge rolls
    // KEY FIX: judges roll their FULL score, not divided score
    // Then we sum and clamp — not pre-divide
    const judgeMin = forcedMin 
      ? Math.ceil(forcedMin / 5) 
      : Math.floor((lo - penalty) / 5);
    const judgeMax = Math.floor(adjustedCeiling / 5);

    const judges = Array.from({ length: 5 }, () => {
      // Each judge has full range from judgeMin to judgeMax
      // Plus individual variance of ±1 to create realistic spread
      const base = judgeMin + Math.random() * (judgeMax - judgeMin);
      const variance = (Math.random() - 0.5) * 1.5; // ±0.75 variance
      return Math.min(Math.max(Math.round(base + variance), 1), 10);
    });

    let total = judges.reduce((a, b) => a + b, 0);
    
    // Enforce forced minimum
    if (forcedMin === 50) {
      // Perfect score — judges get 10s distributed naturally
      const judges = this.distributeToJudges(50); // always [10,10,10,10,10]
      return { total: 50, judges };
    }

    if (forcedMin !== null && total < forcedMin) {
      const judges = this.distributeToJudges(forcedMin);
      return { total: forcedMin, judges };
    }

    const clampedTotal = Math.min(
      Math.max(total, Math.round(lo - penalty)), 
      adjustedCeiling
    );
    if (clampedTotal !== total) {
      return { total: clampedTotal, judges: this.distributeToJudges(clampedTotal) };
    }
    return { total, judges };
  }

  static distributeToJudges(total: number): number[] {
    const base = Math.floor(total / 5);
    const remainder = total - base * 5;
    // Add variance — don't just give everyone the same score
    const judges = Array.from({ length: 5 }, () => base);
    for (let i = 0; i < remainder; i++) judges[i]++;
    // Shuffle so it doesn't always front-load
    return judges.sort(() => Math.random() - 0.5);
  }

  static selectToss(tier: number, move: string, prop: SelectedProp | null): string {
    // If prop is already an alley-oop pass — toss IS the prop, don't add another
    if (prop?.id === 'alley_oop_assist') return 'assisted'; // special toss type
    
    // If prop is a leapover — player usually catches their own toss
    // because they need clean hands to clear the person
    if (prop?.id === 'leapover_short' || prop?.id === 'leapover_tall') {
      // 60% off the backboard (dramatic), 40% self toss
      return Math.random() < 0.6 ? 'off_backboard' : 'self_lob';
    }

    if (tier >= 4) return pick(['off_backboard','btl_toss','behind_back']);
    if (tier >= 3) return pick(['self_lob','off_backboard','none']);
    if (tier >= 2) return Math.random() < 0.6 ? 'self_lob' : 'none';
    return 'none';
  }

  static buildIntroText(player: DunkPlayer, year: number): string {
    const wins = player.awards?.filter(a => 
      a.type === 'Slam Dunk Contest Winner' && a.season < year
    ).length ?? 0;
    const composite = this.calcComposite(player);
    
    const trophyWord = wins === 1 ? 'trophy' : 'trophies';
    
    if (wins >= 1) return pick(DUNK_INTRO_PAST_WINNER)
      .replace(/\[player\]/g, player.name)
      .replace(/\[wins\]/g, String(wins))
      .replace(/\[trophy\]/g, trophyWord);
      
    if (composite >= 90) return pick(DUNK_INTRO_HIGH_RATED).replace(/\[player\]/g, player.name);
    return pick(DUNK_INTRO_FIRST_TIMER).replace(/\[player\]/g, player.name);
  }

  private static getDrivingDunk(name: string): number | undefined {
    if (DRIVING_DUNK[name] !== undefined) return DRIVING_DUNK[name];
    // Try normalized lookup
    const norm = name.toLowerCase().replace(/[^a-z]/g, '');
    for (const key in DRIVING_DUNK) {
      if (key.toLowerCase().replace(/[^a-z]/g, '') === norm) return DRIVING_DUNK[key];
    }
    return undefined;
  }

  static selectContestants(players: DunkPlayer[], num = 4): DunkPlayer[] {
    const withComposite = players
      .filter(p => this.getDrivingDunk(p.name) !== undefined && (this.getDrivingDunk(p.name) || 0) >= 40) // Basic gate
      .map(p => ({ player: p, composite: this.calcComposite(p) }))
      // Exclude pure centers unless they have elite composite (≥90) — avoids Zubac-type picks
      .filter(c => c.player.pos !== 'C' || c.composite >= 90)
      .sort((a,b) => b.composite - a.composite);

    console.log(`[DunkSim] Ranked candidates:`, withComposite.map(c => `${c.player.name} (${c.composite.toFixed(1)})`));

    if (withComposite.length <= num) return withComposite.map(p => p.player);

    const elite    = withComposite.filter(p => p.composite >= 90);
    const acrobat  = withComposite.filter(p => p.composite >= 83 && p.composite < 90);
    const athletic = withComposite.filter(p => p.composite >= 76 && p.composite < 83);

    const picks: DunkPlayer[] = [];
    
    // 1. Always grab the top elite dunker if available
    if (elite.length) {
      picks.push(elite[0].player);
    }
    
    // 2. Add variety from different tiers
    const categories = [acrobat, athletic, elite];
    let catIdx = 0;
    
    while (picks.length < num - 1 && picks.length < withComposite.length) {
      const currentCat = categories[catIdx % categories.length];
      if (currentCat.length) {
        // Pick a random one from the category that isn't already picked
        const available = currentCat.filter(c => !picks.find(p => p.internalId === c.player.internalId));
        if (available.length) {
          picks.push(pick(available).player);
        }
      }
      catIdx++;
      if (catIdx > 100) break; // Safety
    }

    // 3. Wildcard — favor past winners even if lower composite
    const pastWinners = withComposite.filter(p => 
      p.player.awards?.some(a => a.type === 'Slam Dunk Contest Winner') &&
      !picks.find(picked => picked.internalId === p.player.internalId)
    );
    
    if (pastWinners.length && picks.length < num) {
      picks.push(pick(pastWinners).player);
    }
    
    // 4. Fill remaining slots with top available
    if (picks.length < num) {
      const remaining = withComposite.filter(p => !picks.find(picked => picked.internalId === p.player.internalId));
      for (let i = 0; i < remaining.length && picks.length < num; i++) {
        picks.push(remaining[i].player);
      }
    }

    const finalSelection = picks.slice(0, num);
    console.log(`[DunkSim] Final Selection:`, finalSelection.map(p => p.name));
    return finalSelection;
  }

  static simulate(contestants: DunkPlayer[]): DunkContestResult {
    const log: string[] = [];
    const year = new Date().getFullYear();

    // At the top of simulate() — pick judges once, pass through everything
    const judges = selectJudges(contestants.map(c => c.name));
    console.log(`[DunkSim] Judges: ${judges.map(j => j.name).join(', ')}`);

    // Compute composite ONCE per player per simulation — never recalculate mid-sim
    const compositeCache = new Map<string, number>();
    contestants.forEach(p => {
      const composite = this.calcComposite(p);
      compositeCache.set(p.name, composite);
      console.log(`[DunkSim:Cache] ${p.name} → composite locked at ${composite.toFixed(1)} for this simulation`);
    });
    
    // Track used moves
    const playerUsedMoves = new Map<string, Set<string>>();
    contestants.forEach(p => playerUsedMoves.set(p.name, new Set<string>()));
    const roundMoveCounts = new Map<string, number>();

    // Round 1
    const round1: PlayerRound[] = contestants.map(p => ({
      playerId: p.name,
      playerName: p.name,
      dunks: [],
      totalScore: 0
    }));

    for (let dIdx = 0; dIdx < 2; dIdx++) {
      for (const pr of round1) {
        const player = contestants.find(c => c.name === pr.playerName)!;
        const composite = compositeCache.get(player.name)!;
        const attempt = this.simulateDunk(player, composite, 'round1', dIdx, 0, contestants.map(c => c.name), playerUsedMoves.get(player.name)!, roundMoveCounts);
        pr.dunks.push(attempt);
        pr.totalScore += attempt.score;
      }
    }

    const r1Standings = [...round1].sort((a, b) => b.totalScore - a.totalScore);
    console.log(`[DunkSim] Round 1 standings: ${r1Standings.map(s => `${s.playerName} ${s.totalScore}`).join(' | ')}`);
    
    const finalists = r1Standings.slice(0, 2);
    console.log(`[DunkSim] Finalists: ${finalists[0].playerName}, ${finalists[1].playerName}`);

    // Round 2 (Finals)
    const round2: PlayerRound[] = finalists.map(f => ({
      playerId: f.playerId,
      playerName: f.playerName,
      dunks: [],
      totalScore: 0
    }));

    // Explicitly ensure scores are 0 before starting finals loop
    round2.forEach(r => r.totalScore = 0);

    // CORRECT — each finalist completes both dunks, then next finalist goes
    // Lowest R1 score goes first (underdog gets momentum)
    const finalistsOrdered = [...round2].sort((a, b) => {
      const r1A = round1.find(r => r.playerName === a.playerName)!;
      const r1B = round1.find(r => r.playerName === b.playerName)!;
      return r1A.totalScore - r1B.totalScore;
    });

    for (const pr of finalistsOrdered) {
      const player = contestants.find(c => c.name === pr.playerName)!;
      const composite = compositeCache.get(player.name)!;
      
      for (let dIdx = 0; dIdx < 2; dIdx++) {
        const opponent = round2.find(r => r.playerName !== pr.playerName)!;
        const trailingBy = Math.max(0, opponent.totalScore - pr.totalScore);
        
        if (trailingBy > 0) {
          console.log(`[DunkSim] ${pr.playerName} trailing by ${trailingBy} — game theory activates`);
        }

        const attempt = this.simulateDunk(player, composite, 'finals', dIdx, trailingBy, contestants.map(c => c.name), playerUsedMoves.get(player.name)!, roundMoveCounts);
        pr.dunks.push(attempt);
        pr.totalScore += attempt.score;
      }
      console.log(`[DunkSim] ${pr.playerName} finals total: ${pr.totalScore}`);
    }

    let winner = [...round2].sort((a, b) => b.totalScore - a.totalScore)[0];
    
    // Tiebreaker?
    if (round2[0].totalScore === round2[1].totalScore) {
      console.log(`[DunkSim] Tie in Finals! Sudden death...`);
      // Simple sudden death
      const p1 = contestants.find(c => c.name === round2[0].playerName)!;
      const p2 = contestants.find(c => c.name === round2[1].playerName)!;
      const tb1 = this.simulateDunk(p1, compositeCache.get(p1.name)!, 'finals', 2, 0, contestants.map(c => c.name), playerUsedMoves.get(p1.name)!, roundMoveCounts);
      const tb2 = this.simulateDunk(p2, compositeCache.get(p2.name)!, 'finals', 2, 0, contestants.map(c => c.name), playerUsedMoves.get(p2.name)!, roundMoveCounts);
      
      round2[0].dunks.push(tb1);
      round2[1].dunks.push(tb2);
      
      if (tb1.score > tb2.score) winner = round2[0];
      else if (tb2.score > tb1.score) winner = round2[1];
      // If still tied, just coin flip for the sandbox
      else winner = Math.random() > 0.5 ? round2[0] : round2[1];
    }

    console.log(`[DunkSim] Winner: ${winner.playerName} with ${winner.totalScore}`);

    // Find MVP Dunk (highest score)
    let bestDunkScore = -1;
    let bestDunkName = "";
    [...round1, ...round2].forEach(pr => {
      pr.dunks.forEach(d => {
        if (d.score > bestDunkScore) {
          bestDunkScore = d.score;
          bestDunkName = d.move;
        }
      });
    });

    // Build the plays array using the engine
    const result: DunkContestResult = {
      round1,
      round2,
      winnerId: winner.playerId,
      winnerName: winner.playerName,
      mvpDunk: bestDunkName,
      log,
      plays: [],
      judges
    };

    result.plays = buildDunkContestPlays(contestants, result);

    return result;
  }

  static rollProp(
    tier: number,
    contestantNames: string[]
  ): SelectedProp | null {
    // 20% base chance of any prop
    if (Math.random() > 0.20) return null;
    
    const eligible = DUNK_PROPS.filter(p => p.minTier <= tier);
    if (!eligible.length) return null;
    
    // Weighted random selection
    const totalWeight = eligible.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosenDef: PropDefinition | null = null;
    for (const p of eligible) {
      roll -= p.weight;
      if (roll <= 0) { chosenDef = p; break; }
    }
    if (!chosenDef) return null;
    
    // Build the SelectedProp — resolve helper names here
    let setupLine = pick(chosenDef.setup);
    let executeLine = pick(chosenDef.execute);
    let helperName: string | undefined;
    let helperHeight: string | undefined;
    let helperReaction: string | undefined;
    
    if (chosenDef.id === 'leapover_short' || chosenDef.id === 'leapover_tall') {
      const target = selectLeapoverTarget(chosenDef.difficulty > 15 ? 'hard' : 'medium', tier, contestantNames);
      helperName = target.name;
      helperHeight = target.heightFt;
      helperReaction = target.reaction;
      setupLine = setupLine
        .replace('[helper]', `${target.name} (${target.heightFt})`);
      executeLine = executeLine
        .replace('[helper]', target.name);
    } else if (chosenDef.id === 'alley_oop_assist') {
      helperName = pick(SANDBOX_ASSIST_NAMES);
      setupLine = setupLine.replace('[helper]', helperName);
      executeLine = executeLine.replace('[helper]', helperName);
    }
    
    console.log(`[DunkSim] Prop selected: ${chosenDef.id}${helperName ? ` | helper: ${helperName}` : ''}`);
    
    return {
      id: chosenDef.id,
      name: chosenDef.name,
      probabilityMod: chosenDef.probabilityMod,
      scoreCeilingMod: chosenDef.scoreCeilingMod,
      helperName,
      helperHeight,
      setupLine,
      executeLine,
      helperReaction,
    };
  }

  static buildDunkComposition(
    player: NBAPlayer,
    composite: number,
    tier: typeof TIERS[0],
    move: string,
    round: 'round1'|'finals',
    dunkIdx: number,
    trailingBy: number,
    prop: SelectedProp | null
  ): DunkComposition {
    let approach: ApproachType = 'standard';
    let delivery: DeliveryType = 'self';
    let obstacle: ObstacleType = 'none';

    // 1. Sync with prop
    if (prop) {
      if (prop.id === 'leapover_short') obstacle = 'over_person_crouching';
      if (prop.id === 'leapover_tall') obstacle = 'over_person_standing';
      if (prop.id === 'chair_jump') obstacle = 'over_chair';
      if (prop.id === 'mascot_jump') obstacle = 'over_mascot';
      if (prop.id === 'toy_car') obstacle = 'over_car';
      if (prop.id === 'alley_oop_assist') delivery = 'teammate_alley';
    }

    // 2. Strategic layers for high tiers or pressure
    if (tier.tier >= 3 && obstacle === 'none') {
       const roll = Math.random();
       if (roll > 0.85) approach = 'free_throw_line';
       else if (roll > 0.7) delivery = 'self_lob';
       else if (roll > 0.6) delivery = 'self_glass';
    }
    
    if (tier.tier >= 4 && obstacle === 'none' && approach === 'standard') {
       if (Math.random() > 0.75) approach = 'beyond_ft_line';
    }

    const comp: DunkComposition = {
      approach,
      delivery,
      obstacle,
      move,
      tier: tier.tier
    };

    // 4. Validate
    if (!isValidCombo(comp)) {
      // Simple fallback to standard/self if invalid to avoid infinite recursion
      comp.approach = 'standard';
      comp.delivery = 'self';
    }

    return comp;
  }

  private static reverseEngineerComposition(attempt: DunkAttempt): DunkComposition {
    const { score, attemptNum, made, composition } = attempt;
    const tierIdx = Math.max(0, TIERS.findIndex(t => t.tier === attempt.tier));
    
    // HARD RULE: score < 35 = no obstacles, no legendary moves
    // These are survival dunks — basic and clean
    if (score < 35 || attemptNum === 3) {
      return {
        approach: 'standard',
        delivery: 'self',
        obstacle: 'none',
        move: pick(TIERS[0].moves), // Tier 1 move
        tier: 1
      };
    }
    
    // score 35-41 = mid-tier, maybe one interesting element
    if (score < 42) {
      return {
        approach: 'standard',
        delivery: composition.delivery === 'self' ? 'self' : 'self_lob',
        obstacle: 'none',
        move: pick(TIERS[Math.min(tierIdx, 1)].moves),
        tier: TIERS[Math.min(tierIdx, 1)].tier
      };
    }
    
    // score 42-46 = solid dunk, can have style
    if (score < 47) {
      return {
        approach: composition.approach,
        delivery: composition.delivery,
        obstacle: composition.obstacle === 'none' ? 'none' : 'over_chair',
        move: pick(TIERS[Math.min(tierIdx, 2)].moves),
        tier: TIERS[Math.min(tierIdx, 2)].tier
      };
    }
    
    // score 47-49 = signature move, probably one legendary element
    if (score < 50) {
      return {
        approach: composition.approach,
        delivery: composition.delivery,
        obstacle: composition.obstacle,
        move: pick(TIERS[Math.min(tierIdx, 3)].moves),
        tier: TIERS[Math.min(tierIdx, 3)].tier
      };
    }
    
    // score 50 = legendary combo only
    return composition;
  }

  private static simulateDunk(
    player: NBAPlayer, 
    composite: number, 
    round: 'round1'|'finals', 
    dunkIdx: number, 
    trailingBy: number,
    allContestantNames: string[] = [],
    usedMoves: Set<string>,
    roundMoveCounts: Map<string, number>
  ): DunkAttempt {
    let made = false;
    let attemptNum = 1;
    let lastFailedTier: number | null = null;
    let finalComposition: DunkComposition;
    const history: { tier: number; move: string; made: boolean }[] = [];

    // Step 1: Select initial tier to determine prop eligibility
    const { tier: initialTier, move: initialMove } = this.selectMove(composite, round, dunkIdx, trailingBy, 1, null, usedMoves, roundMoveCounts);
    
    // Step 2: Select prop ONCE
    const prop = this.rollProp(initialTier.tier, allContestantNames);
    
    // Step 3: Build initial composition
    finalComposition = this.buildDunkComposition(player, composite, initialTier, initialMove, round, dunkIdx, trailingBy, prop);
    
    while (attemptNum <= 3 && !made) {
      // On retry, we might need to adjust the composition (lower tier)
      if (attemptNum > 1) {
        const { tier, move } = this.selectMove(composite, round, dunkIdx, trailingBy, attemptNum, lastFailedTier, usedMoves, roundMoveCounts, prop);
        finalComposition = this.buildDunkComposition(player, composite, tier, move, round, dunkIdx, trailingBy, prop);
      }

      const tier = TIERS.find(t => t.tier === finalComposition.tier)!;
      
      // Calculate probability with all modifiers
      const appProb = APPROACH_PROB_MOD[finalComposition.approach];
      const delProb = DELIVERY_PROB_MOD[finalComposition.delivery];
      const obsProb = OBSTACLE_PROB_MOD[finalComposition.obstacle];
      const propProbMod = prop?.probabilityMod || 0;
      
      const totalProbMod = appProb + delProb + obsProb + propProbMod;
      
      // Check if it's a legendary dunk (Kilganon/Rivera package)
      const legendaryDunk = DUNK_MOVES.find(d => d.id === finalComposition.move && d.tier === 5);
      
      const prob = legendaryDunk
        ? clamp(0.35 + (composite - 90) * 0.005, 0.08, 0.45) // Rivera/Kilganon base ~0.35
        : this.calcProb(composite, tier, totalProbMod);
      
      const roll = Math.random();
      
      console.log(`[DunkSim] ${player.name} selects Tier ${tier.tier} (${finalComposition.move}) — prob=${prob.toFixed(3)}, attempt=${attemptNum}${prop ? ` | Prop: ${prop.id}` : ''}`);
      
      if (roll <= prob) {
        made = true;
        history.push({ tier: tier.tier, move: finalComposition.move, made: true });
        console.log(`[DunkSim] ${player.name} rolls: ${roll.toFixed(3)} vs prob=${prob.toFixed(3)} → MADE`);
      } else {
        console.log(`[DunkSim] ${player.name} rolls: ${roll.toFixed(3)} vs prob=${prob.toFixed(3)} → MISS`);
        history.push({ tier: tier.tier, move: finalComposition.move, made: false });
        lastFailedTier = tier.tier;
        attemptNum++;
      }
    }

    // Step 4: Score using composition
    const { total, judges } = this.calcScore(
      TIERS.find(t => t.tier === finalComposition.tier)!, 
      Math.min(attemptNum, 3), 
      made, 
      finalComposition, 
      prop
    );
    console.log(`[DunkSim] Score: ${player.name} | tier=${finalComposition.tier} | attempts=${Math.min(attemptNum, 3)} | judges=${judges} | total=${total}`);

    const attempt: DunkAttempt = {
      tier: finalComposition.tier,
      move: finalComposition.move,
      composition: finalComposition,
      toss: this.selectToss(finalComposition.tier, finalComposition.move, prop),
      attemptNum: Math.min(attemptNum, 3),
      made,
      score: total,
      judges,
      history,
      prop
    };

    // Step 5: Reverse engineer composition based on score/attempts
    const fixedComp = this.reverseEngineerComposition(attempt);
    attempt.composition = fixedComp;
    attempt.tier = fixedComp.tier;
    attempt.move = fixedComp.move;
    if (attempt.history.length > 0) {
      attempt.history[attempt.history.length - 1].tier = fixedComp.tier;
      attempt.history[attempt.history.length - 1].move = fixedComp.move;
    }
    if (fixedComp.obstacle === 'none') {
      attempt.prop = null; // Strip prop if obstacle was removed
    }

    return attempt;
  }
}
