import { GameState, HistoricalStatPoint, NBAPlayer as Player, DraftPick, LazySimProgress } from '../../types';
import { generateInitialContent } from '../../services/llm/llm';
import { getRosterData, getHistoricalAwards } from '../../services/rosterService';
import { INITIAL_LEAGUE_STATS } from '../../constants';
import { getSeasonSimStartDate } from '../../utils/dateUtils';
import { DEFAULT_MEDIA_RIGHTS } from '../../utils/broadcastingUtils';
import { fetchEuroleagueRoster, fetchWNBARoster, fetchPBARoster, fetchBLeagueRoster, fetchGLeagueRoster, fetchEndesaRoster, fetchChinaCBARoster, fetchNBLAustraliaRoster } from '../../services/externalRosterService';

import { calculateSocialEngagement } from '../../utils/helpers';
import { generateFuturePicks } from '../../services/draft/DraftPickGenerator';

interface StartGamePayload {
    name: string;
    startScenario?: string;
    skipLLM?: boolean;
    startDate?: string;
    jumpRequired?: boolean;
    onProgress?: (progress: LazySimProgress) => void;
    gameMode?: 'commissioner' | 'gm';
    userTeamId?: number;
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
        { players: chinaPlayers,   teams: chinaTeams },
        { players: nblAusPlayers,  teams: nblAusTeams },
    ] = await Promise.all([
        fetchEuroleagueRoster(),
        fetchWNBARoster(),
        fetchPBARoster(),
        fetchBLeagueRoster(),
        fetchEndesaRoster(),
        fetchGLeagueRoster(),
        fetchChinaCBARoster(),
        fetchNBLAustraliaRoster(),
    ]);

    // Normalize name for dedup: lowercase + strip dots (handles "L.J." vs "LJ", "Jr." vs "Jr")
    // Also strip generational suffixes so "Nick Smith Jr." matches "Nick Smith"
    const normName = (name: string) =>
        name.toLowerCase()
            .replace(/\./g, '')
            .replace(/\b(jr|sr|ii|iii|iv)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

    // Euroleague beats Endesa for overlapping players (Real Madrid, Barcelona, etc.)
    const euroNames = new Set(euroPlayers.map(p => normName(p.name)));
    const uniqueEuroPlayers = euroPlayers
        .map(p => ({ ...p, status: p.status || 'Euroleague' as const }));

    // Euroleague/PBA/B-League names filter raw NBA data (they're true non-NBA players).
    // G-League and Endesa are NOT included here — NBA is always the source of truth for those.
    const externalNames = new Set([
        ...uniqueEuroPlayers.map(p => normName(p.name)),
        ...wnbaPlayers.map(p => normName(p.name)),
        ...pbaPlayers.map(p => normName(p.name)),
        ...bleaguePlayers.map(p => normName(p.name)),
        ...chinaPlayers.map(p => normName(p.name)),
        ...nblAusPlayers.map(p => normName(p.name)),
    ]);

    const nbaPlayers = rawNbaPlayers.filter(p => {
        if (externalNames.has(normName(p.name))) return false;
        if (['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '')) return false;
        return true;
    });

    const existingNbaNames = new Set(nbaPlayers.map(p => normName(p.name)));

    // G-League: NBA takes priority — drop any G-League player whose name is already in NBA
    // Uses normName so "L.J. Cryer" matches "LJ Cryer" etc.
    const uniqueGLeaguePlayers = gleaguePlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: 'G-League' as const }));

    const uniqueEndesaPlayers = endesaPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)) && !euroNames.has(normName(p.name)))
        .map(p => ({ ...p, status: 'Endesa' as const }));

    const uniquePBAPlayers = pbaPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: p.status || 'PBA' as const }));

    const uniqueBLeaguePlayers = bleaguePlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: p.status || 'B-League' as const }));

    const uniqueChinaPlayers = chinaPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: 'China CBA' as const }));

    const uniqueNBLAusPlayers = nblAusPlayers
        .filter(p => !existingNbaNames.has(normName(p.name)))
        .map(p => ({ ...p, status: 'NBL Australia' as const }));

    const players = [
        ...nbaPlayers,
        ...uniqueEuroPlayers,
        ...uniquePBAPlayers,
        ...uniqueBLeaguePlayers,
        ...uniqueEndesaPlayers,
        ...uniqueGLeaguePlayers,
        ...wnbaPlayers,
        ...uniqueChinaPlayers,
        ...uniqueNBLAusPlayers,
    ];

    if (players.some(p => p.name.toLowerCase() === 'devin booker')) {
        console.log("🏀 DEV1N B00K3R 1S L0AD3D! 🏀");
    }

    // Staff loaded lazily after game init (see GameContext idle effect)
    const emptyStaff = { owners: [], gms: [], coaches: [], leagueOffice: [] };

    // Schedule is intentionally empty at start — generated on Aug 14 (Schedule Release Day)
    // so the commissioner has Aug 6-13 to configure Christmas, Global Games, and Intl Preseason.
    const schedule: any[] = [];
    const startDateFormatted = getSeasonSimStartDate(INITIAL_LEAGUE_STATS.year).toLocaleDateString('en-US', {
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
    console.log(`G-League: ${gleaguePlayers.length} players, ${gleagueTeams.length} teams`);
    console.log(`Endesa: ${endesaPlayers.length} players, ${endesaTeams.length} teams`);
    console.log(`China CBA: ${chinaPlayers.length} players, ${chinaTeams.length} teams`);
    console.log(`NBL Australia: ${nblAusPlayers.length} players, ${nblAusTeams.length} teams`);
    console.log(`Total Players: ${players.length}`);
    console.log("====================================");

    // All-Star Initialization (none needed at Aug 12 — voting hasn't started)
    const initialAllStar = null;

    // Extend draft pick window to cover all tradable future seasons from day 1.
    // BBGM data only includes current + next year; generateFuturePicks adds the rest.
    const nbaNBATeams = teams.filter((t: any) => t.id > 0 && t.id < 100);
    const initYear = INITIAL_LEAGUE_STATS.year;
    const initWindowSize = INITIAL_LEAGUE_STATS.tradableDraftPickSeasons ?? 7;
    const initialDraftPicks = generateFuturePicks(draftPicks, nbaNBATeams as any, initYear, initWindowSize);

    const statePatch: Partial<GameState> = {
        commissionerName,
        teams,
        nonNBATeams: [...euroTeams, ...pbaTeams, ...wnbaTeams, ...bleagueTeams, ...endesaTeams, ...gleagueTeams, ...chinaTeams, ...nblAusTeams],
        players,
        draftPicks: initialDraftPicks,
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
        saveId: `nba_commish_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        gameMode: payload.gameMode ?? 'commissioner',
        userTeamId: payload.userTeamId,
        allStar: initialAllStar as any,
        leagueStats: {
            ...INITIAL_LEAGUE_STATS,
            mediaRights: DEFAULT_MEDIA_RIGHTS,
        },
    };

    // ── Lazy sim: jump to chosen start date ───────────────────────────────────
    const defaultSimStart = getSeasonSimStartDate(INITIAL_LEAGUE_STATS.year).toISOString().slice(0, 10);
    if (payload.jumpRequired && payload.startDate && payload.startDate > defaultSimStart) {
        const { runLazySim } = await import('../../services/logic/lazySimRunner');
        const { initialState } = await import('../initialState');

        const fullInitialState = {
            ...initialState,
            ...statePatch,
        } as GameState;

        const lazyResult = await runLazySim(
            fullInitialState,
            payload.startDate,
            payload.onProgress
        );

        return {
            ...lazyResult.state,
            isProcessing: false,
            isDataLoaded: true,
        };
    }

    return statePatch;
};
