import type { GameState, NBAPlayer } from '../../types';
import {
  getScoutedDisplayOverall,
  getScoutedDisplayPotential,
} from '../../utils/scoutingFuzz';

export function getQualifyingOfferDisplayRatings(
  state: GameState,
  player: NBAPlayer,
  currentYear: number,
): { overall: number; potential: number; portraitOvrLabel: string } {
  const overall = getScoutedDisplayOverall(state, player, currentYear);
  const potential = getScoutedDisplayPotential(state, player, currentYear, currentYear);
  return {
    overall,
    potential,
    portraitOvrLabel: String(overall),
  };
}
