import { DeadMoneyEntry, GameState, NBAPlayer as Player } from '../../../../types';
import { autoPromoteTwoWayExcess, autoTrimOversizedRosters, runAIFreeAgencyRound, runAIMleUpgradeSwaps, runEuroAIFreeAgencyRound } from '../../../../services/AIFreeAgentHandler';
import { buildShamsTransactionPost } from '../../../../services/social/templates/charania';
import { findShamsPhoto } from '../../../../services/social/charaniaphotos';
import { getInsiderHandle } from '../../../../data/social/handles';
import {
    buildStretchedSchedule,
    consumeBiannualException,
    formatContractTotalUSD,
    formatContractUSD,
    getCapThresholds,
    getContractLimits,
    getTeamPayrollUSD,
    recordTeamCapSpaceUse,
    seasonLabelToYear,
} from '../../../../utils/salaryUtils';
import { convertTo2KRating, calculateSocialEngagement, formatCurrencyWithCode } from '../../../../utils/helpers';
import { daysBetweenGameDates, formatGameDateShort, getTradeDeadlineDate, isInFreeAgencyWindow, parseGameDate, toISODateString } from '../../../../utils/dateUtils';
import { computeTradeEligibleDate } from '../../../../utils/signingMoratorium';
import { clearWaiverMarkers, stripLiveContractAfterWaive } from '../../../../utils/contractCleanup';
import { isTwoWayContract, withPlayerContractType } from '../../../../utils/contractTypes';
import { getTwoWayRosterLimit } from '../../../../utils/rosterLimits';
import { appendPlayerTransaction } from '../../../../utils/playerBirdRights';
import { pushCoachMessage } from './coachMessages';
import { normalizeReservedJerseys } from './playoffPipeline';
import { isDeadMoneyEnabled, isStretchProvisionEnabled } from '../../../../utils/ruleFlags';
import { isNbaBackgroundEconomyMode, withNbaBackgroundEconomy } from '../../../../services/freeAgency/aiFreeAgencyHelpers';
import { getPrimaryInsiderKey, isTwitterAvailable } from '../../../../utils/mediaTimeline';
import { postClubTransaction } from '../../../../services/tycoon/clubFinance';
import { getLeagueCalendarDates, getLeagueSeasonForDate, isLeagueTrainingCampWindow } from '../../../../services/leagueCalendar';
import { getTeamFullName } from '../../../../utils/teamNames';
import type { CentralFreeAgencyCadence } from '../../../../services/freeAgency/freeAgencyDecisionTiming';
import { simDebug } from '../../../../utils/simDebug';
import { getSimulationSeed } from '../../../../services/saveIdentity';
import { withDeterministicRandom } from '../../../../services/simulation/deterministicRandom';
import { maybeAppendCommissionerAspireCase } from '../../../../services/aspireSideDeals';
import {
    areWnbaDevelopmentalContractsEnabled,
    getWnbaDevelopmentalBaseStipendUSD,
    getWnbaDevelopmentalContractLabel,
} from '../../../../services/wnba/developmentalContracts';
function releaseToFreeAgency(player: Player, teamId: number, date: string, currentSeasonYear: number): Player {
    const cleanPlayer = stripLiveContractAfterWaive(player, currentSeasonYear);
    return {
        ...cleanPlayer,
        tid: -1,
        status: 'Free Agent' as const,
        gLeagueAssigned: false,
        mleSignedVia: undefined,
        baeSignedVia: undefined,
        hasBirdRights: false,
        superMaxEligible: false,
        yearsWithTeam: 0,
        transactions: appendPlayerTransaction(player, { season: currentSeasonYear, tid: -1, type: 'waive' }),
        recentlyWaivedBy: teamId,
        recentlyWaivedDate: date,
        signedDate: undefined,
        tradeEligibleDate: undefined,
        developmentalContract: undefined,
        developmentalGamesPlayed: undefined,
        developmentalContractSeason: undefined,
    } as unknown as Player;
}
function applyTwoWayPromotions(stateWithSim: GameState, simMonth: number): GameState {
    const promotions = autoPromoteTwoWayExcess(stateWithSim, simMonth);
    if (promotions.length === 0) return stateWithSim;
    const promotionMap = new Map(promotions.map(pr => [pr.playerId, pr] as const));
    const firstYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    const secondaryLabel = getWnbaDevelopmentalContractLabel(stateWithSim.leagueStats).toLowerCase();
    const nextState: GameState = {
        ...stateWithSim,
        players: stateWithSim.players.map(p => {
            const pr = promotionMap.get(p.internalId);
            if (!pr) return p;
            const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => seasonLabelToYear(cy.season) < firstYear);
            return {
                ...p,
                ...withPlayerContractType({
                    contract: { amount: Math.round(pr.newSalaryUSD / 1_000), exp: pr.contractExp, hasPlayerOption: false },
                }, 'guaranteed'),
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
                text: `${pr.playerName} has been promoted from ${secondaryLabel} to a standard contract by the ${pr.teamName}: ${formatContractUSD(pr.newSalaryUSD)}/1yr`,
                date: stateWithSim.date,
                type: 'Signing',
                playerIds: [pr.playerId],
                tid: pr.teamId,
            })),
        ],
    };
    simDebug('free-agency', () => `[TwoWayPromotion] Applied ${promotions.length} promotions`, { promotions: promotions.length });
    return nextState;
}
export function applyRosterTrimPass(
    stateWithSim: GameState,
    simMonth: number,
    simDayNum: number,
    includeDerivedMedia = true,
): GameState {
    simDebug('roster-trim', () => (
      `[RosterTrim] Calling autoTrimOversizedRosters: simMonth=${simMonth}, date=${stateWithSim.date}, day=${stateWithSim.day}`
    ), { simMonth, date: stateWithSim.date, day: stateWithSim.day });
    const trimRulesState = withNbaBackgroundEconomy(stateWithSim);
    const trimLeagueStats = trimRulesState.leagueStats;
    const waivers = autoTrimOversizedRosters(stateWithSim, simMonth, simDayNum);
    simDebug('roster-trim', () => `[RosterTrim] Month=${simMonth}, trimmed=${waivers.length} players`, { trimmed: waivers.length });
    if (waivers.length === 0) return stateWithSim;

    const waiverInfo = new Map(waivers.map(w => [w.playerId, w] as const));
    const lsForDeadMoney = trimLeagueStats as any;
    const deadMoneyEnabled = isDeadMoneyEnabled(lsForDeadMoney);
    const stretchEnabled: boolean = isStretchProvisionEnabled(lsForDeadMoney);
    const stretchMult: number = lsForDeadMoney.stretchProvisionMultiplier ?? 2;
    const stretchedCapPct: number = lsForDeadMoney.stretchedDeadMoneyCapPct ?? 15;
    const salaryCapUSD: number = Number(lsForDeadMoney.salaryCap) > 0
        ? Number(lsForDeadMoney.salaryCap)
        : Number(lsForDeadMoney.historicalContractScaleCap ?? 140_000_000);
    const stretchAmountFloorUSD = salaryCapUSD * 0.06;
    const currentSeasonYear: number = lsForDeadMoney.year ?? new Date(stateWithSim.date ?? Date.now()).getUTCFullYear();
    const DEAD_MONEY_FLOOR_USD = 50_000;
    const twoWayActiveForDeadMoney = getTwoWayRosterLimit(trimLeagueStats as any) > 0;
    const isActiveTwoWayForDeadMoney = (playerRecord: any): boolean =>
        twoWayActiveForDeadMoney && isTwoWayContract(playerRecord, trimLeagueStats);
    const teamDeadMoneyAdds = new Map<number, DeadMoneyEntry[]>();

    if (deadMoneyEnabled) {
        for (const w of waivers) {
            if (w.wasNonGuaranteed) continue;
            const playerRecord: any = stateWithSim.players.find(p => p.internalId === w.playerId);
            if (!playerRecord || isActiveTwoWayForDeadMoney(playerRecord)) continue;
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
    const isOffseasonWaiveWindow = isInFreeAgencyWindow(
        stateWithSim.date,
        trimLeagueStats.year,
        trimLeagueStats,
        trimRulesState.schedule as any,
    ) || isLeagueTrainingCampWindow(stateWithSim.date, trimLeagueStats);
    const highOvrWaiveNews = includeDerivedMedia && isOffseasonWaiveWindow
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
        news: includeDerivedMedia && highOvrWaiveNews.length > 0
            ? [...highOvrWaiveNews, ...(stateWithSim.news ?? [])].slice(0, 200) as any
            : stateWithSim.news,
    };
}
function applyEarlyNGKeeperPass(stateWithSim: GameState): GameState {
    const ngRulesState = withNbaBackgroundEconomy(stateWithSim);
    if (ngRulesState.leagueStats?.nonGuaranteedContractsEnabled === false) return stateWithSim;
    const season = getLeagueSeasonForDate(stateWithSim.date, ngRulesState.leagueStats) || ngRulesState.leagueStats.year;
    const calendar = getLeagueCalendarDates(season, ngRulesState.leagueStats);
    if (!calendar.nonGuaranteedGuaranteeDate) return stateWithSim;
    const currentDate = parseGameDate(stateWithSim.date);
    if (currentDate < calendar.regularSeasonStart || currentDate >= calendar.nonGuaranteedGuaranteeDate) return stateWithSim;
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
                text: `${p.name}'s contract guaranteed early by the ${stateWithSim.teams.find(t => t.id === p.tid) ? getTeamFullName(stateWithSim.teams.find(t => t.id === p.tid)!) : 'team'}`,
                date: stateWithSim.date,
                type: 'NG Guaranteed',
                playerIds: [p.internalId],
            })),
        ],
    };
}
function applyRosterReminderMessages(stateWithSim: GameState): GameState {
    let nextState = stateWithSim;
    const season = getLeagueSeasonForDate(stateWithSim.date, stateWithSim.leagueStats) || stateWithSim.leagueStats.year;
    const dates = getLeagueCalendarDates(season, stateWithSim.leagueStats);
    const deadline = getTradeDeadlineDate(season, stateWithSim.leagueStats);
    if (daysBetweenGameDates(stateWithSim.date, deadline) === 3) {
        nextState = pushCoachMessage(nextState, 'Boss, trade deadline is in 3 days. This is our last window—let me know if you want to make any moves.');
    }
    if (daysBetweenGameDates(stateWithSim.date, dates.playoffStart) !== 14) return nextState;
    const hasPrevPlayoffMsg = (nextState.chats || []).some(c => c.messages.some(m => m.text.includes('lock in our playoff')));
    if (hasPrevPlayoffMsg) return nextState;
    const twoWayActive = getTwoWayRosterLimit(nextState.leagueStats as any) > 0;
    const ngActive = nextState.leagueStats?.nonGuaranteedContractsEnabled !== false;
    const twoWayCount = twoWayActive
        ? nextState.players.filter(p =>
            p.tid === nextState.userTeamId &&
            isTwoWayContract(p, nextState.leagueStats) &&
            p.status === 'Active',
        ).length
        : 0;
    const ngCount = ngActive ? nextState.players.filter(p => p.tid === nextState.userTeamId && (p as any).nonGuaranteed && p.status === 'Active').length : 0;
    let msg = 'Boss, we need to finalize our playoff roster. ';
    if (ngCount > 0) msg += `We've got ${ngCount} non-guaranteed player(s) who should be locked in before postseason. `;
    if (twoWayCount > 0 && !areWnbaDevelopmentalContractsEnabled(nextState.leagueStats)) msg += `Also, our two-way guys can't play in the playoffs—we should convert or release them before game 1.`;
    else if (ngCount === 0) msg += `Let's make sure we're ready for the playoffs.`;
    return pushCoachMessage(nextState, msg);
}
function applyOpenMarketSignings(
    stateWithSim: GameState,
    centralCadence?: CentralFreeAgencyCadence,
    includeDerivedMedia = true,
): GameState {
    const signingRulesState = withNbaBackgroundEconomy(stateWithSim);
    const signingLeagueStats = signingRulesState.leagueStats;
    const signingSeason = getLeagueSeasonForDate(stateWithSim.date, signingLeagueStats) || signingLeagueStats.year;
    const playoffEligibilityDeadline = getLeagueCalendarDates(signingSeason, signingLeagueStats).playoffEligibilityDeadline;
    const isPastPlayoffEligibilityDeadline = !!playoffEligibilityDeadline
        && toISODateString(parseGameDate(stateWithSim.date)) >= toISODateString(playoffEligibilityDeadline);
    const euroSignings = runEuroAIFreeAgencyRound(stateWithSim);
    const euroSigningByPlayer = new Map(euroSignings.map(signing => [signing.playerId, signing] as const));
    const nbaSigningState = euroSignings.length > 0
        ? {
            ...stateWithSim,
            players: stateWithSim.players.map(player => {
                const signing = euroSigningByPlayer.get(player.internalId);
                return signing ? { ...player, tid: signing.teamId, status: signing.leagueStatus as Player['status'] } : player;
            }),
        }
        : stateWithSim;
    // AI roster-fill uses probabilistic GM work-ethic gates. Keep those exact
    // probabilities, but bind their entropy to the basketball day rather than
    // whichever lazy-sim batch happens to contain it.
    const aiFreeAgencySeed = [
        getSimulationSeed(nbaSigningState),
        signingSeason,
        toISODateString(parseGameDate(stateWithSim.date)),
        'ai-free-agency-round',
    ].join(':');
    const roundNbaSignings = withDeterministicRandom(
        aiFreeAgencySeed,
        () => runAIFreeAgencyRound(nbaSigningState, centralCadence),
    );
    const rawSignings = [...euroSignings, ...roundNbaSignings];
    const allUserMarkets = (stateWithSim.faBidding?.markets ?? []).filter((m: any) => m.bids?.some((b: any) => b.isUserBid));
    const userMarketIds = new Set(
        allUserMarkets
            .filter((m: any) => !m.resolved && m.bids?.some((b: any) => b.isUserBid && b.status === 'active'))
            .map((m: any) => m.playerId),
    );

    if (rawSignings.length > 0 && allUserMarkets.length > 0) {
        simDebug('free-agency', () => (
          `[FA-DIAG] FA round produced ${rawSignings.length} signings. User has ${allUserMarkets.length} bid markets. Active user bids=${userMarketIds.size}`
        ));
        for (const m of allUserMarkets) {
            const userBid = m.bids?.find((b: any) => b.isUserBid);
            simDebug('free-agency', () => (
              `[FA-DIAG] market for ${m.playerName ?? m.playerId}: resolved=${m.resolved}, userBidStatus=${userBid?.status}, decidesOnDay=${m.decidesOnDay}`
            ), { playerId: m.playerId });
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

    const twoWayContractsActiveForSignings = getTwoWayRosterLimit(signingLeagueStats as any) > 0;
    let nextState: GameState = {
        ...stateWithSim,
        players: stateWithSim.players.map(p => {
            const signing = signings.find(s => s.playerId === p.internalId);
            if (!signing) return p;
            const isEuroSigning = !!signing.leagueStatus;
            const contractRules = isEuroSigning ? stateWithSim.leagueStats : signingLeagueStats;
            const firstYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
            const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => seasonLabelToYear(cy.season) < firstYear);
            const finalIsNonGuaranteed = !isEuroSigning && signingLeagueStats?.nonGuaranteedContractsEnabled !== false && !!(signing as any).nonGuaranteed;
            const finalIsTwoWay = !isEuroSigning && twoWayContractsActiveForSignings && !!(signing as any).twoWay;
            const finalIsDevelopmental = finalIsTwoWay && areWnbaDevelopmentalContractsEnabled(signingLeagueStats);
            const finalAnnualSalaryUSD = finalIsDevelopmental
                ? getWnbaDevelopmentalBaseStipendUSD(signingLeagueStats)
                : signing.salaryUSD;
            const newContractYears = Array.from({ length: signing.contractYears }, (_, i) => {
                const yr = firstYear + i;
                return {
                    season: `${yr - 1}-${String(yr).slice(-2)}`,
                    guaranteed: finalIsNonGuaranteed ? 0 : Math.round(finalAnnualSalaryUSD * Math.pow(1.05, i)),
                    option: finalIsDevelopmental ? 'developmental' : finalIsTwoWay ? 'twoWay' : i === signing.contractYears - 1 && signing.hasPlayerOption ? 'Player' : '',
                    ...(i === 0 && (signing.signingBonusEUR ?? 0) > 0 ? { signingBonusEUR: signing.signingBonusEUR } : {}),
                };
            });
            const isReSign = (p as any).tid === signing.teamId;
            const prevSalaryUSDFirstYear = (Number((p as any).contract?.amount) || 0) * 1_000;
            const minUSD = getContractLimits(p as any, contractRules as any).minSalaryUSD;
            const finalHasPlayerOption = !isEuroSigning && signingLeagueStats?.playerOptionsEnabled !== false && signing.hasPlayerOption;
            return clearWaiverMarkers({
                ...p,
                tid: signing.teamId,
                status: (signing.leagueStatus ?? (signingLeagueStats?.uiMode === 'wnba_isolated' ? 'WNBA' : 'Active')) as Player['status'],
                contract: {
                    amount: Math.round(finalAnnualSalaryUSD / 1_000),
                    exp: signing.contractExp,
                    hasPlayerOption: finalHasPlayerOption,
                    ...((signing.signingBonusEUR ?? 0) > 0 ? { signingBonusEUR: signing.signingBonusEUR } : {}),
                    ...(finalIsTwoWay ? { type: finalIsDevelopmental ? 'DEVELOPMENTAL' : 'TWO_WAY' } : {}),
                },
                contractYears: [
                    ...historicalYears,
                    ...newContractYears.map(year => finalHasPlayerOption || finalIsTwoWay ? year : { ...year, option: '' }),
                ],
                playoffEligible: !isEuroSigning && isPastPlayoffEligibilityDeadline ? false : undefined,
                signedDate: stateWithSim.date,
                tradeEligibleDate: computeTradeEligibleDate({
                    signingDate: stateWithSim.date,
                    contractYears: signing.contractYears,
                    salaryUSDFirstYear: finalAnnualSalaryUSD,
                    prevSalaryUSDFirstYear,
                    usedBirdRights: isReSign,
                    isReSign,
                    isMinimum: finalAnnualSalaryUSD <= minUSD * 1.01,
                    isTwoWay: finalIsTwoWay,
                    leagueStats: contractRules as any,
                }),
                transactions: appendPlayerTransaction(p, { season: firstYear, tid: signing.teamId, type: 'freeAgent' }),
                twoWay: finalIsTwoWay && !finalIsDevelopmental,
                developmentalContract: finalIsDevelopmental || undefined,
                developmentalGamesPlayed: finalIsDevelopmental ? 0 : undefined,
                developmentalContractSeason: finalIsDevelopmental ? firstYear : undefined,
                nonGuaranteed: finalIsNonGuaranteed,
                mleSignedVia: signing.mleTypeUsed ?? undefined,
                baeSignedVia: (signing.baeAmountUSD ?? 0) > 0 || undefined,
            });
        }),
    };

    const euroBonusSignings = signings.filter(signing => !!signing.leagueStatus && (signing.signingBonusEUR ?? 0) > 0);
    if (euroBonusSignings.length > 0) {
        nextState = {
            ...nextState,
            nonNBATeams: nextState.nonNBATeams.map(team => {
                const teamSignings = euroBonusSignings.filter(signing => signing.teamId === team.tid);
                if (teamSignings.length === 0 || !team.tycoon) return team;
                const tycoon = { ...team.tycoon, transactions: [...(team.tycoon.transactions ?? [])] };
                for (const signing of teamSignings) {
                    postClubTransaction(tycoon, {
                        sourceId: `ai-player-signing-bonus:${team.tid}:${signing.playerId}:${nextState.date}`,
                        date: nextState.date,
                        season: nextState.leagueStats.year,
                        category: 'wages',
                        label: `${signing.playerName} signing bonus`,
                        amountEUR: -(signing.signingBonusEUR ?? 0),
                        playerId: signing.playerId,
                    });
                }
                return { ...team, tycoon };
            }),
        };
    }

    const faDateStr = formatGameDateShort(nextState.date);
    const faIsoDate = parseGameDate(nextState.date).toISOString().slice(0, 10);
    const faHistoryEntries = signings.map(s => {
        const totalValue = s.leagueStatus
            ? formatCurrencyWithCode(s.salaryUSD * (s.contractYears ?? 1), 'EUR', false)
            : formatContractTotalUSD(s.salaryUSD, s.contractYears ?? 1);
        const bonusTag = (s.signingBonusEUR ?? 0) > 0
            ? ` + ${formatCurrencyWithCode(s.signingBonusEUR ?? 0, 'EUR', false)} signing bonus`
            : '';
        const optTag = signingLeagueStats?.playerOptionsEnabled !== false && s.hasPlayerOption ? ' (player option)' : '';
        const twoWayTag = twoWayContractsActiveForSignings && (s as any).twoWay
            ? areWnbaDevelopmentalContractsEnabled(signingLeagueStats) ? ' (developmental)' : ' (two-way)'
            : '';
        const ngTag = signingLeagueStats?.nonGuaranteedContractsEnabled !== false && (s as any).nonGuaranteed ? ' (non-guaranteed)' : '';
        const baeTag = (s.baeAmountUSD ?? 0) > 0 ? ' (bi-annual exception)' : '';
        return {
            text: `${s.playerName} signs with ${s.teamName}: ${totalValue}/${s.contractYears ?? 1}yr${optTag}${twoWayTag}${ngTag}${baeTag}${bonusTag}`,
            date: faDateStr,
            type: 'Signing',
            playerIds: [s.playerId],
            tid: s.teamId,
        };
    });
    const faNewsItems = includeDerivedMedia ? signings.map(s => {
        const annualM = Math.round(s.salaryUSD / 100_000) / 10;
        const totalValue = s.leagueStatus
            ? formatCurrencyWithCode(s.salaryUSD * (s.contractYears ?? 1), 'EUR', false)
            : formatContractTotalUSD(s.salaryUSD, s.contractYears ?? 1);
        const bonusText = (s.signingBonusEUR ?? 0) > 0
            ? ` plus a ${formatCurrencyWithCode(s.signingBonusEUR ?? 0, 'EUR', false)} signing bonus`
            : '';
        const optTag = signingLeagueStats?.playerOptionsEnabled !== false && s.hasPlayerOption ? ' (player option)' : '';
        const isMax = annualM >= 30;
        const insider = getInsiderHandle(nextState.leagueType, nextState.date, nextState.leagueStats?.year, nextState.leagueStats?.uiMode);
        return {
            id: `fa-signing-${s.playerId}-${faIsoDate}`,
            headline: isMax ? `${s.playerName} Lands Max Deal with ${s.teamName}` : `${s.playerName} Signs with ${s.teamName}`,
            content: `${s.playerName} has agreed to a ${s.contractYears ?? 1}-year, ${totalValue} deal with ${s.teamName}${optTag}${bonusText}. Sources: ${insider.name}.`,
            date: faIsoDate,
            type: 'transaction',
            read: false,
            isNew: true,
        };
    }) : [];
    const mleSignings = signings.filter(s => s.mleTypeUsed);
    const backgroundNbaEconomyMode = isNbaBackgroundEconomyMode(nextState.leagueStats);
    const updatedMleUsage = {
        ...((backgroundNbaEconomyMode ? (nextState.leagueStats as any).backgroundNbaMleUsage : (nextState.leagueStats as any).mleUsage) ?? {}),
    };
    for (const s of mleSignings) {
        updatedMleUsage[s.teamId] = {
            type: s.mleTypeUsed,
            usedUSD: (updatedMleUsage[s.teamId]?.usedUSD ?? 0) + (s.mleAmountUSD ?? s.salaryUSD),
        };
    }
    const nbaSignings = signings.filter(signing => !signing.leagueStatus);
    let updatedCapExceptionUsage = { ...(signingLeagueStats.capExceptionUsage ?? {}) };
    let exceptionRulesState: GameState['leagueStats'] = {
        ...signingLeagueStats,
        capExceptionUsage: updatedCapExceptionUsage,
    };
    const basePayrollByTeam = new Map<number, number>();
    const roundSpendByTeam = new Map<number, number>();
    const signingThresholds = getCapThresholds(signingLeagueStats);
    let capExceptionUsageChanged = false;
    for (const signing of nbaSignings) {
        if (!basePayrollByTeam.has(signing.teamId)) {
            const signingTeam = signingRulesState.teams.find(team => team.id === signing.teamId);
            basePayrollByTeam.set(
                signing.teamId,
                getTeamPayrollUSD(
                    signingRulesState.players,
                    signing.teamId,
                    signingTeam,
                    signingLeagueStats.year,
                    signingLeagueStats,
                ),
            );
        }
        const payrollBefore = (basePayrollByTeam.get(signing.teamId) ?? 0)
            + (roundSpendByTeam.get(signing.teamId) ?? 0);
        if ((signing.baeAmountUSD ?? 0) > 0) {
            exceptionRulesState = consumeBiannualException(exceptionRulesState, {
                teamId: signing.teamId,
                amountUSD: signing.baeAmountUSD ?? signing.salaryUSD,
                season: signingLeagueStats.year,
                currentDate: nextState.date,
            });
            updatedCapExceptionUsage = exceptionRulesState.capExceptionUsage ?? {};
            capExceptionUsageChanged = true;
        } else if (
            !signing.mleTypeUsed
            && !signing.matchedOfferSheet
            && payrollBefore < signingThresholds.salaryCap
        ) {
            exceptionRulesState = recordTeamCapSpaceUse(
                exceptionRulesState,
                signing.teamId,
                signingLeagueStats.year,
            );
            updatedCapExceptionUsage = exceptionRulesState.capExceptionUsage ?? {};
            capExceptionUsageChanged = true;
        }
        roundSpendByTeam.set(
            signing.teamId,
            (roundSpendByTeam.get(signing.teamId) ?? 0) + signing.salaryUSD,
        );
    }
    const shamsFATransactions: any[] = [];
    const socialAvailable = isTwitterAvailable(nextState.date, nextState.leagueStats?.year);
    const faInsider = getInsiderHandle(nextState.leagueType, nextState.date, nextState.leagueStats?.year, nextState.leagueStats?.uiMode);
    const useShamsMedia = getPrimaryInsiderKey(nextState.date, nextState.leagueStats?.year) === 'shams'
        && nextState.leagueType !== 'fictional'
        && nextState.leagueStats?.uiMode !== 'pba_isolated';
    for (const s of includeDerivedMedia ? signings : []) {
        if (s.leagueStatus) continue;
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
            hasPlayerOption: signingLeagueStats?.playerOptionsEnabled !== false && s.hasPlayerOption,
            mediaContext: nextState.leagueStats?.uiMode === 'pba_isolated' ? 'pba' : 'nba',
        });
        if (!content) continue;
        const engagement = calculateSocialEngagement(faInsider.atHandle, content, player.overallRating);
        if (!socialAvailable) continue;
        const shamsPhoto = useShamsMedia ? findShamsPhoto(player.name, s.teamName) : null;
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
        leagueStats: {
            ...nextState.leagueStats,
            ...(mleSignings.length > 0
                ? backgroundNbaEconomyMode
                    ? { backgroundNbaMleUsage: updatedMleUsage }
                    : { mleUsage: updatedMleUsage }
                : {}),
            ...(capExceptionUsageChanged
                ? backgroundNbaEconomyMode
                    ? { backgroundNbaCapExceptionUsage: updatedCapExceptionUsage }
                    : { capExceptionUsage: updatedCapExceptionUsage }
                : {}),
        },
        history: [...(nextState.history ?? []), ...faHistoryEntries],
        news: faNewsItems.length > 0 ? [...faNewsItems, ...(nextState.news ?? [])] : (nextState.news ?? []),
        socialFeed: shamsFATransactions.length > 0
            ? [...shamsFATransactions, ...(nextState.socialFeed ?? [])].slice(0, 500)
            : (nextState.socialFeed ?? []),
    };
    return normalizeReservedJerseys(
        maybeAppendCommissionerAspireCase(nextState, signings),
        signings.map(s => s.teamId),
    );
}
function applyMleSwapPass(stateWithSim: GameState): GameState {
    const signingRulesState = withNbaBackgroundEconomy(stateWithSim);
    const signingLeagueStats = signingRulesState.leagueStats;
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
    const backgroundNbaEconomyMode = isNbaBackgroundEconomyMode(stateWithSim.leagueStats);
    const swapMleUsage = {
        ...((backgroundNbaEconomyMode ? (stateWithSim.leagueStats as any).backgroundNbaMleUsage : (stateWithSim.leagueStats as any).mleUsage) ?? {}),
    };

    for (const swap of mleSwaps) {
        const { sign: s, waive: w } = swap;
        updatedPlayers = updatedPlayers.map(p => {
            if (p.internalId !== s.playerId) return p;
            const firstYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
            const historicalYears = ((p as any).contractYears ?? []).filter((cy: any) => seasonLabelToYear(cy.season) < firstYear);
            const finalHasPlayerOption = signingLeagueStats?.playerOptionsEnabled !== false && s.hasPlayerOption;
            const newContractYears = Array.from({ length: s.contractYears }, (_, i) => ({
                season: `${firstYear + i - 1}-${String(firstYear + i).slice(-2)}`,
                guaranteed: Math.round(s.salaryUSD * Math.pow(1.05, i)),
                option: i === s.contractYears - 1 && finalHasPlayerOption ? 'Player' : '',
            }));
            return clearWaiverMarkers({
                ...p,
                tid: s.teamId,
                status: 'Active' as const,
                contract: { amount: Math.round(s.salaryUSD / 1_000), exp: s.contractExp, hasPlayerOption: finalHasPlayerOption },
                contractYears: [...historicalYears, ...newContractYears],
                signedDate: stateWithSim.date,
                tradeEligibleDate: computeTradeEligibleDate({
                    signingDate: stateWithSim.date,
                    contractYears: s.contractYears,
                    salaryUSDFirstYear: s.salaryUSD,
                    isReSign: false,
                    leagueStats: signingLeagueStats as any,
                }),
                transactions: appendPlayerTransaction(p, { season: firstYear, tid: s.teamId, type: 'freeAgent' }),
                twoWay: false,
                developmentalContract: undefined,
                developmentalGamesPlayed: undefined,
                developmentalContractSeason: undefined,
                nonGuaranteed: false,
                mleSignedVia: s.mleTypeUsed,
            });
        });
        updatedPlayers = updatedPlayers.map(p =>
            p.internalId === w.playerId
                ? releaseToFreeAgency(p, w.teamId, stateWithSim.date, currentSeasonYear)
                : p,
        );
        const totalValue = formatContractTotalUSD(s.salaryUSD, s.contractYears ?? 1);
        swapHistory.push(
            { text: `${s.playerName} signs with the ${s.teamName}: ${totalValue}/${s.contractYears ?? 1}yr (MLE)`, date: swapDateStr, type: 'Signing', playerIds: [s.playerId], tid: s.teamId },
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
        leagueStats: backgroundNbaEconomyMode
            ? { ...stateWithSim.leagueStats, backgroundNbaMleUsage: swapMleUsage }
            : { ...stateWithSim.leagueStats, mleUsage: swapMleUsage },
    }, mleSwaps.map(s => s.sign.teamId));
}
export function applyAIFreeAgencyPass(
    stateWithSim: GameState,
    offseasonPlan: any,
    simMonth: number,
    simDayNum: number,
    centralCadence?: CentralFreeAgencyCadence,
    includeDerivedMedia = true,
): GameState {
    if (offseasonPlan.actions.runAIFAPass !== 'fire') return stateWithSim;
    simDebug('lifecycle', () => (
      `[OSPLAN] simulationHandler.runAIFAPass fire date=${stateWithSim.date} freq=${offseasonPlan.faFrequency} underMin=${offseasonPlan.flags.underMinRoster}`
    ));
    let nextState = applyTwoWayPromotions(stateWithSim, simMonth);
    nextState = applyRosterTrimPass(nextState, simMonth, simDayNum, includeDerivedMedia);
    nextState = applyEarlyNGKeeperPass(nextState);
    nextState = applyRosterReminderMessages(nextState);
    nextState = applyOpenMarketSignings(nextState, centralCadence, includeDerivedMedia);
    return applyMleSwapPass(nextState);
}
