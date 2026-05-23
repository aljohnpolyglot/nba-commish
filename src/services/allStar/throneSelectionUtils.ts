import type { NBAPlayer } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';

export const FIELD_SIZE = 16;

export const jitter = (mag: number) => (Math.random() * 2 - 1) * mag;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const currentRatings = (p: NBAPlayer): any => {
  const arr = (p.ratings ?? []) as any[];
  return arr[arr.length - 1] ?? {};
};

export function decidesToSignUp(p: NBAPlayer, prizePool: number, isDefendingKing: boolean): boolean {
  if (p.injury && p.injury.gamesRemaining > 0) return false;
  if (p.status && p.status !== 'Active') return false;
  if (p.contract?.amount == null) return false;
  if (isDefendingKing) return true;
  const annualSalary = (p.contract?.amount ?? 0) * 1000;
  const cashMotivated = annualSalary < prizePool * 5;
  const competitive = (p.moodTraits ?? []).includes('competitive' as any);
  const fame = (p as any).fame ?? 50;
  const gloryMotivated = competitive || fame > 70;
  return cashMotivated || gloryMotivated;
}

export function oneOnOneSkill(p: NBAPlayer): number {
  const r = currentRatings(p);
  return 0.30 * (r.tp ?? 50)
    + 0.25 * (r.fg ?? 50)
    + 0.20 * (r.drb ?? 50)
    + 0.15 * (r.spd ?? 50)
    + 0.10 * (r.ins ?? 50);
}

export function careerAccolades(p: NBAPlayer): number {
  const aw = p.awards ?? [];
  const allStar = aw.filter(a => a.type?.toLowerCase().includes('all-star') && !a.type.toLowerCase().includes('mvp')).length;
  const otherTrophies = aw.filter(a => /mvp|champion|all-league|defensive player|throne/i.test(a.type)).length;
  return allStar * 5 + otherTrophies * 4;
}

export const BLOC_BALLOTS = {
  fan: 5_000_000,
  player: 18 * 30,
  media: 100,
  coach: 30,
};

export function distributeBlocVotes(scores: number[], ballotCount: number, progress = 1): number[] {
  let max = 0;
  for (const s of scores) if (s > max) max = s;
  if (max <= 0) return scores.map(() => 0);
  return scores.map(s => {
    const ratio = Math.max(0, Math.min(1, s / max));
    const inclusionRate = ratio ** 1.5;
    return Math.round(ballotCount * progress * inclusionRate);
  });
}

export function rankByScore(scores: number[]): number[] {
  const indexed = scores.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => b.s - a.s || a.i - b.i);
  const ranks = new Array(scores.length).fill(0);
  indexed.forEach((entry, rank) => { ranks[entry.i] = rank + 1; });
  return ranks;
}

export function compositeVote(p: NBAPlayer, beltHolderId: string | null) {
  const r = currentRatings(p);
  const k2 = convertTo2KRating(p.overallRating, r.hgt ?? 50);
  const fan = k2;
  const player_ = clamp(0.6 * k2 + 0.4 * (40 + careerAccolades(p)), 0, 100);
  const fameRaw = (p as any).fame;
  const fame = typeof fameRaw === 'number' ? fameRaw : k2;
  const storylineBonus = p.internalId === beltHolderId ? 15 : 0;
  const media = clamp(0.5 * k2 + 0.5 * fame + storylineBonus, 0, 100);
  const coach = clamp(0.6 * oneOnOneSkill(p) + 0.4 * k2, 0, 100);

  const fanW = fan * (1 + jitter(0.10));
  const playerW = player_ * (1 + jitter(0.15));
  const mediaW = media * (1 + jitter(0.20));
  const coachW = coach * (1 + jitter(0.05));

  return {
    player: p,
    fan: Math.round(fan),
    player_: Math.round(player_),
    media: Math.round(media),
    coach: Math.round(coach),
    composite: 0.40 * fanW + 0.30 * playerW + 0.20 * mediaW + 0.10 * coachW,
  };
}
