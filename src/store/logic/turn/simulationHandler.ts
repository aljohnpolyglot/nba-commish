import { GameState, NBATeam, NBAPlayer as Player, Game } from '../../../types';
import { simulateDayGames } from '../../../services/logic/simulationRunner';
import { calculateTeamStrength, clearTeamStrengthCache } from '../../../utils/playerRatings';
import { normalizeDate } from '../../../utils/helpers';
import { PlayoffGenerator } from '../../../services/playoffs/PlayoffGenerator';
import { PlayoffAdvancer } from '../../../services/playoffs/PlayoffAdvancer';

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

    // 1. Generate bracket on April 13
    if (!playoffs && dateNorm >= '2026-04-13') {
        playoffs = PlayoffGenerator.generateBracket(stateWithSim.teams, stateWithSim.leagueStats.year, numGamesPerRound);
    }

    // 2. Inject play-in games into schedule
    if (playoffs && !playoffs.gamesInjected) {
        const playInStart = new Date('2026-04-15T00:00:00Z');
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
    }

    return { stateWithSim, allSimResults, lastDaySimResults, perDayResults };
};
