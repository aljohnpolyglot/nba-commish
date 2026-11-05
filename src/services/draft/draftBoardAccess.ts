import type { GameState } from '../../types';
import { getDraftDate, getRolloverDate, isDraftBlockedByUnresolvedPlayoffs, toISODateString } from '../../utils/dateUtils';
import { normalizeDate } from '../../utils/helpers';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { getDraftSeasonYearForState } from '../offseason/offseasonState';
import { isCurrentDraftClassComplete } from './DraftPickGenerator';

export function shouldShowLiveDraftBoard(state: GameState): boolean {
  const leagueStats = state.leagueStats;
  const season = getDraftSeasonYearForState(state);
  const today = normalizeDate(state.date);
  const draftDate = toISODateString(getDraftDate(season, leagueStats));
  const rolloverDate = toISODateString(getRolloverDate(season, leagueStats, state.schedule));
  const draftComplete = isCurrentDraftClassComplete(state);

  if (isPbaIsolatedMode(state)) {
    return !draftComplete
      && state.offseasonChecklist?.pbaDraft === 'in-progress'
      && leagueStats.pbaConferencePhase === 'offseason'
      && today >= draftDate;
  }

  return today >= draftDate
    && today <= rolloverDate
    && !draftComplete
    && !isDraftBlockedByUnresolvedPlayoffs(state);
}
