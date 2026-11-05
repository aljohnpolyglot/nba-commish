import type { NBAPlayer } from '../types';

function numericJersey(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const number = Number(text);
  return number >= 0 && number <= 99 ? number : null;
}

function rowGroupKey(row: any, fallbackCompetitionId?: string, allowedCompetitionIds?: ReadonlySet<string>): string | null {
  const competitionId = String(row?.competitionId ?? fallbackCompetitionId ?? '').toLowerCase();
  const season = Number(row?.season ?? 0);
  if (!competitionId || (allowedCompetitionIds && !allowedCompetitionIds.has(competitionId))) return null;
  if (!Number.isFinite(season) || season <= 0 || row?.playoffs === true) return null;
  return `${competitionId}|${season}`;
}

function corruptedRankGroups(
  players: ReadonlyArray<{ stats?: readonly any[] }>,
  fallbackCompetitionId?: string,
  allowedCompetitionIds?: ReadonlySet<string>,
): Set<string> {
  const groups = new Map<string, number[]>();
  for (const player of players) {
    for (const row of player.stats ?? []) {
      const key = rowGroupKey(row, fallbackCompetitionId, allowedCompetitionIds);
      const number = numericJersey(row.jerseyNumber);
      if (!key || number === null) continue;
      groups.set(key, [...(groups.get(key) ?? []), number]);
    }
  }
  const corrupted = new Set<string>();
  for (const [key, numbers] of groups) {
    const unique = new Set(numbers);
    const highNumbers = numbers.filter(number => number > 55).length;
    if (numbers.length >= 40 && unique.size >= 80 && Math.max(...numbers) >= 95 && highNumbers / numbers.length >= 0.2) {
      corrupted.add(key);
    }
  }
  const corruptedCompetitions = new Set([...corrupted].map(key => key.split('|')[0]));
  return new Set([...groups.keys()].filter(key => corruptedCompetitions.has(key.split('|')[0])));
}

export function sanitizeRankDerivedJerseyHistory(
  players: readonly NBAPlayer[],
  detectionPlayers: ReadonlyArray<{ stats?: readonly any[] }> = players,
  fallbackCompetitionId?: string,
  allowedCompetitionIds?: ReadonlySet<string>,
): {
  players: NBAPlayer[];
  strippedRows: number;
  clearedPlayers: number;
  corruptedGroups: number;
} {
  const corrupted = corruptedRankGroups(detectionPlayers, fallbackCompetitionId, allowedCompetitionIds);
  if (corrupted.size === 0) return { players: [...players], strippedRows: 0, clearedPlayers: 0, corruptedGroups: 0 };
  let strippedRows = 0;
  let clearedPlayers = 0;
  const nextPlayers = players.map(player => {
    const removedNumbers = new Set<string>();
    let changed = false;
    const stats = (player.stats ?? []).map(row => {
      const key = rowGroupKey(row, fallbackCompetitionId, allowedCompetitionIds);
      if (!key || !corrupted.has(key) || numericJersey(row.jerseyNumber) === null) return row;
      removedNumbers.add(String(row.jerseyNumber));
      const { jerseyNumber: _jerseyNumber, ...rest } = row;
      strippedRows++;
      changed = true;
      return rest;
    });
    const clearCurrent = removedNumbers.has(String(player.jerseyNumber ?? ''));
    if (!changed && !clearCurrent) return player;
    if (clearCurrent) clearedPlayers++;
    return { ...player, stats, ...(clearCurrent ? { jerseyNumber: undefined } : {}) };
  });
  return { players: nextPlayers, strippedRows, clearedPlayers, corruptedGroups: corrupted.size };
}
