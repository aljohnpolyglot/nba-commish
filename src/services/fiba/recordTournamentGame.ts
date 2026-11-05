import type {
  InternationalTournamentState,
  SimulatedInternationalGame,
} from './types';

export function recordSimulatedInternationalGame(
  tournament: InternationalTournamentState,
  simulated: SimulatedInternationalGame,
): InternationalTournamentState {
  const gameIndex = tournament.games.findIndex(game => game.id === simulated.tournamentGame.id);
  if (gameIndex < 0) {
    throw new Error('The simulated international game is not part of this tournament.');
  }

  const games = [...tournament.games];
  games[gameIndex] = simulated.tournamentGame;
  const boxScores = [
    ...tournament.boxScores.filter(boxScore => boxScore.gameId !== simulated.boxScore.gameId),
    simulated.boxScore,
  ];

  return {
    ...tournament,
    games,
    boxScores,
  };
}
