import { NBATeam, NBAPlayer, Game, HeadToHead, LeagueStats } from '../types';
import { GameSimulator } from './simulation/GameSimulator';
import { GameResult } from './simulation/StatGenerator';
import { prepareIsolatedAttemptInput } from './simulation/SimulatorAdapter';
import { isPreparedGameWorkerEligible } from './simulation/gameSimulationWorkerEligibility';
import {
    beginGameSimulationWorkerSession,
    endGameSimulationWorkerSession,
    runGameSimulationJobsInWorkerPool,
} from './simulation/GameSimulationWorkerPool';
import { validateGameResultContract } from './simulation/resultIntegrity';
import { recordSimulationPerf } from './simulation/simulationPerfDebug';
import { captureSimulationRealmContext } from './simulation/simulationRealmContext';
import { HighlightGenerator } from './simulation/HighlightGenerator';
// Side-effect import: registers the realistic runner with SimulatorAdapter.
import './simulation/realistic';

export interface GameSimulationExecutionOptions {
    useWorkerPool?: boolean;
    workerPoolSize?: number;
    workerThreshold?: number;
}

// Re-export lifecycle through the same module graph that owns simulateGames.
// Browser diagnostics and route teardown can therefore dispose the exact pool
// instance used by the service even under dev-server module rewriting.
export { beginGameSimulationWorkerSession, endGameSimulationWorkerSession };

const perfNow = () => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
);

const updateHeadToHead = (
    current: HeadToHead | undefined,
    result: GameResult,
    season: number
): HeadToHead => {
    const h2h: HeadToHead = current ?? { season, regularSeason: {} };
    const { homeTeamId: a, awayTeamId: b, winnerId } = result;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    if (!h2h.regularSeason[lo]) h2h.regularSeason[lo] = {};
    if (!h2h.regularSeason[lo][hi]) h2h.regularSeason[lo][hi] = { won: 0, lost: 0, tied: 0 };

    const rec = h2h.regularSeason[lo][hi];
    if (winnerId === lo) rec.won++;
    else if (winnerId === hi) rec.lost++;
    else rec.tied++;

    return h2h;
};

