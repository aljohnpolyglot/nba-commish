import { parseGameDate } from '../../utils/dateUtils';

export type EuroOffseasonMarket = 'transfer' | 'signing';

export interface EuroOffseasonMarketProgress {
  current: number;
  total: number;
  isLast: boolean;
  todayIso: string;
  startIso: string;
  closeIso: string;
  nextIso: string;
}

const DAY_MS = 86_400_000;

const marketDates = (calendarYear: number, market: EuroOffseasonMarket) => {
  const startIso = market === 'transfer'
    ? `${calendarYear}-07-01`
    : `${calendarYear}-07-16`;
  const closeIso = market === 'transfer'
    ? `${calendarYear}-07-15`
    : `${calendarYear}-07-31`;
  const nextIso = market === 'transfer'
    ? `${calendarYear}-07-16`
    : `${calendarYear}-08-01`;
  return { startIso, closeIso, nextIso };
};

export function getEuroOffseasonMarketDates(
  calendarYear: number,
  market: EuroOffseasonMarket,
) {
  return marketDates(calendarYear, market);
}

export function getEuroOffseasonMarketProgress(
  currentDate: string | Date | undefined,
  market: EuroOffseasonMarket,
): EuroOffseasonMarketProgress | null {
  if (!currentDate) return null;
  const date = parseGameDate(currentDate);
  if (Number.isNaN(date.getTime())) return null;
  const todayIso = date.toISOString().slice(0, 10);
  const { startIso, closeIso, nextIso } = marketDates(date.getUTCFullYear(), market);
  if (todayIso < startIso || todayIso > closeIso) return null;
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const close = new Date(`${closeIso}T00:00:00Z`).getTime();
  const today = new Date(`${todayIso}T00:00:00Z`).getTime();
  const total = Math.round((close - start) / DAY_MS) + 1;
  const current = Math.round((today - start) / DAY_MS) + 1;
  return { current, total, isLast: current >= total, todayIso, startIso, closeIso, nextIso };
}
