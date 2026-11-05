import type { GameState } from '../../types';
import { applySeasonRollover } from '../logic/seasonRollover';
import { initialEuroOffseasonChecklist } from '../offseason/offseasonChecklistState';
import {
  buildCompletedEuroSeasonReviewPatch,
  getCompletedEuroSeasonYear,
  getCompletedManagedEuroSeasonResolutions,
  shouldPrepareCompletedEuroSeasonRollover,
} from './euroSeasonReview';

export function prepareCompletedEuroSeasonRollover(state: GameState): GameState | null {
  const resolutions = getCompletedManagedEuroSeasonResolutions(state);
  if (!resolutions || !shouldPrepareCompletedEuroSeasonRollover(state, resolutions)) return null;
  const completedSeason = getCompletedEuroSeasonYear(resolutions);
  if (completedSeason == null) return null;
  const reviewPatch = buildCompletedEuroSeasonReviewPatch(state);
  const prepared = reviewPatch
    ? { ...state, competitionHistory: reviewPatch.competitionHistory }
    : state;
  const rollover = applySeasonRollover(prepared, { owner: 'euro-season-review' });
  return {
    ...prepared,
    ...rollover,
    leagueStats: {
      ...(rollover.leagueStats ?? prepared.leagueStats),
      euroRolloverPreparedSeason: completedSeason,
    },
    offseasonChecklist: initialEuroOffseasonChecklist(true),
    euroScheduleReleaseDate: undefined,
  };
}
