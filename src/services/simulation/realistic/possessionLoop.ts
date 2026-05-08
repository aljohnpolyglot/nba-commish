import { OnCourt, PossessionEnd } from './types';
import { runPossession } from './possession';
import { BoxAccumulator } from './boxScoreAccumulator';

const AVG_POSSESSION_SEC = 13.0; // NBA 2025-26: 98.2 poss/team/48 → ~14.65s/poss league-wide,
                                 // but ORB-extended possessions inflate the budget here, so a
                                 // slightly faster base lands FGA at ~89/team-game.
const POSSESSION_VARIANCE_SEC = 5.5;

export interface QuarterResult {
  homeScore: number;
  awayScore: number;
  possessions: number;
}

/** Simulates a single quarter (or overtime) of game time.
 *  Alternates possessions, applies stats, returns scoring delta. */
export function simulateQuarter(
  home: OnCourt,
  away: OnCourt,
  acc: BoxAccumulator,
  startingPossession: 'home' | 'away',
  quarterMinutes: number,
): QuarterResult {
  let clock = quarterMinutes * 60;
  let homeScore = 0;
  let awayScore = 0;
  let possessions = 0;
  let next: 'home' | 'away' = startingPossession;

  while (clock > 0) {
    const offense = next === 'home' ? home : away;
    const defense = next === 'home' ? away : home;
    const offenseIds = offense.composites.map(c => c.id);
    const defenseIds = defense.composites.map(c => c.id);

    const end = runPossession(offense, defense);
    // Optional debug trace hook — set window.__realisticTrace to a fn before running a sim.
    const trace = (typeof globalThis !== 'undefined' ? (globalThis as any).__realisticTrace : undefined) as undefined | ((e: PossessionEnd, side: 'home' | 'away') => void);
    if (trace) trace(end, next);
    const scoreBefore = { off: 0 };
    acc.applyPossession(end, offenseIds, defenseIds, scoreBefore);

    // Rebound bookkeeping for missed shots that weren't fouled
    if (end.kind === 'shot' && !end.made && !end.fouled && !end.blockerId) {
      // Defensive vs offensive rebound — defense favored
      if (Math.random() < 0.74) {
        // DRB → defense gets ball
        const reb = pickRebounder(defense, 'drb');
        acc.applyRebound(reb.id, 'drb');
        next = next === 'home' ? 'away' : 'home';
      } else {
        const reb = pickRebounder(offense, 'orb');
        acc.applyRebound(reb.id, 'orb');
        // Same team retains possession — no flip
      }
    } else if (end.kind === 'shot' && end.blockerId) {
      // Blocked shot — defense recovers ~80%
      if (Math.random() < 0.8) {
        const reb = pickRebounder(defense, 'drb');
        acc.applyRebound(reb.id, 'drb');
        next = next === 'home' ? 'away' : 'home';
      } else {
        const reb = pickRebounder(offense, 'orb');
        acc.applyRebound(reb.id, 'orb');
      }
    } else {
      // Made shot, made FT, turnover, or foul → possession flips
      next = next === 'home' ? 'away' : 'home';
    }

    if (next === 'home') {
      // we just scored on away basket from home offense earlier; capture below via score deltas
    }

    if (offense === home) homeScore += scoreBefore.off; else awayScore += scoreBefore.off;
    possessions += 1;

    const elapsed = AVG_POSSESSION_SEC + (Math.random() - 0.5) * POSSESSION_VARIANCE_SEC;
    clock -= elapsed;
  }

  return { homeScore, awayScore, possessions };
}

function pickRebounder(unit: OnCourt, _kind: 'orb' | 'drb') {
  // Power-law on rebound composite so big men dominate the glass — linear
  // weighting was distributing rebounds too evenly across all 5 on-court,
  // letting guards collect ~3.5/g while bigs hit only 5/g (NBA C avg 6.3).
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
