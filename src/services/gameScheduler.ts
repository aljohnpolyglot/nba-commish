import { NBATeam, Game, MediaRights, NBACupGroup, type LeagueCalendar, type LeagueStats } from '../types';
import { getAllStarWeekendDates } from './allStar/AllStarWeekendOrchestrator';
import { attachBroadcastersToGames } from '../utils/broadcastingUtils';
import { getNbaCupScheduleDates, injectCupGroupGames } from './nbaCup/scheduleInjector';
import { getLeagueCalendarDates } from './leagueCalendar';

export const generateSchedule = (
  teams: NBATeam[],
  christmasGames?: { homeTid: number; awayTid: number }[],
  globalGames?: { homeTid: number; awayTid: number; date: string; city: string; country: string; venue?: string }[],
  divisionGames?: number | null,
  conferenceGames?: number | null,
  mediaRights?: MediaRights | null,
  seasonYear?: number,
  cupGroups?: NBACupGroup[],
  saveId?: string,
  targetGamesPerTeam?: number | null,
  leagueCalendar?: LeagueCalendar,
  uiMode?: LeagueStats['uiMode'],
  allStarEnabled = true,
): Game[] => {
  const games: Game[] = [];
  // Derive season dates from seasonYear (e.g. 2026 → Oct 24 2025 – Apr 13 2026)
  const yr = seasonYear ?? new Date().getFullYear();
  const prevYr = yr - 1;
  // Season-stamped base so gids are unique across years in state.boxScores.
  // yr=2026 → 100000, yr=2027 → 200000, …  (All-Star specials live at 90000-90004, no collision)
  // MUST come after `const yr` — reading yr in its TDZ threw ReferenceError and
  // aborted schedule generation entirely (manifested as empty regular-season
  // schedules mid-season).
  let gameId = (yr - 2025) * 100000;

  // BUG 7 FIX: use T00:00:00Z to ensure UTC parsing
  const calendarDates = getLeagueCalendarDates(yr, { leagueCalendar, uiMode });
  const startDate = calendarDates.regularSeasonStart;
  const endDate = calendarDates.regularSeasonEnd;
  const christmasDate = [startDate.getUTCFullYear(), endDate.getUTCFullYear()]
    .map(year => new Date(Date.UTC(year, 11, 25)))
    .find(date => date >= startDate && date <= endDate);
  const christmasDateString = christmasDate?.toISOString().slice(0, 10);
  const seasonLengthDays = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const regularSeasonDayStrings = Array.from({ length: seasonLengthDays }, (_, offset) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + offset);
    return date.toISOString().split('T')[0];
  });
  const regularSeasonDayOffsets = new Map(regularSeasonDayStrings.map((date, offset) => [date, offset]));
  const shiftedDateCache = new Map<string, string>();
  const parsedGameTimes = new Map<string, number>();

  const targetRegularGames = Math.max(1, Math.round(Number(targetGamesPerTeam ?? 82) || 82));
  const useBalancedTargetSchedule = targetRegularGames !== 82 || teams.length !== 30;
  const regularRestGapDays = calendarDates.calendar.minimumRestDaysBetweenGames ?? (targetRegularGames <= 82 ? 1 : 0);

  // Pre-sort teams by conference for deterministic 82-game schedule:
  // Same-conference: 14 × 3 = 42 games
  // Cross-conference: 10 opponents × 3 + 5 opponents × 2 = 40 games  → total 82
  const eastTeams = [...teams.filter(t => t.conference === 'East')].sort((a, b) => a.id - b.id);
  const westTeams = [...teams.filter(t => t.conference === 'West')].sort((a, b) => a.id - b.id);
  const confIdx = new Map<number, number>();
  eastTeams.forEach((t, i) => confIdx.set(t.id, i));
  westTeams.forEach((t, i) => confIdx.set(t.id, i));

  const asDate = getAllStarWeekendDates(yr, { leagueCalendar, uiMode });

  // BUG 7 FIX: use T00:00:00Z to avoid local-timezone shift in blackout check
  const calendarBlackoutCache = new Map<string, boolean>();
  const isCalendarBlackout = (dateStr: string) => {
    const cached = calendarBlackoutCache.get(dateStr);
    if (cached !== undefined) return cached;
    const d = new Date(`${dateStr}T00:00:00Z`);
    const blocked = (allStarEnabled && d >= asDate.breakStart && d <= asDate.breakEnd)
      || calendarDates.seasonBreaks.some(leagueBreak => d >= leagueBreak.start && d <= leagueBreak.end);
    calendarBlackoutCache.set(dateStr, blocked);
    return blocked;
  };

  // Track scheduled games per team per day to avoid double headers
  // Map<DateString, Set<TeamId>>
  const scheduledDates: Record<string, Set<number>> = {};

  const isTeamFree = (dateStr: string, t1: number, t2: number) => {
    if (isCalendarBlackout(dateStr)) return false;
    if (!scheduledDates[dateStr]) return true;
    return !scheduledDates[dateStr].has(t1) &&
           !scheduledDates[dateStr].has(t2);
  };

  const markScheduled = (dateStr: string, t1: number, t2: number) => {
      if (!scheduledDates[dateStr]) scheduledDates[dateStr] = new Set();
      scheduledDates[dateStr].add(t1);
      scheduledDates[dateStr].add(t2);
  };

  const unmarkScheduled = (dateStr: string, t1: number, t2: number) => {
      scheduledDates[dateStr]?.delete(t1);
      scheduledDates[dateStr]?.delete(t2);
      if (scheduledDates[dateStr]?.size === 0) delete scheduledDates[dateStr];
  };

  const shiftDateString = (dateStr: string, deltaDays: number): string => {
      const cacheKey = `${dateStr}|${deltaDays}`;
      const cached = shiftedDateCache.get(cacheKey);
      if (cached) return cached;
      const regularOffset = regularSeasonDayOffsets.get(dateStr);
      if (regularOffset !== undefined) {
          const shiftedRegularDate = regularSeasonDayStrings[regularOffset + deltaDays];
          if (shiftedRegularDate) {
              shiftedDateCache.set(cacheKey, shiftedRegularDate);
              return shiftedRegularDate;
          }
      }
      const date = new Date(`${dateStr}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + deltaDays);
      const shifted = date.toISOString().split('T')[0];
      shiftedDateCache.set(cacheKey, shifted);
      return shifted;
  };

  const hasRestWindow = (dateStr: string, t1: number, t2: number, gapDays: number): boolean => {
      if (gapDays <= 0) return true;
      for (let delta = 1; delta <= gapDays; delta++) {
          const prev = scheduledDates[shiftDateString(dateStr, -delta)];
          const next = scheduledDates[shiftDateString(dateStr, delta)];
          if (prev?.has(t1) || prev?.has(t2) || next?.has(t1) || next?.has(t2)) return false;
      }
      return true;
  };

  const isTeamFreeWithRest = (dateStr: string, t1: number, t2: number, gapDays: number) =>
      isTeamFree(dateStr, t1, t2) && hasRestWindow(dateStr, t1, t2, gapDays);

  const dayStringFromOffset = (offset: number): string => {
      return regularSeasonDayStrings[offset];
  };

  const gameTime = (date: string): number => {
      const cached = parsedGameTimes.get(date);
      if (cached !== undefined) return cached;
      const parsed = new Date(date).getTime();
      parsedGameTimes.set(date, parsed);
      return parsed;
  };

  const scheduledTeamLoadNear = (dateStr: string, tid: number, radiusDays: number): number => {
      let load = 0;
      for (let delta = -radiusDays; delta <= radiusDays; delta++) {
          if (delta === 0) continue;
          if (scheduledDates[shiftDateString(dateStr, delta)]?.has(tid)) load++;
      }
      return load;
  };

  const findBestRegularDate = (
      segmentStart: number,
      segmentSize: number,
      t1: number,
      t2: number,
      gapDays: number,
      fullSeasonFallback = false,
      preferredOffset?: number,
  ): string | null => {
      const start = fullSeasonFallback ? 0 : Math.max(0, Math.floor(segmentStart));
      const end = fullSeasonFallback
          ? seasonLengthDays - 1
          : Math.min(seasonLengthDays - 1, Math.ceil(segmentStart + segmentSize) - 1);
      const midpoint = Math.max(start, Math.min(end, preferredOffset ?? (fullSeasonFallback ? (seasonLengthDays - 1) / 2 : segmentStart + segmentSize / 2)));
      let best: { dateStr: string; score: number } | null = null;

      for (let dayOffset = start; dayOffset <= end; dayOffset++) {
          const dateStr = dayStringFromOffset(dayOffset);
          if (!isTeamFreeWithRest(dateStr, t1, t2, gapDays)) continue;
          const teamLoad = scheduledTeamLoadNear(dateStr, t1, 3) + scheduledTeamLoadNear(dateStr, t2, 3);
          const dayLoad = scheduledDates[dateStr]?.size ?? 0;
          const segmentDistance = Math.abs(dayOffset - midpoint) / Math.max(1, segmentSize);
          const score = teamLoad * 20 + dayLoad + segmentDistance;
          if (!best || score < best.score) best = { dateStr, score };
      }

      return best?.dateStr ?? null;
  };

  // Preseason Games (Oct 1 to Oct 15): exactly 4 games per team via round-robin pairing.
  // Build 4 rounds of pairs so every team is guaranteed to appear exactly 4 times.
  const preseasonStart = calendarDates.preseasonStart;
  const preseasonEnd = calendarDates.preseasonEnd;
  const preseasonLength = preseasonStart && preseasonEnd
    ? Math.max(1, Math.floor((preseasonEnd.getTime() - preseasonStart.getTime()) / 86_400_000) + 1)
    : 0;
  const gamesPerTeam = Math.max(0, calendarDates.calendar.preseasonGamesPerTeam ?? 0);

  const preseasonPairs: [NBATeam, NBATeam][] = [];
  const preseasonCount = new Map<number, number>(teams.map(t => [t.id, 0]));
  for (let round = 0; round < gamesPerTeam; round++) {
    const pool = [...teams]
      .filter(t => (preseasonCount.get(t.id) ?? 0) < gamesPerTeam)
      .sort(() => Math.random() - 0.5);
    for (let i = 0; i + 1 < pool.length; i += 2) {
      preseasonPairs.push([pool[i], pool[i + 1]]);
      preseasonCount.set(pool[i].id, (preseasonCount.get(pool[i].id) ?? 0) + 1);
      preseasonCount.set(pool[i + 1].id, (preseasonCount.get(pool[i + 1].id) ?? 0) + 1);
    }
  }

  for (const [t1, t2] of preseasonStart ? preseasonPairs : []) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const randomDay = Math.floor(Math.random() * preseasonLength);
      const gameDate = new Date(preseasonStart!);
      gameDate.setUTCDate(preseasonStart!.getUTCDate() + randomDay);
      const dateStr = gameDate.toISOString().split('T')[0];
      if (isTeamFree(dateStr, t1.id, t2.id)) {
        markScheduled(dateStr, t1.id, t2.id);
        const t1Home = Math.random() > 0.5;
        games.push({
          gid: gameId++,
          homeTid: t1Home ? t1.id : t2.id,
          awayTid: t1Home ? t2.id : t1.id,
          homeScore: 0,
          awayScore: 0,
          played: false,
          date: gameDate.toISOString(),
          isPreseason: true
        } as any);
        break;
      }
    }
  }

  // Intra-squad scrimmages: 1 per team in early preseason (Oct 1-7), marked exhibition so stats/standings never count
  for (const team of preseasonStart ? teams : []) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const randomDay = Math.floor(Math.random() * 7);
      const gameDate = new Date(preseasonStart!);
      gameDate.setUTCDate(preseasonStart!.getUTCDate() + randomDay);
      const dateStr = gameDate.toISOString().split('T')[0];
      if (isTeamFree(dateStr, team.id, team.id)) {
        markScheduled(dateStr, team.id, team.id);
        games.push({
          gid: gameId++,
          homeTid: team.id,
          awayTid: team.id,
          homeScore: 0,
          awayScore: 0,
          played: false,
          date: gameDate.toISOString(),
          isPreseason: true,
          isExhibition: true,
        } as any);
        break;
      }
    }
  }

  // Pre-fill Christmas Day games if provided
  if (christmasDate && christmasGames && christmasGames.length > 0) {
      const dateStr = christmasDate.toISOString().split('T')[0];

      for (const game of christmasGames) {
          markScheduled(dateStr, game.homeTid, game.awayTid);
          games.push({
              gid: gameId++,
              homeTid: game.homeTid,
              awayTid: game.awayTid,
              homeScore: 0,
              awayScore: 0,
              played: false,
              date: christmasDate.toISOString()
          });
      }
  }

  // Pre-fill Global Games if provided
  if (globalGames && globalGames.length > 0) {
      for (const game of globalGames) {
          const gameDate = new Date(game.date);
          const dateStr = gameDate.toISOString().split('T')[0];
          markScheduled(dateStr, game.homeTid, game.awayTid);
          games.push({
              gid: gameId++,
              homeTid: game.homeTid,
              awayTid: game.awayTid,
              homeScore: 0,
              awayScore: 0,
              played: false,
              date: gameDate.toISOString(),
              city: (game as any).city,
              venue: game.venue,
              country: game.country
          });
      }
  }

  // Inject Cup group-stage games (Nov 4 – Dec 2 Tue/Fri Cup Nights).
  // injectCupGroupGames mutates the passed `games` array in place AND returns
  // the same reference — DO NOT reassign games via length=0 + push(...result.games),
  // that wipes everything because result.games is the same array reference.
  // Just keep the returned gameId and continue.
  if (cupGroups && cupGroups.length > 0) {
    const cupScheduleDates = getNbaCupScheduleDates(prevYr, {
      cupStart: calendarDates.cupStart,
      cupFinal: calendarDates.cupFinal,
    });
    const result = injectCupGroupGames(games, gameId, cupGroups, saveId || 'default', prevYr, scheduledDates, {
      cupStart: calendarDates.cupStart,
      cupFinal: calendarDates.cupFinal,
    });
    gameId = result.gameId;

    // Pre-bake one Cup TBD placeholder per team on Dec 9-11 — this is the
    // 82nd slot. After group stage resolves, it materializes into either a
    // real QF (8 advancers) or a paired RS game (22 non-advancers). Done
    // this way so the calendar never shows a phantom-vanishing matchup.
    const tbdNights = cupScheduleDates.tbdDates.map(date => date.toISOString().slice(0, 10));
    const sortedTeams = [...teams].sort((a, b) => a.id - b.id);
    sortedTeams.forEach((t, idx) => {
      // Distribute teams across the 3 nights, but fall through to any night
      // where the team has no other scheduled game.
      const preferred = tbdNights[idx % tbdNights.length];
      const order = [preferred, ...tbdNights.filter(d => d !== preferred)];
      const dateStr = order.find(d => !(scheduledDates[d]?.has(t.id))) ?? preferred;
      if (!scheduledDates[dateStr]) scheduledDates[dateStr] = new Set();
      scheduledDates[dateStr].add(t.id);
      games.push({
        gid: gameId++,
        homeTid: t.id,
        awayTid: -1,                 // sentinel: opponent unknown until KO/pairing resolves
        homeScore: 0,
        awayScore: 0,
        played: false,
        date: new Date(`${dateStr}T20:00:00Z`).toISOString(),
        isCupTBD: true,
        cupTBDForTid: t.id,
        excludeFromRecord: true,     // never count toward W/L while still a placeholder
      } as any);
    });
  }

  // BUG 5 FIX: Track pairs that already have a pre-scheduled game (Christmas/global)
  // so the matchup loop reduces their quota by 1.
  const preScheduledPairs = new Map<string, number>();
  const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  for (const g of games) {
      if (!g.isPreseason) {
          const key = pairKey(g.homeTid, g.awayTid);
          preScheduledPairs.set(key, (preScheduledPairs.get(key) ?? 0) + 1);
      }
  }

  const balancedPairQuotas = (() => {
    if (!useBalancedTargetSchedule || teams.length < 2) return null;
    const sortedTeams = [...teams].sort((a, b) => a.id - b.id);
    const base = Math.floor(targetRegularGames / Math.max(1, sortedTeams.length - 1));
    const extraPerTeam = targetRegularGames - base * (sortedTeams.length - 1);
    const quotas = new Map<string, number>();
    const needs = new Map<number, number>();
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < sortedTeams.length; i++) {
      needs.set(sortedTeams[i].id, extraPerTeam);
      for (let j = i + 1; j < sortedTeams.length; j++) {
        quotas.set(pairKey(sortedTeams[i].id, sortedTeams[j].id), base);
        pairs.push([sortedTeams[i].id, sortedTeams[j].id]);
      }
    }
    pairs.sort((a, b) => ((a[0] + a[1] + targetRegularGames) % sortedTeams.length) - ((b[0] + b[1] + targetRegularGames) % sortedTeams.length) || a[0] - b[0] || a[1] - b[1]);
    while ([...needs.values()].some(value => value > 0)) {
      let changed = false;
      for (const [a, b] of pairs) {
        if ((needs.get(a) ?? 0) <= 0 || (needs.get(b) ?? 0) <= 0) continue;
        quotas.set(pairKey(a, b), (quotas.get(pairKey(a, b)) ?? 0) + 1);
        needs.set(a, (needs.get(a) ?? 0) - 1);
        needs.set(b, (needs.get(b) ?? 0) - 1);
        changed = true;
      }
      if (!changed) break;
    }
    return quotas;
  })();

  // Generate matchups
  for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
          const t1 = teams[i];
          const t2 = teams[j];

          const sameConf = t1.conference === t2.conference;
          const sameDiv = t1.did !== undefined && t2.did !== undefined && t1.did === t2.did;

          let numGames: number;
          const balancedQuota = balancedPairQuotas?.get(pairKey(t1.id, t2.id));
          if (balancedQuota != null) {
              numGames = balancedQuota;
          } else if (sameDiv && (divisionGames ?? 0) > 0) {
              // Division-aware scheduling when divisionGames is configured
              numGames = divisionGames!;
          } else if (sameConf) {
              numGames = conferenceGames ?? 3; // Same conference: 14 × 3 = 42 games/team
          } else {
              // Cross-conference: when cupGroups are configured, drop one extra
              // 2-game pair per team so each team finishes with 81 RS (the 82nd
              // slot becomes a Dec 9-11 Cup TBD placeholder, materialized into
              // QF or a paired RS game when the group stage resolves).
              // Without cupGroups: legacy 82-game distribution.
              //   With cupGroups: 9 opp × 3 + 6 opp × 2 = 39 cross-conf → 81 total
              //   Without:        10 opp × 3 + 5 opp × 2 = 40 cross-conf → 82 total
              const ci1 = confIdx.get(t1.id) ?? 0;
              const ci2 = confIdx.get(t2.id) ?? 0;
              const hasCup = !!(cupGroups && cupGroups.length > 0);
              const dropExtra = hasCup && ((ci1 + ci2) % 15 === 14); // symmetric, disjoint from %3==0
              numGames = ((ci1 + ci2) % 3 !== 0 && !dropExtra) ? 3 : 2;
          }

          // BUG 5 FIX: Subtract any pre-scheduled games (Christmas, global) for this pair
          const alreadyScheduled = preScheduledPairs.get(pairKey(t1.id, t2.id)) ?? 0;
          const remainingGames = Math.max(0, numGames - alreadyScheduled);

          // Generate games distributed throughout the season
          for (let k = 0; k < remainingGames; k++) {
              // Divide season into segments to spread games out
              const segmentSize = seasonLengthDays / Math.max(1, remainingGames);
              const segmentStart = k * segmentSize;
              const phaseSeed = ((t1.id + 1) * 37 + (t2.id + 1) * 17 + (k + 1) * 29 + targetRegularGames * 11) % 100;
              const preferredOffset = segmentStart + segmentSize * (0.18 + (phaseSeed / 99) * 0.64);

              const dateStr =
                  findBestRegularDate(segmentStart, segmentSize, t1.id, t2.id, regularRestGapDays, false, preferredOffset) ??
                  findBestRegularDate(segmentStart, segmentSize, t1.id, t2.id, regularRestGapDays, true, preferredOffset) ??
                  findBestRegularDate(segmentStart, segmentSize, t1.id, t2.id, 0, true);

              if (!dateStr) continue;

              markScheduled(dateStr, t1.id, t2.id);

              // Swap home/away for balance
              let homeTid = t1.id;
              let awayTid = t2.id;

              if (remainingGames === 2) {
                  if (k === 1) { homeTid = t2.id; awayTid = t1.id; }
              } else if (remainingGames === 3) {
                  if (k === 1) { homeTid = t2.id; awayTid = t1.id; }
                  if (k === 2 && Math.random() > 0.5) { homeTid = t2.id; awayTid = t1.id; }
              } else if (k % 2 === 1) {
                  homeTid = t2.id;
                  awayTid = t1.id;
              }

              games.push({
                  gid: gameId++,
                  homeTid,
                  awayTid,
                  homeScore: 0,
                  awayScore: 0,
                  played: false,
                  date: new Date(`${dateStr}T00:00:00Z`).toISOString()
              });
          }
      }
  }

  if (regularRestGapDays > 0) {
      let moved = 0;
      const protectedDates = new Set<string>(christmasDateString ? [christmasDateString] : []);
      const regularIndexes = () => games
          .map((game, idx) => ({ game, idx }))
          .filter(({ game }) => !(game as any).isPreseason && !(game as any).isCupTBD && !(game as any).isNBACup && !(game as any).city && !protectedDates.has(new Date(game.date).toISOString().split('T')[0]));
      const teamIndexes = () => {
          const map = new Map<number, number[]>();
          for (const { game, idx } of regularIndexes()) {
              if (!map.has(game.homeTid)) map.set(game.homeTid, []);
              if (!map.has(game.awayTid)) map.set(game.awayTid, []);
              map.get(game.homeTid)!.push(idx);
              map.get(game.awayTid)!.push(idx);
          }
          for (const indexes of map.values()) {
              indexes.sort((a, b) => gameTime(games[a].date) - gameTime(games[b].date));
          }
          return map;
      };

      for (let pass = 0; pass < 4; pass++) {
          let passMoved = 0;
          for (const indexes of teamIndexes().values()) {
              for (let i = 1; i < indexes.length; i++) {
                  const prev = games[indexes[i - 1]];
                  const current = games[indexes[i]];
                  const prevDay = Math.floor(gameTime(prev.date) / 86400000);
                  const currentDay = Math.floor(gameTime(current.date) / 86400000);
                  if (currentDay - prevDay !== 1) continue;

                  const oldDateStr = new Date(current.date).toISOString().split('T')[0];
                  if (protectedDates.has(oldDateStr) || (current as any).city || (current as any).isNBACup) continue;
                  unmarkScheduled(oldDateStr, current.homeTid, current.awayTid);

                  const currentOffset = Math.max(0, Math.min(seasonLengthDays - 1, Math.round(currentDay - Math.floor(startDate.getTime() / 86400000))));
                  const localStart = Math.max(0, currentOffset - 10);
                  const newDateStr =
                      findBestRegularDate(localStart, 21, current.homeTid, current.awayTid, regularRestGapDays) ??
                      findBestRegularDate(0, seasonLengthDays, current.homeTid, current.awayTid, regularRestGapDays, true);

                  if (newDateStr && newDateStr !== oldDateStr) {
                      current.date = new Date(`${newDateStr}T00:00:00Z`).toISOString();
                      markScheduled(newDateStr, current.homeTid, current.awayTid);
                      moved++;
                      passMoved++;
                  } else {
                      markScheduled(oldDateStr, current.homeTid, current.awayTid);
                  }
              }
          }
          if (passMoved === 0) break;
      }
      if (moved > 0) console.log(`[Scheduler] Rest-spacing repair moved ${moved} game(s).`);
  }

  // Sort by date
  games.sort((a, b) => gameTime(a.date) - gameTime(b.date));

  // ── Post-process: fix H/A streaks (enforce ≤4 consecutive home or away) ───
  {
    const MAX_CONSEC = 4;
    const teamGameSeq = new Map<number, number[]>();
    games.forEach((g, idx) => {
      if ((g as any).isPreseason) return;
      if ((g as any).isCupTBD) return;        // placeholder, no real H/A
      if (!teamGameSeq.has(g.homeTid)) teamGameSeq.set(g.homeTid, []);
      if (!teamGameSeq.has(g.awayTid)) teamGameSeq.set(g.awayTid, []);
      teamGameSeq.get(g.homeTid)!.push(idx);
      teamGameSeq.get(g.awayTid)!.push(idx);
    });

    // Count games where consecutive same-type exceeds MAX_CONSEC for a team
    const violationCountCache = new Map<number, number>();
    const countViolations = (tid: number): number => {
      const cached = violationCountCache.get(tid);
      if (cached !== undefined) return cached;
      let v = 0, consec = 0, lastHome: boolean | null = null;
      for (const idx of teamGameSeq.get(tid) ?? []) {
        const isHome = games[idx].homeTid === tid;
        if (isHome === lastHome) { consec++; if (consec > MAX_CONSEC) v++; }
        else { consec = 1; lastHome = isHome; }
      }
      violationCountCache.set(tid, v);
      return v;
    };
    const invalidateViolationCounts = (firstTid: number, secondTid: number) => {
      violationCountCache.delete(firstTid);
      violationCountCache.delete(secondTid);
    };

    // Greedy swap passes: swap H/A on violating games only when it reduces total violations
    for (let pass = 0; pass < 30; pass++) {
      let anyFixed = false;
      for (const [tid, idxs] of teamGameSeq) {
        let consec = 0, lastHome: boolean | null = null;
        for (const gameIdx of idxs) {
          const g = games[gameIdx];
          const isHome = g.homeTid === tid;
          if (isHome === lastHome) {
            consec++;
            if (consec > MAX_CONSEC) {
              const otherTid = isHome ? g.awayTid : g.homeTid;
              const before = countViolations(tid) + countViolations(otherTid);
              [g.homeTid, g.awayTid] = [g.awayTid, g.homeTid];
              invalidateViolationCounts(tid, otherTid);
              if (countViolations(tid) + countViolations(otherTid) < before) {
                anyFixed = true;
                break; // restart this team's scan on next pass
              }
              [g.homeTid, g.awayTid] = [g.awayTid, g.homeTid]; // revert if no improvement
              invalidateViolationCounts(tid, otherTid);
            }
          } else { consec = 1; lastHome = isHome; }
        }
      }
      if (!anyFixed) break;
    }

    const orientationIndexes = [...new Set([...teamGameSeq.values()].flat())]
      .filter(index => games[index].homeTid !== games[index].awayTid);
    for (let pass = 0; pass < 60; pass++) {
      let bestIndex = -1;
      let bestGain = 0;
      for (const gameIndex of orientationIndexes) {
        const game = games[gameIndex];
        const before = countViolations(game.homeTid) + countViolations(game.awayTid);
        const originalHomeTid = game.homeTid;
        const originalAwayTid = game.awayTid;
        [game.homeTid, game.awayTid] = [game.awayTid, game.homeTid];
        invalidateViolationCounts(originalHomeTid, originalAwayTid);
        const after = countViolations(game.homeTid) + countViolations(game.awayTid);
        [game.homeTid, game.awayTid] = [game.awayTid, game.homeTid];
        invalidateViolationCounts(originalHomeTid, originalAwayTid);
        const gain = before - after;
        if (gain > bestGain) {
          bestGain = gain;
          bestIndex = gameIndex;
        }
      }
      if (bestIndex < 0) break;
      const game = games[bestIndex];
      const originalHomeTid = game.homeTid;
      const originalAwayTid = game.awayTid;
      [game.homeTid, game.awayTid] = [game.awayTid, game.homeTid];
      invalidateViolationCounts(originalHomeTid, originalAwayTid);
    }

    // Log worst remaining streak
    let maxStreak = 0;
    for (const [tid, idxs] of teamGameSeq) {
      let consec = 0, lastHome: boolean | null = null;
      for (const idx of idxs) {
        const isHome = games[idx].homeTid === tid;
        if (isHome === lastHome) { consec++; maxStreak = Math.max(maxStreak, consec); }
        else { consec = 1; lastHome = isHome; }
      }
    }
    console.log(`[Scheduler] Max H/A streak after fix: ${maxStreak} (target ≤${MAX_CONSEC})`);
  }

  // ── Schedule summary log ────────────────────────────────────────────────────
  const preseasonScrimmages = games.filter(g => (g as any).isExhibition).length;
  const preseasonGames      = games.filter(g => (g as any).isPreseason && !(g as any).isExhibition).length;
  const christmasCount      = christmasGames?.length ?? 0;
  const globalCount         = globalGames?.length ?? 0;
  const regularSeason       = games.filter(g => !(g as any).isPreseason).length;
  console.log(
    `[Scheduler] Generated schedule — ` +
    `preseason: ${preseasonGames} (+ ${preseasonScrimmages} scrimmages) | ` +
    `Christmas: ${christmasCount} | global: ${globalCount} | reg season: ${regularSeason} | total: ${games.length}`
  );
  if (globalGames && globalGames.length > 0) {
    globalGames.forEach(g => {
      const home = teams.find(t => t.id === g.homeTid)?.abbrev ?? g.homeTid;
      const away = teams.find(t => t.id === g.awayTid)?.abbrev ?? g.awayTid;
      console.log(`  [Global Game] ${home} vs ${away} — ${g.date.slice(0, 10)} in ${g.city}, ${g.country}`);
    });
  }

  // Per-team game count check (regular season only)
  const teamGameCounts = new Map<number, number>();
  games.filter(g => !(g as any).isPreseason && !(g as any).isCupTBD).forEach(g => {
    teamGameCounts.set(g.homeTid, (teamGameCounts.get(g.homeTid) ?? 0) + 1);
    teamGameCounts.set(g.awayTid, (teamGameCounts.get(g.awayTid) ?? 0) + 1);
  });
  const counts = [...teamGameCounts.values()];
  const minGames = Math.min(...counts), maxGames = Math.max(...counts);
  console.log(`[Scheduler] Per-team reg-season game count: min=${minGames} max=${maxGames} (target ${targetRegularGames})`);
  if (maxGames !== minGames) {
    [...teamGameCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,5).forEach(([tid, cnt]) => {
      const abbrev = teams.find(t => t.id === tid)?.abbrev ?? tid;
      console.log(`  ${abbrev}: ${cnt} games`);
    });
  }

  // Attach broadcaster + tipoff metadata when a media deal is available
  if (mediaRights) {
    return attachBroadcastersToGames(games, mediaRights, teams);
  }

  return games;
};
