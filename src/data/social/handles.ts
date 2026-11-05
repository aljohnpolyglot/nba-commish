import { getPrimaryInsiderKey } from '../../utils/mediaTimeline';

export interface SocialHandle {
    id: string;
    name: string;
    handle: string;
    avatarUrl?: string; // Optional for now
    description: string;
    verified: boolean;
}

export const SOCIAL_HANDLES: Record<string, SocialHandle> = {
    // --- OFFICIAL ---
    'NBA': {
        id: 'nba_official',
        name: 'NBA',
        
        handle: 'NBA',
        description: 'Official account of the NBA.',
        verified: true
    },
    'NBAPR': {
        id: 'nba_pr',
        name: 'NBA Communications',
        handle: 'NBAPR',
        description: 'Official communications from the NBA.',
        verified: true
    },

    // --- NEWS BREAKERS (Transactions Only) ---
    'Shams': {
        id: 'shams',
        name: 'Shams Charania',
        handle: 'ShamsCharania',
        description: 'NBA Insider for The Athletic and Stadium.',
        verified: true
    },
    'Woj': {
        id: 'woj',
        name: 'Adrian Wojnarowski',
        handle: 'wojespn',
        description: 'NBA Insider for ESPN.',
        verified: true
    },

    // --- AGGREGATORS / HYPE ---
    'NBACentral': {
        id: 'nba_central',
        name: 'NBACentral',
        handle: 'TheNBACentral',
        description: 'The #1 source for NBA news and rumors.',
        verified: true
    },
    'LegionHoops': {
        id: 'legion_hoops',
        name: 'Legion Hoops',
        handle: 'LegionHoops',
        description: 'NBA news, rumors, and highlights.',
        verified: true
    },
    'BasketballForever': {
        id: 'bball_forever',
        name: 'Basketball Forever',
        handle: 'bballforever_',
        description: 'Everything basketball.',
        verified: true
    },
    'NBAonESPN': {
        id: 'nba_espn',
        name: 'NBA on ESPN',
        handle: 'ESPNNBA',
        description: 'Your home for NBA news and analysis.',
        verified: true
    },
    'SportsCenter': {
        id: 'sportscenter',
        name: 'SportsCenter',
        handle: 'SportsCenter',
        description: 'News, highlights and analysis.',
        verified: true
    },
    'BleacherReport': {
        id: 'bleacher_report',
        name: 'Bleacher Report',
        handle: 'BleacherReport',
        description: 'Sports culture.',
        verified: true
    },
    'HoopCentral': {
        id: 'hoop_central',
        name: 'Hoop Central',
        handle: 'TheHoopCentral',
        description: 'NBA News & Rumors.',
        verified: true
    },
    'StephenA': {
        id: 'stephen_a',
        name: 'Stephen A Smith',
        handle: 'stephenasmith',
        description: 'A-List.',
        verified: true
    },
    'MarcStein': {
        id: 'marc_stein',
        name: 'Marc Stein',
        handle: 'TheSteinLine',
        description: 'NBA reporter.',
        verified: true
    },
    'Underdog': {
        id: 'underdog_nba',
        name: 'Underdog NBA',
        handle: 'Underdog__NBA',
        description: 'Lineups and news.',
        verified: true
    },
    'Wob': {
        id: 'world_wide_wob',
        name: 'Rob Perez',
        handle: 'WorldWideWob',
        description: 'NBA personality.',
        verified: true
    },
    'Windhorst': {
        id: 'windhorst',
        name: 'Brian Windhorst',
        handle: 'WindhorstESPN',
        description: 'ESPN NBA reporter.',
        verified: true
    },
    'NBATV': {
        id: 'nba_tv',
        name: 'NBA TV',
        handle: 'NBATV',
        description: 'Official NBA TV account.',
        verified: true
    },
    'GilsArena': {
        id: 'gils_arena',
        name: 'Gilbert Arenas',
        handle: 'GilsArenaShow',
        description: 'No chill.',
        verified: true
    },

    // --- STATS / ANALYSIS ---
    'StatMuse': {
        id: 'statmuse',
        name: 'StatMuse',
        handle: 'statmuse',
        description: 'Search, visualize and share sports data.',
        verified: true
    },
    'BasketballRef': {
        id: 'bball_ref',
        name: 'Basketball Reference',
        handle: 'bball_ref',
        description: 'Stats, scores, history.',
        verified: true
    },

    // --- MEMES / PARODY ---
    'NBAMemes': {
        id: 'nba_memes',
        name: 'NBA Memes',
        handle: 'NBAMemes',
        description: 'NBA Memes.',
        verified: false
    },
    'NBACentel': {
        id: 'nba_centel',
        name: 'NBACentel',
        handle: 'TheNBACentel',
        description: 'Parody account.',
        verified: false
    },
    'RefWatcher': {
        id: 'ref_watcher',
        name: 'Ref Watcher',
        handle: 'WhistleBlower',
        description: 'Watching the refs.',
        verified: false
    }
};

