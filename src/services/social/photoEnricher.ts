/**
 * photoEnricher.ts
 *
 * Lazy photo enrichment — called ONLY when a post is visible on screen.
 * Nothing here runs during simulation. Photos load on scroll like real Twitter.
 */

import type { SocialPost } from '../../types';
import { fetchGamePlayerPhotos, type ImagnPhoto } from '../ImagnPhotoService';
import {
  extractPlayerName,
  getEligibleRealPhotoProviders,
  type GamePhotoInfo,
  isAllowedSocialPhoto,
  isSubjectOfCaption,
  makeGameKey,
  needsCanvasEditor,
  pickBestPhoto,
  resolveRealPhotoCredit,
  toImagnSearchContext,
} from './photoEnricherHelpers';
export { buildGamePhotoInfo, isAllowedSocialPhoto, needsCanvasEditor, type GamePhotoInfo } from './photoEnricherHelpers';

// ─── Module-level cache (survives across renders, cleared on page reload) ─────

/** gameKey → playerName → sorted photos */
const photoCache = new Map<string, Map<string, ImagnPhoto[]>>();

/** gameKey → in-flight promise (prevents duplicate fetches) */
const pendingFetches = new Map<string, Promise<Map<string, ImagnPhoto[]>>>();

type PhotoEnrichmentSurface = 'social' | 'news';

interface NewsPhotoSource {
    id: string;
    title?: string;
    headline?: string;
    content?: string;
    imageUrl?: string;
    image?: string;
    playerPortraitUrl?: string;
    gameId?: number;
}

interface NewsPhotoRequest {
    id: string;
    headline: string;
    content: string;
    image?: string;
    playerPortraitUrl?: string;
    gameId?: number;
}

export function buildNewsPhotoRequest(item: NewsPhotoSource): NewsPhotoRequest {
    return {
        id: item.id,
        headline: item.headline ?? item.title ?? '',
        content: item.content ?? '',
        image: item.image ?? item.imageUrl,
        playerPortraitUrl: item.playerPortraitUrl,
        gameId: item.gameId,
    };
}

const makeResolvedKey = (surface: PhotoEnrichmentSurface, id: string): string => `${surface}:${id}`;

/** surface + itemId → resolved mediaUrl (prevents cross-feed ID collisions) */
const resolvedPosts = new Map<string, string | null>();
const resolvedPhotoCredits = new Map<string, string>();

// ─── Imagn fetch (cached) ─────────────────────────────────────────────────────

