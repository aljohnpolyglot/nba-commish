import { GameState, NBAPlayer as Player, NBATeam } from '../../../types';
import { calculateSocialEngagement } from '../../../utils/helpers';
import { SocialEngine } from '../../../services/social/SocialEngine';
import { fetchGamePhotos, fetchPlayerPhotos } from '../../../services/ImagnPhotoService';

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
        const gameInfoMap = new Map<number, any>();
        for (const r of allSimResults) {
            if (!r.gameId || r.homeTeamId <= 0 || r.awayTeamId <= 0) continue;
            const home = updatedTeams.find(t => t.id === r.homeTeamId);
            const away = updatedTeams.find(t => t.id === r.awayTeamId);
            if (home && away) gameInfoMap.set(r.gameId, { home, away });
        }

        console.log('[Imagn] games to fetch photos for:', gameInfoMap.size);

        const photoMap = new Map<number, any>();
        await Promise.all([...gameInfoMap.entries()].map(async ([gameId, { home, away }]) => {
            try {
                const photoResult = await fetchGamePhotos({ homeTeam: home, awayTeam: away });
                if (photoResult?.photos?.length > 0) photoMap.set(gameId, photoResult);
            } catch (e) {
                console.warn('[Imagn] skipped:', home.name, 'vs', away.name, e);
            }
        }));

        console.log('[Imagn] photoMap results:', photoMap.size, 'games with photos');
        if (photoMap.size === 0) return { uniqueNewPosts, uniqueNewNews };

        // ── Helpers ────────────────────────────────────────────────────────

        const findGameForText = (text: string) => {
            const lower = text.toLowerCase();
            for (const [gameId, { home, away }] of gameInfoMap.entries()) {
                const homeWord = home.name.split(' ').pop()!.toLowerCase();
                const awayWord = away.name.split(' ').pop()!.toLowerCase();
                if (lower.includes(homeWord) || lower.includes(awayWord)) return gameId;
            }
            return null;
        };

        // TRUE passive = bench/sideline only. Reactions after a play = good, keep them.
        const TRUE_PASSIVE = ['on the bench', 'during a timeout', 'during timeout', 'sideline', 'seated', 'sitting', 'walks off'];
        const isPassivePhoto = (photo: any) =>
            TRUE_PASSIVE.some(w => (photo.captionClean || '').toLowerCase().includes(w));

        /**
         * Priority for a named player:
         * 1. player tagged + "reacts" (celebration/emotion after a play)
         * 2. player tagged + star_moment
         * 3. player tagged + active
         * 4. player tagged + any non-passive
         * 5. null — give up, don't return wrong player
         */
        const findPhotoForPlayer = (playerName: string, photos: any[]): any | null => {
            const nameLower = playerName.toLowerCase();
            const tagged = photos.filter(p =>
                !isPassivePhoto(p) &&
                (p.players || []).some((t: any) =>
                    t.name?.toLowerCase().includes(nameLower) || nameLower.includes(t.name?.toLowerCase() ?? '')
                )
            );
            if (!tagged.length) return null;

            // Prefer photos where this player is the first/only tagged (main subject)
            const mainSubject = tagged.filter(p =>
                p.players?.[0]?.name?.toLowerCase().includes(nameLower)
            );
            const pool = mainSubject.length ? mainSubject : tagged;

            const reacts = pool.filter(p => (p.captionClean || '').toLowerCase().includes('react'));
            if (reacts.length) return reacts[0];
            const star   = pool.filter(p => p.actionType === 'star_moment');
            if (star.length)   return star[0];
            const active = pool.filter(p => p.actionType === 'active');
            if (active.length) return active[0];
            return pool[0];
        };

        const findActionPhoto = (photos: any[]): any | null => {
            const pool = photos.filter(p => !isPassivePhoto(p) && (p.actionType === 'active' || p.actionType === 'star_moment'));
            return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        };

        // ── Allowlists ─────────────────────────────────────────────────────
        const STATMUSE_SHIELD    = ['statmuse'];
        const NBA_OFFICIAL       = ['@nba'];
        const STAT_CARD_SOURCES  = ['nba_official', 'nbamemes', 'nbameme', 'thenbacental', 'bleacherreport', 'espn'];

        const isShielded = (post: any) =>
            STATMUSE_SHIELD.some(s =>
                (post.source || '').toLowerCase().includes(s) ||
                (post.handle || '').toLowerCase().includes(s) ||
                (post.author || '').toLowerCase().includes(s)
            );
        const isNBAOfficial    = (post: any) => NBA_OFFICIAL.some(h => (post.handle || '').toLowerCase() === h);
        const isStatCardSource = (post: any) => STAT_CARD_SOURCES.some(s => (post.handle || '').toLowerCase().includes(s));

        // ── Posts ──────────────────────────────────────────────────────────
        const postsWithPhotos = await Promise.all(uniqueNewPosts.map(async (post: any) => {
            if (post.mediaUrl) return post;   // never overwrite — StatMuse, etc.
            if (isShielded(post)) return post;

            const gameId      = findGameForText(post.content || '');
            const photoResult = gameId ? photoMap.get(gameId) : null;
            const isStatCard  = !!post.data?.type;

            // ── Stat card ──────────────────────────────────────────────────
            if (isStatCard && post.data?.playerName) {
                const playerName = post.data.playerName;
                const playerObj  = updatedPlayers.find((p: Player) => p.name === playerName);
                if (playerObj) {
                    try {
                        const playerPhotos = await fetchPlayerPhotos({ player: playerObj });
                        const photo = findPhotoForPlayer(playerName, playerPhotos);
                        if (photo) return { ...post, mediaUrl: photo.medUrl };
                    } catch { /* silent */ }
                }
                if (photoResult?.photos?.length) {
                    const photo = findPhotoForPlayer(playerName, photoResult.photos);
                    if (photo) return { ...post, mediaUrl: photo.medUrl };
                }
                return post;
            }

            // ── Player highlight (BR, NBACentral, etc.) ────────────────────
            if (isStatCardSource(post) && photoResult?.photos?.length) {
                const playerMatch = (post.content || '').match(/^([A-Z][a-z]+ [A-Z][a-zA-Z-]+)/m);
                if (playerMatch) {
                    const photo = findPhotoForPlayer(playerMatch[1], photoResult.photos);
                    if (photo) return { ...post, mediaUrl: photo.medUrl };
                }
                const photo = findActionPhoto(photoResult.photos);
                return photo ? { ...post, mediaUrl: photo.medUrl } : post;
            }

            // ── @NBA recap ─────────────────────────────────────────────────
            if (isNBAOfficial(post) && photoResult?.photos?.length) {
                if (Math.random() >= 0.75) return post;
                const playerMatch = (post.content || '').match(/([A-Z][a-z]+ [A-Z][a-zA-Z-]+):/);
                if (playerMatch) {
                    const photo = findPhotoForPlayer(playerMatch[1], photoResult.photos);
                    if (photo) return { ...post, mediaUrl: photo.medUrl };
                }
                const photo = findActionPhoto(photoResult.photos);
                return photo ? { ...post, mediaUrl: photo.medUrl } : post;
            }

            return post; // everyone else gets nothing
        }));

        // ── News ───────────────────────────────────────────────────────────
        const newsWithPhotos = uniqueNewNews.map((item: any) => {
            if (item.image) return item;

            const headline = item.headline || '';

            // Try game match first
            const gameId = findGameForText(headline);
            const photoResult = gameId ? photoMap.get(gameId) : null;

            if (photoResult?.photos?.length) {
                const playerMatch = headline.match(/([A-Z][a-z]+ [A-Z][a-zA-Z-]+)/);
                if (playerMatch) {
                    const photo = findPhotoForPlayer(playerMatch[1], photoResult.photos);
                    if (photo) return { ...item, image: photo.largeUrl };
                }
                const photo = findActionPhoto(photoResult.photos);
                if (photo) return { ...item, image: photo.largeUrl };
            }

            // Fallback: search ALL fetched photos for any player mentioned in headline
            const allPhotos = [...photoMap.values()].flatMap((r: any) => r.photos || []);
            if (!allPhotos.length) return item;

            const playerMatches = headline.match(/([A-Z][a-z]+ [A-Z][a-zA-Z-]+)/g);
            if (playerMatches) {
                for (const name of playerMatches) {
                    const photo = findPhotoForPlayer(name, allPhotos);
                    if (photo) return { ...item, image: photo.largeUrl };
                }
            }

            // Last resort: best action photo from the game with the most photos
            const bestGame = [...photoMap.values()]
                .sort((a: any, b: any) => (b.photos?.length || 0) - (a.photos?.length || 0))[0];
            const photo = findActionPhoto((bestGame as any)?.photos || []);
            return photo ? { ...item, image: photo.largeUrl } : item;
        });

        console.log('[Imagn] posts with mediaUrl:', postsWithPhotos.filter((p: any) => p.mediaUrl).length, '/', postsWithPhotos.length);
        console.log('[Imagn] news with image:', newsWithPhotos.filter((n: any) => n.image).length, '/', newsWithPhotos.length);

        return { uniqueNewPosts: postsWithPhotos, uniqueNewNews: newsWithPhotos };
    } catch (_) {
        return { uniqueNewPosts, uniqueNewNews };
    }
};
