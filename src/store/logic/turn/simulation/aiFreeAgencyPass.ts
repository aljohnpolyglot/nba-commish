import { DeadMoneyEntry, GameState, NBAPlayer as Player } from '../../../../types';
import { autoPromoteTwoWayExcess, autoTrimOversizedRosters, runAIFreeAgencyRound, runAIMleUpgradeSwaps } from '../../../../services/AIFreeAgentHandler';
import { buildShamsTransactionPost } from '../../../../services/social/templates/charania';
import { findShamsPhoto } from '../../../../services/social/charaniaphotos';
import { getInsiderHandle, getInsiderWoj } from '../../../../data/social/handles';
import { buildStretchedSchedule, seasonLabelToYear } from '../../../../utils/salaryUtils';
import { convertTo2KRating, calculateSocialEngagement } from '../../../../utils/helpers';
import { formatGameDateShort, parseGameDate } from '../../../../utils/dateUtils';
import { computeTradeEligibleDate } from '../../../../utils/signingMoratorium';
import { clearWaiverMarkers, stripLiveContractAfterWaive } from '../../../../utils/contractCleanup';
import { pushCoachMessage } from './coachMessages';
import { normalizeReservedJerseys } from './playoffPipeline';
function releaseToFreeAgency(player: Player, teamId: number, date: string, currentSeasonYear: number): Player {
    const cleanPlayer = stripLiveContractAfterWaive(player, currentSeasonYear);
    return {
        ...cleanPlayer,
        tid: -1,
        status: 'Free Agent' as const,
        twoWay: undefined,
        nonGuaranteed: false,
        gLeagueAssigned: false,
        mleSignedVia: undefined,
        hasBirdRights: false,
        superMaxEligible: false,
        yearsWithTeam: 0,
        recentlyWaivedBy: teamId,
        recentlyWaivedDate: date,
        signedDate: undefined,
        tradeEligibleDate: undefined,
    } as unknown as Player;
}
function applyTwoWayPromotions(stateWithSim: GameState, simMonth: number): GameState {
    const promotions = autoPromoteTwoWayExcess(stateWithSim, simMonth);
    if (promotions.length === 0) return stateWithSim;
    const promotionMap = new Map(promotions.map(pr => [pr.playerId, pr] as const));
    const firstYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    const nextState: GameState = {
        ...stateWithSim,
        players: stateWithSim.players.map(p => {
            const pr = promotionMap.get(p.internalId);
            if (!pr) return p;
            const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => seasonLabelToYear(cy.season) < firstYear);
            return {
                ...p,
                twoWay: false,
                contract: { amount: Math.round(pr.newSalaryUSD / 1_000), exp: pr.contractExp, hasPlayerOption: false },
                contractYears: [...historicalYears, {
                    season: `${firstYear - 1}-${String(firstYear).slice(-2)}`,
                    guaranteed: pr.newSalaryUSD,
                    option: '',
                }],
            } as any;
        }),
        history: [
            ...(stateWithSim.history ?? []),
            ...promotions.map(pr => ({
                text: `${pr.playerName} has been promoted from two-way to a standard contract by the ${pr.teamName}: $${(pr.newSalaryUSD / 1_000_000).toFixed(1)}M/1yr`,
                date: stateWithSim.date,
                type: 'Signing',
                playerIds: [pr.playerId],
                tid: pr.teamId,
            })),
        ],
    };
    console.log(`[TwoWayPromotion] Applied ${promotions.length} promotions`);
    return nextState;
}
function applyRosterTrimPass(stateWithSim: GameState, simMonth: number, simDayNum: number): GameState {
    console.log(`[RosterTrim] Calling autoTrimOversizedRosters: simMonth=${simMonth}, date=${stateWithSim.date}, day=${stateWithSim.day}`);
    const waivers = autoTrimOversizedRosters(stateWithSim, simMonth, simDayNum);
    console.log(`[RosterTrim] Month=${simMonth}, trimmed=${waivers.length} players`);
    if (waivers.length === 0) return stateWithSim;

    const waiverInfo = new Map(waivers.map(w => [w.playerId, w] as const));
    const lsForDeadMoney = stateWithSim.leagueStats as any;
    const deadMoneyEnabled = lsForDeadMoney.deadMoneyEnabled ?? true;
    const stretchEnabled: boolean = lsForDeadMoney.stretchProvisionEnabled ?? true;
    const stretchMult: number = lsForDeadMoney.stretchProvisionMultiplier ?? 2;
    const stretchedCapPct: number = lsForDeadMoney.stretchedDeadMoneyCapPct ?? 15;
    const salaryCapUSD: number = lsForDeadMoney.salaryCap ?? 140_000_000;
    const stretchAmountFloorUSD = salaryCapUSD * 0.06;
    const currentSeasonYear: number = lsForDeadMoney.year ?? new Date(stateWithSim.date ?? Date.now()).getUTCFullYear();
    const DEAD_MONEY_FLOOR_USD = 50_000;
    const teamDeadMoneyAdds = new Map<number, DeadMoneyEntry[]>();

    if (deadMoneyEnabled) {
        for (const w of waivers) {
            if (w.wasNonGuaranteed) continue;
            const playerRecord: any = stateWithSim.players.find(p => p.internalId === w.playerId);
            if (!playerRecord || (playerRecord as any).twoWay) continue;
            const remaining = (Array.isArray(playerRecord.contractYears) ? playerRecord.contractYears : [])
                .filter((y: any) => {
                    const option = String(y.option ?? '').toLowerCase();
                    return seasonLabelToYear(y.season) >= currentSeasonYear && option !== 'team' && option !== 'player';
                })
                .filter((y: any) => (y.guaranteed ?? 0) >= DEAD_MONEY_FLOOR_USD)
                .map((y: any) => ({ season: y.season, amountUSD: y.guaranteed }));
            const signedAt = playerRecord.signedDate ? new Date(playerRecord.signedDate).getTime() : NaN;
            const waivedAt = stateWithSim.date ? new Date(stateWithSim.date).getTime() : NaN;
            const freshSignedMissingYears = Number.isFinite(signedAt) && Number.isFinite(waivedAt)
                && (waivedAt - signedAt) >= 0
                && (waivedAt - signedAt) / 86_400_000 < 120;
            if (remaining.length === 0 && playerRecord.contract?.amount && !freshSignedMissingYears) {
                const amountUSD = (playerRecord.contract.amount || 0) * 1_000;
                if (amountUSD >= DEAD_MONEY_FLOOR_USD) {
                    for (let yr = currentSeasonYear; yr <= (playerRecord.contract.exp ?? currentSeasonYear); yr++) {
                        remaining.push({ season: `${yr - 1}-${String(yr).slice(-2)}`, amountUSD });
                    }
                }
            }
            if (remaining.length === 0) continue;
            const totalRemainingUSD = remaining.reduce((s: number, y: any) => s + y.amountUSD, 0);
            if (totalRemainingUSD < DEAD_MONEY_FLOOR_USD) continue;
            const yearsLeft = remaining.length;
            const annualUSD = totalRemainingUSD / yearsLeft;
            const teamRecord = stateWithSim.teams.find(t => t.id === w.teamId);
            let useStretch = false;
            if (stretchEnabled && yearsLeft > 1 && annualUSD >= stretchAmountFloorUSD) {
                const stretchYears = yearsLeft * stretchMult + 1;
                const stretchedAnnualUSD = totalRemainingUSD / stretchYears;
                const existingStretchedNextYear = (teamRecord?.deadMoney ?? [])
                    .filter(e => e.stretched)
                    .reduce((s, e) => s + (e.remainingByYear.find(y => seasonLabelToYear(y.season) === currentSeasonYear)?.amountUSD ?? 0), 0);
                if (existingStretchedNextYear + stretchedAnnualUSD <= salaryCapUSD * (stretchedCapPct / 100)) {
                    useStretch = true;
                }
            }
            const entry: DeadMoneyEntry = {
                playerId: w.playerId,
                playerName: w.playerName,
                remainingByYear: useStretch ? buildStretchedSchedule(remaining, stretchMult) : remaining,
                stretched: useStretch,
                waivedDate: stateWithSim.date ?? '',
                originalExpYear: playerRecord.contract?.exp ?? currentSeasonYear,
            };
            teamDeadMoneyAdds.set(w.teamId, [...(teamDeadMoneyAdds.get(w.teamId) ?? []), entry]);
        }
    }

    const userTidForWaiveNews = stateWithSim.gameMode === 'gm' ? (stateWithSim.userTeamId ?? -999) : -999;
    const isOffseasonWaiveWindow = simMonth >= 7 && (simMonth <= 9 || (simMonth === 10 && simDayNum <= 21));
    const highOvrWaiveNews = isOffseasonWaiveWindow
        ? waivers.flatMap(w => {
            if (w.teamId === userTidForWaiveNews) return [];
            const playerRecord: any = stateWithSim.players.find(p => p.internalId === w.playerId);
            if (!playerRecord) return [];
            const lastRating = playerRecord.ratings?.[playerRecord.ratings.length - 1];
            const k2 = convertTo2KRating(playerRecord.overallRating ?? lastRating?.ovr ?? 60, lastRating?.hgt ?? 50, lastRating?.tp ?? 50);
            if (k2 < 80) return [];
            return [{
                id: `waive-fit-${w.playerId}-${stateWithSim.date}`,
                headline: `${w.teamName} Parts Ways with ${w.playerName}`,
                content: `${w.teamName} parts ways with ${w.playerName} — front office cites system fit.`,
                date: stateWithSim.date,
                type: 'transaction',
                read: false,
                isNew: true,
            }];
        })
        : [];

    return {
        ...stateWithSim,
        teams: teamDeadMoneyAdds.size > 0
            ? stateWithSim.teams.map(t => teamDeadMoneyAdds.has(t.id) ? { ...t, deadMoney: [...(t.deadMoney ?? []), ...(teamDeadMoneyAdds.get(t.id) ?? [])] } : t)
            : stateWithSim.teams,
        players: stateWithSim.players.map(p => {
            const w = waiverInfo.get(p.internalId);
            if (!w) return p;
            return releaseToFreeAgency(p, w.teamId, stateWithSim.date, currentSeasonYear);
        }),
        history: [
            ...(stateWithSim.history ?? []),
            ...waivers.map(w => ({
                text: w.wasNonGuaranteed && w.reason === 'trainingCampExcess'
                    ? `${w.playerName} released from training camp by the ${w.teamName}`
                    : w.wasNonGuaranteed
                        ? `${w.playerName} released by the ${w.teamName} (non-guaranteed)`
                        : `${w.playerName} waived by the ${w.teamName}`,
                date: stateWithSim.date,
                type: w.wasNonGuaranteed && w.reason === 'trainingCampExcess' ? 'Training Camp Release' : 'Waiver',
                playerIds: [w.playerId],
                tid: w.teamId,
            })),
        ],
        news: highOvrWaiveNews.length > 0
            ? [...highOvrWaiveNews, ...(stateWithSim.news ?? [])].slice(0, 200) as any
            : stateWithSim.news,
    };
}
function applyEarlyNGKeeperPass(stateWithSim: GameState, simMonth: number, simDayNum: number): GameState {
    if (!((simMonth === 10 && simDayNum >= 22) || simMonth === 11 || simMonth === 12 || (simMonth === 1 && simDayNum < 10))) {
        return stateWithSim;
    }
    const userTid = stateWithSim.gameMode === 'gm' ? stateWithSim.userTeamId ?? -999 : -999;
    const ngKeepers = stateWithSim.players.filter(p =>
        !!(p as any).nonGuaranteed &&
        p.tid != null &&
        p.tid >= 0 &&
        p.tid !== userTid &&
        (p.overallRating ?? 0) >= 50,
    );
    if (ngKeepers.length === 0) return stateWithSim;
    const keeperIds = new Set(ngKeepers.map(p => p.internalId));
    return {
        ...stateWithSim,
        players: stateWithSim.players.map(p => keeperIds.has(p.internalId) ? { ...p, nonGuaranteed: undefined } : p),
        history: [
            ...(stateWithSim.history ?? []),
            ...ngKeepers.map(p => ({
                text: `${p.name}'s contract guaranteed early by the ${stateWithSim.teams.find(t => t.id === p.tid)?.name ?? 'team'}`,
                date: stateWithSim.date,
                type: 'NG Guaranteed',
                playerIds: [p.internalId],
            })),
        ],
    };
}
function applyRosterReminderMessages(stateWithSim: GameState, simMonth: number, simDayNum: number): GameState {
    let nextState = stateWithSim;
    if (simMonth === 2 && simDayNum === 3) {
        nextState = pushCoachMessage(nextState, 'Boss, trade deadline is in 3 days. This is our last window—let me know if you want to make any moves.');
    }
    if ((simMonth !== 3 || simDayNum < 30) && (simMonth !== 4 || simDayNum > 6)) return nextState;
    const hasPrevPlayoffMsg = (nextState.chats || []).some(c => c.messages.some(m => m.text.includes('lock in our playoff')));
    if (hasPrevPlayoffMsg) return nextState;
    const twoWayCount = nextState.players.filter(p => p.tid === nextState.userTeamId && (p as any).twoWay && p.status === 'Active').length;
    const ngCount = nextState.players.filter(p => p.tid === nextState.userTeamId && (p as any).nonGuaranteed && p.status === 'Active').length;
    let msg = 'Boss, we need to finalize our playoff roster. ';
    if (ngCount > 0) msg += `We've got ${ngCount} non-guaranteed player(s) who should be locked in before postseason. `;
    if (twoWayCount > 0) msg += `Also, our two-way guys can't play in the playoffs—we should convert or release them before game 1.`;
    else if (ngCount === 0) msg += `Let's make sure we're ready for the playoffs.`;
    return pushCoachMessage(nextState, msg);
}
function applyOpenMarketSignings(stateWithSim: GameState, simMonth: number, simDayNum: number): GameState {
    const rawSignings = runAIFreeAgencyRound(stateWithSim);
    const allUserMarkets = (stateWithSim.faBidding?.markets ?? []).filter((m: any) => m.bids?.some((b: any) => b.isUserBid));
    const userMarketIds = new Set(
        allUserMarkets
            .filter((m: any) => !m.resolved && m.bids?.some((b: any) => b.isUserBid && b.status === 'active'))
            .map((m: any) => m.playerId),
    );

    if (rawSignings.length > 0 && allUserMarkets.length > 0) {
        console.log(`[FA-DIAG] FA round produced ${rawSignings.length} signings. User has ${allUserMarkets.length} bid markets. Active-user-bid IDs:`, [...userMarketIds]);
        for (const m of allUserMarkets) {
            const userBid = m.bids?.find((b: any) => b.isUserBid);
            console.log(`[FA-DIAG]   market for ${m.playerName ?? m.playerId}: resolved=${m.resolved}, userBidStatus=${userBid?.status}, decidesOnDay=${m.decidesOnDay}`);
        }
        for (const s of rawSignings) {
            if (allUserMarkets.some((m: any) => m.playerId === s.playerId)) {
                console.error(`[FA-DIAG]   ⚠️ AI signing of ${s.playerName} → ${s.teamName} matches a user market (resolved or not). Investigate why.`);
            }
        }
    }

    const seenSignIds = new Set<string>();
    const signings = rawSignings.filter(s => {
        if (userMarketIds.has(s.playerId)) {
            console.error(`[FA-LEAK-GUARD] Dropped AI signing of ${s.playerName} → ${s.teamName} — user has an open bid. runAIFreeAgencyRound's pool snapshot was stale.`);
            return false;
        }
        if (seenSignIds.has(s.playerId)) return false;
        seenSignIds.add(s.playerId);
        return true;
    });
    if (signings.length === 0) return stateWithSim;

    let nextState: GameState = {
        ...stateWithSim,
        players: stateWithSim.players.map(p => {
            const signing = signings.find(s => s.playerId === p.internalId);
            if (!signing) return p;
            const firstYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
            const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => seasonLabelToYear(cy.season) < firstYear);
            const newContractYears = Array.from({ length: signing.contractYears }, (_, i) => {
                const yr = firstYear + i;
                return {
                    season: `${yr - 1}-${String(yr).slice(-2)}`,
                    guaranteed: (signing as any).nonGuaranteed ? 0 : Math.round(signing.salaryUSD * Math.pow(1.05, i)),
                    option: i === signing.contractYears - 1 && signing.hasPlayerOption ? 'Player' : '',
                };
            });
            const isAfterMarchDeadline = (simMonth === 3 && simDayNum >= 1) || simMonth > 3;
            const isReSign = (p as any).tid === signing.teamId;
            const prevSalaryUSDFirstYear = (Number((p as any).contract?.amount) || 0) * 1_000;
            const minUSD = ((stateWithSim.leagueStats?.minContractStaticAmount as number | undefined) ?? 1.273) * 1_000_000;
            return clearWaiverMarkers({
                ...p,
                tid: signing.teamId,
                status: 'Active' as const,
                contract: {
                    amount: Math.round(signing.salaryUSD / 1_000),
                    exp: signing.contractExp,
                    hasPlayerOption: signing.hasPlayerOption,
                },
                contractYears: [...historicalYears, ...newContractYears],
                playoffEligible: isAfterMarchDeadline ? false : undefined,
                signedDate: stateWithSim.date,
                tradeEligibleDate: computeTradeEligibleDate({
                    signingDate: stateWithSim.date,
                    contractYears: signing.contractYears,
                    salaryUSDFirstYear: signing.salaryUSD,
                    prevSalaryUSDFirstYear,
                    usedBirdRights: isReSign,
                    isReSign,
                    isMinimum: signing.salaryUSD <= minUSD * 1.01,
                    isTwoWay: !!(signing as any).twoWay,
                    leagueStats: stateWithSim.leagueStats as any,
                }),
                ...((signing as any).twoWay ? { twoWay: true } : {}),
                ...((signing as any).nonGuaranteed ? { nonGuaranteed: true } : {}),
                ...(signing.mleTypeUsed ? { mleSignedVia: signing.mleTypeUsed } : {}),
            });
        }),
    };

    const faDateStr = formatGameDateShort(nextState.date);
    const faIsoDate = parseGameDate(nextState.date).toISOString().slice(0, 10);
    const faHistoryEntries = signings.map(s => {
        const annualM = Math.round(s.salaryUSD / 100_000) / 10;
        const totalRaw = annualM * (s.contractYears ?? 1);
        const totalStr = totalRaw < 1 ? totalRaw.toFixed(1) : Math.round(totalRaw).toString();
        const optTag = s.hasPlayerOption ? ' (player option)' : '';
        const twoWayTag = (s as any).twoWay ? ' (two-way)' : '';
        const ngTag = (s as any).nonGuaranteed ? ' (non-guaranteed)' : '';
        return {
            text: `${s.playerName} signs with the ${s.teamName}: $${totalStr}M/${s.contractYears ?? 1}yr${optTag}${twoWayTag}${ngTag}`,
            date: faDateStr,
            type: 'Signing',
            playerIds: [s.playerId],
            tid: s.teamId,
        };
    });
    const faNewsItems = signings.map(s => {
        const annualM = Math.round(s.salaryUSD / 100_000) / 10;
        const totalM = Math.round(annualM * (s.contractYears ?? 1));
        const optTag = s.hasPlayerOption ? ' (player option)' : '';
        const isMax = annualM >= 30;
        const insider = getInsiderHandle(nextState.leagueType);
        const woj = getInsiderWoj(nextState.leagueType);
        return {
            id: `fa-signing-${s.playerId}-${faIsoDate}`,
            headline: isMax ? `${s.playerName} Lands Max Deal with ${s.teamName}` : `${s.playerName} Signs with ${s.teamName}`,
            content: `${s.playerName} has agreed to a ${s.contractYears ?? 1}-year, $${totalM}M deal with the ${s.teamName}${optTag}. ${isMax ? `Sources: ${insider.name}.` : `Sources: ${woj.name}.`}`,
            date: faIsoDate,
            type: 'transaction',
            read: false,
            isNew: true,
        };
    });
    const mleSignings = signings.filter(s => s.mleTypeUsed);
    const updatedMleUsage = { ...((nextState.leagueStats as any).mleUsage ?? {}) };
    for (const s of mleSignings) {
        updatedMleUsage[s.teamId] = {
            type: s.mleTypeUsed,
            usedUSD: (updatedMleUsage[s.teamId]?.usedUSD ?? 0) + (s.mleAmountUSD ?? s.salaryUSD),
        };
    }
    const shamsFATransactions: any[] = [];
    const faInsider = getInsiderHandle(nextState.leagueType);
    for (const s of signings) {
        const player = nextState.players.find(p => p.internalId === s.playerId);
        if (!player) continue;
        const lr = (player as any).ratings?.[(player as any).ratings?.length - 1];
        const k2 = convertTo2KRating(player.overallRating ?? 0, lr?.hgt ?? 50, lr?.tp);
        if (k2 < 78) continue;
        const content = buildShamsTransactionPost({
            type: 'signing',
            playerName: s.playerName,
            teamName: s.teamName,
            amount: Math.round(s.salaryUSD / 100_000) / 10,
            years: s.contractYears ?? 1,
            hasPlayerOption: s.hasPlayerOption,
        });
        if (!content) continue;
        const engagement = calculateSocialEngagement(faInsider.atHandle, content, player.overallRating);
        const shamsPhoto = findShamsPhoto(player.name, s.teamName);
        shamsFATransactions.push({
            id: `shams-fa-${s.playerId}-${Date.now()}-${Math.random()}`,
            author: faInsider.name,
            handle: faInsider.atHandle,
            content,
            date: new Date(nextState.date).toISOString(),
            likes: engagement.likes,
            retweets: engagement.retweets,
            source: 'TwitterX' as const,
            isNew: true,
            playerPortraitUrl: player.imgURL,
            ...(shamsPhoto ? { mediaUrl: shamsPhoto.image_url } : {}),
        });
    }

    nextState = {
        ...nextState,
        leagueStats: mleSignings.length > 0 ? { ...nextState.leagueStats, mleUsage: updatedMleUsage } : nextState.leagueStats,
        history: [...(nextState.history ?? []), ...faHistoryEntries],
        news: faNewsItems.length > 0 ? [...faNewsItems, ...(nextState.news ?? [])] : (nextState.news ?? []),
        socialFeed: shamsFATransactions.length > 0
            ? [...shamsFATransactions, ...(nextState.socialFeed ?? [])].slice(0, 500)
            : (nextState.socialFeed ?? []),
    };
    return normalizeReservedJerseys(nextState, signings.map(s => s.teamId));
}
function applyMleSwapPass(stateWithSim: GameState): GameState {
    const simDateNorm = parseGameDate(stateWithSim.date);
    const simMonth = simDateNorm.getUTCMonth() + 1;
    const simDayNum = simDateNorm.getUTCDate();
    const rawMleSwaps = runAIMleUpgradeSwaps(stateWithSim, simMonth, simDayNum);
    const userMarketIds = new Set(
        (stateWithSim.faBidding?.markets ?? [])
            .filter((m: any) => !m.resolved && m.bids?.some((b: any) => b.isUserBid && b.status === 'active'))
            .map((m: any) => m.playerId),
    );
    const seenSignIds = new Set<string>();
    const mleSwaps = rawMleSwaps.filter(sw => {
        if (userMarketIds.has(sw.sign.playerId)) {
            console.error(`[FA-LEAK-GUARD] Dropped MLE swap signing of ${sw.sign.playerName} → ${sw.sign.teamName} — user has an open bid.`);
            return false;
        }
        if (seenSignIds.has(sw.sign.playerId)) return false;
        seenSignIds.add(sw.sign.playerId);
        return true;
    });
    if (mleSwaps.length === 0) return stateWithSim;

    const swapDateStr = formatGameDateShort(stateWithSim.date);
    const currentSeasonYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    let updatedPlayers = [...stateWithSim.players];
    const swapHistory: any[] = [];
    const swapMleUsage = { ...((stateWithSim.leagueStats as any).mleUsage ?? {}) };

    for (const swap of mleSwaps) {
        const { sign: s, waive: w } = swap;
        updatedPlayers = updatedPlayers.map(p => {
            if (p.internalId !== s.playerId) return p;
            const firstYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
            const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => seasonLabelToYear(cy.season) < firstYear);
            const newContractYears = Array.from({ length: s.contractYears }, (_, i) => ({
                season: `${firstYear + i - 1}-${String(firstYear + i).slice(-2)}`,
                guaranteed: Math.round(s.salaryUSD * Math.pow(1.05, i)),
                option: i === s.contractYears - 1 && s.hasPlayerOption ? 'Player' : '',
            }));
            return clearWaiverMarkers({
                ...p,
                tid: s.teamId,
                status: 'Active' as const,
                contract: { amount: Math.round(s.salaryUSD / 1_000), exp: s.contractExp, hasPlayerOption: s.hasPlayerOption },
                contractYears: [...historicalYears, ...newContractYears],
                signedDate: stateWithSim.date,
                tradeEligibleDate: computeTradeEligibleDate({
                    signingDate: stateWithSim.date,
                    contractYears: s.contractYears,
                    salaryUSDFirstYear: s.salaryUSD,
                    isReSign: false,
                    leagueStats: stateWithSim.leagueStats as any,
                }),
                mleSignedVia: s.mleTypeUsed,
            });
        });
        updatedPlayers = updatedPlayers.map(p =>
            p.internalId === w.playerId
                ? releaseToFreeAgency(p, w.teamId, stateWithSim.date, currentSeasonYear)
                : p,
        );
        const annualM = Math.round(s.salaryUSD / 100_000) / 10;
        const totalM = Math.round(annualM * (s.contractYears ?? 1));
        swapHistory.push(
            { text: `${s.playerName} signs with the ${s.teamName}: $${totalM}M/${s.contractYears ?? 1}yr (MLE)`, date: swapDateStr, type: 'Signing', playerIds: [s.playerId], tid: s.teamId },
            { text: `${w.playerName} waived by the ${w.teamName}`, date: swapDateStr, type: 'Waiver', playerIds: [w.playerId], tid: w.teamId },
        );
        swapMleUsage[s.teamId] = {
            type: s.mleTypeUsed,
            usedUSD: (swapMleUsage[s.teamId]?.usedUSD ?? 0) + (s.mleAmountUSD ?? s.salaryUSD),
        };
    }

    return normalizeReservedJerseys({
        ...stateWithSim,
        players: updatedPlayers,
        history: [...(stateWithSim.history ?? []), ...swapHistory],
        leagueStats: { ...stateWithSim.leagueStats, mleUsage: swapMleUsage },
    }, mleSwaps.map(s => s.sign.teamId));
}
export function applyAIFreeAgencyPass(
    stateWithSim: GameState,
    offseasonPlan: any,
    simMonth: number,
    simDayNum: number,
): GameState {
    if (offseasonPlan.actions.runAIFAPass !== 'fire') return stateWithSim;
    console.log(`[OSPLAN] simulationHandler.runAIFAPass fire date=${stateWithSim.date} freq=${offseasonPlan.faFrequency} underMin=${offseasonPlan.flags.underMinRoster}`);
    let nextState = applyTwoWayPromotions(stateWithSim, simMonth);
    nextState = applyRosterTrimPass(nextState, simMonth, simDayNum);
    nextState = applyEarlyNGKeeperPass(nextState, simMonth, simDayNum);
    nextState = applyRosterReminderMessages(nextState, simMonth, simDayNum);
    nextState = applyOpenMarketSignings(nextState, simMonth, simDayNum);
    return applyMleSwapPass(nextState);
}
