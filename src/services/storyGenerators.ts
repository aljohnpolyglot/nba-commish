import { NBAPlayer, NBATeam, StaffData, DraftPick, Sender } from '../types';

export interface StoryContextResult {
    story: string;
    sender: Sender;
    playerPortraitUrl?: string;
    teamLogoUrl?: string;
}

export const selectRandom = <T>(array: T[], count: number): T[] => {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

// The URL for your hosted sponsor data
const SPONSOR_DATA_URL = 'https://api.npoint.io/f2a84eef9d7576067139';

// Type definitions to match our new JSON structure
interface Sponsor {
    name: string;
    contactName: string;
    contactTitle: string;
    proposals: string[];
}

interface Era {
    name: string;
    startYear: number;
    endYear: number;
    sponsors: Sponsor[];
}

interface SponsorData {
    eras: Era[];
}

// Simple cache to avoid fetching the data on every single story generation
let cachedSponsorData: SponsorData | null = null;

const getSponsorData = async (): Promise<SponsorData | null> => {
    if (cachedSponsorData) {
        return cachedSponsorData;
    }
    try {
        const response = await fetch(SPONSOR_DATA_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: SponsorData = await response.json();
        cachedSponsorData = data;
        return data;
    } catch (error) {
        console.error("Failed to fetch sponsor data:", error);
        return null;
    }
};

export const generateAgentAgitationStory = (players: NBAPlayer[], startYear: number): StoryContextResult | null => {
    const starPlayers = players.filter(p => p.overallRating > 85 && p.tid >= 0); // Active players only
    if(starPlayers.length === 0) return null;

    const player = selectRandom(starPlayers, 1)[0];
    const agentName = startYear >= 2010 ? "Rich Paul" : "David Falk";
    const agentOrg = startYear >= 2010 ? "Klutch Sports" : "FAME";
    const sender = { name: agentName, title: "Player Agent", organization: agentOrg };
    
    return { story: `A prominent player agent is making noise. They represent superstar ${player.name} and are publicly/privately complaining about their client's situation. They may be demanding a trade, expressing frustration with officiating, or floating concerns about their contract status.`, sender, playerPortraitUrl: player.imgURL };
};

export const generateFallbackStory = (teams: NBATeam[], staff: StaffData | null, startYear: number): StoryContextResult => {
    const randomTeam = selectRandom(teams, 1)[0];
    const fallbackTeam = randomTeam || { name: 'a team', logoUrl: undefined };
    let fallbackGMName = `GM of the ${fallbackTeam.name}`;
    if (startYear >= 2025 && staff && staff.gms.length > 0) {
       const gm = staff.gms.find(g => g.team === fallbackTeam.name);
       if(gm) fallbackGMName = gm.name;
    } else if (startYear < 2025) {
        fallbackGMName = 'a General Manager';
    }
    
    return { 
        story: `General league business. The GM is proposing a minor rule change, or an owner has a new marketing idea that needs your approval.`,
        sender: { name: fallbackGMName, title: 'General Manager', organization: fallbackTeam.name },
        teamLogoUrl: fallbackTeam.logoUrl
    };
};

export const generateGmConcernStory = (teams: NBATeam[], players: NBAPlayer[], staff: StaffData | null, allPicks: DraftPick[], startYear: number): StoryContextResult | null => {
    const team = selectRandom(teams, 1)[0];
    if (!team) return null;
    
    let gmName = `GM of the ${team.name}`;
    if (startYear >= 2025 && staff) {
        const foundGm = staff.gms.find(g => g.team === team.name);
        if (foundGm) gmName = foundGm.name;
    } else if (startYear < 2025) {
        // Let the AI generate a plausible historical name. This is a placeholder.
        gmName = `the General Manager`;
    }

    const sender = { name: gmName, title: "General Manager", organization: team.name };

    const teamPlayers = players.filter(p => p.tid === team.id);
    const starPlayer = selectRandom(teamPlayers.filter(p => p.overallRating > 80), 1)[0];
    const teamPicks = allPicks.filter(p => p.tid === team.id);

    if (team.strength < 75 && teamPicks.length > 5 && starPlayer) {
        return { story: `The GM of the struggling ${team.name}, is considering a full rebuild. Their star player, ${starPlayer.name}, is valuable, but they have a good collection of draft picks. The concern might be about gauging the trade market for their star to acquire even more future assets.`, sender, teamLogoUrl: team.logoUrl, playerPortraitUrl: starPlayer.imgURL };
    }

    if (starPlayer) {
         if (starPlayer.injury.type !== 'Healthy') {
             return { story: `The GM of the ${team.name} is contacting you. Their star player, ${starPlayer.name}, is currently injured with a ${starPlayer.injury.type}, and there's pressure from the media and fans about the team's prospects. The concern should be about managing these expectations or league injury reporting rules.`, sender, teamLogoUrl: team.logoUrl, playerPortraitUrl: starPlayer.imgURL };
         }
         return { story: `The GM of the ${team.name} has a concern. Their star player, ${starPlayer.name}, is key to their success, and the GM might be proposing a trade to build around them, or raising a concern about a recent on-court incident involving them.`, sender, teamLogoUrl: team.logoUrl, playerPortraitUrl: starPlayer.imgURL };
    }

    return null; // Don't generate a generic GM story, let fallback handle it
};

export const generateMediaInquiryStory = (startYear: number): StoryContextResult | null => {
    const MEDIA_OUTLETS = [
        { name: "ESPN", topics: ["negotiating future broadcast rights", "a recent controversial comment from an on-air personality", "exclusive access for a '30 for 30' documentary"] },
        { name: "Turner Sports (TNT)", topics: ["renewing the 'Inside the NBA' talent contracts", "a proposal for a new in-season tournament broadcast package", "cross-promotional opportunities with their other media properties"] },
        { name: "The Athletic", topics: ["a request for an in-depth, off-the-record interview about your vision for the league", "concerns about media credential access post-game", "a partnership for a series of articles on league operations"] },
    ];

    if (startYear < 2010) {
         const sender = { name: "Journalist", title: "Senior Writer", organization: "a Major Newspaper" };
         return { story: `A prominent sports journalist from a major national newspaper wants to write a feature piece on the state of the league and your commissionership. They are requesting a one-on-one interview.`, sender };
    }

    const outlet = selectRandom(MEDIA_OUTLETS, 1)[0];
    if (!outlet) return null;
    
    const topic = selectRandom(outlet.topics, 1)[0];
    if (!topic) return null;

    const sender = { name: "Broadcast Executive", title: "SVP of Programming", organization: outlet.name };
    return { story: `A major media partner is reaching out. An executive from ${outlet.name} wants to schedule a meeting with you to discuss ${topic}. This could have significant implications for league revenue and public image.`, sender };
};

export const generateOwnerDemandStory = (teams: NBATeam[], staff: StaffData | null, allPicks: DraftPick[], startYear: number): StoryContextResult | null => {
    const team = selectRandom(teams, 1)[0];
    if (!team) return null;
    
    let ownerName = `Owner of the ${team.name}`;
    if (startYear >= 2025 && staff) {
        const foundOwner = staff.owners.find(o => o.team === team.name);
        if (foundOwner) ownerName = foundOwner.name;
    } else if (startYear < 2025) {
        // Let the AI generate a plausible historical name. This is a placeholder.
        ownerName = `the Owner`;
    }
    
    const sender = { name: ownerName, title: "Team Owner", organization: team.name };
    const teamPicks = allPicks.filter(p => p.tid === team.id && p.round === 1);

    if (team.strength > 63 && teamPicks.length >= 2) {
         return { story: `The owner of the contending ${team.name}, feels they are 'one piece away'. They are demanding that the GM trade their future first-round draft picks to acquire another star player for a championship run.`, sender, teamLogoUrl: team.logoUrl };
    }
     if (team.strength < 60) {
        return { story: `The ${team.name} are struggling this season. Their owner is frustrated with the team's performance and is proposing a change to the draft lottery system to help rebuilding teams.`, sender, teamLogoUrl: team.logoUrl };
    }

    return null; // Let other generators or the fallback handle generic cases.
};

export const generatePlayerAppealStory = (players: NBAPlayer[]): StoryContextResult | null => {
    const mvpCandidates = players.filter(p => p.overallRating > 90 && p.tid >= 0);
    if(mvpCandidates.length === 0) return null;

    const player = selectRandom(mvpCandidates, 1)[0];
    const sender = { name: player.name, title: "Player", organization: "NBPA" };
    
    return { story: `A superstar player is contacting your office directly, bypassing the NBPA. ${player.name} has a personal concern about a league policy, the demanding travel schedule, or player wellness initiatives he'd like to see implemented.`, sender, playerPortraitUrl: player.imgURL };
};

export const generatePlayerDisciplineStory = (players: NBAPlayer[], teams: NBATeam[]): StoryContextResult | null => {
    const extremeScenarios = [
        "was seen flashing a firearm on a social media live stream, raising concerns about their judgment and the league's image.",
        "is facing allegations of domestic violence, leading to a police investigation and intense media scrutiny.",
        "was involved in a late-night altercation at a nightclub, resulting in a viral video and negative press.",
        "has been linked to an illegal sports betting operation, calling into question the integrity of the game.",
        "was arrested for driving under the influence after a high-profile team event."
    ];

    const standardScenarios = [
        "was caught using a burner account on social media to argue with fans and criticize their own teammates.",
        "got into a heated, public shouting match with their head coach during a timeout that went viral.",
        "made a series of controversial and offensive statements about the league's officiating on a popular podcast.",
        "publicly demanded a trade during a post-game press conference, completely blindsiding the front office.",
        "was fined for kicking a chair into the stands after a frustrating loss, narrowly missing a fan.",
        "skipped a mandatory team practice to attend a high-profile fashion show, infuriating the front office.",
        "was involved in a minor scuffle at a club late before a game, resulting in a viral video but no arrests.",
        "refused to enter the game in the 4th quarter, leading to a massive internal team suspension.",
        "leaked sensitive locker room conversations to a prominent media member, destroying team chemistry."
    ];

    const familyMen = [
        "Nikola Jokic", "Stephen Curry", "LeBron James", "Giannis Antetokounmpo", 
        "Jayson Tatum", "Jrue Holiday", "Mike Conley", "Al Horford", 
        "Klay Thompson", "DeMar DeRozan", "Damian Lillard", "Luka Doncic",
        "Shai Gilgeous-Alexander", "Tyrese Haliburton", "Jalen Brunson"
    ];

    const highProfilePlayers = players.filter(p => p.overallRating >= 75 && p.tid >= 0);
    if (highProfilePlayers.length === 0) return null;

    const player = selectRandom(highProfilePlayers, 1)[0];
    const isFamilyMan = familyMen.includes(player.name);
    
    // If they are a known family man, they only get standard scenarios. Otherwise, they can get either.
    const eligibleScenarios = isFamilyMan ? standardScenarios : [...standardScenarios, ...extremeScenarios];
    const scenario = selectRandom(eligibleScenarios, 1)[0];
    const playerTeam = teams.find(t => t.id === player.tid);

    const sender: Sender = { 
        name: "Joe Dumars", 
        title: "Executive VP, Head of Basketball Operations", 
        organization: "NBA League Office" 
    };
    
    const story = `A major off-court incident has occurred. ${player.name} of the ${playerTeam?.name || 'Unknown Team'} ${scenario}`;
    
    return { story, sender, playerPortraitUrl: player.imgURL, teamLogoUrl: playerTeam?.logoUrl };
};

// The main generator function is now async and much cleaner
export const generateSponsorProposalStory = async (startYear: number): Promise<StoryContextResult | null> => {
    const sponsorData = await getSponsorData();
    if (!sponsorData || sponsorData.eras.length === 0) {
        return null; // Return null if data fetching fails
    }

    // Find the correct era based on the game's start year
    const currentEra = sponsorData.eras.find(era => startYear >= era.startYear && startYear <= era.endYear);

    // If no specific era matches, fallback to the first one (e.g., Modern Era)
    const eraToUse = currentEra || sponsorData.eras[0];
    
    if (!eraToUse || eraToUse.sponsors.length === 0) {
        return null; // No sponsors for this era
    }

    // Select a random sponsor and proposal from the chosen era
    const sponsor = selectRandom(eraToUse.sponsors, 1)[0];
    const proposal = selectRandom(sponsor.proposals, 1)[0];

    // The sender's name now comes from the JSON, making it more specific
    const sender: Sender = { 
        name: sponsor.contactName, 
        title: sponsor.contactTitle, 
        organization: sponsor.name 
    };
    
    const story = `A major corporate sponsor, ${sponsor.name}, has sent a business proposal. They are interested in pitching ${proposal}. This is a big business opportunity that could impact league revenue.`;
    
    return { story, sender };
};
