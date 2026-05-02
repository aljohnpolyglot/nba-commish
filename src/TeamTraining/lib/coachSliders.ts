// Wrap nba-commish canonical coach sliders + system proficiency.
// TeamTraining's PlayerK2 (flat .stats) and nba-commish's PlayerK2 (NBAPlayer.ratings[])
// are structurally compatible via mapPlayerToK2 which populates a ratings array,
// but TS treats them as distinct nominal types. Wrappers cast at the boundary.

import { calculateCoachSliders as _calculateCoachSliders, getSystemProficiency as _getSystemProficiency } from '../../utils/coachSliders';
import type { PlayerK2 } from '../types';
import type { K2Result } from '../types';

export type { CoachSliders } from '../../utils/coachSliders';
export { systemDescriptions } from '../../utils/systemDescriptions';
export type { SystemRequirement } from '../../utils/systemDescriptions';

export function calculateCoachSliders(roster: PlayerK2[], allRosters?: PlayerK2[][]) {
  return _calculateCoachSliders(roster as any, allRosters as any);
}

export function getSystemProficiency(
  k2: K2Result,
  starGap: number = 0,
  leadPlayerRatings?: any,
  fiveOutBonus: number = 0,
  secondPlayerRatings?: any,
  highIQCount: number = 0,
  tempo: number = 50,
  isVersatile: boolean = false,
  prefOffDef: number = 50
): Record<string, number> {
  return _getSystemProficiency(k2 as any, starGap, leadPlayerRatings, fiveOutBonus, secondPlayerRatings, highIQCount, tempo, isVersatile, prefOffDef);
}
