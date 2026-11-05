import type { GameResult } from '../../types';

export interface PreseasonPlayerSummary {
  gameCount: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
}

export type PreseasonLeadStoryFacts =
  | ({ kind: 'single-game' } & PreseasonPlayerSummary)
  | ({ kind: 'multi-game-average' } & PreseasonPlayerSummary);

const perGame = (total: number, games: number): number => Number((total / games).toFixed(1));

export function summarizePreseasonPlayerResults(
  playerId: string,
  results: Pick<GameResult, 'homeStats' | 'awayStats'>[],
): PreseasonPlayerSummary | null {
  const appearances = results.flatMap(result => [...result.homeStats, ...result.awayStats])
    .filter(stat => stat.playerId === playerId);
  if (appearances.length === 0) return null;
  const totals = appearances.reduce((sum, stat) => ({
    points: sum.points + Number(stat.pts ?? 0),
    rebounds: sum.rebounds + Number(stat.reb ?? 0),
    assists: sum.assists + Number(stat.ast ?? 0),
  }), { points: 0, rebounds: 0, assists: 0 });
  return {
    gameCount: appearances.length,
    pointsPerGame: perGame(totals.points, appearances.length),
    reboundsPerGame: perGame(totals.rebounds, appearances.length),
    assistsPerGame: perGame(totals.assists, appearances.length),
  };
}

export function buildPreseasonLeadStoryFacts(
  playerId: string,
  results: Pick<GameResult, 'homeStats' | 'awayStats'>[],
): PreseasonLeadStoryFacts | null {
  const summary = summarizePreseasonPlayerResults(playerId, results);
  if (!summary) return null;
  return {
    ...summary,
    kind: summary.gameCount === 1 ? 'single-game' : 'multi-game-average',
  };
}
