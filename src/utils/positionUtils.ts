import type { CreatorRatingKey } from '../services/playerCreator';

/** ZenGM OLS regression (pos.basketball.ts) — trained on real NBA data. */
export function detectPositionFromRatings(r: Partial<Record<CreatorRatingKey, number>>): string {
  const POS_VALUES: [string, number][] = [
    ['PG', 0], ['G', 0.5], ['SG', 1], ['GF', 1.5],
    ['SF', 2], ['F', 2.5], ['PF', 3], ['FC', 3.5], ['C', 4],
  ];
  const v =
    -0.922949 +
    0.073339 * (r.hgt  ?? 50) +
    0.009744 * (r.stre ?? 50) -
    0.002215 * (r.spd  ?? 50) -
    0.005438 * (r.jmp  ?? 50) +
    0.003006 * (r.endu ?? 50) -
    0.003516 * (r.ins  ?? 50) -
    0.008239 * (r.dnk  ?? 50) +
    0.001647 * (r.ft   ?? 50) -
    0.001404 * (r.fg   ?? 50) -
    0.004599 * (r.tp   ?? 50) +
    0.001407 * (r.diq  ?? 50) +
    0.002433 * (r.oiq  ?? 50) -
    0.000753 * (r.drb  ?? 50) -
    0.021888 * (r.pss  ?? 50) +
    0.016867 * (r.reb  ?? 50);
  let best = 'SF', bestDiff = Infinity;
  for (const [pos, posVal] of POS_VALUES) {
    const diff = Math.abs(v - posVal);
    if (diff < bestDiff) { bestDiff = diff; best = pos; }
  }
  return best;
}

/** Maps any detected position (including hybrid codes) to one of PG/SG/SF/PF/C. */
export function positionBucket(pos: string): 'PG' | 'SG' | 'SF' | 'PF' | 'C' {
  if (pos === 'PG' || pos === 'G') return 'PG';
  if (pos === 'SG' || pos === 'GF') return 'SG';
  if (pos === 'SF' || pos === 'F') return 'SF';
  if (pos === 'PF' || pos === 'FC') return 'PF';
  return 'C';
}
