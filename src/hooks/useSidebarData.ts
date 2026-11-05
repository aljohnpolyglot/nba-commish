import { useMemo } from 'react';
import { useGame } from '../store/GameContext';
import type { SocialPost } from '../types';
import { AVATAR_DATA } from '../data/avatars';
import { getAvatarByHandle } from '../services/avatarService';

export const useSidebarData = (posts?: SocialPost[]) => {
  const { state } = useGame();
  const sourcePosts = posts ?? state.socialFeed;

  const trendsData = useMemo(() => {
    const counts: Record<string, number> = {};
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'this', 'that', 'it', 'from', 'as', 'of', 'be', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'my', 'your', 'his', 'her', 'their', 'our', 'i', 'you', 'he', 'she', 'they', 'we', 'me', 'him', 'them', 'us', 'all', 'any', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now']);

    const teamKeywords = [
      'Los Angeles Lakers', 'Lakers', 'Golden State Warriors', 'Warriors', 
      'Boston Celtics', 'Celtics', 'New York Knicks', 'Knicks', 
      'LA Clippers', 'Clippers', 'Phoenix Suns', 'Suns', 
      'Milwaukee Bucks', 'Bucks', 'Denver Nuggets', 'Nuggets', 
      'Miami Heat', 'Heat', 'Philadelphia 76ers', 'Sixers', 
      'Dallas Mavericks', 'Mavs', 'Chicago Bulls', 'Bulls', 
      'Houston Rockets', 'Rockets', 'San Antonio Spurs', 'Spurs', 
      'Brooklyn Nets', 'Nets', 'Cleveland Cavaliers', 'Cavs', 
      'Sacramento Kings', 'Kings', 'Oklahoma City Thunder', 'Thunder', 
      'Memphis Grizzlies', 'Grizzlies', 'New Orleans Pelicans', 'Pelicans', 
      'Minnesota Timberwolves', 'Timberwolves', 'Indiana Pacers', 'Pacers', 
      'Atlanta Hawks', 'Hawks', 'Toronto Raptors', 'Raptors', 
      'Orlando Magic', 'Magic', 'Utah Jazz', 'Jazz', 
      'Portland Trail Blazers', 'Blazers', 'Detroit Pistons', 'Pistons', 
      'Charlotte Hornets', 'Hornets', 'Washington Wizards', 'Wizards'
    ];

    sourcePosts.forEach(post => {
      teamKeywords.forEach(team => {
        if (post.content.toLowerCase().includes(team.toLowerCase())) {
          counts[team] = (counts[team] || 0) + 4;
        }
      });

      const capPairs = post.content.match(/[A-Z][a-z]+ [A-Z][a-z]+/g);
      if (capPairs) {
        capPairs.forEach(pair => {
          if (!teamKeywords.some(t => t.toLowerCase() === pair.toLowerCase())) {
            counts[pair] = (counts[pair] || 0) + 5;
          }
        });
      }

      const words = post.content.match(/\b\w+\b/g);
      if (words) {
        words.forEach(word => {
          const lowerWord = word.toLowerCase();
          const capitalizedWord = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          
          if (word.length > 3 && !stopWords.has(lowerWord) && !teamKeywords.some(t => t.toLowerCase().includes(lowerWord))) {
            counts[capitalizedWord] = (counts[capitalizedWord] || 0) + 1;
          }
        });
      }
    });

    const sortedTrends = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([title, count]) => ({
        category: 'Trending',
        title,
        posts: count * 123
      }));

    return {
      trends: sortedTrends.slice(0, 5),
      allTrends: sortedTrends
    };
  }, [sourcePosts]);

  const suggestedUsersList = useMemo(() => {
    const users = new Map<string, { name: string; handle: string; avatar?: string }>();
    for (const post of sourcePosts) {
      const cleanHandle = post.handle.replace('@', '');
      if (cleanHandle === 'username' || (state.followedHandles ?? []).includes(cleanHandle)) continue;
      const cached = state.cachedProfiles?.[cleanHandle];
      users.set(cleanHandle, {
        name: cached?.name || post.author,
        handle: post.handle,
        avatar: getAvatarByHandle(cleanHandle, AVATAR_DATA) || cached?.avatarUrl || post.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanHandle}`,
      });
    }
    return [...users.values()].sort((left, right) => left.handle.localeCompare(right.handle));
  }, [sourcePosts, state.cachedProfiles, state.followedHandles]);

  return { trends: trendsData.trends, allTrends: trendsData.allTrends, suggestedUsersList };
};
