/**
 * washedAlgorithm.ts
 *
 * "Father Time" — annual decline injection for veterans.
 * Also handles middle-class prime boosts (ages 25-29).
 *
 * ─── TIMELINE ───────────────────────────────────────────────────────────────
 *
 * Training Camp (Oct 1) only:
 *   markFatherTimeInjections()
 *     → Selects 50 players aged 30+ via age-weighted lottery.
 *     → Stores a PENDING decline (pendingFatherTime) on each player.
 *     → Decline is NOT applied yet — Father Time has marked them.
 *     → Due date: ~6 months later (April 1 of the same season year).
 *       Narrative: "Their physical transition will complete by [date]."
 *
 *   applyMiddleClassBoosts()   [batch 0 = training camp]
 *     → 15 players aged 25-29 get a small prime-window boost, immediately.
 *
 * Post All-Star (Feb 17):
 *   applyMiddleClassBoosts()   [batch 1 = post-ASB]
 *     → 15 more players aged 25-29 get the boost, immediately.
 *
 * Daily (every sim day via simulationHandler):
 *   resolveFatherTimeInjections()
 *     → Any player whose pendingFatherTime.dueDate <= today gets their
 *       decline applied algorithmically. No escape. Father Time wins.
 *
 * ─── DECLINE CALIBRATION ────────────────────────────────────────────────────
 *
 * Physical attrs decline hardest (calibrated from BBGM observed deltas):
 *   spd:  -2 to -7    jmp:  -2 to -10   endu: -2 to -8   stre: -1 to -6
 * Shooting moderate:
 *   ins/dnk/fg/ft/tp: -1 to -4
 * Skill mildest:
 *   oiq/diq/drb/pss/reb: -1 to -3
 *
 * Age multiplier (linear accumulation, no cliff):
 *   30-31 → 1.0×   32-34 → 1.35×   35-37 → 1.75×   38-40 → 2.1×   41+ → 2.4×
 *
 * All declines are DETERMINISTIC — seeded by player id + year.
 */

import { NBAPlayer } from '../../types';
import { calculatePlayerOverallForYear } from '../../utils/playerRatings';
import { calculateLeagueOverall } from '../logic/leagueOvr';

const EXTERNAL_LEAGUE_STATUSES = new Set([
  'G-League', 'PBA', 'Euroleague', 'B-League', 'Endesa',
]);

/** NBA-active: on an NBA roster (not FA, not overseas, not WNBA/retired/prospect) */
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

// ─── BBGM-calibrated decline table ───────────────────────────────────────────

// Calibrated from BBGM samples: Sabonis (age 30) shows ft/tp/diq -5 at 1.0× multiplier
const DECLINE_TABLE: Record<string, { min: number; max: number }> = {
  spd:  { min: 2, max: 7  },
  jmp:  { min: 2, max: 10 },
  endu: { min: 2, max: 8  },
  stre: { min: 1, max: 6  },
  ins:  { min: 1, max: 5  },
  dnk:  { min: 1, max: 5  },
  ft:   { min: 1, max: 5  },
  fg:   { min: 1, max: 5  },
  tp:   { min: 1, max: 5  },
  oiq:  { min: 1, max: 5  },
  diq:  { min: 1, max: 5  },
  drb:  { min: 1, max: 4  },
  pss:  { min: 1, max: 4  },
  reb:  { min: 1, max: 5  },
};

function ageMultiplier(age: number): number {
  if (age <= 31) return 1.00;
  if (age <= 34) return 1.35;
  if (age <= 37) return 1.75;
  if (age <= 40) return 2.10;
  return 2.40;
}

// All attrs in DECLINE_TABLE decline — no subset picking (matches BBGM behavior)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPlayerAge(player: NBAPlayer, currentYear: number): number {
  return (player as any).age
    ?? ((player as any).born?.year ? currentYear - (player as any).born.year : 27);
}

function getLastRatingIdx(player: NBAPlayer, currentYear: number): number {
  const i = (player.ratings as any[]).findIndex((r: any) => r.season === currentYear);
  return i !== -1 ? i : player.ratings.length - 1;
}

