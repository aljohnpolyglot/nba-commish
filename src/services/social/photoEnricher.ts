/**
 * photoEnricher.ts
 *
 * Lazy photo enrichment — called ONLY when a post is visible on screen.
 * Nothing here runs during simulation. Photos load on scroll like real Twitter.
 */

import type { SocialPost, NBATeam } from '../../types';
import { fetchGamePlayerPhotos, type ImagnPhoto } from '../ImagnPhotoService';
import { SettingsManager } from '../SettingsManager';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GamePhotoInfo {
    homeTeam: NBATeam;
    awayTeam: NBATeam;
    topPlayers: { name: string; gameScore: number }[];
    date: string;
}

// ─── Module-level cache (survives across renders, cleared on page reload) ─────

/** gameKey → playerName → sorted photos */
const photoCache = new Map<string, Map<string, ImagnPhoto[]>>();

/** gameKey → in-flight promise (prevents duplicate fetches) */
const pendingFetches = new Map<string, Promise<Map<string, ImagnPhoto[]>>>();

/** postId → resolved mediaUrl  (prevents re-enriching same post) */
const resolvedPosts = new Map<string, string | null>();

// ─── Photo allowlist — hc_ and nba_ templates get Imagn action photos ────────
const isAllowed = (post: SocialPost): boolean => {
    const handle = (post.handle || '').toLowerCase().replace('@', '').trim();
    // StatMuse is shielded — they have their own photos
    if (handle.includes('statmuse')) return false;
    const templateId = (post.data?.templateId || '') as string;
    // hc_ (Hoop Central) gets raw Imagn photos
    // nba_ (NBA Official) gets Imagn photos fed into ImagnPhotoEditor
    return templateId.startsWith('hc_') || templateId.startsWith('nba_');
};

/**
 * Returns true if this post should render through the canvas ImagnPhotoEditor
 * (score bar overlay). Only @NBA posts get the edited canvas version.
 * Hoop Central and others get the raw Imagn photo.
 */
export function needsCanvasEditor(post: SocialPost): boolean {
    const templateId = (post.data?.templateId || '') as string;
    return templateId.startsWith('nba_');
}

// ─── Game key ─────────────────────────────────────────────────────────────────

function makeGameKey(home: NBATeam, away: NBATeam, date: string): string {
    return `${home.abbrev}-${away.abbrev}-${date.slice(0, 10)}`;
}

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

// ─── Player name extraction ───────────────────────────────────────────────────

function extractPlayerName(post: SocialPost, topPlayers?: { name: string; gameScore: number }[]): string | null {
    // 1. Explicit stat card data (most reliable)
    if (post.data?.playerName) return post.data.playerName;

    const content = post.content || '';

    // 2. Cross-reference against topPlayers who actually played (BEST method)
    //    Avoids matching team names like "Washington Wizards"
    if (topPlayers && topPlayers.length > 0) {
        // Sort by gameScore desc so we match stars first
        const sorted = [...topPlayers].sort((a, b) => b.gameScore - a.gameScore);
        for (const p of sorted) {
            const lastName = p.name.split(/\s+/).pop()?.toLowerCase() || '';
            // Check full name or last name appears in content
            if (content.toLowerCase().includes(p.name.toLowerCase()) ||
                (lastName.length > 3 && content.toLowerCase().includes(lastName))) {
                console.log(`[PhotoEnricher] Name matched via topPlayers: "${p.name}" in post`);
                return p.name;
            }
        }
    }

    // 3. "FirstName LastName: NN PTS" — explicit stat line format
    const statLineMatch = content.match(/([A-Z][a-z]+(?:[\s'-][A-Z][a-zA-Z'-]+)+):\s*\d+\s*PTS/m);
    if (statLineMatch) return statLineMatch[1];

    // 4. ALL CAPS name — highlight accounts like @bball_forever
    const capsMatch = content.match(/\b([A-Z]{2,}(?:\s+[A-Z]{2,})+)\b/);
    if (capsMatch) {
        return capsMatch[1]
            .split(/\s+/)
            .map((w: string) => w[0] + w.slice(1).toLowerCase())
            .join(' ');
    }

    // NOTE: Removed general "first capitalized words" fallback — it was matching team names.
    return null;
}

// ─── Photo selection (prefer action shots) ────────────────────────────────────

