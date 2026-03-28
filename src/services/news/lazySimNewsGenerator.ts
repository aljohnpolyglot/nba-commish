import { NBATeam, NBAPlayer, GameResult, NewsItem } from '../../types';
import { NewsGenerator } from './NewsGenerator';
import { convertTo2KRating } from '../../utils/helpers';

const get2KOvr = (p: NBAPlayer) =>
  convertTo2KRating(p.overallRating ?? p.ratings?.[0]?.ovr ?? 0, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50);

function gamesToTime(games: number, remainingInSeason?: number): string {
  if (games <= 0)  return 'day-to-day';
  if (games === 1) return 'one game';
  if (games === 2) return 'the next two games';
  if (games <= 4)  return 'approximately a week';
  if (games <= 7)  return '1-to-2 weeks';
  if (games <= 10) return 'at least two weeks';
  if (games <= 14) return 'approximately two weeks';
  if (games <= 18) return '2-to-4 weeks';
  if (games <= 22) return 'approximately one month';
  if (games <= 28) return '4-to-6 weeks';
  if (games <= 35) return '6-to-8 weeks';
  if (games <= 45) return 'approximately two months';
  if (games <= 55) return 'multiple months';
  if (games <= 65) return 'at least three months';
  if (remainingInSeason && games >= remainingInSeason * 0.85) return 'the remainder of the season';
  if (games >= 80) return 'the remainder of the season';
  return 'significant time';
}

/** Attach portrait as fallback (not as image) so Imagn enrichment runs first */
function withPortrait(item: NewsItem | null, url?: string): NewsItem | null {
  if (!item) return null;
  if (url) item.playerPortraitUrl = url;
  return item;
}

/**
 * Generates news items from a batch of simulated games during lazy sim.
 * Designed to ALWAYS produce at least one news item per batch so the feed
 * stays populated even when LLM is off — same philosophy as Shams injury posts.
 *
 * Player portraits are stored as `playerPortraitUrl` (not `image`) so that
 * NewsFeed can attempt Imagn enrichment first and fall back to portrait.
 * Team logos are stored as `image` — they're used immediately, no Imagn needed.
 */
const OPENING_NIGHT = new Date('2025-10-24T00:00:00Z').getTime();

function dateIsPreseason(dateStr: string): boolean {
  try { return new Date(dateStr).getTime() < OPENING_NIGHT; } catch { return false; }
}