/** Boost/decline raw BBGM attrs, then recalculate 2K OVR from those attrs. */
function recomputeOvr(player: NBAPlayer, newRating: any, currentYear: number): number {
  return EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')
    ? calculateLeagueOverall(newRating)
    : calculatePlayerOverallForYear(player, currentYear);
}

/** Compute the pending decline changes for a player without applying them.
 *  All attrs in DECLINE_TABLE get a decline (matches BBGM: every attr declines, just by different amounts).
 */
function computeDeclineChanges(
  player: NBAPlayer,
  age: number,
  currentYear: number,
): { attr: string; delta: number }[] {
  const ratingIdx = getLastRatingIdx(player, currentYear);
  const rating: any = (player.ratings as any[])[ratingIdx];
  const pid = player.internalId ?? player.name;
  const mult = ageMultiplier(age);

  const changes: { attr: string; delta: number }[] = [];
  for (const attr of Object.keys(DECLINE_TABLE)) {
    if (rating[attr] == null) continue;
    const range = DECLINE_TABLE[attr];
    const rawMin = Math.round(range.min * mult);
    const rawMax = Math.round(range.max * mult);
    const decline = seededInt(`ft-${currentYear}-${pid}-${attr}`, rawMin, rawMax);
    if (decline <= 0) continue;
    changes.push({ attr, delta: -decline });
  }
  return changes;
}

/** Weighted no-replacement lottery. */
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

export interface FatherTimeInjectionEvent {
  playerId: string;
  playerName: string;
  age: number;
  injectionDate: string;
  dueDate: string;
  pendingChanges: { attr: string; delta: number }[];
  ovrBefore: number;
}

export interface FatherTimeResolvedEvent {
  playerId: string;
  playerName: string;
  age: number;
  changes: { attr: string; delta: number }[];
  ovrBefore: number;
  ovrAfter: number;
}

export interface MiddleClassBoostEvent {
  playerId: string;
  playerName: string;
  age: number;
  batch: 0 | 1;
  boosts: { attr: string; delta: number }[];
  ovrBefore: number;
  ovrAfter: number;
}

// ─── Father Time: mark injections (training camp, once per year) ──────────────

/**
 * Fires at Training Camp (Oct 1).
 * Selects 50 players aged 30+ and marks them with a PENDING decline.
 * The decline is NOT applied — it will resolve automatically 6 months later.
 *
 * Age brackets:
 *   30-31 → 15 picks   32-34 → 15 picks   35-37 → 12 picks
 *   38-40 →  6 picks   41+   →  2 picks
 */
