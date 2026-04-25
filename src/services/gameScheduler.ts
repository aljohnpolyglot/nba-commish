import { NBATeam, Game, MediaRights, NBACupGroup } from '../types';
import { getAllStarWeekendDates } from './allStar/AllStarWeekendOrchestrator';
import { attachBroadcastersToGames } from '../utils/broadcastingUtils';
import { injectCupGroupGames } from './nbaCup/scheduleInjector';

export const generateSchedule = (
  teams: NBATeam[],
  christmasGames?: { homeTid: number; awayTid: number }[],
  globalGames?: { homeTid: number; awayTid: number; date: string; city: string; country: string }[],
  divisionGames?: number | null,
  conferenceGames?: number | null,
  mediaRights?: MediaRights | null,
  seasonYear?: number,
  cupGroups?: NBACupGroup[],
  saveId?: string,
): Game[] => {
  const games: Game[] = [];
  let gameId = 0; // gid 90000-90001 reserved for All-Star games

  // Derive season dates from seasonYear (e.g. 2026 → Oct 24 2025 – Apr 13 2026)
  const yr = seasonYear ?? 2026;
  const prevYr = yr - 1;

  // BUG 7 FIX: use T00:00:00Z to ensure UTC parsing
  const startDate = new Date(`${prevYr}-10-24T00:00:00Z`);
  const endDate = new Date(`${yr}-04-13T00:00:00Z`); // Regular season ends Apr 12; +1 so last slot is Apr 12
  const seasonLengthDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));

  // Pre-sort teams by conference for deterministic 82-game schedule:
  // Same-conference: 14 × 3 = 42 games
  // Cross-conference: 10 opponents × 3 + 5 opponents × 2 = 40 games  → total 82
  const eastTeams = [...teams.filter(t => t.conference === 'East')].sort((a, b) => a.id - b.id);
  const westTeams = [...teams.filter(t => t.conference === 'West')].sort((a, b) => a.id - b.id);
  const confIdx = new Map<number, number>();
  eastTeams.forEach((t, i) => confIdx.set(t.id, i));
  westTeams.forEach((t, i) => confIdx.set(t.id, i));

  const asDate = getAllStarWeekendDates(yr);

  // BUG 7 FIX: use T00:00:00Z to avoid local-timezone shift in blackout check
  const isAllStarBlackout = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return d >= asDate.breakStart &&
           d <= asDate.breakEnd;
  };

  // Track scheduled games per team per day to avoid double headers
  // Map<DateString, Set<TeamId>>
  const scheduledDates: Record<string, Set<number>> = {};

  const isTeamFree = (dateStr: string, t1: number, t2: number) => {
    if (isAllStarBlackout(dateStr)) return false;
    if (!scheduledDates[dateStr]) return true;
    return !scheduledDates[dateStr].has(t1) &&
           !scheduledDates[dateStr].has(t2);
  };

  const markScheduled = (dateStr: string, t1: number, t2: number) => {
      if (!scheduledDates[dateStr]) scheduledDates[dateStr] = new Set();
      scheduledDates[dateStr].add(t1);
      scheduledDates[dateStr].add(t2);
  };

  // Preseason Games (Oct 1 to Oct 15): exactly 4 games per team via round-robin pairing.
  // Build 4 rounds of pairs so every team is guaranteed to appear exactly 4 times.
  const preseasonStart = new Date(`${prevYr}-10-01T00:00:00Z`);
  const preseasonLength = 15;
  const gamesPerTeam = 4;

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

  for (const [t1, t2] of preseasonPairs) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const randomDay = Math.floor(Math.random() * preseasonLength);
      const gameDate = new Date(preseasonStart);
      gameDate.setUTCDate(preseasonStart.getUTCDate() + randomDay);
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
  for (const team of teams) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const randomDay = Math.floor(Math.random() * 7);
      const gameDate = new Date(preseasonStart);
      gameDate.setUTCDate(preseasonStart.getUTCDate() + randomDay);
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
  if (christmasGames && christmasGames.length > 0) {
      // BUG 7 FIX: use T00:00:00Z
      const christmasDate = new Date(`${prevYr}-12-25T00:00:00Z`);
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
    const result = injectCupGroupGames(games, gameId, cupGroups, saveId || 'default', prevYr, scheduledDates);
    gameId = result.gameId;
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

  // Generate matchups
  for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
          const t1 = teams[i];
          const t2 = teams[j];

          const sameConf = t1.conference === t2.conference;
          const sameDiv = t1.did !== undefined && t2.did !== undefined && t1.did === t2.did;

          let numGames: number;
          if (sameDiv && (divisionGames ?? 0) > 0) {
              // Division-aware scheduling when divisionGames is configured
              numGames = divisionGames!;
          } else if (sameConf) {
              numGames = conferenceGames ?? 3; // Same conference: 14 × 3 = 42 games/team
          } else {
              // Cross-conference: use sorted-index parity so each team gets
              // 10 opponents at 3 games + 5 opponents at 2 games = 40 games/team
              const ci1 = confIdx.get(t1.id) ?? 0;
              const ci2 = confIdx.get(t2.id) ?? 0;
              numGames = (ci1 + ci2) % 3 !== 0 ? 3 : 2;
          }

          // BUG 5 FIX: Subtract any pre-scheduled games (Christmas, global) for this pair
          const alreadyScheduled = preScheduledPairs.get(pairKey(t1.id, t2.id)) ?? 0;
          const remainingGames = Math.max(0, numGames - alreadyScheduled);

          // Generate games distributed throughout the season
          for (let k = 0; k < remainingGames; k++) {
              // Divide season into segments to spread games out
              const segmentSize = seasonLengthDays / Math.max(1, remainingGames);
              const segmentStart = k * segmentSize;

              let scheduled = false;
              let attempts = 0;

              while (!scheduled && attempts < 100) {
                  const randomOffset = Math.floor(Math.random() * segmentSize);
                  const dayOffset = Math.floor(segmentStart + randomOffset);

                  // Ensure we don't go past end date
                  if (dayOffset >= seasonLengthDays) {
                      attempts++;
                      continue;
                  }

                  // BUG 7 FIX: use setUTCDate to avoid timezone drift
                  const gameDate = new Date(startDate);
                  gameDate.setUTCDate(startDate.getUTCDate() + dayOffset);
                  const dateStr = gameDate.toISOString().split('T')[0];

                  if (isTeamFree(dateStr, t1.id, t2.id)) {
                      markScheduled(dateStr, t1.id, t2.id);

                      // Swap home/away for balance
                      let homeTid = t1.id;
                      let awayTid = t2.id;

                      if (remainingGames === 2) {
                          if (k === 1) { homeTid = t2.id; awayTid = t1.id; }
                      } else if (remainingGames === 3) {
                          if (k === 1) { homeTid = t2.id; awayTid = t1.id; }
                          if (k === 2 && Math.random() > 0.5) { homeTid = t2.id; awayTid = t1.id; }
                      }

                      games.push({
                          gid: gameId++,
                          homeTid: homeTid,
                          awayTid: awayTid,
                          homeScore: 0,
                          awayScore: 0,
                          played: false,
                          date: gameDate.toISOString()
                      });
                      scheduled = true;
                  }
                  attempts++;
              }

              // Fallback: If we couldn't find a slot in the segment, try ANY random day
              if (!scheduled) {
                  let fallbackAttempts = 0;
                  while (!scheduled && fallbackAttempts < 200) {
                      const randomDay = Math.floor(Math.random() * seasonLengthDays);
                      // BUG 7 FIX: use setUTCDate
                      const gameDate = new Date(startDate);
                      gameDate.setUTCDate(startDate.getUTCDate() + randomDay);
                      const dateStr = gameDate.toISOString().split('T')[0];

                      if (isTeamFree(dateStr, t1.id, t2.id)) {
                          markScheduled(dateStr, t1.id, t2.id);
                          games.push({
                              gid: gameId++,
                              homeTid: t1.id, // Default to t1 home for fallback
                              awayTid: t2.id,
                              homeScore: 0,
                              awayScore: 0,
                              played: false,
                              date: gameDate.toISOString()
                          });
                          scheduled = true;
                      }
                      fallbackAttempts++;
                  }
              }
          }
      }
  }

  // Sort by date
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // ── Post-process: fix H/A streaks (enforce ≤4 consecutive home or away) ───
  {
    const MAX_CONSEC = 4;
    const teamGameSeq = new Map<number, number[]>();
    games.forEach((g, idx) => {
      if ((g as any).isPreseason) return;
      if (!teamGameSeq.has(g.homeTid)) teamGameSeq.set(g.homeTid, []);
      if (!teamGameSeq.has(g.awayTid)) teamGameSeq.set(g.awayTid, []);
      teamGameSeq.get(g.homeTid)!.push(idx);
      teamGameSeq.get(g.awayTid)!.push(idx);
    });

    // Count games where consecutive same-type exceeds MAX_CONSEC for a team
    const countViolations = (tid: number): number => {
      let v = 0, consec = 0, lastHome: boolean | null = null;
      for (const idx of teamGameSeq.get(tid) ?? []) {
        const isHome = games[idx].homeTid === tid;
        if (isHome === lastHome) { consec++; if (consec > MAX_CONSEC) v++; }
        else { consec = 1; lastHome = isHome; }
      }
      return v;
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
              if (countViolations(tid) + countViolations(otherTid) < before) {
                anyFixed = true;
                break; // restart this team's scan on next pass
              }
              [g.homeTid, g.awayTid] = [g.awayTid, g.homeTid]; // revert if no improvement
            }
          } else { consec = 1; lastHome = isHome; }
        }
      }
      if (!anyFixed) break;
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
  games.filter(g => !(g as any).isPreseason).forEach(g => {
    teamGameCounts.set(g.homeTid, (teamGameCounts.get(g.homeTid) ?? 0) + 1);
    teamGameCounts.set(g.awayTid, (teamGameCounts.get(g.awayTid) ?? 0) + 1);
  });
  const counts = [...teamGameCounts.values()];
  const minGames = Math.min(...counts), maxGames = Math.max(...counts);
  console.log(`[Scheduler] Per-team reg-season game count: min=${minGames} max=${maxGames} (should be ~82)`);
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
