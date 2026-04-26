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
 * Real-NBA replacement-game logic: when a KO round is added, each advancing team
 * must drop one regular-season game (so totals stay at 82). Their dropped-game
 * opponents become "orphans"; we pair orphans and reschedule them as replacement
 * games near the KO round date so non-advancers also keep their 82-game count.
 *
 * Mutates and returns a new schedule.
 */
export function trimAndPairReplacements(
  schedule: Game[],
  koTeams: number[],
  replacementDate: string,            // 'YYYY-MM-DD'
  startGid: number,
): { schedule: Game[]; nextGid: number } {
  let updated = [...schedule];
  let nextGid = startGid;
  const koSet = new Set(koTeams);

  // Per-team accounting. trimCount = how many RS games were removed from this
  // team's schedule. Each KO team must end with trimCount === 1 net of replacements;
  // every other team must end with trimCount === 0 net of replacements.
  const trimCount = new Map<number, number>();
  const trimDates = new Map<number, string[]>();
  const bump = (tid: number, dateStr: string) => {
    trimCount.set(tid, (trimCount.get(tid) ?? 0) + 1);
    const arr = trimDates.get(tid) ?? [];
    arr.push(dateStr);
    trimDates.set(tid, arr);
  };

  // For each KO team that hasn't yet had a RS game trimmed, find one to drop.
  // Prefer trimming a KO-vs-KO game (both teams settled with one removal) so
  // we don't over-burden any non-KO opponent with multiple lost slots.
  const isPlainRS = (g: any) =>
    !g.played && !g.isPreseason && !g.isPlayoff && !g.isPlayIn && !g.isNBACup && !g.isExhibition;

  for (const tid of koTeams) {
    if ((trimCount.get(tid) ?? 0) >= 1) continue;

    // Pass A: prefer KO-vs-KO trim (settles both teams in one shot).
    let idx = -1;
    for (let i = updated.length - 1; i >= 0; i--) {
      const g: any = updated[i];
      if (!isPlainRS(g)) continue;
      if (g.homeTid !== tid && g.awayTid !== tid) continue;
      const opp = g.homeTid === tid ? g.awayTid : g.homeTid;
      if (koSet.has(opp) && (trimCount.get(opp) ?? 0) < 1) { idx = i; break; }
    }
    // Pass B: any latest unplayed RS game involving this team.
    if (idx < 0) {
      for (let i = updated.length - 1; i >= 0; i--) {
        const g: any = updated[i];
        if (!isPlainRS(g)) continue;
        if (g.homeTid !== tid && g.awayTid !== tid) continue;
        idx = i;
        break;
      }
    }
    if (idx < 0) continue;
    const removed: any = updated[idx];
    const opp = removed.homeTid === tid ? removed.awayTid : removed.homeTid;
    const dateStr = String(removed.date).split('T')[0];
    updated.splice(idx, 1);
    bump(tid, dateStr);
    bump(opp, dateStr);
  }

  // Build the owed-replacement list. KO teams owe (trimCount-1); everyone else owes trimCount.
  const owed: { tid: number; date: string }[] = [];
  for (const [tid, count] of trimCount.entries()) {
    const target = koSet.has(tid) ? 1 : 0;
    const need = count - target;
    const dates = trimDates.get(tid) ?? [];
    for (let k = 0; k < need; k++) {
      owed.push({ tid, date: dates[k] ?? replacementDate });
    }
  }

  const dateBusy = (dateStr: string, t1: number, t2: number): boolean => {
    return updated.some((g: any) => {
      const ds = String(g.date).split('T')[0];
      if (ds !== dateStr) return false;
      return g.homeTid === t1 || g.awayTid === t1 || g.homeTid === t2 || g.awayTid === t2;
    });
  };

  const replacementMs = new Date(`${replacementDate}T00:00:00Z`).getTime();
  const dayOffset = (n: number): string => {
    const d = new Date(replacementMs + n * 86400000);
    return d.toISOString().split('T')[0];
  };
  // Wider fallback: ±21 days around replacementDate, ordered by closeness.
  const fallbackDates: string[] = [];
  for (let n = 0; n <= 21; n++) {
    if (n === 0) fallbackDates.push(replacementDate);
    else { fallbackDates.push(dayOffset(-n)); fallbackDates.push(dayOffset(n)); }
  }

  const replacements: Game[] = [];
  const used = new Set<number>();
  for (let i = 0; i < owed.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < owed.length; j++) {
      if (used.has(j)) continue;
      if (owed[i].tid === owed[j].tid) continue;
      const candidates = [replacementDate, owed[i].date, owed[j].date, ...fallbackDates];
      const slot = candidates.find(d => !dateBusy(d, owed[i].tid, owed[j].tid));
      if (!slot) continue;
      const homeFirst = Math.random() > 0.5;
      replacements.push({
        gid: nextGid++,
        homeTid: homeFirst ? owed[i].tid : owed[j].tid,
        awayTid: homeFirst ? owed[j].tid : owed[i].tid,
        homeScore: 0,
        awayScore: 0,
        played: false,
        date: new Date(`${slot}T20:00:00Z`).toISOString(),
        isCupReplacement: true,
      } as any);
      used.add(i);
      used.add(j);
      break;
    }
  }

  if (replacements.length > 0) {
    updated = [...updated, ...replacements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }

  const totalTrims = [...trimCount.values()].reduce((a, b) => a + b, 0) / 2;
  const unmatched = owed.length - used.size;
  console.log(`[trimAndPairReplacements] trims=${totalTrims}, owed=${owed.length}, replacements=${replacements.length}${unmatched > 0 ? ` ⚠ unmatched=${unmatched}` : ''}`);
  return { schedule: updated, nextGid };
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
