import type { GameState } from '../types';

type CommissionerSettingsWindowSource = Pick<GameState, 'leagueStats' | 'gameMode' | 'commissionerTasks'>;

export function hasGeneratedRegularSeasonSchedule(schedule: GameState['schedule'] | undefined): boolean {
  return (schedule ?? []).some(g => !g.played && !(g as any).isPreseason && !(g as any).isPlayoff && !(g as any).isPlayIn && !(g as any).isNBACup && !(g as any).isCupTBD);
}

export function getCommissionerSettingsWindow(state: CommissionerSettingsWindowSource) {
  const seasonYear = state.leagueStats?.year ?? new Date().getFullYear() + 1;
  const isCommissioner = state.gameMode === 'commissioner';
  const activeReview = Object.values(state.commissionerTasks?.records ?? {})
    .find(record => record.taskId === 'league_settings_review' && record.status === 'in_progress');

  return {
    seasonYear,
    isCommissioner,
    activeReview,
    isOpen: isCommissioner && activeReview != null,
  };
}
