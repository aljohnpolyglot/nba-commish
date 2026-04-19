import { NBATeam, NBAPlayer, GameResult, NewsItem, PlayoffBracket, Game } from '../../types';
import { NewsGenerator } from './NewsGenerator';
import { convertTo2KRating } from '../../utils/helpers';
import { getOpeningNightDate } from '../../utils/dateUtils';

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
function dateIsPreseason(dateStr: string, openingNightMs: number): boolean {
  try { return new Date(dateStr).getTime() < openingNightMs; } catch { return false; }
}

export const generateLazySimNews = (
  teams: NBATeam[],
  players: NBAPlayer[],
  allSimResults: GameResult[],
  currentDate: string,
  reportedInjuries: Set<string>,
  skipInjuries = false,
  prevTeams?: NBATeam[],
  playoffs?: PlayoffBracket | null,
  schedule?: Game[],
  seasonYear = 2026
): NewsItem[] => {
  const OPENING_NIGHT = getOpeningNightDate(seasonYear).getTime();
  const news: NewsItem[] = [];
  const isPreseason = dateIsPreseason(currentDate, OPENING_NIGHT);
  // Suppress standings/season-narrative items during playoffs — series news is generated separately
  const isPlayoffs = !!playoffs && (playoffs.series.some(s => s.status !== 'pending') || playoffs.playInComplete);

  // Build set of team IDs that are active playoff participants (for news filtering)
  const playoffTeamIds = new Set<number>();
  if (isPlayoffs && playoffs) {
    playoffs.series.forEach(s => { playoffTeamIds.add(s.higherSeedTid); playoffTeamIds.add(s.lowerSeedTid); });
    // Also include play-in teams
    playoffs.playInGames?.forEach(p => {
      if (p.team1Tid > 0) playoffTeamIds.add(p.team1Tid);
      if (p.team2Tid > 0) playoffTeamIds.add(p.team2Tid);
    });
  }

  // Helper: is this game result a playoff game?
  const isPlayoffResult = (r: GameResult): boolean => {
    if (!schedule) return false;
    const g = schedule.find(sg => sg.gid === r.gameId);
    return !!(g?.isPlayoff || g?.isPlayIn);
  };

  // Helper: get series context string for a playoff game result.
  // Tracks per-game incremental series wins keyed by gameId so that batched games
  // each show their own in-game series score, not the final post-batch score.
  // Running wins per series ID → carries forward as we process games in order.
  const runningSeriesWins = new Map<string, { hW: number; lW: number }>();
  // gameId → wins AFTER this game
  const winsAfterGame = new Map<number, { hW: number; lW: number; seriesId: string }>();
  for (const r of allSimResults) {
    if (!schedule || !playoffs) break;
    const sg = schedule.find(g => g.gid === r.gameId);
    if (!sg?.playoffSeriesId) continue;
    const series = playoffs.series.find(s => s.id === sg.playoffSeriesId);
    if (!series) continue;
    const sid = sg.playoffSeriesId;
    if (!runningSeriesWins.has(sid)) {
      // Seed: start from 0 for this batch (pre-batch wins not tracked here,
      // but gameNum = hW+lW will be relative to batch start — acceptable)
      runningSeriesWins.set(sid, { hW: 0, lW: 0 });
    }
    const cur = runningSeriesWins.get(sid)!;
    const homeIsHigher = r.homeTeamId === series.higherSeedTid;
    const homeWon = r.homeScore > r.awayScore;
    if ((homeWon && homeIsHigher) || (!homeWon && !homeIsHigher)) cur.hW++;
    else cur.lW++;
    runningSeriesWins.set(sid, { ...cur });
    winsAfterGame.set(r.gameId, { hW: cur.hW, lW: cur.lW, seriesId: sid });
  }

  const getSeriesContext = (r: GameResult): string | null => {
    if (!playoffs || !schedule) return null;
    const g = schedule.find(sg => sg.gid === r.gameId);
    if (!g?.playoffSeriesId) return null;
    const series = playoffs.series.find(s => s.id === g.playoffSeriesId);
    if (!series) return null;
    const higher = teams.find(t => t.id === series.higherSeedTid);
    const lower = teams.find(t => t.id === series.lowerSeedTid);

    // Use per-game wins (relative to batch start); fall back to final series state
    const perGame = winsAfterGame.get(r.gameId);
    // Offset by pre-batch wins (final state minus batch contributions for this series)
    const batchHW = runningSeriesWins.get(g.playoffSeriesId)?.hW ?? 0;
    const batchLW = runningSeriesWins.get(g.playoffSeriesId)?.lW ?? 0;
    const preHW = series.higherSeedWins - batchHW;
    const preLW = series.lowerSeedWins - batchLW;
    const hW = perGame ? preHW + perGame.hW : series.higherSeedWins;
    const lW = perGame ? preLW + perGame.lW : series.lowerSeedWins;
    const gameNum = hW + lW;
    const winsNeeded = Math.ceil(series.gamesNeeded / 2);
    if (hW >= winsNeeded || lW >= winsNeeded) {
      const winner = hW >= winsNeeded ? higher : lower;
      return `Game ${gameNum} · ${winner?.name ?? 'Winner'} advance`;
    }
    if (hW === lW) return `Game ${gameNum} · Series tied ${hW}-${lW}`;
    const leader = hW > lW ? higher : lower;
    const leaderW = Math.max(hW, lW);
    const trailerW = Math.min(hW, lW);
    if (leaderW === winsNeeded - 1) return `Game ${gameNum} · ${leader?.name ?? 'Leader'} one win away`;
    return `Game ${gameNum} · ${leader?.name ?? 'Leader'} leads ${leaderW}-${trailerW}`;
  };

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
        const category = isPreseason ? 'preseason_recap' : 'batch_recap';
        const item = withPortrait(NewsGenerator.generate(category, currentDate, {
          playerName: top.stat.name,
          teamName: team.name,
          pts: top.stat.pts,
          reb: top.stat.reb,
          ast: top.stat.ast,
        }), player?.imgURL);
        if (item) {
          if (topGame) { item.gameId = topGame.gameId; item.homeTeamId = topGame.homeTeamId; item.awayTeamId = topGame.awayTeamId; }
          // Rewrite batch_recap headline during playoffs — always rephrase for postseason feel
          if (isPlayoffs && item) {
            const lastName = top.stat.name.split(' ').pop() ?? top.stat.name;
            const pts = top.stat.pts, reb = top.stat.reb, ast = top.stat.ast;
            const seriesCtx = topGame ? getSeriesContext(topGame) : null;
            const topGameSched = topGame && schedule?.find(sg => sg.gid === topGame.gameId);
            const playInGame = topGameSched?.isPlayIn;
            const topSeries = topGameSched?.playoffSeriesId
              ? playoffs?.series.find(s => s.id === topGameSched.playoffSeriesId)
              : undefined;
            const seriesRound = topSeries?.round ?? 0;
            const roundLabel = seriesRound === 4 ? 'NBA Finals'
              : seriesRound === 3 ? 'Conference Finals'
              : seriesRound === 2 ? 'Conference Semifinals'
              : playInGame ? 'Play-In Tournament' : 'First Round';
            const playInCtx = playInGame ? 'Play-In Tournament' : null;
            const contextLabel = seriesCtx ?? playInCtx;
            const isElimination = seriesCtx?.includes('advance') ?? false;
            // Determine if top performer's team actually won this game
            const topTeamWon = topGame
              ? (topGame.homeTeamId === top.teamId ? topGame.homeScore > topGame.awayScore : topGame.awayScore > topGame.homeScore)
              : true;
            const playoffTitles = contextLabel
              ? (isElimination && topTeamWon ? [
                  `${top.stat.name} Carries ${team.name} · ${contextLabel}`,
                  `${lastName} Leads the Way: ${pts}/${reb}/${ast} · ${contextLabel}`,
                ] : isElimination && !topTeamWon ? [
                  `${lastName} Pours in ${pts} in Vain — ${contextLabel}`,
                  `${top.stat.name} Shines in Defeat: ${pts} PTS · ${contextLabel}`,
                ] : [
                  `${top.stat.name} Drops ${pts} PTS · ${contextLabel}`,
                  `${lastName} Takes Over: ${pts}/${reb}/${ast} · ${contextLabel}`,
                  `${lastName} Erupts for ${pts} in the ${roundLabel}`,
                ])
              : [
                  `${lastName} Erupts for ${pts} in ${roundLabel} Action`,
                  `${top.stat.name}: ${pts}/${reb}/${ast} in the ${roundLabel}`,
                ];
            item.headline = playoffTitles[Math.floor(Math.random() * playoffTitles.length)];
          }
          news.push(item);
        }
      }
    }
  }

  // ── 2. WIN / LOSE STREAKS — regular season only ──
  // Streak news is only meaningful during the regular season. Suppress entirely during
  // playoffs and offseason (stale regular-season streaks don't belong in those phases).
  if (!isPlayoffs && !isPreseason) {
    const teamsWithGamesThisBatch = new Set(allSimResults.flatMap(r => [r.homeTeamId, r.awayTeamId].filter(Boolean)));
    const STREAK_THRESHOLDS = [5, 7, 10, 14];
    for (const team of teams) {
      if (!team.streak) continue;
      if (!teamsWithGamesThisBatch.has(team.id)) continue;
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

        // Suppress regular-season performance templates during playoffs —
        // batch recap and series news cover these with proper postseason framing.
        if (!isPlayoffs) {
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
  }

  // ── 3b. GAME RESULTS — playoffs: 1 per active series; regular season: 2 per batch ──
  if (!isPreseason && allSimResults.length > 0) {
    const eligibleGames = allSimResults.filter(g => {
      const ht = teams.find(t => t.id === g.homeTeamId);
      const at = teams.find(t => t.id === g.awayTeamId);
      return ht && at && ht !== at;
    });

    let gamesToReport: typeof eligibleGames;

    if (isPlayoffs) {
      // During playoffs: pick the best (closest score) game per series so every active series gets covered
      const bySeriesId = new Map<string, typeof eligibleGames[0]>();
      for (const g of eligibleGames) {
        if (!isPlayoffResult(g)) continue;
        const schedGame = schedule?.find(sg => sg.gid === g.gameId);
        const seriesId = schedGame?.playoffSeriesId ?? `${g.homeTeamId}-${g.awayTeamId}`;
        const diff = Math.abs(g.homeScore - g.awayScore);
        const prev = bySeriesId.get(seriesId);
        // Keep the closest game per series; if no playoff series id, keep one per team-pair
        if (!prev || diff < Math.abs(prev.homeScore - prev.awayScore)) {
          bySeriesId.set(seriesId, g);
        }
      }
      gamesToReport = Array.from(bySeriesId.values());
    } else {
      // Regular season: pick up to 2 notable games (50% chance each)
      gamesToReport = eligibleGames
        .sort((a, b) => Math.abs(a.homeScore - a.awayScore) - Math.abs(b.homeScore - b.awayScore))
        .slice(0, 2)
        .filter(() => Math.random() > 0.5);
    }

    for (const game of gamesToReport) {
      const homeTeam = teams.find(t => t.id === game.homeTeamId)!;
      const awayTeam = teams.find(t => t.id === game.awayTeamId)!;
      if (!homeTeam || !awayTeam) continue;
      const homeWon = game.homeScore > game.awayScore;
      const winner = homeWon ? homeTeam : awayTeam;
      const loser = homeWon ? awayTeam : homeTeam;
      const winnerScore = homeWon ? game.homeScore : game.awayScore;
      const loserScore = homeWon ? game.awayScore : game.homeScore;

      // Prefer the winner's top performer so headline framing is accurate
      const winnerStats = homeWon ? game.homeStats : game.awayStats;
      const allStats = [...game.homeStats, ...game.awayStats].sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));
      const winnerTopStat = winnerStats.sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0))[0];
      const topStat = winnerTopStat ?? allStats[0];
      const topPlayer = topStat ? players.find(p => p.internalId === topStat.playerId) : undefined;

      const gameIsPlayoff = isPlayoffResult(game);
      const seriesCtx = gameIsPlayoff ? getSeriesContext(game) : null;

      // Pass team logo as image (static, no enrichment) and player portrait as
      // playerPortraitUrl (triggers Imagn enrichment fallback in NewsFeed)
      let item = NewsGenerator.generate('game_result', game.date, {
        winnerName: winner.name,
        loserName: loser.name,
        winnerScore,
        loserScore,
        winnerRecord: seriesCtx ?? `${winner.wins}-${winner.losses}`,
        loserRecord: `${loser.wins}-${loser.losses}`,
        gameType: gameIsPlayoff ? 'playoff' : 'regular season',
        topPerformer: topStat?.name ?? 'The leading scorer',
        topPts: topStat?.pts ?? 0,
      }, undefined); // no static image — let Imagn enrichment run
      if (item && topPlayer?.imgURL) item.playerPortraitUrl = topPlayer.imgURL;

      // Rewrite headline for playoff games to feel like postseason
      if (item && gameIsPlayoff && seriesCtx && topStat) {
        const lastName = topStat.name.split(' ').pop() ?? topStat.name;
        const clinched = seriesCtx.includes('advance');
        const tied = seriesCtx.includes('tied');
        const winnerLeading = !clinched && (seriesCtx.includes(`${winner.name} leads`) || seriesCtx.includes(`${winner.name} one win away`));
        const winnerTrailing = !clinched && !tied && !winnerLeading;

        let playoffHeadlines: string[];
        if (clinched) {
          playoffHeadlines = [
            `${topStat.name} Drops ${topStat.pts} as ${winner.name} Close Out ${loser.name}`,
            `${winner.name} Clinch — ${lastName} Seals It with ${topStat.pts} PTS · ${seriesCtx}`,
            `Series Over: ${lastName} Leads ${winner.name} Past ${loser.name} · ${seriesCtx}`,
            `Playoffs: ${winner.name} Eliminate ${loser.name} ${winnerScore}-${loserScore} · ${seriesCtx}`,
          ];
        } else if (winnerTrailing) {
          playoffHeadlines = [
            `${topStat.name} Drops ${topStat.pts} to Keep ${winner.name} Alive · ${seriesCtx}`,
            `${winner.name} Stay Alive — ${lastName} Pours in ${topStat.pts} PTS · ${seriesCtx}`,
            `${lastName} Keeps ${winner.name} in It with ${topStat.pts} PTS · ${seriesCtx}`,
            `Playoffs: ${winner.name} Hold Off ${loser.name} ${winnerScore}-${loserScore} · ${seriesCtx}`,
          ];
        } else {
          playoffHeadlines = [
            `${topStat.name} Drops ${topStat.pts} as ${winner.name} Take ${seriesCtx}`,
            `${winner.name} Win ${seriesCtx} — ${lastName} Leads with ${topStat.pts} PTS`,
            `${lastName} Erupts for ${topStat.pts} to Push ${winner.name}: ${seriesCtx}`,
            `Playoffs: ${winner.name} Hold Off ${loser.name} ${winnerScore}-${loserScore} · ${seriesCtx}`,
          ];
        }
        item.headline = playoffHeadlines[Math.floor(Math.random() * playoffHeadlines.length)];
      }

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
        // Add playoff context to duo headline
        if (isPlayoffs && schedule) {
          const gameForDuo = schedule.find(sg => sg.gid === game.gameId);
          if (gameForDuo?.isPlayoff || gameForDuo?.isPlayIn) {
            const seriesCtxForDuo = getSeriesContext(game);
            const duoCtx = seriesCtxForDuo ?? (gameForDuo.isPlayIn ? 'Play-In Tournament' : null);
            if (duoCtx) {
              const lastName1 = s1.name.split(' ').pop() ?? s1.name;
              const lastName2 = s2.name.split(' ').pop() ?? s2.name;
              const duoPlayoffHeadlines = [
                `${s1.name} and ${s2.name} Power ${team.name} · ${duoCtx}`,
                `Postseason Duo: ${lastName1} & ${lastName2} Combine for ${s1.pts + s2.pts} · ${duoCtx}`,
                `${lastName1}/${lastName2} Show Up When It Matters · ${duoCtx}`,
              ];
              item.headline = duoPlayoffHeadlines[Math.floor(Math.random() * duoPlayoffHeadlines.length)];
            }
          }
        }
        news.push(item);
      }
    }
  }

  // ── 3e. PLAY-IN ADVANCEMENT / ELIMINATION NEWS ───────────────────────────
  if (playoffs && schedule) {
    for (const result of allSimResults) {
      const g = schedule.find(sg => sg.gid === result.gameId);
      if (!g?.isPlayIn || !g.playoffSeriesId) continue;
      const pig = playoffs.playInGames.find(p => p.id === g.playoffSeriesId);
      if (!pig?.played || pig.winnerId == null) continue;

      const winner = teams.find(t => t.id === pig.winnerId);
      const loserTid = pig.team1Tid === pig.winnerId ? pig.team2Tid : pig.team1Tid;
      const loser = teams.find(t => t.id === loserTid);
      if (!winner || !loser) continue;

      const stableId = `news-playin-${g.playoffSeriesId}-${result.gameId}`;
      if (news.some(n => n.id === stableId)) continue;

      const allStats = [...result.homeStats, ...result.awayStats].sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));
      const topStat = allStats[0];
      const winnerScore = result.homeTeamId === winner.id ? result.homeScore : result.awayScore;
      const loserScore = result.homeTeamId === winner.id ? result.awayScore : result.homeScore;
      const topNote = topStat ? ` ${topStat.name} led the way with ${topStat.pts} points.` : '';

      let headline: string;
      let body: string;

      if (pig.gameType === 'loserGame') {
        headline = `${winner.name} Punch Their Ticket to the Playoffs — ${loser.name} Eliminated`;
        body = `${winner.name} edged out ${loser.name} ${winnerScore}–${loserScore} in the Play-In eliminator to claim the 8-seed.${topNote}`;
      } else if (pig.gameType === '7v8') {
        headline = `${winner.name} Win Play-In, Advance as 7-Seed`;
        body = `${winner.name} defeated ${loser.name} ${winnerScore}–${loserScore} in the Play-In to advance directly to the first round. ${loser.name} get another chance in the loser game.${topNote}`;
      } else {
        headline = `${winner.name} Survive Play-In — ${loser.name} Season Ends`;
        body = `${winner.name} defeated ${loser.name} ${winnerScore}–${loserScore}. ${loser.name} are eliminated. ${winner.name} will now face the loser of the 7v8 game for the 8-seed.${topNote}`;
      }

      news.push({
        id: stableId,
        headline,
        body,
        category: 'game_result',
        date: result.date || currentDate,
        image: winner.logoUrl,
        isNew: true,
        gameId: result.gameId,
        homeTeamId: result.homeTeamId,
        awayTeamId: result.awayTeamId,
      } as unknown as NewsItem);
    }
  }

  // ── 3f. CHAMPIONSHIP NEWS — when Finals clinch game is in this batch ───────
  if (playoffs?.champion && playoffs.bracketComplete && schedule) {
    const finals = playoffs.series.find(s => s.round === 4 && s.status === 'complete');
    if (finals) {
      const champResult = allSimResults.find(r => {
        const g = schedule.find(sg => sg.gid === r.gameId);
        return g?.playoffSeriesId === finals.id;
      });
      if (champResult) {
        const stableId = `news-championship-${playoffs.season ?? 'finals'}-${playoffs.champion}`;
        if (!news.some(n => n.id === stableId)) {
          const champTeam = teams.find(t => t.id === playoffs.champion);
          const loserTid = finals.higherSeedTid === playoffs.champion ? finals.lowerSeedTid : finals.higherSeedTid;
          const loserTeam = teams.find(t => t.id === loserTid);
          const totalGames = finals.higherSeedWins + finals.lowerSeedWins;
          const year = new Date(currentDate).getFullYear();
          const champWins = finals.winnerId === finals.higherSeedTid ? finals.higherSeedWins : finals.lowerSeedWins;
          const loserWins = finals.winnerId === finals.higherSeedTid ? finals.lowerSeedWins : finals.higherSeedWins;
          const winnerScore = champResult.homeTeamId === playoffs.champion ? champResult.homeScore : champResult.awayScore;
          const loserScore  = champResult.homeTeamId === playoffs.champion ? champResult.awayScore  : champResult.homeScore;

          const allStats = [...champResult.homeStats, ...champResult.awayStats]
            .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));
          const mvpStat = allStats[0];
          const mvpPlayer = mvpStat ? players.find(p => p.internalId === mvpStat.playerId) : null;

          const headlines = [
            `${champTeam?.name ?? 'Champions'} Win the NBA Title — ${year} NBA Champions`,
            `${champTeam?.abbrev ?? '???'} Are NBA Champions! Historic Run Ends With ${totalGames}-Game Finals`,
            `${champTeam?.name ?? 'Champions'} Defeat ${loserTeam?.name ?? 'Opponents'} in ${totalGames} Games, Claim ${year} Championship`,
          ];
          const headline = headlines[Math.floor(Math.random() * headlines.length)];

          const mvpNote = mvpPlayer ? ` ${mvpPlayer.name} led the way with ${mvpStat.pts} points, ${mvpStat.reb} rebounds, and ${mvpStat.ast} assists to earn the Finals MVP.` : '';
          const body = `The ${champTeam?.name ?? 'Champions'} are ${year} NBA Champions after defeating the ${loserTeam?.name ?? 'opponent'} ${winnerScore}–${loserScore} in Game ${totalGames} to win the series ${champWins}–${loserWins}.${mvpNote} The city of ${champTeam?.region ?? champTeam?.name} erupts in celebration as the confetti falls.`;

          news.push({
            id: stableId,
            headline,
            body,
            category: 'game_result',
            date: currentDate,
            image: champTeam?.logoUrl,
            isNew: true,
            gameId: champResult.gameId,
            homeTeamId: champResult.homeTeamId,
            awayTeamId: champResult.awayTeamId,
          } as unknown as NewsItem);
        }
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

    // During playoffs, only report injuries for players with meaningful playing time (MPG > 20)
    if (isPlayoffs) {
      const playoffStat = player.stats?.find((s: any) => s.playoffs === true && s.season === seasonYear);
      const gp = playoffStat?.gp ?? 0;
      const totalMin = playoffStat?.min ?? 0;
      const playoffMpg = gp > 0 ? totalMin / gp : 0;
      if (playoffMpg < 20) continue;
    }

    // Stable ID format must match the pre-seed format in lazySimRunner: `${internalId}-${injuryType}`
    const stableId = `${player.internalId}-${player.injury.type}`;
    if (reportedInjuries.has(stableId)) continue;

    const team = teams.find(t => t.id === player.tid);
    if (!team) continue;

    reportedInjuries.add(stableId);
    const injDate = injuryGameDate.get(player.internalId) || currentDate;
    const newsId = `news-injury-${stableId.replace(/\s+/g, '-').toLowerCase()}`;

    let item;
    if (isPlayoffs && playoffs) {
      const playerSeries = playoffs.series.find(s =>
        s.status !== 'complete' &&
        (s.higherSeedTid === player.tid || s.lowerSeedTid === player.tid)
      );
      const opponentTeam = playerSeries
        ? teams.find(t => t.id === (playerSeries.higherSeedTid === player.tid ? playerSeries.lowerSeedTid : playerSeries.higherSeedTid))
        : undefined;
      const gamesLeft = player.injury.gamesRemaining;
      const maxSeriesGames = playerSeries?.gamesNeeded ?? 7;
      const currentGamesInSeries = playerSeries ? playerSeries.higherSeedWins + playerSeries.lowerSeedWins : 0;
      const gamesRemainingInSeries = maxSeriesGames - currentGamesInSeries;
      const returnGameNumber = currentGamesInSeries + gamesLeft + 1;

      // Out for playoffs: injury exceeds the whole series (or no active series found)
      // Out for series: would miss more games than the series has left, OR >=4 games
      // Out for game(s): will return within this series (returnGame must be ≤ maxSeriesGames)
      const outForPlayoffs = !playerSeries || gamesLeft >= maxSeriesGames;
      const outForSeries = !outForPlayoffs && (gamesLeft >= gamesRemainingInSeries || returnGameNumber > maxSeriesGames);

      if (outForPlayoffs) {
        item = withPortrait(NewsGenerator.generate('playoff_injury_out', injDate, {
          playerName: player.name, teamName: team.name, injuryType: player.injury.type,
          opponentName: opponentTeam?.name ?? 'their opponent',
        }), player.imgURL);
      } else if (outForSeries) {
        item = withPortrait(NewsGenerator.generate('playoff_injury_series', injDate, {
          playerName: player.name, teamName: team.name, injuryType: player.injury.type,
          opponentName: opponentTeam?.name ?? 'their opponent',
        }), player.imgURL);
      } else {
        item = withPortrait(NewsGenerator.generate('playoff_injury_game', injDate, {
          playerName: player.name, teamName: team.name, injuryType: player.injury.type,
          opponentName: opponentTeam?.name ?? 'their opponent',
          gamesCount: gamesLeft,
          gameNumber: returnGameNumber,
        }), player.imgURL);
      }
    } else {
      item = withPortrait(NewsGenerator.generate('major_injury', injDate, {
        playerName: player.name,
        teamName: team.name,
        injuryType: player.injury.type,
        duration: gamesToTime(player.injury.gamesRemaining),
      }), player.imgURL);
    }

    if (item) {
      item.id = newsId; // stable ID prevents re-generation across batches
      news.push(item);
    }
  }

  // ── 5. DRAMA — bad teams: 40% chance per batch (suppressed during playoffs) ──
  if (!isPlayoffs && Math.random() < 0.4) {
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

  // ── FALLBACK: If no news was generated (e.g. off-day batch), add a brief standings/playoff note ──
  // Skip during preseason or when teams haven't played any games yet (all 0-0)
  const totalGamesPlayed = teams.reduce((sum, t) => sum + t.wins + t.losses, 0);
  if (news.length === 0 && teams.length > 0 && !isPreseason && totalGamesPlayed > 0) {
    if (isPlayoffs) {
      // During playoffs: show active series summary instead of standings
      const activeSeries = playoffs!.series.filter(s => s.status === 'active');
      if (activeSeries.length > 0) {
        const s = activeSeries[0];
        const higher = teams.find(t => t.id === s.higherSeedTid);
        const lower  = teams.find(t => t.id === s.lowerSeedTid);
        if (higher && lower) {
          const leader = s.higherSeedWins > s.lowerSeedWins ? higher : s.lowerSeedWins > s.higherSeedWins ? lower : null;
          const content = leader
            ? `The ${higher.name} and ${lower.name} continue their series. ${leader.name} lead ${Math.max(s.higherSeedWins, s.lowerSeedWins)}-${Math.min(s.higherSeedWins, s.lowerSeedWins)}.`
            : `The ${higher.name} and ${lower.name} are tied in their series at ${s.higherSeedWins}-${s.lowerSeedWins}.`;
          news.push({
            id: `playoff-update-${s.id}-${Date.now()}`,
            headline: `Playoff Update: ${higher.name} vs. ${lower.name}`,
            content,
            date: currentDate,
            category: 'batch_recap',
            isNew: true,
            newsType: 'weekly' as any,
            image: leader?.logoUrl,
          });
        }
      }
    } else {
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
  }

  return news;
};
