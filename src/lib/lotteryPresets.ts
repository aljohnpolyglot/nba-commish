export interface LotteryPreset {
  chances: number[];
  numToPick: number;
  total: number;
  label: string;
  group: string;
}

export const LOTTERY_PRESETS: Record<string, LotteryPreset> = {
  // ── NBA Standards ──────────────────────────────────────────────────────────
  nba2019: {
    chances: [140,140,140,125,105,90,75,60,45,30,20,15,10,5],
    numToPick: 4, total: 1000,
    label: 'Modern (2019+) - Smoothed Odds',
    group: 'NBA Standards',
  },
  nba1994: {
    chances: [250,199,156,119,88,63,43,28,17,11,8,7,6,5],
    numToPick: 3, total: 1000,
    label: 'Classic (1994-2018) - Weighted Top 3 Picks',
    group: 'NBA Standards',
  },
  nba1990: {
    chances: [11,10,9,8,7,6,5,4,3,2,1],
    numToPick: 3, total: 66,
    label: 'Early Weighted (1990-1993) - Weighted Top 3 Picks',
    group: 'NBA Standards',
  },
  nba1987: {
    // 7 teams equal weight, top 3 picks drawn randomly
    chances: [1,1,1,1,1,1,1],
    numToPick: 3, total: 7,
    label: 'Early Lottery (1987-1989) - Random Top 3 Picks',
    group: 'NBA Standards',
  },
  nba1985: {
    // Full order drawn randomly from drum — all 7 non-playoff picks randomized
    chances: [1,1,1,1,1,1,1],
    numToPick: 7, total: 7,
    label: 'Original Lottery (1985-1986) - Pure Random Order',
    group: 'NBA Standards',
  },
  nba1966: {
    // Coin flip: top 2 worst teams only, #1 pick decided by flip
    chances: [1,1],
    numToPick: 1, total: 2,
    label: 'Coin Flip (1966-1984) - Top 2 Teams Battle for #1',
    group: 'NBA Standards',
  },
  // ── Other Leagues ──────────────────────────────────────────────────────────
  nhl2021: {
    chances: [185,135,115,95,85,75,65,60,50,35,30,25,20,15,5,5],
    numToPick: 2, total: 1000,
    label: 'NHL (2021+) - Weighted Top 2 Picks',
    group: 'Other Leagues',
  },
  nhl2017: {
    chances: [185,135,115,95,85,75,65,60,50,35,30,25,20,15,10],
    numToPick: 3, total: 1000,
    label: 'NHL (2017-2020) - Weighted Top 3 Picks',
    group: 'Other Leagues',
  },
  mlb2022: {
    chances: [1650,1650,1650,1325,1000,750,550,390,270,180,140,110,90,76,62,48,36,23],
    numToPick: 6, total: 10000,
    label: 'MLB (2022+) - Weighted Top 6 Picks',
    group: 'Other Leagues',
  },
};

export const DEFAULT_DRAFT_TYPE = 'nba2019';

/**
 * Exact probability that the team at `teamIndex` lands in the top `k` picks.
 *
 * Uses a recursive Plackett-Luce model: at each draw the winner is sampled
 * proportional to weight from the remaining pool. Memoised on (available-set, k)
 * so it runs in O(2^n * k) — fine for n ≤ 18, k ≤ 6.
 */
export function computeTopKOdds(chances: number[], teamIndex: number, k: number): number {
  if (k <= 0) return 0;
  if (teamIndex < 0 || teamIndex >= chances.length) return 0;
  if (k >= chances.length) return 1;

  const memo = new Map<string, number>();

  function dp(available: number[], rem: number): number {
    if (rem <= 0 || available.length === 0) return 0;
    if (!available.includes(teamIndex)) return 0;
    if (rem >= available.length) return 1;

    const key = available.join(',') + ':' + rem;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    const totalW = available.reduce((s, i) => s + (chances[i] ?? 0), 0);
    if (!totalW) { memo.set(key, 0); return 0; }

    // P(teamIndex drawn at this position) + P(some j drawn first, then teamIndex in rem-1)
    let prob = (chances[teamIndex] ?? 0) / totalW;
    for (const j of available) {
      if (j === teamIndex) continue;
      const wj = chances[j] ?? 0;
      if (!wj) continue;
      prob += (wj / totalW) * dp(available.filter(x => x !== j), rem - 1);
    }

    memo.set(key, prob);
    return prob;
  }

  return dp(
    chances.map((_, i) => i),
    k,
  );
}