const DICE = 'https://api.dicebear.com/9.x';

export const FICTIONAL_SOCIAL_HANDLES: Record<string, SocialHandle> = {
    // --- OFFICIAL ---
    'NBA': {
        id: 'nba_official',
        name: 'The League',
        handle: 'TheLeagueOfficial',
        description: 'Official account of The League.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=TheLeagueOfficial`,
    },
    'NBAPR': {
        id: 'nba_pr',
        name: 'League Communications',
        handle: 'LeagueComms',
        description: 'Official communications from The League.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=LeagueComms`,
    },

    // --- NEWS BREAKERS ---
    'Shams': {
        id: 'shams',
        name: 'Tariq Hassan',
        handle: 'TariqHassan',
        description: 'League Insider.',
        verified: true,
        avatarUrl: `${DICE}/personas/svg?seed=TariqHassan`,
    },
    'Woj': {
        id: 'woj',
        name: 'Brent Kowalski',
        handle: 'KowalskiWire',
        description: 'League insider.',
        verified: true,
        avatarUrl: `${DICE}/personas/svg?seed=KowalskiWire`,
    },

    // --- AGGREGATORS ---
    'NBACentral': {
        id: 'nba_central',
        name: 'League Central',
        handle: 'TheLeagueCentral',
        description: 'The #1 source for League news and rumors.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=TheLeagueCentral`,
    },
    'LegionHoops': {
        id: 'legion_hoops',
        name: 'Grid Hoops',
        handle: 'GridHoops',
        description: 'League news, rumors, and highlights.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=GridHoops`,
    },
    'BasketballForever': {
        id: 'bball_forever',
        name: 'Hoop Forever',
        handle: 'HoopForever_',
        description: 'Everything basketball.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=HoopForever`,
    },
    'NBAonESPN': {
        id: 'nba_espn',
        name: 'Rim Report TV',
        handle: 'RimReportTV',
        description: 'Your home for League news and analysis.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=RimReportTV`,
    },
    'SportsCenter': {
        id: 'sportscenter',
        name: 'Center Court',
        handle: 'CenterCourtSC',
        description: 'News, highlights and analysis.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=CenterCourtSC`,
    },
    'BleacherReport': {
        id: 'bleacher_report',
        name: 'Hardwood Report',
        handle: 'HardwoodReport',
        description: 'Sports culture.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=HardwoodReport`,
    },
    'HoopCentral': {
        id: 'hoop_central',
        name: 'Hoop Central',
        handle: 'TheHoopCentral',
        description: 'League News & Rumors.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=TheHoopCentral`,
    },
    'StephenA': {
        id: 'stephen_a',
        name: 'Darnell King',
        handle: 'DarnellKingTV',
        description: 'A-List.',
        verified: true,
        avatarUrl: `${DICE}/personas/svg?seed=DarnellKingTV`,
    },
    'MarcStein': {
        id: 'marc_stein',
        name: 'Paul Gerber',
        handle: 'GerberNBA',
        description: 'League reporter.',
        verified: true,
        avatarUrl: `${DICE}/personas/svg?seed=GerberNBA`,
    },
    'Underdog': {
        id: 'underdog_nba',
        name: 'Underdog Hoops',
        handle: 'Underdog__Hoops',
        description: 'Lineups and news.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=UnderdogHoops`,
    },
    'Wob': {
        id: 'world_wide_wob',
        name: 'Ray Voss',
        handle: 'WorldWideVoss',
        description: 'Hoops personality.',
        verified: true,
        avatarUrl: `${DICE}/personas/svg?seed=WorldWideVoss`,
    },
    'Windhorst': {
        id: 'windhorst',
        name: 'Matt Lundy',
        handle: 'LundyESPN',
        description: 'ESPN League reporter.',
        verified: true,
        avatarUrl: `${DICE}/personas/svg?seed=LundyESPN`,
    },
    'NBATV': {
        id: 'nba_tv',
        name: 'Open Court TV',
        handle: 'OpenCourtTV',
        description: 'Official League TV account.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=OpenCourtTV`,
    },
    'GilsArena': {
        id: 'gils_arena',
        name: 'Boogie Nash',
        handle: 'BoogieNashPodcast',
        description: 'No chill.',
        verified: true,
        avatarUrl: `${DICE}/personas/svg?seed=BoogieNashPodcast`,
    },

    // --- STATS ---
    'StatMuse': {
        id: 'statmuse',
        name: 'StatMuse',
        handle: 'statmuse',
        description: 'Search, visualize and share sports data.',
        verified: true,
    },
    'BasketballRef': {
        id: 'bball_ref',
        name: 'Basketball Reference',
        handle: 'bball_ref',
        description: 'Stats, scores, history.',
        verified: true,
    },

    // --- MEMES / PARODY ---
    'NBAMemes': {
        id: 'nba_memes',
        name: 'Hoop Memes',
        handle: 'HoopMemes',
        description: 'Hoop Memes.',
        verified: false,
        avatarUrl: `${DICE}/thumbs/svg?seed=HoopMemes`,
    },
    'NBACentel': {
        id: 'nba_centel',
        name: 'League Centel',
        handle: 'TheLeagueCentel',
        description: 'Parody account.',
        verified: false,
        avatarUrl: `${DICE}/thumbs/svg?seed=TheLeagueCentel`,
    },
    'RefWatcher': {
        id: 'ref_watcher',
        name: 'Ref Watcher',
        handle: 'WhistleBlower',
        description: 'Watching the refs.',
        verified: false,
    },
};

