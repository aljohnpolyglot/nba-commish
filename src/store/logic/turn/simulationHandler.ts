import { GameState, NBATeam, NBAPlayer as Player, Game } from '../../../types';
import { simulateDayGames } from '../../../services/logic/simulationRunner';
import { calculateTeamStrength, clearTeamStrengthCache } from '../../../utils/playerRatings';
import { normalizeDate } from '../../../utils/helpers';
import { PlayoffGenerator } from '../../../services/playoffs/PlayoffGenerator';
import { PlayoffAdvancer } from '../../../services/playoffs/PlayoffAdvancer';
import { applyDailyProgression, applySeasonalBreakouts } from '../../../services/playerDevelopment/ProgressionEngine';
import { generateAIDayTradeProposals } from '../../../services/AITradeHandler';
import { runAIFreeAgencyRound, runAIMidSeasonExtensions } from '../../../services/AIFreeAgentHandler';
import { applySeasonRollover, shouldFireRollover } from '../../../services/logic/seasonRollover';

const updateTeamStrengths = (teams: NBATeam[], players: Player[]): NBATeam[] => {
    return teams.map(team => ({
        ...team,
        strength: calculateTeamStrength(team.id, players)
    }));
};

/** Bracket generation + play-in/round injection, mirroring gameLogic.ts playoff block. */
function applyPlayoffLogic(stateWithSim: GameState, dayResults: any[], numGamesPerRound: number[]): GameState {
    let playoffs = stateWithSim.playoffs;
    let schedule = stateWithSim.schedule;
    const dateNorm = normalizeDate(stateWithSim.date);

    const seasonYear = stateWithSim.leagueStats?.year ?? 2026;
    const playoffStartDateStr = `${seasonYear}-04-13`;
    const playInStartDateStr  = `${seasonYear}-04-15`;

    // 1. Generate bracket on April 13 of the current season year
    if (!playoffs && dateNorm >= playoffStartDateStr) {
        playoffs = PlayoffGenerator.generateBracket(stateWithSim.teams, stateWithSim.leagueStats.year, numGamesPerRound);
    }

    // 2. Inject play-in games into schedule
    if (playoffs && !playoffs.gamesInjected) {
        const playInStart = new Date(`${playInStartDateStr}T00:00:00Z`);
        const maxGid = Math.max(0, ...schedule.map(g => g.gid));
        const playInGames = PlayoffGenerator.injectPlayInGames(playoffs.playInGames, playInStart, maxGid);
        schedule = [...schedule, ...playInGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        playoffs = { ...playoffs, gamesInjected: true };
    }

    // 3. Advance bracket from today's play-in/playoff results
    if (playoffs && dayResults.length > 0) {
        const playoffResults = dayResults.filter(r => {
            const g = schedule.find(sg => sg.gid === r.gameId);
            return g && (g.isPlayoff || g.isPlayIn);
        });
        if (playoffResults.length > 0) {
            const { bracket: newBracket, newGames } = PlayoffAdvancer.advance(playoffs, playoffResults, schedule, numGamesPerRound);
            playoffs = newBracket;
            if (newGames.length > 0) {
                schedule = [...schedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            }
        }
    }

    // 4. Inject loser play-in games when teams become known
    if (playoffs) {
        for (const pig of playoffs.playInGames) {
            if (pig.gameType === 'loserGame' && pig.team1Tid > 0 && pig.team2Tid > 0 && !pig.gameId) {
                const maxGid = Math.max(0, ...schedule.map(g => g.gid));
                const playInStart = new Date(`${playInStartDateStr}T00:00:00Z`);
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
                schedule = [...schedule, loserGame].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                playoffs = {
                    ...playoffs,
                    playInGames: playoffs.playInGames.map(p => p.id === pig.id ? { ...p, gameId: newGid } : p),
                };
            }
        }
    }

    if (playoffs === stateWithSim.playoffs && schedule === stateWithSim.schedule) return stateWithSim;
    return { ...stateWithSim, playoffs, schedule };
}

export const runSimulation = (state: GameState, daysToSimulate: number, action?: any) => {
    let stateWithSim = { ...state };

    // Clear cache at start of simulation batch
    clearTeamStrengthCache();

    // Pre-calculate strengths once for the batch
    stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);

    let allSimResults: any[] = [];
    let lastDaySimResults: any[] = [];
    const perDayResults: Array<{ date: string; results: any[] }> = [];

    const effectiveRiggedForTid: number | undefined = action?.payload?.riggedForTid ?? undefined;
    const numGamesPerRound: number[] = state.leagueStats.numGamesPlayoffSeries ?? [7, 7, 7, 7];

    for (let i = 0; i < daysToSimulate; i++) {
        // Advance date FIRST (except on iteration 0 — start from current date)
        if (i > 0) {
            const currentNorm = normalizeDate(stateWithSim.date);
            const nextDate = new Date(`${currentNorm}T00:00:00Z`);
            nextDate.setUTCDate(nextDate.getUTCDate() + 1);
            stateWithSim.date = nextDate.toLocaleDateString('en-US', {
                timeZone: 'UTC',
                month: 'short', day: 'numeric', year: 'numeric'
            });
            stateWithSim.day += 1;
        }

        // Apply playoff/play-in bracket logic before simulating this day's games
        // so that injected play-in/playoff games are in the schedule when simulateDayGames runs.
        stateWithSim = applyPlayoffLogic(stateWithSim, [], numGamesPerRound);

        const watchedResult = i === 0 ? action?.payload?.watchedGameResult : undefined;
        const simPatch = simulateDayGames(stateWithSim, watchedResult, effectiveRiggedForTid);

        stateWithSim = {
            ...stateWithSim,
            teams: simPatch.teams,
            schedule: simPatch.schedule,
            ...(simPatch.headToHead ? { headToHead: simPatch.headToHead } : {})
        };

        allSimResults.push(...simPatch.results);
        perDayResults.push({ date: stateWithSim.date, results: simPatch.results });

        if (i === daysToSimulate - 1) {
            lastDaySimResults = simPatch.results;
        }

        // Advance playoff bracket after today's results (handles play-in advancement + round injection)
        if (simPatch.results.length > 0) {
            stateWithSim = applyPlayoffLogic(stateWithSim, simPatch.results, numGamesPerRound);
        }

        // Seasonal events — fire once on Oct 1 (preseason) each year
        // Breakouts, late bloomers, bust accelerations — BBGM-style draft unpredictability
        const simDateForEvents = normalizeDate(stateWithSim.date);
        const seasonStartDate = `${stateWithSim.leagueStats.year - 1}-10-01`;
        if (simDateForEvents === seasonStartDate) {
            const { players: playersWithEvents, events } = applySeasonalBreakouts(
                stateWithSim.players,
                stateWithSim.leagueStats.year,
            );
            stateWithSim = { ...stateWithSim, players: playersWithEvents };
            if (events.length > 0) {
                const eventNews = events.map(e => ({
                    id: `seasonal-${e.playerId}-${stateWithSim.leagueStats.year}`,
                    headline: e.type === 'breakout'
                        ? `${e.playerName} Turns Heads in Training Camp with Breakout ${e.attr.toUpperCase()} Improvement`
                        : e.type === 'late_bloomer'
                        ? `${e.playerName} Showing Surprising Development Heading Into Season`
                        : `Concerns Emerge Around ${e.playerName}'s ${e.attr.toUpperCase()} in Camp`,
                    content: e.type === 'breakout'
                        ? `${e.playerName} has shown significant improvement in ${e.attr} (+${e.delta}) during the offseason. Could be a steal.`
                        : e.type === 'late_bloomer'
                        ? `At ${stateWithSim.players.find(p => p.internalId === e.playerId)?.age ?? '??'}, ${e.playerName} is reportedly showing improved ${e.attr} (+${e.delta}). Late bloomers do exist.`
                        : `${e.playerName}'s ${e.attr} has regressed (${e.delta}) heading into camp. High expectations may need to be tempered.`,
                    date: stateWithSim.date,
                    type: 'player' as const,
                    isNew: true,
                    read: false,
                }));
                stateWithSim = {
                    ...stateWithSim,
                    news: [...eventNews, ...(stateWithSim.news ?? [])].slice(0, 200),
                };
            }
        }

        // Daily player progression — stagnates during playoffs
        const isPlayoffDay = !!(stateWithSim.playoffs && !stateWithSim.playoffs.bracketComplete);
        stateWithSim = {
            ...stateWithSim,
            players: applyDailyProgression(
                stateWithSim.players,
                isPlayoffDay,
                stateWithSim.date,
                stateWithSim.leagueStats.year,
            ),
        };

        // Mid-season extensions — every 14 days Oct–Feb (before trade deadline)
        // Players expiring this summer get offered extensions based on mood.
        const [, extMonth] = normalizeDate(stateWithSim.date).split('-').map(Number);
        const isExtensionWindow = extMonth >= 10 || extMonth <= 2; // Oct–Feb
        if (!isPlayoffDay && isExtensionWindow && stateWithSim.day % 14 === 0) {
            const extensions = runAIMidSeasonExtensions(stateWithSim);
            if (extensions.length > 0) {
                const acceptedIds  = new Set(extensions.filter(e => !e.declined).map(e => e.playerId));
                const declinedIds  = new Set(extensions.filter(e => e.declined).map(e => e.playerId));
                const extMap       = new Map(extensions.map(e => [e.playerId, e]));

                stateWithSim = {
                    ...stateWithSim,
                    players: stateWithSim.players.map(p => {
                        if (acceptedIds.has(p.internalId)) {
                            const ext = extMap.get(p.internalId)!;
                            return {
                                ...p,
                                contract: { ...p.contract, amount: ext.newAmount, exp: ext.newExp },
                            };
                        }
                        if (declinedIds.has(p.internalId)) {
                            return { ...p, midSeasonExtensionDeclined: true } as any;
                        }
                        return p;
                    }),
                };

                // Log notable extensions (stars only)
                extensions.filter(e => !e.declined).forEach(e => {
                    const p = stateWithSim.players.find(pl => pl.internalId === e.playerId);
                    if (p && (p.overallRating ?? 0) >= 80) {
                        console.log(`[Extension] ${e.playerName} re-signs with ${e.teamName}: $${e.newAmount}M / exp ${e.newExp}`);
                    }
                });
            }
        }

        // AI trade proposals — generated every 7 days during regular season, before trade deadline
        const simDateForTrades = normalizeDate(stateWithSim.date);
        const tradeDeadline = `${stateWithSim.leagueStats?.year ?? 2026}-02-15`;
        const beforeTradeDeadline = simDateForTrades <= tradeDeadline;
        if (!isPlayoffDay && beforeTradeDeadline && stateWithSim.day % 7 === 0) {
            const newProposals = generateAIDayTradeProposals(stateWithSim);
            if (newProposals.length > 0) {
                stateWithSim = {
                    ...stateWithSim,
                    tradeProposals: [
                        ...(stateWithSim.tradeProposals ?? []),
                        ...newProposals,
                    ],
                };
            }
        }

        // Season rollover — fires once when sim date crosses June 30 of the current season year
        // (day before free agency opens July 1).
        // e.g. season 2026: fires at 2026-06-30 → year becomes 2027, contracts expire, cap inflates.
        // Guard: year increment inside applySeasonRollover prevents double-firing.
        const simDateForRollover = normalizeDate(stateWithSim.date);
        if (shouldFireRollover(stateWithSim, simDateForRollover)) {
            const rolloverPatch = applySeasonRollover(stateWithSim);
            stateWithSim = { ...stateWithSim, ...rolloverPatch };
            // Re-compute strengths after roster changes from contract expiry
            stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);
        }

        // AI free agency — run during offseason (July–September, before regular season tip-off)
        const simDateNorm = normalizeDate(stateWithSim.date);
        const [, simMonth] = simDateNorm.split('-').map(Number);
        const isFreeAgencySeason = simMonth >= 7 && simMonth <= 9;
        if (isFreeAgencySeason && stateWithSim.day % 3 === 0) {
            const signings = runAIFreeAgencyRound(stateWithSim);
            if (signings.length > 0) {
                const signedIds = new Set(signings.map(s => s.playerId));
                stateWithSim = {
                    ...stateWithSim,
                    players: stateWithSim.players.map(p =>
                        signedIds.has(p.internalId)
                            ? { ...p, tid: signings.find(s => s.playerId === p.internalId)!.teamId, status: 'Active' as const }
                            : p
                    ),
                };
            }
        }
    }

    return { stateWithSim, allSimResults, lastDaySimResults, perDayResults };
};
