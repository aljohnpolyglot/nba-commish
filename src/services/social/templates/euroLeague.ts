import type { GameResult } from '../../simulation/StatGenerator';
import type { Game, NBAPlayer, NBATeam, PlayoffBracket, SocialPost } from '../../../types';
import { getSocialHandles } from '../../../data/social/handles';
import { getAvatarByHandle } from '../../avatarService';
import { getTeamFullName } from '../../../utils/teamNames';
import type { SocialContext, SocialTemplate } from '../types';

const teamFor = (ctx: SocialContext, tid: number): NBATeam | undefined =>
  ctx.teams.find(team => team.id === tid);

const teamNameFor = (ctx: SocialContext, tid: number): string => {
  const team = teamFor(ctx, tid);
  return team ? getTeamFullName(team) : 'the club';
};

const competitionName = (game: GameResult): string => {
  const id = String(game.competitionId ?? '').toLowerCase();
  if (id.includes('endesa') || id.includes('acb')) return 'Liga Endesa';
  if (id.includes('eurocup')) return 'EuroCup';
  if (id.includes('euroleague')) return 'EuroLeague';
  return 'European basketball';
};

const statLine = (stats: any): string => [
  `${stats.pts ?? 0} PTS`,
  `${stats.reb ?? 0} REB`,
  `${stats.ast ?? 0} AST`,
  stats.threePm >= 3 ? `${stats.threePm} 3PM` : '',
].filter(Boolean).join(' · ');

const topPerformer = (ctx: SocialContext): { player?: NBAPlayer; stats?: any } => {
  const stats = [...(ctx.game.homeStats ?? []), ...(ctx.game.awayStats ?? [])]
    .sort((left, right) => (right.gameScore ?? 0) - (left.gameScore ?? 0))[0];
  return {
    stats,
    player: stats ? ctx.players.find(player => player.internalId === stats.playerId) : undefined,
  };
};

const scoreCard = (ctx: SocialContext) => ({
  homeTeam: {
    name: teamNameFor(ctx, ctx.game.homeTeamId),
    abbrev: teamFor(ctx, ctx.game.homeTeamId)?.abbrev ?? 'HOME',
    logoUrl: teamFor(ctx, ctx.game.homeTeamId)?.logoUrl ?? '',
    score: ctx.game.homeScore,
  },
  awayTeam: {
    name: teamNameFor(ctx, ctx.game.awayTeamId),
    abbrev: teamFor(ctx, ctx.game.awayTeamId)?.abbrev ?? 'AWAY',
    logoUrl: teamFor(ctx, ctx.game.awayTeamId)?.logoUrl ?? '',
    score: ctx.game.awayScore,
  },
  winnerId: ctx.game.winnerId,
  isOT: ctx.game.isOT ?? false,
});

const euroTag = (game: GameResult): string => `#${competitionName(game).replace(/\s+/g, '')}`;

