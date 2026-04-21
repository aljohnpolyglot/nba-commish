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

/** Moratorium end = faStart + faMoratoriumDays (exclusive). */
export function getFreeAgencyMoratoriumEndDate(seasonYear: number, stats?: TxnCalendar): Date {
  const start = getFreeAgencyStartDate(seasonYear, stats);
  const days = stats?.faMoratoriumDays ?? 6;
  return new Date(start.getTime() + days * 86_400_000);
}

function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

export function isPastTradeDeadline(current: Date | string, seasonYear: number, stats?: TxnCalendar): boolean {
  return toDate(current) > getTradeDeadlineDate(seasonYear, stats);
}

/** FA window = faStart (inclusive) → Oct 1 same year (exclusive). */
export function isInFreeAgencyWindow(current: Date | string, seasonYear: number, stats?: TxnCalendar): boolean {
  const c = toDate(current);
  const start = getFreeAgencyStartDate(seasonYear, stats);
  const end = new Date(Date.UTC(seasonYear, 9, 1)); // Oct 1 — end of dead period before camp
  return c >= start && c < end;
}

/** Moratorium = faStart → faStart + moratoriumDays (signings locked, negotiations only). */
export function isInMoratorium(current: Date | string, seasonYear: number, stats?: TxnCalendar): boolean {
  const c = toDate(current);
  return c >= getFreeAgencyStartDate(seasonYear, stats) && c < getFreeAgencyMoratoriumEndDate(seasonYear, stats);
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

/** NBA Draft: Jun 25 by default. */
export function getDraftDate(seasonYear: number, stats?: TxnCalendar): Date {
  const m = stats?.draftMonth ?? 6;
  const d = stats?.draftDay ?? 25;
  return new Date(Date.UTC(seasonYear, m - 1, d));
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
