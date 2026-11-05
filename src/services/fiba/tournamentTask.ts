import type { GameState } from '../../types';
import { parseGameDate } from '../../utils/dateUtils';
import { getPlayableInternationalWindowForSeason } from './tournamentWindows';
import { simulateRemainingInternationalTournament } from './playTournament';
import { applyInternationalTournamentPlayerAwards } from './applyTournamentPlayerAwards';
import { markInternationalTournamentReviewed } from './reviewTournament';
import { publishInternationalTournamentCoverage } from '../news/nativeLeagueAnnouncements';

export function isInternationalTournamentSave(state: GameState): boolean {
  if (state.leagueType !== 'modded' || state.leagueStats?.uiMode === 'pba_isolated') return false;
  return (state.moddedLeagueBase ?? 'nba') === 'nba'
    || state.leagueStats?.uiMode === 'euro_isolated';
}

export function getInternationalBranchYear(state: GameState, fallbackYear: number): number {
  if (state.leagueStats?.uiMode === 'euro_isolated') {
    return Number(state.euroStartSeason ?? state.leagueStats?.historicalEraStartYear ?? fallbackYear);
  }
  return Number(state.nbaStartYear ?? fallbackYear);
}

export function getInternationalTournamentTaskWindow(state: GameState) {
  if (!state.date || !isInternationalTournamentSave(state)) return undefined;
  const calendarYear = parseGameDate(state.date).getUTCFullYear();
  if (
    state.nbaGmStartMode === 'fixed_preseason'
    && state.leagueStats?.uiMode !== 'euro_isolated'
    && Number(state.nbaStartYear) === calendarYear
  ) return undefined;
  return getPlayableInternationalWindowForSeason(calendarYear, calendarYear);
}

export function completeInternationalTournamentTask(
  state: GameState,
  options: { simulateRemaining?: boolean } = {},
): GameState {
  const current = state.internationalTournament;
  if (!current || current.readOnly) {
    return {
      ...state,
      lastOutcome: 'The active tournament could not be opened for this task.',
    };
  }
  const completed = options.simulateRemaining && !['complete', 'reviewed'].includes(current.status)
    ? simulateRemainingInternationalTournament(current, state.players, state.stats.playerApproval)
    : current;
  const unresolved = completed.games.some(game => !game.played);
  if (unresolved || !completed.result || !['complete', 'reviewed'].includes(completed.status)) {
    return {
      ...state,
      internationalTournament: completed,
      offseasonChecklist: state.offseasonChecklist
        ? { ...state.offseasonChecklist, internationalTournament: 'in-progress' }
        : state.offseasonChecklist,
      lastOutcome: 'Complete the active tournament before moving to the next task.',
    };
  }
  const reviewed = markInternationalTournamentReviewed(completed);
  if (!reviewed.reviewed || reviewed.status !== 'reviewed') return state;
  const updated: GameState = {
    ...state,
    players: applyInternationalTournamentPlayerAwards(state.players, reviewed),
    internationalTournament: reviewed,
    internationalTournamentHistory: [
      ...(state.internationalTournamentHistory ?? []).filter(entry => entry.id !== reviewed.id),
      reviewed,
    ],
    internationalTournamentTaskSkippedYear: undefined,
    offseasonChecklist: state.offseasonChecklist
      ? { ...state.offseasonChecklist, internationalTournament: 'done' }
      : state.offseasonChecklist,
    lastOutcome: 'The international tournament is complete.',
  };
  return { ...updated, ...publishInternationalTournamentCoverage(updated, reviewed) };
}