async function fetchForGame(info: GamePhotoInfo, hint?: string, targetPlayerName?: string | null): Promise<Map<string, ImagnPhoto[]>> {
    if (!getEligibleRealPhotoProviders(info).includes('imagn')) return new Map();
    const requestedTopPlayers = targetPlayerName
        ? info.topPlayers.filter(player => player.name === targetPlayerName)
        : info.topPlayers;
    const subjectKey = targetPlayerName?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'all';
    const gameKey = `${makeGameKey(info, hint)}|subject:${subjectKey}`;

    if (photoCache.has(gameKey)) return photoCache.get(gameKey)!;
    if (pendingFetches.has(gameKey)) return pendingFetches.get(gameKey)!;

    const promise = fetchGamePlayerPhotos({
        homeTeam: info.homeTeam,
        awayTeam: info.awayTeam,
        topPlayers: requestedTopPlayers,
        gameKey,
        date: info.date,
        season: info.season,
        league: info.league,
        competitionId: info.competitionId,
        uiMode: info.uiMode,
        branchCutoffDate: info.branchCutoffDate,
        actionHint: hint,
    })
        .then(rawPhotos => {
            // Build a set of names who actually played (from topPlayers)
            const playedNames = new Set(
                requestedTopPlayers.map(p => p.name.toLowerCase())
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

                if (subjectPhotos.length > 0) {
                    filteredMap.set(playerName, subjectPhotos);
                    console.log(`[PhotoEnricher] "${playerName}" → ${subjectPhotos.length} subject photos kept (${photos.length - subjectPhotos.length} bystander photos removed)`);
                }
            }

            console.log(`[PhotoEnricher] Photo map: ${rawPhotos.size} raw players → ${filteredMap.size} after filtering`);
            if (filteredMap.size > 0) photoCache.set(gameKey, filteredMap);
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
    const resolvedKey = makeResolvedKey('social', post.id);
    const allowedSocialPhoto = isAllowedSocialPhoto(post);
    const fallbackUrl = (post.data?.league === 'euro' || post.data?.leagueId === 'euro')
        ? post.mediaUrl || post.playerPortraitUrl || null
        : allowedSocialPhoto ? null : post.mediaUrl || null;
    // Already resolved (including null = "tried and found nothing")
    if (resolvedPosts.has(resolvedKey)) return resolvedPosts.get(resolvedKey)!;

    // Only eligible game templates use licensed real-photo providers. Any existing
    // media remains a fallback while the provider lookup runs.
    if (!allowedSocialPhoto) {
        const tplId = (post.data?.templateId || '') as string;
        if (tplId.startsWith('nba_')) {
            console.warn(`[PhotoEnricher] @NBA post "${tplId}" blocked by isAllowed — templateId check failed! handle="${post.handle}" post.data=`, post.data);
        }
        // StatMuse: skip enrichment entirely, leave their post and mediaUrl untouched
        const handle = (post.handle || '').toLowerCase().replace('@', '').trim();
        if (!handle.includes('statmuse')) {
            resolvedPosts.set(resolvedKey, fallbackUrl);
        }
        return fallbackUrl;
    }

    const allowedTplId = (post.data?.templateId || '') as string;
    if (allowedTplId.startsWith('nba_')) {
        console.log(`[PhotoEnricher] @NBA post "${allowedTplId}" passed isAllowed — fetching game photo. gameId=${post.data?.gameId}`);
    }

    // No game association = no photo
    const gameId = post.data?.gameId as number | undefined;
    if (!gameId) {
        resolvedPosts.set(resolvedKey, fallbackUrl);
        return fallbackUrl;
    }

    const gameInfo = gameLookup.get(gameId);
    if (!gameInfo) {
        return fallbackUrl;
    }
    if (gameInfo.league === 'Fictional') {
        resolvedPosts.set(resolvedKey, null);
        return null;
    }

    const playerName = extractPlayerName(post, gameInfo.topPlayers);

    // Await the shared fetch without a hard timeout.
    // fetchForGame deduplicates via pendingFetches, so all posts for the same game
    // share one HTTP request. A timeout here would race against sibling posts that
    // piggyback on the same promise — whichever post started the fetch first could
    // time out just before the fetch completes, permanently caching null for that post.
    const hint = post.data?.templateId || post.category || '';
    const playerPhotoMap = await fetchForGame(gameInfo, hint, playerName);

    if (playerPhotoMap.size === 0) {
        return fallbackUrl;
    }

    // ── Debug logging ───────────────────────────────────────────────────────
    console.log(`[PhotoEnricher] Post (${post.handle}): "${post.content.slice(0, 90)}"`);

    // ── Find player ────────────────────────────────────────────────────────
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

        photo = pickBestPhoto(matchedEntry || [], hint, toImagnSearchContext(gameInfo, playerName, hint));
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
        photo = pickBestPhoto(firstPhotos || [], hint, toImagnSearchContext(gameInfo, undefined, hint));
        if (photo) {
            console.log(`[PhotoEnricher]  → Fallback photo (no player extracted): "${(photo.captionClean || '').slice(0, 70)}"`);
        }
    }

    const result = photo?.medUrl || fallbackUrl;
    if (photo) resolvedPhotoCredits.set(resolvedKey, resolveRealPhotoCredit(photo));
    resolvedPosts.set(resolvedKey, result);
    return result;
}

// ─── News item enrichment ─────────────────────────────────────────────────────

export async function enrichNewsWithPhoto(
    item: NewsPhotoRequest,
    gameLookup: Map<number, GamePhotoInfo>,
    leagueType?: string
): Promise<string | null> {
    const fallbackUrl = item.playerPortraitUrl || item.image || null;
    if (leagueType === 'fictional') return fallbackUrl;
    const resolvedKey = makeResolvedKey('news', item.id);
    // Already resolved (including null = "tried and found nothing")
    if (resolvedPosts.has(resolvedKey)) return resolvedPosts.get(resolvedKey)!;

    const text = `${item.headline} ${item.content}`;
    const textLower = text.toLowerCase();

    // ── Find best matching game by team/player name mention ───────────────────
    let bestGameInfo: GamePhotoInfo | null = item.gameId == null
        ? null
        : gameLookup.get(Number(item.gameId)) ?? null;
    let bestMatchScore = 0;

    for (const [, info] of bestGameInfo ? [] : gameLookup.entries()) {
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

    if (!bestGameInfo || (item.gameId == null && bestMatchScore === 0)) {
        return fallbackUrl;
    }

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

    const playerPhotoMap = await fetchForGame(bestGameInfo, item.headline, targetPlayerName);

    if (playerPhotoMap.size === 0) {
        return fallbackUrl;
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
            photo = pickBestPhoto(matchedPhotos, item.headline, toImagnSearchContext(bestGameInfo, targetPlayerName, item.headline));
            console.log(`[PhotoEnricher] News "${item.headline.slice(0, 50)}" → player "${targetPlayerName}" → "${(photo?.captionClean || '').slice(0, 60)}"`);
        }
    }

    // Fallback: first player in photo map only when the article has no named player.
    if (!photo && !targetPlayerName) {
        const firstPhotos = [...playerPhotoMap.values()][0];
        if (firstPhotos) {
            photo = pickBestPhoto(firstPhotos, item.headline, toImagnSearchContext(bestGameInfo, undefined, item.headline));
            if (photo) console.log(`[PhotoEnricher] News "${item.headline.slice(0, 50)}" → fallback photo`);
        }
    }

    if (!photo) {
        resolvedPosts.set(resolvedKey, fallbackUrl);
        return fallbackUrl;
    }

    resolvedPhotoCredits.set(resolvedKey, resolveRealPhotoCredit(photo));
    resolvedPosts.set(resolvedKey, photo.medUrl || null);
    return photo.medUrl || null;
}

/** Synchronously check if a post already has a resolved URL in cache */
export function getResolvedUrl(postId: string, surface: PhotoEnrichmentSurface = 'social'): string | null | undefined {
    const resolvedKey = makeResolvedKey(surface, postId);
    // undefined = not yet resolved, null = resolved but no photo, string = has photo
    if (!resolvedPosts.has(resolvedKey)) return undefined;
    return resolvedPosts.get(resolvedKey) ?? null;
}

export function getResolvedPhotoCredit(id: string, surface: PhotoEnrichmentSurface = 'social'): string | undefined {
    return resolvedPhotoCredits.get(makeResolvedKey(surface, id));
}

/** Clear all photo caches — call between game simulations so each session starts fresh */
export function clearPhotoEnricherCache(): void {
    resolvedPosts.clear();
    photoCache.clear();
    pendingFetches.clear();
}
