import { GameState, NBAPlayer as Player, NBATeam } from '../../../types';
import { calculateSocialEngagement } from '../../../utils/helpers';
import { SocialEngine } from '../../../services/social/SocialEngine';
import { generateLazySimNews } from '../../../services/news/lazySimNewsGenerator';

export const handleSocialAndNews = async (
    state: GameState, 
    result: any, 
    allSimResults: any[], 
    updatedPlayers: Player[], 
    updatedTeams: NBATeam[],
    daysToSimulate: number,
    endDateString: string
) => {
    // Clear AI image cache once per simulation day
    if (daysToSimulate >= 1) {
        import('../../../services/social/gameImageGenerator')
            .then(({ clearGameImageCache }) => clearGameImageCache())
            .catch(() => {});
    }

    // Smarter Engagement Algorithm for Social Posts
    if (result.newSocialPosts) {
        const startDate = new Date(state.date);
        const endDate = new Date(endDateString);
        const timeDiff = endDate.getTime() - startDate.getTime();
        
        result.newSocialPosts = result.newSocialPosts.map((post: any, index: number) => {
            const handle = (post.handle || '').toLowerCase();
            const player = state.players.find(p => p.name === post.author || (handle && handle.includes(p.name.toLowerCase().replace(' ', ''))));
            const team = state.teams.find(t => t.name === post.author || (handle && handle.includes(t.abbrev.toLowerCase())));
            
            const engagement = calculateSocialEngagement(post.handle, post.content, player?.overallRating);
            
            // Spread posts across the simulation period
            const randomOffset = Math.random() * (timeDiff + (1000 * 60 * 60 * 24));
            const postDate = new Date(startDate.getTime() + randomOffset);
            
            // Randomize time of day
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
    }

    const socialEngine = new SocialEngine();
    const socialDateString = new Date(state.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const nbaPlayers = updatedPlayers.filter(p => !['WNBA', 'Euroleague', 'PBA', 'B-League'].includes(p.status || ''));
    const newSocialPostsFromEngine = await socialEngine.generateDailyPosts(allSimResults, nbaPlayers, updatedTeams, socialDateString, daysToSimulate);

    const newLLMPosts = (result.newSocialPosts || []).map((p: any, i: number) => ({
        ...p,
        id: p.id || `llm-social-${state.day}-${i}-${Date.now()}`,
        date: p.date || new Date(state.date).toISOString(),
        isNew: true
    }));
    const allNewPosts = [...newLLMPosts, ...newSocialPostsFromEngine];
    allNewPosts.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // ── Shams injury posts ────────────────────────────────────────────────────
    const { buildShamsPost } = await import('../../../services/social/templates/charania');
    const shamsInjuryPosts: any[] = [];

    for (const result of allSimResults) {
        if (!result.injuries?.length) continue;
        for (const injury of result.injuries) {
            const player = updatedPlayers.find(p => p.internalId === injury.playerId);
            if (!player) continue;
            const team = updatedTeams.find(t => t.id === (injury.teamId ?? player.tid));
            if (!team) continue;
            if ((player.overallRating ?? 0) < 70) continue; // skip low OVR

            const ctx = {
                player,
                team,
                injury: {
                    injuryType: injury.injuryType,
                    gamesRemaining: injury.gamesRemaining,
                },
                opponent: null,
            };

            const content = buildShamsPost(ctx as any);
            if (!content) continue;

            const engagement = calculateSocialEngagement('@ShamsCharania', content, player.overallRating);
            shamsInjuryPosts.push({
                id: `shams-injury-${injury.playerId}-${Date.now()}`,
                author: 'Shams Charania',
                handle: '@ShamsCharania',
                content,
                date: new Date(state.date).toISOString(),
                likes: engagement.likes,
                retweets: engagement.retweets,
                source: 'TwitterX',
                isNew: true,
                playerPortraitUrl: player.imgURL,
            });
        }
    }

    allNewPosts.push(...shamsInjuryPosts);
    allNewPosts.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const existingPostIds = new Set(state.socialFeed.map(p => p.id));
    const uniqueNewPosts = allNewPosts.filter(p => !existingPostIds.has(p.id));

    const newNews = (result.newNews || []).map((n: any, i: number) => ({
        ...n,
        id: n.id || `llm-news-${state.day}-${i}-${Date.now()}`,
        date: n.date || new Date(state.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        isNew: true
    }));
    newNews.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const existingNewsIds = new Set(state.news.map(n => n.id));
    const uniqueNewNews = newNews.filter(n => !existingNewsIds.has(n.id));

    console.log('[SocialHandler] incoming newNews:', result?.newNews?.length);
    console.log('[SocialHandler] incoming newSocialPosts:', result?.newSocialPosts?.length);

    // ── Generate deterministic news from sim results (streaks, big games, drama) ──
    // skipInjuries=true — Shams posts already surface injuries in the regular flow.
    if (allSimResults.length > 0) {
        const simNews = generateLazySimNews(
            updatedTeams,
            updatedPlayers,
            allSimResults,
            endDateString,
            new Set<string>(),
            true, // skipInjuries
            state.teams
        );
        const simNewsUnique = simNews.filter(n => !existingNewsIds.has(n.id));
        uniqueNewNews.push(...simNewsUnique);
    }

    return { uniqueNewPosts, uniqueNewNews };
};
