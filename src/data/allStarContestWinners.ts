import rows from './allStarContestWinners.json';

export type AllStarContestName =
  | 'Shooting Stars'
  | 'Slam Dunk'
  | 'Three-Point Shootout'
  | 'Skills Challenge'
  | 'H-O-R-S-E';

export interface HistoricalAllStarContestWinner {
  year: number;
  league: 'NBA' | 'ABA';
  contest: AllStarContestName;
  winners: string[];
  others: string[];
}

export interface HistoricalContestSummary {
  dunk: { name: string; team: string } | null;
  three: { name: string; team: string } | null;
  shootingStars: { name: string; team: string } | null;
  skills: { name: string; team: string } | null;
  horse: { name: string; team: string } | null;
}

const contestRows = rows as HistoricalAllStarContestWinner[];

const normalizeName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const emptyHistoricalContestSummary = (): HistoricalContestSummary => ({
  dunk: null,
  three: null,
  shootingStars: null,
  skills: null,
  horse: null,
});

const contestKey = (contest: AllStarContestName): keyof HistoricalContestSummary | null => {
  if (contest === 'Slam Dunk') return 'dunk';
  if (contest === 'Three-Point Shootout') return 'three';
  if (contest === 'Shooting Stars') return 'shootingStars';
  if (contest === 'Skills Challenge') return 'skills';
  if (contest === 'H-O-R-S-E') return 'horse';
  return null;
};

export function getHistoricalAllStarContestSummary(year: number): HistoricalContestSummary {
  const summary = emptyHistoricalContestSummary();
  for (const row of contestRows) {
    if (row.year !== year) continue;
    const key = contestKey(row.contest);
    if (!key) continue;
    summary[key] = {
      name: row.winners.join(', '),
      team: row.league,
    };
  }
  return summary;
}

export function getHistoricalContestAwardsForPlayer(playerName: string, maxExclusiveSeason?: number): Array<{ season: number; type: string; source: string }> {
  const normalizedName = normalizeName(playerName);
  if (!normalizedName) return [];
  return contestRows.flatMap(row => {
    if (maxExclusiveSeason != null && row.year >= maxExclusiveSeason) return [];
    if (!row.winners.some(name => normalizeName(name) === normalizedName)) return [];
    const source = 'Basketball-Reference All-Star contests';
    if (row.contest === 'Slam Dunk') return [{ season: row.year, type: 'Slam Dunk Contest Winner', source }];
    if (row.contest === 'Three-Point Shootout') return [{ season: row.year, type: 'Three-Point Contest Winner', source }];
    if (row.contest === 'Shooting Stars') return [{ season: row.year, type: 'Shooting Stars Winner', source }];
    if (row.contest === 'Skills Challenge') return [{ season: row.year, type: 'Skills Challenge Winner', source }];
    if (row.contest === 'H-O-R-S-E') return [{ season: row.year, type: 'H-O-R-S-E Winner', source }];
    return [];
  });
}
