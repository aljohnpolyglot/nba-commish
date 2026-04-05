import { useMemo, useState, useEffect } from 'react';
import { useGame } from '../store/GameContext';

export const useSidebarData = () => {
  const { state } = useGame();
  const [suggestedUsersList, setSuggestedUsersList] = useState<{ name: string, handle: string, avatar?: string }[]>([]);

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

    state.socialFeed.forEach(post => {
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
  }, [state.socialFeed]);

  const [allSuggestedUsers, setAllSuggestedUsers] = useState<{ name: string, handle: string, avatar?: string }[]>([]);

  useEffect(() => {
    if (state.socialFeed.length > 0) {
      const users = new Map<string, { name: string, handle: string, avatar?: string }>();
      
      state.socialFeed.forEach(post => {
        const cleanHandle = post.handle.replace('@', '');
        if (cleanHandle !== 'username') {
          // Check cache first for more up-to-date info
          const cached = state.cachedProfiles?.[cleanHandle];
          users.set(cleanHandle, {
            name: cached?.name || post.author,
            handle: post.handle,
            avatar: cached?.avatarUrl || post.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanHandle}`
          });
        }
      });

      const allUsers = Array.from(users.values());
      // Only shuffle if we haven't set the list yet or if the feed changed significantly
      if (allSuggestedUsers.length === 0) {
        for (let i = allUsers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allUsers[i], allUsers[j]] = [allUsers[j], allUsers[i]];
        }
        setAllSuggestedUsers(allUsers);
      } else {
        // Just update existing users with new data without re-shuffling
        const updatedUsers = allSuggestedUsers.map(existing => {
          const fresh = users.get(existing.handle.replace('@', ''));
          return fresh ? { ...existing, ...fresh } : existing;
        });
        
        // Also add any new users that appeared in the feed
        const existingHandles = new Set(allSuggestedUsers.map(u => u.handle));
        const newUsers = allUsers.filter(u => !existingHandles.has(u.handle));
        
        if (newUsers.length > 0 || JSON.stringify(updatedUsers) !== JSON.stringify(allSuggestedUsers)) {
          setAllSuggestedUsers([...updatedUsers, ...newUsers]);
        }
      }
    }
  }, [state.socialFeed, state.cachedProfiles]);

  useEffect(() => {
    const filtered = allSuggestedUsers.filter(user => 
      !(state.followedHandles || []).includes(user.handle.replace('@', ''))
    );
    setSuggestedUsersList(filtered);
  }, [allSuggestedUsers, state.followedHandles]);

  return { trends: trendsData.trends, allTrends: trendsData.allTrends, suggestedUsersList };
};
