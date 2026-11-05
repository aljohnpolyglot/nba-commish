import type { GameState } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import {
  isDanceContestEnabled,
  isDunkContestEnabled,
  isShootingStarsEnabled,
  isSkillsChallengeEnabled,
  isThreePointContestEnabled,
} from './allStarEventAvailability';
import { getAllStarWeekendDates } from './allStarWeekendDates';

export function isAllStarSaturday(state: GameState): boolean {
  if (!state.allStar || state.leagueStats?.uiMode === 'euro_isolated') return false;
  const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);
  return normalizeDate(state.date) === normalizeDate(dates.saturday.toISOString());
}

export function areAllStarSaturdayEventsComplete(state: GameState): boolean {
  const allStar = state.allStar as any;
  if (!allStar) return false;

  const completionChecks = [
    isDunkContestEnabled(state.leagueStats) ? allStar.dunkContest?.complete === true : null,
    isThreePointContestEnabled(state.leagueStats) ? allStar.threePointContest?.complete === true : null,
    isShootingStarsEnabled(state.leagueStats) ? allStar.shootingStars?.complete === true : null,
    isSkillsChallengeEnabled(state.leagueStats) ? allStar.skillsChallenge?.complete === true : null,
    state.leagueStats.allStarHorse === true ? allStar.horseTournament?.complete === true : null,
    state.leagueStats.allStarThroneEnabled === true ? allStar.throne?.complete === true : null,
  ].filter((complete): complete is boolean => complete !== null);

  return completionChecks.length > 0 && completionChecks.every(Boolean);
}

export function shouldAdvanceAfterAllStarSaturday(state: GameState): boolean {
  return isAllStarSaturday(state) && areAllStarSaturdayEventsComplete(state);
}

export function shouldAdvanceAfterAllStarEventDay(state: GameState): boolean {
  if (!state.allStar?.gamesInjected || state.leagueStats?.uiMode === 'euro_isolated') return false;
  const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);
  const current = normalizeDate(state.date);
  if (current === normalizeDate(dates.saturday.toISOString())) {
    return areAllStarSaturdayEventsComplete(state);
  }

  const isFriday = current === normalizeDate(dates.risingStars.toISOString());
  const isSunday = current === normalizeDate(dates.allStarGame.toISOString());
  if (!isFriday && !isSunday) return false;
  if (isSunday && state.leagueStats.uiMode === 'pba_isolated' && (
    state.offseasonChecklist?.pbaImportSearch === 'pending'
    || state.offseasonChecklist?.pbaImportSearch === 'in-progress'
    || state.offseasonChecklist?.pbaImportDecision === 'pending'
    || state.offseasonChecklist?.pbaImportDecision === 'in-progress'
  )) return false;
  const games = (state.schedule ?? []).filter(game =>
    normalizeDate(game.date) === current && (
      (isFriday && (game.isRisingStars || game.isCelebrityGame)) ||
      (isSunday && game.isAllStar)
    )
  );
  if (games.length === 0 || games.some(game => !game.played)) return false;
  return !isSunday || !isDanceContestEnabled(state.leagueStats) || state.allStar.danceContest?.complete === true;
}
