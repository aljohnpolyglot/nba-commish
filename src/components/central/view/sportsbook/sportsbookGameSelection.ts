import type { Game, GameState, NBATeam } from '../../../../types';
import { normalizeDate } from '../../../../utils/helpers';
import { resolveAnyTeam } from '../../../../utils/teamLookup';

type SportsbookTeamState = Pick<GameState, 'teams' | 'nonNBATeams'>;

export interface SportsbookGameTeams {
  home: NBATeam;
  away: NBATeam;
}

export interface SportsbookSlate {
  date: string;
  games: Game[];
  isToday: boolean;
}

export function getPendingSportsbookGamesForDate(
  schedule: Game[],
  date: string,
): Game[] {
  const normalizedCurrent = normalizeDate(date);
  return schedule.filter(game => normalizeDate(game.date) === normalizedCurrent && !game.played);
}

export function getSportsbookSlate(
  schedule: Game[],
  currentDate: string,
): SportsbookSlate {
  const normalizedCurrent = normalizeDate(currentDate);
  const todayGames = getPendingSportsbookGamesForDate(schedule, currentDate);
  if (todayGames.length > 0) {
    return { date: normalizedCurrent, games: todayGames, isToday: true };
  }

  const nextDate = schedule
    .filter(game => !game.played)
    .map(game => normalizeDate(game.date))
    .filter(date => date > normalizedCurrent)
    .sort()[0];

  if (!nextDate) return { date: normalizedCurrent, games: [], isToday: true };
  return {
    date: nextDate,
    games: getPendingSportsbookGamesForDate(schedule, nextDate),
    isToday: false,
  };
}

export function resolveSportsbookGameTeams(
  game: Pick<Game, 'homeTid' | 'awayTid'>,
  state: SportsbookTeamState,
): SportsbookGameTeams | null {
  const home = resolveAnyTeam(game.homeTid, state.teams, state.nonNBATeams);
  const away = resolveAnyTeam(game.awayTid, state.teams, state.nonNBATeams);
  return home && away ? { home, away } : null;
}
