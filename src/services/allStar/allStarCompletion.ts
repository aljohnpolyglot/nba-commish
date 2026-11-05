import type { GameState } from '../../types';
import {
  isAllStarGameEnabled,
  isCelebrityGameEnabled,
  isDanceContestEnabled,
  isDunkContestEnabled,
  isRisingStarsEnabled,
  isShootingStarsEnabled,
  isSkillsChallengeEnabled,
  isThreePointContestEnabled,
} from './allStarEventAvailability';

export type AllStarWeekendCompletion = {
  scheduled: boolean;
  seasonMatches: boolean;
  voting: boolean;
  roster: boolean;
  risingStars: boolean;
  celebrity: boolean;
  dunk: boolean;
  threePoint: boolean;
  shootingStars: boolean;
  skills: boolean;
  horse: boolean;
  throne: boolean;
  dance: boolean;
  allStarGame: boolean;
  resultsComplete: boolean;
  markerComplete: boolean;
  complete: boolean;
  missing: string[];
};

const hasWinner = (value: unknown): boolean =>
  value !== undefined && value !== null && String(value).trim().length > 0;

const hasUsableBoxScore = (state: GameState, gameId: number | undefined): boolean => {
  if (gameId == null) return false;
  return (state.boxScores ?? []).some(result =>
    Number(result.gameId) === Number(gameId)
    && Number.isFinite(Number(result.homeScore))
    && Number.isFinite(Number(result.awayScore))
    && ((result.homeStats?.length ?? 0) > 0 || (result.awayStats?.length ?? 0) > 0));
};

const hasPlayedScheduleGame = (
  state: GameState,
  gameId: number | undefined,
  predicate: (game: GameState['schedule'][number]) => boolean,
): boolean => gameId != null && state.schedule.some(game =>
  Number(game.gid) === Number(gameId)
  && game.played === true
  && Number.isFinite(Number(game.homeScore))
  && Number.isFinite(Number(game.awayScore))
  && predicate(game));

const gameIsCanonical = (
  state: GameState,
  gameId: number | undefined,
  predicate: (game: GameState['schedule'][number]) => boolean,
): boolean => hasPlayedScheduleGame(state, gameId, predicate) && hasUsableBoxScore(state, gameId);

export function getAllStarWeekendCompletion(state: GameState): AllStarWeekendCompletion {
  const allStar = state.allStar as any;
  const scheduled = state.leagueStats?.uiMode !== 'euro_isolated'
    && isAllStarGameEnabled(state.leagueStats);
  if (!scheduled) {
    return {
      scheduled: false,
      seasonMatches: true,
      voting: true,
      roster: true,
      risingStars: true,
      celebrity: true,
      dunk: true,
      threePoint: true,
      shootingStars: true,
      skills: true,
      horse: true,
      throne: true,
      dance: true,
      allStarGame: true,
      resultsComplete: true,
      markerComplete: true,
      complete: true,
      missing: [],
    };
  }

  const seasonMatches = Number(allStar?.season) === Number(state.leagueStats.year);
  const voting = !!allStar?.startersAnnounced;
  const roster = !!allStar?.reservesAnnounced && (allStar?.roster?.length ?? 0) > 0;

  const risingFinal = allStar?.risingStarsBracket?.games?.find((game: any) => game.round === 'final' && game.played)
    ?? allStar?.risingStarsBracket?.games?.find((game: any) => game.played);
  const risingGameId = risingFinal?.gid ?? allStar?.risingStarsGameId;
  const risingStars = !isRisingStarsEnabled(state.leagueStats) || (
    (allStar?.risingStarsBracket?.complete === true || risingGameId != null)
    && gameIsCanonical(state, risingGameId, game => game.isRisingStars === true)
  );

  const celebrityGameId = allStar?.celebrityGameId ?? allStar?.celebrityGameResult?.gameId;
  const celebrity = !isCelebrityGameEnabled(state.leagueStats) || (
    !!allStar?.celebrityGameResult
    && gameIsCanonical(state, celebrityGameId, game => game.isCelebrityGame === true)
  );
  const dunk = !isDunkContestEnabled(state.leagueStats) || (
    allStar?.dunkContest?.complete === true && hasWinner(allStar?.dunkContest?.winnerId)
  );
  const threePoint = !isThreePointContestEnabled(state.leagueStats) || (
    allStar?.threePointContest?.complete === true && hasWinner(allStar?.threePointContest?.winnerId)
  );
  const shootingStars = !isShootingStarsEnabled(state.leagueStats) || (
    allStar?.shootingStars?.complete === true && hasWinner(allStar?.shootingStars?.winnerTeamId)
  );
  const skills = !isSkillsChallengeEnabled(state.leagueStats) || (
    allStar?.skillsChallenge?.complete === true && hasWinner(allStar?.skillsChallenge?.winnerId)
  );
  const horse = state.leagueStats.allStarHorse !== true || (
    allStar?.horseTournament?.complete === true && hasWinner(allStar?.horseTournament?.winnerId)
  );
  const throne = state.leagueStats.allStarThroneEnabled !== true || allStar?.throne?.complete === true;
  const dance = !isDanceContestEnabled(state.leagueStats) || allStar?.danceContest?.complete === true;

  const allStarFinal = allStar?.bracket?.games?.find((game: any) => game.round === 'final' && game.played)
    ?? allStar?.bracket?.games?.find((game: any) => game.played);
  const allStarGameId = allStarFinal?.gid ?? allStar?.allStarGameId;
  const allStarGame = !isAllStarGameEnabled(state.leagueStats) || (
    allStar?.bracket?.complete === true
    && gameIsCanonical(state, allStarGameId, game => game.isAllStar === true)
  );

  const checks: Array<[keyof AllStarWeekendCompletion, boolean]> = [
    ['seasonMatches', seasonMatches],
    ['voting', voting],
    ['roster', roster],
    ['risingStars', risingStars],
    ['celebrity', celebrity],
    ['dunk', dunk],
    ['threePoint', threePoint],
    ['shootingStars', shootingStars],
    ['skills', skills],
    ['horse', horse],
    ['throne', throne],
    ['dance', dance],
    ['allStarGame', allStarGame],
  ];
  const missing = checks.filter(([, complete]) => !complete).map(([key]) => String(key));
  const resultsComplete = missing.length === 0;
  const markerComplete = allStar?.weekendComplete === true;
  return {
    scheduled,
    seasonMatches,
    voting,
    roster,
    risingStars,
    celebrity,
    dunk,
    threePoint,
    shootingStars,
    skills,
    horse,
    throne,
    dance,
    allStarGame,
    resultsComplete,
    markerComplete,
    complete: resultsComplete && markerComplete,
    missing,
  };
}