export const generateLazySimNews = (
  teams: NBATeam[],
  players: NBAPlayer[],
  allSimResults: GameResult[],
  currentDate: string,
  reportedInjuries: Set<string>,
  skipInjuries = false,
  prevTeams?: NBATeam[]
): NewsItem[] => {
  const news: NewsItem[] = [];
  const isPreseason = dateIsPreseason(currentDate);

  // ── 1. BATCH RECAP — always fires for the top performer of the 7-day batch ──
  {
    const statLines: { stat: typeof allSimResults[0]['homeStats'][0]; teamId: number; oppId: number }[] = [];
    for (const game of allSimResults) {
      for (const s of game.homeStats) statLines.push({ stat: s, teamId: game.homeTeamId, oppId: game.awayTeamId });
      for (const s of game.awayStats) statLines.push({ stat: s, teamId: game.awayTeamId, oppId: game.homeTeamId });
    }

    if (statLines.length > 0) {
      statLines.sort((a, b) => (b.stat.gameScore ?? 0) - (a.stat.gameScore ?? 0));
      const top = statLines[0];
      const team = teams.find(t => t.id === top.teamId);
      if (team) {
        const player = players.find(p => p.internalId === top.stat.playerId);
        const item = withPortrait(NewsGenerator.generate(isPreseason ? 'preseason_recap' : 'batch_recap', currentDate, {
          playerName: top.stat.name,
          teamName: team.name,
          pts: top.stat.pts,
          reb: top.stat.reb,
          ast: top.stat.ast,
        }), player?.imgURL);
        if (item) news.push(item);
      }
    }
  }

  // ── 2. WIN / LOSE STREAKS — team logos stay as `image` (no Imagn needed) ──
  const STREAK_THRESHOLDS = [5, 7, 10, 14];
  for (const team of teams) {
    if (!team.streak) continue;
    const { type, count } = team.streak;
    if (!STREAK_THRESHOLDS.includes(count)) continue;

    if (type === 'W') {
      const category = count >= 8 ? 'long_win_streak' : 'win_streak';
      const item = NewsGenerator.generate(category, currentDate, {
        teamName: team.name,
        streakCount: count,
      }, team.logoUrl);
      if (item) news.push(item);
    } else {
      const item = NewsGenerator.generate('lose_streak', currentDate, {
        teamName: team.name,
        streakCount: count,
      }, team.logoUrl);
      if (item) news.push(item);
    }
  }

  // ── 2b. STREAK SNAPPED — detect win streaks (5+) that just ended ──
  if (prevTeams) {
    for (const prevTeam of prevTeams) {
      if (!prevTeam.streak || prevTeam.streak.type !== 'W' || prevTeam.streak.count < 5) continue;
      const currTeam = teams.find(t => t.id === prevTeam.id);
      if (!currTeam?.streak || currTeam.streak.type !== 'L') continue;
      const item = NewsGenerator.generate('streak_snapped', currentDate, {
        teamName: currTeam.name,
        streakCount: prevTeam.streak.count,
      }, currTeam.logoUrl);
      if (item) news.push(item);
    }
  }

  // ── 3. MONSTER PERFORMANCES — 40+ pts ────────────────────────────────────
  // Follow the Social Media pattern: define home/away teams upfront per game,
  // then process each side's stats explicitly — zero guessing about who is who.
  for (const game of allSimResults) {
    const homeTeam = teams.find(t => t.id === game.homeTeamId);
    const awayTeam = teams.find(t => t.id === game.awayTeamId);
    // Skip scrimmages (same team on both sides) or missing teams
    if (!homeTeam || !awayTeam || homeTeam === awayTeam) continue;

    const sides: { stats: typeof game.homeStats; team: typeof homeTeam; opp: typeof awayTeam }[] = [
      { stats: game.homeStats, team: homeTeam, opp: awayTeam },
      { stats: game.awayStats, team: awayTeam, opp: homeTeam },
    ];

    for (const { stats, team, opp } of sides) {
      for (const stat of stats) {
        const player = players.find(p => p.internalId === stat.playerId);
        if (!player) continue;

        if (stat.pts >= 40 && Math.random() < 0.8) {
          const item = withPortrait(NewsGenerator.generate(isPreseason ? 'preseason_performance' : 'monster_performance', currentDate, {
            playerName: stat.name,
            teamName:     team.name,  // guaranteed to be the player's actual team
            opponentName: opp.name,   // guaranteed to be the actual opponent
            statValue: stat.pts,
            statType: 'PTS',
          }), player.imgURL);
          if (item) news.push(item);
          continue;
        }

        // Standard triple-double (10/10/10) — 60% chance to report
        if (stat.pts >= 10 && stat.reb >= 10 && stat.ast >= 10 && Math.random() < 0.6) {
          const item = withPortrait(NewsGenerator.generate('triple_double', currentDate, {
            playerName: stat.name,
            teamName:   team.name,
            pts: stat.pts,
            reb: stat.reb,
            ast: stat.ast,
          }), player.imgURL);
          if (item) news.push(item);
        }
      }
    }
  }

  // ── 4. MAJOR INJURIES — 2K OVR 75+, 20+ games out ────────────────────────
  // Skipped in regular gameplay (skipInjuries=true) — Shams posts handle injuries there.
  if (skipInjuries) return news;
  for (const player of players) {
    if (!player.injury || player.injury.gamesRemaining < 20) continue;
    if (get2KOvr(player) < 75) continue;

    const injuryKey = `${player.internalId}-${player.injury.type}`;
    if (reportedInjuries.has(injuryKey)) continue;

    const team = teams.find(t => t.id === player.tid);
    if (!team) continue;

    reportedInjuries.add(injuryKey);
    const item = withPortrait(NewsGenerator.generate('major_injury', currentDate, {
      playerName: player.name,
      teamName: team.name,
      injuryType: player.injury.type,
      duration: gamesToTime(player.injury.gamesRemaining),
    }), player.imgURL);
    if (item) news.push(item);
  }

  // ── 5. DRAMA — bad teams: 40% chance per batch ───────────────────────────
  if (Math.random() < 0.4) {
    const badTeams = teams.filter(t => {
      const played = t.wins + t.losses;
      return played >= 15 && t.wins / played < 0.40;
    });

    if (badTeams.length > 0) {
      const dramaTeam = badTeams[Math.floor(Math.random() * badTeams.length)];

      if (Math.random() < 0.5) {
        // Coach hot seat — team logo as image (fine to show immediately)
        const item = NewsGenerator.generate('coach_hot_seat', currentDate, {
          teamName: dramaTeam.name,
          teamCity: dramaTeam.region ?? dramaTeam.name.split(' ')[0],
        }, dramaTeam.logoUrl);
        if (item) news.push(item);
      } else {
        const star = players
          .filter(p => p.tid === dramaTeam.id && get2KOvr(p) >= 78)
          .sort((a, b) => get2KOvr(b) - get2KOvr(a))[0];
        if (star) {
          const item = withPortrait(NewsGenerator.generate('trade_rumor', currentDate, {
            playerName: star.name,
            teamName: dramaTeam.name,
          }), star.imgURL);
          if (item) news.push(item);
        }
      }
    }
  }

  // ── FALLBACK: If no news was generated (e.g. off-day batch), add a brief standings note ──
  if (news.length === 0 && teams.length > 0) {
    const east = teams.filter(t => (t as any).conference === 'East').sort((a: any, b: any) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)));
    const west = teams.filter(t => (t as any).conference === 'West').sort((a: any, b: any) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)));
    const eastLeader = east[0];
    const westLeader = west[0];
    if (eastLeader && westLeader) {
      news.push({
        id: `standings-recap-${Date.now()}`,
        headline: `Standings Update: ${eastLeader.name} Lead East, ${westLeader.name} Lead West`,
        content: `After the latest stretch of games, the ${eastLeader.name} (${eastLeader.wins}-${eastLeader.losses}) lead the Eastern Conference while the ${westLeader.name} (${westLeader.wins}-${westLeader.losses}) sit atop the West.`,
        date: currentDate,
        isNew: true,
        newsType: 'weekly' as any,
      });
    }
  }

  return news;
};
