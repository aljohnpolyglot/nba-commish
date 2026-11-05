import { GameState, NBAPlayer as Player, NBATeam } from '../../../types';
import { calculateSocialEngagement, formatCurrency } from '../../../utils/helpers'; // Added formatCurrency just in case
import { SocialEngine } from '../../../services/social/SocialEngine';
import { formatGameDateShort, parseGameDate } from '../../../utils/dateUtils';
import { coerceInsiderPostToEra } from '../../../data/social/handles';
import { isTwitterAvailable } from '../../../utils/mediaTimeline';

export const handleSocialAndNews = async (
    state: GameState, 
    result: any, 
    allSimResults: any[], 
    updatedPlayers: Player[], 
    updatedTeams: NBATeam[],
    daysToSimulate: number,
    endDateString: string
) => {
    const socialAvailable = isTwitterAvailable(endDateString, state.leagueStats?.year);

    // Smarter Engagement Algorithm for Social Posts
    if (socialAvailable && result.newSocialPosts) {
        const startDate = parseGameDate(state.date);
        const endDate = parseGameDate(endDateString);
        const timeDiff = endDate.getTime() - startDate.getTime();
        
        result.newSocialPosts = result.newSocialPosts.map((post: any) => {
            const timelinePost = coerceInsiderPostToEra(post, state.leagueType, endDateString, state.leagueStats?.year, state.leagueStats?.uiMode);
            const handle = (timelinePost.handle || '').toLowerCase();
            const player = state.players.find(p => p.name === timelinePost.author || (handle && handle.includes(p.name.toLowerCase().replace(' ', ''))));
            const team = state.teams.find(t => t.name === timelinePost.author || (handle && handle.includes(t.abbrev.toLowerCase())));
            
            const engagement = calculateSocialEngagement(timelinePost.handle, timelinePost.content, player?.overallRating);
            
            const randomOffset = Math.random() * (timeDiff + (1000 * 60 * 60 * 24));
            const postDate = new Date(startDate.getTime() + randomOffset);
            
            const hours = Math.floor(Math.random() * 24);
            const minutes = Math.floor(Math.random() * 60);
            postDate.setUTCHours(hours, minutes);
            
            return {
                ...timelinePost,
                likes: engagement.likes,
                retweets: engagement.retweets,
                date: postDate.toISOString(),
                playerPortraitUrl: post.playerPortraitUrl || player?.imgURL,
                teamLogoUrl: post.teamLogoUrl || team?.logoUrl,
                isNew: true
            };
        }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (!socialAvailable) {
        result.newSocialPosts = [];
    } // <--- FIX: Added missing closing brace for if block

    const socialEngine = new SocialEngine();
    const socialDateString = formatGameDateShort(state.date);
    const activeTeamIds = new Set(updatedTeams.map(team => team.id));
    const activeLeaguePlayers = updatedPlayers.filter(player => activeTeamIds.has(player.tid));
    const newSocialPostsFromEngine = socialAvailable && state.leagueStats?.uiMode !== 'pba_isolated'
        ? await socialEngine.generateDailyPosts(allSimResults, activeLeaguePlayers, updatedTeams, socialDateString, daysToSimulate, state.playoffs, state.schedule, state.leagueType, { uiMode: state.leagueStats?.uiMode })
        : [];

    const newLLMPosts = (result.newSocialPosts || []).map((p: any, i: number) => ({
        ...p,
        id: p.id || `llm-social-${state.day}-${i}-${Date.now()}`,
        date: p.date || parseGameDate(state.date).toISOString(),
        isNew: true
    }));
    
    const allNewPosts = [...newLLMPosts, ...newSocialPostsFromEngine];
    allNewPosts.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const existingPostIds = new Set(state.socialFeed.map(p => p.id));
    const uniqueNewPosts = allNewPosts.filter(p => !existingPostIds.has(p.id));

    // FIX: Added explicit type (n: any) to resolve "implicitly has any type" error
    const newNews = (result.newNews || []).map((n: any, i: number) => ({
        ...n,
        id: n.id || `llm-news-${state.day}-${i}-${Date.now()}`,
        date: n.date || formatGameDateShort(state.date),
        isNew: true
    }));
    newNews.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const existingNewsIds = new Set(state.news.map(n => n.id));
    const uniqueNewNews = newNews.filter((n: any) => !existingNewsIds.has(n.id));

    return { uniqueNewPosts, uniqueNewNews };
};
