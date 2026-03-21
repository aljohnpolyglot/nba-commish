import { GameState, NBAPlayer as Player, NBATeam } from '../../../types';
import { calculateSocialEngagement } from '../../../utils/helpers';
import { SocialEngine } from '../../../services/social/SocialEngine';
import { fetchGamePlayerPhotos, ImagnPhoto } from '../../../services/ImagnPhotoService';

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
    const nbaPlayers = updatedPlayers.filter(p => !['WNBA', 'Euroleague', 'PBA'].includes(p.status || ''));
    const newSocialPostsFromEngine = await socialEngine.generateDailyPosts(allSimResults, nbaPlayers, updatedTeams, socialDateString, daysToSimulate);

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

    // ── Attach real imagn photos ──────────────────────────────────────────────
    try {
        const gameInfoMap = new Map<number, { home: NBATeam; away: NBATeam }>();
        for (const r of allSimResults) {
            if (!r.gameId || r.homeTeamId <= 0 || r.awayTeamId <= 0) continue;
            const home = updatedTeams.find(t => t.id === r.homeTeamId);
            const away = updatedTeams.find(t => t.id === r.awayTeamId);
            if (home && away) gameInfoMap.set(r.gameId, { home, away });
        }

        console.log('[Imagn] games to fetch photos for:', gameInfoMap.size);

        // ── Fetch per-player photos for each game ──────────────────────────
        const gamePhotoMap = new Map<number, Map<string, ImagnPhoto[]>>();

        await Promise.all([...gameInfoMap.entries()].map(async ([gameId, { home, away }]) => {
            const gameResult = allSimResults.find((r: any) => r.gameId === gameId);
            if (!gameResult) return;

            const topPlayers = [...(gameResult.homeStats || []), ...(gameResult.awayStats || [])]
                .sort((a: any, b: any) => b.gameScore - a.gameScore)
                .slice(0, 10)
                .map((s: any) => ({ name: s.name, gameScore: s.gameScore }));

            const gameKey = `${home.abbrev}-${away.abbrev}-${gameResult.date}`;

            try {
                const playerPhotos = await fetchGamePlayerPhotos({ homeTeam: home, awayTeam: away, topPlayers, gameKey });
                if (playerPhotos.size > 0) gamePhotoMap.set(gameId, playerPhotos);
            } catch (e) {
                console.warn('[Imagn] skipped:', home.name, 'vs', away.name, e);
            }
        }));

        console.log('[Imagn] gamePhotoMap:', gamePhotoMap.size, 'games');
        if (gamePhotoMap.size === 0) return { uniqueNewPosts, uniqueNewNews };

        // ── Helpers ────────────────────────────────────────────────────────

        const findGameForText = (text: string): number | null => {
            const lower = text.toLowerCase();
            for (const [gameId, { home, away }] of gameInfoMap.entries()) {
                const homeWord = home.name.split(' ').pop()!.toLowerCase();
                const awayWord = away.name.split(' ').pop()!.toLowerCase();
                if (lower.includes(homeWord) || lower.includes(awayWord)) return gameId;
            }
            return null;
        };

        const findPhotoForPlayer = (playerName: string, gameId: number | null): ImagnPhoto | null => {
            if (!gameId) return null;
            const playerMap = gamePhotoMap.get(gameId);
            if (!playerMap) return null;

            const lastName = playerName.toLowerCase().split(' ').pop() || '';
            const photos = playerMap.get(playerName) ||
                [...playerMap.entries()]
                    .find(([name]) =>
                        name.toLowerCase().includes(lastName) ||
                        playerName.toLowerCase().includes(name.toLowerCase().split(' ').pop() || '')
                    )?.[1];

            if (!photos?.length) return null;

            return (
                photos.find(p => (p.captionClean || '').toLowerCase().includes('react')) ||
                photos.find(p => ['dunk', 'alley-oop', 'slams'].some(w => (p.captionClean || '').toLowerCase().includes(w))) ||
                photos.find(p => (p.captionClean || '').toLowerCase().includes('three point basket')) ||
                photos.find(p => ['shoots', 'jumper', 'layup', 'drives', 'strips', 'blocks'].some(w => (p.captionClean || '').toLowerCase().includes(w))) ||
                photos[0]
            );
        };

        // First entry = highest gameScore player (insertion order from sort)
        const findBestGamePhoto = (gameId: number | null): ImagnPhoto | null => {
            if (!gameId) return null;
            const playerMap = gamePhotoMap.get(gameId);
            if (!playerMap) return null;
            return [...playerMap.values()][0]?.[0] || null;
        };

        // ── Allowlists ─────────────────────────────────────────────────────
        const STATMUSE_SHIELD    = ['statmuse'];
        const EXACT_NBA_OFFICIAL = new Set(['@nba']);
        const EXACT_STAT_CARD    = new Set(['@bleacherreport', '@wojespn', '@shamscharania', '@espn', '@thenbacental']);

        const isShielded = (post: any) =>
            STATMUSE_SHIELD.some(s =>
                (post.source || '').toLowerCase().includes(s) ||
                (post.handle || '').toLowerCase().includes(s) ||
                (post.author || '').toLowerCase().includes(s)
            );
        const isNBAOfficial    = (post: any) => EXACT_NBA_OFFICIAL.has((post.handle || '').toLowerCase());
        const isStatCardSource = (post: any) => EXACT_STAT_CARD.has((post.handle || '').toLowerCase());

        // ── Posts ──────────────────────────────────────────────────────────
        const postsWithPhotos = uniqueNewPosts.map((post: any) => {
            if (post.mediaUrl) return post;
            if (isShielded(post)) return post;

            const gameId     = findGameForText(post.content || '');
            const isStatCard = !!post.data?.type;

            // ── Stat card ──────────────────────────────────────────────────
            if (isStatCard && post.data?.playerName) {
                const photo = findPhotoForPlayer(post.data.playerName, gameId);
                return photo ? { ...post, mediaUrl: photo.medUrl } : post;
            }

            // ── Player highlight (BR, NBACentral, etc.) ────────────────────
            if (isStatCardSource(post) && gameId) {
                const playerMatch = (post.content || '').match(/^([A-Z][a-z]+ [A-Z][a-zA-Z-]+)/m);
                if (playerMatch) {
                    const photo = findPhotoForPlayer(playerMatch[1], gameId);
                    if (photo) return { ...post, mediaUrl: photo.medUrl };
                }
                const photo = findBestGamePhoto(gameId);
                return photo ? { ...post, mediaUrl: photo.medUrl } : post;
            }

            // ── @NBA recap ─────────────────────────────────────────────────
            if (isNBAOfficial(post) && gameId) {
                if (Math.random() >= 0.80) return post;
                const statMatch = (post.content || '').match(/^([A-Z][a-z]+(?:\s[A-Z][a-zA-Z'-]+)+):\s*\d+\s*PTS/m);
                const photo = statMatch
                    ? findPhotoForPlayer(statMatch[1], gameId)
                    : findBestGamePhoto(gameId);
                return photo ? { ...post, mediaUrl: photo.medUrl } : post;
            }

            return post;
        });

        // ── News ───────────────────────────────────────────────────────────
        const newsWithPhotos = uniqueNewNews.map((item: any) => {
            if (item.image) return item;
            const gameId = findGameForText(item.headline || '');
            const playerMatches = (item.headline || '').match(/([A-Z][a-z]+ [A-Z][a-zA-Z-]+)/g);
            if (playerMatches) {
                for (const name of playerMatches) {
                    const photo = findPhotoForPlayer(name, gameId);
                    if (photo) return { ...item, image: photo.largeUrl };
                }
            }
            const photo = findBestGamePhoto(gameId);
            return photo ? { ...item, image: photo.largeUrl } : item;
        });

        console.log('[Imagn] posts with mediaUrl:', postsWithPhotos.filter((p: any) => p.mediaUrl).length, '/', postsWithPhotos.length);
        console.log('[Imagn] news with image:', newsWithPhotos.filter((n: any) => n.image).length, '/', newsWithPhotos.length);

        return { uniqueNewPosts: postsWithPhotos, uniqueNewNews: newsWithPhotos };
    } catch (_) {
        return { uniqueNewPosts, uniqueNewNews };
    }
};
