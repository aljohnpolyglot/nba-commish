import type { NbaGmStartMode } from '../../types';
import type { LeagueStats } from '../../types';
import { getLeagueCalendarDates } from '../leagueCalendar';
import { TimeService } from '../time/TimeService';

export type CanonicalSeasonStartMode =
  | 'full_offseason'
  | 'draft_order'
  | 'free_agency'
  | 'preseason'
  | 'opening_rosters'
  | 'opening_day';

export interface SeasonStartModePolicy {
  mode: CanonicalSeasonStartMode;
  priorOffseasonResolved: boolean;
  priorPreseasonResolved: boolean;
  suppressOpeningOffseasonRail: boolean;
  employmentSeasonOffset: 0 | 1;
  firstActionDate?: string;
}

const POLICIES: Record<CanonicalSeasonStartMode, SeasonStartModePolicy> = {
  full_offseason: {
    mode: 'full_offseason',
    priorOffseasonResolved: false,
    priorPreseasonResolved: false,
    suppressOpeningOffseasonRail: false,
    employmentSeasonOffset: 1,
  },
  draft_order: {
    mode: 'draft_order',
    priorOffseasonResolved: false,
    priorPreseasonResolved: false,
    suppressOpeningOffseasonRail: false,
    employmentSeasonOffset: 1,
  },
  free_agency: {
    mode: 'free_agency',
    priorOffseasonResolved: false,
    priorPreseasonResolved: false,
    suppressOpeningOffseasonRail: false,
    employmentSeasonOffset: 1,
  },
  preseason: {
    mode: 'preseason',
    priorOffseasonResolved: true,
    priorPreseasonResolved: false,
    suppressOpeningOffseasonRail: false,
    employmentSeasonOffset: 0,
  },
  opening_rosters: {
    mode: 'opening_rosters',
    priorOffseasonResolved: true,
    priorPreseasonResolved: true,
    suppressOpeningOffseasonRail: true,
    employmentSeasonOffset: 0,
  },
  opening_day: {
    mode: 'opening_day',
    priorOffseasonResolved: true,
    priorPreseasonResolved: true,
    suppressOpeningOffseasonRail: true,
    employmentSeasonOffset: 0,
  },
};

export function resolveSeasonStartMode(mode: NbaGmStartMode | string | undefined): CanonicalSeasonStartMode {
  if (mode === 'fixed_preseason' || mode === 'international' || mode == null) return 'opening_rosters';
  if (mode in POLICIES) return mode as CanonicalSeasonStartMode;
  return 'opening_rosters';
}

export function getSeasonStartModePolicy(mode: NbaGmStartMode | string | undefined): SeasonStartModePolicy {
  return POLICIES[resolveSeasonStartMode(mode)];
}

export function resolveFirstActionDate(
  season: number,
  stats: LeagueStats,
  mode: NbaGmStartMode | string | undefined,
): string {
  const canonical = resolveSeasonStartMode(mode);
  const calendar = getLeagueCalendarDates(season, stats);
  const date = canonical === 'opening_day'
    ? calendar.regularSeasonStart
    : canonical === 'preseason' || canonical === 'opening_rosters'
      ? calendar.preseasonStart ?? calendar.trainingCampStart ?? calendar.regularSeasonStart
      : canonical === 'free_agency'
        ? calendar.freeAgencyStart ?? calendar.rollover
        : canonical === 'draft_order'
          ? calendar.draftDate ?? calendar.rollover
          : calendar.rollover;
  return TimeService.normalize(date);
}

export function buildPersistedStartModePolicy(
  season: number,
  stats: LeagueStats,
  mode: NbaGmStartMode | string | undefined,
): SeasonStartModePolicy {
  const base = getSeasonStartModePolicy(mode);
  return { ...base, firstActionDate: resolveFirstActionDate(season, stats, mode) };
}
