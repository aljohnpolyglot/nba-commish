import { fetchWithCache } from '../utils/fetchWithCache';

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
    const data = await fetchWithCache<CharaniaPhotoEntry[]>('charania-photos', CHARANIA_PHOTOS_URL);
    if (data) {
        CHARANIA_PHOTOS = data.filter(e => !!e.image_url && !e.image_url.includes('amplify_video_thumb'));
        console.log(`[CharaniaPhotos] Loaded ${CHARANIA_PHOTOS.length} photos.`);
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

    // Word-boundary regex: prevents "tate" matching "State Warriors", "carter" matching "Descartes" etc.
    const lastNameRe = new RegExp(`\\b${lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

    // 1. Last name + team — most specific, handles same-last-name players
    if (teamLower) {
        const match = CHARANIA_PHOTOS.find(
            e =>
                e.player && e.team &&
                lastNameRe.test(e.player.toLowerCase()) &&
                e.team.toLowerCase().includes(teamLower)
        );
        if (match) {
            console.log(`[CharaniaPhotos] Match (name+team): "${playerName}" → "${match.player}" (${match.team})`);
            return match;
        }
    }

    // 2. Full player name (word boundary on last name for safety)
    const fullMatch = CHARANIA_PHOTOS.find(
        e => e.player && lastNameRe.test(e.player.toLowerCase()) && e.player.toLowerCase().includes(nameLower.split(' ')[0])
    );
    if (fullMatch) {
        console.log(`[CharaniaPhotos] Match (full name): "${playerName}" → "${fullMatch.player}"`);
        return fullMatch;
    }

    // 3. Last name only — word boundary + min length 6 to avoid common-name false positives
    if (lastName.length >= 6) {
        const lastOnly = CHARANIA_PHOTOS.find(
            e => e.player && lastNameRe.test(e.player.toLowerCase())
        );
        if (lastOnly) {
            console.log(`[CharaniaPhotos] Match (last name only, len≥6): "${playerName}" → "${lastOnly.player}"`);
            return lastOnly;
        }
    }

    console.log(`[CharaniaPhotos] No match for "${playerName}" (${teamName ?? 'no team'}) — returning null`);
    return null;
};
