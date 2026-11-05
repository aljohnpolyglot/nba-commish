import type { LeagueCalendar, LeagueCalendarBreak, LeagueCalendarDate, LeagueStats } from '../types';

export const DEFAULT_LEAGUE_CALENDAR: LeagueCalendar = {
  scheduleRelease: { month: 8, day: 14, yearOffset: -1 },
  draftDate: { month: 6, day: 25, yearOffset: 0 },
  freeAgencyStart: { month: 7, day: 1, yearOffset: 0 },
  nonGuaranteedGuaranteeDate: { month: 1, day: 10, yearOffset: 0 },
  playoffEligibilityDeadline: { month: 3, day: 1, yearOffset: 0 },
  draftBeforeFreeAgency: true,
  trainingCampStart: { month: 9, day: 29, yearOffset: -1 },
  preseasonStart: { month: 10, day: 1, yearOffset: -1 },
  preseasonEnd: { month: 10, day: 15, yearOffset: -1 },
  regularSeasonStart: { month: 10, day: 24, yearOffset: -1 },
  cupStart: { month: 11, day: 4, yearOffset: -1 },
  cupFinal: { month: 12, day: 16, yearOffset: -1 },
  regularSeasonEnd: { month: 4, day: 12, yearOffset: 0 },
  playInStart: { month: 4, day: 15, yearOffset: 0 },
  playoffStart: { month: 4, day: 20, yearOffset: 0 },
  rollover: { month: 7, day: 1, yearOffset: 0 },
  summerLeagueStart: { month: 7, day: 15, yearOffset: 0 },
  summerLeagueEnd: { month: 7, day: 21, yearOffset: 0 },
  rolloverGraceDays: 7,
  preseasonGamesPerTeam: 4,
  minimumRestDaysBetweenGames: 0,
  eventBufferDays: 2,
};

export const WNBA_LEAGUE_CALENDAR: LeagueCalendar = {
  scheduleRelease: { month: 3, day: 4, yearOffset: 0 },
  freeAgencyStart: { month: 2, day: 1, yearOffset: 0 },
  draftDate: { month: 4, day: 13, yearOffset: 0 },
  nonGuaranteedGuaranteeDate: null,
  playoffEligibilityDeadline: null,
  draftBeforeFreeAgency: false,
  trainingCampStart: { month: 4, day: 19, yearOffset: 0 },
  preseasonStart: { month: 4, day: 24, yearOffset: 0 },
  preseasonEnd: { month: 5, day: 3, yearOffset: 0 },
  regularSeasonStart: { month: 5, day: 8, yearOffset: 0 },
  cupStart: { month: 6, day: 1, yearOffset: 0 },
  cupFinal: { month: 6, day: 30, yearOffset: 0 },
  allStarStart: { month: 7, day: 23, yearOffset: 0 },
  allStarGame: { month: 7, day: 25, yearOffset: 0 },
  allStarEnd: { month: 7, day: 27, yearOffset: 0 },
  seasonBreaks: [{
    id: 'fiba-world-cup',
    name: 'FIBA World Cup Break',
    start: { month: 8, day: 31, yearOffset: 0 },
    end: { month: 9, day: 16, yearOffset: 0 },
    seasonYears: [2026],
  }],
  regularSeasonEnd: { month: 9, day: 24, yearOffset: 0 },
  playInStart: { month: 9, day: 27, yearOffset: 0 },
  playoffStart: { month: 9, day: 27, yearOffset: 0 },
  rollover: { month: 12, day: 1, yearOffset: 0 },
  rolloverGraceDays: 7,
  preseasonGamesPerTeam: 2,
  minimumRestDaysBetweenGames: 1,
  eventBufferDays: 2,
};

const validDate = (value: LeagueCalendarDate | undefined, fallback: LeagueCalendarDate): LeagueCalendarDate => {
  if (!value) return fallback;
  const month = Math.min(12, Math.max(1, Math.round(Number(value.month))));
  const day = Math.min(31, Math.max(1, Math.round(Number(value.day))));
  const yearOffset = Math.min(1, Math.max(-1, Math.round(Number(value.yearOffset))));
  return { month, day, yearOffset };
};

