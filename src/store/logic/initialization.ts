import { GameState, HistoricalStatPoint, NBAPlayer as Player, DraftPick, LazySimProgress } from '../../types';
import { generateInitialContent } from '../../services/llm/llm';
import { getRosterData, getHistoricalAwards } from '../../services/rosterService';
import { INITIAL_LEAGUE_STATS } from '../../constants';
import { DEFAULT_MEDIA_RIGHTS } from '../../utils/broadcastingUtils';
import { fetchEuroleagueRoster, fetchWNBARoster, fetchPBARoster, fetchBLeagueRoster, fetchGLeagueRoster, fetchEndesaRoster } from '../../services/externalRosterService';

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
    const { teams, players: rawNbaPlayers, draftPicks } = await getRosterData(2025, 'Opening Week');
    
    const historicalAwardsData = await getHistoricalAwards(); 

    // Fetch external rosters (all in parallel for speed)
    const [
        { players: euroPlayers,    teams: euroTeams },
        { players: wnbaPlayers,    teams: wnbaTeams },
        { players: pbaPlayers,     teams: pbaTeams },
        { players: bleaguePlayers, teams: bleagueTeams },
        { players: endesaPlayers,  teams: endesaTeams },
        { players: gleaguePlayers, teams: gleagueTeams },
    ] = await Promise.all([
        fetchEuroleagueRoster(),
        fetchWNBARoster(),
        fetchPBARoster(),
        fetchBLeagueRoster(),
        fetchEndesaRoster(),
        fetchGLeagueRoster(),
    ]);

    // Euroleague beats Endesa for overlapping players (Real Madrid, Barcelona, etc.)
    const euroNames = new Set(euroPlayers.map(p => p.name.toLowerCase()));
    const uniqueEuroPlayers = euroPlayers
        .map(p => ({ ...p, status: p.status || 'Euroleague' as const }));

    // Euroleague/PBA/B-League names filter raw NBA data (they're true non-NBA players).
    // G-League and Endesa are NOT included here — NBA is always the source of truth for those.
    const externalNames = new Set([
        ...uniqueEuroPlayers.map(p => p.name.toLowerCase()),
        ...wnbaPlayers.map(p => p.name.toLowerCase()),
        ...pbaPlayers.map(p => p.name.toLowerCase()),
        ...bleaguePlayers.map(p => p.name.toLowerCase()),
    ]);

    const nbaPlayers = rawNbaPlayers.filter(p => {
        const nameLower = p.name.toLowerCase();
        if (externalNames.has(nameLower)) return false;
        if (['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa'].includes(p.status || '')) return false;
        return true;
    });

    const existingNbaNames = new Set(nbaPlayers.map(p => p.name.toLowerCase()));

    // G-League: NBA takes priority — drop any G-League player whose name is already in NBA
    const uniqueGLeaguePlayers = gleaguePlayers
        .filter(p => !existingNbaNames.has(p.name.toLowerCase()))
        .map(p => ({ ...p, status: 'G-League' as const }));

    const uniqueEndesaPlayers = endesaPlayers
        .filter(p => !existingNbaNames.has(p.name.toLowerCase()) && !euroNames.has(p.name.toLowerCase()))
        .map(p => ({ ...p, status: 'Endesa' as const }));

    const uniquePBAPlayers = pbaPlayers
        .filter(p => !existingNbaNames.has(p.name.toLowerCase()))
        .map(p => ({ ...p, status: p.status || 'PBA' as const }));

    const uniqueBLeaguePlayers = bleaguePlayers
        .filter(p => !existingNbaNames.has(p.name.toLowerCase()))
        .map(p => ({ ...p, status: p.status || 'B-League' as const }));

    const players = [
        ...nbaPlayers,
        ...uniqueEuroPlayers,
        ...uniquePBAPlayers,
        ...uniqueBLeaguePlayers,
        ...uniqueEndesaPlayers,
        ...uniqueGLeaguePlayers,
        ...wnbaPlayers,
    ];

    if (players.some(p => p.name.toLowerCase() === 'devin booker')) {
        console.log("🏀 DEV1N B00K3R 1S L0AD3D! 🏀");
    }

    // Staff loaded lazily after game init (see GameContext idle effect)
    const emptyStaff = { owners: [], gms: [], coaches: [], leagueOffice: [] };

    // Schedule is intentionally empty at start — generated on Aug 14 (Schedule Release Day)
    // so the commissioner has Aug 6-13 to configure Christmas, Global Games, and Intl Preseason.
    const schedule: any[] = [];
    const startDateFormatted = new Date('2025-08-06T00:00:00.000Z').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });

    // Generate Initial Content via AI (based on Aug 6 — the simulation start point)
    let initialContent: any = { newEmails: [], newNews: [], newSocialPosts: [] };
    if (!payload.skipLLM) {
        initialContent = await generateInitialContent(startDateFormatted, commissionerName, players, teams, emptyStaff);
    } else {
        initialContent = {
            newEmails: [{
                sender: 'League Office',
                senderRole: 'Operations',
                subject: 'Schedule Generation Approaching',
                body: `Commissioner ${commissionerName}, the league schedule will be generated on August 14. You have until then to set Christmas Day matchups, Global Games, and International Preseason games.`,
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
    console.log(`B-League: ${bleaguePlayers.length} players, ${bleagueTeams.length} teams`);
    console.log(`Total Players: ${players.length}`);
    console.log("====================================");

    // All-Star Initialization (none needed at Aug 12 — voting hasn't started)
    const initialAllStar = null;

    const statePatch: Partial<GameState> = {
        commissionerName,
        teams,
        nonNBATeams: [...euroTeams, ...pbaTeams, ...wnbaTeams, ...bleagueTeams, ...endesaTeams, ...gleagueTeams],
        players,
        draftPicks,
        staff: null,
        schedule,
        inbox: initialInbox,
        news: initialNews,
        socialFeed: initialSocial,
        historicalStats: [initialHistoricalPoint],
         historicalAwards: historicalAwardsData, 
        followedHandles: ['nba', 'wojespn', 'ShamsCharania', 'statmuse'],
        history: [{ text: `${commissionerName} took office as the new NBA Commissioner.`, date: startDateFormatted || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), type: 'League Event' } as any],
        
        isDataLoaded: true,
        isProcessing: false,
        date: startDateFormatted,
        day: 1,
        saveId: `nba_commish_save_${Date.now()}`,
        allStar: initialAllStar as any,
        leagueStats: {
            ...INITIAL_LEAGUE_STATS,
            mediaRights: DEFAULT_MEDIA_RIGHTS,
        },
    };

    // ── Lazy sim: jump to chosen start date ───────────────────────────────────
    if (payload.jumpRequired && payload.startDate && payload.startDate > '2025-08-06') {
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