export const EURO_SOCIAL_TEMPLATES: SocialTemplate[] = [
  {
    id: 'euro_official_final',
    handle: 'euro_official',
    template: 'DYNAMIC',
    priority: 100,
    type: 'general',
    condition: ctx => !!ctx.game && !ctx.player && ctx.team?.id === ctx.game.homeTeamId,
    resolve: (_template, ctx) => {
      const winnerId = ctx.game.winnerId;
      const winner = teamNameFor(ctx, winnerId);
      const loserId = winnerId === ctx.game.homeTeamId ? ctx.game.awayTeamId : ctx.game.homeTeamId;
      const loser = teamNameFor(ctx, loserId);
      const winnerScore = winnerId === ctx.game.homeTeamId ? ctx.game.homeScore : ctx.game.awayScore;
      const loserScore = winnerId === ctx.game.homeTeamId ? ctx.game.awayScore : ctx.game.homeScore;
      const top = topPerformer(ctx);
      return {
        content: `FINAL | ${competitionName(ctx.game)}\n\n${winner} ${winnerScore}–${loserScore} ${loser}\n\n${top.player?.name ?? 'Top performer'}: ${top.stats ? statLine(top.stats) : 'led the way'}\n\n${euroTag(ctx.game)}`,
        data: scoreCard(ctx),
      };
    },
  },
  {
    id: 'euro_central_reaction',
    handle: 'euro_central',
    template: 'DYNAMIC',
    priority: 96,
    type: 'general',
    condition: ctx => !!ctx.game && !ctx.player && ctx.team?.id === ctx.game.awayTeamId,
    resolve: (_template, ctx) => {
      const winner = teamNameFor(ctx, ctx.game.winnerId);
      const loserId = ctx.game.winnerId === ctx.game.homeTeamId ? ctx.game.awayTeamId : ctx.game.homeTeamId;
      const loser = teamNameFor(ctx, loserId);
      const winnerScore = ctx.game.winnerId === ctx.game.homeTeamId ? ctx.game.homeScore : ctx.game.awayScore;
      const loserScore = ctx.game.winnerId === ctx.game.homeTeamId ? ctx.game.awayScore : ctx.game.homeScore;
      return {
        content: `${winner} take the result, ${winnerScore}–${loserScore} over ${loser}.\n\nAnother night of European basketball. ${euroTag(ctx.game)}`,
        data: scoreCard(ctx),
      };
    },
  },
  {
    id: 'euro_official_player_line',
    handle: 'euro_broadcast',
    template: 'DYNAMIC',
    priority: 92,
    type: 'statline',
    condition: ctx => !!ctx.player && !!ctx.stats && (ctx.stats.gameScore ?? 0) >= 18,
    resolve: (_template, ctx) => ({
      content: `${ctx.player?.name} led ${teamNameFor(ctx, ctx.team?.id ?? -1)} with ${statLine(ctx.stats)}.\n\n${competitionName(ctx.game)} action. ${euroTag(ctx.game)}`,
      data: scoreCard(ctx),
    }),
  },
  {
    id: 'euro_statmuse_performance',
    handle: 'statmuse',
    template: 'DYNAMIC',
    priority: 88,
    type: 'statline',
    condition: ctx => !!ctx.player && !!ctx.stats && (ctx.stats.pts >= 25 || (ctx.stats.reb >= 10 && ctx.stats.ast >= 10)),
    resolve: (_template, ctx) => ({
      content: `${ctx.player?.name} tonight:\n\n${statLine(ctx.stats)}\n\nA big ${competitionName(ctx.game)} performance.`,
      data: scoreCard(ctx),
    }),
  },
  {
    id: 'euro_insider_injury',
    handle: 'euro_insider',
    template: 'DYNAMIC',
    priority: 100,
    type: 'news',
    condition: ctx => !!ctx.player && !!ctx.injury && ctx.injury.injuryType !== 'Load Management',
    resolve: (_template, ctx) => ({
      content: `Club sources say ${ctx.player?.name} will miss ${ctx.injury.gamesRemaining} game${ctx.injury.gamesRemaining === 1 ? '' : 's'} with a ${String(ctx.injury.injuryType).toLowerCase()}.\n\n${teamNameFor(ctx, ctx.team?.id ?? -1)} will provide an update when available.`,
      data: { teamId: ctx.team?.id, playerId: ctx.player?.internalId },
    }),
  },
  {
    id: 'euro_newsdesk_close_finish',
    handle: 'euro_newsdesk',
    template: 'DYNAMIC',
    priority: 84,
    type: 'general',
    condition: ctx => !!ctx.game && !ctx.player && ctx.team?.id === ctx.game.homeTeamId
      && Math.abs(ctx.game.homeScore - ctx.game.awayScore) <= 5,
    resolve: (_template, ctx) => ({
      content: `A finish decided by five points or fewer: ${teamNameFor(ctx, ctx.game.homeTeamId)} ${ctx.game.homeScore}, ${teamNameFor(ctx, ctx.game.awayTeamId)} ${ctx.game.awayScore}.\n\n${competitionName(ctx.game)} stays tight to the final possession.`,
      data: scoreCard(ctx),
    }),
  },
  {
    id: 'euro_newsdesk_story',
    handle: 'euro_newsdesk',
    template: 'DYNAMIC',
    priority: 72,
    type: 'general',
    condition: ctx => !!ctx.game && !ctx.player && ctx.team?.id === ctx.game.awayTeamId
      && ctx.game.winnerId === ctx.team?.id,
    resolve: (_template, ctx) => ({
      content: `${teamNameFor(ctx, ctx.team?.id ?? -1)} leave with the win.\n\n${topPerformer(ctx).player?.name ?? 'The winning group'} set the tone in ${competitionName(ctx.game)} play. 🏀`,
      data: scoreCard(ctx),
    }),
  },
];

