import type { Game } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import type { CompetitionDayOfWeek, CompetitionSpec } from './types';

function isBlackoutDate(date: Date, spec: CompetitionSpec): boolean {
  const value = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  return (spec.blackoutPeriods ?? []).some(period => {
    const start = period.start.month * 100 + period.start.day;
    const end = period.end.month * 100 + period.end.day;
    return start <= end ? value >= start && value <= end : value >= start || value <= end;
  });
}

function nextAllowedDate(date: Date, spec: CompetitionSpec): Date {
  const cursor = new Date(date);
  const days: CompetitionDayOfWeek[] = spec.daysOfWeek?.length ? spec.daysOfWeek : ['Sat'];
  for (let attempts = 0; attempts < 14; attempts++) {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
      .format(cursor) as CompetitionDayOfWeek;
    if (days.includes(day) && !isBlackoutDate(cursor, spec)) return cursor;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor;
}

function isRegularCompetitionPhase(phase?: string): boolean {
  return !phase || phase === 'regular' || phase === 'regular-season' || phase === 'group' || phase.startsWith('r');
}

function scheduleBlockPriority(spec: CompetitionSpec, phase?: string): number {
  if (spec.format === 'knockout' || spec.format === 'tournament') return 4;
  if (!isRegularCompetitionPhase(phase)) return 3;
  if (spec.format === 'group-knockout') return 2;
  return 1;
}

export function deconflictCompetitionSchedules(schedule: Game[], specs: CompetitionSpec[]): Game[] {
  const specsById = new Map(specs.map(spec => [spec.id, spec]));
  const movable = schedule.filter(game => !game.played && game.competitionId && specsById.has(game.competitionId));
  const movableGids = new Set(movable.map(game => game.gid));
  const occupied = new Map<string, Set<number>>();
  const occupy = (date: string, games: Game[]) => {
    const key = normalizeDate(date);
    const tids = occupied.get(key) ?? new Set<number>();
    games.forEach(game => {
      tids.add(game.homeTid);
      tids.add(game.awayTid);
    });
    occupied.set(key, tids);
  };
  schedule.filter(game => !movableGids.has(game.gid)).forEach(game => occupy(game.date, [game]));

  const blocks = new Map<string, Game[]>();
  movable.forEach(game => {
    const phase = game.competitionPhase ?? 'regular';
    const fixtureScope = isRegularCompetitionPhase(phase) ? `|${game.gid}` : '';
    const key = `${game.competitionId}|${phase}|${normalizeDate(game.date)}${fixtureScope}`;
    blocks.set(key, [...(blocks.get(key) ?? []), game]);
  });
  const ordered = [...blocks.values()].sort((left, right) => {
    const dateDiff = new Date(left[0].date).getTime() - new Date(right[0].date).getTime();
    if (dateDiff !== 0) return dateDiff;
    const leftSpec = specsById.get(String(left[0].competitionId))!;
    const rightSpec = specsById.get(String(right[0].competitionId))!;
    return scheduleBlockPriority(rightSpec, right[0].competitionPhase)
      - scheduleBlockPriority(leftSpec, left[0].competitionPhase);
  });
  const movedDates = new Map<number, string>();

  ordered.forEach(games => {
    const spec = specsById.get(String(games[0].competitionId))!;
    const blockTids = new Set(games.flatMap(game => [game.homeTid, game.awayTid]));
    let candidate = new Date(games[0].date);
    for (let attempts = 0; attempts < 60; attempts++) {
      const occupiedTids = occupied.get(normalizeDate(candidate.toISOString()));
      const conflict = occupiedTids && [...blockTids].some(tid => occupiedTids.has(tid));
      if (!conflict) break;
      candidate.setUTCDate(candidate.getUTCDate() + 1);
      candidate = nextAllowedDate(candidate, spec);
    }
    const movedDate = candidate.toISOString();
    games.forEach(game => movedDates.set(game.gid, movedDate));
    occupy(movedDate, games);
  });

  return schedule
    .map(game => movedDates.has(game.gid) ? { ...game, date: movedDates.get(game.gid)! } : game)
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime() || left.gid - right.gid);
}
