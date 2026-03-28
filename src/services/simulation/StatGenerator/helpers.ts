import { NBAPlayer as Player } from '../../../types';
import { PlayerGameStats } from '../types';
import { getVariance } from '../utils';

export let activeClubDebuffs: Map<string, 'heavy' | 'moderate' | 'mild'> = new Map();
export function setClubDebuffs(debuffs: Map<string, 'heavy' | 'moderate' | 'mild'>) { activeClubDebuffs = debuffs; }
export function clearClubDebuffs() { activeClubDebuffs = new Map(); }

export function getScaledRating(p: Player, key: string, season: number): number {
  if (!p.ratings || !p.ratings.length) {
    // Celebrity / exhibition mock players have no ratings array — use flat ovr fallback
    return (p as any).ovr || (p as any).rating || 50;
  }
  const rating = p.ratings.find(r => r.season === season) || p.ratings[p.ratings.length - 1];
  if (!rating) return 50;
  let val = (rating as any)[key] ?? 50;
  if (key === 'hgt') return val as number;
  if (p.status === 'Euroleague') return (val as number) * 0.733;
  if (p.status === 'PBA')        return (val as number) * 0.62;
  if (p.status === 'B-League')   return (val as number) * 0.68;
  return val as number;
}

export function R(p: Player, k: string, season: number): number {
  return getScaledRating(p, k, season);
}

export function distributePie(
  total: number,
  factorFn: (p: Player) => number,
  statKey: keyof PlayerGameStats,
  exponent: number,
  rotation: Player[],
  playerStats: PlayerGameStats[],
  varianceSd: number = 0.12
): void {
  const factors = rotation.map(p => {
    const raw = factorFn(p);
    return Math.pow(Math.max(0, raw) / 10, exponent);
  });
  const totalFactor = factors.reduce((a, b) => a + b, 0);
  if (totalFactor === 0) return;

  rotation.forEach((_, i) => {
    const share    = factors[i] / totalFactor;
    const variance = getVariance(1.0, varianceSd);
    (playerStats[i][statKey] as number) = Math.max(
      0,
      Math.round(total * share * variance)
    );
  });
}
