import type { GameState } from '../types';
import { getSeasonSimStartDate, toISODateString } from './dateUtils';
import { normalizeDate } from './helpers';

type CommissionerSettingsWindowSource = Pick<GameState, 'date' | 'schedule' | 'offseasonChecklist' | 'leagueStats'>;

export function hasGeneratedRegularSeasonSchedule(schedule: GameState['schedule'] | undefined): boolean {
  return (schedule ?? []).some(g => !(g as any).isPreseason && !(g as any).isPlayoff && !(g as any).isPlayIn && !(g as any).isNBACup && !(g as any).isCupTBD);
}

export function getCommissionerSettingsWindow(state: CommissionerSettingsWindowSource) {
  const seasonYear = state.leagueStats?.year ?? new Date().getFullYear() + 1;
  const opensOnDate = getSeasonSimStartDate(seasonYear);
  const closesOnDate = new Date(Date.UTC(seasonYear - 1, 7, 14));
  const currentIso = normalizeDate(state.date ?? '');
  const opensOnIso = toISODateString(opensOnDate);
  const closesOnIso = toISODateString(closesOnDate);
  const offseasonActive = !!state.offseasonChecklist;
  const regularSeasonScheduleGenerated = hasGeneratedRegularSeasonSchedule(state.schedule);

  return {
    seasonYear,
    opensOnDate,
    closesOnDate,
    opensOnIso,
    closesOnIso,
    currentIso,
    offseasonActive,
    regularSeasonScheduleGenerated,
    isOpen: !offseasonActive && !regularSeasonScheduleGenerated && currentIso >= opensOnIso && currentIso < closesOnIso,
  };
}