export const PBA_SOCIAL_HANDLES: Record<string, SocialHandle> = {
    ...FICTIONAL_SOCIAL_HANDLES,
    NBA: {
        id: 'pba_official',
        name: 'PBA',
        handle: 'PBAOfficial',
        description: 'Official account of the PBA.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=PBAOfficial`,
    },
    NBAPR: {
        id: 'pba_communications',
        name: 'PBA Communications',
        handle: 'PBAComms',
        description: 'Official PBA communications.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=PBAComms`,
    },
    Shams: {
        id: 'pba_insider_modern',
        name: 'Manila Hoops Wire',
        handle: 'ManilaHoopsWire',
        description: 'PBA transactions and league news.',
        verified: true,
        avatarUrl: `${DICE}/personas/svg?seed=ManilaHoopsWire`,
    },
    Woj: {
        id: 'pba_insider_classic',
        name: 'Courtside Desk',
        handle: 'CourtsideDeskPH',
        description: 'Philippine basketball news desk.',
        verified: true,
        avatarUrl: `${DICE}/personas/svg?seed=CourtsideDeskPH`,
    },
    NBACentral: {
        id: 'pba_central',
        name: 'PBA Central',
        handle: 'PBACentral',
        description: 'PBA news, transactions and results.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=PBACentral`,
    },
    StatMuse: {
        id: 'pba_stats',
        name: 'PBA Stats',
        handle: 'PBAStatsPH',
        description: 'PBA statistics and records.',
        verified: true,
        avatarUrl: `${DICE}/thumbs/svg?seed=PBAStatsPH`,
    },
};

const modeHandle = (
    id: string,
    name: string,
    handle: string,
    description: string,
): SocialHandle => ({
    id,
    name,
    handle,
    description,
    verified: true,
    avatarUrl: `${DICE}/thumbs/svg?seed=${handle}`,
});

export const WNBA_SOCIAL_HANDLES: Record<string, SocialHandle> = {
    ...FICTIONAL_SOCIAL_HANDLES,
    NBA: modeHandle('wnba_official', 'WNBA', 'WNBA', 'Official account of the WNBA.'),
    NBAPR: modeHandle('wnba_communications', 'WNBA Communications', 'WNBAComms', 'Official WNBA communications.'),
    Shams: modeHandle('wnba_insider', 'Women’s Hoops Wire', 'WomensHoopsWire', 'WNBA transactions and league news.'),
    Woj: modeHandle('wnba_newsdesk', 'Women’s Basketball Desk', 'WomensBasketballDesk', 'Women’s basketball news desk.'),
    NBACentral: modeHandle('wnba_central', 'WNBA Central', 'WNBACentral', 'WNBA news, injuries and transactions.'),
    NBAonESPN: modeHandle('wnba_broadcast', 'Women’s Hoops Network', 'WomensHoopsNet', 'Scores, highlights and analysis.'),
};

