import { OnCourt, PossessionEnd } from './types';
import { runPossession } from './possession';
import { BoxAccumulator } from './boxScoreAccumulator';

const AVG_POSSESSION_SEC = 14.5; // average seconds of game-clock per possession
const POSSESSION_VARIANCE_SEC = 6;

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
  const total = unit.composites.reduce((s, c) => s + c.rebound, 0);
  if (total <= 0) return unit.composites[0];
  let roll = Math.random() * total;
  for (const c of unit.composites) {
    roll -= c.rebound;
    if (roll < 0) return c;
  }
  return unit.composites[0];
}
