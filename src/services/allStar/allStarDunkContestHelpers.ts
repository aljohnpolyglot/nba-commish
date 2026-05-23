import { SelectedProp } from './dunkCommentary';
import { DUNK_INTRO_FIRST_TIMER, DUNK_INTRO_HIGH_RATED, DUNK_INTRO_PAST_WINNER } from './dunkCrowdCommentary';
import { DUNK_MOVES } from './dunkMoves';
import { getBadgeProb } from '../simulation/live/playback/badgeService';
import { DRIVING_DUNK } from '../../data/dunkData';
import { APPROACH_CEILING_MOD, APPROACH_PROB_MOD, DELIVERY_CEILING_MOD, DELIVERY_PROB_MOD, LEGENDARY_COMBOS, LEGENDARY_STACKS, OBSTACLE_CEILING_MOD, OBSTACLE_PROB_MOD, TIERS } from './allStarDunkContestConfig';
import { DunkComposition, DunkPlayer } from './allStarDunkContestTypes';

const pick = <T>(a: T[]): T => a[~~(Math.random() * a.length)];
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

export function calcBadgeBonus(name: string): number {
  let bonus = 0;
  const BADGE_WEIGHTS = [
    { badge: 'Posterizer', HOF: 8, Gold: 6, Silver: 4, Bronze: 2 },
    { badge: 'Rise Up', HOF: 5, Gold: 4, Silver: 3, Bronze: 1 },
    { badge: 'Aerial Wizard', HOF: 4, Gold: 3, Silver: 2, Bronze: 1 },
    { badge: 'Acrobat', HOF: 3, Gold: 2, Silver: 1, Bronze: 0 },
  ];
  for (const bw of BADGE_WEIGHTS) {
    const raw = getBadgeProb(name, bw.badge, 1.0);
    if (raw >= 1.5) bonus += bw.HOF;
    else if (raw >= 1.2) bonus += bw.Gold;
    else if (raw >= 1.0) bonus += bw.Silver;
    else if (raw > 0) bonus += bw.Bronze;
  }
  return bonus;
}

export function getDrivingDunk(name: string): number | undefined {
  if (DRIVING_DUNK[name] !== undefined) return DRIVING_DUNK[name];
  const norm = name.toLowerCase().replace(/[^a-z]/g, '');
  for (const key in DRIVING_DUNK) {
    if (key.toLowerCase().replace(/[^a-z]/g, '') === norm) return DRIVING_DUNK[key];
  }
  return undefined;
}

export function calcComposite(player: DunkPlayer): number {
  const latest = player.ratings[player.ratings.length - 1] || { dnk: 50, jmp: 50, spd: 50 };
  const drivingDunk = getDrivingDunk(player.name);
  const base = drivingDunk !== undefined ? drivingDunk * 0.65 + latest.dnk * 0.25 + latest.jmp * 0.1 : latest.dnk * 0.55 + latest.jmp * 0.35 + latest.spd * 0.1;
  return clamp(base + calcBadgeBonus(player.name), 0, 99);
}

export function calcProb(composite: number, tier: typeof TIERS[0], propProbMod: number = 0): number {
  const tierReq = [0, 0, 76, 83, 89, 94][tier.tier];
  return clamp(tier.baseProb + (composite - tierReq) * 0.014 + propProbMod, 0.08, 0.93);
}

export function selectMove(
  composite: number,
  round: 'round1' | 'finals',
  dunkIdx: number,
  trailingBy: number,
  attemptNum: number,
  lastFailedTier: number | null,
  usedMoves: Set<string>,
  roundMoveCounts: Map<string, number>,
) {
  const safetyTier = [...TIERS].reverse().find(t => calcProb(composite, t) > 0.65) ?? TIERS[0];
  const maxTier = TIERS[TIERS.length - 1];
  let tier: typeof TIERS[0];

  if (attemptNum === 2 && lastFailedTier !== null) tier = TIERS[Math.max(0, TIERS.findIndex(t => t.tier === lastFailedTier) - 1)];
  else if (attemptNum === 3) tier = TIERS.find(t => calcProb(composite, t) > 0.78) ?? TIERS[0];
  else if (round === 'round1') tier = dunkIdx === 0 ? safetyTier : maxTier;
  else if (trailingBy > 8) tier = maxTier;
  else if (trailingBy > 0) tier = TIERS[Math.min(TIERS.findIndex(t => t === safetyTier) + 1, TIERS.length - 1)];
  else tier = safetyTier;

  const candidates = [...tier.moves];
  const unused = candidates.filter(move => !usedMoves.has(move) && (roundMoveCounts.get(move) || 0) < 2);
  const move = pick(unused.length > 0 ? unused : candidates);
  usedMoves.add(move);
  roundMoveCounts.set(move, (roundMoveCounts.get(move) || 0) + 1);
  return { tier, move };
}

