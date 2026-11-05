import type { NBAPlayer } from '../types';

export function getNbaYearsOfService(player: NBAPlayer, throughSeason = Number.POSITIVE_INFINITY): number {
  const seasons = new Set<number>();
  for (const row of (player.stats ?? []) as any[]) {
    const season = Number(row?.season);
    const tid = Number(row?.tid);
    if (row?.playoffs || Number(row?.gp ?? 0) <= 0) continue;
    if (!Number.isFinite(season) || season > throughSeason) continue;
    if (!Number.isFinite(tid) || tid < 0 || tid >= 100) continue;
    seasons.add(season);
  }
  return seasons.size;
}

export function isNbaTwoWayServiceEligible(player: NBAPlayer, throughSeason: number): boolean {
  return getNbaYearsOfService(player, throughSeason) <= 4;
}
