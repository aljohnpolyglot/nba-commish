import type { HistoricalAward, NBAPlayer } from '../types';

const WINNERS = [
  { season: 2023, name: "De'Aaron Fox", tid: 25 },
  { season: 2024, name: 'Stephen Curry', tid: 9 },
  { season: 2025, name: 'Jalen Brunson', tid: 19 },
  { season: 2026, name: 'Shai Gilgeous-Alexander', tid: 20 },
] as const;

const nameKey = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

export function getHistoricalNbaClutchAwards(maxSeason = Number.POSITIVE_INFINITY): HistoricalAward[] {
  return WINNERS
    .filter(winner => winner.season <= maxSeason)
    .map(winner => ({
      season: winner.season,
      type: 'Clutch Player of the Year',
      name: winner.name,
      tid: winner.tid,
      uiMode: 'nba',
      source: 'official-nba',
    }));
}

export function mergeHistoricalNbaClutchAwards(
  awards: HistoricalAward[] | undefined,
  maxSeason: number,
): HistoricalAward[] {
  const merged = [...(awards ?? [])];
  const existing = new Set(merged.map(award => `${award.season}|${award.type}|${nameKey(award.name)}`));
  for (const award of getHistoricalNbaClutchAwards(maxSeason)) {
    const key = `${award.season}|${award.type}|${nameKey(award.name)}`;
    if (!existing.has(key)) merged.push(award);
  }
  return merged;
}

export function applyHistoricalNbaClutchAwardsToPlayers(
  players: NBAPlayer[],
  maxSeason: number,
): NBAPlayer[] {
  const byName = new Map(getHistoricalNbaClutchAwards(maxSeason).map(award => [nameKey(award.name), award]));
  return players.map(player => {
    const award = byName.get(nameKey(player.name));
    if (!award) return player;
    const alreadyPresent = (player.awards ?? []).some(row =>
      row.season === award.season && row.type === 'Clutch Player of the Year'
    );
    return alreadyPresent
      ? player
      : { ...player, awards: [...(player.awards ?? []), { season: award.season, type: 'Clutch Player of the Year' }] };
  });
}
