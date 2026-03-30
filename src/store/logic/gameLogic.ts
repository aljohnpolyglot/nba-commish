import { GameState, UserAction, HistoricalStatPoint, NBAPlayer as Player, DraftPick, Game, AllStarPlayer, PlayoffBracket } from '../../types';
import { PlayoffGenerator } from '../../services/playoffs/PlayoffGenerator';
import { PlayoffAdvancer } from '../../services/playoffs/PlayoffAdvancer';
import { normalizeDate, extractNbaId, extractTeamId, convertTo2KRating } from '../../utils/helpers';
import { genMoodTraits } from '../../utils/mood';
import { executeForcedTrade } from '../../services/tradeService';
import { generateSchedule } from '../../services/gameScheduler';
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
import { handleCommunication } from './turn/communicationHandler';
import { SettingsManager } from '../../services/SettingsManager';
import { resolveBets } from '../../services/logic/betResolver';

export { handleStartGame, handleAnnounceChange };

export const processTurn = async (
  state: GameState,
  action: UserAction,
  onSimComplete?: (simResults: any[]) => void
) => {
    let executiveTradeTransactionRef = { current: null };
    
    // 1. Pre-process roster-altering actions
    const { stateForSim, executiveTradeTransaction } = await preProcessAction(state, action);
    if (executiveTradeTransaction) {
        executiveTradeTransactionRef.current = executiveTradeTransaction;
    }

    // 2. Determine days to simulate
    let daysToSimulate = 1;
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
    const { stateWithSim, allSimResults } = runSimulation(stateForSim, daysToSimulate, action);

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
    let { updatedPlayers, updatedDraftPicks } = processSimulationResults(allSimResults, result.players || stateWithSim.players, result.draftPicks || stateWithSim.draftPicks, stateWithSim.schedule);

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
    console.log('[GameLogic] uniqueNewNews:', uniqueNewNews?.length);
    console.log('[GameLogic] uniqueNewPosts:', uniqueNewPosts?.length);

    // 8. Handle Financials (Paychecks)
    const daysToAdvance = (result.day || (stateWithSim.day + 1)) - state.day;
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

    // Schedule generation
    let finalSchedule = stateWithSim.schedule;
    const normalizedFinalDate = normalizeDate(dateString);
    if (finalSchedule.length === 0 && normalizedFinalDate === '2025-08-14') {
        finalSchedule = generateSchedule(state.teams, result.christmasGames || state.christmasGames, result.globalGames || state.globalGames, state.leagueStats.divisionGames, state.leagueStats.conferenceGames);
    } else if (finalSchedule.length > 0 && !finalSchedule.some(g => g.played) && (action.type === 'SET_CHRISTMAS_GAMES' || action.type === 'GLOBAL_GAMES')) {
        finalSchedule = generateSchedule(state.teams, result.christmasGames || state.christmasGames, result.globalGames || state.globalGames, state.leagueStats.divisionGames, state.leagueStats.conferenceGames);
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

    const boxScoresWithDate = allSimResults.map(r => ({ ...r, date: r.date || state.date }));

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
                    ovr: convertTo2KRating(p.overallRating ?? 50, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50)
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
                    ovr: convertTo2KRating(p.overallRating ?? 50, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50)
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
            const existingIds = new Set(
                [...(state.boxScores || []), ...boxScoresWithDate].map(bs => bs.gameId)
            );
            const newBoxScores = weekendUpdate.boxScores.filter(bs => !existingIds.has(bs.gameId));
            boxScoresWithDate.push(...newBoxScores);
        }
    }

    // ── PLAYOFFS LOGIC ────────────────────────────────────────────────────────
    // Prefer stateWithSim.playoffs — runSimulation may have already generated/advanced
    // the bracket inside its day loop (handles multi-day sims that cross April 13).
    let playoffsPatch: PlayoffBracket | undefined = stateWithSim.playoffs ?? state.playoffs;
    const currentDateNorm2 = normalizeDate(dateString);

    // 1. Generate bracket when regular season ends (around Apr 14)
    if (!playoffsPatch && currentDateNorm2 >= '2026-04-13') {
        const numGamesPerRound = state.leagueStats.numGamesPlayoffSeries ?? [7, 7, 7, 7];
        playoffsPatch = PlayoffGenerator.generateBracket(
            stateWithSim.teams,
            state.leagueStats.year,
            numGamesPerRound
        );
    }

    // 2. Inject play-in games into the schedule once bracket is created
    if (playoffsPatch && !playoffsPatch.gamesInjected) {
        const playInStart = new Date('2026-04-15T00:00:00Z');
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
    if (playoffsPatch && allSimResults.length > 0) {
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
                const playInStart = new Date('2026-04-15T00:00:00Z');
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

    // Resolve pending bets against today's sim results
    const betResolution = resolveBets(state.bets ?? [], allSimResults);
    if (betResolution.netChange !== 0) {
        newStats = {
            ...newStats,
            personalWealth: Number((newStats.personalWealth + betResolution.netChange / 1_000_000).toFixed(4)),
        };
    }

    return {
        day: result.day || (stateWithSim.day + 1),
        date: dateString,
        stats: newStats,
        leagueStats: newLeagueStats,
        historicalStats: [...state.historicalStats, historicalPoint].slice(-365),
        inbox: [...uniqueNewEmails, ...updatedInbox],
        chats: updatedChats,
        news: [...uniqueNewNews, ...state.news],
        socialFeed: [...uniqueNewPosts, ...state.socialFeed].slice(0, 500),
        teams: stateWithSim.teams,
        schedule: finalSchedule,
        players: updatedPlayers,
        draftPicks: updatedDraftPicks,
        christmasGames: result.christmasGames || state.christmasGames,
        globalGames: result.globalGames || state.globalGames,
        boxScores: (() => {
            const existingIds = new Set((state.boxScores || []).map(b => b.gameId));
            const deduped = boxScoresWithDate.filter(b => !existingIds.has(b.gameId));
            return [...(state.boxScores || []), ...deduped];
        })(),
        history: [...state.history, { text: result.outcomeText || '', date: dateString, type: 'League Event' } as any],
        isProcessing: false,
        isWatchingGame: false,
      lastOutcome: result.outcomeText || result.narrative,
        lastConsequence: finalConsequence,
        pendingHypnosis: [],
        payslips: [...(state.payslips || []), ...newPayslips],
        lastPayDate: newLastPayDate,
        hasUnreadPayslip: newPayslips.length > 0 ? true : (state.hasUnreadPayslip || false),
        scheduledEvents: finalScheduledEvents,
        endorsedPlayers: result.endorsedPlayers || state.endorsedPlayers,
        allStar: allStarPatch,
        playoffs: playoffsPatch,
        pendingClubDebuff: remainingDebuffs,
        headToHead: stateWithSim.headToHead,
        lastSimResults: allSimResults || [],
        prevTeams: state.teams,
        daysSimulated: daysToSimulate,
        bets: betResolution.updatedBets,
    };
};
