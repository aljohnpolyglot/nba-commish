import { GameState, HistoricalStatPoint, NBAPlayer as Player, DraftPick, LazySimProgress } from '../../types';
import { generateInitialContent } from '../../services/llm/llm';
import { getRosterData } from '../../services/rosterService';
import { getStaffData } from '../../services/staffService';
import { generateSchedule } from '../../services/gameScheduler';
import { INITIAL_LEAGUE_STATS } from '../../constants';
import { fetchEuroleagueRoster, fetchWNBARoster, fetchPBARoster } from '../../services/externalRosterService';

import { calculateSocialEngagement } from '../../utils/helpers';

interface StartGamePayload {
    name: string;
    startScenario?: string;
    skipLLM?: boolean;
    startDate?: string;
    jumpRequired?: boolean;
    onProgress?: (progress: LazySimProgress) => void;
}

export const handleStartGame = async (payload: StartGamePayload): Promise<Partial<GameState>> => {
    const { name: commissionerName } = payload;
    const { teams, players: rawNbaPlayers, draftPicks, teamNameMap } = await getRosterData(2025, 'Opening Week');

    // Fetch external rosters
    const { players: euroPlayers, teams: euroTeams } = await fetchEuroleagueRoster();
    const { players: wnbaPlayers, teams: wnbaTeams } = await fetchWNBARoster();
    const { players: pbaPlayers, teams: pbaTeams } = await fetchPBARoster();

    const externalNames = new Set([
        ...euroPlayers.map(p => p.name.toLowerCase()),
        ...wnbaPlayers.map(p => p.name.toLowerCase()),
        ...pbaPlayers.map(p => p.name.toLowerCase())
    ]);

    const nbaPlayers = rawNbaPlayers.filter(p => {
        const nameLower = p.name.toLowerCase();
        if (externalNames.has(nameLower)) return false;
        if (p.status === 'WNBA' || p.status === 'Euroleague' || p.status === 'PBA') return false;
        return true;
    });

    const existingNbaNames = new Set(nbaPlayers.map(p => p.name.toLowerCase()));

    const uniqueEuroPlayers = euroPlayers.filter(p => !existingNbaNames.has(p.name.toLowerCase())).map(p => ({
        ...p,
        status: p.status || 'Euroleague'
    }));

    const uniquePBAPlayers = pbaPlayers.filter(p => !existingNbaNames.has(p.name.toLowerCase())).map(p => ({
        ...p,
        status: p.status || 'PBA'
    }));

    const players = [...nbaPlayers, ...uniqueEuroPlayers, ...uniquePBAPlayers, ...wnbaPlayers];

    if (players.some(p => p.name.toLowerCase() === 'devin booker')) {
        console.log("🏀 DEV1N B00K3R 1S L0AD3D! 🏀");
    }

    const staff = await getStaffData(players, teamNameMap);

    // Always generate the full schedule; always start from Aug 12
    const schedule = generateSchedule(teams);
    const startDateFormatted = new Date('2025-08-12T00:00:00.000Z').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });

    // Generate Initial Content via AI (based on Aug 12 — the simulation start point)
    let initialContent: any = { newEmails: [], newNews: [], newSocialPosts: [] };
    if (!payload.skipLLM) {
        initialContent = await generateInitialContent(startDateFormatted, commissionerName, players, teams, staff);
    } else {
        initialContent = {
            newEmails: [{
                sender: 'League Office',
                senderRole: 'Operations',
                subject: 'Schedule Generation Approaching',
                body: `Commissioner ${commissionerName}, the league schedule will be generated on August 14. You have until then to set the Christmas Day matchups and any Global Games.`,
                playerPortraitUrl: 'https://cdn.nba.com/headshots/nba/latest/1040x760/logoman.png'
            }],
            newNews: [{
                headline: 'League Awaits Schedule Release',
                content: `With the schedule release set for August 14, fans and teams are eagerly anticipating the announcement of Christmas Day and Global Games. Commissioner ${commissionerName} has officially taken office.`,
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

    const initialNews = (initialContent.newNews || []).map((n: any, i: number) => ({
        ...n,
        id: `init-news-${i}`,
        date: startDateFormatted,
        isNew: true
    }));

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
    console.log("====================================");

    // All-Star Initialization (none needed at Aug 12 — voting hasn't started)
    const initialAllStar = null;

    const statePatch: Partial<GameState> = {
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
        date: startDateFormatted,
        day: 1,
        saveId: undefined,
        allStar: initialAllStar as any,
    };

    // ── Lazy sim: jump to chosen start date ───────────────────────────────────
    if (payload.jumpRequired && payload.startDate && payload.startDate > '2025-08-12') {
        const { runLazySim } = await import('../../services/logic/lazySimRunner');
        const { initialState } = await import('../initialState');

        const fullInitialState = {
            ...initialState,
            ...statePatch,
        } as GameState;

        const laziedState = await runLazySim(
            fullInitialState,
            payload.startDate,
            payload.onProgress
        );

        return {
            ...laziedState,
            isProcessing: false,
            isDataLoaded: true,
        };
    }

    return statePatch;
};
