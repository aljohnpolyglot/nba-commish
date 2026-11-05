/**
 * Season date utilities — derive all calendar dates from leagueStats.year.
 * No hardcoded year literals outside this file.
 */

import type { LeagueCalendar } from '../types';
import { getLeagueCalendar, getLeagueCalendarDates, getLeagueSeasonForDate, leagueCalendarDate } from '../services/leagueCalendar';
import { getPbaAllStarWeekendStartIso } from '../services/pba/calendar';

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

/** Opens the save with enough lead time before the configured training camp. */
export function getSeasonSimStartDate(seasonYear: number, stats?: TxnCalendar): Date {
  const calendar = getActiveLeagueCalendar(stats) ?? getLeagueCalendar(stats as any);
  const camp = calendar.trainingCampStart
    ? leagueCalendarDate(seasonYear, calendar.trainingCampStart)
    : calendar.preseasonStart
      ? leagueCalendarDate(seasonYear, calendar.preseasonStart)
      : leagueCalendarDate(seasonYear, calendar.regularSeasonStart);
  return addGameDays(camp, -54);
}

export function getCommissionerBootstrapDate(cycleYear: number, stats?: TxnCalendar): Date {
  const afterDraft = addGameDays(getDraftDate(cycleYear, stats), 1);
  const afterOpeningFreeAgency = addGameDays(getRolloverDate(cycleYear, stats), 20);
  return afterOpeningFreeAgency > afterDraft ? afterOpeningFreeAgency : afterDraft;
}

/**
 * League-aware regular-season start. NBA keeps the dynamic October opener;
 * Euro isolated uses the first scheduled regular competition game, with Sep 28
 * as the fallback for Spain.
 */
export function getRegularSeasonStartDate(
  seasonYear: number,
  stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): Date {
  if (stats?.uiMode === 'euro_isolated') {
    const lowerBound = `${seasonYear - 1}-08-01`;
    const first = (schedule ?? [])
      .filter(g => g.date && !g.isPlayoff && !g.isPlayIn && (!g.season || g.season === seasonYear))
      .map(g => String(g.date).slice(0, 10))
      .filter(d => d >= lowerBound)
      .sort()[0];
    return first ? toDate(first) : new Date(Date.UTC(seasonYear - 1, 8, 28));
  }
  const calendar = getActiveLeagueCalendar(stats);
  if (calendar?.regularSeasonStart) {
    return leagueCalendarDate(seasonYear, calendar.regularSeasonStart);
  }
  return resolveSeasonDate(seasonYear, 10, 4, 'Tue', -1);
}

/**
 * NBA Opening Night by default; league-aware when stats/schedule are supplied.
 */
export function getOpeningNightDate(seasonYear: number, stats?: TxnCalendar, schedule?: ScheduleDateLike[]): Date {
  return getRegularSeasonStartDate(seasonYear, stats, schedule);
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
  uiMode?: string | null;
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
  pbaAllStarWeekendStart?: string;
  leagueCalendar?: LeagueCalendar;
};

type ScheduleDateLike = {
  date?: string;
  isPlayoff?: boolean;
  isPlayIn?: boolean;
  played?: boolean;
  season?: number;
  competitionId?: string;
};

function getActiveLeagueCalendar(stats?: TxnCalendar): LeagueCalendar | undefined {
  if (!stats?.leagueCalendar && stats?.uiMode !== 'wnba_isolated') return undefined;
  return getLeagueCalendar(stats as any);
}

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
  const calendar = getActiveLeagueCalendar(stats);
  if (!calendar) return resolveSeasonDate(seasonYear, month, ordinal, day, 0);
  const { regularSeasonStart, regularSeasonEnd } = getLeagueCalendarDates(seasonYear, stats as any);
  const candidates = [seasonYear - 1, seasonYear, seasonYear + 1]
    .map(calendarYear => resolveSeasonDate(calendarYear, month, ordinal, day, 0));
  return candidates.find(candidate => candidate >= regularSeasonStart && candidate <= regularSeasonEnd)
    ?? resolveSeasonDate(seasonYear, month, ordinal, day, 0);
}

/**
 * Free agency start from the saved league calendar, with legacy month/day fallback.
 */
