/**
 * bustLottery.ts
 *
 * "The Cruel Lottery" — annual negative event system. Fires Oct 1.
 *
 * THREE TIERS (all gradual — trickle in over the season, forced complete on graduationDate):
 *
 *   SOPHOMORE SLUMP    (ages 20–22)  → 20 picks (14 NBA, 6 outside)
 *   UNFULFILLED POT    (ages 22–27)  → 30 picks (21 NBA, 9 outside)
 *   CONTRACT HANGOVER  (ages 24–30)  → 30 picks (21 NBA, 9 outside)
 *
 * All 14 BBGM attrs drop (hgt excluded). Same pct-based approach as lightning strikes.
 * Bust is GRADUAL — drops trickle in daily from bustDate → graduationDate,
 * then force-applied in full on graduation day.
 * Injuries, trades, overseas moves — NONE of it stops it. It always resolves.
 *
 * 70% of picks are NBA players, 30% outside (FA + leagues).
 * Deterministic: same save + year = same players, same dates.
 */

import { NBAPlayer } from '../../types';
import { calculatePlayerOverallForYear } from '../../utils/playerRatings';
import { calculateLeagueOverall } from '../logic/leagueOvr';

const EXTERNAL_LEAGUE_STATUSES = new Set([
  'G-League', 'PBA', 'Euroleague', 'B-League', 'Endesa',
]);

function isNBAActive(p: NBAPlayer): boolean {
  const s = p.status ?? 'Active';
  return s !== 'Free Agent' && !EXTERNAL_LEAGUE_STATUSES.has(s) && s !== 'WNBA'
      && s !== 'Draft Prospect' && s !== 'Prospect' && s !== 'Retired';
}

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
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

// ─── Attr pool + max drops ────────────────────────────────────────────────────

// All 14 BBGM attrs — hgt excluded
const ALL_BUST_ATTRS = [
  'stre', 'spd', 'jmp', 'endu',
  'ins', 'dnk', 'ft', 'fg', 'tp',
  'oiq', 'diq', 'drb', 'pss', 'reb',
] as const;

export type BustType = 'sophomore_slump' | 'unfulfilled_potential' | 'contract_hangover';

