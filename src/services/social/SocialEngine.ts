import { GameResult, PlayerGameStats } from '../simulation/StatGenerator';
import { NBAPlayer, NBATeam, SocialPost, PlayoffBracket, Game } from '../../types';
import { SOCIAL_HANDLES } from '../../data/social/handles';
import { SOCIAL_TEMPLATES } from './SocialRegistry';
import { SocialContext } from './types';
import { TEAM_ARENAS } from '../../data/arenas';
import { TEAM_HANDLES } from '../../data/teamHandles';
import { fetchAvatarData, getAvatarByHandle } from '../avatarService';
import { SettingsManager } from '../SettingsManager';

// Handles whose injury/news templates are suppressed when LLM is active
// (the LLM generates richer, more contextual versions of these posts)
const LLM_OWNED_HANDLES = new Set(['shams', 'woj']);

// ─────────────────────────────────────────────────────────────────────────────
// HOW MANY POSTS PER HANDLE PER GAME (max)
// Keeps the feed feeling like a real timeline, not a spam wall
// ─────────────────────────────────────────────────────────────────────────────
const HANDLE_POST_CAPS: Record<string, number> = {
    statmuse:        3,
    bball_forever:   3,
    legion_hoops:    3,
    nba_central:     2,
    hoop_central:    2,
    bleacher_report: 3,
    nba_official:    2,
    underdog_nba:    4, // injury/lineup utility — more is fine
    shams:           2,
    nba_centel:      1,
    nba_memes:       1,
};
const DEFAULT_CAP = 2;

export class SocialEngine {

  constructor() {}

