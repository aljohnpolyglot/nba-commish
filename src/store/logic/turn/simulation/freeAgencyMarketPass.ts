import { GameState, NBAPlayer as Player } from '../../../../types';
import { tickFAMarkets } from '../../../../services/faMarketTicker';
import { pushCoachMessage } from './coachMessages';
import { normalizeReservedJerseys } from './playoffPipeline';

export function clearLegacyGLeagueAssignments(
    stateWithSim: GameState,
    isRegularSeason: boolean,
): GameState {
    if (!isRegularSeason || stateWithSim.day % 7 !== 0) return stateWithSim;
    if (!stateWithSim.players.some(p => (p as any).gLeagueAssigned)) return stateWithSim;
    return {
        ...stateWithSim,
        players: stateWithSim.players.map(p =>
            (p as any).gLeagueAssigned ? { ...p, gLeagueAssigned: false } : p,
        ),
    };
}

export function applyFAMarketTickPass(stateWithSim: GameState): {
    stateWithSim: GameState;
    userInterrupted: boolean;
} {
    console.log(`[OSPLAN] simulationHandler.tickFAMarkets fire date=${stateWithSim.date}`);
    const tick = tickFAMarkets(stateWithSim);
    const previousResolvedMarketIds = new Set(
        (stateWithSim.faBidding?.markets ?? [])
            .filter((market: any) => market.resolved)
            .map((market: any) => market.playerId),
    );
    const previousMarketByPlayerId = new Map(
        (stateWithSim.faBidding?.markets ?? []).map((market: any) => [market.playerId, market]),
    );
    const hasMarketChanges =
        tick.playerMutations.size > 0 ||
        tick.historyEntries.length > 0 ||
        tick.newsItems.length > 0 ||
        tick.socialPosts.length > 0 ||
        !!tick.leagueStats ||
        tick.userBidResolutions.length > 0 ||
        tick.updatedMarkets.length !== (stateWithSim.faBidding?.markets?.length ?? 0) ||
        tick.updatedMarkets.some((market: any) => {
            const prevMarket: any = previousMarketByPlayerId.get(market.playerId);
            if (!prevMarket) return true;
            if (prevMarket.decidesOnDay !== market.decidesOnDay) return true;
            if ((prevMarket.bids?.length ?? 0) !== (market.bids?.length ?? 0)) return true;
            const prevBidSig = (prevMarket.bids ?? []).map((b: any) => `${b.id}:${b.status}:${b.expiresDay}`).join('|');
            const nextBidSig = (market.bids ?? []).map((b: any) => `${b.id}:${b.status}:${b.expiresDay}`).join('|');
            if (prevBidSig !== nextBidSig) return true;
            const prevActiveUser = (prevMarket.bids ?? []).find((b: any) => b.isUserBid && b.status === 'active');
            const nextActiveUser = (market.bids ?? []).find((b: any) => b.isUserBid && b.status === 'active');
            return (prevActiveUser?.expiresDay ?? null) !== (nextActiveUser?.expiresDay ?? null);
        }) ||
        tick.updatedMarkets.some((market: any) => market.resolved && !previousResolvedMarketIds.has(market.playerId));

    let nextState = stateWithSim;
    if (hasMarketChanges) {
        nextState = {
            ...stateWithSim,
            players: tick.playerMutations.size > 0
                ? stateWithSim.players.map(p => {
                    const mut = tick.playerMutations.get(p.internalId);
                    return mut ? ({ ...p, ...mut } as Player) : p;
                })
                : stateWithSim.players,
            history: tick.historyEntries.length > 0
                ? [...(stateWithSim.history ?? []), ...tick.historyEntries] as any
                : stateWithSim.history,
            news: tick.newsItems.length > 0
                ? [...tick.newsItems, ...(stateWithSim.news ?? [])] as any
                : stateWithSim.news,
            socialFeed: tick.socialPosts.length > 0
                ? [...tick.socialPosts, ...(stateWithSim.socialFeed ?? [])] as any
                : stateWithSim.socialFeed,
            faBidding: { markets: tick.updatedMarkets as any },
            ...(tick.leagueStats ? { leagueStats: tick.leagueStats as any } : {}),
            ...(tick.userBidResolutions.length > 0 ? {
                pendingFAToasts: [...(stateWithSim.pendingFAToasts ?? []), ...tick.userBidResolutions],
            } : {}),
            ...((tick as any).rfaOfferSheets?.length > 0 ? {
                pendingRFAOfferSheets: [
                    ...((stateWithSim as any).pendingRFAOfferSheets ?? []),
                    ...(tick as any).rfaOfferSheets,
                ],
            } : {}),
            ...((tick as any).rfaMatchResolutions?.filter((r: any) => r.userInvolved).length > 0 ? {
                pendingRFAMatchResolutions: [
                    ...((stateWithSim as any).pendingRFAMatchResolutions ?? []),
                    ...(tick as any).rfaMatchResolutions.filter((r: any) => r.userInvolved),
                ],
            } : {}),
        };
        if (tick.signedPlayerIds.size > 0) {
            console.log(`[FAMarketTick] Resolved ${tick.signedPlayerIds.size} market signings on ${stateWithSim.date}`);
        }
        if (tick.signedPlayerIds.size > 0 || tick.playerMutations.size > 0) {
            const affectedTeamIds = Array.from(tick.playerMutations.values())
                .map((mut: any) => Number(mut?.tid))
                .filter((tid: number) => tid >= 0);
            nextState = normalizeReservedJerseys(nextState, affectedTeamIds);
        }
    }

    return { stateWithSim: nextState, userInterrupted: !!tick.shouldStopSim };
}

export function applyJan10GuaranteesPass(
    stateWithSim: GameState,
    simMonth: number,
    simDayNum: number,
): GameState {
    if (simMonth !== 1 || simDayNum !== 10) return stateWithSim;

    const ngToGuarantee = stateWithSim.players.filter(
        p => !!(p as any).nonGuaranteed && p.tid != null && p.tid >= 0,
    );
    if (ngToGuarantee.length === 0) return stateWithSim;

    let nextState: GameState = {
        ...stateWithSim,
        players: stateWithSim.players.map(p =>
            (p as any).nonGuaranteed && p.tid != null && p.tid >= 0
                ? { ...p, nonGuaranteed: undefined }
                : p,
        ),
        history: [
            ...(stateWithSim.history ?? []),
            ...ngToGuarantee.map(p => ({
                text: `${p.name}'s contract guaranteed by the ${stateWithSim.teams.find(t => t.id === p.tid)?.name ?? 'team'} (January 10 deadline)`,
                date: stateWithSim.date,
                type: 'NG Guaranteed',
                playerIds: [p.internalId],
            })),
        ],
    };

    const userTeamNGs = ngToGuarantee.filter(p => p.tid === stateWithSim.userTeamId);
    if (userTeamNGs.length === 0) return nextState;
    const playerList = userTeamNGs.map(p => p.name).join(', ');
    return pushCoachMessage(
        nextState,
        `Boss, just a heads up—${playerList} just became guaranteed on the Jan 10 deadline. Now locked in for the rest of the season.`,
    );
}
