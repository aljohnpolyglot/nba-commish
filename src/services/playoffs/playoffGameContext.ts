import type { Game, PlayoffBracket } from '../../types';

/** Exact saved-series evidence for Hybrid routing; an ordinary playoff game is not an elimination game. */
export function isPostseasonEliminationGame(
  game: Pick<Game, 'isPlayoff' | 'isPlayIn' | 'playoffSeriesId'>,
  bracket: Pick<PlayoffBracket, 'series'> | null | undefined,
): boolean {
  if (game.isPlayIn) return true;
  if (!game.isPlayoff || !game.playoffSeriesId || !bracket) return false;
  const series = bracket.series.find(candidate => candidate.id === game.playoffSeriesId);
  if (!series || series.status === 'complete') return false;
  const winsNeeded = Math.ceil(Math.max(1, Number(series.gamesNeeded) || 7) / 2);
  return Number(series.higherSeedWins ?? 0) === winsNeeded - 1
    || Number(series.lowerSeedWins ?? 0) === winsNeeded - 1;
}
