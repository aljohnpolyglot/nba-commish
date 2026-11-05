import type {
  InternationalTournamentGame,
  InternationalTournamentResult,
  InternationalTournamentState,
} from './types';

export interface AdvanceInternationalKnockoutOptions {
  nextDate: string;
  thirdPlaceDate?: string;
}

function phaseGames(
  tournament: InternationalTournamentState,
  phase: InternationalTournamentGame['phase'],
): InternationalTournamentGame[] {
  return tournament.games.filter(game => game.phase === phase);
}

function requireWinner(game: InternationalTournamentGame): string {
  if (!game.played || !game.winnerTeamId) throw new Error('The knockout round is not complete.');
  return game.winnerTeamId;
}

function loser(game: InternationalTournamentGame): string {
  const winner = requireWinner(game);
  return winner === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
}

function scheduleRound(
  tournament: InternationalTournamentState,
  sourceGames: InternationalTournamentGame[],
  phase: InternationalTournamentGame['phase'],
  date: string,
): InternationalTournamentState {
  const winners = sourceGames.map(requireWinner);
  const games = Array.from({ length: winners.length / 2 }, (_, index): InternationalTournamentGame => ({
    id: `${tournament.id}:${phase}:${index + 1}`,
    date,
    phase,
    homeTeamId: winners[index * 2],
    awayTeamId: winners[index * 2 + 1],
    played: false,
  }));
  return { ...tournament, games: [...tournament.games, ...games] };
}

function placementScore(game: InternationalTournamentGame): string | undefined {
  if (typeof game.homeScore !== 'number' || typeof game.awayScore !== 'number') return undefined;
  return requireWinner(game) === game.homeTeamId
    ? `${game.homeScore}-${game.awayScore}`
    : `${game.awayScore}-${game.homeScore}`;
}

function completedResult(
  final: InternationalTournamentGame,
  thirdPlace: InternationalTournamentGame,
): InternationalTournamentResult {
  return {
    championTeamId: requireWinner(final),
    runnerUpTeamId: loser(final),
    thirdPlaceTeamId: requireWinner(thirdPlace),
    fourthPlaceTeamId: loser(thirdPlace),
    finalScore: placementScore(final),
    thirdPlaceScore: placementScore(thirdPlace),
  };
}

export function advanceInternationalKnockoutStage(
  tournament: InternationalTournamentState,
  options: AdvanceInternationalKnockoutOptions,
): InternationalTournamentState {
  if (tournament.status === 'reviewed') return tournament;
  const final = phaseGames(tournament, 'final');
  const thirdPlace = phaseGames(tournament, 'third-place');
  if (final.length > 0 || thirdPlace.length > 0) {
    if (final.length !== 1 || thirdPlace.length !== 1) return tournament;
    if (!final[0].played || !thirdPlace[0].played) return tournament;
    return { ...tournament, status: 'complete', result: completedResult(final[0], thirdPlace[0]) };
  }

  const semifinals = phaseGames(tournament, 'semifinal');
  if (semifinals.length > 0) {
    if (!semifinals.every(game => game.played && game.winnerTeamId)) return tournament;
    if (semifinals.length !== 2) throw new Error('The international semifinal round must contain two games.');
    const medalGames: InternationalTournamentGame[] = [
      {
        id: `${tournament.id}:final`,
        date: options.nextDate,
        phase: 'final',
        homeTeamId: requireWinner(semifinals[0]),
        awayTeamId: requireWinner(semifinals[1]),
        played: false,
      },
      {
        id: `${tournament.id}:third-place`,
        date: options.thirdPlaceDate ?? options.nextDate,
        phase: 'third-place',
        homeTeamId: loser(semifinals[0]),
        awayTeamId: loser(semifinals[1]),
        played: false,
      },
    ];
    return { ...tournament, games: [...tournament.games, ...medalGames] };
  }

  const quarterfinals = phaseGames(tournament, 'quarterfinal');
  if (quarterfinals.length > 0) {
    if (!quarterfinals.every(game => game.played && game.winnerTeamId)) return tournament;
    return scheduleRound(tournament, quarterfinals, 'semifinal', options.nextDate);
  }

  const roundOf16 = phaseGames(tournament, 'round-of-16');
  if (roundOf16.length > 0) {
    if (!roundOf16.every(game => game.played && game.winnerTeamId)) return tournament;
    return scheduleRound(tournament, roundOf16, 'quarterfinal', options.nextDate);
  }

  return tournament;
}
