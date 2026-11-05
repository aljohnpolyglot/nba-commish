import type {
  InternationalTournamentGame,
  InternationalTournamentGroup,
  InternationalTournamentState,
} from './types';

export interface ScheduleInternationalGroupStageOptions {
  startDate: string;
  groupSize: number;
  daysBetweenRounds: number;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function groupLabel(index: number): string {
  let value = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

function drawGroups(
  teamIds: readonly string[],
  groupSize: number,
): InternationalTournamentGroup[] {
  let groupCount = Math.max(1, Math.ceil(teamIds.length / Math.max(2, groupSize)));
  if (groupCount > 1 && groupCount % 2 === 1) groupCount -= 1;
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    id: groupLabel(index),
    stage: 'first-round' as const,
    teamIds: [] as string[],
  }));

  teamIds.forEach((teamId, index) => {
    const row = Math.floor(index / groupCount);
    const column = index % groupCount;
    const groupIndex = row % 2 === 0 ? column : groupCount - 1 - column;
    groups[groupIndex].teamIds.push(teamId);
  });
  return groups;
}

function roundRobinPairs(teamIds: readonly string[]): Array<Array<[string, string]>> {
  const rotation = [...teamIds];
  if (rotation.length % 2 === 1) rotation.push('');
  const rounds: Array<Array<[string, string]>> = [];

  for (let round = 0; round < rotation.length - 1; round += 1) {
    const games: Array<[string, string]> = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const home = rotation[index];
      const away = rotation[rotation.length - 1 - index];
      if (home && away) games.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
    rounds.push(games);
    rotation.splice(1, 0, rotation.pop() ?? '');
  }
  return rounds;
}

export function scheduleInternationalGroupStage(
  tournament: InternationalTournamentState,
  options: ScheduleInternationalGroupStageOptions,
): InternationalTournamentState {
  const groups = drawGroups(tournament.teams.map(team => team.id), options.groupSize);
  const games: InternationalTournamentGame[] = [];

  for (const group of groups) {
    const rounds = roundRobinPairs(group.teamIds);
    rounds.forEach((roundGames, roundIndex) => {
      roundGames.forEach(([homeTeamId, awayTeamId], gameIndex) => {
        games.push({
          id: `${tournament.id}:group-${group.id}:r${roundIndex + 1}:g${gameIndex + 1}`,
          date: addDays(options.startDate, roundIndex * options.daysBetweenRounds),
          phase: 'group',
          group: group.id,
          groupStage: 'first-round',
          homeTeamId,
          awayTeamId,
          played: false,
        });
      });
    });
  }

  return {
    ...tournament,
    status: games.length > 0 ? 'group-stage' : tournament.status,
    groups,
    games,
  };
}