export function markFatherTimeInjections(
  players: NBAPlayer[],
  currentYear: number,
  injectionDate: string,
  dueDate: string,
  saveSeed: string = 'default',
  dueDateWindowStart?: string,
): { players: NBAPlayer[]; events: FatherTimeInjectionEvent[] } {
  // Helper: derive a per-player due date spread across [windowStart, dueDate]
  // so that 50 players don't all decline on the same calendar day.
  const spreadDueDate = (playerId: string): string => {
    if (!dueDateWindowStart) return dueDate;
    const start = new Date(dueDateWindowStart).getTime();
    const end   = new Date(dueDate).getTime();
    if (end <= start) return dueDate;
    const windowMs = end - start;
    // Deterministic hash of playerId → offset in [0, windowMs)
    let h = 0;
    for (let i = 0; i < playerId.length; i++) h = (Math.imul(31, h) + playerId.charCodeAt(i)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
    const offset = ((h ^ (h >>> 16)) >>> 0) % windowMs;
    return new Date(start + offset).toISOString().slice(0, 10);
  };
  const brackets: Array<{ minAge: number; maxAge: number; slots: number }> = [
    { minAge: 30, maxAge: 31, slots: 15 },
    { minAge: 32, maxAge: 34, slots: 15 },
    { minAge: 35, maxAge: 37, slots: 12 },
    { minAge: 38, maxAge: 40, slots:  6 },
    { minAge: 41, maxAge: 99, slots:  2 },
  ];

  const eligible = players.filter(p => {
    if (!p.ratings || p.ratings.length === 0) return false;
    if (p.status === 'Retired' || (p as any).diedYear) return false;
    if (p.status === 'Draft Prospect' || p.status === 'Prospect') return false;
    if (p.status === 'WNBA') return false; // women's league excluded
    if ((p as any).pendingFatherTime) return false; // already injected
    return true;
    // Note: FAs and overseas players ARE included — Father Time hits all men's basketball.
    // But the 70/30 bracket split below ensures NBA players get the majority of picks.
  });

  const events: FatherTimeInjectionEvent[] = [];
  const playerMap = new Map<string, NBAPlayer>(players.map(p => [p.internalId, p]));

  for (const bracket of brackets) {
    const forBracket = eligible.filter(p => {
      const age = getPlayerAge(p, currentYear);
      return age >= bracket.minAge && age <= bracket.maxAge;
    });
    if (forBracket.length === 0) continue;

    // 70% NBA, 30% outside (FA + overseas) — older players weighted higher within each pool
    const nbaPool = forBracket.filter(isNBAActive);
    const extPool = forBracket.filter(p => !isNBAActive(p));
    const nbaSlots = Math.round(bracket.slots * 0.7);
    const extSlots = bracket.slots - nbaSlots;

    const ageWeights = (pool: NBAPlayer[]) => pool.map(p => Math.pow(getPlayerAge(p, currentYear), 1.5));

    const nbaPicks = weightedPickN(ageWeights(nbaPool), Math.min(nbaSlots, nbaPool.length), `ft-inject-${saveSeed}-${currentYear}-${bracket.minAge}-nba`);
    const extPicks = weightedPickN(ageWeights(extPool), Math.min(extSlots, extPool.length), `ft-inject-${saveSeed}-${currentYear}-${bracket.minAge}-ext`);

    const allPicks: Array<{ pool: NBAPlayer[]; idx: number }> = [
      ...nbaPicks.map(idx => ({ pool: nbaPool, idx })),
      ...extPicks.map(idx => ({ pool: extPool, idx })),
    ];

    for (const { pool, idx } of allPicks) {
      const player = pool[idx];
      const age = getPlayerAge(player, currentYear);
      const ovrBefore = player.overallRating ?? 60;
      const pendingChanges = computeDeclineChanges(player, age, currentYear);
      if (pendingChanges.length === 0) continue;

      const playerDueDate = spreadDueDate(player.internalId);
      const injected: NBAPlayer = {
        ...player,
        pendingFatherTime: { changes: pendingChanges, dueDate: playerDueDate, age, ovrBefore },
      } as any;

      playerMap.set(player.internalId, injected);
      events.push({
        playerId: player.internalId,
        playerName: player.name,
        age,
        injectionDate,
        dueDate,
        pendingChanges,
        ovrBefore,
      });

      // ── Debug log ────────────────────────────────────────────────────────
      console.log(
        `[FatherTime INJECT] ${player.name} (age ${age}) | OVR ${ovrBefore} | due ${playerDueDate}` +
        ` | pending: ${pendingChanges.map(c => `${c.attr}${c.delta}`).join(', ')}`
      );
    }
  }

  const result = players.map(p => playerMap.get(p.internalId) ?? p);
  return { players: result, events };
}

// ─── Father Time: resolve due injections (runs daily) ────────────────────────

/**
 * Call every sim day. Finds any player whose pendingFatherTime.dueDate has
 * passed and applies the stored decline. No escape — Father Time always wins.
 */
export function resolveFatherTimeInjections(
  players: NBAPlayer[],
  currentDate: string,
  currentYear: number,
): { players: NBAPlayer[]; events: FatherTimeResolvedEvent[] } {
  const events: FatherTimeResolvedEvent[] = [];
  let changed = false;

  const result = players.map(player => {
    const pending = (player as any).pendingFatherTime as
      | { changes: { attr: string; delta: number }[]; dueDate: string; age: number; ovrBefore: number }
      | undefined;

    if (!pending) return player;
    if (pending.dueDate > currentDate) return player;

    // Due date reached — apply the decline
    const ratingIdx = getLastRatingIdx(player, currentYear);
    const rating: any = { ...(player.ratings as any[])[ratingIdx] };
    const applied: { attr: string; delta: number }[] = [];

    for (const { attr, delta } of pending.changes) {
      if (rating[attr] == null) continue;
      rating[attr] = Math.max(15, rating[attr] + delta); // delta is negative
      applied.push({ attr, delta });
    }

    const newRatings = (player.ratings as any[]).map((r: any, i: number) =>
      i === ratingIdx ? rating : r
    );
    const updated: NBAPlayer = { ...player, ratings: newRatings };
    // Remove the injection flag
    delete (updated as any).pendingFatherTime;

    // Boost raw BBGM attrs, then recalculate 2K OVR from those attrs
    updated.overallRating = recomputeOvr(updated, rating, currentYear);
    const ovrAfter = updated.overallRating ?? pending.ovrBefore;

    events.push({
      playerId: player.internalId,
      playerName: player.name,
      age: pending.age,
      changes: applied,
      ovrBefore: pending.ovrBefore,
      ovrAfter,
    });

    // ── Debug log ──────────────────────────────────────────────────────────
    console.log(
      `[FatherTime RESOLVE] ${player.name} (age ${pending.age}) | OVR ${pending.ovrBefore} → ${ovrAfter}` +
      ` | applied: ${applied.map(c => `${c.attr}${c.delta}`).join(', ')}`
    );

    changed = true;
    return updated;
  });

  return { players: changed ? result : players, events };
}

// ─── Middle-class prime window (ages 25-29, two batches) ─────────────────────
//
// Each batch: 30 BUFF players + 30 NERF players, POT^1.5-weighted, immediate.
// Total across season: 60 buffs + 60 nerfs.
//
// BUFF pattern (calibrated from BBGM: Sam Hauser +1→+5, Donovan Mitchell +1→+3):
//   Skill/IQ attrs (oiq, diq, pss, reb, ft, fg, tp, ins): +1 to +5 each, 3-6 attrs
//   Physical (endu, stre): small +1 to +3 occasionally
//
// NERF pattern (calibrated from BBGM: Kris Dunn — physical -1→-4, skills ±1):
//   Physical (spd, jmp, endu, stre): -1 to -4 each (legs go first)
//   Shooting/skill: random ±1 (wear-and-tear mixed with experience)
//   Endurance declines harder — BBGM shows it as the first casualty of mileage
//
// TODO(archetype): In a future pass, bias buff/nerf attr selection by player role:
//   - Defensive specialist → DIQ, stre, reb buffs prioritised
//   - Paint anchor         → ins, reb, stre; spd/jmp nerf harder
//   - Three-and-D          → tp, diq; ft, endu buff track
//   For now: BBGM flat-distribution, no archetype weighting.

// Attrs eligible for the buff pool (skill/IQ/shooting — what "gets better with reps")
const MC_BUFF_ATTRS  = ['oiq', 'diq', 'pss', 'drb', 'reb', 'ft', 'fg', 'tp', 'ins', 'endu', 'stre'] as const;
// Physical attrs that decline first in the nerf pool
const MC_NERF_PHYS   = ['spd', 'jmp', 'endu', 'stre'] as const;
// Skill/shooting attrs that wobble ±1 in the nerf pool
const MC_NERF_SKILL  = ['oiq', 'diq', 'pss', 'drb', 'reb', 'ft', 'fg', 'tp', 'ins', 'dnk'] as const;

export function applyMiddleClassBoosts(
  players: NBAPlayer[],
  currentYear: number,
  batch: 0 | 1,
  saveSeed: string = 'default',
): { players: NBAPlayer[]; events: MiddleClassBoostEvent[] } {
  // 70% NBA (28/40) + 30% outside — FAs + G-League + overseas (12/40)
  const NBA_BUFF = 28; const EXT_BUFF = 12;
  const NBA_NERF = 28; const EXT_NERF = 12;

  const isEligible = (p: NBAPlayer) => {
    if (!p.ratings || p.ratings.length === 0) return false;
    if (p.status === 'Retired' || (p as any).diedYear) return false;
    if (p.status === 'Draft Prospect' || p.status === 'Prospect') return false;
    if (p.status === 'WNBA') return false;
    const age = getPlayerAge(p, currentYear);
    return age >= 25 && age <= 29;
  };

  const allCandidates = players.filter(isEligible);
  if (allCandidates.length === 0) return { players, events: [] };

  const nbaCandidates = allCandidates.filter(isNBAActive);
  const extCandidates = allCandidates.filter(p => !isNBAActive(p));

  const getPotWeights = (pool: NBAPlayer[]) => pool.map(p => {
    const lastRating = (p as any).ratings?.[(p as any).ratings.length - 1];
    const pot: number = lastRating?.pot ?? 70;
    return Math.pow(pot, 1.5);
  });

  // ── Buff picks: 28 NBA + 12 outside ──────────────────────────────────────
  const nbaBuffPicks = weightedPickN(getPotWeights(nbaCandidates), Math.min(NBA_BUFF, nbaCandidates.length), `mc-boost-${saveSeed}-${currentYear}-b${batch}-nba`);
  const extBuffPicks = weightedPickN(getPotWeights(extCandidates), Math.min(EXT_BUFF, extCandidates.length), `mc-boost-${saveSeed}-${currentYear}-b${batch}-ext`);

  const nbaBuffSet = new Set(nbaBuffPicks);
  const extBuffSet = new Set(extBuffPicks);

  // Nerf pools: everyone not already in the buff picks for their tier
  const nbaNerfCandidates = nbaCandidates.filter((_, i) => !nbaBuffSet.has(i));
  const extNerfCandidates = extCandidates.filter((_, i) => !extBuffSet.has(i));

  const nbaNerfPicks = weightedPickN(getPotWeights(nbaNerfCandidates), Math.min(NBA_NERF, nbaNerfCandidates.length), `mc-nerf-${saveSeed}-${currentYear}-b${batch}-nba`);
  const extNerfPicks = weightedPickN(getPotWeights(extNerfCandidates), Math.min(EXT_NERF, extNerfCandidates.length), `mc-nerf-${saveSeed}-${currentYear}-b${batch}-ext`);

  // Flatten into unified buff/nerf index lists with pool reference
  const buffPicks = [
    ...nbaBuffPicks.map(i => ({ candidates: nbaCandidates, idx: i })),
    ...extBuffPicks.map(i => ({ candidates: extCandidates, idx: i })),
  ];
  const nerfPicksLocal = [
    ...nbaNerfPicks.map(i => ({ candidates: nbaNerfCandidates, idx: i })),
    ...extNerfPicks.map(i => ({ candidates: extNerfCandidates, idx: i })),
  ];

  const events: MiddleClassBoostEvent[] = [];
  const playerMap = new Map<string, NBAPlayer>(players.map(p => [p.internalId, p]));

  // ── BUFF batch ────────────────────────────────────────────────────────────
  for (const { candidates: pool, idx } of buffPicks) {
    const player  = pool[idx];
    const pid     = player.internalId ?? player.name;
    const age     = getPlayerAge(player, currentYear);
    const rIdx    = getLastRatingIdx(player, currentYear);
    const rating: any = { ...(player.ratings as any[])[rIdx] };
    const ovrBefore = player.overallRating ?? 60;
    const pSeed   = `mc-${saveSeed}-${currentYear}-b${batch}-${pid}`;

    const nAttrs  = seededInt(`${pSeed}-buff-n`, 3, 6);
    // Bias toward attrs the player already has — Zubac shouldn't get TP buffs.
    // Weight = current attr value (higher = more likely to be developed).
    // Attrs below 25 are considered non-skills and get near-zero weight.
    const buffPool = [...MC_BUFF_ATTRS].filter(a => rating[a] != null && (rating[a] as number) >= 20);
    const buffWeights = buffPool.map(a => {
      const v: number = rating[a] as number;
      return v < 25 ? 0.05 : Math.pow(v / 99, 2.0); // near-zero weight for dump attrs
    });
    const totalBuffW = buffWeights.reduce((s, w) => s + w, 0);
    const shuffled: string[] = [];
    const remaining = buffPool.map((a, i) => ({ a, w: buffWeights[i] }));
    for (let slot = 0; slot < buffPool.length; slot++) {
      const tot = remaining.reduce((s, x) => s + x.w, 0);
      if (tot <= 0) break;
      const roll = seededRand(`${pSeed}-buff-pick-${slot}`) * tot;
      let run = 0; let chosen = 0;
      for (let j = 0; j < remaining.length; j++) {
        run += remaining[j].w;
        if (roll <= run || j === remaining.length - 1) { chosen = j; break; }
      }
      shuffled.push(remaining[chosen].a);
      remaining.splice(chosen, 1);
    }
    void totalBuffW; // suppress unused warning
    const boosts: { attr: string; delta: number }[] = [];
    for (let ai = 0; ai < Math.min(nAttrs, shuffled.length); ai++) {
      const attr = shuffled[ai];
      if (rating[attr] == null) continue;
      const delta = seededInt(`${pSeed}-buff-${attr}`, 1, 5);
      rating[attr] = Math.min(99, rating[attr] + delta);
      boosts.push({ attr, delta });
    }
    if (boosts.length === 0) continue;

    const newRatings = (player.ratings as any[]).map((r: any, i: number) => i === rIdx ? rating : r);
    const up: NBAPlayer = { ...player, ratings: newRatings };
    up.overallRating = recomputeOvr(up, rating, currentYear);
    playerMap.set(player.internalId, up);
    events.push({ playerId: player.internalId, playerName: player.name, age, batch, boosts, ovrBefore, ovrAfter: up.overallRating ?? ovrBefore });
    console.log(`[MC BUFF B${batch}] ${player.name} (age ${age}) | OVR ${ovrBefore} → ${up.overallRating ?? ovrBefore} | ${boosts.map(b => `${b.attr}+${b.delta}`).join(', ')}`);
  }

  // ── NERF batch ────────────────────────────────────────────────────────────
  for (const { candidates: pool, idx: localIdx } of nerfPicksLocal) {
    const player  = pool[localIdx];
    const pid     = player.internalId ?? player.name;
    const age     = getPlayerAge(player, currentYear);
    const rIdx    = getLastRatingIdx(player, currentYear);
    const rating: any = { ...(player.ratings as any[])[rIdx] };
    const ovrBefore = player.overallRating ?? 60;
    const pSeed   = `mc-${saveSeed}-${currentYear}-b${batch}-${pid}`;

    const changes: { attr: string; delta: number }[] = [];

    // Physical: calibrated from BBGM (JJJ age 27: spd -4, jmp -6, endu -3, stre -2)
    const physMax: Record<string, number> = { spd: 5, jmp: 6, endu: 5, stre: 4 };
    for (const attr of MC_NERF_PHYS) {
      if (rating[attr] == null) continue;
      const delta = -seededInt(`${pSeed}-nerf-${attr}`, 1, physMax[attr] ?? 4);
      rating[attr] = Math.max(20, rating[attr] + delta);
      changes.push({ attr, delta });
    }

    // Skill/shooting: -1 to -4 (BBGM: JJJ shows oiq -4, ins -4, tp -4, drb -3 at age 27)
    for (const attr of MC_NERF_SKILL) {
      if (rating[attr] == null) continue;
      const r = seededRand(`${pSeed}-nerf-skill-${attr}`);
      // 50% chance of decline (-1 to -4), 35% no change, 15% slight gain (+1)
      const delta = r < 0.50 ? -seededInt(`${pSeed}-nerf-skill-${attr}-d`, 1, 4)
                  : r < 0.85 ? 0
                  : 1;
      if (delta === 0) continue;
      rating[attr] = Math.min(99, Math.max(20, rating[attr] + delta));
      changes.push({ attr, delta });
    }

    if (changes.length === 0) continue;

    const newRatings = (player.ratings as any[]).map((r: any, i: number) => i === rIdx ? rating : r);
    const up: NBAPlayer = { ...player, ratings: newRatings };
    up.overallRating = recomputeOvr(up, rating, currentYear);
    playerMap.set(player.internalId, up);
    events.push({ playerId: player.internalId, playerName: player.name, age, batch, boosts: changes, ovrBefore, ovrAfter: up.overallRating ?? ovrBefore });
    console.log(`[MC NERF B${batch}] ${player.name} (age ${age}) | OVR ${ovrBefore} → ${up.overallRating ?? ovrBefore} | ${changes.map(c => `${c.attr}${c.delta > 0 ? '+' : ''}${c.delta}`).join(', ')}`);
  }

  const result = players.map(p => playerMap.get(p.internalId) ?? p);
  return { players: result, events };
}