// Max drop per attr by tier — light nudges on top of normal progression.
// Think Clingan -4 OVR from calcBaseChange; this is the extra subtle drag.
// pct [0.05, 0.95] scales these per-player, same as lightning strikes.
function maxDropForAttr(attr: string, type: BustType): number {
  const isPhys = ['spd', 'jmp', 'endu', 'stre'].includes(attr);
  if (type === 'sophomore_slump')       return isPhys ? 6 : 4;
  if (type === 'unfulfilled_potential') return isPhys ? 5 : 4;
  return /* contract_hangover */          isPhys ? 7 : 4;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PendingBustEvent {
  bustDate: string;       // when trickle begins
  graduationDate: string; // forced completion by this date
  year: number;
  type: BustType;
  age: number;
  ovrBefore: number;
  drops: { attr: string; delta: number }[];  // total intended drop per attr
  applied: Record<string, number>;           // running negative sum already applied
}

export interface BustResolvedEvent {
  playerId: string;
  playerName: string;
  age: number;
  type: BustType;
  bustDate: string;
  drops: { attr: string; delta: number }[];
  ovrBefore: number;
  ovrAfter: number;
}

// ─── MARK phase ───────────────────────────────────────────────────────────────

export function markBustLottery(
  players: NBAPlayer[],
  currentYear: number,
  seasonStart: string,
  seasonEnd: string,
  saveSeed: string = 'default',
): { players: NBAPlayer[]; markedCount: number } {
  const startMs   = new Date(seasonStart).getTime();
  const endMs     = new Date(seasonEnd).getTime();
  const totalDays = Math.round((endMs - startMs) / 86_400_000);
  const seasonEndMs = new Date(`${currentYear}-03-31`).getTime();

  const playerMap = new Map<string, NBAPlayer>(players.map(p => [p.internalId, p]));
  let markedCount = 0;

  const tiers: Array<{
    type: BustType;
    minAge: number;
    maxAge: number;
    nbaPicks: number;
    extPicks: number;
    weight: (p: NBAPlayer) => number;
  }> = [
    {
      type: 'sophomore_slump',
      minAge: 20, maxAge: 22,
      nbaPicks: 14, extPicks: 6,
      // Higher OVR = more expectations = more noticeable slump
      weight: p => Math.pow((p.overallRating ?? 60) / 99, 2.0),
    },
    {
      type: 'unfulfilled_potential',
      minAge: 22, maxAge: 27,
      nbaPicks: 21, extPicks: 9,
      // Wider POT–OVR gap = more bust candidate (Brandon Jennings / MarShon Brooks)
      weight: p => {
        const lastRating = (p as any).ratings?.[(p as any).ratings.length - 1];
        const pot: number = lastRating?.pot ?? 70;
        const ovr = p.overallRating ?? 60;
        return Math.pow(Math.max(0, pot - ovr) + 1, 1.5);
      },
    },
    {
      type: 'contract_hangover',
      minAge: 24, maxAge: 30,
      nbaPicks: 21, extPicks: 9,
      // Higher contract = higher hangover risk (Parsons/Mozgov/Chandler tier)
      weight: p => {
        const salary = (p as any).contract?.amount ?? 5_000_000;
        return Math.pow(Math.min(salary / 10_000_000, 5), 1.2);
      },
    },
  ];

  const eligible = players.filter(p => {
    if (!p.ratings || p.ratings.length === 0) return false;
    if (p.status === 'Retired' || (p as any).diedYear) return false;
    if (p.status === 'Draft Prospect' || p.status === 'Prospect') return false;
    if (p.status === 'WNBA') return false;
    if ((p as any).pendingBustEvent) return false; // already marked this year
    return true;
  });

  for (const tier of tiers) {
    const forTier = eligible.filter(p => {
      const age = (p as any).age ?? ((p as any).born?.year ? currentYear - (p as any).born.year : 25);
      return age >= tier.minAge && age <= tier.maxAge;
    });
    if (forTier.length === 0) continue;

    const nbaPool = forTier.filter(isNBAActive);
    const extPool = forTier.filter(p => !isNBAActive(p));

    const nbaPicks = weightedPickN(
      nbaPool.map(tier.weight),
      Math.min(tier.nbaPicks, nbaPool.length),
      `bust-${tier.type}-${saveSeed}-${currentYear}-nba`,
    );
    const extPicks = weightedPickN(
      extPool.map(tier.weight),
      Math.min(tier.extPicks, extPool.length),
      `bust-${tier.type}-${saveSeed}-${currentYear}-ext`,
    );

    const allPicks: Array<{ pool: NBAPlayer[]; idx: number }> = [
      ...nbaPicks.map(idx => ({ pool: nbaPool, idx })),
      ...extPicks.map(idx => ({ pool: extPool, idx })),
    ];

    for (const { pool, idx } of allPicks) {
      const player = pool[idx];
      const pid    = player.internalId ?? player.name;
      const age    = (player as any).age ?? ((player as any).born?.year ? currentYear - (player as any).born.year : 25);
      const pSeed  = `bust-${saveSeed}-${currentYear}-${pid}`;

      // Bust start date: random anywhere in season window
      const dayOffset = seededInt(`${pSeed}-day`, 0, totalDays - 1);
      const bustDate  = addDays(seasonStart, dayOffset);

      // Graduation date: bustDate+30 → Mar 31 (always resolves before season ends)
      const earliest    = new Date(bustDate);
      earliest.setDate(earliest.getDate() + 30);
      const earliestMs  = Math.min(earliest.getTime(), seasonEndMs - 1);
      const window      = Math.max(0, seasonEndMs - earliestMs);
      const gradOffset  = Math.round(seededRand(`${pSeed}-grad-day`) * window / 86_400_000);
      const graduationDate = addDays(earliest.toISOString().slice(0, 10), gradOffset);

      // Precompute all 14 attr drops
      const ratingIdx = (() => {
        const i = (player.ratings as any[]).findIndex((r: any) => r.season === currentYear);
        return i !== -1 ? i : player.ratings.length - 1;
      })();
      const rating: any = (player.ratings as any[])[ratingIdx];

      const drops: { attr: string; delta: number }[] = [];
      for (const attr of ALL_BUST_ATTRS) {
        if (rating[attr] == null) continue;
        const pct   = 0.05 + seededRand(`${pSeed}-${attr}-pct`) * 0.90;
        const max   = maxDropForAttr(attr, tier.type);
        const delta = -Math.round(max * pct);
        if (delta >= 0) continue;
        drops.push({ attr, delta });
      }
      if (drops.length === 0) continue;

      const pending: PendingBustEvent = {
        bustDate,
        graduationDate,
        year: currentYear,
        type: tier.type,
        age,
        ovrBefore: player.overallRating ?? 60,
        drops,
        applied: {},
      };

      playerMap.set(pid, { ...player, pendingBustEvent: pending } as any);
      markedCount++;

      console.log(
        `[BustLottery MARK] ${player.name} (age ${age}) | ${tier.type} | GRADUAL ${bustDate}→${graduationDate}` +
        ` | ${drops.map(d => `${d.attr}${d.delta}`).join(', ')}`
      );
    }
  }

  return { players: players.map(p => playerMap.get(p.internalId) ?? p), markedCount };
}

// ─── RESOLVE phase (daily, gradual) ──────────────────────────────────────────

/**
 * Call every sim day.
 * Trickles drops in proportionally from bustDate → graduationDate.
 * Force-applies remainder on graduation day.
 * Injuries, trades, status changes — NONE of it stops it. It always resolves.
 */
export function resolveBustLottery(
  players: NBAPlayer[],
  currentDate: string,
  currentYear: number,
): { players: NBAPlayer[]; events: BustResolvedEvent[] } {
  const events: BustResolvedEvent[] = [];
  let changed = false;

  const result = players.map(player => {
    const pending = (player as any).pendingBustEvent as PendingBustEvent | undefined;
    if (!pending) return player;
    if (pending.bustDate > currentDate) return player;   // not started yet
    if (pending.year !== currentYear) return player;      // stale from prev season

    const ratingIdx = (() => {
      const i = (player.ratings as any[]).findIndex((r: any) => r.season === currentYear);
      return i !== -1 ? i : player.ratings.length - 1;
    })();
    const rating: any = { ...(player.ratings as any[])[ratingIdx] };

    const startMs   = new Date(pending.bustDate).getTime();
    const endMs     = new Date(pending.graduationDate).getTime();
    const nowMs     = new Date(currentDate).getTime();
    const totalDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));
    const elapsed   = Math.min(Math.round((nowMs - startMs) / 86_400_000), totalDays);
    const fraction  = elapsed / totalDays;
    const isDone    = currentDate >= pending.graduationDate;

    const alreadyApplied: Record<string, number> = pending.applied ?? {};
    const deltaThisTick: { attr: string; delta: number }[] = [];

    for (const { attr, delta } of pending.drops) {
      if (rating[attr] == null) continue;
      const soFar   = alreadyApplied[attr] ?? 0;
      // On graduation day apply full remainder; otherwise proportional target
      const target  = isDone ? delta : Math.round(delta * fraction);
      const toApply = target - soFar; // negative number
      if (toApply >= 0) continue;    // nothing left for this attr today
      rating[attr] = Math.max(20, rating[attr] + toApply);
      alreadyApplied[attr] = soFar + toApply;
      deltaThisTick.push({ attr, delta: toApply });
    }

    if (deltaThisTick.length === 0 && !isDone) return player; // nothing new today

    const newRatings = (player.ratings as any[]).map((r: any, i: number) =>
      i === ratingIdx ? rating : r
    );
    const updated: NBAPlayer = { ...player, ratings: newRatings };

    if (isDone) {
      delete (updated as any).pendingBustEvent;
    } else {
      (updated as any).pendingBustEvent = { ...pending, applied: alreadyApplied };
    }

    updated.overallRating = EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')
      ? calculateLeagueOverall(rating)
      : calculatePlayerOverallForYear(updated, currentYear);

    if (isDone) {
      const ovrAfter = updated.overallRating ?? pending.ovrBefore;
      events.push({
        playerId: player.internalId,
        playerName: player.name,
        age: pending.age,
        type: pending.type,
        bustDate: pending.bustDate,
        drops: pending.drops,
        ovrBefore: pending.ovrBefore,
        ovrAfter,
      });
      console.log(
        `[BustLottery DONE] ${player.name} (${pending.type}) | OVR ${pending.ovrBefore} → ${ovrAfter}`
      );
    }

    changed = true;
    return updated;
  });

  return { players: changed ? result : players, events };
}
