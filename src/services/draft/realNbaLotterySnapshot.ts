import type { NBATeam } from '../../types';
import { computeTopKOdds, LOTTERY_PRESETS } from '../../lib/lotteryPresets';

interface RealNbaLotteryRow {
  abbrev: string;
  wins: number;
  losses: number;
  originalSeed: number;
  pick: number;
}

export interface RealNbaLotterySnapshotMetadata {
  season: number;
  version: number;
  source: 'wikipedia';
  sourceUrl: string;
  sourceRevision: string;
  sourceEventDate: string;
  displayDate: string;
}

export interface RealNbaLotteryHydration {
  results: Array<{
    pick: number;
    team: {
      id: number;
      tid: number;
      name: string;
      city: string;
      logoUrl: string;
      record: string;
      winPct: string;
      odds1st: number;
      oddsTopN: number;
      color: string;
      originalSeed: number;
    };
    change: number;
  }>;
  metadata: RealNbaLotterySnapshotMetadata;
}

const SNAPSHOT_2026: RealNbaLotteryRow[] = [
  { abbrev: 'WAS', wins: 17, losses: 65, originalSeed: 1, pick: 1 },
  { abbrev: 'IND', wins: 19, losses: 63, originalSeed: 2, pick: 5 },
  { abbrev: 'BKN', wins: 20, losses: 62, originalSeed: 3, pick: 6 },
  { abbrev: 'UTA', wins: 22, losses: 60, originalSeed: 4, pick: 2 },
  { abbrev: 'SAC', wins: 22, losses: 60, originalSeed: 5, pick: 7 },
  { abbrev: 'MEM', wins: 25, losses: 57, originalSeed: 6, pick: 3 },
  { abbrev: 'NOP', wins: 26, losses: 56, originalSeed: 7, pick: 8 },
  { abbrev: 'DAL', wins: 26, losses: 56, originalSeed: 8, pick: 9 },
  { abbrev: 'CHI', wins: 31, losses: 51, originalSeed: 9, pick: 4 },
  { abbrev: 'MIL', wins: 32, losses: 50, originalSeed: 10, pick: 10 },
  { abbrev: 'GSW', wins: 37, losses: 45, originalSeed: 11, pick: 11 },
  { abbrev: 'LAC', wins: 42, losses: 40, originalSeed: 12, pick: 12 },
  { abbrev: 'MIA', wins: 43, losses: 39, originalSeed: 13, pick: 13 },
  { abbrev: 'CHA', wins: 44, losses: 38, originalSeed: 14, pick: 14 },
];

const METADATA_2026: RealNbaLotterySnapshotMetadata = {
  season: 2026,
  version: 1,
  source: 'wikipedia',
  sourceUrl: 'https://en.wikipedia.org/wiki/2026_NBA_draft#Draft_lottery',
  sourceRevision: '1365016954',
  sourceEventDate: '2026-05-10',
  displayDate: '2026-05-14',
};

export function buildRealNbaLotteryHydration(
  season: number,
  teams: ReadonlyArray<NBATeam>,
): RealNbaLotteryHydration | undefined {
  if (season !== 2026) return undefined;
  const byAbbrev = new Map(teams.map(team => [String(team.abbrev ?? '').toUpperCase(), team]));
  if (SNAPSHOT_2026.some(row => !byAbbrev.has(row.abbrev))) return undefined;
  const preset = LOTTERY_PRESETS.nba2019;
  const results = SNAPSHOT_2026.map(row => {
    const team = byAbbrev.get(row.abbrev)!;
    const chance = preset.chances[row.originalSeed - 1] ?? 0;
    const games = row.wins + row.losses;
    return {
      pick: row.pick,
      team: {
        id: team.id,
        tid: team.id,
        name: team.name,
        city: team.region ?? team.name,
        logoUrl: team.logoUrl ?? '',
        record: `${row.wins}-${row.losses}`,
        winPct: games > 0 ? (row.wins / games).toFixed(3) : '.000',
        odds1st: Number(((chance / preset.total) * 100).toFixed(1)),
        oddsTopN: Number((computeTopKOdds(preset.chances, row.originalSeed - 1, preset.numToPick) * 100).toFixed(1)),
        color: team.colors?.[0] ?? '#333333',
        originalSeed: row.originalSeed,
      },
      change: row.originalSeed - row.pick,
    };
  }).sort((left, right) => left.pick - right.pick);
  return { results, metadata: METADATA_2026 };
}
