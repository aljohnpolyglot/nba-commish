import type { GameResult } from '../../types';
import type { InternationalTournamentState } from './types';

export function collectInternationalTournamentBoxScores(
  current: InternationalTournamentState | undefined,
  history: readonly InternationalTournamentState[] | undefined,
): GameResult[] {
  const byGameId = new Map<number, GameResult>();
  for (const tournament of [...(history ?? []), ...(current ? [current] : [])]) {
    for (const boxScore of tournament.boxScores ?? []) {
      byGameId.set(boxScore.gameId, boxScore);
    }
  }
  return [...byGameId.values()];
}