const normalizeBreak = (value: LeagueCalendarBreak): LeagueCalendarBreak => ({
  id: String(value.id || 'league-break'),
  name: String(value.name || 'League Break'),
  start: validDate(value.start, value.start),
  end: validDate(value.end, value.end),
  seasonYears: Array.isArray(value.seasonYears)
    ? [...new Set(value.seasonYears.map(Number).filter(Number.isFinite).map(Math.round))].sort((left, right) => left - right)
    : undefined,
});

const breakAppliesToSeason = (leagueBreak: LeagueCalendarBreak, season: number) =>
  !leagueBreak.seasonYears?.length || leagueBreak.seasonYears.includes(season);

export function normalizeLeagueCalendar(
  value?: LeagueCalendar,
  fallback: LeagueCalendar = DEFAULT_LEAGUE_CALENDAR,
): LeagueCalendar {
  const source = { ...fallback, ...value };
  const matchesDate = (left: LeagueCalendarDate | undefined, right: LeagueCalendarDate | undefined) =>
    !!left && !!right && left.month === right.month && left.day === right.day && left.yearOffset === right.yearOffset;
  const usesFallbackPlayingWindow = !value
    || matchesDate(value.regularSeasonStart, fallback.regularSeasonStart)
      && matchesDate(value.regularSeasonEnd, fallback.regularSeasonEnd);
  const nonGuaranteedGuaranteeDate = value && Object.prototype.hasOwnProperty.call(value, 'nonGuaranteedGuaranteeDate')
    ? value.nonGuaranteedGuaranteeDate
    : usesFallbackPlayingWindow ? fallback.nonGuaranteedGuaranteeDate : null;
  const playoffEligibilityDeadline = value && Object.prototype.hasOwnProperty.call(value, 'playoffEligibilityDeadline')
    ? value.playoffEligibilityDeadline
    : usesFallbackPlayingWindow ? fallback.playoffEligibilityDeadline : null;
  return {
    scheduleRelease: value?.scheduleRelease
      ? validDate(value.scheduleRelease, fallback.scheduleRelease ?? fallback.regularSeasonStart)
      : value
        ? undefined
        : fallback.scheduleRelease,
    freeAgencyStart: source.freeAgencyStart ? validDate(source.freeAgencyStart, fallback.freeAgencyStart!) : undefined,
    draftDate: source.draftDate ? validDate(source.draftDate, fallback.draftDate!) : undefined,
    nonGuaranteedGuaranteeDate: nonGuaranteedGuaranteeDate
      ? validDate(nonGuaranteedGuaranteeDate, fallback.nonGuaranteedGuaranteeDate ?? fallback.regularSeasonStart)
      : null,
    playoffEligibilityDeadline: playoffEligibilityDeadline
      ? validDate(playoffEligibilityDeadline, fallback.playoffEligibilityDeadline ?? fallback.regularSeasonEnd)
      : null,
    draftBeforeFreeAgency: source.draftBeforeFreeAgency ?? true,
    trainingCampStart: source.trainingCampStart
      ? validDate(source.trainingCampStart, fallback.trainingCampStart ?? fallback.preseasonStart!)
      : fallback.trainingCampStart,
    preseasonStart: source.preseasonStart ? validDate(source.preseasonStart, fallback.preseasonStart!) : undefined,
    preseasonEnd: source.preseasonEnd ? validDate(source.preseasonEnd, fallback.preseasonEnd!) : undefined,
    regularSeasonStart: validDate(source.regularSeasonStart, fallback.regularSeasonStart),
    cupStart: source.cupStart ? validDate(source.cupStart, fallback.cupStart ?? fallback.regularSeasonStart) : undefined,
    cupFinal: source.cupFinal ? validDate(source.cupFinal, fallback.cupFinal ?? fallback.regularSeasonEnd) : undefined,
    allStarStart: source.allStarStart ? validDate(source.allStarStart, fallback.allStarStart ?? fallback.regularSeasonStart) : undefined,
    allStarGame: source.allStarGame ? validDate(source.allStarGame, fallback.allStarGame ?? source.allStarStart ?? fallback.regularSeasonStart) : undefined,
    allStarEnd: source.allStarEnd ? validDate(source.allStarEnd, fallback.allStarEnd ?? fallback.regularSeasonEnd) : undefined,
    summerLeagueStart: source.summerLeagueStart ? validDate(source.summerLeagueStart, fallback.summerLeagueStart ?? fallback.rollover) : undefined,
    summerLeagueEnd: source.summerLeagueEnd ? validDate(source.summerLeagueEnd, fallback.summerLeagueEnd ?? source.summerLeagueStart ?? fallback.rollover) : undefined,
    seasonBreaks: (source.seasonBreaks ?? []).map(normalizeBreak),
    regularSeasonEnd: validDate(source.regularSeasonEnd, fallback.regularSeasonEnd),
    playInStart: validDate(source.playInStart, fallback.playInStart),
    playoffStart: validDate(source.playoffStart, fallback.playoffStart),
    rollover: validDate(source.rollover, fallback.rollover),
    rolloverGraceDays: Math.min(30, Math.max(0, Math.round(Number(source.rolloverGraceDays ?? 7)))),
    preseasonGamesPerTeam: Math.max(0, Math.round(Number(source.preseasonGamesPerTeam ?? 0))),
    minimumRestDaysBetweenGames: Math.min(7, Math.max(0, Math.round(Number(source.minimumRestDaysBetweenGames ?? 0)))),
    eventBufferDays: Math.min(14, Math.max(0, Math.round(Number(source.eventBufferDays ?? 2)))),
  };
}

