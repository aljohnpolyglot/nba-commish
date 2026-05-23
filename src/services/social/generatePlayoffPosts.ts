import { getSocialHandles } from '../../data/social/handles';
import { getAvatarByHandle } from '../avatarService';
import { type GameResult } from '../simulation/StatGenerator';
import type { Game, NBAPlayer, NBATeam, PlayoffBracket, SocialPost } from '../../types';

type GeneratePlayoffPostsParams = {
  avatars: any[];
  date: string;
  daysToSimulate: number;
  gameResults: GameResult[];
  leagueType?: string;
  players: NBAPlayer[];
  playoffs: PlayoffBracket;
  schedule: Game[];
  teams: NBATeam[];
};

export const generatePlayoffPosts = ({
  avatars,
  date,
  daysToSimulate,
  gameResults,
  leagueType,
  players,
  playoffs,
  schedule,
  teams,
}: GeneratePlayoffPostsParams): SocialPost[] => {
  const posts: SocialPost[] = [];
  const multiplier = daysToSimulate <= 1 ? 1.0 : Math.max(0.1, 1.0 / daysToSimulate);
  const clinchedSeriesIds = new Set<string>();

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
    const handleObj = Object.values(getSocialHandles(leagueType)).find((entry) => entry.id === handle);
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
    const schedGame = schedule.find((game) => game.gid === result.gameId);
    if (!schedGame?.isPlayoff || !schedGame.playoffSeriesId) continue;

    const series = playoffs.series.find((entry) => entry.id === schedGame.playoffSeriesId);
    if (!series) continue;

    const winner = teams.find((team) => team.id === result.winnerId);
    const loser = teams.find((team) => team.id === (result.homeTeamId === result.winnerId ? result.awayTeamId : result.homeTeamId));
    if (!winner || !loser) continue;

    const higherSeedTeam = teams.find((team) => team.id === series.higherSeedTid);
    const lowerSeedTeam = teams.find((team) => team.id === series.lowerSeedTid);
    if (!higherSeedTeam || !lowerSeedTeam) continue;

    const higherWins = series.higherSeedWins;
    const lowerWins = series.lowerSeedWins;
    const totalGames = higherWins + lowerWins;
    const winsNeeded = Math.ceil(series.gamesNeeded / 2);
    const isComplete = series.status === 'complete';
    const conf = series.round < 4
      ? (higherSeedTeam as any).conference === 'East' ? 'East' : 'West'
      : undefined;
    const rName = roundName(series.round, conf as any);
    const rAbbr = roundAbbr(series.round);

    const leaderTeam = higherWins > lowerWins ? higherSeedTeam : lowerWins > higherWins ? lowerSeedTeam : null;
    const leaderWins = Math.max(higherWins, lowerWins);
    const trailerWins = Math.min(higherWins, lowerWins);

    const allStats = [...result.homeStats, ...result.awayStats].sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));
    const topStat = allStats[0];
    const topPlayer = topStat ? players.find((player) => player.internalId === topStat.playerId) : null;

    const isClincher = isComplete && leaderTeam != null && winner.id === leaderTeam.id && !clinchedSeriesIds.has(series.id);
    if (isComplete && !isClincher) continue;
    if (isClincher) {
      clinchedSeriesIds.add(series.id);
      const isChampionship = series.round === 4;
      const year = new Date(date).getFullYear();
      const winnerScore = result.homeTeamId === winner.id ? result.homeScore : result.awayScore;
      const loserScore = result.homeTeamId === loser.id ? result.homeScore : result.awayScore;
      const seriesScore = higherSeedTeam.id === winner.id ? `${higherWins}-${lowerWins}` : `${lowerWins}-${higherWins}`;

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
          winnerId: result.winnerId,
          isOT: result.isOT ?? false,
        };
        const post = makePost('nba_official', advanceMsg, winner.logoUrl, topPlayer?.imgURL, gameCardData);
        if (post) {
          if (isChampionship) {
            post.likes = 250000 + Math.floor(Math.random() * 200000);
            post.retweets = 80000 + Math.floor(Math.random() * 60000);
          }
          posts.push(post);
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
        const post = makePost('nba_central', content, winner.logoUrl);
        if (post) {
          if (isChampionship) {
            post.likes = 180000 + Math.floor(Math.random() * 120000);
            post.retweets = 55000 + Math.floor(Math.random() * 40000);
          }
          posts.push(post);
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
        const post = makePost('legion_hoops', lines[Math.floor(Math.random() * lines.length)], undefined, topPlayer.imgURL);
        if (post) {
          if (isChampionship) {
            post.likes = 120000 + Math.floor(Math.random() * 80000);
            post.retweets = 35000 + Math.floor(Math.random() * 25000);
          }
          posts.push(post);
        }
      }

      if (isChampionship) {
        const celebPosts: Array<[string, string]> = [
          ['bleacher_report', `🚨 BREAKING: The ${winner.name} are the ${year} NBA Champions. They win in ${totalGames} games over the ${loser.name}. 🏆`],
          ['hoop_central', `${winner.abbrev} WIN THE CHIP!!!! ${winner.name} are NBA Champions 🏆🏆🏆`],
          ['statmuse', `${winner.name} ${year} NBA Champions\n\n${totalGames} games needed`],
          ['bball_forever', `${winner.name.toUpperCase()} ARE CHAMPIONS OF THE WORLD 🌍🏆\n\nThis city deserves it.`],
          ['nba_centel', `${winner.abbrev} FANS STORMING THE COURT RIGHT NOW 👀`],
        ];
        for (const [handle, content] of celebPosts) {
          if (Math.random() < 0.80 * multiplier) {
            const post = makePost(handle, content, winner.logoUrl);
            if (post) {
              post.likes = 80000 + Math.floor(Math.random() * 120000);
              post.retweets = 20000 + Math.floor(Math.random() * 40000);
              posts.push(post);
            }
          }
        }
        if (topPlayer) {
          if (Math.random() < 0.80 * multiplier) {
            const content = `${topPlayer.name} IS AN NBA CHAMPION 🏆\n\n${topStat.pts}/${topStat.reb}/${topStat.ast} in the clinching game. Add it to the resume.`;
            const post = makePost('bleacher_report', content, undefined, topPlayer.imgURL);
            if (post) {
              post.likes = 90000 + Math.floor(Math.random() * 60000);
              post.retweets = 28000 + Math.floor(Math.random() * 20000);
              posts.push(post);
            }
          }
          if (Math.random() < 0.70 * multiplier) {
            const content = `🏆 ${topPlayer.name} just won his ring.\n\n${topStat.pts} PTS · ${topStat.reb} REB · ${topStat.ast} AST\n\nFinale MVP. Champion.`;
            const post = makePost('statmuse', content, undefined, topPlayer.imgURL);
            if (post) {
              post.likes = 70000 + Math.floor(Math.random() * 50000);
              post.retweets = 22000 + Math.floor(Math.random() * 15000);
              posts.push(post);
            }
          }
        }
      }
    } else {
      const tag = series.round === 4 ? '#NBAFinals' : '#NBAPlayoffs';
      const winnerScore = result.homeTeamId === winner.id ? result.homeScore : result.awayScore;
      const loserScore = result.homeTeamId === loser.id ? result.homeScore : result.awayScore;
      const winnerWinsInSeries = higherSeedTeam.id === winner.id ? higherWins : lowerWins;
      const loserWinsInSeries = higherSeedTeam.id === loser.id ? higherWins : lowerWins;
      const isGame7 = higherWins === winsNeeded - 1 && lowerWins === winsNeeded - 1;
      const isEliminationGame = Math.max(winnerWinsInSeries, loserWinsInSeries) === winsNeeded - 1;
      const loserOnBrink = loserWinsInSeries === winsNeeded - 1 && winnerWinsInSeries < winsNeeded - 1;

      {
        const seriesLine = isGame7
          ? '🚨 SERIES TIED 3-3. GAME 7 IS SET.'
          : leaderTeam
            ? `${leaderTeam.abbrev} lead ${leaderWins}-${trailerWins}`
            : `Series tied ${higherWins}-${lowerWins}`;
        const statLine = topPlayer && topStat
          ? `\n\n${topPlayer.name}: ${topStat.pts} PTS | ${topStat.reb} REB | ${topStat.ast} AST`
          : '';
        const content = `FINAL | ${rName} — Game ${totalGames}\n\n${winner.name} ${winnerScore} – ${loserScore} ${loser.name}${statLine}\n\n${seriesLine}\n\n${tag}`;
        const homeTeam = teams.find((team) => team.id === result.homeTeamId);
        const awayTeam = teams.find((team) => team.id === result.awayTeamId);
        const gameCardData = homeTeam && awayTeam ? {
          templateId: series.round === 4 ? 'nba_finals_game' : 'nba_playoff_game',
          gameId: result.gameId,
          playerName: topStat?.name,
          homeTeam: { abbrev: homeTeam.abbrev, logoUrl: homeTeam.logoUrl ?? '', score: result.homeScore, color: (homeTeam as any).colors?.[0] ?? '#1d428a', wins: homeTeam.wins ?? 0, losses: homeTeam.losses ?? 0 },
          awayTeam: { abbrev: awayTeam.abbrev, logoUrl: awayTeam.logoUrl ?? '', score: result.awayScore, color: (awayTeam as any).colors?.[0] ?? '#c8102e', wins: awayTeam.wins ?? 0, losses: awayTeam.losses ?? 0 },
          winnerId: result.winnerId,
          isOT: result.isOT ?? false,
        } : undefined;
        const post = makePost('nba_official', content, winner.logoUrl, topPlayer?.imgURL, gameCardData);
        if (post) posts.push(post);
      }

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
        const post = makePost('nba_central', content, leaderTeam?.logoUrl ?? winner.logoUrl);
        if (post) posts.push(post);
      }

      if (topPlayer && topStat && topStat.pts >= 20 && Math.random() < 0.7 * multiplier) {
        const label = isGame7 ? 'Game 7' : `Game ${totalGames}`;
        const lines = [
          `${topPlayer.name} in ${label}:\n\n${topStat.pts} PTS\n${topStat.reb} REB\n${topStat.ast} AST\n\n${tag}`,
          `${topPlayer.name} tonight in ${label}: ${topStat.pts}/${topStat.reb}/${topStat.ast}. Playoff mode. 🔒`,
          `${topStat.pts}/${topStat.reb}/${topStat.ast} from ${topPlayer.name}. ${winner.abbrev} win ${label}.`,
          `${topPlayer.name} shows UP. ${topStat.pts}pts, ${topStat.reb}reb, ${topStat.ast}ast. ${label} goes to ${winner.abbrev}.`,
        ];
        const post = makePost('legion_hoops', lines[Math.floor(Math.random() * lines.length)], undefined, topPlayer.imgURL);
        if (post) posts.push(post);
      }

      if (Math.random() < 0.55 * multiplier) {
        if (isGame7) {
          const g7Posts: Array<[string, string]> = [
            ['bleacher_report', `🚨 GAME 7 IS SET.\n\n${higherSeedTeam.name} vs ${lowerSeedTeam.name}\n\nWINNER ADVANCES. ${tag}`],
            ['hoop_central', `GAME 7 FOR A REASON.\n\n${higherSeedTeam.abbrev} vs ${lowerSeedTeam.abbrev}. This is why we watch. 🔥`],
            ['nba_centel', `Game 7 incoming. ${higherSeedTeam.abbrev} vs ${lowerSeedTeam.abbrev}. You don't want to miss this.`],
          ];
          const [handle, content] = g7Posts[Math.floor(Math.random() * g7Posts.length)];
          const post = makePost(handle, content, winner.logoUrl);
          if (post) {
            post.likes = 40000 + Math.floor(Math.random() * 30000);
            post.retweets = 12000 + Math.floor(Math.random() * 10000);
            posts.push(post);
          }
        } else if (winnerWinsInSeries === winsNeeded - 1 && loserWinsInSeries === 0) {
          const dramatic = [
            `${loser.abbrev} need a miracle. Down ${winnerWinsInSeries}-0.`,
            `Has any team ever come back from ${winnerWinsInSeries}-0? ${loser.abbrev} find out.`,
            `${winner.abbrev} one away. ${loser.abbrev} backs against the wall.`,
          ];
          const post = makePost('hoop_central', dramatic[Math.floor(Math.random() * dramatic.length)], loser.logoUrl);
          if (post) posts.push(post);
        } else if (isEliminationGame) {
          const elim = [
            `Do or die tonight for ${loser.abbrev}. Season on the line. ${tag}`,
            `${loser.abbrev} must win. Season is over if they lose. 😬 ${tag}`,
            `${loser.abbrev} fighting for their playoff life tonight.`,
          ];
          const post = makePost('hoop_central', elim[Math.floor(Math.random() * elim.length)], loser.logoUrl);
          if (post) posts.push(post);
        }
      }
    }
  }

  return posts;
};
