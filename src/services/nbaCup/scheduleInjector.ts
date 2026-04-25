import { Game, NBACupGroup } from '../../types';
import { seededRandom, seededShuffle } from './seededRandom';

/** All Tuesday+Friday dates in the Nov 4 – Dec 2 window for a given prevYr. */
function getCupNightDates(prevYr: number): Date[] {
  const dates: Date[] = [];
  const start = new Date(`${prevYr}-11-04T00:00:00Z`);
  const end   = new Date(`${prevYr}-12-03T00:00:00Z`);
  const cur = new Date(start);
  while (cur < end) {
    const dow = cur.getUTCDay(); // 0=Sun, 2=Tue, 5=Fri
    if (dow === 2 || dow === 5) dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** Round-robin pairings for 5 teams in a group (10 matchups). */
function buildGroupPairings(group: NBACupGroup): Array<{ tid1: number; tid2: number; groupId: NBACupGroup['id'] }> {
  const pairs: Array<{ tid1: number; tid2: number; groupId: NBACupGroup['id'] }> = [];
  const ids = group.teamIds;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push({ tid1: ids[i], tid2: ids[j], groupId: group.id });
    }
  }
  return pairs;
}

/**
 * Injects 60 Cup group-stage games into the schedule array.
 * Must be called BEFORE the preScheduledPairs map is built in generateSchedule
 * so the main loop subtracts Cup games from each pair's intra-conference quota.
 *
 * Returns games array extended with Cup games, and the updated gameId counter.
 */
export function injectCupGroupGames(
  games: Game[],
  gameId: number,
  groups: NBACupGroup[],
  saveId: string,
  prevYr: number,
  scheduledDates: Record<string, Set<number>>,
  options: { excludeFromRecord?: boolean } = {},
): { games: Game[]; gameId: number } {
  const cupNights = getCupNightDates(prevYr);
  if (cupNights.length === 0) return { games, gameId };

  const allPairings = groups.flatMap(g => buildGroupPairings(g));
  const shuffled = seededShuffle(allPairings, `cup_placement_${saveId}_${prevYr}`);

  // Fallback pool: every day in the Nov 4 – Dec 2 window (not just Tue/Fri).
  // Used when no Cup Night has both teams free (common for retro-injection
  // into a pre-built RS schedule that already books most teams on Cup Nights).
  const fallbackDays: Date[] = [];
  if (cupNights.length > 0) {
    const start = cupNights[0];
    const end   = cupNights[cupNights.length - 1];
    const cur = new Date(start);
    while (cur <= end) {
      fallbackDays.push(new Date(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  let placed = 0;
  let droppedToFallback = 0;

  const tryPlace = (tid1: number, tid2: number, groupId: any, candidates: Date[], orderSeed: string, broadcasterIdx: number): boolean => {
    const order = seededShuffle(candidates.map((_, i) => i), orderSeed);
    for (const ni of order) {
      const night = candidates[ni];
      const dateStr = night.toISOString().split('T')[0];
      const busy = scheduledDates[dateStr];
      if (busy && (busy.has(tid1) || busy.has(tid2))) continue;

      if (!scheduledDates[dateStr]) scheduledDates[dateStr] = new Set();
      scheduledDates[dateStr].add(tid1);
      scheduledDates[dateStr].add(tid2);

      const homeTid = seededRandom(`cup_ha_${saveId}_${tid1}_${tid2}_${prevYr}`) > 0.5 ? tid1 : tid2;
      const awayTid = homeTid === tid1 ? tid2 : tid1;

      games.push({
        gid: gameId++,
        homeTid,
        awayTid,
        homeScore: 0,
        awayScore: 0,
        played: false,
        date: night.toISOString(),
        isNBACup: true,
        nbaCupRound: 'group',
        nbaCupGroupId: groupId,
        ...(options.excludeFromRecord ? { excludeFromRecord: true } : {}),
        broadcaster: broadcasterIdx % 2 === 0 ? 'tnt' : 'prime',
        broadcasterName: broadcasterIdx % 2 === 0 ? 'TNT' : 'Amazon Prime',
      } as any);
      return true;
    }
    return false;
  };

  for (let i = 0; i < shuffled.length; i++) {
    const { tid1, tid2, groupId } = shuffled[i];
    // First try Cup Nights (Tue/Fri preference)
    const ok = tryPlace(tid1, tid2, groupId, cupNights, `cup_night_${saveId}_${prevYr}_${tid1}_${tid2}`, i);
    if (ok) { placed++; continue; }
    // Fallback: any day in the Cup window
    const fb = tryPlace(tid1, tid2, groupId, fallbackDays, `cup_fallback_${saveId}_${prevYr}_${tid1}_${tid2}`, i);
    if (fb) { placed++; droppedToFallback++; continue; }
    // Last resort: schedule on first Cup Night anyway, accepting team double-header
    if (cupNights.length > 0) {
      const night = cupNights[i % cupNights.length];
      const dateStr = night.toISOString().split('T')[0];
      if (!scheduledDates[dateStr]) scheduledDates[dateStr] = new Set();
      scheduledDates[dateStr].add(tid1);
      scheduledDates[dateStr].add(tid2);
      const homeTid = seededRandom(`cup_ha_${saveId}_${tid1}_${tid2}_${prevYr}`) > 0.5 ? tid1 : tid2;
      games.push({
        gid: gameId++, homeTid, awayTid: homeTid === tid1 ? tid2 : tid1,
        homeScore: 0, awayScore: 0, played: false, date: night.toISOString(),
        isNBACup: true, nbaCupRound: 'group', nbaCupGroupId: groupId,
        ...(options.excludeFromRecord ? { excludeFromRecord: true } : {}),
        broadcaster: i % 2 === 0 ? 'tnt' : 'prime',
        broadcasterName: i % 2 === 0 ? 'TNT' : 'Amazon Prime',
      } as any);
      placed++;
    }
  }

  if (droppedToFallback > 0) {
    console.log(`[injectCupGroupGames] ${placed}/${shuffled.length} placed (${droppedToFallback} on non-Cup-Night fallback days due to schedule conflicts)`);
  }

  return { games, gameId };
}

/**
 * Injects QF/SF/Final knockout games after group stage resolves.
 * Returns the new games to append to state.schedule.
 */
export function buildKnockoutGames(
  knockout: import('../../types').NBACupKnockoutGame[],
  existingMaxGid: number,
  prevYr: number,
): Game[] {
  const newGames: Game[] = [];
  let gid = existingMaxGid + 1;

  const dateMap: Record<string, string> = {
    QF: `${prevYr}-12-09`,
    SF: `${prevYr}-12-13`,
    Final: `${prevYr}-12-16`,
  };

  for (const ko of knockout) {
    const dateStr = dateMap[ko.round];
    if (!dateStr || ko.tid1 < 0 || ko.tid2 < 0) continue;
    newGames.push({
      gid: gid++,
      homeTid: ko.tid1,
      awayTid: ko.tid2,
      homeScore: 0,
      awayScore: 0,
      played: false,
      date: new Date(`${dateStr}T20:00:00Z`).toISOString(),
      isNBACup: true,
      nbaCupRound: ko.round,
      excludeFromRecord: !ko.countsTowardRecord,
      ...(ko.round === 'SF' || ko.round === 'Final'
        ? { city: 'Las Vegas', country: 'USA' }
        : {}),
    } as any);
    ko.gameId = gid - 1;
  }

  return newGames;
}
