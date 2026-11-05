import type { AllStarPlayer, GameState, NewsItem, SocialPost } from '../../types';
import { parseGameDate } from '../../utils/dateUtils';
import { getAllStarPlayerEligibility } from './allStarSelectionHelpers';

export function buildAllStarSnubStories(
  state: GameState,
  roster: AllStarPlayer[],
): { news: NewsItem[]; social: SocialPost[] } {
  const season = Number(state.leagueStats?.year);
  const selectedIds = new Set(roster.map(entry => entry.playerId));
  const eligible = getAllStarPlayerEligibility(state.leagueStats, state.teams);
  const playerById = new Map(state.players.filter(eligible).map(player => [player.internalId, player]));
  const snubVote = [...(state.allStar?.votes ?? [])]
    .filter(vote => !selectedIds.has(vote.playerId) && playerById.has(vote.playerId))
    .sort((left, right) => right.votes - left.votes || left.playerId.localeCompare(right.playerId))[0];
  if (!snubVote) return { news: [], social: [] };

  const player = playerById.get(snubVote.playerId)!;
  const stat = player.stats?.find(row => row.season === season && !row.playoffs);
  const gp = Math.max(1, Number(stat?.gp ?? 0));
  const line = stat && stat.gp > 0
    ? `${(stat.pts / gp).toFixed(1)} points, ${((stat.trb ?? ((stat.orb ?? 0) + (stat.drb ?? 0))) / gp).toFixed(1)} rebounds and ${(stat.ast / gp).toFixed(1)} assists per game`
    : 'a strong first half of the season';
  const scope = String(state.leagueStats?.uiMode ?? state.leagueType ?? 'league').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const id = `allstar-snub:${scope}:${season}:${player.internalId}`;
  return {
    news: [{
      id: `${id}:news`,
      headline: `${player.name} Headlines All-Star Snubs`,
      content: `${player.name} was left off the ${season} All-Star roster despite averaging ${line}.`,
      date: state.date,
      type: 'league',
      category: 'all-star-snub',
      playerIds: [player.internalId],
      teamIds: [player.tid],
      read: false,
      isNew: true,
    }],
    social: [{
      id: `${id}:social`,
      author: 'The NBA Central',
      handle: '@TheNBACentral',
      content: `${player.name} misses the ${season} All-Star cut despite averaging ${line}. Biggest snub?`,
      date: parseGameDate(state.date).toISOString(),
      likes: 0,
      retweets: 0,
      source: 'TwitterX',
      playerPortraitUrl: player.imgURL,
      category: 'all-star-snub',
      data: { playerId: player.internalId, teamId: player.tid, season },
      isNew: true,
    }],
  };
}
