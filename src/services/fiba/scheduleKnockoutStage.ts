import { calculateInternationalGroupStandings } from './calculateGroupStandings';
import type {
  InternationalGroupStanding,
  InternationalTournamentGame,
  InternationalTournamentGroup,
  InternationalTournamentState,
} from './types';

export interface ScheduleInternationalKnockoutOptions {
  startDate: string;
  bracketSize: 4 | 8 | 16;
  directQualifiersPerGroup: number;
}

function teamSeed(tournament: InternationalTournamentState, teamId: string): number {
  return tournament.teams.find(team => team.id === teamId)?.seed ?? Number.MAX_SAFE_INTEGER;
}

function compareStanding(
  tournament: InternationalTournamentState,
  left: InternationalGroupStanding,
  right: InternationalGroupStanding,
): number {
  return right.tablePoints - left.tablePoints
    || right.pointDifference - left.pointDifference
    || right.pointsFor - left.pointsFor
    || teamSeed(tournament, left.teamId) - teamSeed(tournament, right.teamId);
}

function phaseForSize(size: number): InternationalTournamentGame['phase'] {
  if (size === 16) return 'round-of-16';
  if (size === 8) return 'quarterfinal';
  return 'semifinal';
}

function activeGroups(tournament: InternationalTournamentState): InternationalTournamentGroup[] {
  const secondRound = tournament.groups.filter(group => group.stage === 'second-round');
  return secondRound.length > 0
    ? secondRound
    : tournament.groups.filter(group => group.stage !== 'classification');
}

function allGroupGamesComplete(
  tournament: InternationalTournamentState,
  groups: readonly InternationalTournamentGroup[],
): boolean {
  const groupIds = new Set(groups.map(group => group.id));
  const stage = groups[0]?.stage ?? 'first-round';
  const groupGames = tournament.games.filter(game =>
    game.phase === 'group'
    && groupIds.has(game.group ?? '')
    && (game.groupStage ?? 'first-round') === stage,
  );
  return groupGames.length > 0 && groupGames.every(game =>
    game.played && typeof game.homeScore === 'number' && typeof game.awayScore === 'number',
  );
}

function qualifyingTeamIds(
  tournament: InternationalTournamentState,
  bracketSize: number,
  directQualifiersPerGroup: number,
): string[] {
  const standings = calculateInternationalGroupStandings(tournament);
  const groups = activeGroups(tournament);
  const direct: InternationalGroupStanding[] = [];
  const wildcards: InternationalGroupStanding[] = [];
  for (const group of groups) {
    const rows = standings[group.id] ?? [];
    direct.push(...rows.slice(0, directQualifiersPerGroup));
    wildcards.push(...rows.slice(directQualifiersPerGroup));
  }

  const selected = [
    ...direct.sort((left, right) => left.rank - right.rank || compareStanding(tournament, left, right)),
    ...wildcards.sort((left, right) => left.rank - right.rank || compareStanding(tournament, left, right)),
  ].slice(0, bracketSize);
  return selected.sort((left, right) => compareStanding(tournament, left, right)).map(row => row.teamId);
}

export function scheduleInternationalKnockoutStage(
  tournament: InternationalTournamentState,
  options: ScheduleInternationalKnockoutOptions,
): InternationalTournamentState {
  const groups = activeGroups(tournament);
  if (!allGroupGamesComplete(tournament, groups)) {
    throw new Error('The international group stage must be complete before the knockout draw.');
  }
  if (tournament.games.some(game => !['group', 'classification'].includes(game.phase))) return tournament;

  const qualifiers = qualifyingTeamIds(
    tournament,
    options.bracketSize,
    Math.max(1, Math.floor(options.directQualifiersPerGroup)),
  );
  if (qualifiers.length !== options.bracketSize) {
    throw new Error('The international field does not contain enough knockout qualifiers.');
  }

  const phase = phaseForSize(options.bracketSize);
  const games = Array.from({ length: qualifiers.length / 2 }, (_, index): InternationalTournamentGame => ({
    id: `${tournament.id}:${phase}:${index + 1}`,
    date: options.startDate,
    phase,
    homeTeamId: qualifiers[index],
    awayTeamId: qualifiers[qualifiers.length - 1 - index],
    played: false,
  }));

  return {
    ...tournament,
    status: 'knockout',
    games: [...tournament.games, ...games],
  };
}
