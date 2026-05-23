/**
 * photoEnricher.ts
 *
 * Lazy photo enrichment — called ONLY when a post is visible on screen.
 * Nothing here runs during simulation. Photos load on scroll like real Twitter.
 */

import type { SocialPost } from '../../types';
import { fetchGamePlayerPhotos, type ImagnPhoto } from '../ImagnPhotoService';
import { SettingsManager } from '../SettingsManager';
import {
  extractPlayerName,
  type GamePhotoInfo,
  isAllowedSocialPhoto,
  isSubjectOfCaption,
  makeGameKey,
  needsCanvasEditor,
  pickBestPhoto,
} from './photoEnricherHelpers';
export { needsCanvasEditor, type GamePhotoInfo } from './photoEnricherHelpers';

// ─── Module-level cache (survives across renders, cleared on page reload) ─────

/** gameKey → playerName → sorted photos */
const photoCache = new Map<string, Map<string, ImagnPhoto[]>>();

/** gameKey → in-flight promise (prevents duplicate fetches) */
const pendingFetches = new Map<string, Promise<Map<string, ImagnPhoto[]>>>();

/** postId → resolved mediaUrl  (prevents re-enriching same post) */
const resolvedPosts = new Map<string, string | null>();

// ─── Imagn fetch (cached) ─────────────────────────────────────────────────────

async function fetchForGame(info: GamePhotoInfo): Promise<Map<string, ImagnPhoto[]>> {
    const gameKey = makeGameKey(info.homeTeam, info.awayTeam, info.date);

    if (photoCache.has(gameKey)) return photoCache.get(gameKey)!;
    if (pendingFetches.has(gameKey)) return pendingFetches.get(gameKey)!;

    const promise = fetchGamePlayerPhotos({
        homeTeam: info.homeTeam,
        awayTeam: info.awayTeam,
        topPlayers: info.topPlayers,
        gameKey,
    })
        .then(rawPhotos => {
            // Build a set of names who actually played (from topPlayers)
            const playedNames = new Set(
                (info.topPlayers || []).map(p => p.name.toLowerCase())
            );

            console.log('[PhotoEnricher] topPlayers who played:', [...playedNames]);

            const filteredMap = new Map<string, ImagnPhoto[]>();

            for (const [playerName, photos] of rawPhotos.entries()) {
                const nameLower = playerName.toLowerCase();
                const lastName = nameLower.split(/\s+/).pop() || '';

                // 1. Skip players who didn't play in this game
                const didPlay = playedNames.has(nameLower) ||
                    [...playedNames].some(n => n.endsWith(lastName) || lastName === (n.split(/\s+/).pop() || ''));

                if (!didPlay) {
                    console.log(`[PhotoEnricher] SKIP player "${playerName}" — not in played list`);
                    continue;
                }

                // 2. Within this player's photos, only keep ones where they are the subject
                const subjectPhotos = photos.filter(p => {
                    const caption = p.captionClean || p.caption || '';
                    return isSubjectOfCaption(playerName, caption);
                });

                // If subject photos exist, use them. Otherwise keep all (ambiguous captions)
                const finalPhotos = subjectPhotos.length > 0 ? subjectPhotos : photos;

                if (finalPhotos.length > 0) {
                    filteredMap.set(playerName, finalPhotos);
                    console.log(`[PhotoEnricher] "${playerName}" → ${finalPhotos.length} subject photos kept (${photos.length - finalPhotos.length} bystander photos removed)`);
                }
            }

            console.log(`[PhotoEnricher] Photo map: ${rawPhotos.size} raw players → ${filteredMap.size} after filtering`);
            photoCache.set(gameKey, filteredMap);
            pendingFetches.delete(gameKey);
            return filteredMap;
        })
        .catch(err => {
            console.warn(`[PhotoEnricher] Fetch failed for ${gameKey}:`, err);
            pendingFetches.delete(gameKey);
            return new Map<string, ImagnPhoto[]>();
        });

    pendingFetches.set(gameKey, promise);
    return promise;
}

// ─── Main enrichment function ─────────────────────────────────────────────────