export interface LeagueCalendarValidation {
  valid: boolean;
  errors: string[];
  regularSeasonWindowDays: number;
  requiredWindowDays: number;
  maximumGamesPerTeam: number;
}

const inclusiveDays = (start: Date, end: Date): number => Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

export function validateLeagueCalendar(
  value: LeagueCalendar,
  season: number,
  gamesPerSeason: number,
  options: { allStarEnabled?: boolean; cupEnabled?: boolean; playInEnabled?: boolean; summerLeagueEnabled?: boolean } = {},
): LeagueCalendarValidation {
  const calendar = normalizeLeagueCalendar(value);
  const date = (entry: LeagueCalendarDate | null | undefined) => entry ? leagueCalendarDate(season, entry) : undefined;
  const preseasonStart = date(calendar.preseasonStart);
  const preseasonEnd = date(calendar.preseasonEnd);
  const trainingCampStart = date(calendar.trainingCampStart);
  const scheduleRelease = date(calendar.scheduleRelease);
  const regularStart = date(calendar.regularSeasonStart)!;
  const regularEnd = date(calendar.regularSeasonEnd)!;
  const playInStart = date(calendar.playInStart)!;
  const playoffStart = date(calendar.playoffStart)!;
  const rollover = date(calendar.rollover)!;
  const errors: string[] = [];
  const shiftDays = (value: Date, days: number) => new Date(value.getTime() + days * 86_400_000);
  const februaryFirst = new Date(Date.UTC(season, 1, 1));
  const fallbackAllStarGame = shiftDays(februaryFirst, ((7 - februaryFirst.getUTCDay()) % 7) + 14);
  const allStarGame = date(calendar.allStarGame) ?? fallbackAllStarGame;
  const allStarStart = date(calendar.allStarStart) ?? shiftDays(allStarGame, -3);
  const allStarEnd = date(calendar.allStarEnd) ?? shiftDays(allStarGame, 1);
  const requireRealDate = (entry: LeagueCalendarDate | null | undefined, label: string) => {
    if (!entry) return;
    const resolved = leagueCalendarDate(season, entry);
    if (
      resolved.getUTCFullYear() !== season + entry.yearOffset
      || resolved.getUTCMonth() + 1 !== entry.month
      || resolved.getUTCDate() !== entry.day
    ) errors.push(`${label} must be a real calendar date.`);
  };
  for (const [entry, label] of [
    [calendar.scheduleRelease, 'Schedule release'],
    [calendar.freeAgencyStart, 'Free agency'],
    [calendar.draftDate, 'Draft'],
    [calendar.nonGuaranteedGuaranteeDate, 'Non-guaranteed guarantee deadline'],
    [calendar.playoffEligibilityDeadline, 'Playoff eligibility deadline'],
    [calendar.trainingCampStart, 'Training camp'],
    [calendar.preseasonStart, 'Preseason start'],
    [calendar.preseasonEnd, 'Preseason end'],
    [calendar.regularSeasonStart, 'Regular season start'],
    [calendar.cupStart, 'Cup start'],
    [calendar.cupFinal, 'Cup final'],
    [calendar.allStarStart, 'All-Star break start'],
    [calendar.allStarGame, 'All-Star Game'],
    [calendar.allStarEnd, 'All-Star break end'],
    [calendar.summerLeagueStart, 'Summer League start'],
    [calendar.summerLeagueEnd, 'Summer League end'],
    [calendar.regularSeasonEnd, 'Regular season end'],
    [calendar.playInStart, 'Play-In start'],
    [calendar.playoffStart, 'Playoff start'],
    [calendar.rollover, 'Next season start'],
  ] as const) requireRealDate(entry, label);
  for (const leagueBreak of calendar.seasonBreaks ?? []) {
    requireRealDate(leagueBreak.start, `${leagueBreak.name} start`);
    requireRealDate(leagueBreak.end, `${leagueBreak.name} end`);
  }
  const priorRollover = leagueCalendarDate(season - 1, calendar.rollover);
  const firstTeamActivity = trainingCampStart ?? preseasonStart ?? regularStart;
  if (scheduleRelease && scheduleRelease < priorRollover) errors.push('Schedule release must follow the prior season transition.');
  if (scheduleRelease && scheduleRelease >= firstTeamActivity) errors.push('Schedule release must occur before team activities begin.');
  if (trainingCampStart && preseasonStart && trainingCampStart > preseasonStart) errors.push('Training camp must open no later than preseason.');
  if (preseasonStart && preseasonEnd && preseasonStart > preseasonEnd) errors.push('Preseason must end after it starts.');
  if (preseasonEnd && preseasonEnd >= regularStart) errors.push('Preseason must finish before the regular season.');
  if (regularStart >= regularEnd) errors.push('Regular season end must follow opening day.');
  const postseasonGate = options.playInEnabled ? playInStart : playoffStart;
  if (regularEnd >= postseasonGate) errors.push('The postseason must start after the regular season.');
  if (options.playInEnabled && playInStart >= playoffStart) errors.push('The Play-In must finish before the playoffs begin.');
  if (playoffStart >= rollover) errors.push('The next season must begin after the playoffs.');

  const withinRegularSeason = (start: Date | undefined, end: Date | undefined, label: string) => {
    if (!start || !end) return;
    if (start > end) errors.push(`${label} must end after it starts.`);
    if (start < regularStart || end > regularEnd) errors.push(`${label} must fit inside the regular season window.`);
  };
  if (options.cupEnabled) {
    if (!calendar.cupStart || !calendar.cupFinal) errors.push('Cup needs a start and final date.');
    else withinRegularSeason(date(calendar.cupStart), date(calendar.cupFinal), 'Cup window');
  }
  if (options.allStarEnabled) withinRegularSeason(allStarStart, allStarEnd, 'All-Star break');
  if (options.allStarEnabled) {
    if (allStarGame < allStarStart || allStarGame > allStarEnd) {
      errors.push('The All-Star Game must fit inside the All-Star break.');
    }
  }

  const draftDate = date(calendar.draftDate);
  const freeAgencyDate = date(calendar.freeAgencyStart);
  const activeSeasonStart = trainingCampStart ?? preseasonStart ?? regularStart;
  for (const [eventDate, label] of [[draftDate, 'Draft'], [freeAgencyDate, 'Free agency']] as const) {
    if (eventDate && eventDate >= activeSeasonStart && eventDate <= regularEnd) {
      errors.push(`${label} must be scheduled outside the playing season.`);
    }
  }
  if (draftDate && freeAgencyDate) {
    const bothBeforeSeason = draftDate < activeSeasonStart && freeAgencyDate < activeSeasonStart;
    const bothAfterSeason = draftDate > regularEnd && freeAgencyDate > regularEnd;
    if (!bothBeforeSeason && !bothAfterSeason) errors.push('Draft and free agency must share the same offseason window.');
    if (calendar.draftBeforeFreeAgency && draftDate > freeAgencyDate) errors.push('The draft must be scheduled before free agency.');
    if (!calendar.draftBeforeFreeAgency && freeAgencyDate > draftDate) errors.push('Free agency must open before the draft.');
  }
  for (const [deadline, label] of [
    [date(calendar.nonGuaranteedGuaranteeDate), 'Non-guaranteed guarantee deadline'],
    [date(calendar.playoffEligibilityDeadline), 'Playoff eligibility deadline'],
  ] as const) {
    if (deadline && (deadline < regularStart || deadline > regularEnd)) {
      errors.push(`${label} must fit inside the regular season window.`);
    }
  }

  if (options.summerLeagueEnabled) {
    const summerStart = date(calendar.summerLeagueStart);
    const summerEnd = date(calendar.summerLeagueEnd);
    if (!summerStart || !summerEnd) {
      errors.push('Summer League needs a start and end date.');
    } else {
      if (summerStart > summerEnd) errors.push('Summer League must end after it starts.');
      if (summerStart < rollover) errors.push('Summer League must start after the next season begins.');
      const nextCamp = calendar.trainingCampStart
        ? leagueCalendarDate(season + 1, calendar.trainingCampStart)
        : calendar.preseasonStart
          ? leagueCalendarDate(season + 1, calendar.preseasonStart)
          : leagueCalendarDate(season + 1, calendar.regularSeasonStart);
      if (summerEnd >= nextCamp) errors.push('Summer League must finish before the next training camp.');
      if (inclusiveDays(summerStart, summerEnd) < 7) errors.push('Summer League needs a window of at least seven days.');
    }
  }

  const regularSeasonWindowDays = Math.max(0, inclusiveDays(regularStart, regularEnd));
  const buffer = calendar.eventBufferDays ?? 0;
  const allStarDays = options.allStarEnabled
    ? Math.max(0, inclusiveDays(allStarStart, allStarEnd)) + buffer * 2
    : 0;
  let leagueBreakDays = 0;
  const sortedBreaks = (calendar.seasonBreaks ?? [])
    .filter(leagueBreak => breakAppliesToSeason(leagueBreak, season))
    .sort((left, right) => date(left.start)!.getTime() - date(right.start)!.getTime());
  let previousBreakEnd: Date | undefined;
  for (const leagueBreak of sortedBreaks) {
    const start = date(leagueBreak.start)!;
    const end = date(leagueBreak.end)!;
    withinRegularSeason(start, end, leagueBreak.name);
    if (previousBreakEnd && start <= previousBreakEnd) errors.push('League breaks may not overlap.');
    leagueBreakDays += Math.max(0, inclusiveDays(start, end)) + buffer * 2;
    previousBreakEnd = end;
  }
  const usableDays = Math.max(0, regularSeasonWindowDays - allStarDays - leagueBreakDays);
  const cadence = 1 + (calendar.minimumRestDaysBetweenGames ?? 0);
  const maximumGamesPerTeam = usableDays > 0 ? Math.floor((usableDays - 1) / cadence) + 1 : 0;
  const requestedGames = Math.max(1, Math.round(Number(gamesPerSeason) || 1));
  const requiredWindowDays = 1 + Math.max(0, requestedGames - 1) * cadence + allStarDays + leagueBreakDays;
  if (requestedGames > maximumGamesPerTeam) {
    errors.push(`${requestedGames} games need at least ${requiredWindowDays} calendar days with the selected rest and event buffers.`);
  }
  return { valid: errors.length === 0, errors, regularSeasonWindowDays, requiredWindowDays, maximumGamesPerTeam };
}

