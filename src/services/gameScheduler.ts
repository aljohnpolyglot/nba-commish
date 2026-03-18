import { NBATeam, Game } from '../types';
import { getAllStarWeekendDates } from './allStar/AllStarWeekendOrchestrator';

export const generateSchedule = (
  teams: NBATeam[],
  christmasGames?: { homeTid: number; awayTid: number }[],
  globalGames?: { homeTid: number; awayTid: number; date: string; city: string; country: string }[],
  divisionGames?: number | null,
  conferenceGames?: number | null
): Game[] => {
  const games: Game[] = [];
  let gameId = 0; // gid 90000-90001 reserved for All-Star games

  // BUG 7 FIX: use T00:00:00Z to ensure UTC parsing
  const startDate = new Date('2025-10-24T00:00:00Z');
  const endDate = new Date('2026-04-13T00:00:00Z'); // Regular season ends Apr 12; +1 so last slot is Apr 12
  const seasonLengthDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));

  // Pre-sort teams by conference for deterministic 82-game schedule:
  // Same-conference: 14 × 3 = 42 games
  // Cross-conference: 10 opponents × 3 + 5 opponents × 2 = 40 games  → total 82
  const eastTeams = [...teams.filter(t => t.conference === 'East')].sort((a, b) => a.id - b.id);
  const westTeams = [...teams.filter(t => t.conference === 'West')].sort((a, b) => a.id - b.id);
  const confIdx = new Map<number, number>();
  eastTeams.forEach((t, i) => confIdx.set(t.id, i));
  westTeams.forEach((t, i) => confIdx.set(t.id, i));

  const seasonYear = new Date(endDate).getUTCFullYear();
  const asDate = getAllStarWeekendDates(seasonYear);

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

  // BUG 4 FIX: Preseason Games (Oct 1 to Oct 15)
  // Iterate pairs so each game counts for both teams simultaneously.
  // Target: 4 preseason games per team → schedule (teams.length * 2) total games.
  const preseasonStart = new Date('2025-10-01T00:00:00Z');
  const preseasonLength = 15;
  const preseasonTarget = (teams.length * 4) / 2; // each game covers 2 teams
  let preseasonScheduled = 0;
  let preseasonAttempts = 0;
  const shuffled = [...teams].sort(() => Math.random() - 0.5);

  while (preseasonScheduled < preseasonTarget && preseasonAttempts < preseasonTarget * 20) {
      preseasonAttempts++;
      const idx1 = Math.floor(Math.random() * shuffled.length);
      let idx2 = Math.floor(Math.random() * shuffled.length);
      if (idx2 === idx1) continue;
      const t1 = shuffled[idx1];
      const t2 = shuffled[idx2];
      const randomDay = Math.floor(Math.random() * preseasonLength);
      const gameDate = new Date(preseasonStart);
      gameDate.setUTCDate(preseasonStart.getUTCDate() + randomDay);
      const dateStr = gameDate.toISOString().split('T')[0];
      if (isTeamFree(dateStr, t1.id, t2.id)) {
          markScheduled(dateStr, t1.id, t2.id);
          games.push({
              gid: gameId++,
              homeTid: Math.random() > 0.5 ? t1.id : t2.id,
              awayTid: Math.random() > 0.5 ? t2.id : t1.id,
              homeScore: 0,
              awayScore: 0,
              played: false,
              date: gameDate.toISOString(),
              isPreseason: true
          } as any);
          preseasonScheduled++;
      }
  }

  // Pre-fill Christmas Day games if provided
  if (christmasGames && christmasGames.length > 0) {
      // BUG 7 FIX: use T00:00:00Z
      const christmasDate = new Date('2025-12-25T00:00:00Z');
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

  return games;
};