/**
 * Returns the Imagn photo URL for a post, or null if none found.
 * Calls are cached — safe to call multiple times for the same post.
 *
 * @param post        The social post to enrich
 * @param gameLookup  Map from gameId → GamePhotoInfo (built from boxScores + teams)
 * @param leagueType  Skip enrichment for fictional leagues (no real Imagn photos exist)
 */
export async function enrichPostWithPhoto(
    post: SocialPost,
    gameLookup: Map<number, GamePhotoInfo>,
    leagueType?: string
): Promise<string | null> {
    if (leagueType === 'fictional') return null;
    // Already resolved (including null = "tried and found nothing")
    if (resolvedPosts.has(post.id)) return resolvedPosts.get(post.id)!;

    // Already has a photo from somewhere
    if (post.mediaUrl) {
        const tplId = (post.data?.templateId || '') as string;
        if (tplId.startsWith('nba_')) {
            console.log(`[PhotoEnricher] @NBA post "${tplId}" already has mediaUrl="${post.mediaUrl?.slice(0, 80)}" — skipping enrichment`);
        }
        resolvedPosts.set(post.id, post.mediaUrl);
        return post.mediaUrl;
    }

    // Strip mediaUrl from non-nba_ template posts (keeps feed clean)
    if (post.mediaUrl && !isAllowedSocialPhoto(post)) {
        const handle = (post.handle || '').toLowerCase().replace('@', '').trim();
        if (!handle.includes('statmuse')) {
            resolvedPosts.set(post.id, null);
            return null;
        }
    }

    // Only nba_ templates (and StatMuse shield) get Imagn photos
    if (!isAllowedSocialPhoto(post)) {
        const tplId = (post.data?.templateId || '') as string;
        if (tplId.startsWith('nba_')) {
            console.warn(`[PhotoEnricher] @NBA post "${tplId}" blocked by isAllowed — templateId check failed! handle="${post.handle}" post.data=`, post.data);
        }
        // StatMuse: skip enrichment entirely, leave their post and mediaUrl untouched
        const handle = (post.handle || '').toLowerCase().replace('@', '').trim();
        if (!handle.includes('statmuse')) {
            resolvedPosts.set(post.id, null);
        }
        return null;
    }

    const allowedTplId = (post.data?.templateId || '') as string;
    if (allowedTplId.startsWith('nba_')) {
        console.log(`[PhotoEnricher] @NBA post "${allowedTplId}" passed isAllowed — fetching game photo. gameId=${post.data?.gameId}`);
    }

    // No game association = no photo
    const gameId = post.data?.gameId as number | undefined;
    if (!gameId) {
        resolvedPosts.set(post.id, null);
        return null;
    }

    const gameInfo = gameLookup.get(gameId);
    if (!gameInfo) {
        resolvedPosts.set(post.id, null);
        return null;
    }

    // Await the shared fetch without a hard timeout.
    // fetchForGame deduplicates via pendingFetches, so all posts for the same game
    // share one HTTP request. A timeout here would race against sibling posts that
    // piggyback on the same promise — whichever post started the fetch first could
    // time out just before the fetch completes, permanently caching null for that post.
    const playerPhotoMap = await fetchForGame(gameInfo);

    if (playerPhotoMap.size === 0) {
        // Still allow AI fallback for named players even when Imagn has nothing
        const playerName = extractPlayerName(post, gameInfo.topPlayers);
        if (!playerName || !SettingsManager.getSettings().enableLLM) {
            resolvedPosts.set(post.id, null);
            return null;
        }
        const { generateGamePhoto } = await import('./gameImageGenerator');
        const aiKey = `ai-${gameInfo.homeTeam.abbrev}-${gameInfo.awayTeam.abbrev}-${gameInfo.date.slice(0, 10)}-${playerName.replace(/\s+/g, '_')}`;
        const aiUrl = await generateGamePhoto({
            playerName,
            playerFaceUrl: post.playerPortraitUrl || undefined,
            jerseyNumber: post.data?.jerseyNumber,
            teamName: gameInfo.homeTeam.name,
            teamColors: (gameInfo.homeTeam as any).colors,
            homeTeam: gameInfo.homeTeam,
            awayTeam: gameInfo.awayTeam,
            actionHint: post.data?.templateId || post.category || '',
            gameKey: aiKey,
        });
        if (aiUrl) {
            console.log(`[PhotoEnricher]  → AI generated photo for "${playerName}" (Imagn empty)`);
            resolvedPosts.set(post.id, aiUrl);
            return aiUrl;
        }
        resolvedPosts.set(post.id, null);
        return null;
    }

    // ── Debug logging ───────────────────────────────────────────────────────
    console.log(`[PhotoEnricher] Post (${post.handle}): "${post.content.slice(0, 90)}"`);

    // ── Find player ────────────────────────────────────────────────────────
    const playerName = extractPlayerName(post, gameInfo.topPlayers);
    let photo: ImagnPhoto | null = null;

    if (playerName) {
        const lastName = playerName.toLowerCase().split(/\s+/).pop() || '';

        // Exact match first, then last-name fuzzy match
        const matchedEntry = playerPhotoMap.get(playerName) ||
            [...playerPhotoMap.entries()]
                .find(([name]) =>
                    name.toLowerCase().endsWith(lastName) ||
                    playerName.toLowerCase().endsWith(
                        (name.toLowerCase().split(/\s+/).pop() || '')
                    )
                )?.[1];

        const hint = post.data?.templateId || post.category || '';
        photo = pickBestPhoto(matchedEntry || [], hint);
        console.log(
            `[PhotoEnricher]  → Player extracted: "${playerName}"`,
            photo
                ? `→ Photo: "${(photo.captionClean || photo.caption || '').slice(0, 70)}"`
                : '→ No player photo found, trying fallback'
        );
    }

    // ── Fallback: ONLY when no specific player was extracted ──────────────────
    // If we found a playerName but just had no photos for them,
    // render clean — don't show a random other player's photo.
    if (!photo && !playerName) {
        const firstPhotos = [...playerPhotoMap.values()][0];
        const hint = post.data?.templateId || post.category || '';
        photo = pickBestPhoto(firstPhotos || [], hint);
        if (photo) {
            console.log(`[PhotoEnricher]  → Fallback photo (no player extracted): "${(photo.captionClean || '').slice(0, 70)}"`);
        }
    }

    if (!photo && playerName) {
        console.log(`[PhotoEnricher]  → "${playerName}" had no photos — trying AI fallback`);
    }

    // ── AI fallback: generate photo when Imagn has nothing ────────────────────
    if (!photo && playerName && gameInfo && SettingsManager.getSettings().enableLLM) {
        const { generateGamePhoto } = await import('./gameImageGenerator');
        const aiKey = `ai-${gameInfo.homeTeam.abbrev}-${gameInfo.awayTeam.abbrev}-${gameInfo.date.slice(0, 10)}-${playerName.replace(/\s+/g, '_')}`;
        const aiUrl = await generateGamePhoto({
            playerName,
            playerFaceUrl: post.playerPortraitUrl || undefined,
            jerseyNumber: post.data?.jerseyNumber,
            teamName: gameInfo.homeTeam.name,
            teamColors: (gameInfo.homeTeam as any).colors,
            homeTeam: gameInfo.homeTeam,
            awayTeam: gameInfo.awayTeam,
            actionHint: post.data?.templateId || post.category || '',
            gameKey: aiKey,
        });
        if (aiUrl) {
            console.log(`[PhotoEnricher]  → AI generated photo for "${playerName}"`);
            resolvedPosts.set(post.id, aiUrl);
            return aiUrl;
        }
    }

    const result = photo?.medUrl || null;
    resolvedPosts.set(post.id, result);
    return result;
}