export const simulateGames = async (
    teams: NBATeam[],
    players: NBAPlayer[],
    gamesToSimulate: Game[],
    date: string,
    playerApproval: number = 50,
    watchedGameResult?: any,
    allStar?: any,
    homeOverridePlayers?: NBAPlayer[],
    awayOverridePlayers?: NBAPlayer[],
    riggedForTid?: number,
    clubDebuffs?: Map<string, 'heavy' | 'moderate' | 'mild'>,
    currentHeadToHead?: HeadToHead,
    otlEnabled?: boolean,
    season?: number,
    leagueStats?: Partial<LeagueStats>,
    onGame?: (result: GameResult) => void,
    routing?: { controlledTeamIds?: number[]; watchedGameId?: number; simulationSeed?: string },
    execution?: GameSimulationExecutionOptions,
): Promise<{ updatedTeams: NBATeam[], results: GameResult[], headToHead?: HeadToHead }> => {
    const totalStart = perfNow();
    const updatedTeams = [...teams].map(t => ({ ...t }));
    const allResults: GameResult[] = [];

    // BUG 2 FIX: filter only by game ID, not team IDs, to avoid blocking future series games
    const inputSelectionStart = perfNow();
    const gamesToActuallySimulate = gamesToSimulate.filter(g => {
        if (!watchedGameResult) return true;
        return g.gid !== watchedGameResult.gameId;
    });
    const inputSelectionMs = perfNow() - inputSelectionStart;

    let dayResults: GameResult[];
    const engineExecutionStart = perfNow();
    const workerThreshold = Math.max(1, Math.floor(execution?.workerThreshold ?? 4));
    if (execution?.useWorkerPool && gamesToActuallySimulate.length >= workerThreshold) {
        const prepared = GameSimulator.prepareDayGames(
            updatedTeams,
            players,
            gamesToActuallySimulate,
            date,
            playerApproval,
            allStar,
            homeOverridePlayers,
            awayOverridePlayers,
            riggedForTid,
            leagueStats,
            routing,
        );
        const workerPrepared = prepared.filter(isPreparedGameWorkerEligible);
        if (workerPrepared.length >= workerThreshold) {
            const mainPrepared = prepared.filter(game => !isPreparedGameWorkerEligible(game));
            const compactJobs = workerPrepared.map(game => {
                const args = prepareIsolatedAttemptInput(game.args);
                const highlightPlayers = [
                    ...args.players,
                    ...(args.homeOverridePlayers ?? []),
                    ...(args.awayOverridePlayers ?? []),
                ];
                return {
                    ...game,
                    args,
                    realmContext: captureSimulationRealmContext([
                        game.args.homeTeam.id,
                        game.args.awayTeam.id,
                    ]),
                    defenseProfiles: GameSimulator.capturePreparedGameDefenseProfiles(args),
                    highlightProfiles: HighlightGenerator.captureSimulationProfiles(highlightPlayers),
                };
            });
            try {
                // Main-only contextual games may execute while independent worker
                // batches run, but neither path mutates canonical day state.
                const workerPromise = runGameSimulationJobsInWorkerPool(
                    compactJobs,
                    clubDebuffs,
                    execution.workerPoolSize,
                );
                const mainRows = GameSimulator.simulatePreparedDayGames(mainPrepared, clubDebuffs)
                    .map((result, index) => ({
                        order: mainPrepared[index].order,
                        gid: mainPrepared[index].gid,
                        result,
                    }));
                const workerOutput = await workerPromise;
                if (!workerOutput) {
                    dayResults = GameSimulator.simulatePreparedDayGames(prepared, clubDebuffs);
                } else {
                    const mergeStart = perfNow();
                    if (workerOutput.results.length !== workerPrepared.length) {
                        throw new Error('The game simulation worker returned an incomplete day.');
                    }
                    const expectedByOrder = new Map(workerPrepared.map(game => [game.order, game]));
                    const seenOrders = new Set<number>();
                    for (const row of workerOutput.results) {
                        const expected = expectedByOrder.get(row.order);
                        if (!expected || seenOrders.has(row.order) || row.gid !== expected.gid || row.result?.gameId !== expected.gid) {
                            throw new Error('The game simulation worker returned a malformed game identity.');
                        }
                        validateGameResultContract(row.result, {
                            allowTies: expected.args.allowTies === true,
                            isPostseason: expected.args.isPlayoff === true || expected.args.isEliminationGame === true,
                        });
                        seenOrders.add(row.order);
                    }
                    const merged = [...mainRows, ...workerOutput.results]
                        .sort((left, right) => left.order - right.order || left.gid - right.gid);
                    if (merged.length !== prepared.length) {
                        throw new Error('The game simulation worker merge did not cover the full day.');
                    }
                    dayResults = merged.map(row => row.result);
                    recordSimulationPerf({
                        engine: 'game-worker-merge',
                        games: dayResults.length,
                        workerGames: workerPrepared.length,
                        mainGames: mainPrepared.length,
                        workerMergeMs: Math.max(0, perfNow() - mergeStart),
                    });
                }
                if (onGame && dayResults.length > 0) {
                    onGame(dayResults[dayResults.length - 1]);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            } catch {
                // No result has reached canonical state. Discard every completed
                // worker/main result and replay the entire prepared day serially.
                dayResults = GameSimulator.simulatePreparedDayGames(prepared, clubDebuffs);
                recordSimulationPerf({
                    engine: 'game-worker-fallback',
                    games: prepared.length,
                    fallback: 'full-day-serial',
                });
                if (onGame && dayResults.length > 0) {
                    onGame(dayResults[dayResults.length - 1]);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        } else {
            dayResults = await GameSimulator.simulateDay(
                updatedTeams, players, gamesToActuallySimulate, date, playerApproval,
                allStar, homeOverridePlayers, awayOverridePlayers, riggedForTid,
                clubDebuffs, leagueStats, onGame, routing,
            );
        }
    } else {
        dayResults = await GameSimulator.simulateDay(
            updatedTeams, players, gamesToActuallySimulate, date, playerApproval,
            allStar, homeOverridePlayers, awayOverridePlayers, riggedForTid,
            clubDebuffs, leagueStats, onGame, routing,
        );
    }
    const engineExecutionMs = perfNow() - engineExecutionStart;
    const returnMergeStart = perfNow();
    const gameById = new Map(gamesToSimulate.map(g => [g.gid, g]));
    const stampGameMeta = (result: GameResult): GameResult => {
        const game = gameById.get(result.gameId);
        if (!game) return result;
        return {
            ...result,
            season: result.season ?? season,
            isPreseason: game.isPreseason,
            isPlayoff: game.isPlayoff,
            isPlayIn: game.isPlayIn,
            isAllStar: game.isAllStar ?? result.isAllStar,
            isAllStarChampionship: game.isAllStarChampionship ?? (result as any).isAllStarChampionship,
            isRisingStars: game.isRisingStars ?? result.isRisingStars,
            isRisingStarsChampionship: game.isRisingStarsChampionship ?? (result as any).isRisingStarsChampionship,
            isCelebrityGame: (game as any).isCelebrityGame ?? (result as any).isCelebrityGame,
            isExhibition: (game as any).isExhibition ?? (result as any).isExhibition,
            gameFormat: (game as any).gameFormat ?? (result as any).gameFormat,
            targetScore: (game as any).targetScore ?? (result as any).targetScore,
            isNBACup: game.isNBACup,
            nbaCupRound: game.nbaCupRound,
            nbaCupGroupId: game.nbaCupGroupId,
            excludeFromRecord: (game as any).excludeFromRecord,
            competitionId: game.competitionId,
            competitionPhase: game.competitionPhase,
        } as GameResult;
    };
    allResults.push(...dayResults.map(stampGameMeta));

    if (watchedGameResult) {
        allResults.push(stampGameMeta(watchedGameResult));
    }

    // Update standings
    let headToHead: HeadToHead | undefined = currentHeadToHead
        ? { ...currentHeadToHead, regularSeason: { ...currentHeadToHead.regularSeason } }
        : undefined;

    allResults.forEach(res => {
        const game = gamesToSimulate.find(g => g.gid === res.gameId);
        if (game?.isExhibition) return;
        if (game?.isPreseason) return;
        // Playoff and play-in results don't affect regular season standings
        if (game?.isPlayoff || game?.isPlayIn) return;
        // Cup SF/Final: box score kept but W/L skipped
        if ((game as any)?.excludeFromRecord) return;
        if (res.homeTeamId < 0 || res.awayTeamId < 0) return;

        const home = updatedTeams.find(t => t.id === res.homeTeamId);
        const away = updatedTeams.find(t => t.id === res.awayTeamId);
        if (home && away) {
            home.pointDifferential = (home.pointDifferential ?? 0) + res.homeScore - res.awayScore;
            away.pointDifferential = (away.pointDifferential ?? 0) + res.awayScore - res.homeScore;
            const isOT = res.isOT;
            const trackOtl = otlEnabled === true && isOT;

            if (res.isDraw || res.winnerId === -1) {
                home.tied = (home.tied ?? 0) + 1;
                away.tied = (away.tied ?? 0) + 1;
            } else if (res.winnerId === home.id) {
                home.wins += 1;
                home.streak = home.streak?.type === 'W' ? { type: 'W', count: home.streak.count + 1 } : { type: 'W', count: 1 };
                if (trackOtl) {
                    away.otl = (away.otl ?? 0) + 1;
                } else {
                    away.losses += 1;
                }
                away.streak = away.streak?.type === 'L' ? { type: 'L', count: away.streak.count + 1 } : { type: 'L', count: 1 };
            } else {
                away.wins += 1;
                away.streak = away.streak?.type === 'W' ? { type: 'W', count: away.streak.count + 1 } : { type: 'W', count: 1 };
                if (trackOtl) {
                    home.otl = (home.otl ?? 0) + 1;
                } else {
                    home.losses += 1;
                }
                home.streak = home.streak?.type === 'L' ? { type: 'L', count: home.streak.count + 1 } : { type: 'L', count: 1 };
            }
            if (leagueStats?.standingsMode === 'points') {
                const recalculate = (team: NBATeam) => {
                    team.standingsPoints = team.wins * (leagueStats.pointsForWin ?? 2)
                      + (team.tied ?? 0) * (leagueStats.pointsForDraw ?? 1)
                      + team.losses * (leagueStats.pointsForLoss ?? 0);
                };
                recalculate(home);
                recalculate(away);
            }
        }

        // Track head-to-head for regular season games only
        if (!game?.isPlayoff && !game?.isPlayIn && !game?.isPreseason && !game?.isAllStar) {
            headToHead = updateHeadToHead(headToHead, res, season ?? new Date().getFullYear());
        }
    });

    const returnMergeMs = perfNow() - returnMergeStart;
    recordSimulationPerf({
        engine: 'game-day-pipeline',
        date,
        games: allResults.length,
        inputSelectionMs,
        engineExecutionMs,
        returnMergeMs,
        totalMs: perfNow() - totalStart,
    });
    return { updatedTeams, results: allResults, headToHead };
};
