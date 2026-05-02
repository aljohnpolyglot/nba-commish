import type { Player, PlayerK2, K2Result } from '../types';
import { calculateK2 } from '../../services/simulation/convert2kAttributes';

export function mapPlayerToK2(p: Player): PlayerK2 {
  const k2Data = calculateK2(p.stats as any, {
    pos: p.pos,
    heightIn: p.heightIn,
    weightLbs: p.weightLbs,
    age: p.age,
  });

  // Reshape to K2Result (just the sub arrays — TeamTraining UI consumes these directly).
  const k2: K2Result = {
    OS: k2Data.OS.sub,
    AT: k2Data.AT.sub,
    IS: k2Data.IS.sub,
    PL: k2Data.PL.sub,
    DF: k2Data.DF.sub,
    RB: k2Data.RB.sub,
  };

  return {
    ...p,
    k2,
    // nba-commish src/utils/coachSliders reads p.ratings[last].spd|tp|... — populate
    // a single-entry ratings array from p.stats so calculateCoachSliders works against
    // TeamTraining's flat-stats PlayerK2.
    ratings: [{ ...p.stats, ovr: p.ovr }],
    rating2K: p.ovr,
    bbgmOvr: p.ovr,
    currentRating: p.stats,
  };
}
