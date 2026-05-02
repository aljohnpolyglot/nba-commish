/**
 * Season date utilities — derive all calendar dates from leagueStats.year.
 * No hardcoded year literals outside this file.
 */

type DayAbbr = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

/**
 * Resolve a season date from an ordinal descriptor (no hardcoded strings).
 * @param seasonYear  The season's end year (e.g. 2027 for the 2026-27 season).
 * @param month       Calendar month 1–12.
 * @param ordinal     Which occurrence of the day within the month (1 = first, 4 = fourth).
 * @param day         Day-of-week abbreviation.
 * @param yearOffset  Apply to seasonYear: 0 = use seasonYear as-is, -1 = use seasonYear-1
 *                    (use -1 for fall months which fall in the prior calendar year).
 * @returns           UTC Date for that ordinal occurrence.
 */
export function resolveSeasonDate(
  seasonYear: number,
  month: number,
  ordinal: number,
  day: DayAbbr,
  yearOffset = 0
): Date {
  const dayMap: Record<DayAbbr, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const targetDay = dayMap[day];
  const year = seasonYear + yearOffset;
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstDayOfMonth = firstOfMonth.getUTCDay();
  const daysUntilTarget = (targetDay - firstDayOfMonth + 7) % 7;
  const firstOccurrence = 1 + daysUntilTarget;
  const nthDay = firstOccurrence + (ordinal - 1) * 7;
  return new Date(Date.UTC(year, month - 1, nthDay));
}

/**
 * The simulation start date: Aug 6 of the pre-season calendar year.
 * e.g. seasonYear=2026 → 2025-08-06
 */
export function getSeasonSimStartDate(seasonYear: number): Date {
  return new Date(Date.UTC(seasonYear - 1, 7, 6)); // month index 7 = August
}

/**
 * NBA Opening Night: 4th Tuesday of October in the pre-season calendar year.
 * e.g. seasonYear=2026 → 4th Tuesday of Oct 2025
 */
export function getOpeningNightDate(seasonYear: number): Date {
  return resolveSeasonDate(seasonYear, 10, 4, 'Tue', -1);
}

/**
 * Returns a YYYY-MM-DD string from a Date (UTC).
 */
export function toISODateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── Transaction calendar helpers ────────────────────────────────────────────
// Use leagueStats fields with defaults when absent so legacy saves keep working.

type TxnCalendar = {
  tradeDeadlineMonth?: number;
  tradeDeadlineOrdinal?: number;
  tradeDeadlineDayOfWeek?: DayAbbr;
  faStartMonth?: number;
  faStartDay?: number;
  faMoratoriumDays?: number;
  regularSeasonFAEnabled?: boolean;
  postDeadlineMultiYearContracts?: boolean;
  // Future configurable event dates (defaults used when absent)
  draftLotteryMonth?: number;
  draftLotteryDay?: number;
  draftMonth?: number;
  draftDay?: number;
  combineStartMonth?: number;
  combineStartDay?: number;
  combineEndMonth?: number;
  combineEndDay?: number;
  trainingCampMonth?: number;
  trainingCampDay?: number;
  allStarMonth?: number;
  allStarOrdinal?: number;
  allStarDayOfWeek?: DayAbbr;
};

type ScheduleDateLike = {
  date?: string;
  isPlayoff?: boolean;
  isPlayIn?: boolean;
};

/**
 * NBA trade deadline — Thursday of the first full week of February
 * (first Thursday whose entire Mon-Sun week falls in February).
 * Resolver: month=2, ordinal=1, day='Thu'. Year is the *current calendar year*
 * of the season, i.e. seasonYear 2026 → Feb 2026.
 */
export function getTradeDeadlineDate(seasonYear: number, stats?: TxnCalendar): Date {
  const month = stats?.tradeDeadlineMonth ?? 2;
  const ordinal = stats?.tradeDeadlineOrdinal ?? 1;
  const day = (stats?.tradeDeadlineDayOfWeek ?? 'Thu') as DayAbbr;
  return resolveSeasonDate(seasonYear, month, ordinal, day, 0);
}

/**
 * Free agency start — fixed day of month (no weekday resolution; NBA is always Jul 1).
 * Returns a UTC Date in the current seasonYear.
 */
