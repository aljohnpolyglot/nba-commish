import { convertTo2KRating } from '../../utils/helpers';

export interface StarPowerResult {
  /** 0..0.6 multiplicative boost — apply as (1 + boost) to sponsor offers / TV revenue. */
  boost: number;
  /** Names of stars driving the boost (top 3 by impact). */
  stars: string[];
}

interface StarAwardLike {
  type?: string;
  /** BBGM season tag — only NBA-era awards count for the "Wilkins effect". */
  season?: number;
}

interface MarqueeStatus {
  isNbaMvp: boolean;
  isNbaAllStar: boolean;
}

function classifyMarquee(p: any): MarqueeStatus {
  const awards: StarAwardLike[] = p?.awards ?? [];
  let isNbaMvp = false;
  let isNbaAllStar = false;
  for (const a of awards) {
    const t = (a?.type ?? '').toLowerCase();
    if (t === 'mvp' || t.includes('most valuable player')) isNbaMvp = true;
    if (t.includes('all-star') || t.includes('all star')) isNbaAllStar = true;
  }
  return { isNbaMvp, isNbaAllStar };
}

function playerK2(p: any): number {
  const r = p?.ratings;
  if (Array.isArray(r) && r.length > 0) {
    const latest = r[r.length - 1];
    const ovr = latest?.ovr ?? p.overallRating ?? 60;
    return convertTo2KRating(ovr, latest?.hgt ?? 50, latest?.tp ?? 50);
  }
  return convertTo2KRating(p.overallRating ?? 60, 50, 50);
}

/**
 * Detects star players on a team and returns a sponsor/TV boost multiplier.
 *
 * Tiers (Wilkins effect — NBA stars in Europe are unicorns):
 *  - NBA MVP                  → +1.50 per star (D-tier club into S-tier territory)
 *  - NBA All-Star              → +0.80 per star (signing one breaks the league)
 *  - Euroleague star (K2 80+)  → up to +0.30 per star (normal Euro top dog)
 *  - K2 75–79                  → small bump (rising star)
 *
 * Multi-star diminishing: second star half-weighted, third quarter, etc.
 * Capped at +2.50 total (LeBron + Curry + Doncic on one Euro club = unicorn).
 */
export function computeStarPower(players: any[], teamId: number): StarPowerResult {
  const roster = players.filter((p: any) => p.tid === teamId);
  const stars: Array<{ name: string; k2: number; boost: number }> = [];

  for (const p of roster) {
    const k2 = playerK2(p);
    const { isNbaMvp, isNbaAllStar } = classifyMarquee(p);

    let boost = 0;
    if (isNbaMvp) boost = 1.50;
    else if (isNbaAllStar) boost = 0.80;
    else if (k2 >= 80) boost = Math.min(0.30, (k2 - 75) / 50);
    else if (k2 >= 75) boost = 0.05;

    if (boost > 0) {
      stars.push({ name: p.name ?? 'Unknown', k2, boost });
    }
  }

  if (stars.length === 0) return { boost: 0, stars: [] };

  stars.sort((a, b) => b.boost - a.boost);
  let totalBoost = 0;
  stars.forEach((s, i) => {
    totalBoost += s.boost * Math.pow(0.5, i);
  });

  return {
    boost: Math.min(2.50, totalBoost),
    stars: stars.slice(0, 3).map(s => s.name),
  };
}