  async generateDailyPosts(
    gameResults: GameResult[],
    players: NBAPlayer[],
    teams: NBATeam[],
    date: string,
    daysToSimulate: number = 1,
    playoffs?: PlayoffBracket | null,
    schedule?: Game[]
  ): Promise<SocialPost[]> {
    const posts: SocialPost[] = [];
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    const avatars = await fetchAvatarData();
    
    const multiplier = daysToSimulate <= 1 ? 1.0 : Math.max(0.05, 1.0 / daysToSimulate);

    for (const result of gameResults) {
        // ── Per-game dedup maps ──────────────────────────────────────────────
        // usedTemplateIds: prevents same template firing twice in same game
        const usedTemplateIds = new Set<string>();

        // handlePlayerUsed: prevents same handle posting about same player twice
        // key: `${handleId}::${playerId}`
        const handlePlayerUsed = new Set<string>();

        // handlePostCount: enforces per-handle caps per game
        // key: handleId → count
        const handlePostCount: Record<string, number> = {};

        const homeTeam = teams.find(t => t.id === result.homeTeamId);
        const awayTeam = teams.find(t => t.id === result.awayTeamId);
        if (!homeTeam || !awayTeam) continue;

        // During playoffs, skip regular-season game-recap templates for playoff games
        // (generatePlayoffPosts handles those with proper series context). Only injury
        // context still fires so Shams injury posts work during playoffs.
        const isPlayoffGame = playoffs && schedule
          ? schedule.some(g => g.gid === result.gameId && (g.isPlayoff || g.isPlayIn))
          : false;

        const baseCtx = { game: result, date, dayOfWeek, players, teams };

        if (!isPlayoffGame) {
          // 1. Team Contexts (no player — game recap posts)
          this.processContext(posts, {
              ...baseCtx, team: homeTeam, opponent: awayTeam, stats: null
          }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier);

          this.processContext(posts, {
              ...baseCtx, team: awayTeam, opponent: homeTeam, stats: null
          }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier);

          // 2. Player Contexts — sorted by gameScore desc so stars get priority
          const allStats = [...result.homeStats, ...result.awayStats]
              .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));

          for (const stat of allStats) {
              const player = players.find(p => p.internalId === stat.playerId);
              if (!player) continue;

              const team     = player.tid === homeTeam.id ? homeTeam : awayTeam;
              const opponent = player.tid === homeTeam.id ? awayTeam : homeTeam;

              this.processContext(posts, {
                  ...baseCtx, player, team, opponent, stats: stat
              }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier);
          }

          // 3. Injury Contexts (regular season only — Shams handles injuries during playoffs)
          if (result.injuries) {
              for (const injury of result.injuries) {
                  const player = players.find(p => p.internalId === injury.playerId);
                  if (!player || ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '')) continue;

                  const team     = player.tid === homeTeam.id ? homeTeam : awayTeam;
                  const opponent = player.tid === homeTeam.id ? awayTeam : homeTeam;

                  this.processContext(posts, {
                      ...baseCtx, player, team, opponent, injury
                  }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier);
              }
          }
        } // end !isPlayoffGame
    }

    // Playoff-specific social posts — fire when series context is available
    if (playoffs && schedule) {
      const avatars = await fetchAvatarData();
      const playoffPosts = this.generatePlayoffPosts(gameResults, teams, players, date, playoffs, schedule, avatars, daysToSimulate);
      posts.push(...playoffPosts);
    }

    return posts;
  }

  private generatePlayoffPosts(
    gameResults: GameResult[],
    teams: NBATeam[],
    players: NBAPlayer[],
    date: string,
    playoffs: PlayoffBracket,
    schedule: Game[],
    avatars: any[],
    daysToSimulate: number
  ): SocialPost[] {
    const posts: SocialPost[] = [];
    const multiplier = daysToSimulate <= 1 ? 1.0 : Math.max(0.1, 1.0 / daysToSimulate);

    const roundName = (round: number, conf?: 'East' | 'West'): string => {
      if (round === 1) return conf ? `${conf}ern First Round` : 'First Round';
      if (round === 2) return conf ? `${conf}ern Semifinals` : 'Semifinals';
      if (round === 3) return conf ? `${conf}ern Conference Finals` : 'Conference Finals';
      return 'NBA Finals';
    };

    const roundAbbr = (round: number): string => {
      if (round === 1) return 'R1';
      if (round === 2) return 'Semis';
      if (round === 3) return 'Conf Finals';
      return 'Finals';
    };

    const makePost = (handle: string, content: string, teamLogoUrl?: string, playerPortraitUrl?: string, gameData?: any): SocialPost | null => {
      const handleObj = Object.values(SOCIAL_HANDLES).find(h => h.id === handle);
      if (!handleObj) return null;
      const avatarUrl = getAvatarByHandle(handleObj.handle, avatars) || handleObj.avatarUrl;
      const postDate = new Date(date);
      postDate.setHours(20 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
      return {
        id: crypto.randomUUID(),
        author: handleObj.name,
        handle: `@${handleObj.handle}`,
        avatarUrl,
        content,
        likes: Math.floor(Math.random() * 8000) + 500,
        retweets: Math.floor(Math.random() * 2000) + 100,
        date: postDate.toISOString(),
        source: 'TwitterX',
        category: 'GAME_EVENT',
        data: gameData ?? {},
        teamLogoUrl,
        playerPortraitUrl,
        isNew: true,
      };
    };

    for (const result of gameResults) {
      const schedGame = schedule.find(g => g.gid === result.gameId);
      if (!schedGame?.isPlayoff || !schedGame.playoffSeriesId) continue;

      const series = playoffs.series.find(s => s.id === schedGame.playoffSeriesId);
      if (!series) continue;

      const winner = teams.find(t => t.id === result.winnerId);
      const loser  = teams.find(t => t.id === (result.homeTeamId === result.winnerId ? result.awayTeamId : result.homeTeamId));
      if (!winner || !loser) continue;

      const higherSeedTeam = teams.find(t => t.id === series.higherSeedTid);
      const lowerSeedTeam  = teams.find(t => t.id === series.lowerSeedTid);
      if (!higherSeedTeam || !lowerSeedTeam) continue;

      const higherWins = series.higherSeedWins;
      const lowerWins  = series.lowerSeedWins;
      const totalGames = higherWins + lowerWins;
      const winsNeeded = Math.ceil(series.gamesNeeded / 2);
      const isComplete = series.status === 'complete';
      const conf = series.round < 4
        ? (higherSeedTeam as any).conference === 'East' ? 'East' : 'West'
        : undefined;
      const rName = roundName(series.round, conf as any);
      const rAbbr = roundAbbr(series.round);

      // Series leader context
      const leaderTeam = higherWins > lowerWins ? higherSeedTeam
        : lowerWins > higherWins ? lowerSeedTeam
        : null; // tied
      const leaderWins = Math.max(higherWins, lowerWins);
      const trailerWins = Math.min(higherWins, lowerWins);

      // Top performer
      const allStats = [...result.homeStats, ...result.awayStats]
        .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));
      const topStat = allStats[0];
      const topPlayer = topStat ? players.find(p => p.internalId === topStat.playerId) : null;

      if (isComplete) {
        const isChampionship = series.round === 4;
        const year = new Date(date).getFullYear();
        const winnerScore = result.homeTeamId === winner.id ? result.homeScore : result.awayScore;
        const loserScore  = result.homeTeamId === loser.id  ? result.homeScore : result.awayScore;
        const seriesScore = higherSeedTeam.id === winner.id ? `${higherWins}-${lowerWins}` : `${lowerWins}-${higherWins}`;

        // ── Series clinching posts — always fires for @NBA ───────────────────
        {
          const advanceMsg = !isChampionship
            ? `FINAL | ${rName} — Game ${totalGames}\n\n${winner.name} ${winnerScore} – ${loserScore} ${loser.name}\n\n${winner.abbrev} advance to the ${roundName(series.round + 1)}! Series: ${seriesScore}\n\n#NBAPlayoffs`
            : `FINAL | NBA Finals — Game ${totalGames}\n\n${winner.name} ${winnerScore} – ${loserScore} ${loser.name}\n\n🏆 ${winner.name.toUpperCase()} ARE YOUR ${year} NBA CHAMPIONS!\n\n${winner.abbrev} win the series ${seriesScore}`;
          const gameCardData = {
            templateId: isChampionship ? 'nba_finals_clinch' : 'nba_playoff_clinch',
            gameId: result.gameId,
            playerName: topStat?.name,
            homeTeam: { abbrev: higherSeedTeam.abbrev, logoUrl: higherSeedTeam.logoUrl ?? '', score: higherSeedTeam.id === result.homeTeamId ? result.homeScore : result.awayScore, color: (higherSeedTeam as any).colors?.[0] ?? '#1d428a', wins: higherSeedTeam.wins ?? 0, losses: higherSeedTeam.losses ?? 0 },
            awayTeam: { abbrev: lowerSeedTeam.abbrev, logoUrl: lowerSeedTeam.logoUrl ?? '', score: lowerSeedTeam.id === result.homeTeamId ? result.homeScore : result.awayScore, color: (lowerSeedTeam as any).colors?.[0] ?? '#c8102e', wins: lowerSeedTeam.wins ?? 0, losses: lowerSeedTeam.losses ?? 0 },
            winnerId: result.winnerId, isOT: result.isOT ?? false,
          };
          const p = makePost('nba_official', advanceMsg, winner.logoUrl, topPlayer?.imgURL, gameCardData);
          if (p) {
            if (isChampionship) { p.likes = 250000 + Math.floor(Math.random() * 200000); p.retweets = 80000 + Math.floor(Math.random() * 60000); }
            posts.push(p);
          }
        }

        if (Math.random() < 0.75 * multiplier) {
          const reactions = !isChampionship
            ? [
                `${winner.abbrev} advance. ${loser.abbrev} eliminated. ${rAbbr} done.`,
                `${winner.name} move on — ${loser.name} go home.`,
                `Series over in ${totalGames} games. ${winner.abbrev} onto the next round.`,
                `${winner.abbrev} punch their ticket. ${loser.abbrev} season is over.`,
              ]
            : [
                `${winner.abbrev} WIN THE CHIP 🏆🏆🏆\n\nNBA CHAMPIONS.`,
                `IT'S OVER. THE ${winner.name.toUpperCase()} ARE NBA CHAMPIONS. 🏆`,
                `${winner.abbrev} in ${totalGames}. WORLD CHAMPIONS.`,
                `${winner.name.toUpperCase()} ARE CHAMPIONS OF THE WORLD 🏆`,
              ];
          const content = reactions[Math.floor(Math.random() * reactions.length)];
          const p = makePost('nba_central', content, winner.logoUrl);
          if (p) {
            if (isChampionship) { p.likes = 180000 + Math.floor(Math.random() * 120000); p.retweets = 55000 + Math.floor(Math.random() * 40000); }
            posts.push(p);
          }
        }

        if (topPlayer && Math.random() < 0.65 * multiplier) {
          const lines = !isChampionship
            ? [
                `${topPlayer.name} in the ${rAbbr}: ${topStat.pts}/${topStat.reb}/${topStat.ast}. What a series.`,
                `${topPlayer.name} closes out the series with ${topStat.pts} points. ${winner.abbrev} advance.`,
                `Playoff ${topPlayer.name}: ${topStat.pts}pts, ${topStat.reb}reb, ${topStat.ast}ast in Game ${totalGames}.`,
              ]
            : [
                `${topPlayer.name} FINALS MVP. ${topStat.pts}/${topStat.reb}/${topStat.ast} in Game ${totalGames}. CHAMPION. 🏆`,
                `${topPlayer.name} is a CHAMPION. ${topStat.pts} points in the clincher. ${winner.abbrev} win the title.`,
                `Finals MVP ${topPlayer.name}: ${topStat.pts}/${topStat.reb}/${topStat.ast}. ${winner.abbrev} are NBA Champions.`,
              ];
          const p = makePost('legion_hoops', lines[Math.floor(Math.random() * lines.length)], undefined, topPlayer.imgURL);
          if (p) {
            if (isChampionship) { p.likes = 120000 + Math.floor(Math.random() * 80000); p.retweets = 35000 + Math.floor(Math.random() * 25000); }
            posts.push(p);
          }
        }

        // ── Extra championship celebration burst ─────────────────────────────
        if (isChampionship) {
          const celebPosts: Array<[string, string]> = [
            ['bleacher_report', `🚨 BREAKING: The ${winner.name} are the ${year} NBA Champions. They win in ${totalGames} games over the ${loser.name}. 🏆`],
            ['hoop_central',    `${winner.abbrev} WIN THE CHIP!!!! ${winner.name} are NBA Champions 🏆🏆🏆`],
            ['statmuse',        `${winner.name} ${year} NBA Champions\n\n${totalGames} games needed`],
            ['bball_forever',   `${winner.name.toUpperCase()} ARE CHAMPIONS OF THE WORLD 🌍🏆\n\nThis city deserves it.`],
            ['nba_centel',      `${winner.abbrev} FANS STORMING THE COURT RIGHT NOW 👀`],
          ];
          for (const [handle, content] of celebPosts) {
            if (Math.random() < 0.80 * multiplier) {
              const p = makePost(handle, content, winner.logoUrl);
              if (p) {
                p.likes    = 80000 + Math.floor(Math.random() * 120000);
                p.retweets = 20000 + Math.floor(Math.random() * 40000);
                posts.push(p);
              }
            }
          }
          // Top player championship callout
          if (topPlayer) {
            if (Math.random() < 0.80 * multiplier) {
              const content = `${topPlayer.name} IS AN NBA CHAMPION 🏆\n\n${topStat.pts}/${topStat.reb}/${topStat.ast} in the clinching game. Add it to the resume.`;
              const p = makePost('bleacher_report', content, undefined, topPlayer.imgURL);
              if (p) { p.likes = 90000 + Math.floor(Math.random() * 60000); p.retweets = 28000 + Math.floor(Math.random() * 20000); posts.push(p); }
            }
            if (Math.random() < 0.70 * multiplier) {
              const content = `🏆 ${topPlayer.name} just won his ring.\n\n${topStat.pts} PTS · ${topStat.reb} REB · ${topStat.ast} AST\n\nFinale MVP. Champion.`;
              const p = makePost('statmuse', content, undefined, topPlayer.imgURL);
              if (p) { p.likes = 70000 + Math.floor(Math.random() * 50000); p.retweets = 22000 + Math.floor(Math.random() * 15000); posts.push(p); }
            }
          }
        }

      } else {
        // ── In-series game posts ─────────────────────────────────────────────
        const tag = series.round === 4 ? '#NBAFinals' : '#NBAPlayoffs';
        const winnerScore = result.homeTeamId === winner.id ? result.homeScore : result.awayScore;
        const loserScore  = result.homeTeamId === loser.id  ? result.homeScore : result.awayScore;
        const winnerWinsInSeries = higherSeedTeam.id === winner.id ? higherWins : lowerWins;
        const loserWinsInSeries  = higherSeedTeam.id === loser.id  ? higherWins : lowerWins;
        const isGame7       = higherWins === winsNeeded - 1 && lowerWins === winsNeeded - 1;
        const isEliminationGame = Math.max(winnerWinsInSeries, loserWinsInSeries) === winsNeeded - 1;
        const loserOnBrink  = loserWinsInSeries === winsNeeded - 1 && winnerWinsInSeries < winsNeeded - 1; // loser was 1 game away from advancing but just lost

        // NBA Official box score — fires for EVERY playoff game (no multiplier)
        {
          const seriesLine = isGame7
            ? `🚨 SERIES TIED 3-3. GAME 7 IS SET.`
            : leaderTeam
              ? `${leaderTeam.abbrev} lead ${leaderWins}-${trailerWins}`
              : `Series tied ${higherWins}-${lowerWins}`;
          const statLine = topPlayer && topStat
            ? `\n\n${topPlayer.name}: ${topStat.pts} PTS | ${topStat.reb} REB | ${topStat.ast} AST`
            : '';
          const content = `FINAL | ${rName} — Game ${totalGames}\n\n${winner.name} ${winnerScore} – ${loserScore} ${loser.name}${statLine}\n\n${seriesLine}\n\n${tag}`;
          // Build game card data (renders the home/away score box in the feed)
          const homeTeam = teams.find(t => t.id === result.homeTeamId);
          const awayTeam = teams.find(t => t.id === result.awayTeamId);
          const gameCardData = homeTeam && awayTeam ? {
            templateId: series.round === 4 ? 'nba_finals_game' : 'nba_playoff_game',
            gameId: result.gameId,
            playerName: topStat?.name,
            homeTeam: { abbrev: homeTeam.abbrev, logoUrl: homeTeam.logoUrl ?? '', score: result.homeScore, color: (homeTeam as any).colors?.[0] ?? '#1d428a', wins: homeTeam.wins ?? 0, losses: homeTeam.losses ?? 0 },
            awayTeam: { abbrev: awayTeam.abbrev, logoUrl: awayTeam.logoUrl ?? '', score: result.awayScore, color: (awayTeam as any).colors?.[0] ?? '#c8102e', wins: awayTeam.wins ?? 0, losses: awayTeam.losses ?? 0 },
            winnerId: result.winnerId,
            isOT: result.isOT ?? false,
          } : undefined;
          const p = makePost('nba_official', content, winner.logoUrl, topPlayer?.imgURL, gameCardData);
          if (p) posts.push(p);
        }

        // Series narrative from nba_central
        if (Math.random() < 0.7 * multiplier) {
          const reactions = isGame7 ? [
            `GAME 7. ${winner.abbrev} vs ${loser.abbrev}. Winner takes all. 🎯`,
            `We are getting a GAME 7. ${higherSeedTeam.abbrev} vs ${lowerSeedTeam.abbrev} — it goes to the wire.`,
            `${winner.abbrev} force Game 7. This ${rAbbr} is everything.`,
          ] : winnerWinsInSeries === winsNeeded - 1 ? [
            `${winner.abbrev} ONE WIN AWAY from advancing. ${winnerWinsInSeries}-${loserWinsInSeries}.`,
            `${winner.abbrev} are CLOSING IN. ${winnerWinsInSeries}-${loserWinsInSeries}. One more.`,
            `${loser.abbrev} must win or go home. ${winner.abbrev} lead ${winnerWinsInSeries}-${loserWinsInSeries}.`,
          ] : loserOnBrink ? [
            `${loser.abbrev} KEEPS THE SEASON ALIVE. Series: ${winnerWinsInSeries}-${loserWinsInSeries}.`,
            `${loser.abbrev} survive. They live to fight another day. ${winnerWinsInSeries}-${loserWinsInSeries}.`,
          ] : leaderTeam ? [
            `${leaderTeam.abbrev} now lead ${leaderWins}-${trailerWins} in the ${rAbbr}.`,
            `${leaderTeam.abbrev} taking control. ${leaderWins}-${trailerWins}.`,
            leaderWins === winsNeeded - 1
              ? `${leaderTeam.abbrev} one win away from advancing. ${leaderWins}-${trailerWins}.`
              : `${leaderTeam.abbrev} lead ${leaderWins}-${trailerWins}. ${winsNeeded - leaderWins} more to advance.`,
          ] : [
            `${higherSeedTeam.abbrev} vs ${lowerSeedTeam.abbrev} is tied ${higherWins}-${lowerWins}. Anyone's series.`,
            `All square. ${rAbbr} is tied at ${higherWins}-${lowerWins}. This just got real.`,
            `Tied ${higherWins} apiece. The ${rAbbr} just got interesting. 👀`,
          ];
          const content = reactions[Math.floor(Math.random() * reactions.length)];
          const p = makePost('nba_central', content, leaderTeam?.logoUrl ?? winner.logoUrl);
          if (p) posts.push(p);
        }

        // Top performer post — lower threshold for playoffs (20+ pts)
        if (topPlayer && topStat && topStat.pts >= 20 && Math.random() < 0.7 * multiplier) {
          const label = isGame7 ? 'Game 7' : `Game ${totalGames}`;
          const lines = [
            `${topPlayer.name} in ${label}:\n\n${topStat.pts} PTS\n${topStat.reb} REB\n${topStat.ast} AST\n\n${tag}`,
            `${topPlayer.name} tonight in ${label}: ${topStat.pts}/${topStat.reb}/${topStat.ast}. Playoff mode. 🔒`,
            `${topStat.pts}/${topStat.reb}/${topStat.ast} from ${topPlayer.name}. ${winner.abbrev} win ${label}.`,
            `${topPlayer.name} shows UP. ${topStat.pts}pts, ${topStat.reb}reb, ${topStat.ast}ast. ${label} goes to ${winner.abbrev}.`,
          ];
          const p = makePost('legion_hoops', lines[Math.floor(Math.random() * lines.length)], undefined, topPlayer.imgURL);
          if (p) posts.push(p);
        }

        // Dramatic situation posts
        if (Math.random() < 0.55 * multiplier) {
          if (isGame7) {
            const g7Posts: Array<[string, string]> = [
              ['bleacher_report', `🚨 GAME 7 IS SET.\n\n${higherSeedTeam.name} vs ${lowerSeedTeam.name}\n\nWINNER ADVANCES. ${tag}`],
              ['hoop_central', `GAME 7 FOR A REASON.\n\n${higherSeedTeam.abbrev} vs ${lowerSeedTeam.abbrev}. This is why we watch. 🔥`],
              ['nba_centel', `Game 7 incoming. ${higherSeedTeam.abbrev} vs ${lowerSeedTeam.abbrev}. You don't want to miss this.`],
            ];
            const [handle, content] = g7Posts[Math.floor(Math.random() * g7Posts.length)];
            const p = makePost(handle, content, winner.logoUrl);
            if (p) { p.likes = 40000 + Math.floor(Math.random() * 30000); p.retweets = 12000 + Math.floor(Math.random() * 10000); posts.push(p); }
          } else if (winnerWinsInSeries === winsNeeded - 1 && loserWinsInSeries === 0) {
            const dramatic = [
              `${loser.abbrev} need a miracle. Down ${winnerWinsInSeries}-0.`,
              `Has any team ever come back from ${winnerWinsInSeries}-0? ${loser.abbrev} find out.`,
              `${winner.abbrev} one away. ${loser.abbrev} backs against the wall.`,
            ];
            const p = makePost('hoop_central', dramatic[Math.floor(Math.random() * dramatic.length)], loser.logoUrl);
            if (p) posts.push(p);
          } else if (isEliminationGame) {
            const elim = [
              `Do or die tonight for ${loser.abbrev}. Season on the line. ${tag}`,
              `${loser.abbrev} must win. Season is over if they lose. 😬 ${tag}`,
              `${loser.abbrev} fighting for their playoff life tonight.`,
            ];
            const p = makePost('hoop_central', elim[Math.floor(Math.random() * elim.length)], loser.logoUrl);
            if (p) posts.push(p);
          }
        }
      }
    }

    return posts;
  }

  private processContext(
      posts: SocialPost[], 
      ctx: SocialContext, 
      usedTemplateIds: Set<string>,
      handlePlayerUsed: Set<string>,
      handlePostCount: Record<string, number>,
      avatars: any[],
      multiplier: number = 1.0
  ) {
      // Sort by priority desc so highest-priority templates get first shot
      const sortedTemplates = [...SOCIAL_TEMPLATES].sort((a, b) => {
          const pa = typeof a.priority === 'function' ? a.priority(ctx) : (a.priority ?? 0);
          const pb = typeof b.priority === 'function' ? b.priority(ctx) : (b.priority ?? 0);
          return pb - pa;
      });

      const llmEnabled = SettingsManager.getSettings().enableLLM;

      for (const template of sortedTemplates) {
          try {
              const handleId = template.handle;

              // ── LLM override: skip injury/news templates for LLM-owned handles ──
              // When LLM is ON it generates richer versions; templates would duplicate.
              if (llmEnabled && LLM_OWNED_HANDLES.has(handleId) && template.type === 'news') continue;

              // ── Dedup: same template already fired this game ───────────────
              if (usedTemplateIds.has(template.id)) continue;

              // ── Dedup: this handle already posted about this player ────────
              if (ctx.player) {
                  const hpKey = `${handleId}::${ctx.player.internalId}`;
                  if (handlePlayerUsed.has(hpKey)) continue;
              }

              // ── Cap: handle hit its post limit for this game ───────────────
              const cap = HANDLE_POST_CAPS[handleId] ?? DEFAULT_CAP;
              if ((handlePostCount[handleId] ?? 0) >= cap) continue;

              // ── Condition check ────────────────────────────────────────────
              if (!template.condition(ctx)) continue;

              // ── Priority / probability gate ────────────────────────────────
              let priority = typeof template.priority === 'function'
                  ? template.priority(ctx)
                  : (template.priority ?? 0);
              priority = priority * multiplier;
              if (Math.random() * 100 > priority) continue;

              // ── Handle lookup ──────────────────────────────────────────────
              const handle = Object.values(SOCIAL_HANDLES).find(h => h.id === handleId);
              if (!handle) continue;

              // ── Content generation ─────────────────────────────────────────
              let content = typeof template.template === 'function'
                  ? template.template(ctx)
                  : template.template;

              // Standard replacements
              const replacements: Record<string, string> = {
                  '{{player}}':          ctx.player?.name || '',
                  '{{PLAYER}}':          (ctx.player?.name || '').toUpperCase(),
                  '{{team}}':            ctx.team?.name || '',
                  '{{TEAM}}':            (ctx.team?.name || '').toUpperCase(),
                  '{{team_handle}}':     ctx.team ? (TEAM_HANDLES[ctx.team.name] || ctx.team.name) : '',
                  '{{opponent}}':        ctx.opponent?.name || '',
                  '{{OPPONENT}}':        (ctx.opponent?.name || '').toUpperCase(),
                  '{{opponent_handle}}': ctx.opponent ? (TEAM_HANDLES[ctx.opponent.name] || ctx.opponent.name) : '',
                  '{{city}}':            '',
                  '{{arena}}':           '',
                  '{{day}}':             ctx.dayOfWeek || '',
                  '{{ot_suffix}}':       ctx.game.otCount > 0 ? (ctx.game.otCount > 1 ? ` (${ctx.game.otCount}OT)` : ' (OT)') : '',
                  '{{ot_text}}':         ctx.game.otCount > 0 ? (ctx.game.otCount > 1 ? ` in ${ctx.game.otCount}OT` : ' in OT') : '',
                  '{{winner_score}}':    (ctx.game.winnerId === ctx.game.homeTeamId ? ctx.game.homeScore : ctx.game.awayScore).toString(),
                  '{{loser_score}}':     (ctx.game.winnerId === ctx.game.homeTeamId ? ctx.game.awayScore : ctx.game.homeScore).toString(),
                  '{{age}}':             ctx.player ? (ctx.player.age || 25).toString() : '',
                  '{{seasons}}':         ctx.player?.stats ? ctx.player.stats.length.toString() : '0',
              };

              if (ctx.stats) {
                  replacements['{{pts}}'] = ctx.stats.pts.toString();
                  replacements['{{reb}}'] = ctx.stats.reb.toString();
                  replacements['{{ast}}'] = ctx.stats.ast.toString();
                  replacements['{{blk}}'] = ctx.stats.blk.toString();
                  replacements['{{stl}}'] = ctx.stats.stl.toString();
                  replacements['{{tov}}'] = ctx.stats.tov.toString();
                  replacements['{{fgm}}'] = ctx.stats.fgm.toString();
                  replacements['{{fga}}'] = ctx.stats.fga.toString();
                  replacements['{{3pm}}'] = ctx.stats.threePm.toString();
                  replacements['{{3pa}}'] = ctx.stats.threePa.toString();
              }

              if (ctx.injury) {
                  replacements['{{injury_type}}']  = ctx.injury.injuryType.toLowerCase();
                  replacements['{{games_missed}}'] = ctx.injury.gamesRemaining.toString();
              }

              const homeTeamObj = [ctx.team, ctx.opponent].find(t => t?.id === ctx.game.homeTeamId);
              if (homeTeamObj) {
                  replacements['{{city}}']  = homeTeamObj.region || homeTeamObj.name.split(' ')[0];
                  replacements['{{arena}}'] = TEAM_ARENAS[homeTeamObj.name] || 'the arena';
              }

              Object.entries(replacements).forEach(([key, value]) => {
                  const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                  content = content.replace(regex, value);
              });

              // Custom resolver
              let avatarOverride = null;
              let mediaUrl = null;
              let mediaBackgroundColor = null;
              let extraData: Record<string, any> = {};
              if (template.resolve) {
                  const resolved = template.resolve(content, ctx);
                  if (typeof resolved === 'object') {
                      content = resolved.content;
                      avatarOverride = resolved.avatarUrl;
                      mediaUrl = resolved.mediaUrl;
                      mediaBackgroundColor = resolved.mediaBackgroundColor;
                      if (resolved.data) extraData = resolved.data;
                  } else {
                      content = resolved;
                  }
              }

              // Skip empty or unreplaced content
              if (!content || content.includes('{{') || content.trim() === '') continue;

              // ── Build post ─────────────────────────────────────────────────
              const avatarUrl = avatarOverride || getAvatarByHandle(handle.handle, avatars) || handle.avatarUrl;
              const postDate  = new Date(ctx.game.date || ctx.date);
              postDate.setHours(23 - Math.floor(Math.random() * 12), 59 - Math.floor(Math.random() * 60));

              posts.push({
                  id:                   crypto.randomUUID(),
                  author:               handle.name,
                  handle:               `@${handle.handle}`,
                  avatarUrl,
                  playerPortraitUrl:    ctx.player?.imgURL,
                  teamLogoUrl:          ctx.team?.logoUrl,
                  content,
                  likes:                Math.floor(Math.random() * 5000) + 100,
                  retweets:             Math.floor(Math.random() * 1000) + 50,
                  date:                 postDate.toISOString(),
                  source:               'TwitterX',
                  category:             'GAME_EVENT',
                  data:                 { gameId: ctx.game.gameId, templateId: template.id, ...extraData },
                  mediaUrl:             mediaUrl || undefined,
                  mediaBackgroundColor: mediaBackgroundColor || undefined,
                  isNew:                true,
              });

              // ── Mark used ──────────────────────────────────────────────────
              usedTemplateIds.add(template.id);
              handlePostCount[handleId] = (handlePostCount[handleId] ?? 0) + 1;
              if (ctx.player) {
                  handlePlayerUsed.add(`${handleId}::${ctx.player.internalId}`);
              }

              // One post per template per context — move to next context
              break;

          } catch (e) {
              console.error('Error processing template:', template.id, e);
          }
      }
  }
}