export function getFreeAgencyStartDate(seasonYear: number, stats?: TxnCalendar): Date {
  const month = stats?.faStartMonth ?? 7;
  const day = stats?.faStartDay ?? 1;
  return new Date(Date.UTC(seasonYear, month - 1, day));
}

/** Free agency start relative to `current` — returns the NEXT upcoming FA start.
 *  If the current date is already past this year's FA window (i.e. past Oct 1),
 *  returns next calendar year's FA start instead. */
export function getCurrentOffseasonFAStart(current: Date | string, stats?: TxnCalendar): Date {
  const c = toDate(current);
  const month = stats?.faStartMonth ?? 7;
  const day = stats?.faStartDay ?? 1;
  const thisYearStart = new Date(Date.UTC(c.getUTCFullYear(), month - 1, day));
  // FA window is considered closed after Oct 1 of the same calendar year.
  const thisYearEnd = new Date(Date.UTC(c.getUTCFullYear(), 9, 1)); // Oct 1
  if (c >= thisYearEnd) {
    return new Date(Date.UTC(c.getUTCFullYear() + 1, month - 1, day));
  }
  return thisYearStart;
}

/** FA cannot truly open before season rollover has expired old contracts. */
export function getEffectiveFreeAgencyStartDate(
  seasonYear: number,
  stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): Date {
  const faStart = getFreeAgencyStartDate(seasonYear, stats);
  const rollover = getRolloverDate(seasonYear, stats, schedule);
  return rollover > faStart ? rollover : faStart;
}

export function getCurrentOffseasonEffectiveFAStart(
  current: Date | string,
  stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): Date {
  const nominal = getCurrentOffseasonFAStart(current, stats);
  return getEffectiveFreeAgencyStartDate(nominal.getUTCFullYear(), stats, schedule);
}

export function getCurrentOffseasonFAMoratoriumEnd(current: Date | string, stats?: TxnCalendar, schedule?: ScheduleDateLike[]): Date {
  const start = getCurrentOffseasonEffectiveFAStart(current, stats, schedule);
  const days = stats?.faMoratoriumDays ?? 0;
  return new Date(start.getTime() + days * 86_400_000);
}

/** Moratorium end = faStart + faMoratoriumDays (exclusive). */
export function getFreeAgencyMoratoriumEndDate(seasonYear: number, stats?: TxnCalendar): Date {
  const start = getFreeAgencyStartDate(seasonYear, stats);
  const days = stats?.faMoratoriumDays ?? 0;
  return new Date(start.getTime() + days * 86_400_000);
}

function toDate(d: Date | string): Date {
  if (typeof d !== 'string') return d;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return parsed;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

export function parseGameDate(d: Date | string): Date {
  return toDate(d);
}

export function addGameDays(d: Date | string, days: number): Date {
  return new Date(toDate(d).getTime() + days * 86_400_000);
}

const shortGameDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatGameDateShort(d: Date | string): string {
  return shortGameDateFormatter.format(toDate(d));
}

export function getGameDateParts(d: Date | string): { year: number; month: number; day: number; iso: string } {
  const parsed = toDate(d);
  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
    iso: toISODateString(parsed),
  };
}

export function compareGameDates(a: Date | string, b: Date | string): number {
  const aTime = toDate(a).getTime();
  const bTime = toDate(b).getTime();
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return 0;
  return Math.sign(aTime - bTime);
}