export const EURO_SOCIAL_HANDLES: Record<string, SocialHandle> = {
    ...FICTIONAL_SOCIAL_HANDLES,
    NBA: modeHandle('euro_official', 'European Basketball', 'EuroBasketball', 'Official league basketball account.'),
    NBAPR: modeHandle('euro_communications', 'League Communications', 'EuroBasketballComms', 'Official league communications.'),
    Shams: modeHandle('euro_insider', 'Euro Hoops Wire', 'EuroHoopsWire', 'European basketball transactions and news.'),
    Woj: modeHandle('euro_newsdesk', 'European Basketball Desk', 'EuroBasketballDesk', 'European basketball news desk.'),
    NBACentral: modeHandle('euro_central', 'Euro Hoops Central', 'EuroHoopsCentral', 'European basketball news and results.'),
    NBAonESPN: modeHandle('euro_broadcast', 'Euro Hoops Network', 'EuroHoopsNetwork', 'Scores, highlights and analysis.'),
};

export function getSocialHandles(leagueType?: string, uiMode?: string | null): Record<string, SocialHandle> {
    if (uiMode === 'pba_isolated') return PBA_SOCIAL_HANDLES;
    if (uiMode === 'wnba_isolated') return WNBA_SOCIAL_HANDLES;
    if (uiMode === 'euro_isolated') return EURO_SOCIAL_HANDLES;
    return leagueType === 'fictional' ? FICTIONAL_SOCIAL_HANDLES : SOCIAL_HANDLES;
}

export interface InsiderHandle {
    name: string;
    handle: string;    // without @
    atHandle: string;  // with @
}

export function getPrimaryInsiderHandle(leagueType?: string, date?: string | null, seasonYear?: number | null, uiMode?: string | null): InsiderHandle {
    const key = getPrimaryInsiderKey(date, seasonYear) === 'woj' ? 'Woj' : 'Shams';
    const h = getSocialHandles(leagueType, uiMode)[key];
    return { name: h.name, handle: h.handle, atHandle: `@${h.handle}` };
}

export function getInsiderHandle(leagueType?: string, date?: string | null, seasonYear?: number | null, uiMode?: string | null): InsiderHandle {
    return getPrimaryInsiderHandle(leagueType, date, seasonYear, uiMode);
}

export function getDefaultFollowedHandles(leagueType?: string, date?: string | null, seasonYear?: number | null, uiMode?: string | null): string[] {
    const handles = getSocialHandles(leagueType, uiMode);
    return [
        handles.NBA.handle,
        getPrimaryInsiderHandle(leagueType, date, seasonYear, uiMode).handle,
        handles.StatMuse.handle,
    ];
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAllNames(content: string, from: string, to: string): string {
    if (!content || !from || from === to) return content;
    return content.replace(new RegExp(escapeRegExp(from), 'gi'), to);
}

export function coerceInsiderPostToEra<T extends { author?: string; handle?: string; content?: string }>(
    post: T,
    leagueType?: string,
    date?: string | null,
    seasonYear?: number | null,
    uiMode?: string | null,
): T {
    const primary = getPrimaryInsiderHandle(leagueType, date, seasonYear, uiMode);
    const postHandle = String(post.handle ?? '').replace(/^@/, '').toLowerCase();
    const author = String(post.author ?? '').toLowerCase();
    const candidates = [
        SOCIAL_HANDLES.Shams,
        SOCIAL_HANDLES.Woj,
        FICTIONAL_SOCIAL_HANDLES.Shams,
        FICTIONAL_SOCIAL_HANDLES.Woj,
        PBA_SOCIAL_HANDLES.Shams,
        PBA_SOCIAL_HANDLES.Woj,
    ];
    const matched = candidates.find(candidate =>
        postHandle === candidate.handle.toLowerCase()
        || author === candidate.name.toLowerCase(),
    );
    if (!matched) return post;

    let nextContent = String(post.content ?? '');
    for (const candidate of candidates) {
        nextContent = replaceAllNames(nextContent, `@${candidate.handle}`, primary.atHandle);
        nextContent = replaceAllNames(nextContent, candidate.name, primary.name);
    }
    if (uiMode === 'pba_isolated' || leagueType === 'fictional') {
        nextContent = nextContent
            .replace(/sources tell ESPN(?:\s+and\s+@Stadium)?\s*:\s*/gi, 'league sources confirm: ')
            .replace(/sources tell ESPN(?:\s+and\s+@Stadium)?\.?/gi, 'league sources confirm.')
            .replace(/according to ESPN/gi, 'according to league sources')
            .replace(/per ESPN/gi, 'per league sources')
            .replace(/@Stadium/gi, primary.atHandle);
    }
    return {
        ...post,
        author: primary.name,
        handle: primary.atHandle,
        content: nextContent,
    };
}
