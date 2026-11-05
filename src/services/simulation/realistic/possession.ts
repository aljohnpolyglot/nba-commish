import { OnCourt, PlayerComposite, PossessionEnd, ShotRules } from './types';
import { pickShotZone, resolveShot } from './shotResolver';

const TOV_BASE = 0.14;       // NBA 2025-26: ~14.5 TOV / ~99 poss = 14.6%
const NON_SHOOTING_FOUL_BASE = 0.085; // off-ball + loose-ball; targets total PF ≈ 19.9/team-game

export function runPossession(
  offense: OnCourt,
  defense: OnCourt,
  rules?: ShotRules,
  inBonus: boolean = false,
): PossessionEnd {
  // 1. Pick possession outcome category
  const tovBase = TOV_BASE * (offense.gameplayModifiers?.tovMult ?? 1);
  const nonShootingFoulBase = NON_SHOOTING_FOUL_BASE * (offense.gameplayModifiers?.ftRateMult ?? 1);
  const roll = Math.random();
  const discipline = resolveDisciplineEvent(offense, defense, rules);
  if (discipline) return discipline;
  if (roll < tovBase) {
    return resolveTurnover(offense, defense);
  }
  if (roll < tovBase + nonShootingFoulBase) {
    return resolveNonShootingFoul(offense, defense, rules, inBonus);
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
  const passExp = (offense.isEuroClubGame ? 2.8 : 4.85)
    * (offense.gameplayModifiers?.assistDistributionExponent ?? 1);
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
    if (Math.random() < pAssist * (offense.gameplayModifiers?.assistRateMult ?? 1)) {
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
    isDunk: result.isDunk,
  };
}

function resolveTurnover(offense: OnCourt, defense: OnCourt): PossessionEnd {
  // Pick offender weighted INVERSELY by composite.passing (worse handlers cough it up more)
  const weights = offense.composites.map(c => 1 - 0.6 * c.passing);
  const offender = weightedPick(offense.composites, weights);

  // NBA 2025-26: 8.4 STL / 14.5 TOV = 58% of turnovers are steals.
  let stealerId: string | undefined;
  const stealChance = Math.max(0, Math.min(1, 0.58 * (defense.gameplayModifiers?.stealRateMult ?? 1)));
  if (Math.random() < stealChance) {
    const stealWeights = defense.composites.map(c => Math.pow(c.steal + 0.05, 1.8));
    stealerId = weightedPick(defense.composites, stealWeights).id;
  }
  return { kind: 'turnover', offenderId: offender.id, stealerId };
}

function resolveNonShootingFoul(
  offense: OnCourt,
  defense: OnCourt,
  rules?: ShotRules,
  inBonus: boolean = false,
): PossessionEnd {
  const weights = defense.composites.map(c => Math.max(0.35, 1.50 - (c.defRim + c.defPerimeter) * 0.65));
  const offender = weightedPick(defense.composites, weights);
  const { player: victim } = pickShooter(offense);
  const fta = inBonus && (rules?.freeThrowsEnabled ?? true) ? 2 : 0;
  let ftMade = 0;
  if (fta > 0) {
    const p = Math.max(0.20, Math.min(0.98, (0.55 + 0.35 * victim.ft) * (rules?.ftEfficiencyMult ?? 1)));
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

function resolveDisciplineEvent(
  offense: OnCourt,
  defense: OnCourt,
  rules?: ShotRules,
): PossessionEnd | null {
  const roll = Math.random();
  const discipline = roll < 0.00015
    ? 'flagrant_2'
    : roll < 0.00095
      ? 'flagrant_1'
      : roll < 0.00245
        ? 'technical'
        : null;
  if (!discipline) return null;

  const offender = weightedPick(defense.composites, defense.composites.map(c => 1.15 - c.defPerimeter * 0.25));
  const { player: victim } = pickShooter(offense);
  const attempts = (rules?.freeThrowsEnabled ?? true) ? (discipline === 'technical' ? 1 : 2) : 0;
  let made = 0;
  const probability = Math.max(0.20, Math.min(0.98, (0.55 + 0.35 * victim.ft) * (rules?.ftEfficiencyMult ?? 1)));
  for (let shot = 0; shot < attempts; shot++) {
    if (Math.random() < probability) made++;
  }
  return {
    kind: 'discipline',
    offenderId: offender.id,
    victimId: victim.id,
    discipline,
    ftAttempts: attempts,
    ftMade: made,
    retainPossession: discipline !== 'technical',
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
