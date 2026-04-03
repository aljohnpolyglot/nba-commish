// Charania Photo Helper
// Fetches real Shams tweet photos from GitHub at app startup (same pattern as statmuseImages.ts).
// Used to attach contextual images to Shams injury posts in socialHandler.ts.

const CHARANIA_PHOTOS_URL =
    'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/shamstweetsphotos';

export interface CharaniaPhotoEntry {
    player: string;
    team: string;
    date: string;
    stats: { replies: string; reposts: string; likes: string; views: string };
    image_url: string;
    caption: string;
}

export let CHARANIA_PHOTOS: CharaniaPhotoEntry[] = [];

export const fetchCharaniaPhotos = async () => {
    console.log('[CharaniaPhotos] Fetching Shams tweet photos...');
    try {
        const res = await fetch(CHARANIA_PHOTOS_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: CharaniaPhotoEntry[] = await res.json();
        // Only keep entries that have an actual photo (exclude video thumbnails)
        CHARANIA_PHOTOS = data.filter(e => !!e.image_url && !e.image_url.includes('amplify_video_thumb'));
        console.log(`[CharaniaPhotos] Loaded ${CHARANIA_PHOTOS.length} photos.`);
    } catch (err) {
        console.warn('[CharaniaPhotos] Failed to load:', err);
    }
};

/**
 * Find a matching Charania tweet photo for a player/team context.
 * NO fallback — returns null if nothing matches.
 *
 * Match order (most → least specific):
 *   1. Last name + team  (e.g. "green" + "Warriors" → Draymond, not Jalen)
 *   2. Full player name  (e.g. "stephen curry")
 *   3. Last name only    (acceptable — user ok with Seth finding Stephen)
 */
export const findShamsPhoto = (
    playerName?: string,
    teamName?: string
): CharaniaPhotoEntry | null => {
    if (CHARANIA_PHOTOS.length === 0 || !playerName) return null;

    const nameLower = playerName.toLowerCase();
    const lastName = nameLower.split(' ').pop() ?? nameLower;
    const teamLower = teamName?.toLowerCase() ?? '';

    // 1. Last name + team — most specific, handles same-last-name players
    if (teamLower) {
        const match = CHARANIA_PHOTOS.find(
            e =>
                e.player && e.team &&
                e.player.toLowerCase().includes(lastName) &&
                e.team.toLowerCase().includes(teamLower)
        );
        if (match) return match;
    }

    // 2. Full player name
    const fullMatch = CHARANIA_PHOTOS.find(
        e => e.player && e.player.toLowerCase().includes(nameLower)
    );
    if (fullMatch) return fullMatch;

    // 3. Last name only (acceptable near-miss)
    const lastOnly = CHARANIA_PHOTOS.find(
        e => e.player && e.player.toLowerCase().includes(lastName)
    );
    return lastOnly ?? null;
};