export function getFreeAgencyStartDate(seasonYear: number, stats?: TxnCalendar): Date {
  const calendar = getActiveLeagueCalendar(stats);
  if (calendar?.freeAgencyStart) {
    return leagueCalendarDate(seasonYear, calendar.freeAgencyStart);
  }
  const month = stats?.faStartMonth ?? 7;
  const day = stats?.faStartDay ?? 1;
  return new Date(Date.UTC(seasonYear, month - 1, day));
}

/** Free agency start relative to `current` — returns the NEXT upcoming FA start.
 *  If the current date is already past this year's FA window (i.e. past Oct 1),
 *  returns next calendar year's FA start instead. */
export function getCurrentOffseasonFAStart(current: Date | string, stats?: TxnCalendar): Date {
  return resolveFreeAgencyWindow(current, stats).nominalStart;
}

/** FA cannot truly open before season rollover has expired old contracts. */
export function getEffectiveFreeAgencyStartDate(
  seasonYear: number,
  stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): Date {
  const faStart = getFreeAgencyStartDate(seasonYear, stats);
  const regularSeasonStart = getRegularSeasonStartDate(seasonYear, stats, schedule);
  const rolloverSeasonYear = faStart < regularSeasonStart ? seasonYear - 1 : seasonYear;
  const rollover = getRolloverDate(rolloverSeasonYear, stats, schedule);
  return rollover > faStart ? rollover : faStart;
}