export function leagueCalendarDate(season: number, value: LeagueCalendarDate): Date {
  return new Date(Date.UTC(season + value.yearOffset, value.month - 1, value.day));
}

export function leagueCalendarDateString(season: number, value: LeagueCalendarDate): string {
  return leagueCalendarDate(season, value).toISOString().slice(0, 10);
}

export function getLeagueCalendar(leagueStats?: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>): LeagueCalendar {
  const fallback = leagueStats?.uiMode === 'wnba_isolated' ? WNBA_LEAGUE_CALENDAR : DEFAULT_LEAGUE_CALENDAR;
  return normalizeLeagueCalendar(leagueStats?.leagueCalendar, fallback);
}

export function getLeagueCalendarDates(season: number, leagueStats?: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>) {
  const calendar = getLeagueCalendar(leagueStats);
  return {
    calendar,
    scheduleRelease: calendar.scheduleRelease ? leagueCalendarDate(season, calendar.scheduleRelease) : undefined,
    freeAgencyStart: calendar.freeAgencyStart ? leagueCalendarDate(season, calendar.freeAgencyStart) : undefined,
    draftDate: calendar.draftDate ? leagueCalendarDate(season, calendar.draftDate) : undefined,
    nonGuaranteedGuaranteeDate: calendar.nonGuaranteedGuaranteeDate
      ? leagueCalendarDate(season, calendar.nonGuaranteedGuaranteeDate)
      : undefined,
    playoffEligibilityDeadline: calendar.playoffEligibilityDeadline
      ? leagueCalendarDate(season, calendar.playoffEligibilityDeadline)
      : undefined,
    trainingCampStart: calendar.trainingCampStart ? leagueCalendarDate(season, calendar.trainingCampStart) : undefined,
    preseasonStart: calendar.preseasonStart ? leagueCalendarDate(season, calendar.preseasonStart) : undefined,
    preseasonEnd: calendar.preseasonEnd ? leagueCalendarDate(season, calendar.preseasonEnd) : undefined,
    regularSeasonStart: leagueCalendarDate(season, calendar.regularSeasonStart),
    cupStart: calendar.cupStart ? leagueCalendarDate(season, calendar.cupStart) : undefined,
    cupFinal: calendar.cupFinal ? leagueCalendarDate(season, calendar.cupFinal) : undefined,
    allStarStart: calendar.allStarStart ? leagueCalendarDate(season, calendar.allStarStart) : undefined,
    allStarGame: calendar.allStarGame ? leagueCalendarDate(season, calendar.allStarGame) : undefined,
    allStarEnd: calendar.allStarEnd ? leagueCalendarDate(season, calendar.allStarEnd) : undefined,
    summerLeagueStart: calendar.summerLeagueStart ? leagueCalendarDate(season, calendar.summerLeagueStart) : undefined,
    summerLeagueEnd: calendar.summerLeagueEnd ? leagueCalendarDate(season, calendar.summerLeagueEnd) : undefined,
    seasonBreaks: (calendar.seasonBreaks ?? []).filter(leagueBreak => breakAppliesToSeason(leagueBreak, season)).map(leagueBreak => ({
      ...leagueBreak,
      start: leagueCalendarDate(season, leagueBreak.start),
      end: leagueCalendarDate(season, leagueBreak.end),
    })),
    regularSeasonEnd: leagueCalendarDate(season, calendar.regularSeasonEnd),
    playInStart: leagueCalendarDate(season, calendar.playInStart),
    playoffStart: leagueCalendarDate(season, calendar.playoffStart),
    rollover: leagueCalendarDate(season, calendar.rollover),
  };
}

