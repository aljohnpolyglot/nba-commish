import { NBAPlayer as Player, SocialPost, NBATeam as Team, DraftPick, GamePhase } from '../../types';
import { selectRandom, calculateSocialEngagement } from '../../utils/helpers';
import { generateTradeOffer, isTradeAllowed } from '../tradeService';
import { AGE_BRACKETS } from '../../constants';

// --- Configuration & Constants ---
export const EVENT_TEMPLATES_URL = "https://api.npoint.io/61f75d50772ae741b1f6";
const INJURY_REPORT_TEMPLATES_URL = "https://api.npoint.io/24b58be71f070d8a00d7";

// --- Type Definitions for Templates ---
type EventType = 'win_streak' | 'lose_streak' | 'win_milestone' | 'playoff_elimination' | 'playoff_advance' | 'upset_win' | 'rivalry_matchup';

interface TemplateAuthor {
    name: string;
    handle: string;
}

interface EventTemplate {
    id: string;
    eventType: EventType;
    authors: TemplateAuthor[];
    conditions?: {
        streakCount?: number[];
        winCount?: number[];
        strengthDifference?: number;
        minTeamStrength?: number;
    };
    templates: string[];
}

// --- Caching and Data Fetching ---
let cachedTemplates: EventTemplate[] | null = null;
let cachedInjuryTemplates: any[] | null = null;

