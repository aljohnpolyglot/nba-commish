/**
 * trainingCampShuffle.ts
 *
 * Training camp progression shuffle — MARK at Oct 1, RESOLVE gradually Oct 1 → Oct 23.
 *
 * Each active player is randomly assigned to one of three buckets (flat 1/3 each):
 *   1/3 PROGRESS — all 14 attrs get +2 to +4 (half lightning strike power)
 *   1/3 STALE    — no change (came into camp same shape)
 *   1/3 REGRESS  — all 14 attrs get -2 to -3 ("lost a step over the summer")
 *
 * Flat 1/3 split regardless of age — age-based decline is handled by
 * Father Time, bust lottery, and washed algorithm separately.
 *
 * GRADUAL: Each player gets a seeded due date between Oct 1 → Oct 23 (pre-tipoff).
 * Changes trickle in across preseason so roster cuts are informed by training camp performance.
 *
 * Applies to ALL leagues — everyone goes through camp.
 * Deterministic: seeded by saveId + year + playerId.
 */

import { NBAPlayer } from '../../types';
import { calculatePlayerOverallForYear } from '../../utils/playerRatings';
import { calculateLeagueOverall } from '../logic/leagueOvr';

const SHUFFLE_ATTRS = [
  'stre', 'spd', 'jmp', 'endu',
  'ins', 'dnk', 'ft', 'fg', 'tp',
  'oiq', 'diq', 'drb', 'pss', 'reb',
] as const;

const EXTERNAL_STATUSES = new Set([
  'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa',
  'China CBA', 'NBL Australia', 'WNBA',
]);

// ── Seeded RNG ─────────────────────────────────────────────────────────────

function seededHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
function seededRand(seed: string): number { return (seededHash(seed) % 100000) / 100000; }

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type Bucket = 'progress' | 'stale' | 'regress';

interface PendingCampBoost {
  bucket: Bucket;
  dueDate: string;        // YYYY-MM-DD — when the change applies
  attrs: Array<{ attr: string; delta: number }>;  // what changes to make
}

/**
 * Roll the camp bucket. Neutral weighting is 1/3 each; `workEthic` (0–99,
 * neutral at 65) tilts toward progress/regress without destroying variance.
 * At 95 work ethic → ~51% progress, 30% stale, 19% regress.
 * At 35 work ethic → ~19% progress, 30% stale, 51% regress.
 * Falls back to flat 1/3 when workEthic is absent (pre-existing saves).
 */
function pickBucket(seed: string, workEthic?: number): Bucket {
  const r = seededRand(seed);
  // Tilt magnitude: delta in [-0.18, +0.18] range of probability shifted from
  // regress → progress. Stale band stays ~33%.
  const tilt = typeof workEthic === 'number'
    ? Math.max(-0.18, Math.min(0.18, (workEthic - 65) * 0.006))
    : 0;
  const progressCap = 0.333 + tilt;       // higher workEthic → progress more likely
  const staleCap    = progressCap + 0.333;
  if (r < progressCap) return 'progress';
  if (r < staleCap) return 'stale';
  return 'regress';
}

// ─── MARK PHASE (Oct 1) ──────────────────────────────────────────────────

/**
 * Mark all active players with a pending training camp boost/decline.
 * Changes are NOT applied yet — they resolve gradually via resolveTrainingCampChanges().
 *
 * @param campStart  "YYYY-MM-DD" — Oct 1
 * @param campEnd    "YYYY-MM-DD" — Oct 23 (pre-tipoff)
 */
