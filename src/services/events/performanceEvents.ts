import type { Game, LeagueStats } from '../../types';
import { addGameDays, toISODateString } from '../../utils/dateUtils';
import { getAllStarWeekendDates } from '../allStar/allStarWeekendDates';
import { getLeagueCalendarDates } from '../leagueCalendar';

export const PERFORMANCE_EVENT_NAMES = {
  allStarHalftime: 'NBA All-Star Halftime',
  allStarSaturday: 'All-Star Saturday Night Performance',
  finals: 'NBA Finals Featured Performance',
} as const;

export interface PerformanceEventNames {
  allStarHalftime: string;
  allStarSaturday: string;
  finals: string;
}

export function getPerformanceEventNames(uiMode?: string | null): PerformanceEventNames {
  if (uiMode !== 'pba_isolated') return PERFORMANCE_EVENT_NAMES;
  return {
    allStarHalftime: 'PBA All-Star Halftime',
    allStarSaturday: 'PBA All-Star Saturday Night Performance',
    finals: 'PBA Finals Featured Performance',
  };
}

export function isAllStarHalftimePerformance(event?: string): boolean {
  const label = String(event ?? '').toLowerCase();
  return label.includes('all-star') && label.includes('halftime');
}

export function isAllStarSaturdayPerformance(event?: string): boolean {
  const label = String(event ?? '').toLowerCase();
  return label.includes('all-star') && label.includes('saturday');
}

export function isFinalsPerformance(event?: string): boolean {
  return String(event ?? '').toLowerCase().includes('finals');
}

export function getPerformanceEventDate(
  event: string,
  seasonYear: number,
  leagueStats?: Pick<LeagueStats, 'uiMode' | 'leagueCalendar'> & {
    pbaAllStarWeekendStart?: string;
  },
  schedule: Game[] = [],
): string {
  const calendar = getLeagueCalendarDates(seasonYear, leagueStats);
  if (event === 'Championship Ring Ceremony') return toISODateString(calendar.regularSeasonStart);
  if (isFinalsPerformance(event)) {
    const finalsGame = schedule
      .filter(game => game.isPlayoff && String(game.playoffSeriesId ?? '').toLowerCase().includes('final'))
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())[0];
    if (finalsGame?.date) return toISODateString(new Date(finalsGame.date));
    const projected = addGameDays(calendar.playoffStart, 42);
    const finalEligibleDay = addGameDays(calendar.rollover, -1);
    return toISODateString(projected <= finalEligibleDay ? projected : finalEligibleDay);
  }
  const allStarDates = getAllStarWeekendDates(seasonYear, leagueStats);
  return toISODateString(
    isAllStarSaturdayPerformance(event) ? allStarDates.saturday : allStarDates.allStarGame,
  );
}
