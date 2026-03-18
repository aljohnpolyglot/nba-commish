import { GameState, HistoricalStatPoint, NBAPlayer as Player, DraftPick } from '../../types';
import { generateInitialContent } from '../../services/llm/llm';
import { getRosterData } from '../../services/rosterService';
import { getStaffData } from '../../services/staffService';
import { generateSchedule } from '../../services/gameScheduler';
import { INITIAL_LEAGUE_STATS, START_DATE_STR } from '../../constants';
import { fetchEuroleagueRoster, fetchWNBARoster, fetchPBARoster } from '../../services/externalRosterService';

import { calculateSocialEngagement } from '../../utils/helpers';

export const handleStartGame = async (payload: { name: string, startScenario: 'schedule_maker' | 'training_camp' | 'regular_season' }): Promise<Partial<GameState>> => {
    const { name: commissionerName, startScenario } = payload;
    const { teams, players: rawNbaPlayers, draftPicks, teamNameMap } = await getRosterData(2025, 'Opening Week');
    
    // Fetch external rosters
    const { players: euroPlayers, teams: euroTeams } = await fetchEuroleagueRoster();
    const { players: wnbaPlayers, teams: wnbaTeams } = await fetchWNBARoster();
    const { players: pbaPlayers, teams: pbaTeams } = await fetchPBARoster();

    // Create sets of names for efficient lookup
    const externalNames = new Set([
        ...euroPlayers.map(p => p.name.toLowerCase()),
        ...wnbaPlayers.map(p => p.name.toLowerCase()),
        ...pbaPlayers.map(p => p.name.toLowerCase())
    ]);

    // Filter nbaPlayers to remove anyone who is clearly in another league
    // or tagged as such in the source data
    const nbaPlayers = rawNbaPlayers.filter(p => {
        const nameLower = p.name.toLowerCase();
        if (externalNames.has(nameLower)) return false;
        if (p.status === 'WNBA' || p.status === 'Euroleague' || p.status === 'PBA') return false;
        return true;
    });

    // Merge players, avoiding duplicates for Euroleague players
    const existingNbaNames = new Set(nbaPlayers.map(p => p.name.toLowerCase()));
    
    // Filter out Euro players that already exist in NBA (unlikely but safe)
    // Also ensure they have correct status
    const uniqueEuroPlayers = euroPlayers.filter(p => !existingNbaNames.has(p.name.toLowerCase())).map(p => ({
        ...p,
        status: p.status || 'Euroleague'
    }));

    const uniquePBAPlayers = pbaPlayers.filter(p => !existingNbaNames.has(p.name.toLowerCase())).map(p => ({
        ...p,
        status: p.status || 'PBA'
    }));
    
    // Combine all players
    // Note: WNBA players have tid -100, Euro are -1 (Free Agents)
    const players = [...nbaPlayers, ...uniqueEuroPlayers, ...uniquePBAPlayers, ...wnbaPlayers];

    if (players.some(p => p.name.toLowerCase() === 'devin booker')) {
        console.log("🏀 DEV1N B00K3R 1S L0AD3D! 🏀");
    }

    const staff = await getStaffData(players, teamNameMap);
    const isTrainingCamp = startScenario === 'training_camp';
    const isScheduleMaker = startScenario === 'schedule_maker';
    const schedule = (isTrainingCamp || isScheduleMaker) ? [] : generateSchedule(teams);
    
    let startDateFormatted = 'Oct 24, 2025';
    if (isTrainingCamp) {
        startDateFormatted = new Date(START_DATE_STR).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (isScheduleMaker) {
        startDateFormatted = new Date('2025-08-12T00:00:00.000Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Generate Initial Content via AI
    let initialContent: any = { newEmails: [], newNews: [], newSocialPosts: [] };
    if (!(payload as any).skipLLM) {
        initialContent = await generateInitialContent(startDateFormatted, commissionerName, players, teams, staff);
    } else {
        // Provide generic default content
        initialContent = {
            newEmails: [{
                sender: 'League Office',
                senderRole: 'Operations',
                subject: 'Welcome to the NBA',
                body: `Commissioner ${commissionerName}, welcome to your new office. The league is ready for your leadership. Rosters have been finalized and the season is underway.`,
                playerPortraitUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/logoman.png'
            }],
            newNews: [{
                headline: 'New Commissioner Takes Office',
                content: `${commissionerName} has officially been sworn in as the new NBA Commissioner. Expectations are high as the league enters a new era.`,
                type: 'league'
            }],
            newSocialPosts: [{
                author: 'NBA',
                handle: 'nba',
                content: `Welcome to the new era of the NBA. Commissioner ${commissionerName} is officially on the job! 🏀`,
                source: 'TwitterX'
            }]
        };
    }
    
    const initialInbox = (initialContent.newEmails || []).map((e: any, i: number) => {
        let teamLogoUrl = e.teamLogoUrl;
        if (!teamLogoUrl) {
            const team = teams.find(t => 
                (e.sender && e.sender.toLowerCase().includes(t.name.toLowerCase())) || 
                (e.senderRole && e.senderRole.toLowerCase().includes(t.name.toLowerCase())) ||
                (e.organization && e.organization.toLowerCase().includes(t.name.toLowerCase()))
            );
            if (team) teamLogoUrl = team.logoUrl;
        }
        return {
            ...e,
            id: `init-email-${i}`,
            read: false,
            replied: false,
            date: startDateFormatted,
            teamLogoUrl
        };
    });

    // Override first email for Training Camp scenario
    if (isTrainingCamp && initialInbox.length > 0) {
        initialInbox[0] = {
            ...initialInbox[0],
            sender: 'League Office',
            senderRole: 'Operations',
            subject: 'Welcome to Training Camp',
            body: 'Commissioner, welcome to your first day. Training camps are opening across the league. Teams are finalizing rosters and preparing for the preseason. It\'s a fresh start for everyone.',
            playerPortraitUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/logoman.png',
        };
    } else if (isScheduleMaker && initialInbox.length > 0) {
        initialInbox[0] = {
            ...initialInbox[0],
            sender: 'League Office',
            senderRole: 'Operations',
            subject: 'Schedule Generation Approaching',
            body: 'Commissioner, the league schedule will be generated on August 14. You have until then to set the Christmas Day matchups and any Global Games.',
            playerPortraitUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/logoman.png',
        };
    }

    const initialNews = (initialContent.newNews || []).map((n: any, i: number) => ({
        ...n,
        id: `init-news-${i}`,
        date: startDateFormatted,
        isNew: true
    }));

    // Override first news for Training Camp scenario
    if (isTrainingCamp && initialNews.length > 0) {
        initialNews[0] = {
            ...initialNews[0],
            headline: 'Training Camps Open: Season Begins',
            content: 'The NBA season officially kicks off today as training camps open nationwide. Optimism is high, but questions remain about the new commissioner\'s leadership style.',
        };
    } else if (isScheduleMaker && initialNews.length > 0) {
        initialNews[0] = {
            ...initialNews[0],
            headline: 'League Awaits Schedule Release',
            content: 'With the schedule release set for August 14, fans and teams are eagerly anticipating the announcement of Christmas Day and Global Games.',
        };
    }

    const initialSocial = (initialContent.newSocialPosts || []).map((s: any, i: number) => {
        const engagement = calculateSocialEngagement(s.handle, s.content);
        return {
            ...s,
            id: `init-social-${i}`,
            date: startDateFormatted,
            likes: engagement.likes,
            retweets: engagement.retweets,
        };
    });

    const initialHistoricalPoint: HistoricalStatPoint = {
        date: startDateFormatted,
        publicApproval: 48,
        ownerApproval: 55,
        playerApproval: 45,
        legacy: 0,
        revenue: INITIAL_LEAGUE_STATS.revenue,
        viewership: INITIAL_LEAGUE_STATS.viewership,
    };

    console.log("=== ROSTER INITIALIZATION DEBUG ===");
    console.log(`NBA: ${nbaPlayers.length} players, ${teams.length} teams`);
    console.log(`WNBA: ${wnbaPlayers.length} players, ${wnbaTeams.length} teams`);
    console.log(`Euroleague: ${euroPlayers.length} players, ${euroTeams.length} teams`);
    console.log(`PBA: ${pbaPlayers.length} players, ${pbaTeams.length} teams`);
    console.log(`Total Players: ${players.length}`);
    console.log(`Total Non-NBA Teams: ${euroTeams.length + pbaTeams.length + wnbaTeams.length}`);
    console.log("====================================");

    // All-Star Initialization
    const { getAllStarWeekendDates } = await import('../../services/allStar/AllStarWeekendOrchestrator');
    const { AllStarSelectionService } = await import('../../services/allStar/AllStarSelectionService');
    const dates = getAllStarWeekendDates(2026);
    const startDateObj = new Date(startDateFormatted);
    
    let initialAllStar = null;
    if (startDateObj >= dates.votingStart) {
        // If we start after voting began, simulate some initial votes
        const votingDays = Math.ceil((startDateObj.getTime() - dates.votingStart.getTime()) / (1000 * 60 * 60 * 24));
        const initialVotes = AllStarSelectionService.simulateVotingPeriod(
            players,
            teams,
            2026,
            startDateObj >= dates.votingEnd ? dates.votingEnd : startDateObj,
            [],
            Math.min(votingDays, 30) // Cap at 30 days of simulated votes
        );
        
        initialAllStar = {
            season: 2026,
            startersAnnounced: startDateObj >= dates.startersAnnounced,
            reservesAnnounced: startDateObj >= dates.reservesAnnounced,
            roster: [],
            weekendComplete: startDateObj >= dates.allStarGame,
            votes: initialVotes
        };

        if (initialAllStar.startersAnnounced) {
            initialAllStar.roster = AllStarSelectionService.selectStarters(initialVotes);
        }
        if (initialAllStar.reservesAnnounced) {
            const reserves = AllStarSelectionService.selectReserves(players, teams, 2026, initialAllStar.roster);
            initialAllStar.roster = [...initialAllStar.roster, ...reserves];
        }
    }

    return {
        commissionerName,
        teams,
        nonNBATeams: [...euroTeams, ...pbaTeams, ...wnbaTeams],
        players,
        draftPicks,
        staff,
        schedule,
        inbox: initialInbox,
        news: initialNews,
        socialFeed: initialSocial,
        historicalStats: [initialHistoricalPoint],
        followedHandles: ['nba', 'wojespn', 'shamscharania', 'statmuse'],
        history: [`${commissionerName} took office as the new NBA Commissioner.`],
        isDataLoaded: true,
        isProcessing: false,
        date: startDateFormatted, // Explicitly set the date in state
        day: 1,
        saveId: undefined,
        allStar: initialAllStar
    };
};
