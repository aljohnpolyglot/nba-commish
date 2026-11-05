import type { NBAPlayer } from '../../types';
import { advanceInternationalKnockoutStage } from './advanceKnockoutStage';
import { recordSimulatedInternationalGame } from './recordTournamentGame';
import { scheduleInternationalKnockoutStage } from './scheduleKnockoutStage';
import { scheduleInternationalSecondGroupStage } from './scheduleSecondGroupStage';
import { simulateInternationalGame } from './simulateInternationalGame';
import type {
  InternationalTournamentGame,
  InternationalTournamentState,
  SimulatedInternationalGame,
} from './types';

export type InternationalTournamentSimTarget =
  | 'day'
  | 'round'
  | 'second-round'
  | 'classification'
  | 'quarterfinal'
  | 'semifinal'
  | 'third-place'
  | 'final';

interface InternationalTournamentSimOptions {
  stopBeforeDate?: string;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

export function nextInternationalTournamentGameDate(tournament: InternationalTournamentState): string | undefined {
  return tournament.games
    .filter(game => !game.played)
    .map(game => game.date)
    .sort()[0];
}

export function hasInternationalTournamentWindowStarted(
  tournament: InternationalTournamentState,
  currentDate: string,
): boolean {
  if (tournament.games.some(game => game.played)) return true;
  const firstGameDate = tournament.games.map(game => game.date).sort()[0];
  return !!firstGameDate && firstGameDate <= currentDate;
}

export function isInternationalPlayButtonAvailable(
  tournament: InternationalTournamentState | null | undefined,
): boolean {
  return !!tournament
    && !tournament.readOnly
    && tournament.status !== 'complete'
    && tournament.status !== 'reviewed';
}

export function alignInternationalTournamentToDate(
  tournament: InternationalTournamentState,
  currentDate: string,
): InternationalTournamentState {
  const firstUnplayed = nextInternationalTournamentGameDate(tournament);
  if (!firstUnplayed || firstUnplayed >= currentDate) return tournament;
  const shift = daysBetween(firstUnplayed, currentDate);
  return {
    ...tournament,
    games: tournament.games.map(game => game.played ? game : { ...game, date: addDays(game.date, shift) }),
  };
}

function nextRoundDate(tournament: InternationalTournamentState): string {
  const dates = tournament.games.map(game => game.date).sort();
  const latest = dates[dates.length - 1] ?? `${tournament.playedYear ?? tournament.year}-08-24`;
  return addDays(latest, 2);
}

function knockoutSize(teamCount: number): 4 | 8 | 16 {
  if (teamCount >= 16) return 16;
  if (teamCount >= 8) return 8;
  return 4;
}

function advanceTournamentStructure(
  tournament: InternationalTournamentState,
): InternationalTournamentState {
  if (tournament.games.some(game => !game.played)) return tournament;
  const nextDate = nextRoundDate(tournament);
  if (tournament.status === 'group-stage') {
    const hasSecondRound = tournament.groups.some(group => group.stage === 'second-round');
    if (tournament.kind === 'world-cup' && !hasSecondRound && tournament.teams.length >= 16) {
      return scheduleInternationalSecondGroupStage(tournament, {
        startDate: nextDate,
        daysBetweenRounds: 2,
        qualifiersPerGroup: 2,
        includeClassification: true,
      });
    }
    const activeGroups = hasSecondRound
      ? tournament.groups.filter(group => group.stage === 'second-round')
      : tournament.groups.filter(group => group.stage !== 'classification');
    const activeTeamCount = new Set(activeGroups.flatMap(group => group.teamIds)).size;
    const bracketSize = knockoutSize(activeTeamCount);
    return scheduleInternationalKnockoutStage(tournament, {
      startDate: nextDate,
      bracketSize,
      directQualifiersPerGroup: Math.max(1, Math.floor(bracketSize / Math.max(1, activeGroups.length))),
    });
  }
  if (tournament.status === 'knockout') {
    return advanceInternationalKnockoutStage(tournament, {
      nextDate: addDays(nextDate, 1),
      thirdPlaceDate: nextDate,
    });
  }
  return tournament;
}

export function simulateNextInternationalTournamentGame(
  tournament: InternationalTournamentState,
  players: readonly NBAPlayer[],
  playerApproval?: number,
): InternationalTournamentState {
  if (tournament.status === 'complete' || tournament.status === 'reviewed') return tournament;
  const game = tournament.games
    .filter(row => !row.played)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  if (!game) return advanceTournamentStructure(tournament);
  return simulateInternationalTournamentGameById(tournament, game.id, players, playerApproval).tournament;
}

export function nextInternationalGameId(tournament: InternationalTournamentState): number {
  return 970_000_000 + ((tournament.playedYear ?? tournament.year) % 1000) * 1000 + tournament.boxScores.length;
}

export function simulateInternationalTournamentGameById(
  tournament: InternationalTournamentState,
  tournamentGameId: string,
  players: readonly NBAPlayer[],
  playerApproval?: number,
  riggedForTid?: number,
): { tournament: InternationalTournamentState; result: SimulatedInternationalGame['boxScore'] } {
  const game = tournament.games.find(row => row.id === tournamentGameId && !row.played);
  if (!game) throw new Error('The selected international game is no longer available.');
  const simulated = simulateInternationalGame({
    tournament,
    game,
    gameId: nextInternationalGameId(tournament),
    savePlayers: players,
    playerApproval,
    riggedForTid,
  });
  return {
    tournament: advanceTournamentStructure(recordSimulatedInternationalGame(tournament, simulated)),
    result: simulated.boxScore,
  };
}

export function simulateRemainingInternationalTournament(
  tournament: InternationalTournamentState,
  players: readonly NBAPlayer[],
  playerApproval?: number,
): InternationalTournamentState {
  let next = tournament;
  for (let step = 0; step < 512 && !['complete', 'reviewed'].includes(next.status); step += 1) {
    const previous = next;
    next = simulateNextInternationalTournamentGame(next, players, playerApproval);
    if (next === previous) break;
  }
  return next;
}

function hasReachedTarget(
  tournament: InternationalTournamentState,
  target: Exclude<InternationalTournamentSimTarget, 'day' | 'round'>,
): boolean {
  if (target === 'second-round') {
    return tournament.games.some(game => !game.played && game.groupStage === 'second-round');
  }
  if (target === 'classification') {
    return tournament.games.some(game => !game.played && game.phase === 'classification');
  }
  return tournament.games.some(game => !game.played && game.phase === target);
}

export function simulateInternationalTournamentToTarget(
  tournament: InternationalTournamentState,
  players: readonly NBAPlayer[],
  target: InternationalTournamentSimTarget,
  playerApproval?: number,
  options: InternationalTournamentSimOptions = {},
): InternationalTournamentState {
  if (['complete', 'reviewed'].includes(tournament.status)) return tournament;
  if (target === 'day') {
    let next = tournament;
    let firstDate = next.games.filter(game => !game.played).map(game => game.date).sort()[0];
    if (!firstDate) {
      next = simulateNextInternationalTournamentGame(next, players, playerApproval);
      firstDate = next.games.filter(game => !game.played).map(game => game.date).sort()[0];
    }
    if (!firstDate || (options.stopBeforeDate && firstDate >= options.stopBeforeDate)) return next;
    for (let step = 0; step < 128 && next.games.some(game => !game.played && game.date === firstDate); step += 1) {
      next = simulateNextInternationalTournamentGame(next, players, playerApproval);
    }
    return next;
  }

  if (target === 'round') {
    let next = tournament;
    const first = next.games
      .filter(game => !game.played)
      .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))[0];
    if (!first || ['group', 'classification'].includes(first.phase)) return next;
    const phases = first.phase === 'third-place' || first.phase === 'final'
      ? new Set<InternationalTournamentGame['phase']>(['third-place', 'final'])
      : new Set<InternationalTournamentGame['phase']>([first.phase]);
    for (let step = 0; step < 32 && next.games.some(game => !game.played && phases.has(game.phase)); step += 1) {
      const gameDate = nextInternationalTournamentGameDate(next);
      if (gameDate && options.stopBeforeDate && gameDate >= options.stopBeforeDate) return next;
      next = simulateNextInternationalTournamentGame(next, players, playerApproval);
    }
    return next;
  }

  let next = tournament;
  for (let step = 0; step < 512 && !['complete', 'reviewed'].includes(next.status); step += 1) {
    if (target === 'final') {
      const bronzeGame = next.games.find(game => game.phase === 'third-place' && !game.played);
      const finalGame = next.games.find(game => game.phase === 'final');
      if (bronzeGame && finalGame) {
        if (options.stopBeforeDate && bronzeGame.date >= options.stopBeforeDate) return next;
        next = simulateInternationalTournamentGameById(next, bronzeGame.id, players, playerApproval).tournament;
        continue;
      }
    }
    if (hasReachedTarget(next, target)) return next;
    const gameDate = nextInternationalTournamentGameDate(next);
    if (gameDate && options.stopBeforeDate && gameDate >= options.stopBeforeDate) return next;
    const previous = next;
    next = simulateNextInternationalTournamentGame(next, players, playerApproval);
    if (next === previous) break;
  }
  return next;
}
