import { GameState, UserAction, HistoricalStatPoint, NBAPlayer as Player, DraftPick, Game, AllStarPlayer, SeasonHistoryEntry, CelebrityRosterProfile } from '../../types';
import { normalizeDate, extractNbaId, extractTeamId, convertTo2KRating, getLeagueCurrencyCode } from '../../utils/helpers';
import { genMoodTraits } from '../../utils/mood';
import { executeForcedTrade } from '../../services/tradeService';
import { generateSchedule } from '../../services/gameScheduler';
import { generateForCompetition, repairCompetitionSchedules, selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { dateForCompetitionSeason } from '../../services/competition/competitionSeasonState';
import { injectCompetitionPostseasonGames } from '../../services/competition/competitionResolver';
import { tagScheduledCupGroupGames } from '../../services/competition/cup';
import { drawCupGroups } from '../../services/nbaCup/drawGroups';
import { injectCupGroupGames } from '../../services/nbaCup/scheduleInjector';
import { getSimulationSeed } from '../../services/saveIdentity';
import { NBACupState } from '../../types';
import { handleStartGame } from './initialization';
import { handleAnnounceChange } from './announcements';
import { processAction } from './actionProcessor';
import { generatePaychecks, getPaycheckContext } from '../../services/logic/financialService';

// New refactored modules
import { preProcessAction } from './turn/preProcessor';
import { runSimulation } from './turn/simulationHandler';
import { processSimulationResults } from './turn/postProcessor';
import { calculateNewStats } from './turn/statUpdater';
import { handleSocialAndNews } from './turn/socialHandler';
import { generateLazySimNews } from '../../services/news/lazySimNewsGenerator';
import { buildPbaAllStarRosterAnnouncement } from '../../services/news/pbaEcosystemNews';
import { handleCommunication } from './turn/communicationHandler';
import { resolveBets } from '../../services/logic/betResolver';
import { buildAutoResolveEvents } from '../../services/logic/lazySimRunnerHelpers';
import { addGameDays, formatGameDateShort, getDraftDate, getDraftLotteryDate, isDraftBlockedByUnresolvedPlayoffs, parseGameDate, toISODateString } from '../../utils/dateUtils';
import { getSimulationDayCount, isInstantTransactionAction, isSimulationTickAction, shouldFireCalendarEvents } from './simulationActionUtils';
import { usesLegacyNbaCupState } from '../../utils/ruleFlags';
import { applyTradeToPlayer } from '../../utils/playerBirdRights';
import { isEurostashPlayer, transferEurostashRights } from '../../services/freeAgency/eurostashRights';
import { buildTradeHistoryMetadata } from '../../services/trade/tradeHistory';
import { trimPbaOversizedRosters } from '../../services/pba/rosterTrim';
import { applyEuroTycoonDailyOps } from '../../services/tycoon/euroTycoonOps';
import { inferEuroStaffLeagueId, ensureStaffPoolDepth } from '../../services/euro/staffPool';
import { processNBAStaffHiringVacancies } from '../../services/staff/nbaRealStaffSeed';
import { isEuroIsolatedMode, isPbaActiveConferenceMode, isPbaIsolatedMode } from '../../utils/uiMode';
import { applyPbaConferenceLifecycle } from '../../services/pba/conferenceTransition';
import { applySeasonRollover } from '../../services/logic/seasonRollover';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { finalizeHistoricalNbaSeason } from '../../services/historicalNbaSeasonFinalizer';
import { lifecycleAfterSeasonCompletion } from '../../services/lifecycle/leagueSeasonLifecycle';
import { isTwitterAvailable } from '../../utils/mediaTimeline';
import {
    isAllStarGameEnabled,
    isCelebrityGameEnabled,
    isDanceContestEnabled,
    isDunkContestEnabled,
    getRisingStarsTwoTeamNames,
    isRisingStarsEnabled,
    isShootingStarsEnabled,
    isSkillsChallengeEnabled,
    isThreePointContestEnabled,
} from '../../services/allStar/allStarEventAvailability';
import { getPlayersOnCourt } from '../../services/simulation/courtSize';
import {
    applyNativeActionEffectPlan,
    buildNativeActionEffectPlan,
    finalizeNativeActionEffect,
} from '../../services/nativeActionEffects';
import { publishDueNativeAnnouncements } from '../../services/news/nativeLeagueAnnouncements';
import { buildAutomaticGameDiscipline } from '../../services/disciplinePolicy';
import { appendPlayerDisciplineRecord } from '../../services/playerDisciplineHistory';
import { getActiveLeagueTeams, resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { buildContestResultNews } from '../../services/allStar/contestResultNews';
import { getLeagueCalendarDates, getLeagueScheduleReleaseDate } from '../../services/leagueCalendar';
import { consumeAssistantGMDraftEvent, isAssistantGMDraftEventAuthorized } from '../../services/assistantGMFlag';
import { normalizeGameResultScoreIntegrity } from '../../services/simulation/resultIntegrity';
import { withDeterministicRandom } from '../../services/simulation/deterministicRandom';
import { buildAllStarEventSeed, snapshotAllStarParticipants } from '../../services/allStar/allStarDeterminism';
import { materializeAllStarSelectionAwards } from '../../services/allStar/allStarInjuryReplacements';
import { buildAllStarSnubStories } from '../../services/allStar/allStarSnubStories';
import { getDraftSeasonYearForState } from '../../services/offseason/offseasonState';
import {
    isCanonicalDraftComplete,
    resolveLeagueSeasonLifecycle,
} from '../../services/lifecycle/leagueSeasonLifecycle';
import { getManualCalendarEventWindow } from '../../services/lifecycle/eventArrivalPolicy';
import { validateInternationalPreseasonGames } from '../../services/externalLeague/internationalShowcase';
import {
    applyDraftCombineCalendarEvent,
    applyDraftLotteryCalendarEvent,
} from '../../services/lifecycle/calendarEventDisposition';

export { handleStartGame, handleAnnounceChange };

export const processTurn = async (
  state: GameState,
  action: UserAction,
  onSimComplete?: (simResults: any[]) => void,
  onGame?: (result: any) => void
) => {
    let executiveTradeTransactionRef = { current: null };

    // 1. Pre-process roster-altering actions
    let { stateForSim, executiveTradeTransaction, actionBlockReason } = await preProcessAction(state, action);
    if (actionBlockReason) {
        return {
            ...state,
            isProcessing: false,
            lastOutcome: actionBlockReason,
        };
    }
    if (executiveTradeTransaction) {
        executiveTradeTransactionRef.current = executiveTradeTransaction;
    }

    // SIMULATE_TO_DATE fallback: if we're before the saved schedule release with no regular-season schedule,
    // eagerly fire broadcasting/global_games/intl_preseason/schedule_generation so games
    // are in state before the sim loop runs — same preflight as runLazySim.
    if (action.type === 'SIMULATE_TO_DATE') {
        const targetNorm = normalizeDate(action.payload.targetDate);
        const seasonYear = stateForSim.leagueStats.year;
        const eagerCalendar = getLeagueCalendarDates(seasonYear, stateForSim.leagueStats);
        const backgroundSeasonStart = eagerCalendar.regularSeasonStart.toISOString().slice(0, 10);
        const backgroundSeasonEnd = eagerCalendar.regularSeasonEnd.toISOString().slice(0, 10);
        const euroSchedule = isEuroIsolatedMode(stateForSim);
        const hasRegularSeason = stateForSim.schedule.some(
            (g: any) =>
                (euroSchedule
                    ? g.competitionId === stateForSim.euroPrimaryCompetitionId && (g.competitionPhase === 'group' || String(g.competitionPhase ?? '').startsWith('r'))
                    : !g.competitionId) &&
                !g.isPreseason &&
                !g.isPlayoff &&
                !g.isPlayIn &&
                normalizeDate(g.date) >= backgroundSeasonStart &&
                normalizeDate(g.date) <= backgroundSeasonEnd
        );
        if (!hasRegularSeason) {
            const eagerKeys = ['broadcasting_default', 'global_games', 'intl_preseason', 'schedule_generation'];
            const firedEager = new Set<string>();
            for (const event of buildAutoResolveEvents(seasonYear, stateForSim.leagueStats, stateForSim.gameMode)) {
                if (!eagerKeys.includes(event.key)) continue;
                if (event.date >= targetNorm) continue;
                if (firedEager.has(event.key)) continue;
                try {
                    const patch = await event.resolver(stateForSim);
                    if (patch && Object.keys(patch).length > 0) {
                        stateForSim = { ...stateForSim, ...patch };
                    }
                } catch (err) {
                    console.warn(`[processTurn eager] ${event.key} failed:`, err);
                }
                firedEager.add(event.key);
            }
        }
    }

    // 2. Determine days to simulate. Long jump-button flows are routed through
    // lazySim in GameContext; this processTurn fallback must preserve the target
    // date semantics and never silently truncate SIMULATE_TO_DATE.
    const daysToSimulate = getSimulationDayCount(stateForSim, action);

    // 3. Run simulation
    const simStartNorm = normalizeDate(stateForSim.date);
    if (isSimulationTickAction(action)) {
        console.log(`[PROCESS_TURN] ▶️ action=${action.type}, stateForSim.date=${stateForSim.date}, simStartNorm=${simStartNorm}, daysToSimulate=${daysToSimulate}`);
    }
    let { stateWithSim, allSimResults } = await runSimulation(stateForSim, daysToSimulate, action, onGame);
    allSimResults = allSimResults.map(normalizeGameResultScoreIntegrity);
    if (isSimulationTickAction(action)) {
        console.log(`[PROCESS_TURN] ✅ runSimulation returned state.date=${stateWithSim.date}, simResults=${allSimResults.length}`);
    }

    // 3b. Fire any auto-resolve calendar events crossed during this sim batch
    // (All-Star voting, schedule gen, award announcements, etc.)
    // Only for ADVANCE_DAY / SIMULATE_TO_DATE — not for action turns.
    if (shouldFireCalendarEvents(action)) {
        const simEndNorm = normalizeDate(stateWithSim.date);
        const startSeasonYear = stateForSim.leagueStats.year;
        const endSeasonYear = stateWithSim.leagueStats.year;
        const firedKeys = new Set<string>();
        const draftRuntimeEventKeys = new Set([
            'draft_lottery',
            'draft_order_review',
            'draft_execute',
            'rookie_contracts',
        ]);
        for (let seasonYear = startSeasonYear; seasonYear <= endSeasonYear; seasonYear++) {
            for (const event of buildAutoResolveEvents(seasonYear, stateWithSim.leagueStats, stateWithSim.gameMode)) {
                const compositeKey = `${seasonYear}:${event.key}`;
                // Draft events have saved authority/prerequisite contracts and
                // may not run through this generic date-only event loop.
                if (draftRuntimeEventKeys.has(event.key)) continue;
                // Fire if the event date falls on the current day or within this sim window
                if (event.date >= simStartNorm && event.date <= simEndNorm && !firedKeys.has(compositeKey)) {
                    try {
                        const patch = await event.resolver(stateWithSim);
                        if (patch && Object.keys(patch).length > 0) {
                            stateWithSim = { ...stateWithSim, ...patch };
                        }
                    } catch (err) {
                        console.warn(`[processTurn calendar] ${event.key} failed:`, err);
                    }
                    firedKeys.add(compositeKey);
                }
            }
        }
    }

    // Fire callback with sim results BEFORE LLM call starts
    if (onSimComplete && allSimResults.length > 0) {
        onSimComplete(allSimResults);
    }

    // 4. Process action via LLM/Processor
    // Strip riggedForTid from payload — it's a sim-engine-only field and must not reach the LLM
    // (the LLM would misinterpret it as a "rig lottery" instruction and generate nonsense narrative)
    let actionForLLM = action;
    if (
        (action as any)?.payload?.riggedForTid !== undefined
        || (action as any)?.payload?.freeAgencyDayStart !== undefined
        || (action as any)?.payload?.transferMarketDailySummary !== undefined
    ) {
        const {
            riggedForTid: _rig,
            freeAgencyDayStart: _faDay,
            freeAgencyTotal: _faTotal,
            freeAgencyCombinedSummary: _faCombined,
            transferMarketDailySummary: _transferSummary,
            ...restPayload
        } = (action as any).payload;
        actionForLLM = { ...action, payload: Object.keys(restPayload).length > 0 ? restPayload : undefined } as any;
    }
    const nativeActionEffectPlan = buildNativeActionEffectPlan(state, action);
    let result = await processAction(stateWithSim, actionForLLM, executiveTradeTransactionRef, allSimResults, daysToSimulate);
    result = applyNativeActionEffectPlan(result, nativeActionEffectPlan);
    console.log('[GameLogic] result.newNews:', result?.newNews?.length);
    console.log('[GameLogic] result.newSocialPosts:', result?.newSocialPosts?.length);
    console.log('[GameLogic] result.newEmails:', result?.newEmails?.length);
    const executiveTradeTransactionFinal = executiveTradeTransactionRef.current;
    
    // 5. Post-process simulation results (injuries, stats)
    let { updatedPlayers, updatedDraftPicks, recoveries } = processSimulationResults(allSimResults, result.players || stateWithSim.players, result.draftPicks || stateWithSim.draftPicks, stateWithSim.schedule, stateWithSim.leagueStats?.year, stateWithSim.teams, stateWithSim.leagueStats);

    // Queue recovery toasts (GM mode, user team only — league-wide would be spammy)
    if (recoveries && recoveries.length > 0 && stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined) {
        const userRecoveries = recoveries
            .filter(r => r.tid === stateWithSim.userTeamId)
            .map(r => {
                const team = stateWithSim.teams.find(t => t.id === r.tid);
                return { playerName: r.playerName, teamName: team?.name ?? '', pos: r.pos };
            });
        if (userRecoveries.length > 0) {
            stateWithSim = {
                ...stateWithSim,
                pendingRecoveryToasts: [...(stateWithSim.pendingRecoveryToasts ?? []), ...userRecoveries],
            };
        }
    }

    if (stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined) {
        const previousUserPlayers = new Map(
            state.players
                .filter(p => p.tid === stateWithSim.userTeamId)
                .map(p => [p.internalId, p] as const)
        );
        const disciplinaryPlayerIds = new Set<string>();
        for (const simResult of allSimResults) {
            const fight = simResult.fight;
            if (fight) {
                disciplinaryPlayerIds.add(fight.player1Id);
                disciplinaryPlayerIds.add(fight.player2Id);
            }
            for (const ejection of simResult.ejections ?? []) {
                if ((ejection.suspensionGames ?? 0) > 0) disciplinaryPlayerIds.add(ejection.playerId);
            }
        }
        const suspensionToasts = updatedPlayers
            .filter(p => p.tid === stateWithSim.userTeamId && p.suspension && p.suspension.gamesRemaining > 0)
            .flatMap(p => {
                const previous = previousUserPlayers.get(p.internalId);
                const wasSuspended = previous?.suspension?.gamesRemaining ?? 0;
                const isNewOrLonger = p.suspension!.gamesRemaining > wasSuspended;
                const reason = p.suspension!.reason ?? '';
                const isAutomaticDiscipline = disciplinaryPlayerIds.has(p.internalId)
                    || /fight|fighting|altercation|brawl|bench-clearing|red card|flagrant|technical/i.test(reason);
                if (!isNewOrLonger || !isAutomaticDiscipline) return [];
                const team = stateWithSim.teams.find(t => t.id === p.tid);
                return [{
                    playerName: p.name,
                    teamName: team?.name ?? '',
                    pos: p.pos ?? '',
                    gamesRemaining: p.suspension!.gamesRemaining,
                    reason,
                }];
            });
        if (suspensionToasts.length > 0) {
            stateWithSim = {
                ...stateWithSim,
                pendingSuspensionToasts: [...(stateWithSim.pendingSuspensionToasts ?? []), ...suspensionToasts],
            };
        }
    }

    // Lazily assign mood traits to any player who doesn't have them yet
    updatedPlayers = updatedPlayers.map(p =>
        p.moodTraits && p.moodTraits.length > 0 ? p : { ...p, moodTraits: genMoodTraits(p.internalId) }
    );

    // 6. Handle forced trades from result
    let forcedTradeTransaction = null;
    let forcedTradeAnnouncements = [];
    if (result.forcedTrade) {
        const tradeResult = await executeForcedTrade(
            result.forcedTrade,
            state.players,
            state.teams,
            state.draftPicks,
            state.leagueType,
            state.date,
            state.leagueStats?.year,
            state.leagueStats?.uiMode,
        );
        forcedTradeTransaction = tradeResult.transaction;
        forcedTradeAnnouncements = tradeResult.announcements;
    }

    // Track player moves across all transactions so we can apply nuanced familiarity
    // penalties (docs/training.md §2 "Trade Penalty" — partial, scaled by ywt, offset
    // when the player joins a same-system team).
    const rosterMoves: { playerId: string; fromTid: number; toTid: number; ywt: number }[] = [];

    // Apply transactions to updated players/picks
    const applyTransaction = (transaction: any, players: Player[], picks: DraftPick[]) => {
        let p = [...players];
        let d = [...picks];
        if (transaction) {
            Object.entries(transaction.teams).forEach(([sourceTidStr, assets]) => {
                const teamAssets = assets as { playersSent: Player[], picksSent: DraftPick[] };
                const destTidStr = Object.keys(transaction.teams).find(id => id !== sourceTidStr);
                if (destTidStr) {
                    const destTid = parseInt(destTidStr);
                    const sourceTid = parseInt(sourceTidStr);
                    teamAssets.playersSent.forEach(ps => {
                        const currentPlayer = p.find(player => player.internalId === ps.internalId);
                        if (currentPlayer && isEurostashPlayer(currentPlayer)) {
                            p = p.map(player => player.internalId === ps.internalId
                              ? transferEurostashRights(player, destTid)
                              : player);
                            return;
                        }
                        // Approximate ywt from the player's stats history on the source team.
                        // Falls back to 0 if missing — rookies and freshly-arrived players take no toll.
                        const ywt = (ps.stats ?? []).filter((s: any) => s.tid === sourceTid && !s.playoffs && (s.gp ?? 0) > 0).length;
                        rosterMoves.push({ playerId: ps.internalId, fromTid: sourceTid, toTid: destTid, ywt });
                        p = p.map(player => player.internalId === ps.internalId
                          ? applyTradeToPlayer(player, destTid, stateWithSim.leagueStats?.year ?? state.leagueStats?.year ?? new Date().getFullYear(), 0)
                          : player);
                    });
                    teamAssets.picksSent.forEach(pick => {
                        d = d.map(dp => dp.dpid === pick.dpid ? { ...dp, tid: destTid } : dp);
                    });
                }
            });
        }
        return { p, d };
    };

    const afterForced = applyTransaction(forcedTradeTransaction, updatedPlayers, updatedDraftPicks);
    const afterExecutive = applyTransaction(executiveTradeTransactionFinal, afterForced.p, afterForced.d);
    updatedPlayers = afterExecutive.p;
    updatedDraftPicks = afterExecutive.d;
    const pbaPostTradeTrim = trimPbaOversizedRosters(stateWithSim, updatedPlayers);
    updatedPlayers = pbaPostTradeTrim.players;

    // Resolve mentor relationships after every trade in this turn — mentee keeps
    // their mentor if both moved together, otherwise the dangling link clears.
    if (rosterMoves.length > 0) {
        const { resolveMentorBreakage } = await import('../../services/training/trainingTick');
        updatedPlayers = resolveMentorBreakage(updatedPlayers);
    }

    // Re-apply action-handler suspensions/injuries — processSimulationResults may have
    // decremented them on the same turn they were applied; the action version must win.
    if (result.players) {
        const actionPlayerMap = new Map<string, any>(
            result.players.map((p: any) => [p.internalId, p])
        );
        updatedPlayers = updatedPlayers.map(p => {
            const actionVersion = actionPlayerMap.get(p.internalId);
            if (!actionVersion) return p;
            const patches: any = {};
            if (actionVersion.suspension &&
                (!p.suspension || actionVersion.suspension.gamesRemaining > p.suspension.gamesRemaining)) {
                patches.suspension = actionVersion.suspension;
            }
            if (actionVersion.injury &&
                (!p.injury || actionVersion.injury.gamesRemaining > p.injury.gamesRemaining)) {
                patches.injury = actionVersion.injury;
            }
            return Object.keys(patches).length > 0 ? { ...p, ...patches } : p;
        });
    }

    // 7. Handle Social and News
    const { uniqueNewPosts, uniqueNewNews } = await handleSocialAndNews(state, result, allSimResults, updatedPlayers, getActiveLeagueTeams(stateWithSim), daysToSimulate, stateWithSim.date);

    // Supplement with template-based news (always fires, LLM-agnostic) — same engine as lazy sim batches
    if (allSimResults.length > 0) {
        const reportedInjuries = new Set<string>(state.news.map((n: any) => n.injuryPlayerId).filter(Boolean));
        const templateNews = generateLazySimNews(getActiveLeagueTeams(stateWithSim), updatedPlayers, allSimResults, stateWithSim.date, reportedInjuries, false, getActiveLeagueTeams(state), stateWithSim.playoffs, stateWithSim.schedule, stateWithSim.leagueStats?.year ?? new Date().getFullYear(), stateWithSim.leagueStats);
        const existingIds = new Set([...state.news.map((n: any) => n.id), ...uniqueNewNews.map((n: any) => n.id)]);
        templateNews.filter(n => !existingIds.has(n.id)).forEach(n => uniqueNewNews.push(n));
    }

    console.log('[GameLogic] uniqueNewNews:', uniqueNewNews?.length);
    console.log('[GameLogic] uniqueNewPosts:', uniqueNewPosts?.length);

    // 8. Handle Financials (Paychecks)
    const isInstantAction = isInstantTransactionAction(action);
    // Only advance the calendar when games were actually simulated (daysToSimulate > 0)
    // or the LLM explicitly returned a target day. Transactions with daysToSimulate=0
    // (e.g. WAIVE_PLAYER when advanceDayOnTransaction=false) must stay on the current day
    // so the user doesn't lose scheduled games silently.
    const daysToAdvance = (isInstantAction || daysToSimulate === 0)
        ? 0
        : (result.day || (stateWithSim.day + 1)) - state.day;
    // Timezone-safe: normalise state.date to YYYY-MM-DD, advance via UTC methods
    const currentNormForDate = normalizeDate(state.date);
    const finalDateObj = new Date(`${currentNormForDate}T00:00:00Z`);
    finalDateObj.setUTCDate(finalDateObj.getUTCDate() + daysToAdvance);

    const paycheckResult = generatePaychecks(
        state.lastPayDate,
        finalDateObj.toISOString(),
        state.salary || 10000000,
        getPaycheckContext(state),
    );
    const { newPayslips, totalNetPay, newLastPayDate } = paycheckResult;

    // 9. Calculate New Stats and Approval
    const dateString = finalDateObj.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'short', day: 'numeric', year: 'numeric'
    });
    let { newStats, newLeagueStats, combinedStatChanges } = calculateNewStats(state, action, result, allSimResults, totalNetPay, dateString);
    const nativeActionEffect = finalizeNativeActionEffect({
        state,
        plan: nativeActionEffectPlan,
        newStats,
        newLeagueStats,
        date: dateString,
    });

    // 10. Handle Communication (Emails and Chats)
    const { uniqueNewEmails, updatedInbox, updatedChats } = handleCommunication(state, action, result, dateString, allSimResults);
    const automaticDiscipline = buildAutomaticGameDiscipline(state, allSimResults);
    const automaticFineTotalUSD = automaticDiscipline.reduce((sum, notice) => sum + notice.amountUSD, 0);
    const fineCurrency = getLeagueCurrencyCode(state.leagueStats);
    if (automaticFineTotalUSD > 0) {
        newStats = {
            ...newStats,
            leagueReserve: Number((newStats.leagueReserve + automaticFineTotalUSD / 1_000_000).toFixed(6)),
        };
    }
    const automaticSuspensions = new Map<string, number>();
    for (const notice of automaticDiscipline) {
        if (notice.suspensionGames <= 0) continue;
        automaticSuspensions.set(
            notice.playerId,
            (automaticSuspensions.get(notice.playerId) ?? 0) + notice.suspensionGames,
        );
        uniqueNewNews.push({
            id: `${notice.id}-suspension`,
            headline: 'Automatic Discipline Applied',
            content: `${notice.playerName} received a ${notice.suspensionGames}-game suspension. Reason: ${notice.reason}.`,
            date: dateString,
            type: 'league',
            read: false,
        });
    }
    const automaticByPlayer = new Map<string, typeof automaticDiscipline>();
    for (const notice of automaticDiscipline) {
        automaticByPlayer.set(
            notice.playerId,
            [...(automaticByPlayer.get(notice.playerId) ?? []), notice],
        );
    }
    if (automaticByPlayer.size > 0) {
        updatedPlayers = updatedPlayers.map(player => {
            const notices = automaticByPlayer.get(player.internalId);
            if (!notices?.length) return player;
            const games = automaticSuspensions.get(player.internalId) ?? 0;
            const disciplinedPlayer = games > 0
                ? {
                    ...player,
                    suspension: {
                        reason: notices.map(notice => notice.reason).join('; '),
                        gamesRemaining: (player.suspension?.gamesRemaining ?? 0) + games,
                    },
                }
                : player;
            return notices.reduce((current, notice) =>
                appendPlayerDisciplineRecord(current, {
                    id: notice.id,
                    date: dateString,
                    season: stateWithSim.leagueStats.year,
                    action: notice.suspensionGames > 0 ? 'fine_and_suspension' : 'fine',
                    amount: notice.amountUSD,
                    currencyCode: fineCurrency,
                    games: notice.suspensionGames || undefined,
                    reason: notice.reason,
                    authority: 'automatic',
                    templateId: notice.templateId,
                    templateName: notice.templateName,
                    tid: notice.teamId,
                    source: 'game',
                }),
            disciplinedPlayer);
        });
    }
    const automaticDisciplineToasts = automaticDiscipline
        .filter(notice =>
            stateWithSim.gameMode !== 'gm'
            || notice.teamId === stateWithSim.userTeamId)
        .map(notice => {
            const team = resolveAnyTeam(notice.teamId, stateWithSim.teams, stateWithSim.nonNBATeams ?? []);
            const player = stateWithSim.players.find(candidate => candidate.internalId === notice.playerId);
            return {
                playerName: notice.playerName,
                teamName: team ? getTeamFullName(team) : 'League Office',
                pos: player?.pos,
                action: notice.suspensionGames > 0 ? 'fine_and_suspension' as const : 'fine' as const,
                amount: notice.amountUSD,
                currencyCode: fineCurrency,
                games: notice.suspensionGames || undefined,
                reason: notice.reason,
                templateId: notice.templateId,
                templateName: notice.templateName,
            };
        });
    const pendingDisciplineToasts = [
        ...(stateWithSim.pendingDisciplineToasts ?? []),
        ...((result as { pendingDisciplineToasts?: GameState['pendingDisciplineToasts'] }).pendingDisciplineToasts ?? []),
        ...automaticDisciplineToasts,
    ];
    const automaticDisciplineHistory = automaticDiscipline.map(notice => ({
        text: `${notice.playerName} received an automatic ${new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: fineCurrency,
            maximumFractionDigits: 0,
        }).format(notice.amountUSD)} fine. Reason: ${notice.reason}.`,
        date: dateString,
        type: 'Discipline',
        playerIds: [notice.playerId],
    }));

    // 11. Finalize state
    const historicalPoint: HistoricalStatPoint = {
        date: dateString,
        publicApproval: newStats.publicApproval,
        ownerApproval: newStats.ownerApproval,
        playerApproval: newStats.playerApproval,
        legacy: newStats.legacy,
        revenue: newLeagueStats.revenue,
        annualRevenue: newLeagueStats.mediaRights?.totalRev
            ? newLeagueStats.mediaRights.totalRev * 1000
            : newLeagueStats.revenue,
        leagueReserve: newStats.leagueReserve,
        availableBudget: newStats.availableBudget,
        viewership: newLeagueStats.viewership,
    };

    const actualChanges = {
        publicApproval: newStats.publicApproval - state.stats.publicApproval,
        ownerApproval: newStats.ownerApproval - state.stats.ownerApproval,
        playerApproval: newStats.playerApproval - state.stats.playerApproval,
        legacy: newStats.legacy - state.stats.legacy,
        viewership: parseFloat((newLeagueStats.viewership - state.leagueStats.viewership).toFixed(1)),
        revenue: newLeagueStats.revenue - state.leagueStats.revenue,
    };

    const finalConsequence = result.consequence ? {
        ...result.consequence,
        actualChanges
    } : null;

    // Schedule generation fires once on the saved Schedule Release date.
    // Preselected showcase and preseason games are consumed here; no mid-season regenerations.
    let finalSchedule = stateWithSim.schedule;
    const normalizedFinalDate = normalizeDate(dateString);
    const pbaIsolatedForSchedule = isPbaIsolatedMode(state);
    const euroIsolatedForSchedule = isEuroIsolatedMode(state);
    // Exclude isNBACup so a Cup-only schedule (e.g. self-heal injected groups
    // after a season transition but before Schedule Release) doesn't masquerade as a generated season.
    const hasRegularSeasonGames = finalSchedule.some(g =>
      (euroIsolatedForSchedule
        ? g.competitionId === state.euroPrimaryCompetitionId && (g.competitionPhase === 'group' || g.competitionPhase?.startsWith('r'))
        : !(g as any).competitionId) &&
      !(g as any).isPreseason &&
      !(g as any).isPlayoff &&
      !(g as any).isPlayIn &&
      !(g as any).isNBACup &&
      !(g as any).isCupTBD
    );
    const scheduleYear = state.leagueStats?.year ?? new Date().getFullYear();
    const activeCalendarDates = getLeagueCalendarDates(scheduleYear, state.leagueStats);
    const backgroundNbaCalendarDates = getLeagueCalendarDates(scheduleYear, { uiMode: 'nba' } as any);
    const activeScheduleReleaseDate = toISODateString(getLeagueScheduleReleaseDate(scheduleYear, state.leagueStats));
    const backgroundNbaScheduleReleaseDate = toISODateString(getLeagueScheduleReleaseDate(scheduleYear, { uiMode: 'nba' } as any));
    const backgroundNbaRegularStart = toISODateString(backgroundNbaCalendarDates.regularSeasonStart);
    const backgroundNbaRegularEnd = toISODateString(backgroundNbaCalendarDates.regularSeasonEnd);
    const hasCurrentBackgroundNbaSeasonGames = finalSchedule.some(g =>
      !(g as any).competitionId &&
      !(g as any).isPreseason &&
      !(g as any).isPlayoff &&
      !(g as any).isPlayIn &&
      !(g as any).isNBACup &&
      !(g as any).isCupTBD &&
      normalizeDate(g.date) >= backgroundNbaRegularStart &&
      normalizeDate(g.date) <= backgroundNbaRegularEnd
    );
    if (pbaIsolatedForSchedule && state.teams.length >= 2 && !hasCurrentBackgroundNbaSeasonGames && normalizedFinalDate >= backgroundNbaScheduleReleaseDate) {
        console.log(`[Schedule] Generating background NBA schedule for PBA save on ${backgroundNbaScheduleReleaseDate}`);
        let _cupGroups = usesLegacyNbaCupState({ ...state.leagueStats, uiMode: 'nba' }) ? (state.nbaCup?.groups ?? []) : [];
        let _inlineCupPatch: NBACupState | undefined;
        if (usesLegacyNbaCupState({ ...state.leagueStats, uiMode: 'nba' }) && _cupGroups.length === 0) {
            const prevStandings = state.teams.map(t => ({ tid: t.id, wins: t.wins, losses: t.losses }));
            _cupGroups = drawCupGroups(state.teams, prevStandings, getSimulationSeed(state), scheduleYear);
            _inlineCupPatch = { year: scheduleYear, status: 'group', groups: _cupGroups, wildcards: { East: null, West: null }, knockout: [] };
        }
        const backgroundNbaSchedule = generateSchedule(
            state.teams,
            result.christmasGames || state.christmasGames,
            result.globalGames || state.globalGames,
            state.leagueStats.numGamesDiv ?? null,
            state.leagueStats.numGamesConf ?? null,
            state.leagueStats.mediaRights,
            scheduleYear,
            _cupGroups.length > 0 ? _cupGroups : undefined,
            getSimulationSeed(state),
            state.leagueStats.gamesPerSeason ?? null,
            undefined,
            'nba',
            true,
        );
        const maxExistingGid = Math.max(0, ...finalSchedule.map(g => g.gid));
        const renumberedBackgroundGames = backgroundNbaSchedule.map((game, index) => ({
            ...game,
            gid: maxExistingGid + 1 + index,
        }));
        finalSchedule = [...finalSchedule, ...renumberedBackgroundGames].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.gid - b.gid
        );
        if (_inlineCupPatch) { stateWithSim = { ...stateWithSim, nbaCup: _inlineCupPatch }; }
        console.log(`[Schedule] Added ${renumberedBackgroundGames.length} hidden NBA games for background simulation`);
    }
    if (!pbaIsolatedForSchedule && !hasRegularSeasonGames && normalizedFinalDate >= activeScheduleReleaseDate) {
        console.log(`[Schedule] GENERATING on ${activeScheduleReleaseDate} — christmas=${(result.christmasGames || state.christmasGames)?.length ?? 0} global=${(result.globalGames || state.globalGames)?.length ?? 0}`);
        // Preserve international preseason games added before Schedule Release.
        const intlPreseasonGames = finalSchedule.filter(g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100));
        let _cupGroups = usesLegacyNbaCupState(state.leagueStats) ? (state.nbaCup?.groups ?? []) : [];
        let _inlineCupPatch: NBACupState | undefined;
        if (usesLegacyNbaCupState(state.leagueStats) && _cupGroups.length === 0) {
            const prevStandings = state.teams.map(t => ({ tid: t.id, wins: t.wins, losses: t.losses }));
            _cupGroups = drawCupGroups(state.teams, prevStandings, getSimulationSeed(state), scheduleYear);
            _inlineCupPatch = { year: scheduleYear, status: 'group', groups: _cupGroups, wildcards: { East: null, West: null }, knockout: [] };
        }
        finalSchedule = generateSchedule(state.teams, result.christmasGames || state.christmasGames, result.globalGames || state.globalGames, state.leagueStats.numGamesDiv ?? null, state.leagueStats.numGamesConf ?? null, state.leagueStats.mediaRights, scheduleYear, _cupGroups.length > 0 ? _cupGroups : undefined, getSimulationSeed(state), state.leagueStats.gamesPerSeason ?? null, state.leagueStats.leagueCalendar, state.leagueStats.uiMode, state.leagueStats.allStarGameEnabled !== false);
        if (state.activeCompetitions?.length) {
          const compGames = state.activeCompetitions.flatMap((spec, index) => {
            const teams = selectCompetitionTeamTids(spec, state).map(tid => ({ tid }));
            const start = new Date(dateForCompetitionSeason(spec, scheduleYear, spec.seasonStart.month, spec.seasonStart.day));
            return generateForCompetition(spec, teams, start, 700_000 + index * 50_000);
          });
          finalSchedule = [...finalSchedule, ...compGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }
        if (_inlineCupPatch) { stateWithSim = { ...stateWithSim, nbaCup: _inlineCupPatch }; }
        // Auto-fill training calendars for every team once at Schedule Release,
        // alongside the season schedule so the Training Center has a full year
        // of plans the user can override.
        try {
          const { autoGenerateTrainingCalendarsForAllTeams } = await import('../../services/training/trainingScheduler');
          // Pass ISO — `dateString` is locale-formatted ("Oct 27, 2026"), and
          // the scheduler's `new Date(`${startISO}T00:00:00Z`)` parse silently
          // fails on locale strings, wiping every auto-plan to {}.
          stateWithSim = {
            ...stateWithSim,
            teams: autoGenerateTrainingCalendarsForAllTeams(stateWithSim.teams, finalSchedule, normalizedFinalDate, 365, stateWithSim.leagueStats),
          };
        } catch (e) { console.warn('[Training] autoGenerate failed', e); }
        if (intlPreseasonGames.length > 0) {
            // Re-gid to avoid collisions with schedule gids (which start from 0)
            const maxGid = Math.max(0, ...finalSchedule.map(g => g.gid));
            const renumbered = intlPreseasonGames.map((g, i) => ({ ...g, gid: maxGid + 1 + i }));
            finalSchedule = [...finalSchedule, ...renumbered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }
        finalSchedule = tagScheduledCupGroupGames(finalSchedule, stateWithSim.cupCompetitions, scheduleYear);
        console.log(`[Schedule] Generated: ${finalSchedule.length} total games (${intlPreseasonGames.length} intl preseason preserved)`);
    }

    // ── Self-heal: schedule already exists but Cup games never got tagged ────
    // Catches saves that generated their schedule before the Cup-injection fix
    // (e.g., the first NBA Cup ship had a saveId guard bug). Idempotent.
    if (
      hasRegularSeasonGames &&
      usesLegacyNbaCupState(state.leagueStats) &&
      stateWithSim.nbaCup?.groups?.length &&
      !finalSchedule.some(g => (g as any).isNBACup)
    ) {
        console.log('[Schedule] Self-heal: regular season exists but no Cup games tagged → injecting now');
        const scheduledDates: Record<string, Set<number>> = {};
        for (const g of finalSchedule as any[]) {
            const ds = String(g.date).split('T')[0];
            if (!scheduledDates[ds]) scheduledDates[ds] = new Set<number>();
            scheduledDates[ds].add(g.homeTid); scheduledDates[ds].add(g.awayTid);
        }
        const maxGid = Math.max(0, ...finalSchedule.map(g => g.gid));
        const result = injectCupGroupGames(
            [], maxGid + 1, stateWithSim.nbaCup.groups,
            getSimulationSeed(state), scheduleYear - 1, scheduledDates,
            {
              excludeFromRecord: true,
              cupStart: activeCalendarDates.cupStart,
              cupFinal: activeCalendarDates.cupFinal,
            },
        );
        if (result.games.length > 0) {
            console.log(`[Schedule] Self-heal injected ${result.games.length} Cup games`);
            finalSchedule = [...finalSchedule, ...result.games].sort(
                (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
            );
        }
    }

    if (action.type === 'ADD_PRESEASON_INTERNATIONAL') {
        const games = validateInternationalPreseasonGames(
            state.teams,
            state.nonNBATeams ?? [],
            state.players,
            action.payload.games ?? [],
        );
        const newGames: Game[] = games.map((game: any, index: number) => ({
            gid: Math.max(0, ...finalSchedule.map(g => g.gid)) + 1 + index,
            homeTid: game.teamId,
            awayTid: game.opponentId,
            homeScore: 0,
            awayScore: 0,
            played: false,
            date: new Date(game.date).toISOString(),
            isPreseason: true,
            internationalShowcaseName: game.opponentName,
            internationalShowcasePlayerIds: game.showcasePlayerIds,
            city: game.city,
            country: game.country
        }));
        finalSchedule = [...finalSchedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    const normalizedCurrentDate = normalizeDate(state.date);
    let finalScheduledEvents = (state.scheduledEvents || []).filter(event =>
        event?.type === 'NATIVE_LEAGUE_ANNOUNCEMENT'
        || normalizeDate(event.date) !== normalizedCurrentDate
    );
    if (result.newScheduledEvents) {
        finalScheduledEvents.push(...result.newScheduledEvents);
    }

    const scheduleByGid = new Map((stateWithSim.schedule ?? state.schedule ?? []).map((game: any) => [game.gid, game]));
    const boxScoresWithDate = allSimResults.map(r => {
        const schedGame = scheduleByGid.get(r.gameId) as any;
        return {
            ...r,
            date: r.date || schedGame?.date || state.date,
            season: r.season ?? schedGame?.season ?? state.leagueStats.year,
            isPreseason: r.isPreseason ?? schedGame?.isPreseason,
            isPlayoff: r.isPlayoff ?? schedGame?.isPlayoff,
            isEliminationGame: r.isEliminationGame ?? schedGame?.isEliminationGame,
            isPlayIn: r.isPlayIn ?? schedGame?.isPlayIn,
            isNBACup: r.isNBACup ?? schedGame?.isNBACup,
            nbaCupRound: r.nbaCupRound ?? schedGame?.nbaCupRound,
            nbaCupGroupId: r.nbaCupGroupId ?? schedGame?.nbaCupGroupId,
            excludeFromRecord: r.excludeFromRecord ?? schedGame?.excludeFromRecord,
            competitionId: r.competitionId ?? schedGame?.competitionId,
            competitionPhase: r.competitionPhase ?? schedGame?.competitionPhase,
        };
    });
    const boxScoreKey = (box: { season?: number; gameId: number }) => `${box.season ?? 0}-${box.gameId}`;
    const removedBoxScoreKeys = new Set<string>();
    const allowNBASeasonEvents = state.leagueStats?.uiMode !== 'euro_isolated' && !isPbaIsolatedMode(state);
    const allowNBAAllStarEvents = allowNBASeasonEvents && isAllStarGameEnabled(state.leagueStats);
    const allowAllStarWeekendEvents = allowNBASeasonEvents && (
      isAllStarGameEnabled(state.leagueStats) ||
      isCelebrityGameEnabled(state.leagueStats) ||
      isDunkContestEnabled(state.leagueStats) ||
      isRisingStarsEnabled(state.leagueStats) ||
      isShootingStarsEnabled(state.leagueStats) ||
      isSkillsChallengeEnabled(state.leagueStats) ||
      isThreePointContestEnabled(state.leagueStats) ||
      state.leagueStats.allStarHorse === true ||
      state.leagueStats.allStarThroneEnabled === true
    );
    const commissionerOwnsEventFields = state.gameMode !== 'gm';

    // All-Star Logic
    let allStarPatch = state.allStar;
    const { getAllStarWeekendDates, AllStarWeekendOrchestrator } = await import('../../services/allStar/AllStarWeekendOrchestrator');
    const { AllStarSelectionService, bucketRoster, getAllStarPlayerEligibility, isUsaPlayer, normalizeAllStarRoster } = await import('../../services/allStar/AllStarSelectionService');
    const playerEligibility = getAllStarPlayerEligibility(state.leagueStats, stateWithSim.teams);
    const allStarEligiblePlayers = updatedPlayers.filter(playerEligibility);
    const asFormat = state.leagueStats.allStarFormat;
    const asTeams = state.leagueStats.allStarTeams;
    const startDate = parseGameDate(state.date);
    const endDate = parseGameDate(dateString);
    const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);

    // Helper to check if a specific date was hit or passed during this turn.
    // Uses YYYY-MM-DD string comparison (lexicographic = correct for ISO dates)
    // to avoid local-timezone drift from new Date() + setHours().
    const startNormStr = normalizeDate(state.date);
    const endNormStr = normalizeDate(dateString);
    const allStarSeedState = { ...state, date: dateString, players: updatedPlayers } as GameState;
    const runSeededAllStar = <T>(eventIdentity: string, run: () => T): T =>
        withDeterministicRandom(buildAllStarEventSeed(allStarSeedState, eventIdentity), run);
    const allStarNewsId = (eventIdentity: string): string =>
        `${eventIdentity}-${state.leagueStats.year}-${endNormStr}`;
    const wasDateReached = (targetDate: Date) => {
        const targetNorm = normalizeDate(targetDate.toISOString());
        return targetNorm >= startNormStr && targetNorm <= endNormStr;
    };

    // 1. Accumulate votes during voting period
    if (allowNBAAllStarEvents && endDate >= dates.votingStart && startDate <= dates.votingEnd) {
        const votingStartInTurn = startDate < dates.votingStart ? dates.votingStart : startDate;
        const votingEndInTurn = endDate > dates.votingEnd ? dates.votingEnd : endDate;
        const votingDays = Math.max(1, Math.ceil((votingEndInTurn.getTime() - votingStartInTurn.getTime()) / (1000 * 60 * 60 * 24)));
        
        const updatedVotes = runSeededAllStar('allstar-votes', () =>
            AllStarSelectionService.simulateVotingPeriod(
                updatedPlayers,
                stateWithSim.teams,
                state.leagueStats.year,
                endDate,
                state.allStar?.votes ?? [],
                votingDays,
                playerEligibility,
                state.leagueStats,
            ),
        );
        allStarPatch = {
            season: state.leagueStats.year,
            startersAnnounced: false,
            reservesAnnounced: false,
            roster: [],
            weekendComplete: false,
            ...(state.allStar ?? {}),
            votes: updatedVotes,
        };
    }

    // 2. Announce Starters
    if (allowNBAAllStarEvents && wasDateReached(dates.startersAnnounced) && !allStarPatch?.startersAnnounced) {
        const playersOnCourt = getPlayersOnCourt(state.leagueStats);
        let starters = AllStarSelectionService.selectStarters(allStarPatch?.votes ?? [], updatedPlayers, playersOnCourt, playerEligibility);
        starters = normalizeAllStarRoster(
            bucketRoster(starters, updatedPlayers, allStarPatch?.votes ?? [], asFormat, asTeams, playerEligibility, state.leagueStats.allStarCaptainType),
            updatedPlayers,
            playerEligibility,
        );
        allStarPatch = {
            ...(allStarPatch || {}),
            roster: starters,
            startersAnnounced: true,
        } as any;
        updatedPlayers = materializeAllStarSelectionAwards(updatedPlayers, starters, state.leagueStats.year);

        uniqueNewNews.push({
            id: allStarNewsId('allstar-starters'),
            headline: 'All-Star Starters Announced!',
            content: `The fans have spoken. The starters for the ${state.leagueStats.year} All-Star Game have been revealed: ${starters.map(s => s.playerName).join(', ')}.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    // 3. Announce Reserves & Rising Stars
    if (allowNBAAllStarEvents && wasDateReached(dates.reservesAnnounced) && !allStarPatch?.reservesAnnounced) {
        const reserves = AllStarSelectionService.selectReserves(
            updatedPlayers,
            stateWithSim.teams,
            state.leagueStats.year,
            allStarPatch?.roster ?? [],
            asFormat,
            asTeams,
            getPlayersOnCourt(state.leagueStats),
            playerEligibility,
        );
        // Bucket the full event pool together so captains_draft / usa_vs_world
        // re-balance starters + reserves uniformly.
        const fullRoster = normalizeAllStarRoster(bucketRoster(
            [...(allStarPatch?.roster ?? []), ...reserves],
            updatedPlayers,
            allStarPatch?.votes ?? [],
            asFormat,
            asTeams,
            playerEligibility,
            state.leagueStats.allStarCaptainType,
        ), updatedPlayers, playerEligibility);
        
        const risingStarsEnabled = isRisingStarsEnabled(state.leagueStats);
        let risingStarsRoster: any[] = [];
        let risingStarsTeams: string[] = [];
        if (risingStarsEnabled) {
            const isUsaWorldRisingStars = state.leagueStats.risingStarsFormat === 'usa_vs_world';
            const { rookies, sophs } = AllStarSelectionService.getRisingStarsRoster(
                updatedPlayers,
                state.leagueStats.year
            );
            const { usa, world } = isUsaWorldRisingStars
                ? AllStarSelectionService.getRisingStarsUsaWorldRoster(updatedPlayers, state.leagueStats.year)
                : { usa: [], world: [] };
            const getCategory = (pos: string): 'Guard' | 'Frontcourt' => (pos === 'G' || pos === 'PG' || pos === 'SG') ? 'Guard' : 'Frontcourt';
            const buildRisingStarsEntry = (p: Player) => {
                    const team = stateWithSim.teams.find(t => t.id === p.tid);
                    const usaPlayer = isUsaWorldRisingStars && isUsaPlayer(p);
                    return {
                        playerId: p.internalId,
                        nbaId: extractNbaId(p.imgURL || "", p.name),
                        playerName: p.name,
                        teamAbbrev: team?.abbrev || '',
                        teamNbaId: team ? extractTeamId(team.logoUrl, team.abbrev) : null,
                        conference: isUsaWorldRisingStars ? (usaPlayer ? 'USA' : 'World') : (team?.conference || ''),
                        isStarter: true,
                        position: p.pos || 'F',
                        category: getCategory(p.pos || 'F'),
                        isRookie: p.draft?.year === state.leagueStats.year - 1,
                        risingStarsTeam: isUsaWorldRisingStars ? (usaPlayer ? 'USA' : 'World') : undefined,
                        ovr: convertTo2KRating(p.overallRating ?? 50, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50, p.ratings?.[p.ratings.length - 1]?.tp)
                    };
                };
            risingStarsRoster = (isUsaWorldRisingStars ? [...usa, ...world] : [...rookies, ...sophs]).map(buildRisingStarsEntry);

            const broadcasters = ['Chuck', 'Shaq', 'Kenny', 'Ernie', 'Shannon', 'Stephen A', 'Wilbon', 'Rose', 'Malika', 'JJ', 'Richard', 'Channing', 'Draymond', 'Candace'];
            const shuffled = runSeededAllStar(
                'rising-stars-team-names',
                () => [...broadcasters].sort(() => 0.5 - Math.random()),
            );
            risingStarsTeams = getRisingStarsTwoTeamNames(
                state.leagueStats.risingStarsFormat,
                [`Team ${shuffled[0]}`, `Team ${shuffled[1]}`],
            );
        }

        allStarPatch = {
            ...(allStarPatch || {}),
            roster: fullRoster,
            reservesAnnounced: true,
            risingStarsRoster,
            risingStarsAnnounced: risingStarsEnabled,
            risingStarsTeams
        } as any;
        updatedPlayers = materializeAllStarSelectionAwards(updatedPlayers, fullRoster, state.leagueStats.year);

        uniqueNewNews.push({
            id: allStarNewsId('allstar-reserves'),
            headline: 'Full All-Star Rosters Revealed',
            content: `The coaches have made their picks. The full rosters for the ${state.leagueStats.year} All-Star Weekend are now set.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
        const snubs = buildAllStarSnubStories({ ...state, players: updatedPlayers } as GameState, fullRoster);
        uniqueNewNews.push(...snubs.news.filter(item => !uniqueNewNews.some(existing => existing.id === item.id)));
        if (isTwitterAvailable(dateString, state.leagueStats.year)) {
            uniqueNewPosts.push(...snubs.social.filter(item => !uniqueNewPosts.some(existing => existing.id === item.id)));
        }
    }

    // 3.1 Announce Celebrity Game
    if (!commissionerOwnsEventFields && allowAllStarWeekendEvents && isCelebrityGameEnabled(state.leagueStats) && wasDateReached((dates as any).celebrityAnnounced) && !allStarPatch?.celebrityAnnounced) {
        const {
            fetchRatedCelebritiesForYear,
            fetchHistoricalCelebritySelection,
            filterActiveNbaPlayersFromCelebritySelection,
            addOccasionalBasketballGuests,
        } = await import('../../data/celebrities');
        const rawHistoricalSelection = state.leagueType === 'modded'
            && (state.moddedLeagueBase ?? 'nba') === 'nba'
            && state.leagueStats.year <= 2026
            ? await fetchHistoricalCelebritySelection(state.leagueStats.year)
            : null;
        const historicalSelection = filterActiveNbaPlayersFromCelebritySelection(rawHistoricalSelection, updatedPlayers);
        let selected = historicalSelection?.roster || [];
        let celebTeams = historicalSelection?.teamNames || [];
        let celebrityRosterProfiles: CelebrityRosterProfile[] = [];
        let newsContent = `The Celebrity Game roster is set, featuring ${selected.slice(0, 3).join(', ')} and more.`;

        if (!historicalSelection) {
            const poolSource = state.leagueType === 'fictional' ? 'fictional' : 'real';
            const celebs = await fetchRatedCelebritiesForYear(state.leagueStats.year, poolSource);
            runSeededAllStar('allstar-celebrity-roster', () => {
                celebrityRosterProfiles = addOccasionalBasketballGuests(
                    [...celebs].sort(() => 0.5 - Math.random()).slice(0, 20),
                    updatedPlayers,
                    state.leagueStats.year,
                    state.leagueType === 'fictional',
                );
                selected = celebrityRosterProfiles.map(celebrity => celebrity.name);

                if (state.leagueType === 'fictional') {
                    celebTeams = ['Team Spotlight', 'Team Prime'];
                    newsContent = `The Celebrity Game field is set, featuring ${selected.slice(0, 3).join(', ')} and more.`;
                } else {
                    const broadcasters = ['Shannon', 'Stephen A', 'Chuck', 'Shaq', 'Kenny', 'Ernie', 'Draymond', 'JJ', 'Richard', 'Channing'];
                    const shuffledBroadcasters = [...broadcasters].sort(() => 0.5 - Math.random());
                    celebTeams = [`Team ${shuffledBroadcasters[0]}`, `Team ${shuffledBroadcasters[1]}`];
                    newsContent = `The stars are coming to town! Captains ${shuffledBroadcasters[0]} and ${shuffledBroadcasters[1]} will lead teams featuring ${selected.slice(0, 3).join(', ')} and more.`;
                }
            });
        }

        newLeagueStats = {
            ...newLeagueStats,
            celebrityRoster: selected,
            celebrityRosterAutoSelected: true
        };

        allStarPatch = {
            ...(allStarPatch || {}),
            celebrityAnnounced: true,
            celebrityTeams: celebTeams,
            celebrityRosterProfiles,
            celebrityTeamDetails: historicalSelection?.teamDetails,
            celebrityGameDetails: historicalSelection?.gameDetails,
            celebrityRoster: selected
        } as any;

        uniqueNewNews.push({
            id: allStarNewsId('allstar-celebrity-roster'),
            headline: 'Celebrity Game Roster Announced!',
            content: newsContent,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    // 3.2 Announce Dunk Contest
    if (!commissionerOwnsEventFields && allowAllStarWeekendEvents && isDunkContestEnabled(state.leagueStats) && wasDateReached((dates as any).dunkContestAnnounced) && !allStarPatch?.dunkContestAnnounced) {
        const { AllStarDunkContestSim } = await import('../../services/allStar/AllStarDunkContestSim');
        const contestants = snapshotAllStarParticipants(runSeededAllStar(
            'allstar-dunk-field',
            () => AllStarDunkContestSim.selectContestants(updatedPlayers),
        ));
        allStarPatch = {
            ...(allStarPatch || {}),
            dunkContestContestants: contestants,
            dunkContestAnnounced: true,
        } as any;

        uniqueNewNews.push({
            id: allStarNewsId('allstar-dunk-field'),
            headline: 'Dunk Contest Field Set!',
            content: contestants.length > 0 
                ? `The high-flyers are ready. The participants for the ${state.leagueStats.year} Slam Dunk Contest are: ${contestants.map(p => p.name).join(', ')}.`
                : `The high-flyers are ready. The participants for the ${state.leagueStats.year} Slam Dunk Contest have been selected and are ready to put on a show.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    // 3.2.5 The Throne — full lifecycle (sign-ups → voting → reveal)
    if (allowAllStarWeekendEvents && state.leagueStats.allStarThroneEnabled === true) {
      const throneOrch = await import('../../services/allStar/throneOrchestrator');
      const dThrone = dates as any;
      const stateForThrone = () => ({
        ...state,
        players: updatedPlayers,
        allStar: {
          season: state.leagueStats.year,
          startersAnnounced: false,
          reservesAnnounced: false,
          roster: [],
          weekendComplete: false,
          ...(state.allStar ?? {}),
          ...(allStarPatch ?? {}),
        },
      }) as any;
      const merge = (patch: any) => {
        const as = patch?.allStar;
        if (as) allStarPatch = { ...(allStarPatch || {}), ...as } as any;
      };
      // We use endDate >= phaseStart guards (not wasDateReached) so the lifecycle
      // also fires correctly when the toggle is enabled mid-window.
      const isPast = (d: Date) => endDate >= d;

      // PHASE 1 — Sign-ups open (Dec 1 onward, until close)
      if (
        isPast(dThrone.throneSignupOpens)
        && !isPast(dThrone.throneVotingOpens) // before voting opens
        && !(allStarPatch as any)?.throneSignupSchedule
        && !(state.allStar as any)?.throneSignupSchedule
      ) {
        merge(runSeededAllStar(
          'allstar-throne-signups',
          () => throneOrch.initThroneSignups(stateForThrone(), dThrone.throneSignupOpens, dThrone.throneSignupCloses),
        ));
        const beltId = (allStarPatch as any)?.beltHolderInternalId ?? (state.allStar as any)?.beltHolderInternalId;
        const kingName = beltId ? updatedPlayers.find(p => p.internalId === beltId)?.name : null;
        uniqueNewNews.push({
          id: allStarNewsId('allstar-throne-signups'),
          headline: 'THE THRONE — Sign-ups Open',
          content: kingName
            ? `Sign-ups are live for the 1v1 tournament. ${kingName} returns as defending king and the field opens for everyone else.`
            : `The 1v1 tournament throne is up for grabs. Sign-ups are live through ${formatGameDateShort(dThrone.throneSignupCloses)}.`,
          date: dateString,
          type: 'league',
          read: false,
        } as any);
      }

      // PHASE 1b — Sign-ups close (Jan 15+)
      if (
        isPast(dThrone.throneSignupCloses)
        && !(allStarPatch as any)?.throneSignupComplete
        && !(state.allStar as any)?.throneSignupComplete
      ) {
        merge(runSeededAllStar('allstar-throne-signups-close', () => throneOrch.closeThroneSignups(stateForThrone())));
        const totalSignups = ((allStarPatch as any)?.throneSignupSchedule
          ?? (state.allStar as any)?.throneSignupSchedule
          ?? []).length;
        if (totalSignups > 0) {
          uniqueNewNews.push({
            id: allStarNewsId('allstar-throne-signups-close'),
            headline: 'THE THRONE — Sign-ups Closed',
            content: `${totalSignups} players signed up. Voting opens ${formatGameDateShort(dThrone.throneVotingOpens)} and closes ${formatGameDateShort(dThrone.throneFieldReveal)}.`,
            date: dateString,
            type: 'league',
            read: false,
          } as any);
        }
      }

      // PHASE 2 — Voting tick (Jan 16 → Jan 30) — fires every day in the window
      if (
        isPast(dThrone.throneVotingOpens)
        && !isPast(dThrone.throneFieldReveal)
        && !(allStarPatch as any)?.throneAnnounced
        && !(state.allStar as any)?.throneAnnounced
      ) {
        merge(runSeededAllStar(
          'allstar-throne-voting',
          () => throneOrch.tickThroneVoting(stateForThrone(), endDate, dThrone.throneVotingOpens, dThrone.throneFieldReveal),
        ));
      }

      // PHASE 3 — Field reveal (Jan 30+)
      if (
        !commissionerOwnsEventFields
        &&
        isPast(dThrone.throneFieldReveal)
        && !(allStarPatch as any)?.throneAnnounced
        && !(state.allStar as any)?.throneAnnounced
      ) {
        merge(runSeededAllStar('allstar-throne-field', () => throneOrch.lockThroneField(stateForThrone())));
        const annAS = allStarPatch as any;
        const fieldIds: string[] = annAS?.throne?.fieldPlayerIds ?? [];
        const headlinePlayers = fieldIds.slice(0, 4)
          .map(id => updatedPlayers.find(p => p.internalId === id)?.name)
          .filter(Boolean)
          .join(', ');
        const beltDefenseLine = annAS?.throne?.titleDefenderId
          ? ` 👑 ${updatedPlayers.find(p => p.internalId === annAS.throne.titleDefenderId)?.name ?? 'The defending king'} will defend the throne.`
          : annAS?.throneVacated
            ? ' The throne is VACATED — last year\'s king cannot defend.'
            : '';
        uniqueNewNews.push({
          id: allStarNewsId('allstar-throne-field'),
          headline: 'THE THRONE — Field of 16 Revealed',
          content: `Composite vote results are in. ${headlinePlayers} headline this year's tournament.${beltDefenseLine}`,
          date: dateString,
          type: 'league',
          read: false,
        } as any);
      }
    }

    // 3.3 Announce 3-Point Contest
    if (!commissionerOwnsEventFields && allowAllStarWeekendEvents && isThreePointContestEnabled(state.leagueStats) && wasDateReached((dates as any).threePointAnnounced) && !allStarPatch?.threePointAnnounced) {
        const { AllStarThreePointContestSim } = await import('../../services/allStar/AllStarThreePointContestSim');
        const externalThreePointSelection = state.leagueStats.uiMode === 'wnba_isolated'
          ? (await import('../../services/externalLeague/allStarContestSelection')).selectExternalThreePointContestants
          : undefined;
        const contestants = snapshotAllStarParticipants(runSeededAllStar(
          'allstar-three-point-field',
          () => externalThreePointSelection
            ? externalThreePointSelection(
                allStarEligiblePlayers,
                state.leagueStats.year,
                state.leagueStats.allStarThreePointContestPlayers ?? 8,
              )
            : AllStarThreePointContestSim.selectContestants(updatedPlayers, state.leagueStats.year),
        ));
        allStarPatch = {
            ...(allStarPatch || {}),
            threePointContestants: contestants,
            threePointAnnounced: true,
        } as any;

        uniqueNewNews.push({
            id: allStarNewsId('allstar-three-point-field'),
            headline: '3-Point Contest Participants Revealed',
            content: `The best shooters in the world will face off. The field for the ${state.leagueStats.year} 3-Point Contest includes: ${contestants.map(p => p.name).join(', ')}.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    if (!commissionerOwnsEventFields && allowAllStarWeekendEvents && isShootingStarsEnabled(state.leagueStats) && wasDateReached((dates as any).threePointAnnounced) && !(allStarPatch as any)?.shootingStarsAnnounced) {
        const {
          AllStarShootingStarsSim,
          shouldUseCrossLeagueShootingStarsFormat,
        } = await import('../../services/allStar/AllStarShootingStarsSim');
        const hostCity = state.leagueStats.allStarHosts?.find((host: any) => host.year === state.leagueStats.year)?.city;
        const shootingStarsTeams = Math.min(30, Math.max(2, Math.round(state.leagueStats.allStarShootingStarsTeams ?? Math.round((state.leagueStats.allStarShootingStarsTotalPlayers ?? 12) / 3))));
        const contestants = snapshotAllStarParticipants(runSeededAllStar(
          'allstar-shooting-stars-field',
          () => AllStarShootingStarsSim.selectContestants(
            updatedPlayers,
            state.leagueStats.year,
            shootingStarsTeams * 3,
            state.teams,
            state.nonNBATeams ?? [],
            hostCity,
            shouldUseCrossLeagueShootingStarsFormat({ ...state, players: updatedPlayers }),
          ),
        ));
        allStarPatch = {
            ...(allStarPatch || {}),
            shootingStarsContestants: contestants,
            shootingStarsAnnounced: true,
        } as any;
        uniqueNewNews.push({
            id: allStarNewsId('allstar-shooting-stars-field'),
            headline: 'Shooting Stars Field Revealed',
            content: `The Shooting Stars lineup is set for All-Star Saturday: ${contestants.map(p => p.name).join(', ')}.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    if (!commissionerOwnsEventFields && allowAllStarWeekendEvents && isSkillsChallengeEnabled(state.leagueStats) && wasDateReached((dates as any).threePointAnnounced) && !(allStarPatch as any)?.skillsChallengeAnnounced) {
        const { AllStarSkillsChallengeSim } = await import('../../services/allStar/AllStarSkillsChallengeSim');
        const skillsCompetitors = Math.min(30, Math.max(3, Math.round(state.leagueStats.allStarSkillsChallengeTeams ?? state.leagueStats.allStarSkillsChallengeTotalPlayers ?? 4)));
        const externalSkillsSelection = state.leagueStats.uiMode === 'wnba_isolated'
          ? (await import('../../services/externalLeague/allStarContestSelection')).selectExternalSkillsContestants
          : undefined;
        const contestants = snapshotAllStarParticipants(runSeededAllStar(
          'allstar-skills-field',
          () => externalSkillsSelection
            ? externalSkillsSelection(allStarEligiblePlayers, skillsCompetitors)
            : AllStarSkillsChallengeSim.selectContestants(updatedPlayers, state.leagueStats.year, skillsCompetitors),
        ));
        allStarPatch = {
            ...(allStarPatch || {}),
            skillsChallengeContestants: contestants,
            skillsChallengeAnnounced: true,
        } as any;

        uniqueNewNews.push({
            id: allStarNewsId('allstar-skills-field'),
            headline: 'Skills Challenge Field Revealed',
            content: `The Skills Challenge field is set for All-Star Saturday: ${contestants.map(p => p.name).join(', ')}.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    if (!commissionerOwnsEventFields && allowAllStarWeekendEvents && state.leagueStats.allStarHorse === true && wasDateReached((dates as any).threePointAnnounced) && !(allStarPatch as any)?.horseAnnounced) {
        const { AllStarHorseSim } = await import('../../services/allStar/AllStarHorseSim');
        const horseParticipants = Math.min(10, Math.max(3, Math.round(state.leagueStats.allStarHorseParticipants ?? 3)));
        const contestants = snapshotAllStarParticipants(runSeededAllStar(
          'allstar-horse-field',
          () => AllStarHorseSim.selectContestants(updatedPlayers, state.leagueStats.year, horseParticipants, state.teams),
        ));
        allStarPatch = {
            ...(allStarPatch || {}),
            horseContestants: contestants,
            horseAnnounced: true,
        } as any;

        uniqueNewNews.push({
            id: allStarNewsId('allstar-horse-field'),
            headline: 'H-O-R-S-E Field Revealed',
            content: `The H-O-R-S-E lineup is set for All-Star Saturday: ${contestants.map(p => p.name).join(', ')}.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    // 4. Inject Games
    if (allowAllStarWeekendEvents && wasDateReached(dates.breakStart) && !allStarPatch?.gamesInjected) {
        finalSchedule = AllStarWeekendOrchestrator.injectAllStarGames(
            finalSchedule,
            stateWithSim.teams,
            state.leagueStats.year,
            allStarPatch?.roster ?? [],
            state.leagueStats,
            updatedPlayers,
        );
        const win = AllStarWeekendOrchestrator.getBreakWindowStrings(state.leagueStats.year, state.leagueStats);
        stateWithSim = {
            ...stateWithSim,
            leagueStats: {
                ...stateWithSim.leagueStats,
                allStarBreakStart: win.breakStart,
                allStarBreakEnd: win.breakEnd,
            },
        };
        allStarPatch = {
            ...(allStarPatch || {}),
            gamesInjected: true,
        } as any;
    }

    // 5. All-Star Weekend Orchestration
    // Only auto-sim AFTER the day has passed.
    // When endDate === risingStars date, the user
    // is still ON that day and should be able to
    // Watch Live. Only sim when they advance past.
    // Timezone-safe: compare as YYYY-MM-DD strings (all via UTC)
    const risingStarsNorm = normalizeDate(dates.risingStars.toISOString());
    const saturdayNorm = normalizeDate(dates.saturday.toISOString());
    const allStarGameNorm = normalizeDate(dates.allStarGame.toISOString());
    const endDateNormStr = normalizeDate(endDate.toISOString());

    // Determine which weekend days need simulation based on:
    // 1. The end date is past that day (strictly >, so user can Watch Live on the actual day)
    // 2. That day's events haven't already been simulated (state-based guard)
    const simFriday = endDateNormStr > risingStarsNorm && (
      (isRisingStarsEnabled(state.leagueStats) && !allStarPatch?.risingStarsGameId) ||
      (isCelebrityGameEnabled(state.leagueStats) && !allStarPatch?.celebrityGameResult)
    );
    const simSaturday = endDateNormStr > saturdayNorm &&
      ((isDunkContestEnabled(state.leagueStats) && !allStarPatch?.dunkContest?.complete) ||
       (isThreePointContestEnabled(state.leagueStats) && !allStarPatch?.threePointContest?.complete) ||
       (isShootingStarsEnabled(state.leagueStats) && !allStarPatch?.shootingStars?.complete) ||
       (isSkillsChallengeEnabled(state.leagueStats) && !allStarPatch?.skillsChallenge?.complete) ||
       (state.leagueStats.allStarHorse === true && !allStarPatch?.horseTournament?.complete));
    // Bracket-aware: complete only when state.allStar.bracket.complete (multi-game
    // formats), or when the legacy allStarGameId is set (2-team fallback).
    const sundayDone = !!(allStarPatch?.bracket?.complete) || !!allStarPatch?.allStarGameId;
    const simSunday = isAllStarGameEnabled(state.leagueStats) && endDateNormStr > allStarGameNorm &&
      (!sundayDone || (isDanceContestEnabled(state.leagueStats) && !allStarPatch?.danceContest?.complete));

    if (allowAllStarWeekendEvents && (simFriday || simSaturday || simSunday) && !allStarPatch?.weekendComplete) {
        const weekendUpdate = await AllStarWeekendOrchestrator.simulateWeekend({
            ...state,
            players: updatedPlayers,
            schedule: finalSchedule,
            allStar: allStarPatch,
            boxScores: [...(state.boxScores || []), ...boxScoresWithDate]
        }, { friday: simFriday, saturday: simSaturday, sunday: simSunday });

        if (weekendUpdate.allStar) allStarPatch = weekendUpdate.allStar;
        if (weekendUpdate.schedule) finalSchedule = weekendUpdate.schedule;
        if (weekendUpdate.boxScores) {
            // Use gameId-based dedup — never overwrite existing box scores
            const existingKeys = new Set(
                [...(state.boxScores || []), ...boxScoresWithDate].map(bs => `${bs.season ?? 0}-${bs.gameId}`)
            );
            const newBoxScores = weekendUpdate.boxScores.filter(bs => !existingKeys.has(`${bs.season ?? 0}-${bs.gameId}`));
            boxScoresWithDate.push(...newBoxScores);
        }
        const { backfillAllStarAwards } = await import('../../services/logic/autoResolversParts/allStarSelectionResolvers');
        const awardPatch = backfillAllStarAwards({
            ...state,
            players: updatedPlayers,
            schedule: finalSchedule,
            allStar: allStarPatch,
        } as GameState);
        if (awardPatch.players) updatedPlayers = awardPatch.players;
    }

    if (isPbaIsolatedMode(state)) {
        const {
            backfillPbaAllStarAwards,
            buildPbaAllStarLeagueStats,
            buildPbaAllStarPatch,
            buildPbaContestPatch,
            pbaAllStarGameNeedsFullLengthRepair,
            resetPbaAllStarGameForResim,
            stripUnsupportedPbaAllStarGames,
        } = await import('../../services/pba/allStar');
        const pbaAllStarLeagueStats = buildPbaAllStarLeagueStats(newLeagueStats);
        newLeagueStats = pbaAllStarLeagueStats;
        finalSchedule = stripUnsupportedPbaAllStarGames(
            {
                ...state,
                leagueStats: pbaAllStarLeagueStats,
                schedule: finalSchedule,
            } as GameState,
            finalSchedule,
        ) as Game[];
        let pbaStateForAllStar = {
            ...state,
            players: updatedPlayers,
            schedule: finalSchedule,
            leagueStats: pbaAllStarLeagueStats,
            teams: stateWithSim.teams,
            nonNBATeams: (stateWithSim as any).nonNBATeams ?? state.nonNBATeams,
            boxScores: [...(state.boxScores || []), ...boxScoresWithDate],
        } as GameState;

        if (pbaAllStarGameNeedsFullLengthRepair({ ...pbaStateForAllStar, allStar: allStarPatch } as GameState, allStarPatch)) {
            const repairPatch = resetPbaAllStarGameForResim({ ...pbaStateForAllStar, allStar: allStarPatch } as GameState, allStarPatch);
            const keptBoxScoreKeys = new Set(repairPatch.boxScores.map(boxScoreKey));
            for (const box of [...(state.boxScores || []), ...boxScoresWithDate]) {
                const key = boxScoreKey(box);
                if (!keptBoxScoreKeys.has(key)) removedBoxScoreKeys.add(key);
            }
            const originalBoxScoreKeys = new Set((state.boxScores || []).map(boxScoreKey));
            boxScoresWithDate.length = 0;
            boxScoresWithDate.push(...repairPatch.boxScores.filter(box => !originalBoxScoreKeys.has(boxScoreKey(box))));
            finalSchedule = repairPatch.schedule;
            allStarPatch = repairPatch.allStar;
            pbaStateForAllStar = {
                ...pbaStateForAllStar,
                schedule: finalSchedule,
                boxScores: repairPatch.boxScores,
                allStar: allStarPatch,
            } as GameState;
        }

        if (endDate >= dates.reservesAnnounced && !allStarPatch?.reservesAnnounced) {
            const pbaPatch = buildPbaAllStarPatch(pbaStateForAllStar, updatedPlayers as any);
            if (pbaPatch) {
                updatedPlayers = pbaPatch.players as any;
                allStarPatch = pbaPatch.allStar;
                const rosterStory = buildPbaAllStarRosterAnnouncement({
                    ...pbaStateForAllStar,
                    players: updatedPlayers,
                    allStar: allStarPatch,
                } as GameState);
                if (rosterStory) {
                    uniqueNewNews.push({
                        id: rosterStory.id,
                        headline: rosterStory.headline,
                        content: rosterStory.content,
                        date: dateString,
                        category: 'pba_all_star_captains',
                        type: 'league',
                        read: false,
                    } as any);
                }
            }
        }

        if (endDate >= (dates as any).threePointAnnounced && allStarPatch?.reservesAnnounced) {
            allStarPatch = buildPbaContestPatch(
                { ...pbaStateForAllStar, players: updatedPlayers, allStar: allStarPatch } as GameState,
                updatedPlayers as any,
                allStarPatch,
            );
        }

        if (endDate >= dates.breakStart && allStarPatch?.reservesAnnounced && !allStarPatch?.gamesInjected) {
            finalSchedule = AllStarWeekendOrchestrator.injectAllStarGames(
                finalSchedule,
                ((stateWithSim as any).nonNBATeams ?? state.nonNBATeams ?? []).filter((team: any) => team?.league === 'PBA'),
                state.leagueStats.year,
                allStarPatch?.roster ?? [],
                pbaAllStarLeagueStats,
                updatedPlayers,
            );
            const win = AllStarWeekendOrchestrator.getBreakWindowStrings(state.leagueStats.year, pbaAllStarLeagueStats);
            newLeagueStats = {
                ...pbaAllStarLeagueStats,
                allStarBreakStart: win.breakStart,
                allStarBreakEnd: win.breakEnd,
            };
            allStarPatch = {
                ...(allStarPatch || {}),
                gamesInjected: true,
            } as any;
        }

        const pbaSundayDone = !!(allStarPatch?.bracket?.complete) || !!allStarPatch?.allStarGameId;
        const pbaSimSaturday = endDateNormStr > saturdayNorm &&
            allStarPatch?.reservesAnnounced &&
            (!allStarPatch?.dunkContest?.complete ||
             !allStarPatch?.threePointContest?.complete ||
             !allStarPatch?.skillsChallenge?.complete);
        const pbaSimSunday = endDateNormStr > allStarGameNorm &&
            allStarPatch?.reservesAnnounced &&
            (!pbaSundayDone || (isDanceContestEnabled(newLeagueStats) && !allStarPatch?.danceContest?.complete));

        if ((pbaSimSaturday || pbaSimSunday) && !allStarPatch?.weekendComplete) {
            const weekendUpdate = await AllStarWeekendOrchestrator.simulateWeekend({
                ...state,
                players: updatedPlayers,
                teams: stateWithSim.teams,
                nonNBATeams: (stateWithSim as any).nonNBATeams ?? state.nonNBATeams,
                schedule: finalSchedule,
                leagueStats: newLeagueStats,
                allStar: allStarPatch,
                boxScores: [...(state.boxScores || []), ...boxScoresWithDate],
            } as GameState, { friday: false, saturday: !!pbaSimSaturday, sunday: !!pbaSimSunday });

            if (weekendUpdate.allStar) allStarPatch = weekendUpdate.allStar;
            if (weekendUpdate.schedule) finalSchedule = weekendUpdate.schedule;
            if (weekendUpdate.boxScores) {
                const existingKeys = new Set(
                    [...(state.boxScores || []), ...boxScoresWithDate].map(bs => `${bs.season ?? 0}-${bs.gameId}`)
                );
                const newBoxScores = weekendUpdate.boxScores.filter(bs => !existingKeys.has(`${bs.season ?? 0}-${bs.gameId}`));
                boxScoresWithDate.push(...newBoxScores.map(bs => ({ ...bs, season: bs.season ?? state.leagueStats.year })));
            }
            updatedPlayers = backfillPbaAllStarAwards(
                { ...pbaStateForAllStar, players: updatedPlayers, allStar: allStarPatch, leagueStats: newLeagueStats } as GameState,
                updatedPlayers as any,
                allStarPatch,
            ) as any;
        }
    }

    if (allStarPatch?.danceContest?.complete) {
        const danceNews = buildContestResultNews(
            { ...state, leagueStats: newLeagueStats } as GameState,
            'dance',
            allStarPatch.danceContest,
        );
        const existingNewsIds = new Set([
            ...(state.news ?? []).map(item => item.id),
            ...uniqueNewNews.map(item => item.id),
        ]);
        if (danceNews && !existingNewsIds.has(danceNews.id)) uniqueNewNews.push(danceNews);
    }

    // The per-day playoff pipeline is the only materialization/advancement
    // owner. This outer turn merge only carries its committed bracket.
    const isolatedCompetitionMode = state.leagueStats?.uiMode === 'euro_isolated'
        || state.leagueStats?.uiMode === 'pba_isolated';
    const playoffsPatch = isolatedCompetitionMode ? undefined : (stateWithSim.playoffs ?? state.playoffs);
    finalSchedule = repairCompetitionSchedules(
        { ...stateWithSim, schedule: finalSchedule },
        stateWithSim.activeCompetitions ?? state.activeCompetitions ?? [],
        stateWithSim.leagueStats?.year ?? state.leagueStats?.year ?? new Date().getFullYear(),
    );
    finalSchedule = injectCompetitionPostseasonGames(
        { ...stateWithSim, date: dateString, schedule: finalSchedule, boxScores: [...(state.boxScores || []), ...boxScoresWithDate] },
        stateWithSim.activeCompetitions ?? state.activeCompetitions ?? [],
        stateWithSim.leagueStats?.year ?? state.leagueStats?.year ?? new Date().getFullYear(),
    );
    const shouldRunPbaLifecycle = !isInstantTransactionAction(action) || boxScoresWithDate.length > 0;
    const pbaLifecyclePatch = shouldRunPbaLifecycle
        ? applyPbaConferenceLifecycle(
            { ...stateWithSim, schedule: finalSchedule, players: updatedPlayers, boxScores: state.boxScores ?? [] } as GameState,
            boxScoresWithDate,
        )
        : {};
    const pbaYearEndStartedThisTurn =
        (pbaLifecyclePatch.leagueStats as any)?.pbaConference === 'governors'
        && (pbaLifecyclePatch.leagueStats as any)?.pbaConferencePhase === 'offseason'
        && (pbaLifecyclePatch.offseasonChecklist as any)?.pbaConferenceAwards === 'pending';
    const pbaYearEndPreparedThisTurn = Number((pbaLifecyclePatch.leagueStats as any)?.pbaYearEndRolloverPreparedSeason)
        === Number(stateWithSim.leagueStats?.year);
    if (Object.keys(pbaLifecyclePatch).length > 0) {
        stateWithSim = { ...stateWithSim, ...pbaLifecyclePatch } as GameState;
    }
    if (pbaLifecyclePatch.schedule) {
        finalSchedule = pbaLifecyclePatch.schedule as Game[];
    }
    if (pbaLifecyclePatch.leagueStats) {
        newLeagueStats = {
            ...newLeagueStats,
            ...(pbaLifecyclePatch.leagueStats as any),
        } as any;
        stateWithSim = {
            ...stateWithSim,
            leagueStats: {
                ...stateWithSim.leagueStats,
                ...(pbaLifecyclePatch.leagueStats as any),
            } as any,
        };
    }
    if ((pbaLifecyclePatch as any).players) {
        updatedPlayers = (pbaLifecyclePatch as any).players;
        stateWithSim = { ...stateWithSim, players: updatedPlayers };
    }
    if ((pbaLifecyclePatch as any).teams) {
        stateWithSim = { ...stateWithSim, teams: (pbaLifecyclePatch as any).teams };
    }
    if ((pbaLifecyclePatch as any).nonNBATeams) {
        stateWithSim = { ...stateWithSim, nonNBATeams: (pbaLifecyclePatch as any).nonNBATeams };
    }
    if ((pbaLifecyclePatch as any).draftPicks) {
        updatedDraftPicks = (pbaLifecyclePatch as any).draftPicks;
        stateWithSim = { ...stateWithSim, draftPicks: updatedDraftPicks };
    }
    if ((pbaLifecyclePatch as any).staffFreeAgents) {
        stateWithSim = { ...stateWithSim, staffFreeAgents: (pbaLifecyclePatch as any).staffFreeAgents };
    }
    if ((pbaLifecyclePatch as any).retirementAnnouncements) {
        stateWithSim = { ...stateWithSim, retirementAnnouncements: (pbaLifecyclePatch as any).retirementAnnouncements };
    }
    if ((pbaLifecyclePatch as any).staffRetirementAnnouncements) {
        stateWithSim = { ...stateWithSim, staffRetirementAnnouncements: (pbaLifecyclePatch as any).staffRetirementAnnouncements };
    }
    if ((pbaLifecyclePatch as any).staffHallOfFame) {
        stateWithSim = { ...stateWithSim, staffHallOfFame: (pbaLifecyclePatch as any).staffHallOfFame };
    }
    if (pbaLifecyclePatch.offseasonChecklist !== undefined) {
        stateWithSim = { ...stateWithSim, offseasonChecklist: pbaLifecyclePatch.offseasonChecklist as any };
    }
    if (pbaLifecyclePatch.history) {
        stateWithSim = { ...stateWithSim, history: pbaLifecyclePatch.history as any };
    }
    if ((pbaLifecyclePatch as any).historicalAwards) {
        stateWithSim = { ...stateWithSim, historicalAwards: (pbaLifecyclePatch as any).historicalAwards };
    }
    if (Object.prototype.hasOwnProperty.call(pbaLifecyclePatch, 'allStar')) {
        allStarPatch = pbaLifecyclePatch.allStar;
    }

    // Remove club debuffs for players who played in today's games
    const playedPlayerIds = new Set(
        allSimResults.flatMap(r => [
            ...(r.homeStats || []).map((s: any) => s.playerId),
            ...(r.awayStats || []).map((s: any) => s.playerId),
        ])
    );
    const remainingDebuffs = (result.pendingClubDebuff ?? state.pendingClubDebuff ?? [])
        .filter((d: any) => !playedPlayerIds.has(d.playerId));

    // Ghost real estate passive income — silently added to wealth, never shown in payslips
    const monthlyPassive = (state.realEstateInventory ?? [])
        .reduce((s: number, a: any) => s + Math.floor(a.price * 0.004), 0);
    if (monthlyPassive > 0) {
        const passiveThisPeriod = monthlyPassive * (daysToAdvance / 30);
        newStats = {
            ...newStats,
            personalWealth: Number((newStats.personalWealth + passiveThisPeriod / 1_000_000).toFixed(4)),
        };
    }

    // Resolve pending bets against today's sim results
    const betResolution = resolveBets(state.bets ?? [], allSimResults);
    if (betResolution.netChange !== 0) {
        newStats = {
            ...newStats,
            personalWealth: Number((newStats.personalWealth + betResolution.netChange / 1_000_000).toFixed(4)),
        };
    }
    // Keep all bets — pagination in the UI handles large lists
    const prunedBets = betResolution.updatedBets;
    const previousMonthKey = normalizeDate(state.date).slice(0, 7);
    const finalMonthKey = normalizedFinalDate.slice(0, 7);
    const baseStaffFreeAgents =
        (result as any).staffFreeAgents
        ?? (stateWithSim as any).staffFreeAgents
        ?? state.staffFreeAgents;
    const shouldRefillStaffPool =
        daysToAdvance > 0 &&
        previousMonthKey !== finalMonthKey &&
        state.gameMode === 'gm' &&
        !!state.leagueStats?.staffPoolSeeded &&
        state.userTeamId != null &&
        state.userTeamId >= 0;
    // Monthly tick: top up to min 10 per position for the user's league.
    // Idempotent — positions already at or above the floor get no additions.
    const staffPoolAfterMonthlyRefill = shouldRefillStaffPool
        ? ensureStaffPoolDepth(
            {
                ...state,
                players: updatedPlayers,
                teams: result.teams || stateWithSim.teams,
                nonNBATeams: (result as any).nonNBATeams ?? (stateWithSim as any).nonNBATeams ?? state.nonNBATeams,
                staffFreeAgents: baseStaffFreeAgents,
            } as GameState,
            inferEuroStaffLeagueId(state.userTeamId, state.leagueType),
          ).staffFreeAgents
        : baseStaffFreeAgents;

    // ── Draft Lottery & Draft Auto-Fire ──────────────────────────────────────
    // autoRunLottery / autoRunDraft only fire inside lazySimRunner's event loop.
    // For ADVANCE_DAY / SIMULATE_TO_DATE (PlayoffView, Schedule "To Date", daily sim)
    // we must replicate them here using the same wasDateReached() helper.
    const draftYear = resolveLeagueSeasonLifecycle(stateWithSim).draft.year
        ?? getDraftSeasonYearForState(stateWithSim);
    let autoDraftLotteryResult = state.draftLotteryResult;
    let autoDraftComplete = isCanonicalDraftComplete({ ...stateWithSim, players: updatedPlayers });
    let autoSeasonLifecycle = stateWithSim.seasonLifecycle;
    let draftCombineResultsAvailableYear = stateWithSim.draftCombineResultsAvailableYear;
    let pendingDraftCombineToast = stateWithSim.pendingDraftCombineToast;

    const combineEvent = buildAutoResolveEvents(draftYear, state.leagueStats, state.gameMode)
        .find(event => event.key === 'draft_combine');
    if (
        !commissionerOwnsEventFields &&
        allowNBASeasonEvents &&
        combineEvent &&
        combineEvent.date >= startNormStr &&
        combineEvent.date <= endNormStr
    ) {
        const combineResult = applyDraftCombineCalendarEvent(
            { ...stateWithSim, players: updatedPlayers } as GameState,
            draftYear,
        );
        if (combineResult.evidenceWritten) {
            stateWithSim = combineResult.state;
            draftCombineResultsAvailableYear = combineResult.state.draftCombineResultsAvailableYear;
            pendingDraftCombineToast = combineResult.state.pendingDraftCombineToast;
        }
    }

    if (
        !commissionerOwnsEventFields &&
        allowNBASeasonEvents &&
        isDraftLotteryEnabled(state.leagueStats?.draftType) &&
        wasDateReached(new Date(`${getManualCalendarEventWindow(getDraftLotteryDate(draftYear, state.leagueStats)).arrivalDate}T00:00:00Z`)) &&
        !autoDraftLotteryResult
    ) {
        try {
            const lotteryEventDate = getManualCalendarEventWindow(getDraftLotteryDate(draftYear, state.leagueStats)).arrivalDate;
            const transientAuthorized = isAssistantGMDraftEventAuthorized('lottery', normalizeDate(state.date));
            const lotteryEvent = applyDraftLotteryCalendarEvent(
                { ...stateWithSim, players: updatedPlayers } as GameState,
                {
                    eventDate: lotteryEventDate,
                    targetPlan: (action as any)?.payload?.targetPlan,
                    transientAuthorized,
                    commandType: action.type,
                },
            );
            const patch = lotteryEvent.patch;
            if ((patch as any).draftLotteryResult) {
                autoDraftLotteryResult = (patch as any).draftLotteryResult;
                autoSeasonLifecycle = (patch as any).seasonLifecycle ?? autoSeasonLifecycle;
                stateWithSim = { ...stateWithSim, ...patch } as GameState;
                uniqueNewNews.push({
                    id: `draft-lottery-${draftYear}`,
                    headline: 'Draft Lottery Complete',
                    content: 'The NBA Draft Lottery has concluded. View the Draft Lottery tab for full results.',
                    date: dateString, type: 'league', read: false, isNew: true,
                } as any);
            }
            if (transientAuthorized && lotteryEvent.resolverInvoked) {
                consumeAssistantGMDraftEvent('lottery', normalizeDate(state.date));
            }
        } catch (e) { console.warn('[GameLogic] autoRunLottery failed:', e); }
    }

    const { getHOFClassYearsReached, getHOFCeremonyDateString } = await import('../../services/playerDevelopment/hofChecker');
    for (const hofClassYear of allowNBASeasonEvents ? getHOFClassYearsReached(state.date, dateString) : []) {
        const currentNews = [...uniqueNewNews, ...(stateWithSim.news ?? state.news ?? [])];
        const hofPersistGuard = (newLeagueStats.hofClassesInducted ?? []).includes(hofClassYear);
        const hofNewsGuard = currentNews.some(n => (n as any).id?.startsWith(`hof-class-${hofClassYear}-`));
        if (hofPersistGuard || hofNewsGuard) continue;
        try {
            const { autoInductHOFClass } = await import('../../services/logic/autoResolvers');
            const patch = await autoInductHOFClass({
                ...stateWithSim,
                date: getHOFCeremonyDateString(hofClassYear),
                players: updatedPlayers,
                leagueStats: newLeagueStats,
                news: currentNews,
            } as any);
            if ((patch as any).players) updatedPlayers = (patch as any).players;
            if ((patch as any).leagueStats) {
                newLeagueStats = { ...newLeagueStats, ...(patch as any).leagueStats };
            }
            if ((patch as any).history) {
                stateWithSim = { ...stateWithSim, history: (patch as any).history };
            }
            if ((patch as any).news) {
                const existingIds = new Set(currentNews.map((n: any) => n.id));
                const freshHofNews = ((patch as any).news as any[]).filter(n => !existingIds.has(n.id));
                uniqueNewNews.push(...freshHofNews);
            }
        } catch (e) { console.warn('[GameLogic] autoInductHOFClass failed:', e); }
    }

    const actionBlocksAutoDraft =
        action.type === 'EXECUTIVE_TRADE' ||
        action.type === 'FORCE_TRADE' ||
        isDraftBlockedByUnresolvedPlayoffs({ ...state, schedule: stateWithSim.schedule, playoffs: stateWithSim.playoffs });

    if (
        !commissionerOwnsEventFields &&
        allowNBASeasonEvents &&
        wasDateReached(new Date(`${getManualCalendarEventWindow(getDraftDate(draftYear, state.leagueStats)).arrivalDate}T00:00:00Z`)) &&
        !autoDraftComplete &&
        !actionBlocksAutoDraft &&
        (state.gameMode !== 'gm' || consumeAssistantGMDraftEvent('draft', normalizeDate(state.date)))
    ) {
        try {
            const { autoRunDraft } = await import('../../services/logic/autoResolvers');
            const patch = autoRunDraft({ ...stateWithSim, players: updatedPlayers, draftLotteryResult: autoDraftLotteryResult } as any);
            if ((patch as any).players) updatedPlayers = (patch as any).players;
            if ((patch as any).draftPicks) updatedDraftPicks = (patch as any).draftPicks;
            if (Object.keys(patch).length > 0) stateWithSim = { ...stateWithSim, ...patch } as GameState;
            if ((patch as any).draftComplete) {
                autoDraftComplete = true;
                autoSeasonLifecycle = (patch as any).seasonLifecycle ?? autoSeasonLifecycle;
                uniqueNewNews.push({
                    id: `auto-draft-gl-${Date.now()}`,
                    headline: 'NBA Draft Complete',
                    content: 'The NBA Draft has concluded. All prospects have been assigned to teams. Undrafted players are now free agents.',
                    date: dateString, type: 'league', read: false, isNew: true,
                } as any);
            }
        } catch (e) { console.warn('[GameLogic] autoRunDraft failed:', e); }
    }

    // Training Center — daily familiarity tick + roster-change penalty.
    // Familiarity is team-level state (never touches player ratings).
    const teamsAfterSim = result.teams || stateWithSim.teams;
    const trainingMod = await import('../../services/training/trainingTick');
    const { getCoachSystem } = await import('../coachSystemStore');
    const teamsAfterRosterMoves = rosterMoves.length > 0
        ? trainingMod.applyRosterChangeFamiliarity(
            teamsAfterSim,
            rosterMoves,
            (tid) => getCoachSystem(tid)?.selectedSystem
        )
        : teamsAfterSim;
    const simCalendarDays = Math.max(
        0,
        Math.round(
            (new Date(`${normalizedFinalDate}T00:00:00Z`).getTime() - new Date(`${normalizeDate(state.date)}T00:00:00Z`).getTime()) /
            86400000,
        ),
    );
    const teamsAfterFamiliarity = trainingMod.applyDailyFamiliarityTick(
        teamsAfterRosterMoves,
        state.date,
        simCalendarDays,
        {
            schedule: state.schedule,
            currentYear: state.leagueStats?.year ?? new Date().getFullYear(),
            userTeamId: state.userTeamId,
            gameMode: state.gameMode,
        },
    );
    // Player fatigue tick runs alongside familiarity — both share the daily-walk loop.
    const isTrainingCampChecklistOpen =
        !!state.offseasonChecklist &&
        !isPbaActiveConferenceMode(state) &&
        state.offseasonChecklist.trainingCamp !== 'done' &&
        state.offseasonChecklist.trainingCamp !== 'skipped';
    const teamsForFatigueTick = isTrainingCampChecklistOpen
        ? teamsAfterFamiliarity.map(team => ({ ...team, trainingCalendar: {} as any }))
        : teamsAfterFamiliarity;
    updatedPlayers = trainingMod.applyDailyFatigueTick(
        updatedPlayers,
        teamsForFatigueTick,
        state.date,
        simCalendarDays,
        state.schedule,
        state.leagueStats,
    );

    let teamsAfterStaffHiring = teamsAfterFamiliarity;
    let finalStaffFreeAgents = staffPoolAfterMonthlyRefill;
    const staffHiringSeason = stateWithSim.leagueStats?.year ?? newLeagueStats.year;
    const staffCalendar = getLeagueCalendarDates(staffHiringSeason, stateWithSim.leagueStats);
    const staffHiringNorm = toISODateString(addGameDays(
        staffCalendar.trainingCampStart ?? staffCalendar.preseasonStart ?? staffCalendar.regularSeasonStart,
        -24,
    ));
    const staffHiringAlreadyResolved = (newLeagueStats as any).staffHiringResolvedYear === staffHiringSeason;
    if (
        allowNBASeasonEvents
        && !staffHiringAlreadyResolved
        && startNormStr <= staffHiringNorm
        && normalizedFinalDate >= staffHiringNorm
    ) {
        const staffHiring = processNBAStaffHiringVacancies(
            teamsAfterStaffHiring,
            staffHiringSeason,
            dateString,
            state.gameMode === 'gm' ? state.userTeamId : null,
            finalStaffFreeAgents ?? [],
            state.leagueType === 'fictional' ? 'fictional' : 'nba',
        );
        teamsAfterStaffHiring = staffHiring.teams;
        const consumedIds = new Set(staffHiring.consumedFreeAgentIds);
        const employedNames = new Set<string>();
        for (const team of teamsAfterStaffHiring as any[]) {
            for (const member of (team?.tycoon?.staffMembers ?? []) as any[]) {
                const key = String(member?.name ?? '').trim().toLowerCase();
                if (key) employedNames.add(key);
            }
        }
        finalStaffFreeAgents = (finalStaffFreeAgents ?? []).filter((member: any) => {
            const key = String(member?.name ?? '').trim().toLowerCase();
            return (!member?.id || !consumedIds.has(member.id)) && (!key || !employedNames.has(key));
        });
        if (staffHiring.historyEntries.length > 0) {
            stateWithSim = {
                ...stateWithSim,
                history: [...(stateWithSim.history ?? []), ...staffHiring.historyEntries],
            };
            newLeagueStats = {
                ...newLeagueStats,
                staffHiringResolvedYear: staffHiringSeason,
            } as any;
        }
    }

    const tycoonOps = applyEuroTycoonDailyOps(
        {
            ...stateWithSim,
            schedule: finalSchedule,
            players: updatedPlayers,
            nonNBATeams: (result as any).nonNBATeams ?? stateWithSim.nonNBATeams,
        } as GameState,
        teamsAfterStaffHiring,
        state.date,
        dateString,
        daysToAdvance,
    );
    const actionTradeMetadata = action.type === 'EXECUTIVE_TRADE' && executiveTradeTransactionFinal
        ? buildTradeHistoryMetadata(executiveTradeTransactionFinal, dateString)
        : {};
    const actionHistoryEntry = {
        text: ((action as any)?.payload?.outcomeText || result.outcomeText || ''),
        date: dateString,
        tid: (() => {
            if (action.type === 'EXECUTIVE_TRADE') {
                return Number((action as any)?.payload?.teamAId);
            }
            switch (action.type) {
                case 'SIGN_FREE_AGENT':
                case 'WAIVE_PLAYER':
                case 'FORCE_TRADE':
                    return Number((action as any)?.payload?.teamId);
                default:
                    return undefined;
            }
        })(),
        league: (() => {
            const tid = action.type === 'EXECUTIVE_TRADE'
                ? Number((action as any)?.payload?.teamAId)
                : Number((action as any)?.payload?.teamId);
            if (!Number.isFinite(tid)) return undefined;
            const allTeams = [...(stateWithSim.teams ?? []), ...(((stateWithSim as any).nonNBATeams ?? []) as any[])];
            return allTeams.find((team: any) => Number(team?.id ?? team?.tid) === tid)?.league;
        })(),
        playerIds: (() => {
            if (action.type === 'EXECUTIVE_TRADE') {
                return [
                    ...((action as any)?.payload?.teamAPlayers ?? []),
                    ...((action as any)?.payload?.teamBPlayers ?? []),
                ].filter(Boolean);
            }
            const playerId = (action as any)?.payload?.playerId;
            return playerId ? [playerId] : undefined;
        })(),
        ...(action.type === 'SIGN_FREE_AGENT' && (result as any).contractTransaction
            ? { contractTransaction: (result as any).contractTransaction }
            : {}),
        ...actionTradeMetadata,
        commissioner: state.gameMode !== 'gm',
        type: (() => {
            switch (action.type) {
                case 'EXECUTIVE_TRADE':
                case 'FORCE_TRADE': return 'Trade';
                case 'SIGN_FREE_AGENT': return 'Signing';
                case 'WAIVE_PLAYER': return 'Waive';
                case 'EXERCISE_TEAM_OPTION':
                case 'DECLINE_TEAM_OPTION': return 'Contract Option';
                case 'SUSPEND_PLAYER': return 'Suspension';
                case 'FIRE_PERSONNEL':
                case 'RETIRE_PERSONNEL': return 'Personnel';
                case 'SIMULATE_TO_DATE': return 'Simulation';
                case 'INVITE_DINNER': return action.payload?.subType === 'movie' ? 'Movie Night' : 'Dinner';
                case 'GO_TO_CLUB': return 'Night Out';
                case 'TRAVEL': return 'Travel';
                case 'INVITE_PERFORMANCE': return 'Performance';
                case 'DRUG_TEST_PERSON': return 'Drug Test';
                case 'FINE_PERSON': return 'Fine';
                case 'GIVE_MONEY': return 'Finance';
                case 'TRANSFER_FUNDS': return 'Finance';
                case 'SABOTAGE_PLAYER': return 'Sabotage';
                case 'HYPNOTIZE':
                case 'HYPNOTIC_BROADCAST': return 'Covert Op';
                case 'GLOBAL_GAMES': return 'Global Games';
                case 'ENDORSE_HOF': return 'HOF';
                case 'VISIT_NON_NBA_TEAM': return 'Travel';
                default: return 'League Event';
            }
        })(),
    } as any;
    const historyBase = [
        ...((result as any).history ?? stateWithSim.history ?? state.history ?? []),
        ...pbaPostTradeTrim.history,
        ...automaticDisciplineHistory,
    ];
    const shouldAppendActionHistory = !!String(actionHistoryEntry.text ?? '').trim()
        && !historyBase.some((entry: any) =>
            entry?.text === actionHistoryEntry.text
            && entry?.date === actionHistoryEntry.date
            && entry?.type === actionHistoryEntry.type,
        );

    // AI Training Camp annual auto-setup — refresh dev-focus + mentor pairings
    // when we cross Aug 15 (start of training camp). Overwrites prior assignments
    // so rookies who aged out of mentorship and retired vets get cleaned up.
    try {
        const oldD = new Date(state.date);
        const newD = new Date(dateString);
        if (!isNaN(oldD.getTime()) && !isNaN(newD.getTime())) {
            const crossedCampStart = (() => {
                // Build the Aug-15 boundary in the same year as `oldD`. If newD is past
                // it and oldD is before, we crossed.
                const year = oldD.getUTCFullYear();
                const camp = new Date(Date.UTC(year, 7, 15)); // month is 0-indexed
                return oldD < camp && newD >= camp;
            })();
            if (crossedCampStart) {
                const { applyAIAutoSetup } = await import('../../services/training/aiAutoSetup');
                updatedPlayers = applyAIAutoSetup(
                    updatedPlayers,
                    teamsAfterFamiliarity,
                    state.leagueStats?.year ?? new Date().getFullYear(),
                    state.userTeamId,
                    state.gameMode,
                    { overwrite: true },
                );
                console.log('[GameLogic] AI Training Camp auto-setup applied (overwrite).');
            }
        }
    } catch (e) {
        console.warn('[GameLogic] AI training-camp auto-setup failed', e);
    }

    const finalBoxScores = (() => {
        if (Object.prototype.hasOwnProperty.call(pbaLifecyclePatch, 'boxScores')) {
            return pbaLifecyclePatch.boxScores ?? [];
        }
        const existingBoxScores = (state.boxScores || []).filter(b => !removedBoxScoreKeys.has(boxScoreKey(b)));
        const existingKeys = new Set(existingBoxScores.map(boxScoreKey));
        const deduped = boxScoresWithDate.filter(b => {
            const key = boxScoreKey(b);
            return !removedBoxScoreKeys.has(key) && !existingKeys.has(key);
        });
        return [...existingBoxScores, ...deduped];
    })();
    const preFinalizationHistoricalAwards = (result as any).historicalAwards
        ?? stateWithSim.historicalAwards
        ?? state.historicalAwards;
    const finalizedSeasonState = finalizeHistoricalNbaSeason({
        ...stateWithSim,
        leagueStats: newLeagueStats,
        playoffs: playoffsPatch,
        schedule: finalSchedule,
        teams: tycoonOps.teams,
        players: updatedPlayers,
        boxScores: finalBoxScores,
        historicalAwards: preFinalizationHistoricalAwards,
        seasonHistory: stateWithSim.seasonHistory ?? state.seasonHistory,
    } as GameState, state.leagueStats.year);
    updatedPlayers = finalizedSeasonState.players;
    const finalTeams = finalizedSeasonState.teams;
    const finalHistoricalAwards = finalizedSeasonState.historicalAwards;
    const finalSeasonHistory = finalizedSeasonState.seasonHistory;
    const socialAvailableForDate = isTwitterAvailable(dateString, newLeagueStats?.year);
    finalScheduledEvents = (stateWithSim.scheduledEvents ?? state.scheduledEvents ?? [])
        .filter(event =>
            event?.type === 'NATIVE_LEAGUE_ANNOUNCEMENT'
            || normalizeDate(event.date) !== normalizedCurrentDate
        );
    if (result.newScheduledEvents) {
        finalScheduledEvents.push(...result.newScheduledEvents);
    }
    const baseNews = [...tycoonOps.news, ...uniqueNewNews, ...(stateWithSim.news ?? state.news)];
    const baseSocialFeed = [
        ...(socialAvailableForDate ? tycoonOps.socialFeed : []),
        ...uniqueNewPosts,
        ...(stateWithSim.socialFeed ?? state.socialFeed),
    ].slice(0, 500);
    const announcementState = publishDueNativeAnnouncements({
        ...stateWithSim,
        date: dateString,
        leagueStats: newLeagueStats,
        teams: finalTeams,
        players: updatedPlayers,
        news: baseNews,
        socialFeed: baseSocialFeed,
        scheduledEvents: finalScheduledEvents,
    } as GameState, dateString);

    return {
        ...pbaLifecyclePatch,
        day: isInstantAction ? state.day : (result.day || (stateWithSim.day + 1)),
        date: dateString,
        stats: newStats,
        leagueStats: newLeagueStats,
        historicalAwards: finalHistoricalAwards,
        historicalStats: [...state.historicalStats, historicalPoint].slice(-365),
        inbox: [...uniqueNewEmails, ...updatedInbox],
        chats: updatedChats,
        news: announcementState.news,
        socialFeed: announcementState.socialFeed,
        teams: finalTeams,
        nonNBATeams: tycoonOps.nonNBATeams,
        schedule: finalSchedule,
        players: updatedPlayers,
        draftPicks: updatedDraftPicks,
        christmasGames: result.christmasGames || state.christmasGames,
        globalGames: result.globalGames || state.globalGames,
        boxScores: finalBoxScores,
        history: shouldAppendActionHistory ? [...historyBase, actionHistoryEntry] : historyBase,
        isProcessing: false,
        processingAction: undefined,
        isWatchingGame: false,
        lastOutcome: state.gameMode === 'gm' ? null : (result.outcomeText || result.narrative),
        lastConsequence: finalConsequence,
        lastActionEffect: nativeActionEffect.effect,
        actionAffinities: nativeActionEffect.affinities,
        pendingHypnosis: [],
        pendingNarratives: [],
        commissionerLog: state.commissionerLog || [],
        payslips: [...(state.payslips || []), ...newPayslips],
        lastPayDate: newLastPayDate,
        hasUnreadPayslip: newPayslips.length > 0 ? true : (state.hasUnreadPayslip || false),
        scheduledEvents: announcementState.scheduledEvents,
        endorsedPlayers: result.endorsedPlayers || state.endorsedPlayers,
        allStar: pbaYearEndPreparedThisTurn ? pbaLifecyclePatch.allStar : allStarPatch,
        playoffs: playoffsPatch,
        seasonHistory: finalSeasonHistory,
        // ── Season history snapshot — mirrors lazySimRunner logic ─────────────
        ...(playoffsPatch?.bracketComplete && !state.playoffs?.bracketComplete && playoffsPatch.champion
          ? (() => {
              const champTid = playoffsPatch.champion;
              const finalsSeries = playoffsPatch.series?.find((s: any) => s.round === 4);
              const loserTid = finalsSeries
                ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
                : undefined;
              const yr = state.leagueStats.year;
              const champTeam = finalTeams.find(t => t.id === champTid);
              const loserTeam = loserTid != null ? finalTeams.find(t => t.id === loserTid) : undefined;
              const awards = finalHistoricalAwards ?? [];
              const seasonAward = (type: string) => awards.find((a: any) => a.season === yr && a.type === type);
              const entry: SeasonHistoryEntry = {
                year: yr,
                champion: champTeam?.name ?? 'Unknown',
                championTid: champTid,
                runnerUp: loserTeam?.name,
                runnerUpTid: loserTid,
                mvp: seasonAward('MVP')?.name,
                mvpPid: seasonAward('MVP')?.pid as string | undefined,
                finalsMvp: seasonAward('Finals MVP')?.name,
                finalsMvpPid: seasonAward('Finals MVP')?.pid as string | undefined,
                roty: seasonAward('ROY')?.name,
                rotyPid: seasonAward('ROY')?.pid as string | undefined,
                dpoy: seasonAward('DPOY')?.name,
                dpoyPid: seasonAward('DPOY')?.pid as string | undefined,
              };

              // Award toasts — one per award the season produced. The series matters here:
              // MVP/Finals MVP/DPOY/ROY fire whenever the winner is present in historicalAwards.
              const AWARD_LABELS: Record<string, string> = {
                'MVP':         'Most Valuable Player award',
                'Finals MVP':  'Finals MVP award',
                'Semifinals MVP': 'Semifinals MVP award',
                'DPOY':        'Defensive Player of the Year award',
                'ROY':         'Rookie of the Year award',
                'SMOY':        'Sixth Man of the Year award',
                'MIP':         'Most Improved Player award',
                'COY':         'Coach of the Year award',
                'All-NBA First Team':  'First Team All-League',
                'All-NBA Second Team': 'Second Team All-League',
                'All-NBA Third Team':  'Third Team All-League',
                'All-Defensive First Team': 'First Team All-Defensive',
                'All-Defensive Second Team': 'Second Team All-Defensive',
                'All-Rookie First Team': 'First Team All-Rookie',
                'All-Rookie Second Team': 'Second Team All-Rookie',
              };
              const pendingAwardToasts = awards
                .filter((a: any) => a.season === yr && AWARD_LABELS[a.type])
                .map((a: any) => {
                  const team = finalTeams.find(t => t.id === a.tid);
                  return {
                    playerName: a.name ?? 'Unknown',
                    teamName: team?.name ?? '',
                    teamAbbrev: team?.abbrev ?? '',
                    awardLabel: AWARD_LABELS[a.type],
                  };
                });

              // Championship playoffs toast — one line summary of the finals
              const champWins = finalsSeries
                ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.higherSeedWins : finalsSeries.lowerSeedWins)
                : 4;
              const loserWins = finalsSeries
                ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedWins : finalsSeries.higherSeedWins)
                : 0;
              const pendingPlayoffsToasts = champTeam && loserTeam
                ? [{
                    teamName: champTeam.region ?? champTeam.name ?? '',
                    body: `The ${champTeam.name} defeated the ${loserTeam.name} in the finals, ${champWins}-${loserWins}.`,
                  }]
                : [];

              return {
                seasonHistory: [
                  ...(finalSeasonHistory ?? state.seasonHistory ?? []).filter(e => e.year !== yr),
                  entry,
                ],
                pendingAwardToasts,
                pendingPlayoffsToasts,
                seasonLifecycle: lifecycleAfterSeasonCompletion({
                  ...state,
                  date: dateString,
                  leagueStats: newLeagueStats,
                  playoffs: playoffsPatch,
                  players: updatedPlayers,
                  teams: finalTeams,
                } as GameState, yr),
              };
            })()
          : {}),
        pendingClubDebuff: remainingDebuffs,
        nightlifeContacts: (result as any).nightlifeContacts ?? stateWithSim.nightlifeContacts ?? state.nightlifeContacts,
        headToHead: stateWithSim.headToHead,
        lastSimResults: allSimResults || [],
        prevTeams: state.teams,
        daysSimulated: daysToSimulate,
        bets: prunedBets,
        draftLotteryResult: pbaYearEndPreparedThisTurn || pbaYearEndStartedThisTurn
            ? pbaLifecyclePatch.draftLotteryResult
            : (result as any).draftLotteryResult ?? autoDraftLotteryResult ?? state.draftLotteryResult,
        draftComplete: pbaYearEndPreparedThisTurn || pbaYearEndStartedThisTurn
            ? pbaLifecyclePatch.draftComplete
            : autoDraftComplete ?? state.draftComplete,
        seasonLifecycle: autoSeasonLifecycle ?? stateWithSim.seasonLifecycle ?? state.seasonLifecycle,
        draftCombineResultsAvailableYear,
        pendingDraftCombineToast,
        ...(pbaYearEndPreparedThisTurn || pbaYearEndStartedThisTurn
            ? {
                activeDraftPicks: pbaLifecyclePatch.activeDraftPicks,
                activeDraftPassedPicks: pbaLifecyclePatch.activeDraftPassedPicks,
                activeDraftOrder: pbaLifecyclePatch.activeDraftOrder,
            }
            : {}),
        pendingElimToast: stateWithSim.pendingElimToast,
        pendingInjuryToasts: stateWithSim.pendingInjuryToasts,
        pendingFightToasts: (stateWithSim as any).pendingFightToasts,
        pendingFeatToasts: stateWithSim.pendingFeatToasts,
        pendingRecoveryToasts: stateWithSim.pendingRecoveryToasts,
        pendingSuspensionToasts: (stateWithSim as any).pendingSuspensionToasts,
        pendingDisciplineToasts,
        pendingOptionToasts: stateWithSim.pendingOptionToasts,
        pendingDeathToasts: (stateWithSim as any).pendingDeathToasts,
        faBidding: stateWithSim.faBidding,
        staff: (result as any).staff ?? stateWithSim.staff ?? state.staff,
        staffFreeAgents: finalStaffFreeAgents,
        pendingFAToasts: stateWithSim.pendingFAToasts,
        pendingFreeAgencySummary: stateWithSim.pendingFreeAgencySummary,
        pendingTransferMarketSummary: stateWithSim.pendingTransferMarketSummary,
        pendingFreeAgentAgentContact: stateWithSim.pendingFreeAgentAgentContact,
        pendingRFAOfferSheets: (stateWithSim as any).pendingRFAOfferSheets,
        pendingRFAMatchResolutions: (stateWithSim as any).pendingRFAMatchResolutions,
        pbaLocalFreeAgency: stateWithSim.pbaLocalFreeAgency,
        // Euro Transfer Market — the ticker mutates these inside simulationHandler
        // but the return whitelist gates what reaches setState. Without this
        // line, daysLeft decrement and AI accepts/rejects compute correctly
        // but get thrown away on merge.
        transferListings: stateWithSim.transferListings,
        transferBids: stateWithSim.transferBids,
        transferActivity: stateWithSim.transferActivity,
        pendingTransferToasts: (stateWithSim as any).pendingTransferToasts,
        loanOffers: stateWithSim.loanOffers,
        loanAgreements: stateWithSim.loanAgreements,
        pendingLoanToasts: stateWithSim.pendingLoanToasts,
        simCurrentDate: undefined,
        offseasonChecklist: stateWithSim.offseasonChecklist,
    };
};
