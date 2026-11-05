import type { InternationalTournamentGame } from '../fiba/types';
import type { SummerLeagueTeam, SummerLeagueTournamentState } from './types';

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function pairings(teamIds: readonly string[], rounds: number): Array<Array<[string, string]>> {
  const rotation = [...teamIds];
  if (rotation.length % 2 === 1) rotation.push('');
  const output: Array<Array<[string, string]>> = [];
  for (let round = 0; round < Math.min(rounds, rotation.length - 1); round += 1) {
    const games: Array<[string, string]> = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const home = rotation[index];
      const away = rotation[rotation.length - 1 - index];
      if (home && away) games.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
    output.push(games);
    rotation.splice(1, 0, rotation.pop() ?? '');
  }
  return output;
}

export function scheduleSummerLeaguePreliminary(
  teams: readonly SummerLeagueTeam[],
  tournamentId: string,
  startDate: string,
): InternationalTournamentGame[] {
  return pairings(teams.map(team => team.id), 5).flatMap((round, roundIndex) =>
    round.map(([homeTeamId, awayTeamId], gameIndex) => ({
      id: `${tournamentId}:preliminary:r${roundIndex + 1}:g${gameIndex + 1}`,
      date: addDays(startDate, roundIndex),
      phase: 'group' as const,
      group: 'LV',
      groupStage: 'first-round' as const,
      homeTeamId,
      awayTeamId,
      played: false,
    })),
  );
}

export function scheduleSummerLeagueFinal(
  tournament: SummerLeagueTournamentState,
  finalists: readonly [string, string],
): InternationalTournamentGame {
  const latestDate = tournament.games.map(game => game.date).sort().at(-1);
  if (!latestDate) throw new Error('Summer League final requires at least one scheduled game.');
  return {
    id: `${tournament.id}:final`,
    date: addDays(latestDate, 2),
    phase: 'final',
    homeTeamId: finalists[0],
    awayTeamId: finalists[1],
    played: false,
  };
}
