// NBA Memes Fetcher
// Fetches real @NBAMemes tweets from GitHub at app startup (same pattern as statmuseImages.ts).
// Memes fire independently of game context — nonsensically into the feed.
// Frequency: ~2x/week during season, high activity (~70% per day) in offseason.

const NBA_MEMES_URL =
    'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbamemestweets';

export interface NBAmemeEntry {
    id: string;
    text: string;
    image: string;
    stats: { replies: string; reposts: string; likes: string };
    date: string;
}

export let NBA_MEMES_POOL: NBAmemeEntry[] = [];

// Per-session state — resets on page reload
let usedMemeIds = new Set<string>();
let lastMemeDate = '';

export const fetchNBAMemes = async () => {
    console.log('[NBAmemes] Fetching NBA memes pool...');
    try {
        const res = await fetch(NBA_MEMES_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NBAmemeEntry[] = await res.json();
        NBA_MEMES_POOL = data.filter(m => !!m.image);
        console.log(`[NBAmemes] Loaded ${NBA_MEMES_POOL.length} memes.`);
    } catch (err) {
        console.warn('[NBAmemes] Failed to load:', err);
    }
};

const isOffseason = (dateStr: string): boolean => {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1; // 1=Jan
    // Offseason: July, August, September, and pre-opening-night October
    return month === 7 || month === 8 || month === 9 || (month === 10 && d.getDate() < 24);
};

/**
 * Pick a meme for the current sim date, respecting frequency rules.
 * - Season / playoffs: ~28% chance per sim day (~2x per week)
 * - Offseason: ~70% chance per sim day (high activity)
 * Returns null if no meme should fire today.
 */
export const pickMemePost = (dateStr: string): NBAmemeEntry | null => {
    if (NBA_MEMES_POOL.length === 0) return null;

    // Only fire once per calendar day
    const dayKey = dateStr.slice(0, 10);
    if (dayKey === lastMemeDate) return null;

    const offseason = isOffseason(dateStr);
    const threshold = offseason ? 0.70 : 0.28;
    if (Math.random() > threshold) return null;

    // Prefer unseen memes; cycle back through all when exhausted
    const unseen = NBA_MEMES_POOL.filter(m => !usedMemeIds.has(m.id));
    const pool = unseen.length > 0 ? unseen : NBA_MEMES_POOL;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    usedMemeIds.add(chosen.id);
    if (usedMemeIds.size >= NBA_MEMES_POOL.length) usedMemeIds.clear();

    lastMemeDate = dayKey;
    return chosen;
};
