import { OnCourt, PossessionEnd } from './types';
import { runPossession } from './possession';
import { BoxAccumulator } from './boxScoreAccumulator';
import { RotationManager } from './rotationManager';
import type { ShotRules } from './types';

const AVG_POSSESSION_SEC = 13.2; // calibrated to land PACE just under 100 poss/team/48
const POSSESSION_VARIANCE_SEC = 5.5;

export interface PeriodResult {
  homeScore: number;
  awayScore: number;
  possessions: number;
}

/**
 * Simulate one period (regulation quarter or OT).
 *
 * On-court 5 for each team is owned by a RotationManager — after every
 * possession we advance both teams' clocks and let each manager swap in
 * fresh bodies for fouled-out / fatigued / over-target players.
 */
export function simulatePeriod(
  homeMgr: RotationManager,
  awayMgr: RotationManager,
  acc: BoxAccumulator,
  startingPossession: 'home' | 'away',
  periodMinutes: number,
  period: number,
  futureSecondsAfterPeriod: number = 0,
  shotRules?: ShotRules,
): PeriodResult {
  let clock = periodMinutes * 60;
  let homeScore = 0;
  let awayScore = 0;
  let possessions = 0;
  let next: 'home' | 'away' = startingPossession;
  const getPf = (id: string) => acc.getPf(id);

  const getOffensiveReboundChance = (offense: OnCourt, blocked: boolean) => {
    const base = blocked ? 0.20 : 0.26;
    const orbMult = offense.gameplayModifiers?.orbMult ?? 1;
    return Math.max(0.10, Math.min(0.50, base * orbMult));
  };

  while (clock > 0) {
    const offenseSide = next;
    const offense = offenseSide === 'home' ? homeMgr.getOnCourt() : awayMgr.getOnCourt();
    const defense = offenseSide === 'home' ? awayMgr.getOnCourt() : homeMgr.getOnCourt();
    const offenseIds = offense.composites.map(c => c.id);
    const defenseIds = defense.composites.map(c => c.id);

    const end = runPossession(offense, defense, shotRules);
    const trace = (typeof globalThis !== 'undefined' ? (globalThis as any).__realisticTrace : undefined) as
      undefined | ((e: PossessionEnd, side: 'home' | 'away') => void);
    if (trace) trace(end, next);
    const scoreBefore = { off: 0 };
    acc.applyPossession(end, offenseIds, defenseIds, scoreBefore);

    // Rebound + possession-flip bookkeeping (unchanged from chunk impl)
    if (end.kind === 'shot' && !end.made && !end.fouled && !end.blockerId) {
      if (Math.random() < 1 - getOffensiveReboundChance(offense, false)) {
        const reb = pickRebounder(defense);
        acc.applyRebound(reb.id, 'drb');
        next = next === 'home' ? 'away' : 'home';
      } else {
        const reb = pickRebounder(offense);
        acc.applyRebound(reb.id, 'orb');
      }
    } else if (end.kind === 'shot' && end.blockerId) {
      if (Math.random() < 1 - getOffensiveReboundChance(offense, true)) {
        const reb = pickRebounder(defense);
        acc.applyRebound(reb.id, 'drb');
        next = next === 'home' ? 'away' : 'home';
      } else {
        const reb = pickRebounder(offense);
        acc.applyRebound(reb.id, 'orb');
      }
    } else {
      next = next === 'home' ? 'away' : 'home';
    }

    if (offenseSide === 'home') homeScore += scoreBefore.off;
    else awayScore += scoreBefore.off;
    possessions += 1;

    const combinedPace = ((offense.gameplayModifiers?.paceMultiplier ?? 1) + (defense.gameplayModifiers?.paceMultiplier ?? 1)) / 2;
    const elapsed = (AVG_POSSESSION_SEC + (Math.random() - 0.5) * POSSESSION_VARIANCE_SEC) / Math.max(0.82, combinedPace);
    clock -= elapsed;
    homeMgr.advanceTime(elapsed);
    awayMgr.advanceTime(elapsed);

    // Sub check after every possession.
    const totalRemaining = Math.max(0, clock + futureSecondsAfterPeriod);
    homeMgr.maybeSub(period, totalRemaining, getPf);
    awayMgr.maybeSub(period, totalRemaining, getPf);
  }

  return { homeScore, awayScore, possessions };
}

function pickRebounder(unit: OnCourt) {
  const reboundExp = unit.isEuroClubGame ? 1.75 : 2.35;
  const weights = unit.composites.map(c => Math.pow(c.rebound, reboundExp));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return unit.composites[0];
  let roll = Math.random() * total;
  for (let i = 0; i < unit.composites.length; i++) {
    roll -= weights[i];
    if (roll < 0) return unit.composites[i];
  }
  return unit.composites[0];
}
