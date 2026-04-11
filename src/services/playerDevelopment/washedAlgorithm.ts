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

const DECLINE_TABLE: Record<string, { min: number; max: number }> = {
  spd:  { min: 2, max: 7  },
  jmp:  { min: 2, max: 10 },
  endu: { min: 2, max: 8  },
  stre: { min: 1, max: 6  },
  ins:  { min: 1, max: 4  },
  dnk:  { min: 1, max: 4  },
  ft:   { min: 1, max: 3  },
  fg:   { min: 1, max: 3  },
  tp:   { min: 1, max: 3  },
  oiq:  { min: 1, max: 3  },
  diq:  { min: 1, max: 3  },
  drb:  { min: 1, max: 2  },
  pss:  { min: 1, max: 2  },
  reb:  { min: 1, max: 3  },
};

function ageMultiplier(age: number): number {
  if (age <= 31) return 1.00;
  if (age <= 34) return 1.35;
  if (age <= 37) return 1.75;
  if (age <= 40) return 2.10;
  return 2.40;
}

function numDecliningAttrs(age: number): { min: number; max: number } {
  if (age <= 31) return { min: 4, max: 7  };
  if (age <= 34) return { min: 5, max: 9  };
  if (age <= 37) return { min: 6, max: 10 };
  if (age <= 40) return { min: 7, max: 11 };
  return          { min: 8, max: 12 };
}

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

/** Compute the pending decline changes for a player without applying them. */
function computeDeclineChanges(
  player: NBAPlayer,
  age: number,
  currentYear: number,
): { attr: string; delta: number }[] {
  const ratingIdx = getLastRatingIdx(player, currentYear);
  const rating: any = (player.ratings as any[])[ratingIdx];
  const pid = player.internalId ?? player.name;
  const mult = ageMultiplier(age);
  const nRange = numDecliningAttrs(age);
  const nAttrs = seededInt(`ft-${currentYear}-${pid}-n`, nRange.min, nRange.max);

  const allAttrs = Object.keys(DECLINE_TABLE);
  const shuffled = [...allAttrs].sort((a, b) =>
    seededRand(`ft-${currentYear}-${pid}-shuf-${a}`) -
    seededRand(`ft-${currentYear}-${pid}-shuf-${b}`)
  );

  const changes: { attr: string; delta: number }[] = [];
  for (let ai = 0; ai < nAttrs; ai++) {
    const attr = shuffled[ai];
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
): { players: NBAPlayer[]; events: FatherTimeInjectionEvent[] } {
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
    if ((p as any).pendingFatherTime) return false; // already injected
    return true;
  });

  const events: FatherTimeInjectionEvent[] = [];
  const playerMap = new Map<string, NBAPlayer>(players.map(p => [p.internalId, p]));

  for (const bracket of brackets) {
    const candidates = eligible.filter(p => {
      const age = getPlayerAge(p, currentYear);
      return age >= bracket.minAge && age <= bracket.maxAge;
    });
    if (candidates.length === 0) continue;

    // Older players have higher odds
    const weights = candidates.map(p => Math.pow(getPlayerAge(p, currentYear), 1.5));
    const picks = weightedPickN(
      weights,
      Math.min(bracket.slots, candidates.length),
      `ft-inject-${currentYear}-${bracket.minAge}`,
    );

    for (const idx of picks) {
      const player = candidates[idx];
      const age = getPlayerAge(player, currentYear);
      const ovrBefore = player.overallRating ?? 60;
      const pendingChanges = computeDeclineChanges(player, age, currentYear);
      if (pendingChanges.length === 0) continue;

      const injected: NBAPlayer = {
        ...player,
        pendingFatherTime: { changes: pendingChanges, dueDate, age, ovrBefore },
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
        `[FatherTime INJECT] ${player.name} (age ${age}) | OVR ${ovrBefore} | due ${dueDate}` +
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

// ─── Middle-class prime boost (ages 25-29, two batches) ───────────────────────

/**
 * Fires at Training Camp (batch 0) and Post All-Star (batch 1).
 * 15 players per batch = 30 total. POT^1.5-weighted. Applies immediately.
 */
export function applyMiddleClassBoosts(
  players: NBAPlayer[],
  currentYear: number,
  batch: 0 | 1,
): { players: NBAPlayer[]; events: MiddleClassBoostEvent[] } {
  const PICKS = 15;

  const candidates = players.filter(p => {
    if (!p.ratings || p.ratings.length === 0) return false;
    if (p.status === 'Retired' || (p as any).diedYear) return false;
    if (p.status === 'Draft Prospect' || p.status === 'Prospect') return false;
    const age = getPlayerAge(p, currentYear);
    return age >= 25 && age <= 29;
  });

  if (candidates.length === 0) return { players, events: [] };

  const weights = candidates.map(p => {
    const lastRating = (p as any).ratings?.[(p as any).ratings.length - 1];
    const pot: number = lastRating?.pot ?? 70;
    return Math.pow(pot, 1.5);
  });

  const picks = weightedPickN(
    weights,
    Math.min(PICKS, candidates.length),
    `mc-boost-${currentYear}-b${batch}`,
  );

  const events: MiddleClassBoostEvent[] = [];
  const playerMap = new Map<string, NBAPlayer>(players.map(p => [p.internalId, p]));
  const boostAttrs = ['spd', 'jmp', 'endu', 'stre', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'];

  for (const idx of picks) {
    const player = candidates[idx];
    const pid = player.internalId ?? player.name;
    const age = getPlayerAge(player, currentYear);
    const ratingIdx = getLastRatingIdx(player, currentYear);
    const rating: any = { ...(player.ratings as any[])[ratingIdx] };
    const ovrBefore = player.overallRating ?? 60;

    const shuffled = [...boostAttrs].sort((a, b) =>
      seededRand(`mc-${currentYear}-b${batch}-${pid}-${a}`) -
      seededRand(`mc-${currentYear}-b${batch}-${pid}-${b}`)
    );
    const nAttrs = seededInt(`mc-${currentYear}-b${batch}-${pid}-n`, 2, 4);
    const boosts: { attr: string; delta: number }[] = [];

    for (let ai = 0; ai < nAttrs; ai++) {
      const attr = shuffled[ai];
      if (rating[attr] == null) continue;
      const delta = seededInt(`mc-${currentYear}-b${batch}-${pid}-${attr}`, 2, 8);
      rating[attr] = Math.min(99, rating[attr] + delta);
      boosts.push({ attr, delta });
    }

    if (boosts.length === 0) continue;

    const newRatings = (player.ratings as any[]).map((r: any, i: number) =>
      i === ratingIdx ? rating : r
    );
    const updatedPlayer: NBAPlayer = { ...player, ratings: newRatings };
    // Boost raw BBGM attrs, then recalculate 2K OVR from those attrs
    updatedPlayer.overallRating = recomputeOvr(updatedPlayer, rating, currentYear);

    playerMap.set(player.internalId, updatedPlayer);
    events.push({
      playerId: player.internalId,
      playerName: player.name,
      age,
      batch,
      boosts,
      ovrBefore,
      ovrAfter: updatedPlayer.overallRating ?? ovrBefore,
    });

    // ── Debug log ──────────────────────────────────────────────────────────
    console.log(
      `[MiddleClassBoost B${batch}] ${player.name} (age ${age}) | OVR ${ovrBefore} → ${updatedPlayer.overallRating ?? ovrBefore}` +
      ` | ${boosts.map(b => `${b.attr}+${b.delta}`).join(', ')}`
    );
  }

  const result = players.map(p => playerMap.get(p.internalId) ?? p);
  return { players: result, events };
}