export function daysBetweenGameDates(start: Date | string, end: Date | string): number {
  const startTime = toDate(start).getTime();
  const endTime = toDate(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return NaN;
  return (endTime - startTime) / 86_400_000;
}

export function isPastTradeDeadline(current: Date | string, seasonYear: number, stats?: TxnCalendar): boolean {
  return toDate(current) > getTradeDeadlineDate(seasonYear, stats);
}

/** FA window = faStart (inclusive) → Oct 1 same year (exclusive).
 *  Calendar-year based (uses current date's UTC year) so it survives season
 *  rollovers — `ls.year` advances to the upcoming season on Jun 30, but the
 *  FA we're actually in still lives in the calendar year of `current`. The
 *  `seasonYear` arg is kept for backwards compatibility but ignored. */
export function isInFreeAgencyWindow(current: Date | string, _seasonYear: number, stats?: TxnCalendar, schedule?: ScheduleDateLike[]): boolean {
  const c = toDate(current);
  const start = getCurrentOffseasonEffectiveFAStart(c, stats, schedule);
  const end = new Date(Date.UTC(c.getUTCFullYear(), 9, 1));
  return c >= start && c < end;
}

/** Moratorium = faStart → faStart + moratoriumDays (signings locked, negotiations only).
 *  Calendar-year based — see `isInFreeAgencyWindow` for rationale. */
export function isInMoratorium(current: Date | string, _seasonYear: number, stats?: TxnCalendar, schedule?: ScheduleDateLike[]): boolean {
  const c = toDate(current);
  const start = getCurrentOffseasonEffectiveFAStart(c, stats, schedule);
  const end = getCurrentOffseasonFAMoratoriumEnd(c, stats, schedule);
  return c >= start && c < end;
}

/**
 * Regular season signings allowed year-round (buyouts, 10-days, open-roster deals)
 * UNTIL the trade deadline. After deadline, new signings still allowed but see
 * `canSignMultiYear` for length gating.
 */
export function isRegularSeasonSigningOpen(current: Date | string, seasonYear: number, stats?: TxnCalendar): boolean {
  if (stats?.regularSeasonFAEnabled === false) return false;
  const c = toDate(current);
  // Regular season window: after opening night (Oct) → before next FA start (Jul 1)
  const openingNight = getOpeningNightDate(seasonYear);
  const nextFAStart = getFreeAgencyStartDate(seasonYear, stats);
  return c >= openingNight && c < nextFAStart;
}

/**
 * Post-deadline dead zone for expiring-contract trade value: between the trade
 * deadline (exclusive) and free agency start (exclusive). Late-June trades can
 * reopen after the draft, but expiring contracts are still walking because the
 * acquiring team would lose them at the upcoming FA rollover.
 */
export function isInPostDeadlinePreFAWindow(current: Date | string, seasonYear: number, stats?: TxnCalendar, schedule?: ScheduleDateLike[]): boolean {
  const c = toDate(current);
  if (!Number.isFinite(c.getTime())) return false;
  const month = c.getUTCMonth() + 1;
  const calendarSeasonYear = month >= 10 ? c.getUTCFullYear() + 1 : c.getUTCFullYear();
  const activeSeasonYear = Number.isFinite(seasonYear)
    ? (Math.abs(seasonYear - calendarSeasonYear) <= 1 ? calendarSeasonYear : seasonYear)
    : calendarSeasonYear;
  const deadline = getTradeDeadlineDate(activeSeasonYear, stats);
  const faStart = getCurrentOffseasonEffectiveFAStart(c, stats, schedule);
  return c > deadline && c < faStart;
}

/**
 * Can a new contract be multi-year at this point in the calendar?
 * - In FA window (Jul-Sep): yes
 * - Before trade deadline: yes
 * - After trade deadline: gated by `postDeadlineMultiYearContracts`
 */
export function canSignMultiYear(current: Date | string, seasonYear: number, stats?: TxnCalendar): boolean {
  if (isInFreeAgencyWindow(current, seasonYear, stats)) return true;
  if (!isPastTradeDeadline(current, seasonYear, stats)) return true;
  return stats?.postDeadlineMultiYearContracts ?? true;
}

// ─── Non-transaction event dates ─────────────────────────────────────────────
// Defaults match lazySimRunner hardcoded dates. When leagueStats grows support
// for configurable event scheduling these will read from stats automatically.

/** Draft Lottery: May 14 by default. */
export function getDraftLotteryDate(seasonYear: number, stats?: TxnCalendar): Date {
  const m = stats?.draftLotteryMonth ?? 5;
  const d = stats?.draftLotteryDay ?? 14;
  return new Date(Date.UTC(seasonYear, m - 1, d));
}

/** NBA Draft: last Thursday of the month the Finals end in (NBA convention).
 *  - 4 playoff rounds (default) → June
 *  - Each extra round at LeagueSettings pushes the draft one month later
 *  - Explicit stats.draftMonth/draftDay overrides the computed date entirely. */
export function getDraftDate(seasonYear: number, stats?: TxnCalendar): Date {
  if (stats?.draftMonth != null && stats?.draftDay != null) {
    return new Date(Date.UTC(seasonYear, stats.draftMonth - 1, stats.draftDay));
  }
  const numRounds = (stats as any)?.numGamesPlayoffSeries?.length ?? 4;
  const monthIdx = 5 + Math.max(0, numRounds - 4); // 5 = June
  const lastDayOfMonth = new Date(Date.UTC(seasonYear, monthIdx + 1, 0));
  const offsetFromThursday = (lastDayOfMonth.getUTCDay() - 4 + 7) % 7;
  return new Date(Date.UTC(seasonYear, monthIdx, lastDayOfMonth.getUTCDate() - offsetFromThursday));
}

/** Draft access is deferred until the playoff bracket is actually complete.
 * This covers saves where Finals Game 7 gets scheduled after the nominal draft
 * date; draft UI/auto-run should not steal the calendar before a champion exists. */
export function isDraftBlockedByUnresolvedPlayoffs(state: any): boolean {
  const playoffs = state?.playoffs;
  if (!playoffs) return false;
  if (playoffs.bracketComplete === true) return false;
  const activeSeries = (playoffs.series ?? []).some((s: any) => s?.status !== 'complete');
  const unplayedPlayoffGame = (state?.schedule ?? []).some((g: any) =>
    (g.isPlayoff || g.playoffs) && !g.played
  );
  return playoffs.bracketComplete === false || activeSeries || unplayedPlayoffGame;
}

/** Draft Combine window start: May 19 by default. */
export function getDraftCombineStartDate(seasonYear: number, stats?: TxnCalendar): Date {
  const m = stats?.combineStartMonth ?? 5;
  const d = stats?.combineStartDay ?? 19;
  return new Date(Date.UTC(seasonYear, m - 1, d));
}

/** Draft Combine window end: May 23 by default. */
export function getDraftCombineEndDate(seasonYear: number, stats?: TxnCalendar): Date {
  const m = stats?.combineEndMonth ?? 5;
  const d = stats?.combineEndDay ?? 23;
  return new Date(Date.UTC(seasonYear, m - 1, d));
}

/**
 * Training Camp open: Oct 1 of the pre-season calendar year.
 * e.g. seasonYear=2026 → 2025-10-01
 */
export function getTrainingCampDate(seasonYear: number, stats?: TxnCalendar): Date {
  const m = stats?.trainingCampMonth ?? 10;
  const d = stats?.trainingCampDay ?? 1;
  return new Date(Date.UTC(seasonYear - 1, m - 1, d));
}

/**
 * All-Star Game: 3rd Sunday of February in the current season year.
 * e.g. seasonYear=2026 → 3rd Sunday of Feb 2026
 */
export function getAllStarGameDate(seasonYear: number, stats?: TxnCalendar): Date {
  const month   = stats?.allStarMonth   ?? 2;
  const ordinal = stats?.allStarOrdinal ?? 3;
  const day     = (stats?.allStarDayOfWeek ?? 'Sun') as DayAbbr;
  return resolveSeasonDate(seasonYear, month, ordinal, day, 0);
}

/**
 * Rising Stars / All-Star weekend start: 2 days before the All-Star Game (Friday).
 */
export function getAllStarWeekendStartDate(seasonYear: number, stats?: TxnCalendar): Date {
  return new Date(getAllStarGameDate(seasonYear, stats).getTime() - 2 * 86_400_000);
}

/** Season rollover defaults to Jun 30, but slides later when scheduled
 *  playoff/play-in games run into July under custom playoff lengths. */
export function getRolloverDate(
  seasonYear: number,
  _stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): Date {
  const defaultRollover = new Date(Date.UTC(seasonYear, 5, 30));
  const playoffDates = (schedule ?? [])
    .filter(g => (g.isPlayoff || g.isPlayIn) && g.date)
    .map(g => new Date(g.date as string))
    .filter(d => !isNaN(d.getTime()) && d.getUTCFullYear() === seasonYear);
  if (playoffDates.length === 0) return defaultRollover;
  const lastPlayoffMs = Math.max(...playoffDates.map(d => d.getTime()));
  const slid = new Date(lastPlayoffMs + 7 * 86_400_000);
  return slid > defaultRollover ? slid : defaultRollover;
}
