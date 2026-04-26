import { GameState, UserAction, HistoricalStatPoint, NBAPlayer as Player, DraftPick, Game, AllStarPlayer, PlayoffBracket, SeasonHistoryEntry } from '../../types';
import { PlayoffGenerator } from '../../services/playoffs/PlayoffGenerator';
import { PlayoffAdvancer } from '../../services/playoffs/PlayoffAdvancer';
import { normalizeDate, extractNbaId, extractTeamId, convertTo2KRating } from '../../utils/helpers';
import { genMoodTraits } from '../../utils/mood';
import { executeForcedTrade } from '../../services/tradeService';
import { generateSchedule } from '../../services/gameScheduler';
import { drawCupGroups } from '../../services/nbaCup/drawGroups';
import { injectCupGroupGames } from '../../services/nbaCup/scheduleInjector';
import { NBACupState } from '../../types';
import { handleStartGame } from './initialization';
import { handleAnnounceChange } from './announcements';
import { processAction } from './actionProcessor';
import { generatePaychecks } from '../../services/logic/financialService';

// New refactored modules
import { preProcessAction } from './turn/preProcessor';
import { runSimulation } from './turn/simulationHandler';
import { processSimulationResults } from './turn/postProcessor';
import { calculateNewStats } from './turn/statUpdater';
import { handleSocialAndNews } from './turn/socialHandler';
import { generateLazySimNews } from '../../services/news/lazySimNewsGenerator';
import { handleCommunication } from './turn/communicationHandler';
import { SettingsManager } from '../../services/SettingsManager';
import { resolveBets } from '../../services/logic/betResolver';
import { buildAutoResolveEvents } from '../../services/logic/lazySimRunner';
import { getDraftDate, getDraftLotteryDate } from '../../utils/dateUtils';

export { handleStartGame, handleAnnounceChange };

