/**
 * seasonalBreakouts.ts
 *
 * "Lightning strikes" — annual worldwide breakout lottery.
 *
 * MARK phase (Training Camp, Oct 1):
 *   markLightningStrikes()
 *   → Selects 60 players worldwide (ages 19-25, ~9 per age group).
 *   → Assigns each player a RANDOM strike date somewhere in the season
 *     window (Oct 1 → Apr 1 = 182 days), roughly 2 strikes per week.
 *   → Stores pendingLightningBoost on the player. NOT applied yet.
 *   → No news generated — this is silent background progression.
 *
 * RESOLVE phase (daily, silent):
 *   resolveLightningStrikes()
 *   → Any player whose pendingLightningBoost.strikeDate <= today gets
 *     their boost applied. Flag removed. No news.
 *
 * Selection: POT^1.5-weighted per age group.
 * Boost: multi-attribute, age-scaled (age 19 → max ~22, age 25 → max ~8).
 * Deterministic: same year = same players, same dates, same boosts.
 */

import { NBAPlayer } from '../../types';
import { calculatePlayerOverallForYear } from '../../utils/playerRatings';
import { calculateLeagueOverall } from '../logic/leagueOvr';

const EXTERNAL_LEAGUE_STATUSES = new Set([
  'G-League', 'PBA', 'Euroleague', 'B-League', 'Endesa',
]);

const BOOST_ATTRS = [
  'stre', 'spd', 'jmp', 'endu',
  'ins', 'dnk', 'ft', 'fg', 'tp',
  'oiq', 'diq', 'drb', 'pss', 'reb',
] as const;

// ─── Seeded RNG ────────────────────────────────────────────────────────────────

function seededHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
function seededRand(seed: string): number { return (seededHash(seed) % 100000) / 100000; }
function seededInt(seed: string, min: number, max: number): number {
  return min + (seededHash(seed) % (max - min + 1));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function maxBoostForAge(age: number): number {
  const table: Record<number, number> = {
    19: 22, 20: 20, 21: 17, 22: 14, 23: 12, 24: 10, 25: 8,
  };
  return table[age] ?? 8;
}

function weightedPickN(weights: number[], n: number, baseSeed: string): number[] {
  const pool = weights.map((w, i) => ({ w, i }));
  const picked: number[] = [];
  for (let slot = 0; slot < n; slot++) {
    if (pool.length === 0) break;
    const total = pool.reduce((s, p) => s + p.w, 0);
    if (total <= 0) break;
    const roll = seededRand(`${baseSeed}-s${slot}`) * total;
    let run = 0; let chosen = 0;
    for (let j = 0; j < pool.length; j++) {
      run += pool[j].w;
      if (roll <= run || j === pool.length - 1) { chosen = j; break; }
    }
    picked.push(pool[chosen].i);
    pool.splice(chosen, 1);
  }
  return picked;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LightningStrikeEvent {
  playerId: string;
  playerName: string;
  age: number;
  strikeDate: string;
  boosts: { attr: string; delta: number }[];
  ovrBefore: number;
  ovrAfter: number;
}

// Shape stored on player during the pending window
interface PendingLightningBoost {
  strikeDate: string;
  year: number;
  age: number;
  ovrBefore: number;
  boosts: { attr: string; delta: number }[];
}

// ─── MARK: assign strikes at Training Camp ────────────────────────────────────

/**
 * Call once at Training Camp (Oct 1).
 * Selects 60 players (9 per age group, ages 19-25) and assigns each
 * a random date in [seasonStart, seasonEnd]. No news, no immediate changes.
 *
 * @param seasonStart  e.g. "${year-1}-10-01"
 * @param seasonEnd    e.g. "${year}-04-01"
 */
export function markLightningStrikes(
  players: NBAPlayer[],
  currentYear: number,
  seasonStart: string,
  seasonEnd: string,
): { players: NBAPlayer[]; markedCount: number } {
  const AGE_GROUPS = [19, 20, 21, 22, 23, 24, 25];
  const PICKS_PER_GROUP = 9; // 9 × 7 = 63 ≈ 60 worldwide

  const startMs = new Date(seasonStart).getTime();
  const endMs   = new Date(seasonEnd).getTime();
  const totalDays = Math.round((endMs - startMs) / 86_400_000);

  const eligiblePool = players.filter(p => {
    if (!p.ratings || p.ratings.length === 0) return false;
    if (p.status === 'Retired' || (p as any).diedYear) return false;
    if (p.status === 'Draft Prospect' || p.status === 'Prospect') return false;
    if ((p as any).pendingLightningBoost) return false; // already marked
    return true;
  });

  const playerMap = new Map<string, NBAPlayer>(players.map(p => [p.internalId, p]));
  let markedCount = 0;

  for (const targetAge of AGE_GROUPS) {
    const candidates = eligiblePool.filter(p => {
      const age = (p as any).age ?? ((p as any).born?.year ? currentYear - (p as any).born.year : 25);
      return age === targetAge;
    });
    if (candidates.length === 0) continue;

    const weights = candidates.map(p => {
      const lastRating = (p as any).ratings?.[(p as any).ratings.length - 1];
      const pot: number = lastRating?.pot ?? 70;
      return Math.pow(pot, 1.5);
    });

    const picks = weightedPickN(
      weights,
      Math.min(PICKS_PER_GROUP, candidates.length),
      `ls-mark-${currentYear}-age${targetAge}`,
    );

    for (const idx of picks) {
      const player = candidates[idx];
      const pid = player.internalId ?? player.name;

      // Assign a random strike date spread across the season window
      const dayOffset = Math.round(seededRand(`ls-${currentYear}-${pid}-day`) * (totalDays - 1));
      const strikeDate = addDays(seasonStart, dayOffset);

      // Precompute the boost (deterministic, same as before)
      const ratingIdx = (() => {
        const i = (player.ratings as any[]).findIndex((r: any) => r.season === currentYear);
        return i !== -1 ? i : player.ratings.length - 1;
      })();
      const rating: any = (player.ratings as any[])[ratingIdx];
      const maxBoost = maxBoostForAge(targetAge);
      const numAttrs = seededInt(`ls-${currentYear}-${pid}-n`, 3, 6);
      const shuffled = [...BOOST_ATTRS].sort((a, b) =>
        seededRand(`ls-${currentYear}-${pid}-${a}`) - seededRand(`ls-${currentYear}-${pid}-${b}`)
      );

      const boosts: { attr: string; delta: number }[] = [];
      for (let ai = 0; ai < numAttrs; ai++) {
        const attr = shuffled[ai];
        if (rating[attr] == null) continue;
        const pct = 0.30 + seededRand(`ls-${currentYear}-${pid}-${attr}-pct`) * 0.70;
        const delta = Math.round(maxBoost * pct);
        if (delta <= 0) continue;
        boosts.push({ attr, delta });
      }
      if (boosts.length === 0) continue;

      const pending: PendingLightningBoost = {
        strikeDate,
        year: currentYear,
        age: targetAge,
        ovrBefore: player.overallRating ?? 60,
        boosts,
      };

      playerMap.set(pid, { ...player, pendingLightningBoost: pending } as any);
      markedCount++;

      console.log(
        `[LightningStrike MARK] ${player.name} (age ${targetAge}) | strike date: ${strikeDate}` +
        ` | ${boosts.map(b => `${b.attr}+${b.delta}`).join(', ')}`
      );
    }
  }

  return { players: players.map(p => playerMap.get(p.internalId) ?? p), markedCount };
}

// ─── RESOLVE: apply boosts when their date arrives (daily, silent) ────────────

/**
 * Call every sim day. Finds any player whose pendingLightningBoost.strikeDate
 * <= today and applies the stored boost. Silent — no news generated.
 */
export function resolveLightningStrikes(
  players: NBAPlayer[],
  currentDate: string,
  currentYear: number,
): { players: NBAPlayer[]; events: LightningStrikeEvent[] } {
  const events: LightningStrikeEvent[] = [];
  let changed = false;

  const result = players.map(player => {
    const pending = (player as any).pendingLightningBoost as PendingLightningBoost | undefined;
    if (!pending) return player;
    if (pending.strikeDate > currentDate) return player;
    if (pending.year !== currentYear) return player; // stale from prev season

    const ratingIdx = (() => {
      const i = (player.ratings as any[]).findIndex((r: any) => r.season === currentYear);
      return i !== -1 ? i : player.ratings.length - 1;
    })();
    const rating: any = { ...(player.ratings as any[])[ratingIdx] };
    const applied: { attr: string; delta: number }[] = [];

    for (const { attr, delta } of pending.boosts) {
      if (rating[attr] == null) continue;
      rating[attr] = Math.min(99, rating[attr] + delta);
      applied.push({ attr, delta });
    }

    if (applied.length === 0) return player;

    const newRatings = (player.ratings as any[]).map((r: any, i: number) =>
      i === ratingIdx ? rating : r
    );
    const updated: NBAPlayer = { ...player, ratings: newRatings };
    delete (updated as any).pendingLightningBoost;

    // Boost raw BBGM attrs, then recalculate 2K OVR from those attrs
    updated.overallRating = EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')
      ? calculateLeagueOverall(rating)
      : calculatePlayerOverallForYear(updated, currentYear);

    const ovrAfter = updated.overallRating ?? pending.ovrBefore;
    events.push({
      playerId: player.internalId,
      playerName: player.name,
      age: pending.age,
      strikeDate: pending.strikeDate,
      boosts: applied,
      ovrBefore: pending.ovrBefore,
      ovrAfter,
    });

    console.log(
      `[LightningStrike RESOLVE] ${player.name} (age ${pending.age}) | OVR ${pending.ovrBefore} → ${ovrAfter}` +
      ` | ${applied.map(b => `${b.attr}+${b.delta}`).join(', ')}`
    );

    changed = true;
    return updated;
  });

  return { players: changed ? result : players, events };
}