type EuroPlayoffPostParams = {
  avatars: any[];
  date: string;
  daysToSimulate: number;
  gameResults: GameResult[];
  players: NBAPlayer[];
  playoffs: PlayoffBracket;
  schedule: Game[];
  teams: NBATeam[];
};

export const generateEuroPlayoffPosts = ({
  avatars,
  date,
  daysToSimulate,
  gameResults,
  players,
  playoffs,
  schedule,
  teams,
}: EuroPlayoffPostParams): SocialPost[] => {
  const handles = getSocialHandles(undefined, 'euro_isolated');
  const posts: SocialPost[] = [];
  const teamName = (tid: number) => {
    const team = teams.find(candidate => candidate.id === tid);
    return team ? getTeamFullName(team) : 'the club';
  };
  const post = (handleId: string, content: string, result: GameResult, player?: NBAPlayer): SocialPost | null => {
    const handle = Object.values(handles).find(candidate => candidate.id === handleId);
    if (!handle) return null;
    const postDate = new Date(result.date || date);
    postDate.setUTCHours(20 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
    return {
      id: crypto.randomUUID(),
      author: handle.name,
      handle: `@${handle.handle}`,
      avatarUrl: getAvatarByHandle(handle.handle, avatars) || handle.avatarUrl,
      content,
      likes: Math.floor(Math.random() * 8000) + 300,
      retweets: Math.floor(Math.random() * 1800) + 40,
      date: postDate.toISOString(),
      source: 'TwitterX',
      category: 'GAME_EVENT',
      data: { gameId: result.gameId, league: 'euro', leagueId: 'euro', competitionId: result.competitionId },
      teamLogoUrl: teams.find(candidate => candidate.id === result.winnerId)?.logoUrl,
      playerPortraitUrl: player?.imgURL,
      isNew: true,
    };
  };

  for (const result of gameResults) {
    const scheduled = schedule.find(game => game.gid === result.gameId);
    if (!scheduled?.isPlayoff && !scheduled?.isPlayIn) continue;
    const series = scheduled.playoffSeriesId
      ? playoffs.series.find(candidate => candidate.id === scheduled.playoffSeriesId)
      : undefined;
    const winner = teamName(result.winnerId);
    const loserId = result.winnerId === result.homeTeamId ? result.awayTeamId : result.homeTeamId;
    const loser = teamName(loserId);
    const topStat = [...(result.homeStats ?? []), ...(result.awayStats ?? [])]
      .sort((left, right) => (right.gameScore ?? 0) - (left.gameScore ?? 0))[0];
    const topPlayer = topStat ? players.find(player => player.internalId === topStat.playerId) : undefined;
    const seriesLine = series ? ` Series: ${series.higherSeedWins}–${series.lowerSeedWins}.` : '';
    const official = post(
      'euro_official',
      `PLAYOFF FINAL | ${competitionName(result)}\n\n${winner} ${result.winnerId === result.homeTeamId ? result.homeScore : result.awayScore}–${result.winnerId === result.homeTeamId ? result.awayScore : result.homeScore} ${loser}.${seriesLine}\n\n${topPlayer?.name ?? 'The winning club'} led the way. #EuroPlayoffs`,
      result,
      topPlayer,
    );
    if (official) posts.push(official);
    if (Math.random() <= Math.max(0.1, 1 / Math.max(1, daysToSimulate))) {
      const reaction = post(
        'euro_central',
        `${winner} advance the European postseason conversation after beating ${loser}.${seriesLine} #EuroPlayoffs`,
        result,
      );
      if (reaction) posts.push(reaction);
    }
  }
  return posts;
};
