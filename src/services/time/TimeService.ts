import type { Game, LeagueStats } from '../../types';
import { getLeagueCalendarDates } from '../leagueCalendar';

export type GameDate = `${number}-${number}-${number}`;
export type CalendarPhase = 'offseason' | 'preseason' | 'regular-season' | 'postseason';

type DateParts = { year: number; month: number; day: number };

const DATE_ONLY = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const LEGACY_DISPLAY_DATE = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/;
const MONTHS = new Map([
  ['jan', 1], ['january', 1], ['feb', 2], ['february', 2], ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4], ['may', 5], ['jun', 6], ['june', 6], ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8], ['sep', 9], ['sept', 9], ['september', 9], ['oct', 10],
  ['october', 10], ['nov', 11], ['november', 11], ['dec', 12], ['december', 12],
]);
const DAY_MS = 86_400_000;

function parts(value: string | Date): DateParts {
  if (value instanceof Date) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }
  const text = String(value).trim();
  const match = text.match(DATE_ONLY);
  const legacy = text.match(LEGACY_DISPLAY_DATE);
  const legacyMonth = legacy ? MONTHS.get(legacy[1].toLowerCase()) : undefined;
  if (!match && (!legacy || legacyMonth == null)) throw new Error(`Invalid persisted game date: ${String(value)}`);
  const parsed = match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : { year: Number(legacy![3]), month: legacyMonth!, day: Number(legacy![2]) };
  const stamp = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  if (
    stamp.getUTCFullYear() !== parsed.year
    || stamp.getUTCMonth() + 1 !== parsed.month
    || stamp.getUTCDate() !== parsed.day
  ) throw new Error(`Invalid persisted game date: ${String(value)}`);
  return parsed;
}

function iso(value: DateParts): GameDate {
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}` as GameDate;
}

function epochDay(value: string | Date): number {
  const parsed = parts(value);
  return Math.floor(Date.UTC(parsed.year, parsed.month - 1, parsed.day) / DAY_MS);
}

export const TimeService = Object.freeze({
  parsePersistedDate(value: string | Date): DateParts {
    return parts(value);
  },

  normalize(value: string | Date): GameDate {
    return iso(parts(value));
  },

  compare(left: string | Date, right: string | Date): -1 | 0 | 1 {
    const delta = epochDay(left) - epochDay(right);
    return delta < 0 ? -1 : delta > 0 ? 1 : 0;
  },

  differenceInDays(left: string | Date, right: string | Date): number {
    return epochDay(left) - epochDay(right);
  },

  addSimulationDays(value: string | Date, days: number): GameDate {
    const stamp = new Date((epochDay(value) + Math.trunc(days)) * DAY_MS);
    return iso({ year: stamp.getUTCFullYear(), month: stamp.getUTCMonth() + 1, day: stamp.getUTCDate() });
  },

  formatForDisplay(value: string | Date, locale = 'en-US', options: Intl.DateTimeFormatOptions = {}): string {
    const parsed = parts(value);
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...options,
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12)));
  },

  isScheduledDayCommitted(date: string | Date, schedule: readonly Game[]): boolean {
    const target = iso(parts(date));
    const rows = schedule.filter(game => iso(parts(game.date)) === target);
    return rows.length > 0 && rows.every(game => game.played);
  },

  nextUnplayedGame(date: string | Date, schedule: readonly Game[], throughDate?: string | Date): Game | undefined {
    const current = iso(parts(date));
    const through = throughDate == null ? null : iso(parts(throughDate));
    return schedule
      .filter(game => !game.played && iso(parts(game.date)) >= current && (!through || iso(parts(game.date)) <= through))
      .sort((left, right) => iso(parts(left.date)).localeCompare(iso(parts(right.date))) || left.gid - right.gid)[0];
  },

  resolveSeasonEventDate(season: number, stats: LeagueStats, event: keyof ReturnType<typeof getLeagueCalendarDates>): GameDate {
    const value = getLeagueCalendarDates(season, stats)[event];
    if (!(value instanceof Date)) throw new Error(`Calendar event ${String(event)} is unavailable for season ${season}`);
    return iso(parts(value));
  },

  phaseForDate(value: string | Date, season: number, stats: LeagueStats): CalendarPhase {
    const date = iso(parts(value));
    const dates = getLeagueCalendarDates(season, stats);
    const preseason = dates.preseasonStart ? iso(parts(dates.preseasonStart)) : iso(parts(dates.regularSeasonStart));
    const regular = iso(parts(dates.regularSeasonStart));
    const regularEnd = iso(parts(dates.regularSeasonEnd));
    const rollover = iso(parts(dates.rollover));
    if (date >= preseason && date < regular) return 'preseason';
    if (date >= regular && date <= regularEnd) return 'regular-season';
    if (date > regularEnd && date < rollover) return 'postseason';
    return 'offseason';
  },
});
