import type { EndesaSourcePlayer, EndesaSourceStat } from './types';

export function getEndesaRegularSeasonRows(
  player: EndesaSourcePlayer,
  sourceSeason?: number,
): EndesaSourceStat[] {
  return (player.stats ?? []).filter(stat => (
    stat.playoffs !== true
    && stat.tid >= 0
    && (sourceSeason == null || stat.season === sourceSeason)
  ));
}

export function selectCanonicalEndesaRegularSeasonRow(
  player: EndesaSourcePlayer,
  sourceSeason: number,
): EndesaSourceStat | null {
  const ranked = getEndesaRegularSeasonRows(player, sourceSeason)
    .map((row, index) => ({ row, index }))
    .sort((left, right) => (
      Number(right.row.gp ?? 0) - Number(left.row.gp ?? 0)
      || Number(right.row.min ?? 0) - Number(left.row.min ?? 0)
      || Number(right.row.gs ?? 0) - Number(left.row.gs ?? 0)
      || left.row.tid - right.row.tid
      || left.index - right.index
    ));
  return ranked[0]?.row ?? null;
}
