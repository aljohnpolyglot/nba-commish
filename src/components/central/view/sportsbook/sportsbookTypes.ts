/* ─── Types ─────────────────────────────────────────────────── */
export type BetTab = 'lines' | 'props' | 'mybets';
export type PropStat = 'pts' | 'reb' | 'ast' | 'pra';
export type SlipMode = 'single' | 'parlay';

export interface SlipLeg {
  id: string;
  gameId?: number;
  playerId?: string;
  description: string;
  subDescription?: string;
  odds: number;
  condition: string;
  type: 'moneyline' | 'over_under' | 'spread';
}

/* ─── Pure Helpers ───────────────────────────────────────────── */
export const decimalToAmerican = (d: number): string => {
  if (d >= 2) return `+${Math.round((d - 1) * 100)}`;
  return `${Math.round(-100 / (d - 1))}`;
};

export const decimalToAmericanNum = (d: number): number => {
  if (d >= 2) return Math.round((d - 1) * 100);
  return Math.round(-100 / (d - 1));
};

export const combinedOdds = (legs: SlipLeg[]): number =>
  legs.reduce((acc, l) => acc * l.odds, 1);

export const round05 = (n: number) => Math.round(n * 2) / 2;

// Always returns a .5 line (e.g. 18.9 → 18.5, 21.1 → 21.5) to avoid push situations
export const ensureHalf = (n: number): number => Math.floor(n) + 0.5;

export const getBestStat = (stats: any[] | undefined, season: number) => {
  if (!stats?.length) return null;
  const seasonStats = stats.filter((s: any) => s.season === season && !s.playoffs);
  if (!seasonStats.length) return null;
  return seasonStats.reduce((prev: any, cur: any) => (prev.gp >= cur.gp ? prev : cur));
};

export const getTrb = (s: any): number =>
  s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0));

export const getPlayerStats = (player: any, season: number) => {
  const s = getBestStat(player?.stats, season) ?? getBestStat(player?.stats, season - 1);
  if (!s) return null;
  const gp = Math.max(s.gp || 1, 1);
  return {
    ppg: parseFloat((s.pts / gp).toFixed(1)),
    rpg: parseFloat((getTrb(s) / gp).toFixed(1)),
    apg: parseFloat((s.ast / gp).toFixed(1)),
    spg: parseFloat((s.stl / gp).toFixed(1)),
    bpg: parseFloat((s.blk / gp).toFixed(1)),
    gp,
  };
};
