import { GameState, UserAction, LeagueStats } from '../../../types';
import { ViewershipService } from '../../../services/logic/ViewershipService';
import { calculateDailyLeagueFunds } from '../../../services/logic/financialService';
import { DEFAULT_MEDIA_RIGHTS } from '../../../utils/broadcastingUtils';

export const calculateNewStats = (state: GameState, action: UserAction, result: any, allSimResults: any[], totalNetPay: number, dateString: string) => {
    const combinedStatChanges = {
        ...result.statChanges,
        ...(result.consequence?.statChanges || {}),
        leagueFunds: (result.statChanges?.leagueFunds || 0) + (result.consequence?.statChanges?.revenue || 0),
        morale: {
            ...(result.statChanges?.morale || {}),
            ...(result.consequence?.statChanges?.morale || {})
        }
    };

    // Cap stat changes from LLM to prevent glitches
    const capStat = (val: number, max: number = 100) => Math.max(-max, Math.min(max, val));
    combinedStatChanges.leagueFunds = capStat(combinedStatChanges.leagueFunds, 500); // Max $500M change per day
    combinedStatChanges.personalWealth = capStat(combinedStatChanges.personalWealth || 0, 8); // Max $8M change per day (LLM should only return -3 to +3)

    if (!action || action.type === 'ADVANCE_DAY') {
        // More varied fluctuations for each group
        const publicFluct = (Math.random() * 0.8 - 0.4); // -0.4 to +0.4
        const ownerFluct = (Math.random() * 0.6 - 0.3);  // -0.3 to +0.3
        const playerFluct = (Math.random() * 1.0 - 0.5); // -0.5 to +0.5

        // Add some "drift" towards the center (50) to prevent extreme runaway
        const drift = (val: number) => (50 - val) * 0.005;

        combinedStatChanges.publicApproval = (combinedStatChanges.publicApproval || 0) + publicFluct + drift(state.stats.publicApproval);
        combinedStatChanges.ownerApproval = (combinedStatChanges.ownerApproval || 0) + ownerFluct + drift(state.stats.ownerApproval);
        combinedStatChanges.playerApproval = (combinedStatChanges.playerApproval || 0) + playerFluct + drift(state.stats.playerApproval);

        // Cross-influence: If one group is extremely happy/unhappy, it bleeds into others slightly
        if (state.stats.playerApproval > 85) combinedStatChanges.ownerApproval -= 0.1; // Owners worry about player power
        if (state.stats.publicApproval < 25) combinedStatChanges.ownerApproval -= 0.2; // Owners worry about revenue
        if (state.stats.ownerApproval > 85) combinedStatChanges.playerApproval -= 0.1; // Players worry about owner power
    }

    // Deterministic Viewership Calculation
    const dailyViewership = ViewershipService.calculateDailyViewership(state, action);
    const performanceImpact = ViewershipService.calculatePerformanceImpact(state, allSimResults);
    const finalViewership = parseFloat((dailyViewership + performanceImpact).toFixed(2));

    // Daily League Funds Tick (mirrors viewership pattern)
    const dailyProfit = calculateDailyLeagueFunds(state);
    combinedStatChanges.leagueFunds = (combinedStatChanges.leagueFunds || 0) + dailyProfit;

    const capChange = (val: number) => Math.max(-4, Math.min(4, val)); // Reduced max daily change

    const newStats = {
        publicApproval: Math.round(Math.max(0, Math.min(100, state.stats.publicApproval + capChange(combinedStatChanges.publicApproval || 0)))),
        ownerApproval: Math.round(Math.max(0, Math.min(100, state.stats.ownerApproval + capChange(combinedStatChanges.ownerApproval || 0)))),
        playerApproval: Math.round(Math.max(0, Math.min(100, state.stats.playerApproval + capChange(combinedStatChanges.playerApproval || 0)))),
        leagueFunds: Number((Math.max(0, state.stats.leagueFunds + (combinedStatChanges.leagueFunds || 0) + (action.type === 'FINE_PERSON' ? (action.payload?.amount || 0) / 1000000 : 0))).toFixed(2)),
        personalWealth: Number((Math.max(0, state.stats.personalWealth + (totalNetPay / 1000000) + (combinedStatChanges.personalWealth || 0))).toFixed(2)),
        legacy: Math.round(Math.max(0, Math.min(100, state.stats.legacy + capChange(combinedStatChanges.legacy || 0)))),
    };

    // Fallback: auto-lock the default deal at Opening Night if the player
    // never finalized one.  Initialization now seeds DEFAULT_MEDIA_RIGHTS so
    // this branch only fires on very old save files that pre-date that change.
    const openingYear = (state.leagueStats?.year ?? 2026) - 1;
    const OPENING_NIGHT = `${openingYear}-10-24`;
    if (!state.leagueStats.mediaRights && dateString >= OPENING_NIGHT) {
        state = {
            ...state,
            leagueStats: {
                ...state.leagueStats,
                mediaRights: { ...DEFAULT_MEDIA_RIGHTS, isLocked: true },
            },
        };
    }
    // Lock the deal automatically once Opening Night is reached
    if (
        state.leagueStats.mediaRights &&
        !state.leagueStats.mediaRights.isLocked &&
        dateString >= OPENING_NIGHT
    ) {
        state = {
            ...state,
            leagueStats: {
                ...state.leagueStats,
                mediaRights: { ...state.leagueStats.mediaRights, isLocked: true },
            },
        };
    }

    const newLeagueStats: LeagueStats = {
        ...state.leagueStats,
        revenue: Math.round(Math.max(0, state.leagueStats.revenue + (combinedStatChanges.revenue || 0))),
        viewership: finalViewership,
        viewershipHistory: [...(state.leagueStats.viewershipHistory || []), { date: dateString, viewers: finalViewership }].slice(-365),
        revenueHistory: [...(state.leagueStats.revenueHistory || []), { date: dateString, revenue: Math.round(dailyProfit * 100) / 100 }].slice(-365),
        morale: {
            fans: Math.round(Math.max(0, Math.min(100, state.leagueStats.morale.fans + (combinedStatChanges.morale.fans || 0)))),
            players: Math.round(Math.max(0, Math.min(100, state.leagueStats.morale.players + (combinedStatChanges.morale.players || 0)))),
            owners: Math.round(Math.max(0, Math.min(100, state.leagueStats.morale.owners + (combinedStatChanges.morale.owners || 0)))),
            legacy: newStats.legacy,
        },
        hasExpanded: action.type === 'EXPANSION_DRAFT' ? true : state.leagueStats.hasExpanded,
        hasFinalsHalftime: (action.type === 'INVITE_PERFORMANCE' && action.payload.event === 'NBA Finals Halftime Show') ? true : state.leagueStats.hasFinalsHalftime,
        hasAllStarHalftime: (action.type === 'INVITE_PERFORMANCE' && action.payload.event === 'All-Star Game Halftime') ? true : state.leagueStats.hasAllStarHalftime,
        hasRingCeremony: (action.type === 'INVITE_PERFORMANCE' && action.payload.event === 'Championship Ring Ceremony') ? true : state.leagueStats.hasRingCeremony,
        hasInvitedPerformance: (action.type === 'INVITE_PERFORMANCE' && (action.payload.event === 'Regular Season Halftime' || action.payload.type === 'national_anthem')) ? true : state.leagueStats.hasInvitedPerformance,
        hasSetCelebrityRoster: action.type === 'CELEBRITY_ROSTER' ? true : state.leagueStats.hasSetCelebrityRoster,
        celebrityRosterAutoSelected: action.type === 'CELEBRITY_ROSTER' ? false : state.leagueStats.celebrityRosterAutoSelected,
        celebrityRoster: action.type === 'CELEBRITY_ROSTER' ? action.payload.roster.split(', ') : state.leagueStats.celebrityRoster,
        hasScheduledGlobalGames: action.type === 'GLOBAL_GAMES' ? true : state.leagueStats.hasScheduledGlobalGames,
    };

    return { newStats, newLeagueStats, combinedStatChanges };
};