export function getLeagueScheduleReleaseDate(
  season: number,
  leagueStats?: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>,
): Date {
  const dates = getLeagueCalendarDates(season, leagueStats);
  if (dates.scheduleRelease) return dates.scheduleRelease;
  const anchor = dates.trainingCampStart ?? dates.preseasonStart ?? dates.regularSeasonStart;
  return new Date(anchor.getTime() - 46 * 86_400_000);
}

export function formatLeagueSeasonLabel(
  season: number,
  leagueStats?: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>,
): string {
  const dates = getLeagueCalendarDates(season, leagueStats);
  const firstYear = dates.regularSeasonStart.getUTCFullYear();
  const lastYear = dates.regularSeasonEnd.getUTCFullYear();
  return firstYear === lastYear ? String(lastYear) : `${firstYear}–${String(lastYear).slice(-2)}`;
}

type CalendarPhaseStats = Pick<LeagueStats, 'leagueCalendar' | 'uiMode' | 'year' | 'playIn'>;

const CALENDAR_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const calendarDateParts = (value: string | Date) => {
  if (value instanceof Date) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }
  const text = String(value ?? '');
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const named = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) return { year: Number(named[3]), month: CALENDAR_MONTHS.indexOf(named[1].slice(0, 3).toLowerCase()) + 1, day: Number(named[2]) };
  const parsed = new Date(value);
  return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() + 1, day: parsed.getUTCDate() };
};

