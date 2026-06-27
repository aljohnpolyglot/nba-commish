import type { GameResult } from '../../types';
import type { CompetitionSpec } from '../competition/types';

export const PBA_POSTSEASON_PHASES = new Set(['play-in', 'qf', 'sf', 'final']);

export function isPbaCompetitionId(value: unknown): boolean {
  return String(value ?? '').startsWith('pba-');
}

export function isPbaRegularPhase(phase: unknown): boolean {
  const key = String(phase ?? '').toLowerCase();
  return !key || key === 'regular' || key === 'regular-season' || key === 'group' || key.startsWith('r');
}

export function competitionSeasonForBox(spec: CompetitionSpec, box: any): number {
  const savedSeason = Number(box?.season);
  if (Number.isFinite(savedSeason) && savedSeason > 0) return savedSeason;
  const date = new Date(box?.date ?? '');
  if (Number.isNaN(date.getTime())) return 0;
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const crossesCalendarYear =
    spec.seasonStart.month > spec.seasonEnd.month ||
    (spec.seasonStart.month === spec.seasonEnd.month && spec.seasonStart.day > spec.seasonEnd.day);
  if (!crossesCalendarYear) return year;
  return month >= spec.seasonStart.month ? year + 1 : year;
}

function pbaGameSortKey(box: any): string {
  const date = new Date(box?.date ?? '');
  const iso = Number.isNaN(date.getTime()) ? '' : date.toISOString();
  const gid = Number(box?.gameId ?? box?.gid ?? 0);
  return `${iso}|${String(gid).padStart(8, '0')}`;
}

export function selectCountedPbaRegularBoxScores(
  boxScores: GameResult[] | any[] = [],
  spec: CompetitionSpec,
  season?: number,
): any[] {
  if (!isPbaCompetitionId(spec.id)) {
    return boxScores.filter((box: any) => box?.competitionId === spec.id && isPbaRegularPhase(box?.competitionPhase));
  }

  const gamesPerTeam = Math.floor(Number(spec.gamesPerTeam ?? Math.max((spec.teamCount ?? 0) - 1, 0)));
  const regular = boxScores
    .filter((box: any) =>
      box?.competitionId === spec.id &&
      isPbaRegularPhase(box?.competitionPhase) &&
      (season == null || competitionSeasonForBox(spec, box) === season),
    )
    .sort((a: any, b: any) => pbaGameSortKey(a).localeCompare(pbaGameSortKey(b)));

  const expectedTotal = Math.floor(((spec.teamCount ?? 0) * gamesPerTeam) / 2);
  const capRows = (rows: any[]): any[] => {
    if (gamesPerTeam <= 0) return rows;
    if (expectedTotal > 0 && rows.length <= expectedTotal) return rows;
    const counts = new Map<number, number>();
    const selected: any[] = [];
    for (const box of rows) {
      const homeTid = Number(box.homeTeamId);
      const awayTid = Number(box.awayTeamId);
      if (!Number.isFinite(homeTid) || !Number.isFinite(awayTid)) continue;
      if ((counts.get(homeTid) ?? 0) >= gamesPerTeam) continue;
      if ((counts.get(awayTid) ?? 0) >= gamesPerTeam) continue;
      selected.push(box);
      counts.set(homeTid, (counts.get(homeTid) ?? 0) + 1);
      counts.set(awayTid, (counts.get(awayTid) ?? 0) + 1);
      if (expectedTotal > 0 && selected.length >= expectedTotal) break;
    }
    return selected;
  };

  if (season != null) return capRows(regular);

  const bySeason = new Map<number, any[]>();
  for (const box of regular) {
    const key = competitionSeasonForBox(spec, box);
    const rows = bySeason.get(key) ?? [];
    rows.push(box);
    bySeason.set(key, rows);
  }
  return [...bySeason.values()]
    .flatMap(rows => capRows(rows))
    .sort((a: any, b: any) => pbaGameSortKey(a).localeCompare(pbaGameSortKey(b)));
}

export function pbaBoxIdentity(box: any): string {
  return `${box?.competitionId ?? ''}|${box?.season ?? ''}|${box?.date ?? ''}|${box?.gameId ?? box?.gid ?? ''}|${box?.homeTeamId ?? ''}|${box?.awayTeamId ?? ''}`;
}

export function makeCountedPbaRegularBoxSet(
  boxScores: GameResult[] | any[] = [],
  specs: CompetitionSpec[] = [],
  season?: number,
): Set<string> {
  const selected = new Set<string>();
  for (const spec of specs.filter(entry => isPbaCompetitionId(entry.id))) {
    selectCountedPbaRegularBoxScores(boxScores, spec, season).forEach(box => selected.add(pbaBoxIdentity(box)));
  }
  return selected;
}