// ─── News item enrichment ─────────────────────────────────────────────────────

export async function enrichNewsWithPhoto(
    item: { id: string; headline: string; content: string; image?: string; playerPortraitUrl?: string },
    gameLookup: Map<number, GamePhotoInfo>,
    leagueType?: string
): Promise<string | null> {
    if (leagueType === 'fictional') return item.playerPortraitUrl || null;
    // Already resolved (including null = "tried and found nothing")
    if (resolvedPosts.has(item.id)) return resolvedPosts.get(item.id)!;
    // Static image (team logo) with no portrait override → use immediately, no Imagn needed
    if (item.image && !item.playerPortraitUrl) {
        resolvedPosts.set(item.id, item.image);
        return item.image;
    }

    const text = `${item.headline} ${item.content}`;
    const textLower = text.toLowerCase();

    // ── Find best matching game by team/player name mention ───────────────────
    let bestGameInfo: GamePhotoInfo | null = null;
    let bestMatchScore = 0;

    for (const [, info] of gameLookup.entries()) {
        const homeWord = (info.homeTeam.name.split(' ').pop() || '').toLowerCase();
        const awayWord = (info.awayTeam.name.split(' ').pop() || '').toLowerCase();
        const homeAbbrev = info.homeTeam.abbrev.toLowerCase();
        const awayAbbrev = info.awayTeam.abbrev.toLowerCase();

        let score = 0;
        if (textLower.includes(homeWord)) score += 1;
        if (textLower.includes(awayWord)) score += 1;
        if (textLower.includes(homeAbbrev)) score += 1;
        if (textLower.includes(awayAbbrev)) score += 1;
        for (const tp of info.topPlayers) {
            const lastName = (tp.name.split(/\s+/).pop() || '').toLowerCase();
            if (lastName.length > 3 && textLower.includes(lastName)) { score += 3; break; }
        }

        if (score > bestMatchScore) { bestMatchScore = score; bestGameInfo = info; }
    }

    if (!bestGameInfo || bestMatchScore === 0) {
        resolvedPosts.set(item.id, item.playerPortraitUrl || null);
        return item.playerPortraitUrl || null;
    }

    const playerPhotoMap = await Promise.race([
        fetchForGame(bestGameInfo),
        new Promise<Map<string, ImagnPhoto[]>>(resolve => setTimeout(() => resolve(new Map()), 5000))
    ]);

    if (playerPhotoMap.size === 0) {
        const result = item.playerPortraitUrl || null;
        resolvedPosts.set(item.id, result);
        return result;
    }

    // ── Match player by name in headline/content (same logic as social feed) ─
    let targetPlayerName: string | null = null;
    const sortedPlayers = [...bestGameInfo.topPlayers].sort((a, b) => b.gameScore - a.gameScore);
    for (const tp of sortedPlayers) {
        const lastName = (tp.name.split(/\s+/).pop() || '').toLowerCase();
        if (lastName.length > 3 && textLower.includes(lastName)) {
            targetPlayerName = tp.name;
            break;
        }
        if (textLower.includes(tp.name.toLowerCase())) {
            targetPlayerName = tp.name;
            break;
        }
    }

    let photo: ImagnPhoto | null = null;

    if (targetPlayerName) {
        const lastName = (targetPlayerName.toLowerCase().split(/\s+/).pop() || '');
        const matchedPhotos = playerPhotoMap.get(targetPlayerName) ||
            [...playerPhotoMap.entries()]
                .find(([name]) =>
                    name.toLowerCase().endsWith(lastName) ||
                    targetPlayerName!.toLowerCase().endsWith((name.toLowerCase().split(/\s+/).pop() || ''))
                )?.[1];
        if (matchedPhotos) {
            photo = pickBestPhoto(matchedPhotos, item.headline);
            console.log(`[PhotoEnricher] News "${item.headline.slice(0, 50)}" → player "${targetPlayerName}" → "${(photo?.captionClean || '').slice(0, 60)}"`);
        }
    }

    // Fallback: first player in photo map when no name extracted
    if (!photo) {
        const firstPhotos = [...playerPhotoMap.values()][0];
        if (firstPhotos) {
            photo = pickBestPhoto(firstPhotos, item.headline);
            if (photo) console.log(`[PhotoEnricher] News "${item.headline.slice(0, 50)}" → fallback photo`);
        }
    }

    if (!photo) {
        const result = item.playerPortraitUrl || null;
        resolvedPosts.set(item.id, result);
        return result;
    }

    resolvedPosts.set(item.id, photo.medUrl || null);
    return photo.medUrl || null;
}

/** Synchronously check if a post already has a resolved URL in cache */
export function getResolvedUrl(postId: string): string | null | undefined {
    // undefined = not yet resolved, null = resolved but no photo, string = has photo
    if (!resolvedPosts.has(postId)) return undefined;
    return resolvedPosts.get(postId) ?? null;
}

/** Clear all photo caches — call between game simulations so each session starts fresh */
export function clearPhotoEnricherCache(): void {
    resolvedPosts.clear();
    photoCache.clear();
    pendingFetches.clear();
}