const getEventTemplates = async (): Promise<EventTemplate[]> => {
    if (cachedTemplates) {
        return cachedTemplates;
    }
    try {
        console.log("Fetching event templates for the first time...");
        const response = await fetch(EVENT_TEMPLATES_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data: EventTemplate[] = await response.json();
        cachedTemplates = data;
        return data;
    } catch (error) {
        console.error("Failed to fetch event templates:", error);
        return []; // Return an empty array on failure
    }
};

const getInjuryReportTemplates = async () => {
    if (cachedInjuryTemplates) return cachedInjuryTemplates;
    try {
        const response = await fetch(INJURY_REPORT_TEMPLATES_URL);
        cachedInjuryTemplates = await response.json() as any[];
        return cachedInjuryTemplates;
    } catch (e) {
        console.error("Failed to fetch injury report templates");
        return [];
    }
};

// --- Generic Post Generation Logic ---
const generatePostFromTemplate = async (
    eventType: EventType,
    substitutions: Record<string, string>,
    filterFn?: (template: EventTemplate) => boolean,
    logoUrl?: string
): Promise<SocialPost | null> => {
    const allTemplates = await getEventTemplates();
    if (allTemplates.length === 0) return null;

    let suitableTemplates = allTemplates.filter(t => t.eventType === eventType);
    if (filterFn) {
        suitableTemplates = suitableTemplates.filter(filterFn);
    }

    if (suitableTemplates.length === 0) return null;

    const selectedTemplate = selectRandom(suitableTemplates, 1)[0];
    const author = selectRandom(selectedTemplate.authors, 1)[0];
    let content = selectRandom(selectedTemplate.templates, 1)[0];

    for (const key in substitutions) {
        content = content.replace(new RegExp(key, 'g'), substitutions[key]);
    }
    
    const engagement = calculateSocialEngagement(author.handle, content);
    
    return {
        id: self.crypto.randomUUID(),
        source: 'TwitterX',
        author: author.name,
        handle: author.handle,
        content: content,
        date: new Date().toISOString(),
        likes: engagement.likes,
        retweets: engagement.retweets,
        teamLogoUrl: logoUrl,
    };
};

// --- Specific Event Generators ---

export const generatePlayoffEliminationPost = async (winningTeam: Team, losingTeam: Team, seriesScore: string): Promise<SocialPost | null> => {
    const eventType = Math.random() > 0.5 ? 'playoff_elimination' : 'playoff_advance';
    const substitutions = {
        "{winningTeamName}": winningTeam.name,
        "{losingTeamName}": losingTeam.name,
        "{seriesScore}": seriesScore,
    };
    return generatePostFromTemplate(eventType, substitutions, undefined, winningTeam.logoUrl);
};

export const generateMilestonePost = async (team: Team): Promise<SocialPost | null> => {
    const substitutions = { "{teamName}": team.name, "{winCount}": String(team.wins) };
    const filterFn = (t: EventTemplate) => t.conditions?.winCount?.includes(team.wins) ?? false;
    return generatePostFromTemplate('win_milestone', substitutions, filterFn, team.logoUrl);
};

export const generateStreakPost = async (team: Team): Promise<SocialPost | null> => {
    if (!team.streak) return null;
    const eventType = team.streak.type === 'W' ? 'win_streak' : 'lose_streak';
    const substitutions = { "{teamName}": team.name, "{streakCount}": String(team.streak.count) };
    const filterFn = (t: EventTemplate) => t.conditions?.streakCount?.includes(team.streak.count) ?? false;
    return generatePostFromTemplate(eventType, substitutions, filterFn, team.logoUrl);
};

export const generateUpsetPost = async (winningTeam: Team, losingTeam: Team): Promise<SocialPost | null> => {
    const strengthDifference = losingTeam.strength - winningTeam.strength;
    const substitutions = {
        "{winningTeamName}": winningTeam.name,
        "{losingTeamName}": losingTeam.name,
        "{winningTeamRecord}": `${winningTeam.wins}-${winningTeam.losses}`,
        "{losingTeamRecord}": `${losingTeam.wins}-${losingTeam.losses}`,
    };
    const filterFn = (t: EventTemplate) => t.conditions?.strengthDifference ? strengthDifference >= t.conditions.strengthDifference : false;
    return generatePostFromTemplate('upset_win', substitutions, filterFn, winningTeam.logoUrl);
};

export const generateRivalryPost = async (teamA: Team, teamB: Team): Promise<SocialPost | null> => {
    const substitutions = {
        "{teamAName}": teamA.name,
        "{teamBName}": teamB.name,
        "{teamARecord}": `${teamA.wins}-${teamA.losses}`,
        "{teamBRecord}": `${teamB.wins}-${teamB.losses}`,
    };
    const filterFn = (t: EventTemplate) => t.conditions?.minTeamStrength ? (teamA.strength >= t.conditions.minTeamStrength && teamB.strength >= t.conditions.minTeamStrength) : false;
    return generatePostFromTemplate('rivalry_matchup', substitutions, filterFn, teamA.logoUrl);
};

export const generatePlayerMilestonePost = async (player: Player): Promise<SocialPost | null> => {
    return null; // Placeholder for future implementation
};


export const generateInjuryPost = async (player: Player, team: Team, gamePhase: GamePhase): Promise<SocialPost | null> => {
    const templates = await getInjuryReportTemplates();
    if (!templates || templates.length === 0) return null;

    interface InjuryTemplateGroup {
        id: string;
        authors: { name: string; handle: string; }[];
        templates: string[];
    }

    let templateGroup: InjuryTemplateGroup | undefined;
    
    const isStarPlayer = (player?.overallRating || 0) > 80;
    const age = (player.born?.year ? new Date().getFullYear() - player.born.year : 25); 

    const isPlayoffs = gamePhase.includes('Playoffs') || gamePhase === 'NBA Finals' || gamePhase === 'Conference Finals' || gamePhase === 'Play-In Tournament';

    if (player.injury.gamesRemaining > 50) {
        if (isStarPlayer) {
            templateGroup = templates.find((t): t is InjuryTemplateGroup => t.id === 'star_season_ending');
        } else if (age >= AGE_BRACKETS.VETERAN_PLAYER) {
            templateGroup = templates.find((t): t is InjuryTemplateGroup => t.id === 'veteran_season_ending');
        } else {
            templateGroup = templates.find((t): t is InjuryTemplateGroup => t.id === 'regular_season_ending');
        }
    } else if (player.injury.gamesRemaining > 20) {
        templateGroup = templates.find((t): t is InjuryTemplateGroup => t.id === (isPlayoffs ? 'playoff_long_term' : 'long_term_surgery'));
    } else if (player.injury.gamesRemaining > 10) {
        templateGroup = templates.find((t): t is InjuryTemplateGroup => t.id === (age <= AGE_BRACKETS.YOUNG_PLAYER ? 'young_player_development_injury' : 'significant_time'));
    } else if (player.injury.gamesRemaining > 5) {
        templateGroup = templates.find((t): t is InjuryTemplateGroup => t.id === (isPlayoffs ? 'playoff_short_term' : 'multi_game_absence'));
    } else if (player.injury.gamesRemaining > 2) {
        templateGroup = templates.find((t): t is InjuryTemplateGroup => t.id === 'short_term_absence');
    } else {
        templateGroup = templates.find((t): t is InjuryTemplateGroup => t.id === 'day_to_day');
    }

    if (player.injury.gamesRemaining > 15 && Math.random() < 0.3) {
        const narrativeGroup = templates.find((t): t is InjuryTemplateGroup => t.id === (isStarPlayer ? 'star_narrative_injury' : 'narrative_injury'));
        if (narrativeGroup) templateGroup = narrativeGroup;
    }

    if (!templateGroup) {
        return null;
    }

    const author = selectRandom(templateGroup.authors, 1)[0];
    let content = selectRandom(templateGroup.templates, 1)[0];

    content = content.replace(/{playerName}/g, player.name)
                     .replace(/{games}/g, String(Math.round(player.injury.gamesRemaining)))
                     .replace(/{injuryName}/g, player.injury.type)
                     .replace(/{teamName}/g, team.name);

    const engagement = calculateSocialEngagement(author.handle, content, player?.overallRating);

    return {
        id: self.crypto.randomUUID(),
        source: 'TwitterX',
        author: author.name,
        handle: author.handle,
        content: content,
        date: new Date().toISOString(),
        likes: engagement.likes,
        retweets: engagement.retweets,
        isNew: true,
    };
};

export const generatePlayerFeats = (players: Player[], dateString: string): SocialPost[] => {
    const posts: SocialPost[] = [];
    
    const activePlayers = players.filter(p => p.tid >= 0 && p.status === 'Active');
    const uniquePlayers = Array.from(new Map(activePlayers.map(p => [p.internalId, p])).values());
    if (uniquePlayers.length === 0) return posts;

    const shuffled = uniquePlayers.sort(() => 0.5 - Math.random()).slice(0, 2);

    shuffled.forEach(player => {
        if (!player.ratings || player.ratings.length === 0) return;
        const latestRating = player.ratings[player.ratings.length - 1];
        let content = "";
        let handle = "@NBAInsider";
        let author = "NBA Insider";

        if (latestRating.tp > 70 && Math.random() > 0.6) {
            const threes = Math.floor(Math.random() * 5) + 8;
            content = `Unbelievable! ${player.name} just hit ${threes} threes tonight! 🔥🔥🔥`;
            handle = "@HoopsCentral";
            author = "Hoops Central";
        } else if (latestRating.dnk > 70 && Math.random() > 0.6) {
            content = `Did you see that poster by ${player.name}?! Dunk of the year! 😱`;
            handle = "@DunkHighlights";
            author = "Dunk Highlights";
        } else if (latestRating.drb > 70 && Math.random() > 0.6) {
            content = `${player.name} just crossed his defender into another dimension! 🥶`;
            handle = "@AnkleBreakers";
            author = "Ankle Breakers";
        } else if (latestRating.pss > 70 && Math.random() > 0.6) {
            const assists = Math.floor(Math.random() * 5) + 15;
            content = `Point God mode activated. ${player.name} with ${assists} assists tonight! 🎯`;
            handle = "@PlaymakerHub";
            author = "Playmaker Hub";
        } else if (latestRating.blk > 70 && Math.random() > 0.6) {
            const blocks = Math.floor(Math.random() * 4) + 6;
            content = `Block party! ${player.name} sent back ${blocks} shots tonight. NO FLY ZONE 🚫✈️`;
            handle = "@DefensiveStops";
            author = "Defensive Stops";
        } else if (latestRating.stl > 70 && Math.random() > 0.6) {
            const steals = Math.floor(Math.random() * 3) + 5;
            content = `${player.name} is a menace on defense! ${steals} steals and counting. 🥷`;
            handle = "@TheGlove";
            author = "The Glove";
        } else {
            const pts = Math.floor(Math.random() * 15) + 35;
            content = `${player.name} drops a quiet ${pts}-piece tonight. He's built different. 😤`;
            handle = "@StatMuse";
            author = "StatMuse";
        }

        const engagement = calculateSocialEngagement(handle, content, player?.overallRating);

        posts.push({
            id: crypto.randomUUID(),
            author,
            handle,
            content,
            date: dateString,
            likes: engagement.likes,
            retweets: engagement.retweets,
            source: 'TwitterX',
            playerPortraitUrl: player.imgURL,
        });
    });

    return posts;
};

export const eventGeneratorService = {
    generatePlayoffEliminationPost,
    generateMilestonePost,
    generateStreakPost,
    generateUpsetPost,
    generateRivalryPost,
    generatePlayerMilestonePost,
    generateInjuryPost,
    generatePlayerFeats
};
