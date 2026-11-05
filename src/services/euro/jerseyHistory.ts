import type { NBAPlayer } from '../../types';
import { EURO_BASKETBALL_SOURCE_ARCHIVES, EUROLEAGUE_2026_SOURCE } from '../../data/euroBasketballSources';
import { sanitizeRankDerivedJerseyHistory } from '../sourceJerseyHistory';

const SOURCE_COMPETITION_IDS = new Set(
  [EUROLEAGUE_2026_SOURCE, ...EURO_BASKETBALL_SOURCE_ARCHIVES].map(source => source.competitionId),
);

export function sanitizeEuroJerseyHistory(
  players: readonly NBAPlayer[],
  detectionPlayers: ReadonlyArray<{ stats?: readonly any[] }> = players,
  fallbackCompetitionId?: string,
): {
  players: NBAPlayer[];
  strippedRows: number;
  clearedPlayers: number;
  corruptedGroups: number;
} {
  return sanitizeRankDerivedJerseyHistory(
    players,
    detectionPlayers,
    fallbackCompetitionId,
    SOURCE_COMPETITION_IDS,
  );
}
