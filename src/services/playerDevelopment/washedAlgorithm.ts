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
function getPlayerAge(player: NBAPlayer, currentYear: number): number {
  if ((player as any).born?.year) return currentYear - (player as any).born.year;
  return typeof (player as any).age === 'number' && (player as any).age > 0 ? (player as any).age : 27;
}
function getLastRatingIdx(player: NBAPlayer, currentYear: number): number {
  const i = (player.ratings as any[]).findIndex((r: any) => r.season === currentYear);
  return i !== -1 ? i : player.ratings.length - 1;
}
function recomputeOvr(player: NBAPlayer, newRating: any, currentYear: number): number {
  return EXTERNAL_LEAGUE_STATUSES.has(player.status ?? '')
    ? calculateLeagueOverall(newRating)
    : calculatePlayerOverallForYear(player, currentYear);
}
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
export function markFatherTimeInjections(
  players: NBAPlayer[],
  currentYear: number,
  injectionDate: string,
  dueDate: string,
  saveSeed: string = 'default',
  dueDateWindowStart?: string,
): { players: NBAPlayer[]; events: FatherTimeInjectionEvent[] } {
  const spreadDueDate = (playerId: string): string => {
    if (!dueDateWindowStart) return dueDate;
    const start = new Date(dueDateWindowStart).getTime();
    const end   = new Date(dueDate).getTime();
    if (end <= start) return dueDate;
    const windowMs = end - start;
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
  });
  const events: FatherTimeInjectionEvent[] = [];
  const playerMap = new Map<string, NBAPlayer>(players.map(p => [p.internalId, p]));
  for (const bracket of brackets) {
    const forBracket = eligible.filter(p => {
      const age = getPlayerAge(p, currentYear);
      return age >= bracket.minAge && age <= bracket.maxAge;
    });
    if (forBracket.length === 0) continue;
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
      console.log(
        `[FatherTime INJECT] ${player.name} (age ${age}) | OVR ${ovrBefore} | due ${playerDueDate}` +
        ` | pending: ${pendingChanges.map(c => `${c.attr}${c.delta}`).join(', ')}`
      );
    }
  }
  const result = players.map(p => playerMap.get(p.internalId) ?? p);
  return { players: result, events };
}
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
    delete (updated as any).pendingFatherTime;
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
    console.log(
      `[FatherTime RESOLVE] ${player.name} (age ${pending.age}) | OVR ${pending.ovrBefore} → ${ovrAfter}` +
      ` | applied: ${applied.map(c => `${c.attr}${c.delta}`).join(', ')}`
    );
    changed = true;
    return updated;
  });
  return { players: changed ? result : players, events };
}
const MC_BUFF_ATTRS  = ['oiq', 'diq', 'pss', 'drb', 'reb', 'ft', 'fg', 'tp', 'ins', 'endu', 'stre'] as const;
const MC_NERF_PHYS   = ['spd', 'jmp', 'endu', 'stre'] as const;
const MC_NERF_SKILL  = ['oiq', 'diq', 'pss', 'drb', 'reb', 'ft', 'fg', 'tp', 'ins', 'dnk'] as const;
export function applyMiddleClassBoosts(
  players: NBAPlayer[],
  currentYear: number,
  batch: 0 | 1,
  saveSeed: string = 'default',
): { players: NBAPlayer[]; events: MiddleClassBoostEvent[] } {
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
  const nbaBuffPicks = weightedPickN(getPotWeights(nbaCandidates), Math.min(NBA_BUFF, nbaCandidates.length), `mc-boost-${saveSeed}-${currentYear}-b${batch}-nba`);
  const extBuffPicks = weightedPickN(getPotWeights(extCandidates), Math.min(EXT_BUFF, extCandidates.length), `mc-boost-${saveSeed}-${currentYear}-b${batch}-ext`);
  const nbaBuffSet = new Set(nbaBuffPicks);
  const extBuffSet = new Set(extBuffPicks);
  const nbaNerfCandidates = nbaCandidates.filter((_, i) => !nbaBuffSet.has(i));
  const extNerfCandidates = extCandidates.filter((_, i) => !extBuffSet.has(i));
  const nbaNerfPicks = weightedPickN(getPotWeights(nbaNerfCandidates), Math.min(NBA_NERF, nbaNerfCandidates.length), `mc-nerf-${saveSeed}-${currentYear}-b${batch}-nba`);
  const extNerfPicks = weightedPickN(getPotWeights(extNerfCandidates), Math.min(EXT_NERF, extNerfCandidates.length), `mc-nerf-${saveSeed}-${currentYear}-b${batch}-ext`);
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
  for (const { candidates: pool, idx } of buffPicks) {
    const player  = pool[idx];
    const pid     = player.internalId ?? player.name;
    const age     = getPlayerAge(player, currentYear);
    const rIdx    = getLastRatingIdx(player, currentYear);
    const rating: any = { ...(player.ratings as any[])[rIdx] };
    const ovrBefore = player.overallRating ?? 60;
    const pSeed   = `mc-${saveSeed}-${currentYear}-b${batch}-${pid}`;
    const nAttrs  = seededInt(`${pSeed}-buff-n`, 3, 6);
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
  for (const { candidates: pool, idx: localIdx } of nerfPicksLocal) {
    const player  = pool[localIdx];
    const pid     = player.internalId ?? player.name;
    const age     = getPlayerAge(player, currentYear);
    const rIdx    = getLastRatingIdx(player, currentYear);
    const rating: any = { ...(player.ratings as any[])[rIdx] };
    const ovrBefore = player.overallRating ?? 60;
    const pSeed   = `mc-${saveSeed}-${currentYear}-b${batch}-${pid}`;
    const changes: { attr: string; delta: number }[] = [];
    const physMax: Record<string, number> = { spd: 5, jmp: 6, endu: 5, stre: 4 };
    for (const attr of MC_NERF_PHYS) {
      if (rating[attr] == null) continue;
      const delta = -seededInt(`${pSeed}-nerf-${attr}`, 1, physMax[attr] ?? 4);
      rating[attr] = Math.max(20, rating[attr] + delta);
      changes.push({ attr, delta });
    }
    for (const attr of MC_NERF_SKILL) {
      if (rating[attr] == null) continue;
      const r = seededRand(`${pSeed}-nerf-skill-${attr}`);
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
