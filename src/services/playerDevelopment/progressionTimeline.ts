import type { NBAPlayer } from '../../types';
import { normalizeDate } from '../../utils/helpers';

type DevelopmentPreparationAction = 'none' | 'prepare' | 'record';

type DevelopmentPreparationArgs = {
  currentDate: string;
  developmentStartDate: string;
  regularSeasonStartDate: string;
  season: number;
  preparedSeason?: number;
  players: NBAPlayer[];
};

export function getDevelopmentPreparationAction({
  currentDate,
  developmentStartDate,
  regularSeasonStartDate,
  season,
  preparedSeason,
  players,
}: DevelopmentPreparationArgs): DevelopmentPreparationAction {
  if (preparedSeason === season) return 'none';
  if (currentDate < developmentStartDate || currentDate > regularSeasonStartDate) return 'none';

  const eligible = players.filter(player => player.ratings?.length && player.status !== 'Retired');
  const evidenceCount = eligible.filter(player => {
    const candidate = player as NBAPlayer & {
      preCampOverallRating?: number;
      pendingLightningBoost?: { year?: number };
      pendingBustEvent?: { year?: number };
      pendingCampBoost?: { dueDate?: string };
      rookieCampProgressionSeason?: number;
    };
    if (Number.isFinite(candidate.preCampOverallRating)) return true;
    if (candidate.pendingLightningBoost?.year === season) return true;
    if (candidate.pendingBustEvent?.year === season) return true;
    if (candidate.rookieCampProgressionSeason === season) return true;
    if (candidate.pendingCampBoost?.dueDate
      && candidate.pendingCampBoost.dueDate >= developmentStartDate
      && candidate.pendingCampBoost.dueDate <= regularSeasonStartDate) return true;
    return candidate.ovrTimeline?.some(snapshot => snapshot.date === developmentStartDate) ?? false;
  }).length;
  const evidenceMinimum = Math.max(1, Math.ceil(eligible.length * 0.1));
  return evidenceCount >= evidenceMinimum ? 'record' : 'prepare';
}

export function appendOverallTimelineSnapshot(
  player: NBAPlayer,
  date: string,
  overall: number,
  force = false,
): NBAPlayer {
  const dateISO = normalizeDate(date);
  if (!force && new Date(`${dateISO}T00:00:00Z`).getUTCDay() !== 0) return player;
  if (!Number.isFinite(overall)) return player;
  const snapshot = { date: dateISO, ovr: overall };
  const previous = player.ovrTimeline ?? [];
  if (previous[previous.length - 1]?.date === dateISO) {
    return {
      ...player,
      ovrTimeline: previous.map(item => item.date === dateISO ? snapshot : item).slice(-56),
    };
  }
  return { ...player, ovrTimeline: [...previous, snapshot].slice(-56) };
}

export function captureDevelopmentBaseline(players: NBAPlayer[], date: string): NBAPlayer[] {
  return players.map(player => appendOverallTimelineSnapshot(
    player,
    date,
    Number(player.overallRating),
    true,
  ));
}

export interface RatingProgressionPoint {
  date: string;
  ovr: number;
  carried?: true;
}

export function alignCurrentDisplayOverall<T extends { ovr: number }>(
  points: T[],
  currentDisplayOverall: number,
): T[] {
  if (points.length === 0 || !Number.isFinite(currentDisplayOverall)) return points;
  let latestChangeIndex = points.length - 1;
  while (latestChangeIndex > 0 && points[latestChangeIndex].ovr === points[latestChangeIndex - 1].ovr) {
    latestChangeIndex -= 1;
  }
  return points.map((point, index) => index >= latestChangeIndex
    ? { ...point, ovr: currentDisplayOverall }
    : point);
}

/** Read-only chart projection. It never writes a synthetic rating event. */
export function buildRatingProgressionSeries(
  player: Pick<NBAPlayer, 'ovrTimeline'>,
  currentDate: string,
): RatingProgressionPoint[] {
  const endDate = normalizeDate(currentDate);
  const points = [...(player.ovrTimeline ?? [])]
    .filter(point => Number.isFinite(Number(point.ovr)))
    .map(point => ({ date: normalizeDate(point.date), ovr: Number(point.ovr) }))
    .filter(point => point.date <= endDate)
    .sort((left, right) => left.date.localeCompare(right.date))
    .filter((point, index, rows) => index === rows.length - 1 || point.date !== rows[index + 1].date);
  const last = points.at(-1);
  if (!last || last.date === endDate) return points;
  return [...points, { date: endDate, ovr: last.ovr, carried: true }];
}

export function resolveFatherTimeDevelopmentWindow(calendar: {
  trainingCampStart?: Date;
  preseasonStart?: Date;
  regularSeasonStart: Date;
  regularSeasonEnd?: Date;
}): { startDate: string; endDate: string } {
  const start = calendar.trainingCampStart ?? calendar.preseasonStart ?? calendar.regularSeasonStart;
  const end = new Date(calendar.regularSeasonStart.getTime() - 86_400_000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: (end < start ? start : end).toISOString().slice(0, 10),
  };
}
