import type { GameState, NBAPlayer } from '../../types';
import { resolveContractSeasonOwnership } from '../../utils/contractSeasonSync';
import {
  getEffectiveContractEndYear,
  getOffseasonContractDecisions,
} from './offseasonContractDecision';

export function getEffectiveContractExpiryYear(player: NBAPlayer, fallbackYear: number): number {
  return getEffectiveContractEndYear(player) ?? fallbackYear;
}

export function getExpiringContractPlayers(
  state: Pick<GameState, 'players' | 'leagueStats'> & Partial<Pick<GameState, 'seasonLifecycle'>>,
  teamId: number,
): NBAPlayer[] {
  const playerById = new Map(state.players.map(player => [player.internalId, player]));
  return getOffseasonContractDecisions(state, teamId)
    .map(decision => playerById.get(decision.playerId))
    .filter((player): player is NBAPlayer => player !== undefined);
}

export function isExpiringContractBoardReviewed(
  state: Pick<GameState, 'leagueStats' | 'expiringPlayersReview'> & Partial<Pick<GameState, 'seasonLifecycle'>>,
  _players: readonly NBAPlayer[],
): boolean {
  const review = state.expiringPlayersReview;
  const season = getExpiringContractReviewSeason(state);
  return !!review && review.season === season;
}

export function getExpiringContractReviewSeason(
  state: Pick<GameState, 'leagueStats'> & Partial<Pick<GameState, 'seasonLifecycle'>>,
): number {
  return state.seasonLifecycle
    ? resolveContractSeasonOwnership(state).completedSeason
    : Number(state.leagueStats?.year ?? new Date().getFullYear());
}
