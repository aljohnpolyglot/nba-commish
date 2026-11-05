import { GameState, NBAPlayer as Player } from '../../../../types';
import { tickFAMarkets } from '../../../../services/faMarketTicker';
import { pushCoachMessage } from './coachMessages';
import { normalizeReservedJerseys } from './playoffPipeline';
import { getLeagueCalendarDates, getLeagueSeasonForDate } from '../../../../services/leagueCalendar';
import { formatGameDateShort, parseGameDate, toISODateString } from '../../../../utils/dateUtils';
import { getTeamFullName } from '../../../../utils/teamNames';
import { simDebug } from '../../../../utils/simDebug';
import { buildAspireInvestigationEmail, forfeitTeamDraftPicks, getAspirePenaltyPickCount } from '../../../../services/aspireSideDeals';

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

export function applyFAMarketTickPass(stateWithSim: GameState, includeDerivedMedia = true): {
    stateWithSim: GameState;
    userInterrupted: boolean;
} {
    const tick = tickFAMarkets(stateWithSim, { includeDerivedMedia });
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
        tick.aspireOutcomes.length > 0 ||
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
            simDebug('free-agency', () => (
                `[FAMarketTick] Resolved ${tick.signedPlayerIds.size} market signings on ${stateWithSim.date}`
            ), { event: 'market-tick-summary', signed: tick.signedPlayerIds.size });
        }
        if (tick.signedPlayerIds.size > 0 || tick.playerMutations.size > 0) {
            const affectedTeamIds = Array.from(tick.playerMutations.values())
                .map((mut: any) => Number(mut?.tid))
                .filter((tid: number) => tid >= 0);
            nextState = normalizeReservedJerseys(nextState, affectedTeamIds);
        }
        for (const outcome of tick.aspireOutcomes) {
            nextState = {
                ...nextState,
                stats: {
                    ...nextState.stats,
                    personalWealth: Math.max(0, Number(nextState.stats.personalWealth ?? 0) - outcome.sideDeal.amountUSD / 1_000_000),
                },
            };
            if (outcome.sideDeal.roll > outcome.sideDeal.risk) continue;
            const beforePenalty = nextState;
            const penalized = forfeitTeamDraftPicks(
                beforePenalty,
                outcome.teamId,
                getAspirePenaltyPickCount(outcome.sideDeal.risk),
                `Undisclosed ${outcome.sideDeal.sponsor} agreement connected to ${outcome.playerName}`,
            );
            const remainingPickIds = new Set(penalized.draftPicks.map(pick => pick.dpid));
            const forfeitedPickIds = beforePenalty.draftPicks
                .filter(pick => !remainingPickIds.has(pick.dpid))
                .map(pick => pick.dpid);
            nextState = {
                ...penalized,
                inbox: [
                    buildAspireInvestigationEmail({
                        state: beforePenalty,
                        teamId: outcome.teamId,
                        playerId: outcome.playerId,
                        playerName: outcome.playerName,
                        sponsor: outcome.sideDeal.sponsor,
                        amountUSD: outcome.sideDeal.amountUSD,
                        risk: outcome.sideDeal.risk,
                        resolvedPickIds: forfeitedPickIds,
                    }),
                    ...(penalized.inbox ?? []),
                ],
            };
        }
    }

    return { stateWithSim: nextState, userInterrupted: !!tick.shouldStopSim };
}

/** Final signing-window drain. No unresolved market or visible offer count may survive day 15. */
export function finalizeCentralFAMarketWindow(state: GameState): GameState {
    const uiMode = String(state.leagueStats?.uiMode ?? 'nba');
    if (uiMode === 'euro_isolated' || uiMode === 'pba_isolated') return state;
    const resolvedState = applyFAMarketTickPass(
        { ...state, faResolveAllToday: true },
        false,
    ).stateWithSim;
    const markets = (resolvedState.faBidding?.markets ?? []).map(market => {
        if (market.resolved) return market;
        return {
            ...market,
            resolved: true,
            pendingMatch: false,
            bids: market.bids.map(bid => bid.status === 'active'
                ? { ...bid, status: bid.isUserBid ? 'rejected' as const : 'withdrawn' as const }
                : bid),
        };
    });
    return {
        ...resolvedState,
        faResolveAllToday: undefined,
        faBidding: { markets },
    };
}

export function applyNonGuaranteedGuaranteePass(stateWithSim: GameState): GameState {
    const season = getLeagueSeasonForDate(stateWithSim.date, stateWithSim.leagueStats) || stateWithSim.leagueStats.year;
    const deadline = getLeagueCalendarDates(season, stateWithSim.leagueStats).nonGuaranteedGuaranteeDate;
    if (!deadline || toISODateString(deadline) !== toISODateString(parseGameDate(stateWithSim.date))) return stateWithSim;
    const deadlineLabel = formatGameDateShort(deadline);

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
                text: `${p.name}'s contract guaranteed by the ${stateWithSim.teams.find(t => t.id === p.tid) ? getTeamFullName(stateWithSim.teams.find(t => t.id === p.tid)!) : 'team'} (${deadlineLabel} deadline)`,
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
        `Boss, just a heads up—${playerList} just became guaranteed on the ${deadlineLabel} deadline. Now locked in for the rest of the season.`,
    );
}
