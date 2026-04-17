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

// Statuses excluded from lightning strikes entirely
const NON_LIGHTNING_STATUSES = new Set([
  'WNBA', 'G-League', 'PBA', 'Euroleague', 'B-League', 'Endesa', 'China CBA', 'NBL Australia',
]);

/** NBA-active: on an NBA roster (not overseas, not FA, not retired/prospect) */
function isNBAActive(p: NBAPlayer): boolean {
  const s = p.status ?? 'Active';
  return s !== 'Free Agent' && !EXTERNAL_LEAGUE_STATUSES.has(s) && s !== 'WNBA'
      && s !== 'Draft Prospect' && s !== 'Prospect' && s !== 'Retired';
}

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
  // Lowered values: 19yo now gets max +12 instead of +23
  const table: Record<number, number> = {
    19: 14, 20: 12, 21: 10, 22: 9, 23: 8, 24: 7, 25: 6,
  };
  return table[age] ?? 5;
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
  // Gradual mode — boost trickles in daily from strikeDate → graduationDate.
  // Mirrors real life: some players click immediately; others grind into it.
  isGradual?: boolean;
  graduationDate?: string;          // deadline; remainder force-applied on this date
  applied?: Record<string, number>; // running sum already applied (gradual only)
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
  saveSeed: string = 'default',
): { players: NBAPlayer[]; markedCount: number } {
  const AGE_GROUPS = [19, 20, 21, 22, 23, 24, 25];
  // 70% NBA (7/group) + 30% outside — FAs + G-League + overseas (3/group)
  const NBA_PICKS_PER_GROUP = 7;
  const EXT_PICKS_PER_GROUP = 12;

  const startMs = new Date(seasonStart).getTime();
  const endMs   = new Date(seasonEnd).getTime();
  const totalDays = Math.round((endMs - startMs) / 86_400_000);

  const eligiblePool = players.filter(p => {
    if (!p.ratings || p.ratings.length === 0) return false;
    if (p.status === 'Retired' || (p as any).diedYear) return false;
    if (p.status === 'Draft Prospect' || p.status === 'Prospect') return false;
    if (p.status === 'WNBA') return false; // WNBA excluded from lightning strikes
    if ((p as any).pendingLightningBoost) return false; // already marked
    return true;
  });

  const getWeights = (pool: NBAPlayer[]) => pool.map(p => {
    const lastRating = (p as any).ratings?.[(p as any).ratings.length - 1];
    const pot: number = lastRating?.pot ?? 70;
    // Using a lower exponent (or no exponent) allows mid-tier prospects to occasionally breakout
    return Math.pow(pot, 1.1); 
  });

  const playerMap = new Map<string, NBAPlayer>(players.map(p => [p.internalId, p]));
  let markedCount = 0;

  for (const targetAge of AGE_GROUPS) {
    const forAge = eligiblePool.filter(p => {
      const age = (p as any).age ?? ((p as any).born?.year ? currentYear - (p as any).born.year : 25);
      return age === targetAge;
    });
    if (forAge.length === 0) continue;

    // Split into NBA (70%) and outside — FAs + G-League + overseas (30%)
    const nbaPool = forAge.filter(isNBAActive);
    const extPool = forAge.filter(p => !isNBAActive(p));

    const nbaPicks = weightedPickN(
      getWeights(nbaPool),
      Math.min(NBA_PICKS_PER_GROUP, nbaPool.length),
      `ls-mark-${saveSeed}-${currentYear}-age${targetAge}-nba`,
    );
    const extPicks = weightedPickN(
      getWeights(extPool),
      Math.min(EXT_PICKS_PER_GROUP, extPool.length),
      `ls-mark-${saveSeed}-${currentYear}-age${targetAge}-ext`,
    );

    const allPicks: Array<{ pool: NBAPlayer[]; idx: number }> = [
      ...nbaPicks.map(idx => ({ pool: nbaPool, idx })),
      ...extPicks.map(idx => ({ pool: extPool, idx })),
    ];

    for (const { pool, idx } of allPicks) {
      const player = pool[idx];
      const pid = player.internalId ?? player.name;
      const pSeed = `ls-${saveSeed}-${currentYear}-${pid}`;

      // Assign a random strike date spread across the season window
      const dayOffset = Math.round(seededRand(`${pSeed}-day`) * (totalDays - 1));
      const strikeDate = addDays(seasonStart, dayOffset);

      // Precompute the boost — all BOOST_ATTRS get a boost (like BBGM), only hgt excluded
      const ratingIdx = (() => {
        const i = (player.ratings as any[]).findIndex((r: any) => r.season === currentYear);
        return i !== -1 ? i : player.ratings.length - 1;
      })();
      const rating: any = (player.ratings as any[])[ratingIdx];
      const maxBoost = maxBoostForAge(targetAge);

      const boosts: { attr: string; delta: number }[] = [];
      for (const attr of BOOST_ATTRS) {
        if (rating[attr] == null) continue;
        // pct in [0.05, 0.95] — allows small (+1) to large boosts per attr, matching BBGM data
        const pct = 0.05 + seededRand(`${pSeed}-${attr}-pct`) * 0.90;
        const delta = Math.round(maxBoost * pct);
        if (delta <= 0) continue;
        boosts.push({ attr, delta });
      }
      if (boosts.length === 0) continue;

      // 50% immediate, 50% gradual — seeded coin flip per player
      const isGradual = seededRand(`${pSeed}-gradual`) < 0.5;

      // Gradual: graduation date is random between strikeDate+45 and Mar 31
      // (some bloom by Dec, others grind all the way to the playoff push)
      const seasonEndMs = new Date(`${currentYear}-03-31`).getTime();
      const graduationDate = isGradual ? (() => {
        const earliest = new Date(strikeDate);
        earliest.setDate(earliest.getDate() + 45);
        const earliestMs = Math.min(earliest.getTime(), seasonEndMs - 1);
        const window = Math.max(0, seasonEndMs - earliestMs);
        const gradOffset = Math.round(seededRand(`${pSeed}-grad-day`) * window / 86_400_000);
        return addDays(earliest.toISOString().slice(0, 10), gradOffset);
      })() : undefined;

      const pending: PendingLightningBoost = {
        strikeDate,
        year: currentYear,
        age: targetAge,
        ovrBefore: player.overallRating ?? 60,
        boosts,
        ...(isGradual && { isGradual: true, graduationDate, applied: {} }),
      };

      playerMap.set(pid, { ...player, pendingLightningBoost: pending } as any);
      markedCount++;

      console.log(
        `[LightningStrike MARK] ${player.name} (age ${targetAge}) | ${isGradual ? `GRADUAL ${strikeDate}→${graduationDate}` : `INSTANT ${strikeDate}`}` +
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

    // ── GRADUAL mode ─────────────────────────────────────────────────────────
    if (pending.isGradual && pending.graduationDate) {
      const startMs = new Date(pending.strikeDate).getTime();
      const endMs   = new Date(pending.graduationDate).getTime();
      const nowMs   = new Date(currentDate).getTime();
      const totalDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));
      const elapsed   = Math.min(Math.round((nowMs - startMs) / 86_400_000), totalDays);
      const fraction  = elapsed / totalDays;
      const isDone    = currentDate >= pending.graduationDate;

      const alreadyApplied: Record<string, number> = pending.applied ?? {};
      const deltaThisTick: { attr: string; delta: number }[] = [];

      for (const { attr, delta } of pending.boosts) {
        if (rating[attr] == null) continue;
        const soFar   = alreadyApplied[attr] ?? 0;
        // On graduation day apply the full remainder; otherwise proportional target
        const target  = isDone ? delta : Math.round(delta * fraction);
        const toApply = target - soFar;
        if (toApply <= 0) continue;
        rating[attr] = Math.min(99, rating[attr] + toApply);
        alreadyApplied[attr] = soFar + toApply;
        deltaThisTick.push({ attr, delta: toApply });
      }

      if (deltaThisTick.length === 0 && !isDone) return player; // nothing new today

      const newRatings = (player.ratings as any[]).map((r: any, i: number) =>
        i === ratingIdx ? rating : r
      );
      const updated: NBAPlayer = { ...player, ratings: newRatings };

      if (isDone) {
        delete (updated as any).pendingLightningBoost; // fully resolved
      } else {
        // Keep pending with updated applied counts
        (updated as any).pendingLightningBoost = { ...pending, applied: alreadyApplied };
      }

      updated.overallRating = EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')
        ? calculateLeagueOverall(rating)
        : calculatePlayerOverallForYear(updated, currentYear);

      if (isDone) {
        const ovrAfter = updated.overallRating ?? pending.ovrBefore;
        events.push({
          playerId: player.internalId, playerName: player.name, age: pending.age,
          strikeDate: pending.strikeDate, boosts: pending.boosts,
          ovrBefore: pending.ovrBefore, ovrAfter,
        });
        console.log(`[LightningStrike GRADUAL DONE] ${player.name} | OVR ${pending.ovrBefore} → ${ovrAfter}`);
      }

      changed = true;
      return updated;
    }

    // ── IMMEDIATE mode (original behaviour) ──────────────────────────────────
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

    updated.overallRating = EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')
      ? calculateLeagueOverall(rating)
      : calculatePlayerOverallForYear(updated, currentYear);

    const ovrAfter = updated.overallRating ?? pending.ovrBefore;
    events.push({
      playerId: player.internalId, playerName: player.name, age: pending.age,
      strikeDate: pending.strikeDate, boosts: applied,
      ovrBefore: pending.ovrBefore, ovrAfter,
    });

    console.log(
      `[LightningStrike INSTANT] ${player.name} (age ${pending.age}) | OVR ${pending.ovrBefore} → ${ovrAfter}` +
      ` | ${applied.map(b => `${b.attr}+${b.delta}`).join(', ')}`
    );

    changed = true;
    return updated;
  });

  return { players: changed ? result : players, events };
}
