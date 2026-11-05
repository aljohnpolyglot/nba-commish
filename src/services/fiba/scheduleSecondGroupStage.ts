import { calculateInternationalGroupStandings } from './calculateGroupStandings';
import type {
  InternationalTournamentGame,
  InternationalTournamentGroup,
  InternationalTournamentState,
} from './types';

export interface ScheduleInternationalSecondGroupStageOptions {
  startDate: string;
  daysBetweenRounds: number;
  qualifiersPerGroup: number;
  includeClassification: boolean;
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

function crossGroupGames(
  tournament: InternationalTournamentState,
  group: InternationalTournamentGroup,
  leftTeamIds: readonly string[],
  rightTeamIds: readonly string[],
  options: ScheduleInternationalSecondGroupStageOptions,
): InternationalTournamentGame[] {
  const phase = group.stage === 'classification' ? 'classification' : 'group';
  const games: InternationalTournamentGame[] = [];
  leftTeamIds.forEach((leftTeamId, leftIndex) => {
    rightTeamIds.forEach((rightTeamId, rightIndex) => {
      const round = (leftIndex + rightIndex) % Math.max(1, rightTeamIds.length);
      games.push({
        id: `${tournament.id}:${group.stage}:${group.id}:${leftIndex + 1}-${rightIndex + 1}`,
        date: addDays(options.startDate, round * options.daysBetweenRounds),
        phase,
        group: group.id,
        groupStage: group.stage,
        homeTeamId: (leftIndex + rightIndex) % 2 === 0 ? leftTeamId : rightTeamId,
        awayTeamId: (leftIndex + rightIndex) % 2 === 0 ? rightTeamId : leftTeamId,
        played: false,
      });
    });
  });
  return games;
}

export function scheduleInternationalSecondGroupStage(
  tournament: InternationalTournamentState,
  options: ScheduleInternationalSecondGroupStageOptions,
): InternationalTournamentState {
  if (tournament.groups.some(group => group.stage === 'second-round')) return tournament;
  const firstRoundGroups = tournament.groups.filter(group => (group.stage ?? 'first-round') === 'first-round');
  if (firstRoundGroups.length === 0 || firstRoundGroups.length % 2 !== 0) {
    throw new Error('The international second round requires an even number of first-round groups.');
  }
  const firstRoundGames = tournament.games.filter(game => (game.groupStage ?? 'first-round') === 'first-round');
  if (firstRoundGames.length === 0 || firstRoundGames.some(game => !game.played)) {
    throw new Error('The international first round must be complete before the second round.');
  }

  const standings = calculateInternationalGroupStandings(tournament);
  const secondRoundGroups: InternationalTournamentGroup[] = [];
  const classificationGroups: InternationalTournamentGroup[] = [];
  const games: InternationalTournamentGame[] = [];
  const qualifierCount = Math.max(1, Math.floor(options.qualifiersPerGroup));

  for (let index = 0; index < firstRoundGroups.length; index += 2) {
    const left = firstRoundGroups[index];
    const right = firstRoundGroups[index + 1];
    const leftRows = standings[left.id] ?? [];
    const rightRows = standings[right.id] ?? [];
    const secondRoundGroup: InternationalTournamentGroup = {
      id: groupLabel(firstRoundGroups.length + index / 2),
      stage: 'second-round',
      teamIds: [
        ...leftRows.slice(0, qualifierCount).map(row => row.teamId),
        ...rightRows.slice(0, qualifierCount).map(row => row.teamId),
      ],
    };
    secondRoundGroups.push(secondRoundGroup);
    games.push(...crossGroupGames(
      tournament,
      secondRoundGroup,
      leftRows.slice(0, qualifierCount).map(row => row.teamId),
      rightRows.slice(0, qualifierCount).map(row => row.teamId),
      options,
    ));

    if (options.includeClassification) {
      const classificationGroup: InternationalTournamentGroup = {
        id: groupLabel(firstRoundGroups.length + firstRoundGroups.length / 2 + index / 2),
        stage: 'classification',
        teamIds: [
          ...leftRows.slice(qualifierCount).map(row => row.teamId),
          ...rightRows.slice(qualifierCount).map(row => row.teamId),
        ],
      };
      classificationGroups.push(classificationGroup);
      games.push(...crossGroupGames(
        tournament,
        classificationGroup,
        leftRows.slice(qualifierCount).map(row => row.teamId),
        rightRows.slice(qualifierCount).map(row => row.teamId),
        options,
      ));
    }
  }

  return {
    ...tournament,
    groups: [...tournament.groups, ...secondRoundGroups, ...classificationGroups],
    games: [...tournament.games, ...games],
  };
}
