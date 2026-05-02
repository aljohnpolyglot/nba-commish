import { normalizeDate } from '../../utils/helpers';
import { SettingsManager } from '../../services/SettingsManager';
import type { GameState, UserAction } from '../../types';

export function isSimulationTickAction(action: UserAction): boolean {
  return action.type === 'ADVANCE_DAY' || action.type === 'SIMULATE_TO_DATE';
}

export function isInstantTransactionAction(action: UserAction): boolean {
  // Pure roster/contract actions — clicking these in a modal should never burn
  // a calendar day. Sim time only advances through ADVANCE_DAY/SIMULATE_TO_DATE
  // (handled by isSimulationTickAction) or via the user's explicit
  // advanceDayOnTransaction toggle, which intentionally bypasses this list.
  return (
    action.type === 'EXECUTIVE_TRADE' ||
    action.type === 'FORCE_TRADE' ||
    action.type === 'SIGN_FREE_AGENT' ||
    action.type === 'EXERCISE_TEAM_OPTION' ||
    action.type === 'DECLINE_TEAM_OPTION' ||
    action.type === 'WAIVE_PLAYER' ||
    action.type === 'CONVERT_CONTRACT_TYPE' ||
    action.type === 'SUBMIT_FA_BID' ||
    action.type === 'MATCH_RFA_OFFER' ||
    action.type === 'DECLINE_RFA_OFFER'
  );
}

export function shouldFireCalendarEvents(action: UserAction): boolean {
  return isSimulationTickAction(action);
}

export function getSimulationDayCount(state: GameState, action: UserAction): number {
  if (isInstantTransactionAction(action)) return 0;
  if (!isSimulationTickAction(action) && !SettingsManager.getSettings().advanceDayOnTransaction) return 0;
  if (action.type !== 'SIMULATE_TO_DATE') return 1;

  const targetDateNorm = normalizeDate(action.payload.targetDate);
  const currentDateNorm = normalizeDate(state.date);
  const targetDate = new Date(`${targetDateNorm}T00:00:00Z`);
  const currentDate = new Date(`${currentDateNorm}T00:00:00Z`);
  const diffDays = Math.round((targetDate.getTime() - currentDate.getTime()) / 86400000);
  const stopBefore = action.payload?.stopBefore === true;

  return stopBefore ? Math.max(0, diffDays) : Math.max(1, diffDays + 1);
}
