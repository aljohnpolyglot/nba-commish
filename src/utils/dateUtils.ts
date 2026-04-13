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
