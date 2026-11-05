import { EURO_BASKETBALL_SOURCE_ARCHIVES, EUROLEAGUE_2026_SOURCE } from '../../data/euroBasketballSources';
import type { Game, GameState, NonNBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { isOnRoster } from '../../utils/teamLookup';
import { buildPreseasonFriendlyGame } from '../competition/competitionScheduler';
import { getLeagueCalendarDates } from '../leagueCalendar';

type FriendlyState = Pick<
  GameState,
  'clubAliasMap' | 'gameMode' | 'leagueStats' | 'nonNBATeams' | 'players' | 'schedule' | 'userTeamId'
>;

export type EuroFriendlyVenue = 'home' | 'away';

export interface EuroPreseasonFriendlyWindow {
  startDate: string;
  endDate: string;
  limit: number;
}

const EURO_CLUB_LEAGUES = new Set([
  'Endesa',
  EUROLEAGUE_2026_SOURCE.leagueStatus,
  ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueStatus),
]);

const isoDay = (value: string | Date) => new Date(value).toISOString().slice(0, 10);

const canonicalTid = (state: FriendlyState, tid: number) => state.clubAliasMap?.[tid] ?? tid;

function ownedFriendlies(state: FriendlyState): Game[] {
  const userTid = Number(state.userTeamId);
  return state.schedule.filter(game => (
    game.euroFriendly === true
    && game.euroFriendlyOwnerTid === userTid
    && game.season === state.leagueStats.year
  ));
}

function rosterSize(state: FriendlyState, tid: number): number {
  return state.players.filter(player => (
    player.tid === tid
    && player.status !== 'Retired'
    && isOnRoster(player)
  )).length;
}

export function getEuroPreseasonFriendlyWindow(state: FriendlyState): EuroPreseasonFriendlyWindow {
  const dates = getLeagueCalendarDates(state.leagueStats.year, state.leagueStats);
  const start = dates.preseasonStart ?? dates.trainingCampStart ?? new Date(dates.regularSeasonStart.getTime() - 14 * 86_400_000);
  const end = dates.preseasonEnd ?? new Date(dates.regularSeasonStart.getTime() - 86_400_000);
  return {
    startDate: isoDay(start),
    endDate: isoDay(end),
    limit: Math.min(6, Math.max(0, Math.round(Number(dates.calendar.preseasonGamesPerTeam ?? 0)))),
  };
}

export function getEuroPreseasonFriendlyGames(state: FriendlyState): Game[] {
  return ownedFriendlies(state)
    .slice()
    .sort((left, right) => isoDay(left.date).localeCompare(isoDay(right.date)) || left.gid - right.gid);
}

export function getEuroPreseasonFriendlyCandidates(state: FriendlyState): NonNBATeam[] {
  if (state.leagueStats.uiMode !== 'euro_isolated' || state.gameMode !== 'gm' || state.userTeamId == null) return [];
  const userCanonicalTid = canonicalTid(state, state.userTeamId);
  const scheduledOpponentTids = new Set(ownedFriendlies(state).map(game => (
    game.homeTid === state.userTeamId ? game.awayTid : game.homeTid
  )));
  return state.nonNBATeams
    .filter(team => EURO_CLUB_LEAGUES.has(team.league))
    .filter(team => canonicalTid(state, team.tid) !== userCanonicalTid)
    .filter(team => !scheduledOpponentTids.has(team.tid))
    .filter(team => rosterSize(state, team.tid) >= 8)
    .sort((left, right) => getTeamFullName(left).localeCompare(getTeamFullName(right)) || left.tid - right.tid);
}

export function scheduleEuroPreseasonFriendly(
  state: GameState,
  input: { opponentTid: number; date: string; venue: EuroFriendlyVenue },
): GameState {
  if (state.leagueStats.uiMode !== 'euro_isolated' || state.gameMode !== 'gm' || state.userTeamId == null) {
    throw new Error('Friendlies can only be scheduled by a European club GM.');
  }
  const window = getEuroPreseasonFriendlyWindow(state);
  const date = isoDay(input.date);
  if (date < window.startDate || date > window.endDate) {
    throw new Error(`Choose a date inside the preseason window (${window.startDate} to ${window.endDate}).`);
  }
  const existing = ownedFriendlies(state);
  if (existing.length >= window.limit) throw new Error('The maximum number of friendlies is already scheduled.');
  const opponent = getEuroPreseasonFriendlyCandidates(state).find(team => team.tid === input.opponentTid);
  if (!opponent) {
    const alreadyScheduled = existing.some(game => game.homeTid === input.opponentTid || game.awayTid === input.opponentTid);
    throw new Error(alreadyScheduled ? 'That opponent is already on your friendly schedule.' : 'That club is not available for a friendly.');
  }
  const userTid = state.userTeamId;
  const canonicalUserTid = canonicalTid(state, userTid);
  const canonicalOpponentTid = canonicalTid(state, opponent.tid);
  const conflict = state.schedule.some(game => {
    if (isoDay(game.date) !== date) return false;
    const participants = [canonicalTid(state, game.homeTid), canonicalTid(state, game.awayTid)];
    return participants.includes(canonicalUserTid) || participants.includes(canonicalOpponentTid);
  });
  if (conflict) throw new Error('One of the clubs already has a game on that date.');
  const gid = Math.max(760_000, ...state.schedule.map(game => Number(game.gid) || 0)) + 1;
  const game: Game = {
    ...buildPreseasonFriendlyGame({
      gid,
      homeTid: input.venue === 'home' ? userTid : opponent.tid,
      awayTid: input.venue === 'home' ? opponent.tid : userTid,
      date: `${date}T00:00:00.000Z`,
      season: state.leagueStats.year,
    }),
    euroFriendly: true,
    euroFriendlyOwnerTid: userTid,
  };
  return {
    ...state,
    schedule: [...state.schedule, game]
      .sort((left, right) => Date.parse(left.date) - Date.parse(right.date) || left.gid - right.gid),
  };
}

export function removeEuroPreseasonFriendly(state: GameState, gid: number): GameState {
  const game = state.schedule.find(candidate => candidate.gid === gid);
  if (!game || game.played || game.euroFriendly !== true || game.euroFriendlyOwnerTid !== state.userTeamId) return state;
  return { ...state, schedule: state.schedule.filter(candidate => candidate.gid !== gid) };
}
