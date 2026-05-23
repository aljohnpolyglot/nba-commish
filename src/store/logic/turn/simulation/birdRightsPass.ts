import { GameState } from '../../../../types';
import { runAIBirdRightsResigns } from '../../../../services/AIFreeAgentHandler';

export function applyBirdRightsResignsPass(stateWithSim: GameState): GameState {
    const rawBirdResigns = runAIBirdRightsResigns(stateWithSim);
    const userMarketIds = new Set(
        (stateWithSim.faBidding?.markets ?? [])
            .filter((m: any) => !m.resolved && m.bids?.some((b: any) => b.isUserBid && b.status === 'active'))
            .map((m: any) => m.playerId),
    );
    const birdResigns = rawBirdResigns.filter(r => {
        if (userMarketIds.has(r.playerId)) {
            console.error(`[FA-LEAK-GUARD] Dropped Bird-rights re-sign of ${r.playerName} → ${r.teamName} — user has an open bid.`);
            return false;
        }
        return true;
    });
    const firstYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    if (birdResigns.length === 0) {
        return {
            ...stateWithSim,
            leagueStats: { ...(stateWithSim.leagueStats as any), birdRightsResignPassYear: firstYear } as any,
        };
    }

    const currentDay = stateWithSim.day ?? 0;
    const decisionDay = currentDay + 3;
    const markets = [...(stateWithSim.faBidding?.markets ?? [])] as any[];

    for (const r of birdResigns) {
        const team = stateWithSim.teams.find(t => t.id === r.teamId);
        const bid = {
            id: `bird-${r.playerId}-${r.teamId}-${firstYear}`,
            playerId: r.playerId,
            teamId: r.teamId,
            teamName: r.teamName,
            teamLogoUrl: team?.logoUrl,
            salaryUSD: r.salaryUSD,
            years: r.years,
            option: r.hasPlayerOption ? 'PLAYER' : 'NONE',
            isUserBid: false,
            submittedDay: currentDay,
            expiresDay: decisionDay,
            status: 'active',
        };
        const idx = markets.findIndex((m: any) => m.playerId === r.playerId && !m.resolved);
        if (idx >= 0) {
            const existing = markets[idx];
            const hasBid = (existing.bids ?? []).some((b: any) => b.id === bid.id || (b.teamId === r.teamId && b.status === 'active'));
            markets[idx] = {
                ...existing,
                bids: hasBid ? existing.bids : [...(existing.bids ?? []), bid],
                decidesOnDay: Math.max(existing.decidesOnDay ?? decisionDay, decisionDay),
                openedDay: existing.openedDay ?? currentDay,
                openedDate: existing.openedDate ?? stateWithSim.date,
                season: existing.season ?? firstYear,
            };
        } else {
            markets.push({
                playerId: r.playerId,
                playerName: r.playerName,
                bids: [bid],
                decidesOnDay: decisionDay,
                resolved: false,
                season: firstYear,
                openedDay: currentDay,
                openedDate: stateWithSim.date,
            });
        }
    }

    console.log(`[BirdRights] Queued ${birdResigns.length} incumbent re-sign bids into FA markets.`);
    return {
        ...stateWithSim,
        faBidding: { markets: markets as any },
        leagueStats: { ...(stateWithSim.leagueStats as any), birdRightsResignPassYear: firstYear } as any,
    };
}