function pickBestPhoto(photos: ImagnPhoto[], hint?: string): ImagnPhoto | null {
    if (!photos?.length) return null;
    const cap = (p: ImagnPhoto) => (p.captionClean || p.caption || '').toLowerCase();
    const h = (hint || '').toLowerCase();

    // Game winner / buzzer beater → clutch moment shots
    if (h.includes('buzzer') || h.includes('walkoff') || h.includes('game_winner') || h.includes('close_game')) {
        return photos.find(p => ['buzzer', 'game-winner', 'game winner', 'clutch'].some(w => cap(p).includes(w)))
            || photos.find(p => ['shoots', 'jumper', 'three point basket'].some(w => cap(p).includes(w)))
            || photos[0];
    }

    // Dunk / highlight / 50pt game → action priority
    if (h.includes('fifty') || h.includes('dunk') || h.includes('feat') || h.includes('perfect')) {
        return photos.find(p => ['dunk', 'alley-oop', 'slams', 'hangs on the rim'].some(w => cap(p).includes(w)))
            || photos.find(p => ['drives', 'layup', 'scores', 'basket'].some(w => cap(p).includes(w)))
            || photos[0];
    }

    // Triple double / 5x5 → reaction/celebration shot
    if (h.includes('triple') || h.includes('5x5') || h.includes('double')) {
        return photos.find(p => ['reacts', 'celebrates', 'points', 'pumps'].some(w => cap(p).includes(w)))
            || photos.find(p => ['shoots', 'jumper', 'passes'].some(w => cap(p).includes(w)))
            || photos[0];
    }

    // Injury → sideline preferred
    if (h.includes('injury') || h.includes('injur')) {
        return photos.find(p => ['sideline', 'bench', 'walks', 'limps', 'trainer'].some(w => cap(p).includes(w)))
            || photos[0];
    }

    // OT thriller / blowout / general recap → best action
    return photos.find(p => ['dunk', 'alley-oop', 'three point basket', 'buzzer'].some(w => cap(p).includes(w)))
        || photos.find(p => ['shoots', 'layup', 'drives', 'basket'].some(w => cap(p).includes(w)))
        || photos[0];
}

// ─── Caption subject check ────────────────────────────────────────────────────

/**
 * Returns true if playerName is the SUBJECT of the caption.
 * Imagn captions always follow: "[Team] [Position] [Subject] (number) [verb]..."
 * The subject is simply the FIRST "Firstname Lastname (number)" match.
 */
function isSubjectOfCaption(playerName: string, caption: string): boolean {
    if (!caption || !playerName) return false;

    // Find the very first "Firstname Lastname (number)" pattern in the caption.
    // BUG FIX: was [a-z]+ which stopped at embedded uppercase — "DeMar" matched as "Mar",
    // "LeBron" as "Bron". Changed first token to [a-zA-Z'-]+ to handle camelCase names.
    const firstNameMatch = caption.match(/([A-Z][a-zA-Z'-]+(?:[\s'-][A-Z][a-zA-Z'-]+)+)\s*\(\d+\)/);
    if (!firstNameMatch) return false;

    const firstSubject = firstNameMatch[1].toLowerCase();
    const lastName = playerName.toLowerCase().split(/\s+/).pop() || '';

    const isSubject = firstSubject.includes(lastName) ||
        playerName.toLowerCase().includes(firstSubject.split(/\s+/).pop() || '');

    if (!isSubject) {
        console.log(`[PhotoEnricher] SKIP "${playerName}" — subject is "${firstNameMatch[1]}" in: "${caption.slice(0, 80)}"`);
        return false;
    }

    // Extra check: if player IS the subject but doing a defensive action,
    // mark as NOT subject for offensive action photo purposes.
    const lower = caption.toLowerCase();
    const playerIndex = (firstNameMatch.index || 0) + firstNameMatch[0].length;
    const afterPlayerText = lower.slice(playerIndex, playerIndex + 150);

    // OFFENSE WINS: if the player is clearly on offense, keep the photo even if a
    // defensive word appears later in the caption (e.g. "dribbles as X defends him").
    const OFFENSIVE_VERBS = [
        'dribbles', 'shoots', 'drives', 'dunks', 'scores',
        'goes to the basket', 'goes to the hoop', 'layup',
        'makes a', 'three point', 'jumper', 'pull-up',
    ];
    if (OFFENSIVE_VERBS.some(v => afterPlayerText.includes(v))) return true;

    // BUG FIX: removed "defended by" — that phrase means the player IS the ball-handler
    // (on offense). Only true defensive actions are excluded.
    const DEFENSIVE_VERBS = [
        'contests', 'contesting',
        'defends', 'defending',
        'looks on', 'watch',
        'stands', 'reacts to',
    ];
    const isDefensive = DEFENSIVE_VERBS.some(v => afterPlayerText.includes(v));
    if (isDefensive) {
        console.log(`[PhotoEnricher] SKIP "${playerName}" — doing defensive action in: "${caption.slice(0, 80)}"`);
        return false;
    }

    return true;
}

// ─── Main enrichment function ─────────────────────────────────────────────────

/**
 * Returns the Imagn photo URL for a post, or null if none found.
 * Calls are cached — safe to call multiple times for the same post.
 *
 * @param post        The social post to enrich
 * @param gameLookup  Map from gameId → GamePhotoInfo (built from boxScores + teams)
 */
export async function enrichPostWithPhoto(
    post: SocialPost,
    gameLookup: Map<number, GamePhotoInfo>
): Promise<string | null> {
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
    if (post.mediaUrl && !isAllowed(post)) {
        const handle = (post.handle || '').toLowerCase().replace('@', '').trim();
        if (!handle.includes('statmuse')) {
            resolvedPosts.set(post.id, null);
            return null;
        }
    }

    // Only nba_ templates (and StatMuse shield) get Imagn photos
    if (!isAllowed(post)) {
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
    gameLookup: Map<number, GamePhotoInfo>
): Promise<string | null> {
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