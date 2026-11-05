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

export function normalizePositionLabel(value: unknown, heightIn?: number): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '?' || raw === '—') {
    if (Number.isFinite(heightIn)) {
      if ((heightIn ?? 0) >= 82) return 'C';
      if ((heightIn ?? 0) >= 78) return 'F';
    }
    return 'G';
  }

  const canonical = raw.toUpperCase().replace(/\s+/g, '');
  if (['PG', 'G', 'SG', 'GF', 'SF', 'F', 'PF', 'FC', 'C'].includes(canonical)) return canonical;

  const tokens = canonical.split(/[^A-Z]+/).filter(Boolean);
  if (tokens.length === 0) return raw;
  const has = (token: string) => tokens.includes(token);
  if (has('C') && (has('PF') || has('F'))) return 'FC';
  if (has('PG') && has('SG') && tokens.every(token => token === 'PG' || token === 'SG')) return 'G';
  if ((has('SG') || has('G') || has('PG')) && (has('SF') || has('F'))) return 'GF';
  if ((has('SF') || has('PF')) && tokens.every(token => token === 'SF' || token === 'PF' || token === 'F')) return 'F';
  if (tokens.length === 1 && ['PG', 'G', 'SG', 'GF', 'SF', 'F', 'PF', 'FC', 'C'].includes(tokens[0])) return tokens[0];
  return tokens.join('/');
}

export type CompactPositionLabel = 'PG' | 'G' | 'GF' | 'F' | 'FC';

export function normalizeCompactPositionLabel(value: unknown, heightIn?: number): CompactPositionLabel {
  const normalized = normalizePositionLabel(value, heightIn);
  if (normalized === 'PG') return 'PG';
  if (normalized === 'G' || normalized === 'SG') return 'G';
  if (normalized === 'GF') return 'GF';
  if (normalized === 'F' || normalized === 'SF' || normalized === 'PF') return 'F';
  return 'FC';
}

export type FictionalPositionLabel = 'G' | 'SG' | 'F' | 'FC' | 'C';

export function normalizeFictionalPositionLabel(value: unknown, heightIn?: number): FictionalPositionLabel {
  const normalized = normalizePositionLabel(value, heightIn);
  if (normalized === 'PG' || normalized === 'G') return 'G';
  if (normalized === 'SG' || normalized === 'GF') return 'SG';
  if (normalized === 'FC') return 'FC';
  if (normalized === 'C') return 'C';
  return 'F';
}
