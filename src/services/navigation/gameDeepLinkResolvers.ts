import type { Game, GameResult, GameState, NBAPlayer, NBATeam, NonNBATeam } from '../../types';
import { resolvePlayerByCanonicalPersonId } from '../../utils/playerIdentity';
import { getSaveVisiblePeople } from '../playerUniverse/canonicalHistoricalPeople';
import { findBoxScoreForScheduledGame } from '../../utils/boxScoreLookup';
import {
  getPrimaryLeagueIdentityNamespace,
  resolveCanonicalFranchiseId,
  resolveCanonicalTeamIdentityId,
} from '../teamIdentity';

type TeamLike = NBATeam | NonNBATeam;

const teamNamespace = (state: GameState, team: TeamLike): string => (
  'league' in team && team.league
    ? String(team.league)
    : getPrimaryLeagueIdentityNamespace(state)
);

const allTeams = (state: GameState): TeamLike[] => [
  ...(state.teams ?? []),
  ...(state.nonNBATeams ?? []),
  ...((state.teamArchive ?? []) as NBATeam[]),
];

export function getCanonicalGameIdentity(game: Pick<Game, 'gid' | 'date' | 'season' | 'competitionId'>): string {
  const season = Number(game.season)
    || Number(String(game.date ?? '').match(/\d{4}/)?.[0])
    || 0;
  const competition = String(game.competitionId ?? 'league').trim() || 'league';
  return `game:${competition}:${season}:${String(game.gid)}`;
}

export function resolveDeepLinkedTeam(state: GameState, teamIdentityId: string): TeamLike | undefined {
  const target = String(teamIdentityId).trim();
  return allTeams(state).find(team => (
    resolveCanonicalTeamIdentityId(team, teamNamespace(state, team)) === target
  ));
}

export function resolveDeepLinkedFranchiseTeam(state: GameState, franchiseId: string): TeamLike | undefined {
  const target = String(franchiseId).trim();
  return allTeams(state).find(team => (
    resolveCanonicalFranchiseId(team, teamNamespace(state, team)) === target
  ));
}

export function resolveDeepLinkedPlayer(state: GameState, personId: string): NBAPlayer | undefined {
  return resolvePlayerByCanonicalPersonId(getSaveVisiblePeople(state), personId);
}

export function resolveDeepLinkedGame(
  state: Pick<GameState, 'schedule' | 'boxScores' | 'internationalTournament'>,
  gameId: string,
): { game: Game; result?: GameResult } | undefined {
  const target = String(gameId).trim();
  const exactScheduled = (state.schedule ?? []).find(game => getCanonicalGameIdentity(game) === target);
  if (exactScheduled) {
    return {
      game: exactScheduled,
      result: findBoxScoreForScheduledGame(state.boxScores, exactScheduled),
    };
  }
  const matchesId = (value: unknown): boolean => {
    const raw = String(value ?? '').trim();
    return raw === target || `game:${raw}` === target || target.endsWith(`:${raw}`);
  };
  const scheduled = (state.schedule ?? []).find(game => matchesId(game.gid));
  if (scheduled) {
    return {
      game: scheduled,
      result: findBoxScoreForScheduledGame(state.boxScores, scheduled),
    };
  }
  const exactResult = (state.boxScores ?? []).find(row => getCanonicalGameIdentity({
    gid: row.gameId,
    date: row.date,
    season: row.season,
    competitionId: (row as any).competitionId,
  }) === target);
  const result = exactResult ?? (state.boxScores ?? []).find(row => matchesId(row.gameId));
  if (!result) {
    const tournament = state.internationalTournament;
    const tournamentResult = tournament?.boxScores.find(row => getCanonicalGameIdentity({
      gid: row.gameId,
      date: row.date,
      season: row.season ?? tournament.playedYear ?? tournament.year,
      competitionId: (row as any).competitionId ?? tournament.competitionId,
    }) === target || matchesId(row.gameId));
    if (!tournament || !tournamentResult) return undefined;
    const tournamentGame = tournament.games.find(game => game.gameId === tournamentResult.gameId);
    return {
      result: tournamentResult,
      game: {
        gid: tournamentResult.gameId,
        homeTid: tournamentResult.homeTeamId,
        awayTid: tournamentResult.awayTeamId,
        homeScore: tournamentResult.homeScore,
        awayScore: tournamentResult.awayScore,
        played: true,
        date: tournamentResult.date,
        season: tournamentResult.season ?? tournament.playedYear ?? tournament.year,
        isExhibition: true,
        excludeFromRecord: true,
        competitionId: tournament.competitionId,
        competitionPhase: tournamentGame?.phase,
      },
    };
  }
  return {
    result,
    game: {
      gid: result.gameId,
      homeTid: result.homeTeamId,
      awayTid: result.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      played: true,
      date: result.date,
      season: result.season,
      isPreseason: result.isPreseason,
      isAllStar: result.isAllStar,
      isAllStarChampionship: result.isAllStarChampionship,
      isRisingStars: result.isRisingStars,
      isRisingStarsChampionship: result.isRisingStarsChampionship,
      isCelebrityGame: result.isCelebrityGame,
      gameFormat: result.gameFormat,
      targetScore: result.targetScore,
    },
  };
}
