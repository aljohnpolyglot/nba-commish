import { GameState, NBAPlayer as Player, NBATeam } from '../../../types';
import { calculateSocialEngagement, formatCurrency } from '../../../utils/helpers'; // Added formatCurrency just in case
import { SocialEngine } from '../../../services/social/SocialEngine';

export const handleSocialAndNews = async (
    state: GameState, 
    result: any, 
    allSimResults: any[], 
    updatedPlayers: Player[], 
    updatedTeams: NBATeam[],
    daysToSimulate: number,
    endDateString: string
) => {
    // Smarter Engagement Algorithm for Social Posts
    if (result.newSocialPosts) {
        const startDate = new Date(state.date);
        const endDate = new Date(endDateString);
        const timeDiff = endDate.getTime() - startDate.getTime();
        
        result.newSocialPosts = result.newSocialPosts.map((post: any) => {
            const handle = (post.handle || '').toLowerCase();
            const player = state.players.find(p => p.name === post.author || (handle && handle.includes(p.name.toLowerCase().replace(' ', ''))));
            const team = state.teams.find(t => t.name === post.author || (handle && handle.includes(t.abbrev.toLowerCase())));
            
            const engagement = calculateSocialEngagement(post.handle, post.content, player?.overallRating);
            
            const randomOffset = Math.random() * (timeDiff + (1000 * 60 * 60 * 24));
            const postDate = new Date(startDate.getTime() + randomOffset);
            
            const hours = Math.floor(Math.random() * 24);
            const minutes = Math.floor(Math.random() * 60);
            postDate.setHours(hours, minutes);
            
            return {
                ...post,
                likes: engagement.likes,
                retweets: engagement.retweets,
                date: postDate.toISOString(),
                playerPortraitUrl: post.playerPortraitUrl || player?.imgURL,
                teamLogoUrl: post.teamLogoUrl || team?.logoUrl,
                isNew: true
            };
        }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } // <--- FIX: Added missing closing brace for if block

    const socialEngine = new SocialEngine();
    const socialDateString = new Date(state.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const nbaPlayers = updatedPlayers.filter(p => !['WNBA', 'Euroleague', 'PBA'].includes(p.status || ''));
    const newSocialPostsFromEngine = await socialEngine.generateDailyPosts(allSimResults, nbaPlayers, updatedTeams, socialDateString, daysToSimulate, state.playoffs, state.schedule);

    const newLLMPosts = (result.newSocialPosts || []).map((p: any, i: number) => ({
        ...p,
        id: p.id || `llm-social-${state.day}-${i}-${Date.now()}`,
        date: p.date || new Date(state.date).toISOString(),
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
        date: n.date || new Date(state.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        isNew: true
    }));
    newNews.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const existingNewsIds = new Set(state.news.map(n => n.id));
    const uniqueNewNews = newNews.filter((n: any) => !existingNewsIds.has(n.id));

    return { uniqueNewPosts, uniqueNewNews };
};