export const processTurn = async (
  state: GameState,
  action: UserAction,
  onSimComplete?: (simResults: any[]) => void,
  onGame?: (result: any) => void
) => {
    let executiveTradeTransactionRef = { current: null };

    // 1. Pre-process roster-altering actions
    let { stateForSim, executiveTradeTransaction } = await preProcessAction(state, action);
    if (executiveTradeTransaction) {
        executiveTradeTransactionRef.current = executiveTradeTransaction;
    }

    // §0 fix for SIMULATE_TO_DATE: if we're before Aug 14 with no regular-season schedule,
    // eagerly fire broadcasting/global_games/intl_preseason/schedule_generation so games
    // are in state before the sim loop runs — same preflight as runLazySim.
    if (action.type === 'SIMULATE_TO_DATE') {
        const targetNorm = normalizeDate(action.payload.targetDate);
        const hasRegularSeason = stateForSim.schedule.some(
            (g: any) => !g.isPreseason && !g.isPlayoff && !g.isPlayIn
        );
        if (!hasRegularSeason) {
            const eagerKeys = ['broadcasting_default', 'global_games', 'intl_preseason', 'schedule_generation'];
            const seasonYear = stateForSim.leagueStats.year;
            const firedEager = new Set<string>();
            for (const event of buildAutoResolveEvents(seasonYear, stateForSim.leagueStats)) {
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

    // 2. Determine days to simulate
    // Sim-tick actions (ADVANCE_DAY, SIMULATE_TO_DATE) always advance.
    // Trades are ALWAYS instant — clicking Finalize Deal must not fire a day sim or
    // open the game ticker, regardless of advanceDayOnTransaction. Other transactions
    // respect the setting (default off = instant).
    const isSimTick = action.type === 'ADVANCE_DAY' || action.type === 'SIMULATE_TO_DATE';
    const isInstantTrade = action.type === 'EXECUTIVE_TRADE' || action.type === 'FORCE_TRADE';
    // Signings are also instant — advancing the day skips scheduled games and can blow past the trade deadline.
    const isInstantAction = isInstantTrade || action.type === 'SIGN_FREE_AGENT' || action.type === 'EXERCISE_TEAM_OPTION' || action.type === 'DECLINE_TEAM_OPTION';
    const advanceOnTx = SettingsManager.getSettings().advanceDayOnTransaction;
    let daysToSimulate = 1;
    if (isInstantAction || (!isSimTick && !advanceOnTx)) {
        daysToSimulate = 0;
    }
    if (action.type === 'SIMULATE_TO_DATE') {
        const targetDateNorm = normalizeDate(action.payload.targetDate);
        const currentDateNorm = normalizeDate(stateForSim.date);
        const targetDate = new Date(`${targetDateNorm}T00:00:00Z`);
        const currentDate = new Date(`${currentDateNorm}T00:00:00Z`);
        const diffTime = targetDate.getTime() - currentDate.getTime();
        // Math.round to avoid DST/string-parse fractional-day drift.
        // diffDays-1: each loop iteration advances one day and sims that day's games,
        // so we want diffDays-1 iterations to stop ON targetDate with its games unplayed.
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        // BUG 3 FIX: use diffDays directly; each iteration sims AND advances date,
        // so diffDays iterations lands exactly on targetDate with its games simulated.
        daysToSimulate = Math.max(1, diffDays);

        const settings = SettingsManager.getSettings();
        const maxSimDays = (!settings.enableLLM)
            ? (settings.gameSpeed >= 8 ? 365 : 180)  // no LLM = generous cap
            : (settings.gameSpeed >= 8 ? 90 : 30);   // LLM on = keep reasonable
        if (daysToSimulate > maxSimDays) daysToSimulate = maxSimDays;
    }

    // 3. Run simulation
    const simStartNorm = normalizeDate(stateForSim.date);
    if (action.type === 'ADVANCE_DAY' || action.type === 'SIMULATE_TO_DATE') {
        console.log(`[PROCESS_TURN] ▶️ action=${action.type}, stateForSim.date=${stateForSim.date}, simStartNorm=${simStartNorm}, daysToSimulate=${daysToSimulate}`);
    }
    let { stateWithSim, allSimResults } = await runSimulation(stateForSim, daysToSimulate, action, onGame);
    if (action.type === 'ADVANCE_DAY' || action.type === 'SIMULATE_TO_DATE') {
        console.log(`[PROCESS_TURN] ✅ runSimulation returned state.date=${stateWithSim.date}, simResults=${allSimResults.length}`);
    }

    // 3b. Fire any auto-resolve calendar events crossed during this sim batch
    // (All-Star voting, schedule gen, award announcements, etc.)
    // Only for ADVANCE_DAY / SIMULATE_TO_DATE — not for action turns.
    if (action.type === 'ADVANCE_DAY' || action.type === 'SIMULATE_TO_DATE') {
        const simEndNorm = normalizeDate(stateWithSim.date);
        const seasonYear = stateWithSim.leagueStats.year;
        // Accumulate fired keys per season so re-runs across rollovers stay correct
        const firedKeys = new Set<string>();
        for (const event of buildAutoResolveEvents(seasonYear, stateWithSim.leagueStats)) {
            const compositeKey = `${seasonYear}:${event.key}`;
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

    // Fire callback with sim results BEFORE LLM call starts
    if (onSimComplete && allSimResults.length > 0) {
        onSimComplete(allSimResults);
    }

    // 4. Process action via LLM/Processor
    // Strip riggedForTid from payload — it's a sim-engine-only field and must not reach the LLM
    // (the LLM would misinterpret it as a "rig lottery" instruction and generate nonsense narrative)
    let actionForLLM = action;
    if ((action as any)?.payload?.riggedForTid !== undefined) {
        const { riggedForTid: _rig, ...restPayload } = (action as any).payload;
        actionForLLM = { ...action, payload: Object.keys(restPayload).length > 0 ? restPayload : undefined } as any;
    }
    const result = await processAction(stateWithSim, actionForLLM, executiveTradeTransactionRef, allSimResults, daysToSimulate);
    console.log('[GameLogic] result.newNews:', result?.newNews?.length);
    console.log('[GameLogic] result.newSocialPosts:', result?.newSocialPosts?.length);
    console.log('[GameLogic] result.newEmails:', result?.newEmails?.length);
    const executiveTradeTransactionFinal = executiveTradeTransactionRef.current;
    
    // 5. Post-process simulation results (injuries, stats)
    let { updatedPlayers, updatedDraftPicks, recoveries } = processSimulationResults(allSimResults, result.players || stateWithSim.players, result.draftPicks || stateWithSim.draftPicks, stateWithSim.schedule, stateWithSim.leagueStats?.year);

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
            state.draftPicks
        );
        forcedTradeTransaction = tradeResult.transaction;
        forcedTradeAnnouncements = tradeResult.announcements;
    }

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
                    teamAssets.playersSent.forEach(ps => {
                        p = p.map(player => player.internalId === ps.internalId ? { ...player, tid: destTid } : player);
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
    const { uniqueNewPosts, uniqueNewNews } = await handleSocialAndNews(state, result, allSimResults, updatedPlayers, stateWithSim.teams, daysToSimulate, stateWithSim.date);

    // Supplement with template-based news (always fires, LLM-agnostic) — same engine as lazy sim batches
    if (allSimResults.length > 0) {
        const reportedInjuries = new Set<string>(state.news.map((n: any) => n.injuryPlayerId).filter(Boolean));
        const templateNews = generateLazySimNews(stateWithSim.teams, updatedPlayers, allSimResults, stateWithSim.date, reportedInjuries, false, state.teams, stateWithSim.playoffs, stateWithSim.schedule, stateWithSim.leagueStats?.year ?? 2026);
        const existingIds = new Set([...state.news.map((n: any) => n.id), ...uniqueNewNews.map((n: any) => n.id)]);
        templateNews.filter(n => !existingIds.has(n.id)).forEach(n => uniqueNewNews.push(n));
    }

    console.log('[GameLogic] uniqueNewNews:', uniqueNewNews?.length);
    console.log('[GameLogic] uniqueNewPosts:', uniqueNewPosts?.length);

    // 8. Handle Financials (Paychecks)
    // Instant trades (EXECUTIVE_TRADE / FORCE_TRADE) stay on the current day — executing
    // a trade should not silently roll the calendar forward.
    const daysToAdvance = isInstantAction
        ? 0
        : (result.day || (stateWithSim.day + 1)) - state.day;
    // Timezone-safe: normalise state.date to YYYY-MM-DD, advance via UTC methods
    const currentNormForDate = normalizeDate(state.date);
    const finalDateObj = new Date(`${currentNormForDate}T00:00:00Z`);
    finalDateObj.setUTCDate(finalDateObj.getUTCDate() + daysToAdvance);

    const paycheckResult = generatePaychecks(state.lastPayDate, finalDateObj.toISOString(), state.salary || 10000000);
    const { newPayslips, totalNetPay, newLastPayDate } = paycheckResult;

    // 9. Calculate New Stats and Approval
    const dateString = finalDateObj.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'short', day: 'numeric', year: 'numeric'
    });
    let { newStats, newLeagueStats, combinedStatChanges } = calculateNewStats(state, action, result, allSimResults, totalNetPay, dateString);

    // 10. Handle Communication (Emails and Chats)
    const { uniqueNewEmails, updatedInbox, updatedChats } = handleCommunication(state, action, result, dateString);

    // 11. Finalize state
    const historicalPoint: HistoricalStatPoint = {
        date: dateString,
        publicApproval: newStats.publicApproval,
        ownerApproval: newStats.ownerApproval,
        playerApproval: newStats.playerApproval,
        legacy: newStats.legacy,
        revenue: newLeagueStats.revenue,
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

    // Schedule generation — fires ONCE on Aug 14 (Schedule Release Day).
    // Christmas games, Global Games, and Intl Preseason are stored in state during Aug 6-13
    // and consumed here. No mid-season regenerations.
    let finalSchedule = stateWithSim.schedule;
    const normalizedFinalDate = normalizeDate(dateString);
    // Exclude isNBACup so a Cup-only schedule (e.g. self-heal injected groups
    // after rollover before Aug 14) doesn't masquerade as a generated season.
    const hasRegularSeasonGames = finalSchedule.some(g => !(g as any).isPreseason && !(g as any).isPlayoff && !(g as any).isPlayIn && !(g as any).isNBACup);
    const scheduleYear = state.leagueStats?.year ?? 2026;
    if (!hasRegularSeasonGames && normalizedFinalDate >= `${scheduleYear - 1}-08-14`) {
        console.log(`[Schedule] GENERATING on Aug14 — christmas=${(result.christmasGames || state.christmasGames)?.length ?? 0} global=${(result.globalGames || state.globalGames)?.length ?? 0}`);
        // Preserve any intl preseason games added before Aug 14
        const intlPreseasonGames = finalSchedule.filter(g => (g as any).isPreseason && (g.homeTid >= 100 || g.awayTid >= 100));
        let _cupGroups = (state.leagueStats.inSeasonTournament !== false) ? (state.nbaCup?.groups ?? []) : [];
        let _inlineCupPatch: NBACupState | undefined;
        if (state.leagueStats.inSeasonTournament !== false && _cupGroups.length === 0) {
            const prevStandings = state.teams.map(t => ({ tid: t.id, wins: t.wins, losses: t.losses }));
            _cupGroups = drawCupGroups(state.teams, prevStandings, state.saveId ?? 'default', scheduleYear);
            _inlineCupPatch = { year: scheduleYear, status: 'group', groups: _cupGroups, wildcards: { East: null, West: null }, knockout: [] };
        }
        finalSchedule = generateSchedule(state.teams, result.christmasGames || state.christmasGames, result.globalGames || state.globalGames, state.leagueStats.numGamesDiv ?? null, state.leagueStats.numGamesConf ?? null, state.leagueStats.mediaRights, scheduleYear, _cupGroups.length > 0 ? _cupGroups : undefined, state.saveId);
        if (_inlineCupPatch) { stateWithSim = { ...stateWithSim, nbaCup: _inlineCupPatch }; }
        if (intlPreseasonGames.length > 0) {
            // Re-gid to avoid collisions with schedule gids (which start from 0)
            const maxGid = Math.max(0, ...finalSchedule.map(g => g.gid));
            const renumbered = intlPreseasonGames.map((g, i) => ({ ...g, gid: maxGid + 1 + i }));
            finalSchedule = [...finalSchedule, ...renumbered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }
        console.log(`[Schedule] Generated: ${finalSchedule.length} total games (${intlPreseasonGames.length} intl preseason preserved)`);
    }

    // ── Self-heal: schedule already exists but Cup games never got tagged ────
    // Catches saves that generated their schedule before the Cup-injection fix
    // (e.g., the first NBA Cup ship had a saveId guard bug). Idempotent.
    if (
      hasRegularSeasonGames &&
      state.leagueStats.inSeasonTournament !== false &&
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
            state.saveId || 'default', scheduleYear - 1, scheduledDates,
            { excludeFromRecord: true },  // retro-injected: don't inflate the 82-game RS
        );
        if (result.games.length > 0) {
            console.log(`[Schedule] Self-heal injected ${result.games.length} Cup games`);
            finalSchedule = [...finalSchedule, ...result.games].sort(
                (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
            );
        }
    }

    if (action.type === 'ADD_PRESEASON_INTERNATIONAL') {
        const { games } = action.payload;
        const newGames: Game[] = games.map((game: any, index: number) => ({
            gid: Math.max(0, ...finalSchedule.map(g => g.gid)) + 1 + index,
            homeTid: game.teamId,
            awayTid: game.opponentId,
            homeScore: 0,
            awayScore: 0,
            played: false,
            date: new Date(game.date).toISOString(),
            isPreseason: true,
            city: game.city,
            country: game.country
        }));
        finalSchedule = [...finalSchedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    const normalizedCurrentDate = normalizeDate(state.date);
    const finalScheduledEvents = (state.scheduledEvents || []).filter(e => normalizeDate(e.date) !== normalizedCurrentDate);
    if (result.newScheduledEvents) {
        finalScheduledEvents.push(...result.newScheduledEvents);
    }

    const boxScoresWithDate = allSimResults.map(r => ({ ...r, date: r.date || state.date, season: state.leagueStats.year }));

    // All-Star Logic
    let allStarPatch = state.allStar;
    const { getAllStarWeekendDates, AllStarWeekendOrchestrator } = await import('../../services/allStar/AllStarWeekendOrchestrator');
    const { AllStarSelectionService } = await import('../../services/allStar/AllStarSelectionService');
    const startDate = new Date(state.date);
    const endDate = new Date(dateString);
    const dates = getAllStarWeekendDates(state.leagueStats.year);

    // Helper to check if a specific date was hit or passed during this turn.
    // Uses YYYY-MM-DD string comparison (lexicographic = correct for ISO dates)
    // to avoid local-timezone drift from new Date() + setHours().
    const startNormStr = normalizeDate(state.date);
    const endNormStr = normalizeDate(dateString);
    const wasDateReached = (targetDate: Date) => {
        const targetNorm = normalizeDate(targetDate.toISOString());
        return targetNorm >= startNormStr && targetNorm <= endNormStr;
    };

    // 1. Accumulate votes during voting period
    if (endDate >= dates.votingStart && startDate <= dates.votingEnd) {
        const votingStartInTurn = startDate < dates.votingStart ? dates.votingStart : startDate;
        const votingEndInTurn = endDate > dates.votingEnd ? dates.votingEnd : endDate;
        const votingDays = Math.max(1, Math.ceil((votingEndInTurn.getTime() - votingStartInTurn.getTime()) / (1000 * 60 * 60 * 24)));
        
        const updatedVotes = AllStarSelectionService.simulateVotingPeriod(
            updatedPlayers,
            stateWithSim.teams,
            state.leagueStats.year,
            endDate,
            state.allStar?.votes ?? [],
            votingDays
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
    if (wasDateReached(dates.startersAnnounced) && !allStarPatch?.startersAnnounced) {
        const starters = AllStarSelectionService.selectStarters(allStarPatch?.votes ?? [], updatedPlayers);
        allStarPatch = {
            ...(allStarPatch || {}),
            roster: starters,
            startersAnnounced: true,
        } as any;

        uniqueNewNews.push({
            id: `allstar-starters-${Date.now()}`,
            headline: 'All-Star Starters Announced!',
            content: `The fans have spoken. The starters for the ${state.leagueStats.year} All-Star Game have been revealed: ${starters.map(s => s.playerName).join(', ')}.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    // 3. Announce Reserves & Rising Stars
    if (wasDateReached(dates.reservesAnnounced) && !allStarPatch?.reservesAnnounced) {
        const reserves = AllStarSelectionService.selectReserves(
            updatedPlayers,
            stateWithSim.teams,
            state.leagueStats.year,
            allStarPatch?.roster ?? []
        );
        const fullRoster = [...(allStarPatch?.roster ?? []), ...reserves];
        
        // Also build Rising Stars roster now (FIX 5)
        const { rookies, sophs } = AllStarSelectionService.getRisingStarsRoster(
            updatedPlayers,
            state.leagueStats.year
        );
        const getCategory = (pos: string): 'Guard' | 'Frontcourt' => (pos === 'G' || pos === 'PG' || pos === 'SG') ? 'Guard' : 'Frontcourt';
        const risingStarsRoster: any[] = [
            ...rookies.map(p => {
                const team = stateWithSim.teams.find(t => t.id === p.tid);
                return {
                    playerId: p.internalId,
                    nbaId: extractNbaId(p.imgURL || "", p.name),
                    playerName: p.name,
                    teamAbbrev: team?.abbrev || '',
                    teamNbaId: team ? extractTeamId(team.logoUrl, team.abbrev) : null,
                    conference: team?.conference || '',
                    isStarter: true,
                    position: p.pos || 'F',
                    category: getCategory(p.pos || 'F'),
                    isRookie: true,
                    ovr: convertTo2KRating(p.overallRating ?? 50, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50, p.ratings?.[p.ratings.length - 1]?.tp)
                };
            }),
            ...sophs.map(p => {
                const team = stateWithSim.teams.find(t => t.id === p.tid);
                return {
                    playerId: p.internalId,
                    nbaId: extractNbaId(p.imgURL || "", p.name),
                    playerName: p.name,
                    teamAbbrev: team?.abbrev || '',
                    teamNbaId: team ? extractTeamId(team.logoUrl, team.abbrev) : null,
                    conference: team?.conference || '',
                    isStarter: true,
                    position: p.pos || 'F',
                    category: getCategory(p.pos || 'F'),
                    isRookie: false,
                    ovr: convertTo2KRating(p.overallRating ?? 50, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50, p.ratings?.[p.ratings.length - 1]?.tp)
                };
            })
        ];

        // Select Rising Stars Team Names
        const broadcasters = ['Chuck', 'Shaq', 'Kenny', 'Ernie', 'Shannon', 'Stephen A', 'Wilbon', 'Rose', 'Malika', 'JJ', 'Richard', 'Channing', 'Draymond', 'Candace'];
        const shuffled = [...broadcasters].sort(() => 0.5 - Math.random());
        const rsTeam1 = `Team ${shuffled[0]}`;
        const rsTeam2 = `Team ${shuffled[1]}`;

        allStarPatch = {
            ...(allStarPatch || {}),
            roster: fullRoster,
            reservesAnnounced: true,
            risingStarsRoster,
            risingStarsAnnounced: true,
            risingStarsTeams: [rsTeam1, rsTeam2]
        } as any;

        uniqueNewNews.push({
            id: `allstar-reserves-${Date.now()}`,
            headline: 'Full All-Star Rosters Revealed',
            content: `The coaches have made their picks. The full rosters for the ${state.leagueStats.year} All-Star Weekend are now set.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    // 3.1 Announce Celebrity Game
    if (wasDateReached((dates as any).celebrityAnnounced) && !allStarPatch?.celebrityAnnounced) {
        const { fetchRatedCelebrities } = await import('../../data/celebrities');
        const celebs = await fetchRatedCelebrities();
        const shuffled = [...celebs].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 20).map(c => c.name);
        
        const broadcasters = ['Shannon', 'Stephen A', 'Chuck', 'Shaq', 'Kenny', 'Ernie', 'Draymond', 'JJ', 'Richard', 'Channing'];
        const shuffledBroadcasters = [...broadcasters].sort(() => 0.5 - Math.random());
        const celebTeams = [`Team ${shuffledBroadcasters[0]}`, `Team ${shuffledBroadcasters[1]}`];

        newLeagueStats = {
            ...newLeagueStats,
            celebrityRoster: selected,
            celebrityRosterAutoSelected: true
        };

        allStarPatch = {
            ...(allStarPatch || {}),
            celebrityAnnounced: true,
            celebrityTeams: celebTeams,
            celebrityRoster: selected
        } as any;

        uniqueNewNews.push({
            id: `allstar-celeb-${Date.now()}`,
            headline: 'Celebrity Game Roster Announced!',
            content: `The stars are coming to town! Captains ${shuffledBroadcasters[0]} and ${shuffledBroadcasters[1]} will lead teams featuring ${selected.slice(0, 3).join(', ')} and more.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    // 3.2 Announce Dunk Contest
    if (wasDateReached((dates as any).dunkContestAnnounced) && !allStarPatch?.dunkContestAnnounced) {
        const { AllStarDunkContestSim } = await import('../../services/allStar/AllStarDunkContestSim');
        const contestants = AllStarDunkContestSim.selectContestants(updatedPlayers);
        allStarPatch = {
            ...(allStarPatch || {}),
            dunkContestContestants: contestants,
            dunkContestAnnounced: true,
        } as any;

        uniqueNewNews.push({
            id: `allstar-dunk-${Date.now()}`,
            headline: 'Dunk Contest Field Set!',
            content: contestants.length > 0 
                ? `The high-flyers are ready. The participants for the ${state.leagueStats.year} Slam Dunk Contest are: ${contestants.map(p => p.name).join(', ')}.`
                : `The high-flyers are ready. The participants for the ${state.leagueStats.year} Slam Dunk Contest have been selected and are ready to put on a show.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    // 3.3 Announce 3-Point Contest
    if (wasDateReached((dates as any).threePointAnnounced) && !allStarPatch?.threePointAnnounced) {
        const { AllStarThreePointContestSim } = await import('../../services/allStar/AllStarThreePointContestSim');
        const contestants = AllStarThreePointContestSim.selectContestants(updatedPlayers, state.leagueStats.year);
        allStarPatch = {
            ...(allStarPatch || {}),
            threePointContestants: contestants,
            threePointAnnounced: true,
        } as any;

        uniqueNewNews.push({
            id: `allstar-3pt-${Date.now()}`,
            headline: '3-Point Contest Participants Revealed',
            content: `The best shooters in the world will face off. The field for the ${state.leagueStats.year} 3-Point Contest includes: ${contestants.map(p => p.name).join(', ')}.`,
            date: dateString,
            type: 'league',
            read: false
        } as any);
    }

    // 4. Inject Games
    if (wasDateReached(dates.breakStart) && !allStarPatch?.gamesInjected) {
        finalSchedule = AllStarWeekendOrchestrator.injectAllStarGames(
            finalSchedule,
            stateWithSim.teams,
            state.leagueStats.year,
            allStarPatch?.roster ?? [],
            state.leagueStats
        );
        const win = AllStarWeekendOrchestrator.getBreakWindowStrings(state.leagueStats.year);
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
    const simFriday = endDateNormStr > risingStarsNorm && !allStarPatch?.risingStarsGameId;
    const simSaturday = endDateNormStr > saturdayNorm &&
      (!allStarPatch?.dunkContest?.complete || !allStarPatch?.threePointContest?.complete);
    const simSunday = endDateNormStr > allStarGameNorm && !allStarPatch?.allStarGameId;

    if ((simFriday || simSaturday || simSunday) && !allStarPatch?.weekendComplete) {
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
    }

    // ── PLAYOFFS LOGIC ────────────────────────────────────────────────────────
    // Prefer stateWithSim.playoffs — runSimulation may have already generated/advanced
    // the bracket inside its day loop (handles multi-day sims that cross April 13).
    let playoffsPatch: PlayoffBracket | undefined = stateWithSim.playoffs ?? state.playoffs;
    const currentDateNorm2 = normalizeDate(dateString);

    // 1. Generate bracket when regular season ends (around Apr 14)
    const playoffSeasonYear = state.leagueStats?.year ?? 2026;
    if (!playoffsPatch && currentDateNorm2 >= `${playoffSeasonYear}-04-13`) {
        const numGamesPerRound = state.leagueStats.numGamesPlayoffSeries ?? [7, 7, 7, 7];
        playoffsPatch = PlayoffGenerator.generateBracket(
            stateWithSim.teams,
            state.leagueStats.year,
            numGamesPerRound
        );
    }

    // 2. Inject play-in games into the schedule once bracket is created
    if (playoffsPatch && !playoffsPatch.gamesInjected) {
        const playInStart = new Date(`${playoffSeasonYear}-04-15T00:00:00Z`);
        const maxGid = Math.max(0, ...finalSchedule.map(g => g.gid));
        const playInGamesToInject = PlayoffGenerator.injectPlayInGames(
            playoffsPatch.playInGames,
            playInStart,
            maxGid
        );
        finalSchedule = [...finalSchedule, ...playInGamesToInject]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        playoffsPatch = { ...playoffsPatch, gamesInjected: true };
    }

    // 3. Advance bracket based on today's playoff/play-in results
    // NOTE: simulationHandler.ts (runSimulation) already calls applyPlayoffLogic per-day
    // inside its loop, so stateWithSim.playoffs already has the correctly advanced bracket.
    // Only run here if simulationHandler did NOT handle it (stateWithSim.playoffs is still
    // the same reference as state.playoffs — i.e., the bracket was just generated above in step 1).
    const simHandledPlayoffs = stateWithSim.playoffs != null && stateWithSim.playoffs !== state.playoffs;
    if (!simHandledPlayoffs && playoffsPatch && allSimResults.length > 0) {
        const playoffResults = allSimResults.filter(r => {
            const game = finalSchedule.find(g => g.gid === r.gameId);
            return game && (game.isPlayoff || game.isPlayIn);
        });
        if (playoffResults.length > 0) {
            const numGamesPerRound = state.leagueStats.numGamesPlayoffSeries ?? [7, 7, 7, 7];
            const { bracket: newBracket, newGames } = PlayoffAdvancer.advance(
                playoffsPatch,
                playoffResults,
                finalSchedule,
                numGamesPerRound
            );
            playoffsPatch = newBracket;
            if (newGames.length > 0) {
                finalSchedule = [...finalSchedule, ...newGames]
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            }
        }
    }
    // 4. Inject loser play-in games whose teams are now determined but not yet scheduled
    if (playoffsPatch) {
        for (const pig of playoffsPatch.playInGames) {
            if (pig.gameType === 'loserGame' && pig.team1Tid > 0 && pig.team2Tid > 0 && !pig.gameId) {
                const maxGid = Math.max(0, ...finalSchedule.map(g => g.gid));
                const playInStart = new Date(`${playoffSeasonYear}-04-15T00:00:00Z`);
                const dayOffset = pig.conference === 'East' ? 3 : 4;
                const gameDate = new Date(playInStart);
                gameDate.setDate(gameDate.getDate() + dayOffset);
                const newGid = maxGid + 1;
                const loserGame: Game = {
                    gid: newGid,
                    homeTid: pig.team1Tid,
                    awayTid: pig.team2Tid,
                    homeScore: 0,
                    awayScore: 0,
                    played: false,
                    date: gameDate.toISOString(),
                    isPlayIn: true,
                    isPlayoff: false,
                    playoffSeriesId: pig.id,
                };
                finalSchedule = [...finalSchedule, loserGame].sort(
                    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                );
                playoffsPatch = {
                    ...playoffsPatch,
                    playInGames: playoffsPatch.playInGames.map(p =>
                        p.id === pig.id ? { ...p, gameId: newGid } : p
                    ),
                };
            }
        }
    }
    // ── END PLAYOFFS LOGIC ────────────────────────────────────────────────────

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

    // ── Draft Lottery & Draft Auto-Fire ──────────────────────────────────────
    // autoRunLottery / autoRunDraft only fire inside lazySimRunner's event loop.
    // For ADVANCE_DAY / SIMULATE_TO_DATE (PlayoffView, Schedule "To Date", daily sim)
    // we must replicate them here using the same wasDateReached() helper.
    const draftYear = state.leagueStats?.year ?? 2026;
    let autoDraftLotteryResult = state.draftLotteryResult;
    let autoDraftComplete = state.draftComplete;

    if (wasDateReached(getDraftLotteryDate(draftYear, state.leagueStats)) && !autoDraftLotteryResult) {
        try {
            const { autoRunLottery } = await import('../../services/logic/autoResolvers');
            const patch = autoRunLottery({ ...state, players: updatedPlayers } as any);
            if ((patch as any).draftLotteryResult) {
                autoDraftLotteryResult = (patch as any).draftLotteryResult;
                uniqueNewNews.push({
                    id: `auto-lottery-gl-${Date.now()}`,
                    headline: 'Draft Lottery Complete',
                    content: 'The NBA Draft Lottery has concluded. View the Draft Lottery tab for full results.',
                    date: dateString, type: 'league', read: false, isNew: true,
                } as any);
            }
        } catch (e) { console.warn('[GameLogic] autoRunLottery failed:', e); }
    }

    // ── Hall of Fame Induction (first Saturday of September, prior year) ───
    // Fires once per season for the Class of (seasonYear - 1). Guarded by news-id.
    const hofClassYear = draftYear - 1;
    const hofAlready = (state.news ?? []).some(n => (n as any).id?.startsWith(`hof-class-${hofClassYear}-`));
    const { getHOFCeremonyDate } = await import('../../services/playerDevelopment/hofChecker');
    const hofCeremonyDate = getHOFCeremonyDate(hofClassYear);
    if (wasDateReached(hofCeremonyDate) && !hofAlready) {
        try {
            const { autoInductHOFClass } = await import('../../services/logic/autoResolvers');
            const patch = await autoInductHOFClass({ ...state, players: updatedPlayers } as any);
            // Carry over the hof=true / hofInductionYear flags set on in-game players
            if ((patch as any).players) updatedPlayers = (patch as any).players;
            if ((patch as any).news) {
                // Splice in only the newly-added HOF items (everything in the patch before the existing news)
                const existingIds = new Set((state.news ?? []).map((n: any) => n.id));
                const freshHofNews = ((patch as any).news as any[]).filter(n => !existingIds.has(n.id));
                uniqueNewNews.push(...freshHofNews);
            }
        } catch (e) { console.warn('[GameLogic] autoInductHOFClass failed:', e); }
    }

    if (wasDateReached(getDraftDate(draftYear, state.leagueStats)) && !autoDraftComplete) {
        try {
            const { autoRunDraft } = await import('../../services/logic/autoResolvers');
            const patch = autoRunDraft({ ...state, players: updatedPlayers, draftLotteryResult: autoDraftLotteryResult } as any);
            if ((patch as any).players) updatedPlayers = (patch as any).players;
            if ((patch as any).draftComplete) {
                autoDraftComplete = true;
                uniqueNewNews.push({
                    id: `auto-draft-gl-${Date.now()}`,
                    headline: 'NBA Draft Complete',
                    content: 'The NBA Draft has concluded. All prospects have been assigned to teams. Undrafted players are now free agents.',
                    date: dateString, type: 'league', read: false, isNew: true,
                } as any);
            }
        } catch (e) { console.warn('[GameLogic] autoRunDraft failed:', e); }
    }

    return {
        day: isInstantAction ? state.day : (result.day || (stateWithSim.day + 1)),
        date: dateString,
        stats: newStats,
        leagueStats: newLeagueStats,
        historicalStats: [...state.historicalStats, historicalPoint].slice(-365),
        inbox: [...uniqueNewEmails, ...updatedInbox],
        chats: updatedChats,
        news: [...uniqueNewNews, ...(stateWithSim.news ?? state.news)],
        socialFeed: [...uniqueNewPosts, ...state.socialFeed].slice(0, 500),
        teams: result.teams || stateWithSim.teams,
        schedule: finalSchedule,
        players: updatedPlayers,
        draftPicks: updatedDraftPicks,
        christmasGames: result.christmasGames || state.christmasGames,
        globalGames: result.globalGames || state.globalGames,
        boxScores: (() => {
            const existingKeys = new Set((state.boxScores || []).map(b => `${b.season ?? 0}-${b.gameId}`));
            const deduped = boxScoresWithDate.filter(b => !existingKeys.has(`${b.season ?? 0}-${b.gameId}`));
            return [...(state.boxScores || []), ...deduped];
        })(),
        history: [...(stateWithSim.history ?? state.history), { text: result.outcomeText || '', date: dateString, commissioner: true, type: (() => {
            switch (action.type) {
                case 'EXECUTIVE_TRADE':
                case 'FORCE_TRADE': return 'Trade';
                case 'SIGN_FREE_AGENT': return 'Signing';
                case 'WAIVE_PLAYER': return 'Waive';
                case 'EXERCISE_TEAM_OPTION': return 'Re-signing';
                case 'DECLINE_TEAM_OPTION': return 'Waive';
                case 'SUSPEND_PLAYER': return 'Suspension';
                case 'FIRE_PERSONNEL': return 'Personnel';
                case 'SIMULATE_TO_DATE': return 'Simulation';
                case 'INVITE_DINNER': return action.payload?.subType === 'movie' ? 'Movie Night' : 'Dinner';
                case 'GO_TO_CLUB': return 'Night Out';
                case 'TRAVEL': return 'Travel';
                case 'INVITE_PERFORMANCE': return 'Performance';
                case 'DRUG_TEST_PERSON': return 'Drug Test';
                case 'FINE_PERSON': return 'Fine';
                case 'BRIBE_PERSON': return 'Bribe';
                case 'GIVE_MONEY': return 'Finance';
                case 'TRANSFER_FUNDS': return 'Finance';
                case 'SABOTAGE_PLAYER': return 'Sabotage';
                case 'LEAK_SCANDAL': return 'Leak';
                case 'HYPNOTIZE':
                case 'HYPNOTIC_BROADCAST': return 'Covert Op';
                case 'GLOBAL_GAMES': return 'Global Games';
                case 'ENDORSE_HOF': return 'HOF';
                case 'RIG_LOTTERY': return 'Lottery';
                case 'VISIT_NON_NBA_TEAM': return 'Travel';
                default: return 'League Event';
            }
        })() } as any],
        isProcessing: false,
        isWatchingGame: false,
      lastOutcome: state.gameMode === 'gm' ? null : (result.outcomeText || result.narrative),
        lastConsequence: finalConsequence,
        pendingHypnosis: [],
        pendingNarratives: [],
        commissionerLog: state.commissionerLog || [],
        payslips: [...(state.payslips || []), ...newPayslips],
        lastPayDate: newLastPayDate,
        hasUnreadPayslip: newPayslips.length > 0 ? true : (state.hasUnreadPayslip || false),
        scheduledEvents: finalScheduledEvents,
        endorsedPlayers: result.endorsedPlayers || state.endorsedPlayers,
        allStar: allStarPatch,
        playoffs: playoffsPatch,
        // ── Season history snapshot — mirrors lazySimRunner logic ─────────────
        ...(playoffsPatch?.bracketComplete && !state.playoffs?.bracketComplete && playoffsPatch.champion
          ? (() => {
              const champTid = playoffsPatch.champion;
              const finalsSeries = playoffsPatch.series?.find((s: any) => s.round === 4);
              const loserTid = finalsSeries
                ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
                : undefined;
              const yr = state.leagueStats.year;
              const champTeam = stateWithSim.teams.find(t => t.id === champTid);
              const loserTeam = loserTid != null ? stateWithSim.teams.find(t => t.id === loserTid) : undefined;
              const awards = state.historicalAwards ?? [];
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
              };
              const pendingAwardToasts = awards
                .filter((a: any) => a.season === yr && AWARD_LABELS[a.type])
                .map((a: any) => {
                  const team = stateWithSim.teams.find(t => t.id === a.tid);
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
                  ...(state.seasonHistory ?? []).filter(e => e.year !== yr),
                  entry,
                ],
                pendingAwardToasts,
                pendingPlayoffsToasts,
              };
            })()
          : {}),
        pendingClubDebuff: remainingDebuffs,
        headToHead: stateWithSim.headToHead,
        lastSimResults: allSimResults || [],
        prevTeams: state.teams,
        daysSimulated: daysToSimulate,
        bets: prunedBets,
        draftLotteryResult: (result as any).draftLotteryResult ?? autoDraftLotteryResult ?? state.draftLotteryResult,
        draftComplete: autoDraftComplete ?? state.draftComplete,
        pendingElimToast: stateWithSim.pendingElimToast,
        pendingInjuryToasts: stateWithSim.pendingInjuryToasts,
        pendingFeatToasts: stateWithSim.pendingFeatToasts,
        pendingRecoveryToasts: stateWithSim.pendingRecoveryToasts,
        pendingOptionToasts: stateWithSim.pendingOptionToasts,
        simCurrentDate: undefined,
    };
};