export function getCurrentOffseasonEffectiveFAStart(
  current: Date | string,
  stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): Date {
  return resolveFreeAgencyWindow(current, stats, schedule).effectiveStart;
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

interface FreeAgencyWindow {
  seasonYear: number;
  nominalStart: Date;
  effectiveStart: Date;
  end: Date;
}

function resolveFreeAgencyWindow(
  current: Date | string,
  stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): FreeAgencyWindow {
  const c = toDate(current);
  const dateStr = Number.isFinite(c.getTime()) ? toISODateString(c) : '';
  const derivedSeason = getLeagueSeasonForDate(dateStr, stats as any) || c.getUTCFullYear();
  const seasons = [...new Set([
    derivedSeason - 2,
    derivedSeason - 1,
    derivedSeason,
    derivedSeason + 1,
    derivedSeason + 2,
    c.getUTCFullYear() - 1,
    c.getUTCFullYear(),
    c.getUTCFullYear() + 1,
  ])].filter(Number.isFinite);
  const windows = seasons.map(seasonYear => {
    const nominalStart = getFreeAgencyStartDate(seasonYear, stats);
    const effectiveStart = getEffectiveFreeAgencyStartDate(seasonYear, stats, schedule);
    const sameSeasonOpening = getOpeningNightDate(seasonYear, stats, schedule);
    const end = sameSeasonOpening > nominalStart
      ? sameSeasonOpening
      : getOpeningNightDate(seasonYear + 1, stats, schedule);
    return { seasonYear, nominalStart, effectiveStart, end };
  }).sort((left, right) => left.effectiveStart.getTime() - right.effectiveStart.getTime());
  return windows.find(window => c >= window.effectiveStart && c < window.end)
    ?? windows.find(window => c < window.effectiveStart)
    ?? windows[windows.length - 1];
}

export function isPastTradeDeadline(current: Date | string, seasonYear: number, stats?: TxnCalendar): boolean {
  const c = toDate(current);
  const derivedSeason = getLeagueSeasonForDate(toISODateString(c), stats as any);
  return c > getTradeDeadlineDate(derivedSeason || seasonYear, stats);
}

/** FA window = effective saved FA start (inclusive) → opening day (exclusive).
 *  The current date resolves the owning league season; the explicit season-year
 *  argument remains for backwards-compatible callers but is not authoritative. */
export function isInFreeAgencyWindow(current: Date | string, _seasonYear: number, stats?: TxnCalendar, schedule?: ScheduleDateLike[]): boolean {
  const c = toDate(current);
  const window = resolveFreeAgencyWindow(c, stats, schedule);
  return c >= window.effectiveStart && c < window.end;
}

export function isInPreFreeAgencyBlackout(
  current: Date | string,
  activeSeasonYear: number,
  stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): boolean {
  const c = toDate(current);
  if (!Number.isFinite(c.getTime())) return false;
  const transition = getRolloverDate(activeSeasonYear, stats, schedule);
  const nextFAStart = [activeSeasonYear, activeSeasonYear + 1, activeSeasonYear + 2]
    .map(seasonYear => getEffectiveFreeAgencyStartDate(seasonYear, stats, schedule))
    .filter(candidate => candidate >= transition)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  return !!nextFAStart && c >= transition && c < nextFAStart;
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
  const activeSeasonYear = getLeagueSeasonForDate(toISODateString(c), stats as any) || seasonYear;
  const openingNight = getOpeningNightDate(activeSeasonYear, stats);
  const nextFAStart = [activeSeasonYear, activeSeasonYear + 1, activeSeasonYear + 2]
    .map(candidate => getEffectiveFreeAgencyStartDate(candidate, stats))
    .filter(candidate => candidate > openingNight)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  if (!nextFAStart) return false;
  return c >= openingNight && c < nextFAStart;
}

export function isFreeAgentMarketAccessible(
  current: Date | string,
  seasonYear: number,
  stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): boolean {
  return isInFreeAgencyWindow(current, seasonYear, stats, schedule)
    || isRegularSeasonSigningOpen(current, seasonYear, stats)
    || isInPreFreeAgencyBlackout(current, seasonYear, stats, schedule);
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
  const activeSeasonYear = getLeagueSeasonForDate(toISODateString(c), stats as any) || seasonYear;
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

/** Draft Lottery: saved league date, defaulting to May 14. */
export function getDraftLotteryDate(seasonYear: number, stats?: TxnCalendar): Date {
  if (
    stats?.uiMode === 'wnba_isolated'
    && stats.draftLotteryMonth == null
    && stats.draftLotteryDay == null
  ) {
    return new Date(Date.UTC(seasonYear - 1, 10, 23));
  }
  const m = stats?.draftLotteryMonth ?? 5;
  const d = stats?.draftLotteryDay ?? 14;
  return new Date(Date.UTC(seasonYear, m - 1, d));
}

/** NBA Draft: last Thursday of the month the Finals end in (NBA convention).
 *  - 4 playoff rounds (default) → June
 *  - Each extra round at LeagueSettings pushes the draft one month later
 *  - Explicit stats.draftMonth/draftDay overrides the computed date entirely. */
export function getDraftDate(seasonYear: number, stats?: TxnCalendar): Date {
  const calendar = getActiveLeagueCalendar(stats);
  if (calendar?.draftDate) {
    return leagueCalendarDate(seasonYear, calendar.draftDate);
  }
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
  // A stale convenience boolean cannot authorize Draft entry. A real champion,
  // completed real Finals, and fully resolved graph are required.
  const champion = Number(playoffs.champion);
  const finalSeries = (playoffs.series ?? [])
    .filter((series: any) => series?.conference === 'Finals')
    .sort((left: any, right: any) => Number(right?.round ?? 0) - Number(left?.round ?? 0))[0];
  const graphComplete = (playoffs.nodes ?? []).every((node: any) => node?.status === 'complete');
  const finalComplete = Number.isInteger(champion) && champion >= 0
    && finalSeries?.status === 'complete'
    && Number(finalSeries?.winnerId) === champion
    && Number.isInteger(finalSeries?.higherSeedTid)
    && Number(finalSeries?.higherSeedTid) >= 0
    && Number.isInteger(finalSeries?.lowerSeedTid)
    && Number(finalSeries?.lowerSeedTid) >= 0
    && graphComplete;
  if (finalComplete) return false;
  const activeSeries = (playoffs.series ?? []).some((s: any) => s?.status !== 'complete');
  const unplayedPlayoffGame = (state?.schedule ?? []).some((g: any) =>
    (g.isPlayoff || g.playoffs) && !g.played
  );
  return activeSeries || unplayedPlayoffGame;
}

/** Draft Combine window start: May 19 by default; PBA uses the offseason draft week. */
export function getDraftCombineStartDate(seasonYear: number, stats?: TxnCalendar): Date {
  const defaultMonth = stats?.uiMode === 'pba_isolated' ? 9 : 5;
  const defaultDay = stats?.uiMode === 'pba_isolated' ? 22 : 19;
  const m = stats?.combineStartMonth ?? defaultMonth;
  const d = stats?.combineStartDay ?? defaultDay;
  return new Date(Date.UTC(seasonYear, m - 1, d));
}

/** Draft Combine window end: May 23 by default; PBA uses the offseason draft week. */
export function getDraftCombineEndDate(seasonYear: number, stats?: TxnCalendar): Date {
  const defaultMonth = stats?.uiMode === 'pba_isolated' ? 9 : 5;
  const defaultDay = stats?.uiMode === 'pba_isolated' ? 26 : 23;
  const m = stats?.combineEndMonth ?? defaultMonth;
  const d = stats?.combineEndDay ?? defaultDay;
  return new Date(Date.UTC(seasonYear, m - 1, d));
}

/**
 * Training Camp open. NBA defaults to Sept 29; Euro isolated uses Aug 15,
 * matching the Euro training scheduler window.
 * e.g. NBA seasonYear=2026 → 2025-09-29; Euro → 2025-08-15
 */
export function getTrainingCampDate(seasonYear: number, stats?: TxnCalendar): Date {
  const calendar = getActiveLeagueCalendar(stats);
  if (calendar?.trainingCampStart) {
    return leagueCalendarDate(seasonYear, calendar.trainingCampStart);
  }
  const defaultMonth = stats?.uiMode === 'euro_isolated' ? 8 : 9;
  const defaultDay = stats?.uiMode === 'euro_isolated' ? 15 : 29;
  const m = stats?.trainingCampMonth ?? defaultMonth;
  const d = stats?.trainingCampDay ?? defaultDay;
  return new Date(Date.UTC(seasonYear - 1, m - 1, d));
}

/**
 * All-Star Game: 3rd Sunday of February in the current season year.
 * e.g. seasonYear=2026 → 3rd Sunday of Feb 2026
 */
export function getAllStarGameDate(seasonYear: number, stats?: TxnCalendar): Date {
  if (stats?.uiMode === 'pba_isolated') {
    const savedFriday = stats.pbaAllStarWeekendStart
      ? new Date(`${stats.pbaAllStarWeekendStart.slice(0, 10)}T00:00:00.000Z`)
      : null;
    const friday = savedFriday && !Number.isNaN(savedFriday.getTime())
      ? savedFriday
      : new Date(`${getPbaAllStarWeekendStartIso(seasonYear)}T00:00:00.000Z`);
    const sunday = new Date(friday);
    sunday.setUTCDate(friday.getUTCDate() + 2);
    return sunday;
  }
  const calendar = getActiveLeagueCalendar(stats);
  if (calendar?.allStarGame) {
    return leagueCalendarDate(seasonYear, calendar.allStarGame);
  }
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

/** Season transition follows the saved calendar and slides later when scheduled
 *  playoff/play-in games run past it under custom playoff lengths. */
export function getRolloverDate(
  seasonYear: number,
  stats?: TxnCalendar,
  schedule?: ScheduleDateLike[],
): Date {
  const calendar = getActiveLeagueCalendar(stats);
  const configuredRollover = calendar?.rollover
    ? leagueCalendarDate(seasonYear, calendar.rollover)
    : new Date(Date.UTC(seasonYear, 5, 30));
  const regularSeasonEnd = calendar
    ? leagueCalendarDate(seasonYear, calendar.regularSeasonEnd)
    : new Date(Date.UTC(seasonYear, 3, 30));
  const scheduleUpperBound = addGameDays(configuredRollover, 180);
  const playoffDates = (schedule ?? [])
    .filter(g => !g.competitionId && (g.isPlayoff || g.isPlayIn) && g.date)
    .filter(g => Number.isFinite(g.season)
      ? g.season === seasonYear
      : toDate(String(g.date)) >= regularSeasonEnd && toDate(String(g.date)) <= scheduleUpperBound)
    .map(g => toDate(String(g.date)))
    .filter(d => !isNaN(d.getTime()));
  if (playoffDates.length === 0) return configuredRollover;
  const lastPlayoffMs = Math.max(...playoffDates.map(d => d.getTime()));
  const graceDays = Math.max(0, Math.round(calendar?.rolloverGraceDays ?? 7));
  const slid = new Date(lastPlayoffMs + graceDays * 86_400_000);
  return slid > configuredRollover ? slid : configuredRollover;
}