export function distributeToJudges(total: number): number[] {
  const base = Math.floor(total / 5);
  const remainder = total - base * 5;
  const judges = Array.from({ length: 5 }, () => base);
  for (let i = 0; i < remainder; i++) judges[i]++;
  return judges.sort(() => Math.random() - 0.5);
}

export function calcScore(
  tier: typeof TIERS[0],
  attempts: number,
  made: boolean,
  composition: DunkComposition,
  prop: SelectedProp | null,
): { total: number; judges: number[] } {
  if (!made) {
    const total = Math.round(12 + tier.tier * 1.5 + Math.random() * 4);
    return { total, judges: distributeToJudges(total) };
  }

  const [lo, hi] = tier.scoreRange;
  const adjustedCeiling = Math.min(hi + APPROACH_CEILING_MOD[composition.approach] + DELIVERY_CEILING_MOD[composition.delivery] + OBSTACLE_CEILING_MOD[composition.obstacle], 50);
  const penalty = attempts === 1 ? 0 : attempts === 2 ? 2 + Math.random() * 2 : 4 + Math.random() * 3;
  let forcedMin: number | null = null;
  if (attempts === 1) {
    for (const stack of LEGENDARY_STACKS) {
      if (stack.check(composition)) {
        forcedMin = stack.forcedMin;
        break;
      }
    }
    if (forcedMin === null) {
      for (const combo of LEGENDARY_COMBOS) {
        const moveMatches = combo.moves.includes('*') || combo.moves.includes(composition.move);
        const propMatches = combo.props.includes(prop?.id ?? 'none');
        if (moveMatches && propMatches) {
          forcedMin = combo.forcedMin;
          break;
        }
      }
    }
  }

  const judgeMin = forcedMin ? Math.ceil(forcedMin / 5) : Math.floor((lo - penalty) / 5);
  const judgeMax = Math.floor(adjustedCeiling / 5);
  const judges = Array.from({ length: 5 }, () => {
    const base = judgeMin + Math.random() * (judgeMax - judgeMin);
    const variance = (Math.random() - 0.5) * 1.5;
    return Math.min(Math.max(Math.round(base + variance), 1), 10);
  });
  const total = judges.reduce((a, b) => a + b, 0);

  if (forcedMin === 50) return { total: 50, judges: distributeToJudges(50) };
  if (forcedMin !== null && total < forcedMin) return { total: forcedMin, judges: distributeToJudges(forcedMin) };
  const clampedTotal = Math.min(Math.max(total, Math.round(lo - penalty)), adjustedCeiling);
  return clampedTotal !== total ? { total: clampedTotal, judges: distributeToJudges(clampedTotal) } : { total, judges };
}

export function selectToss(tier: number, _move: string, prop: SelectedProp | null): string {
  if (prop?.id === 'alley_oop_assist') return 'assisted';
  if (prop?.id === 'leapover_short' || prop?.id === 'leapover_tall') return Math.random() < 0.6 ? 'off_backboard' : 'self_lob';
  if (tier >= 4) return pick(['off_backboard', 'btl_toss', 'behind_back']);
  if (tier >= 3) return pick(['self_lob', 'off_backboard', 'none']);
  if (tier >= 2) return Math.random() < 0.6 ? 'self_lob' : 'none';
  return 'none';
}

export function buildIntroText(player: DunkPlayer, year: number): string {
  const wins = player.awards?.filter(a => a.type === 'Slam Dunk Contest Winner' && a.season < year).length ?? 0;
  const composite = calcComposite(player);
  if (wins >= 1) return pick(DUNK_INTRO_PAST_WINNER).replace(/\[player\]/g, player.name).replace(/\[wins\]/g, String(wins)).replace(/\[trophy\]/g, wins === 1 ? 'trophy' : 'trophies');
  if (composite >= 90) return pick(DUNK_INTRO_HIGH_RATED).replace(/\[player\]/g, player.name);
  return pick(DUNK_INTRO_FIRST_TIMER).replace(/\[player\]/g, player.name);
}

export function compositionProbMod(composition: DunkComposition, prop: SelectedProp | null): number {
  return APPROACH_PROB_MOD[composition.approach] + DELIVERY_PROB_MOD[composition.delivery] + OBSTACLE_PROB_MOD[composition.obstacle] + (prop?.probabilityMod || 0);
}

export function legendaryMoveProb(composite: number): number {
  return clamp(0.35 + (composite - 90) * 0.005, 0.08, 0.45);
}

export function isLegendaryMove(move: string): boolean {
  return !!DUNK_MOVES.find(d => d.id === move && d.tier === 5);
}
