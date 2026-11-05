import type { LazySimProgress } from '../../types';

export const LEAGUE_STARTUP_TOTAL_STEPS = 34;
export const LEAGUE_STARTUP_MILESTONES = [
  2, 8, 14, 22, 31, 40, 43, 46, 48,
  49, 50, 51, 52, 53, 54, 55, 56,
  57, 61, 64, 66, 68, 70, 72, 76, 82,
  88, 91, 93, 94, 95, 96, 97, 98, 99,
] as const;

export const getLeagueStartupEstimatedCeiling = (reportedPct: number): number => {
  if (reportedPct >= 99) return 99;
  const nextMilestone = LEAGUE_STARTUP_MILESTONES.find(milestone => milestone > reportedPct);
  return Math.min(98, (nextMilestone ?? 99) - 1);
};

export type LeagueStartupProgressReporter = (
  currentPhase: string,
  percentComplete: number,
  stepsComplete: number,
) => Promise<void>;

export function createLeagueStartupProgressReporter(
  onProgress: ((progress: LazySimProgress) => void) | undefined,
  startDate?: string,
): LeagueStartupProgressReporter {
  return async (currentPhase, percentComplete, stepsComplete) => {
    if (!onProgress) return;
    const date = startDate ?? '';
    onProgress({
      kind: 'league-start',
      currentDate: date,
      targetDate: date,
      daysComplete: stepsComplete,
      daysTotal: LEAGUE_STARTUP_TOTAL_STEPS,
      currentPhase,
      percentComplete: Math.max(0, Math.min(99, Math.round(percentComplete))),
    });
    await new Promise<void>(resolve => {
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => resolve());
        return;
      }
      globalThis.setTimeout(resolve, 0);
    });
  };
}
