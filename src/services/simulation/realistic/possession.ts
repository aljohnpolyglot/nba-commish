import { OnCourt, PlayerComposite, PossessionEnd } from './types';
import { pickShotZone, resolveShot } from './shotResolver';

const TOV_BASE = 0.13;       // ~13% of possessions end in turnover
const NON_SHOOTING_FOUL_BASE = 0.04; // ~4% off-ball / loose-ball fouls

export function runPossession(offense: OnCourt, defense: OnCourt): PossessionEnd {
  // 1. Pick possession outcome category
  const roll = Math.random();
  if (roll < TOV_BASE) {
    return resolveTurnover(offense, defense);
  }
  if (roll < TOV_BASE + NON_SHOOTING_FOUL_BASE) {
    return resolveNonShootingFoul(offense, defense);
  }
  // 2. Otherwise — a shot attempt
  return resolveShotAttempt(offense, defense);
}

function pickShooter(offense: OnCourt): { player: PlayerComposite; index: number } {
  const totalUsage = offense.composites.reduce((s, c) => s + c.usage, 0);
  let roll = Math.random() * totalUsage;
  for (let i = 0; i < offense.composites.length; i++) {
    roll -= offense.composites[i].usage;
    if (roll < 0) return { player: offense.composites[i], index: i };
  }
  return { player: offense.composites[0], index: 0 };
}

function pickAssister(offense: OnCourt, shooterIndex: number): PlayerComposite | undefined {
  const candidates = offense.composites.filter((_, i) => i !== shooterIndex);
  const totalPass = candidates.reduce((s, c) => s + c.passing, 0);
  if (totalPass <= 0) return undefined;
  let roll = Math.random() * totalPass;
  for (const c of candidates) {
    roll -= c.passing;
    if (roll < 0) return c;
  }
  return candidates[0];
}

function resolveShotAttempt(offense: OnCourt, defense: OnCourt): PossessionEnd {
  const { player: shooter, index } = pickShooter(offense);
  const zone = pickShotZone(shooter);
  const result = resolveShot(zone, shooter, defense);

  // Assist rate ~58% on makes — gated by team passing.
  let assisterId: string | undefined;
  if (result.made) {
    const teamPass = offense.composites.reduce((s, c) => s + c.passing, 0) / offense.composites.length;
    const pAssist = 0.45 + 0.30 * teamPass;
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
    ftAttempts: result.ftAttempts,
    ftMade: result.ftMade,
  };
}

function resolveTurnover(offense: OnCourt, defense: OnCourt): PossessionEnd {
  // Pick offender weighted INVERSELY by composite.passing (worse handlers cough it up more)
  const weights = offense.composites.map(c => 1 - 0.6 * c.passing);
  const offender = weightedPick(offense.composites, weights);

  // ~50% of turnovers are steals
  let stealerId: string | undefined;
  if (Math.random() < 0.5) {
    const stealWeights = defense.composites.map(c => c.steal);
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