export function markTrainingCampShuffle(
  players: NBAPlayer[],
  seasonYear: number,
  campStart: string,
  campEnd: string,
  saveSeed: string,
): { players: NBAPlayer[] } {
  const baseSeed = `${saveSeed}_camp_${seasonYear}`;
  const campDays = Math.max(1, Math.round(
    (new Date(campEnd).getTime() - new Date(campStart).getTime()) / 86_400_000
  ));

  const updatedPlayers = players.map(p => {
    if ((p as any).diedYear || p.tid === -2 || (p as any).status === 'Retired') return p;
    if (!p.ratings || p.ratings.length === 0) return p;
    // Skip if already marked this season
    if ((p as any).pendingCampBoost) return p;

    const playerSeed = `${baseSeed}_${p.internalId}`;
    const bucket = pickBucket(playerSeed, (p as any).workEthic);

    if (bucket === 'stale') return p; // no pending change needed

    // Pick due date: seeded random day within camp window
    const dayOffset = seededHash(`${playerSeed}_day`) % campDays;
    const dueDate = addDays(campStart, dayOffset);

    // Touch ALL 14 attributes (like seasonal breakouts) for real OVR impact
    const attrs: Array<{ attr: string; delta: number }> = [];
    for (const attr of SHUFFLE_ATTRS) {
      // Subtle: +2 to +4 for progress, -2 to -3 for regress (half of lightning strike power)
      let delta: number;
      if (bucket === 'progress') {
        delta = 2 + (seededHash(`${playerSeed}_${attr}_m`) % 3); // +2 to +4
      } else {
        delta = -(2 + (seededHash(`${playerSeed}_${attr}_m`) % 2)); // -2 to -3
      }
      attrs.push({ attr, delta });
    }

    // Snapshot the player's OVR going INTO camp so the autoTrim guillotine
    // doesn't cut a freshly-signed OVR 65 player who randomly regressed to OVR
    // 58 due to camp RNG. The trim's canCut reads preCampOverallRating and uses
    // the higher of pre/post-camp values for cut decisions. Cleared next year
    // when the player is re-marked.
    const boost: PendingCampBoost = { bucket, dueDate, attrs };
    return {
      ...p,
      pendingCampBoost: boost,
      preCampOverallRating: p.overallRating,
    } as any;
  });

  const marked = updatedPlayers.filter((p: any) => p.pendingCampBoost).length;
  console.log(`[TrainingCamp] Marked ${marked} players for camp shuffle (${campStart} → ${campEnd})`);

  return { players: updatedPlayers };
}

// ─── RESOLVE PHASE (daily, silent) ───────────────────────────────────────

/**
 * Resolve any pending training camp boosts whose dueDate <= today.
 * Call daily during preseason (Oct 1 → Oct 23).
 */
export function resolveTrainingCampChanges(
  players: NBAPlayer[],
  currentDate: string,
  seasonYear: number,
): { players: NBAPlayer[]; events: Array<{ playerName: string; bucket: Bucket; attr: string }> } {
  const events: Array<{ playerName: string; bucket: Bucket; attr: string }> = [];
  const dateNorm = currentDate.slice(0, 10); // normalize to YYYY-MM-DD

  const updatedPlayers = players.map(p => {
    const boost: PendingCampBoost | undefined = (p as any).pendingCampBoost;
    if (!boost) return p;
    if (boost.dueDate > dateNorm) return p; // not yet

    // Apply changes
    if (!p.ratings || p.ratings.length === 0) {
      return { ...p, pendingCampBoost: undefined } as any;
    }

    const lastIdx = p.ratings.length - 1;
    const rating = { ...p.ratings[lastIdx] };

    for (const { attr, delta } of boost.attrs) {
      const current = (rating as any)[attr] ?? 50;
      (rating as any)[attr] = Math.max(10, Math.min(99, current + delta));
      events.push({ playerName: p.name, bucket: boost.bucket, attr });
    }

    const newRatings = [...p.ratings];
    newRatings[lastIdx] = rating;

    const isExternal = EXTERNAL_STATUSES.has((p as any).status ?? '');
    const newOvr = isExternal
      ? calculateLeagueOverall(rating, (p as any).status)
      : calculatePlayerOverallForYear({ ...p, ratings: newRatings } as any, seasonYear);

    return {
      ...p,
      ratings: newRatings,
      overallRating: newOvr,
      pendingCampBoost: undefined, // consumed
    } as any;
  });

  return { players: updatedPlayers, events };
}
