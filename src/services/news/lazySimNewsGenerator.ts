import { NBATeam, NBAPlayer, GameResult, NewsItem } from '../../types';
import { NewsGenerator } from './NewsGenerator';
import { convertTo2KRating } from '../../utils/helpers';

const get2KOvr = (p: NBAPlayer) =>
  convertTo2KRating(p.overallRating ?? p.ratings?.[0]?.ovr ?? 0, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50, p.ratings?.[p.ratings.length - 1]?.tp);

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
      // Find the game this stat line came from
      const topGame = allSimResults.find(g =>
        (g.homeTeamId === top.teamId || g.awayTeamId === top.teamId) &&
        [...g.homeStats, ...g.awayStats].some(s => s.playerId === top.stat.playerId)
      );
      if (team) {
        const player = players.find(p => p.internalId === top.stat.playerId);
        const item = withPortrait(NewsGenerator.generate(isPreseason ? 'preseason_recap' : 'batch_recap', currentDate, {
          playerName: top.stat.name,
          teamName: team.name,
          pts: top.stat.pts,
          reb: top.stat.reb,
          ast: top.stat.ast,
        }), player?.imgURL);
        if (item) {
          if (topGame) { item.gameId = topGame.gameId; item.homeTeamId = topGame.homeTeamId; item.awayTeamId = topGame.awayTeamId; }
          news.push(item);
        }
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
          const item = withPortrait(NewsGenerator.generate(isPreseason ? 'preseason_performance' : 'monster_performance', game.date, {
            playerName: stat.name,
            teamName:     team.name,
            opponentName: opp.name,
            statValue: stat.pts,
            statType: 'PTS',
          }), player.imgURL);
          if (item) {
            item.gameId = game.gameId; item.homeTeamId = game.homeTeamId; item.awayTeamId = game.awayTeamId;
            news.push(item);
          }
          continue;
        }

        // Standard triple-double (10/10/10) — 60% chance to report
        if (stat.pts >= 10 && stat.reb >= 10 && stat.ast >= 10 && Math.random() < 0.6) {
          const item = withPortrait(NewsGenerator.generate('triple_double', game.date, {
            playerName: stat.name,
            teamName:   team.name,
            pts: stat.pts,
            reb: stat.reb,
            ast: stat.ast,
          }), player.imgURL);
          if (item) {
            item.gameId = game.gameId; item.homeTeamId = game.homeTeamId; item.awayTeamId = game.awayTeamId;
            news.push(item);
          }
        }
      }
    }
  }

  // ── 3b. GAME RESULTS — sample 1-2 notable games per batch ───────────────────
  if (!isPreseason && allSimResults.length > 0) {
    // Pick up to 2 games to report on (skip scrimmages, prefer closer or higher-scoring games)
    const eligibleGames = allSimResults.filter(g => {
      const ht = teams.find(t => t.id === g.homeTeamId);
      const at = teams.find(t => t.id === g.awayTeamId);
      return ht && at && ht !== at;
    });
    const shuffled = eligibleGames.sort(() => Math.random() - 0.5).slice(0, 2);
    for (const game of shuffled) {
      if (Math.random() > 0.5) continue; // 50% chance to skip — keeps feed fresh
      const homeTeam = teams.find(t => t.id === game.homeTeamId)!;
      const awayTeam = teams.find(t => t.id === game.awayTeamId)!;
      const homeWon = game.homeScore > game.awayScore;
      const winner = homeWon ? homeTeam : awayTeam;
      const loser = homeWon ? awayTeam : homeTeam;
      const winnerScore = homeWon ? game.homeScore : game.awayScore;
      const loserScore = homeWon ? game.awayScore : game.homeScore;
      const allStats = [...game.homeStats, ...game.awayStats].sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));
      const topStat = allStats[0];
      const item = NewsGenerator.generate('game_result', game.date, {
        winnerName: winner.name,
        loserName: loser.name,
        winnerScore,
        loserScore,
        winnerRecord: `${winner.wins}-${winner.losses}`,
        loserRecord: `${loser.wins}-${loser.losses}`,
        gameType: isPreseason ? 'preseason' : 'regular season',
        topPerformer: topStat?.name ?? 'The leading scorer',
        topPts: topStat?.pts ?? 0,
      }, winner.logoUrl);
      if (item) {
        item.gameId = game.gameId;
        item.homeTeamId = game.homeTeamId;
        item.awayTeamId = game.awayTeamId;
        news.push(item);
      }
    }
  }

  // ── 3c. TEAM FEATS — 30-39 PT games + triple-doubles (team-page only) ───────
  // These appear on the team home page but are filtered from the main news feed.
  for (const game of allSimResults) {
    const homeTeam = teams.find(t => t.id === game.homeTeamId);
    const awayTeam = teams.find(t => t.id === game.awayTeamId);
    if (!homeTeam || !awayTeam || homeTeam === awayTeam) continue;

    const sides: { stats: typeof game.homeStats; team: typeof homeTeam; opp: typeof awayTeam }[] = [
      { stats: game.homeStats, team: homeTeam, opp: awayTeam },
      { stats: game.awayStats, team: awayTeam, opp: homeTeam },
    ];

    for (const { stats, team, opp } of sides) {
      for (const stat of stats) {
        const player = players.find(p => p.internalId === stat.playerId);
        if (!player) continue;

        const isModestScorer = stat.pts >= 30 && stat.pts < 40; // already handled at 40+ by monster_performance
        const isTripleDouble = stat.pts >= 10 && stat.reb >= 10 && stat.ast >= 10;

        if (!isModestScorer && !isTripleDouble) continue;
        if (Math.random() > 0.55) continue; // 55% chance — keeps it sparse enough

        const item = withPortrait(NewsGenerator.generate('team_feat', game.date, {
          playerName: stat.name,
          teamName: team.name,
          opponentName: opp.name,
          pts: stat.pts,
          reb: stat.reb,
          ast: stat.ast,
        }), player.imgURL);
        if (item) {
          item.id = `news-feat-${game.gameId}-${stat.playerId}`;
          item.gameId = game.gameId;
          item.homeTeamId = game.homeTeamId;
          item.awayTeamId = game.awayTeamId;
          item.teamOnly = true;
          news.push(item);
        }
      }
    }
  }

  // ── 3d. DUO PERFORMANCES — both gameScore ≥ 20 on same team ────────────────
  for (const game of allSimResults) {
    const homeTeam = teams.find(t => t.id === game.homeTeamId);
    const awayTeam = teams.find(t => t.id === game.awayTeamId);
    if (!homeTeam || !awayTeam || homeTeam === awayTeam) continue;

    const sides: { stats: typeof game.homeStats; team: typeof homeTeam; opp: typeof awayTeam }[] = [
      { stats: game.homeStats, team: homeTeam, opp: awayTeam },
      { stats: game.awayStats, team: awayTeam, opp: homeTeam },
    ];

    for (const { stats, team, opp } of sides) {
      const stars = stats
        .filter(s => (s.gameScore ?? 0) >= 20)
        .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));
      if (stars.length < 2) continue;
      if (Math.random() > 0.65) continue; // 65% chance to generate
      const s1 = stars[0];
      const s2 = stars[1];
      const p1 = players.find(p => p.internalId === s1.playerId);
      const item = withPortrait(NewsGenerator.generate('duo_performance', game.date, {
        player1Name: s1.name,
        player2Name: s2.name,
        teamName: team.name,
        opponentName: opp.name,
        pts1: s1.pts,
        reb1: s1.reb,
        ast1: s1.ast,
        pts2: s2.pts,
        reb2: s2.reb,
        ast2: s2.ast,
        combinedPts: s1.pts + s2.pts,
      }), p1?.imgURL);
      if (item) {
        item.id = `news-duo-${game.gameId}-${s1.playerId}-${s2.playerId}`;
        item.gameId = game.gameId;
        item.homeTeamId = game.homeTeamId;
        item.awayTeamId = game.awayTeamId;
        news.push(item);
      }
    }
  }

  // ── 4. INJURIES — only newly-injured players from this sim batch ──────────
  // Pre-existing (BBGM/initial) injuries are NOT in allSimResults.injuries,
  // so they won't be re-reported on every batch. Stable IDs prevent duplicates.
  if (skipInjuries) return news;

  // Map playerId → the actual game date when the injury occurred
  const newlyInjuredIds = new Set<string>();
  const injuryGameDate = new Map<string, string>();
  for (const game of allSimResults) {
    if (!game.injuries?.length) continue;
    for (const inj of game.injuries) {
      newlyInjuredIds.add(inj.playerId);
      if (!injuryGameDate.has(inj.playerId)) injuryGameDate.set(inj.playerId, game.date);
    }
  }

  for (const player of players) {
    if (!newlyInjuredIds.has(player.internalId)) continue;
    if (!player.injury || player.injury.gamesRemaining <= 0) continue;

    const stableId = `news-injury-${player.internalId}-${player.injury.type.replace(/\s+/g, '-').toLowerCase()}`;
    if (reportedInjuries.has(stableId)) continue;

    const team = teams.find(t => t.id === player.tid);
    if (!team) continue;

    reportedInjuries.add(stableId);
    const injDate = injuryGameDate.get(player.internalId) || currentDate;
    const item = withPortrait(NewsGenerator.generate('major_injury', injDate, {
      playerName: player.name,
      teamName: team.name,
      injuryType: player.injury.type,
      duration: gamesToTime(player.injury.gamesRemaining),
    }), player.imgURL);
    if (item) {
      item.id = stableId; // stable ID prevents re-generation across batches
      news.push(item);
    }
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
  // Skip during preseason or when teams haven't played any games yet (all 0-0)
  const totalGamesPlayed = teams.reduce((sum, t) => sum + t.wins + t.losses, 0);
  if (news.length === 0 && teams.length > 0 && !isPreseason && totalGamesPlayed > 0) {
    const east = teams.filter(t => (t as any).conference === 'East').sort((a: any, b: any) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)));
    const west = teams.filter(t => (t as any).conference === 'West').sort((a: any, b: any) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)));
    const eastLeader = east[0];
    const westLeader = west[0];
    if (eastLeader && westLeader && (eastLeader.wins > 0 || westLeader.wins > 0)) {
      news.push({
        id: `standings-recap-${Date.now()}`,
        headline: `Standings Update: ${eastLeader.name} Lead East, ${westLeader.name} Lead West`,
        content: `After the latest stretch of games, the ${eastLeader.name} (${eastLeader.wins}-${eastLeader.losses}) lead the Eastern Conference while the ${westLeader.name} (${westLeader.wins}-${westLeader.losses}) sit atop the West.`,
        date: currentDate,
        category: 'batch_recap',
        isNew: true,
        newsType: 'weekly' as any,
      });
    }
  }

  return news;
};
