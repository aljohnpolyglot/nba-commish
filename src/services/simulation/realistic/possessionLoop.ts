import { OnCourt, PossessionEnd } from './types';
import { runPossession } from './possession';
import { BoxAccumulator } from './boxScoreAccumulator';
import { RotationManager } from './rotationManager';

const AVG_POSSESSION_SEC = 13.4; // calibrated to land PACE ≈ 98 poss/team/48
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
): PeriodResult {
  let clock = periodMinutes * 60;
  let homeScore = 0;
  let awayScore = 0;
  let possessions = 0;
  let next: 'home' | 'away' = startingPossession;
  const getPf = (id: string) => acc.getPf(id);

  while (clock > 0) {
    const offenseSide = next;
    const offense = offenseSide === 'home' ? homeMgr.getOnCourt() : awayMgr.getOnCourt();
    const defense = offenseSide === 'home' ? awayMgr.getOnCourt() : homeMgr.getOnCourt();
    const offenseIds = offense.composites.map(c => c.id);
    const defenseIds = defense.composites.map(c => c.id);

    const end = runPossession(offense, defense);
    const trace = (typeof globalThis !== 'undefined' ? (globalThis as any).__realisticTrace : undefined) as
      undefined | ((e: PossessionEnd, side: 'home' | 'away') => void);
    if (trace) trace(end, next);
    const scoreBefore = { off: 0 };
    acc.applyPossession(end, offenseIds, defenseIds, scoreBefore);

    // Rebound + possession-flip bookkeeping (unchanged from chunk impl)
    if (end.kind === 'shot' && !end.made && !end.fouled && !end.blockerId) {
      if (Math.random() < 0.74) {
        const reb = pickRebounder(defense);
        acc.applyRebound(reb.id, 'drb');
        next = next === 'home' ? 'away' : 'home';
      } else {
        const reb = pickRebounder(offense);
        acc.applyRebound(reb.id, 'orb');
      }
    } else if (end.kind === 'shot' && end.blockerId) {
      if (Math.random() < 0.8) {
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

    const elapsed = AVG_POSSESSION_SEC + (Math.random() - 0.5) * POSSESSION_VARIANCE_SEC;
    clock -= elapsed;
    homeMgr.advanceTime(elapsed);
    awayMgr.advanceTime(elapsed);

    // Sub check after every possession.
    homeMgr.maybeSub(period, clock, getPf);
    awayMgr.maybeSub(period, clock, getPf);
  }

  return { homeScore, awayScore, possessions };
}

function pickRebounder(unit: OnCourt) {
  const weights = unit.composites.map(c => Math.pow(c.rebound, 1.7));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return unit.composites[0];
  let roll = Math.random() * total;
  for (let i = 0; i < unit.composites.length; i++) {
    roll -= weights[i];
    if (roll < 0) return unit.composites[i];
  }
  return unit.composites[0];
}
