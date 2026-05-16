/**
 * transferWindow.ts — Euro transfer-market window gate.
 *
 * Reads leagueStats.transferMarket to determine whether a given calendar
 * date falls inside the Summer or Winter window. Used by the engine to gate
 * new listings/bids and by UI banners to show "window closed — opens X".
 */

import type { LeagueStats } from '../types';
import { EURO_ISOLATED_DEFAULTS, TRANSFER_MARKET_NBA_DEFAULTS } from '../constants';

export type TransferWindowName = 'summer' | 'winter' | null;

export interface TransferWindowStatus {
  /** Master toggle off → always false; otherwise true inside a window. */
  open: boolean;
  /** Which window is currently open, null when closed or disabled. */
  window: TransferWindowName;
  /** UTC Date when the next window opens (null when currently open or disabled). */
  nextOpen: Date | null;
  /** UTC Date when the current window closes (null when currently closed). */
  currentClose: Date | null;
}

const MM_DD = /^(\d{2})-(\d{2})$/;

function parseMonthDay(s: string): { month: number; day: number } | null {
  const m = MM_DD.exec(s);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function resolveSettings(leagueStats: LeagueStats | undefined): NonNullable<LeagueStats['transferMarket']> {
  const euro = leagueStats?.uiMode === 'euro_isolated';
  const base = euro ? EURO_ISOLATED_DEFAULTS.transferMarket : TRANSFER_MARKET_NBA_DEFAULTS;
  return { ...(base as NonNullable<LeagueStats['transferMarket']>), ...(leagueStats?.transferMarket ?? {}) };
}

function dateAt(year: number, mmdd: string): Date | null {
  const parsed = parseMonthDay(mmdd);
  if (!parsed) return null;
  return new Date(Date.UTC(year, parsed.month - 1, parsed.day));
}

/** Return DOY (0-365) for a UTC date, ignoring year — for window math that wraps year boundaries. */
function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

function inWindow(current: Date, start: string, end: string): boolean {
  const s = parseMonthDay(start);
  const e = parseMonthDay(end);
  if (!s || !e) return false;
  const c = { month: current.getUTCMonth() + 1, day: current.getUTCDate() };
  const cKey = c.month * 100 + c.day;
  const sKey = s.month * 100 + s.day;
  const eKey = e.month * 100 + e.day;
  // Same-year window (e.g. 07-01 .. 09-30): start <= current <= end
  if (sKey <= eKey) return cKey >= sKey && cKey <= eKey;
  // Wrap-around (e.g. 12-15 .. 01-31): current >= start OR current <= end
  return cKey >= sKey || cKey <= eKey;
}

/** Next opening date >= `from`, picking whichever of summer/winter is earlier. */
function nextOpening(from: Date, summerStart: string, winterStart: string): Date | null {
  const candidates: Date[] = [];
  for (const mmdd of [summerStart, winterStart]) {
    const thisYear = dateAt(from.getUTCFullYear(), mmdd);
    const nextYear = dateAt(from.getUTCFullYear() + 1, mmdd);
    if (thisYear && thisYear.getTime() >= from.getTime()) candidates.push(thisYear);
    else if (nextYear) candidates.push(nextYear);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0];
}

/** Current-window close, given we are already inside one. */
function currentWindowClose(current: Date, start: string, end: string): Date | null {
  const e = parseMonthDay(end);
  if (!e) return null;
  const s = parseMonthDay(start);
  if (!s) return null;
  const cKey = (current.getUTCMonth() + 1) * 100 + current.getUTCDate();
  const sKey = s.month * 100 + s.day;
  const eKey = e.month * 100 + e.day;
  // Wrap-around: if current is in Dec part, close is next year
  if (sKey > eKey && cKey >= sKey) {
    return dateAt(current.getUTCFullYear() + 1, end);
  }
  return dateAt(current.getUTCFullYear(), end);
}

/**
 * Resolve the transfer-window status for the given calendar date.
 * `currentDate` may be a Date or YYYY-MM-DD string.
 */
export function isInTransferWindow(
  currentDate: Date | string,
  leagueStats: LeagueStats | undefined
): TransferWindowStatus {
  const settings = resolveSettings(leagueStats);
  // Normalize: accept ISO (YYYY-MM-DD) or en-US ("Aug 1, 2025") or Date.
  let date: Date;
  if (typeof currentDate === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
      date = new Date(`${currentDate}T00:00:00Z`);
    } else {
      const parsed = new Date(currentDate);
      date = Number.isNaN(parsed.getTime())
        ? new Date()
        : new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
    }
  } else {
    date = currentDate;
  }
  if (Number.isNaN(date.getTime())) date = new Date();

  if (!settings.enabled) {
    return { open: false, window: null, nextOpen: null, currentClose: null };
  }

  if (inWindow(date, settings.summerStart, settings.summerEnd)) {
    return {
      open: true,
      window: 'summer',
      nextOpen: null,
      currentClose: currentWindowClose(date, settings.summerStart, settings.summerEnd),
    };
  }
  if (inWindow(date, settings.winterStart, settings.winterEnd)) {
    return {
      open: true,
      window: 'winter',
      nextOpen: null,
      currentClose: currentWindowClose(date, settings.winterStart, settings.winterEnd),
    };
  }

  return {
    open: false,
    window: null,
    nextOpen: nextOpening(date, settings.summerStart, settings.winterStart),
    currentClose: null,
  };
}

/** Convenience: just the boolean open-flag. */
export function isTransferWindowOpen(
  currentDate: Date | string,
  leagueStats: LeagueStats | undefined
): boolean {
  return isInTransferWindow(currentDate, leagueStats).open;
}

/** Resolved settings — falls back to mode-appropriate defaults when leagueStats has none. */
export function getTransferMarketSettings(
  leagueStats: LeagueStats | undefined
): NonNullable<LeagueStats['transferMarket']> {
  return resolveSettings(leagueStats);
}