const calendarDateValue = (value: string | Date): Date => {
  const parts = calendarDateParts(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
};

export function isLeagueTrainingCampWindow(value: string | Date, leagueStats?: CalendarPhaseStats): boolean {
  const current = calendarDateValue(value);
  if (!Number.isFinite(current.getTime())) return false;
  const season = Number(leagueStats?.year) || getLeagueSeasonForDate(String(value), leagueStats);
  const dates = getLeagueCalendarDates(season, leagueStats);
  const start = dates.trainingCampStart ?? dates.preseasonStart;
  return !!start && current >= start && current < dates.regularSeasonStart;
}

export function isLeaguePreseasonWindow(value: string | Date, leagueStats?: CalendarPhaseStats): boolean {
  const current = calendarDateValue(value);
  if (!Number.isFinite(current.getTime())) return false;
  const season = Number(leagueStats?.year) || getLeagueSeasonForDate(String(value), leagueStats);
  const dates = getLeagueCalendarDates(season, leagueStats);
  const start = dates.preseasonStart ?? dates.trainingCampStart;
  return !!start && current >= start && current < dates.regularSeasonStart;
}

export function getLeagueSeasonForDate(
  value: string,
  leagueStats?: Pick<LeagueStats, 'leagueCalendar' | 'uiMode'>,
): number {
  try {
    const parts = calendarDateParts(value);
    if (!Number.isFinite(parts.year) || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return 0;
    const target = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const calendar = getLeagueCalendar(leagueStats);
    for (let season = parts.year - 1; season <= parts.year + 2; season += 1) {
      const priorRollover = leagueCalendarDate(season - 1, calendar.rollover);
      const rollover = leagueCalendarDate(season, calendar.rollover);
      if (target >= priorRollover && target < rollover) return season;
    }
    return parts.year;
  } catch {
    return 0;
  }
}

export function isLeagueRegularSeasonWindow(
  value: string | Date,
  leagueStats?: CalendarPhaseStats,
): boolean {
  const current = calendarDateValue(value);
  if (!Number.isFinite(current.getTime())) return false;
  const season = getLeagueSeasonForDate(current.toISOString().slice(0, 10), leagueStats) || Number(leagueStats?.year);
  if (!Number.isFinite(season)) return false;
  const dates = getLeagueCalendarDates(season, leagueStats);
  return current >= dates.regularSeasonStart && current <= dates.regularSeasonEnd;
}

export function isLeaguePostseasonWindow(
  value: string | Date,
  leagueStats?: CalendarPhaseStats,
): boolean {
  const current = calendarDateValue(value);
  if (!Number.isFinite(current.getTime())) return false;
  const season = getLeagueSeasonForDate(current.toISOString().slice(0, 10), leagueStats) || Number(leagueStats?.year);
  if (!Number.isFinite(season)) return false;
  const dates = getLeagueCalendarDates(season, leagueStats);
  const start = leagueStats?.playIn === false ? dates.playoffStart : dates.playInStart;
  return current >= start && current < dates.rollover;
}
