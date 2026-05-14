import type { GameState } from '../../types';

export type NationalityPoolEntry = { country: string; weight: number };

const LEAGUE_TID_RANGES: Record<string, [number, number]> = {
  endesa:     [5000, 5100],
  euroleague: [1000, 1100],
  pba:        [2000, 2100],
  wnba:       [3000, 3100],
  bleague:    [4000, 4100],
  gleague:    [6000, 6100],
  chinacba:   [7000, 7100],
  nblaus:     [8000, 8100],
};

const FALLBACK_POOL: NationalityPoolEntry[] = [
  { country: 'Serbia',        weight: 0.20 },
  { country: 'Lithuania',     weight: 0.13 },
  { country: 'Greece',        weight: 0.13 },
  { country: 'Italy',         weight: 0.11 },
  { country: 'United States', weight: 0.10 },
  { country: 'Croatia',       weight: 0.08 },
  { country: 'Turkey',        weight: 0.08 },
  { country: 'France',        weight: 0.07 },
  { country: 'Slovenia',      weight: 0.05 },
  { country: 'Spain',         weight: 0.05 },
];

const cache = new Map<string, { key: string; pool: NationalityPoolEntry[] }>();

export function clearNationalityPoolCache(): void {
  cache.clear();
}

export function buildCoachNationalityPool(
  state: Pick<GameState, 'players'>,
  leagueId: string,
): NationalityPoolEntry[] {
  const range = LEAGUE_TID_RANGES[leagueId];
  if (!range) return FALLBACK_POOL;

  const players = state.players ?? [];
  const sample = players[0]?.born?.loc ?? '';
  const cacheKey = `${leagueId}-${players.length}-${sample}`;
  const cached = cache.get(leagueId);
  if (cached && cached.key === cacheKey) return cached.pool;

  const matched = players.filter(p => p.tid >= range[0] && p.tid < range[1]);
  if (matched.length < 1) {
    cache.set(leagueId, { key: cacheKey, pool: FALLBACK_POOL });
    return FALLBACK_POOL;
  }

  const counts = new Map<string, number>();
  for (const p of matched) {
    const c = p.born?.loc;
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([country, n]) => ({ country, weight: n / total }));

  const sumWeight = sorted.reduce((s, e) => s + e.weight, 0);
  const normalized = sorted.map(e => ({ country: e.country, weight: e.weight / sumWeight }));

  cache.set(leagueId, { key: cacheKey, pool: normalized });
  return normalized;
}
