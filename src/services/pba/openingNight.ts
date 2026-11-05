import type { Game, GameState, NBATeam } from '../../types';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { getConferenceSpec, getConferenceStartIso } from './conferenceTransition';

interface PbaOpeningNightDraft {
  homeTid: number;
  awayTid: number;
  date: string;
  city: string;
  country: string;
  venue?: string;
}

const sameMatchup = (game: Pick<Game, 'homeTid' | 'awayTid'>, draft: PbaOpeningNightDraft) =>
  (game.homeTid === draft.homeTid && game.awayTid === draft.awayTid)
  || (game.homeTid === draft.awayTid && game.awayTid === draft.homeTid);

export function getPbaOpeningNightDate(state: Pick<GameState, 'leagueStats'>): string {
  return getConferenceStartIso('philippine', state.leagueStats.year);
}

export function getPbaOpeningNightTeams(
  state: Pick<GameState, 'leagueStats' | 'nonNBATeams' | 'players'>,
): NBATeam[] {
  const pbaTeams = (state.nonNBATeams ?? []).filter(team => team.league === 'PBA');
  const teamIds = new Set(pbaTeams.map(team => team.tid));
  const strengthByTid = new Map<number, number>();
  for (const tid of teamIds) {
    const ratings = state.players
      .filter(player => player.tid === tid)
      .map(player => Number(player.overallRating ?? player.ratings?.at(-1)?.ovr ?? 0))
      .filter(Number.isFinite)
      .sort((left, right) => right - left)
      .slice(0, 8);
    strengthByTid.set(
      tid,
      ratings.length > 0
        ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
        : 0,
    );
  }
  return pbaTeams.map(team => {
    const snapshot = getHistoricalTeamSnapshot(team, state.leagueStats.year);
    return {
      id: team.tid,
      name: snapshot.name,
      region: snapshot.region,
      abbrev: snapshot.abbrev || team.abbrev || 'PBA',
      conference: 'PBA',
      wins: Number((team as typeof team & { wins?: number; won?: number }).wins
        ?? (team as typeof team & { won?: number }).won
        ?? 0),
      losses: Number((team as typeof team & { losses?: number; lost?: number }).losses
        ?? (team as typeof team & { lost?: number }).lost
        ?? 0),
      strength: strengthByTid.get(team.tid) ?? 0,
      logoUrl: snapshot.logoUrl,
      colors: snapshot.colors,
      pop: team.pop,
      stadiumCapacity: team.stadiumCapacity,
    };
  });
}

export function applyPbaOpeningNight(
  state: GameState,
  draft: PbaOpeningNightDraft,
): Partial<GameState> {
  const competitionId = getConferenceSpec('philippine', state.leagueStats.year).id;
  const regularGames = state.schedule
    .filter(game =>
      game.competitionId === competitionId
      && !game.played
      && !['qf', 'sf', 'final'].includes(String(game.competitionPhase ?? '')),
    )
    .sort((left, right) => left.date.localeCompare(right.date) || left.gid - right.gid);
  const selectedGame = regularGames.find(game => sameMatchup(game, draft));
  const openingGame = regularGames[0];
  const openingDate = getPbaOpeningNightDate(state);
  const selectedDate = selectedGame?.date ?? `${openingDate}T00:00:00.000Z`;
  const openingGameDate = openingGame?.date ?? `${openingDate}T00:00:00.000Z`;

  const schedule = selectedGame
    ? state.schedule.map(game => {
        if (game.gid === selectedGame.gid) {
          return {
            ...game,
            date: openingGameDate,
            city: draft.city,
            country: draft.country,
            venue: draft.venue,
          };
        }
        if (openingGame && openingGame.gid !== selectedGame.gid && game.gid === openingGame.gid) {
          return { ...game, date: selectedDate };
        }
        return game;
      }).sort((left, right) => left.date.localeCompare(right.date) || left.gid - right.gid)
    : state.schedule;

  return {
    schedule,
    globalGames: [{ ...draft, date: openingDate }],
    leagueStats: {
      ...state.leagueStats,
      hasScheduledGlobalGames: true,
      globalGamesScheduledYear: state.leagueStats.year,
    },
  };
}
