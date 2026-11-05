import { getCoachSystem } from '../../store/coachSystemStore';
import { getLockedStrategy } from '../../store/coachStrategyLockStore';
import { getDefenseGameplan } from '../../store/defenseGameplanStore';
import { getGameplan } from '../../store/gameplanStore';
import { getIdealRotation } from '../../store/idealRotationStore';
import { getScoringOptions } from '../../store/scoringOptionsStore';
import type { PreparedDayGame } from './GameSimulator';

const hasRealmLocalGameplayContext = (teamId: number): boolean => {
  const defense = getDefenseGameplan(teamId);
  return getCoachSystem(teamId) != null
    || getLockedStrategy(teamId) != null
    || getGameplan(teamId) != null
    || getIdealRotation(teamId)?.locked === true
    || getScoringOptions(teamId) != null
    || Number(defense.lastEdited ?? 0) !== 0;
};

/**
 * Browser-local coaching stores are not part of GameState. Until those values
 * have an explicit compact worker protocol, keep affected games on the main
 * realm so worker placement can never erase a user's game plan.
 */
export const isPreparedGameWorkerEligible = (game: PreparedDayGame): boolean => {
  if (game.args.watched || game.args.riggedForTid !== undefined) return false;
  const homeContextSafe = game.args.homeOverridePlayers != null
    || !hasRealmLocalGameplayContext(game.args.homeTeam.id);
  const awayContextSafe = game.args.awayOverridePlayers != null
    || !hasRealmLocalGameplayContext(game.args.awayTeam.id);
  return homeContextSafe && awayContextSafe;
};
