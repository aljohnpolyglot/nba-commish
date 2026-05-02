import type { NBAPlayer } from '../types';

export function getCurrentTeamRegularSeasonYears(player: NBAPlayer): number {
  const currentTid = typeof player.tid === 'number' ? player.tid : -1;
  if (currentTid < 0) return 0;

  const regularSeasonYears = new Set<number>();
  for (const row of (player as any).stats ?? []) {
    if (row?.playoffs) continue;
    if ((row?.gp ?? 0) <= 0) continue;
    if (row?.tid !== currentTid) continue;
    const season = Number(row?.season);
    if (Number.isFinite(season)) regularSeasonYears.add(season);
  }

  if (regularSeasonYears.size > 0) return regularSeasonYears.size;

  const directYears = Number((player as any).yearsWithTeam ?? 0);
  return Number.isFinite(directYears) ? Math.max(0, directYears) : 0;
}

export function isFranchiseLifer(player: NBAPlayer, minYears = 10): boolean {
  return getCurrentTeamRegularSeasonYears(player) >= minYears;
}
