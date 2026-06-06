import { OnCourt, PlayerComposite, PossessionEnd, ShotRules } from './types';
import { pickShotZone, resolveShot } from './shotResolver';

const TOV_BASE = 0.14;       // NBA 2025-26: ~14.5 TOV / ~99 poss = 14.6%
const NON_SHOOTING_FOUL_BASE = 0.085; // off-ball + loose-ball; targets total PF ≈ 19.9/team-game

export function runPossession(offense: OnCourt, defense: OnCourt, rules?: ShotRules): PossessionEnd {
  // 1. Pick possession outcome category
  const tovBase = TOV_BASE * (offense.gameplayModifiers?.tovMult ?? 1);
  const nonShootingFoulBase = NON_SHOOTING_FOUL_BASE * (offense.gameplayModifiers?.ftRateMult ?? 1);
  const roll = Math.random();
  if (roll < tovBase) {
    return resolveTurnover(offense, defense);
  }
  if (roll < tovBase + nonShootingFoulBase) {
    return resolveNonShootingFoul(offense, defense);
  }
  // 2. Otherwise — a shot attempt
  return resolveShotAttempt(offense, defense, rules);
}

function pickShooter(offense: OnCourt): { player: PlayerComposite; index: number } {
  // Power-law on usage so stars (Doncic 38% USG, 33.5 PPG) dominate touches.
  const usageExp = offense.isEuroClubGame ? 2.05 : 2.7;
  const weights = offense.composites.map(c => Math.pow(c.usage, usageExp));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < offense.composites.length; i++) {
    roll -= weights[i];
    if (roll < 0) return { player: offense.composites[i], index: i };
  }
  return { player: offense.composites[0], index: 0 };
}

function pickAssister(offense: OnCourt, shooterIndex: number): PlayerComposite | undefined {
  const candidates = offense.composites.filter((_, i) => i !== shooterIndex);
  // Strong power-law so Jokic / Doncic actually hit 10+ APG. Combined with the
  // elite-skewed composite (^1.4 in compositeMap) the top playmaker dominates.
  const passExp = offense.isEuroClubGame ? 2.8 : 4.85;
  const weights = candidates.map(c => Math.pow(c.passing, passExp));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return undefined;
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll < 0) return candidates[i];
  }
  return candidates[0];
}

function resolveShotAttempt(offense: OnCourt, defense: OnCourt, rules?: ShotRules): PossessionEnd {
  const { player: shooter, index } = pickShooter(offense);
  const zone = pickShotZone(shooter, rules, offense);
  const result = resolveShot(zone, shooter, offense, defense, rules);

  // Assist rate target ~63.5% (NBA 2025-26: 26.7 AST / 42 FGM).
  let assisterId: string | undefined;
  if (result.made) {
    const teamPass = offense.composites.reduce((s, c) => s + c.passing, 0) / offense.composites.length;
    const leadPass = offense.composites.reduce((best, c) => Math.max(best, c.passing), 0);
    const pAssist = offense.isEuroClubGame
      ? 0.43 + 0.20 * teamPass
      : 0.46 + 0.17 * teamPass + 0.24 * leadPass; // keep elite creators on top, but back off the recent APG inflation a bit
    if (Math.random() < pAssist) {
      const assister = pickAssister(offense, index);
      if (assister) assisterId = assister.id;
    }
  }

  return {
    kind: 'shot',
    zone,
    made: result.made,
    pts: result.pts + result.ftMade,
    shooterId: shooter.id,
    assisterId,
    blockerId: result.blockerId,
    fouled: result.fouled,
    foulerId: result.foulerId,
    ftAttempts: result.ftAttempts,
    ftMade: result.ftMade,
  };
}

function resolveTurnover(offense: OnCourt, defense: OnCourt): PossessionEnd {
  // Pick offender weighted INVERSELY by composite.passing (worse handlers cough it up more)
  const weights = offense.composites.map(c => 1 - 0.6 * c.passing);
  const offender = weightedPick(offense.composites, weights);

  // NBA 2025-26: 8.4 STL / 14.5 TOV = 58% of turnovers are steals.
  let stealerId: string | undefined;
  if (Math.random() < 0.58) {
    const stealWeights = defense.composites.map(c => Math.pow(c.steal + 0.05, 1.8));
    stealerId = weightedPick(defense.composites, stealWeights).id;
  }
  return { kind: 'turnover', offenderId: offender.id, stealerId };
}

function resolveNonShootingFoul(offense: OnCourt, defense: OnCourt): PossessionEnd {
  // Bonus situation simplification: 50% chance of bonus FTs (1-and-1 / 2 shots)
  const weights = defense.composites.map(c => 1.0); // even pick
  const offender = weightedPick(defense.composites, weights);
  const { player: victim } = pickShooter(offense);
  const bonus = Math.random() < 0.5;
  const fta = bonus ? 2 : 0;
  let ftMade = 0;
  if (fta > 0) {
    const p = 0.55 + 0.35 * victim.ft;
    for (let i = 0; i < fta; i++) if (Math.random() < p) ftMade++;
  }
  return {
    kind: 'foul',
    offenderId: offender.id,
    victimId: victim.id,
    ftAttempts: fta,
    ftMade,
  };
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}
