import { normalizeDate } from '../../utils/helpers';

export function addDaysISO(dateStr: string, days = 1): string {
  const date = new Date(`${normalizeDate(dateStr)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
