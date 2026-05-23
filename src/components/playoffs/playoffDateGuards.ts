import { normalizeDate } from '../../utils/helpers';

export function addDaysISO(dateStr: string, days = 1): string {
  const date = new Date(`${normalizeDate(dateStr)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function shouldWarnForLottery(
  currentDate: string,
  lotteryDate: string,
  targetDate: string,
  hasDraftLotteryResult: boolean,
): boolean {
  if (hasDraftLotteryResult) return false;
  const current = normalizeDate(currentDate);
  return current < lotteryDate && targetDate >= lotteryDate;
}

