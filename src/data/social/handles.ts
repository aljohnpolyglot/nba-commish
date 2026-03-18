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
