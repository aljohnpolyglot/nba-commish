import type { GameState, NBAPlayer } from '../../types';
import { getDisplayOverall, getProspectDisplayPotential } from '../../utils/playerRatings';
import { getSimulationSeed } from '../saveIdentity';
import { getGMAttributes, gmDraftBoardScore } from '../staff/gmAttributes';

export type AiDraftProspect = NBAPlayer & {
  displayOvr?: number;
  displayPot?: number;
};

/** AI clubs read the real saved talent. User scouting uncertainty is UI-only. */
export function getAiDraftTalentScore(player: AiDraftProspect, season: number): number {
  const overall = Number(player.displayOvr ?? getDisplayOverall(player, season));
  const potential = Number(player.displayPot ?? getProspectDisplayPotential(player, season));
  return overall * 0.45 + potential * 0.55;
}

export function selectAiDraftProspect<T extends AiDraftProspect>(input: {
  state: GameState;
  teamId: number;
  pickSlot: number;
  season: number;
  pool: readonly T[];
}): T | undefined {
  const { state, teamId, pickSlot, season, pool } = input;
  if (pool.length === 0) return undefined;
  const drafting = getGMAttributes(state, teamId).drafting;
  return [...pool].sort((left, right) => {
    const score = (player: T) => gmDraftBoardScore(
      getAiDraftTalentScore(player, season),
      drafting,
      `${getSimulationSeed(state)}:${season}:${teamId}:${pickSlot}:${player.internalId}`,
    );
    return score(right) - score(left) || String(left.internalId).localeCompare(String(right.internalId));
  })[0];
}
