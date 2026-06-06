import { GameState, Game, NBATeam, NBAPlayer as Player } from '../../../../types';
import { buildTeamStrengthContext, calculateTeamStrength } from '../../../../utils/playerRatings';
import { normalizeDate } from '../../../../utils/helpers';
import { addGameDays } from '../../../../utils/dateUtils';
import { PlayoffGenerator } from '../../../../services/playoffs/PlayoffGenerator';
import { PlayoffAdvancer } from '../../../../services/playoffs/PlayoffAdvancer';
import { normalizeTeamJerseyNumbers } from '../../../../utils/jerseyUtils';

export const updateTeamStrengths = (teams: NBATeam[], players: Player[]): NBATeam[] => {
    const context = buildTeamStrengthContext(players);
    return teams.map(team => ({
        ...team,
        strength: calculateTeamStrength(team.id, players, undefined, context),
    }));
};

export const normalizeReservedJerseys = (state: GameState, teamIds: Iterable<number>): GameState => {
    const ids = Array.from(new Set(Array.from(teamIds).filter((id): id is number => id >= 0)));
    if (ids.length === 0) return state;
    return {
        ...state,
        players: normalizeTeamJerseyNumbers(state.players as any, state.teams as any, state.leagueStats?.year ?? new Date().getFullYear(), {
            history: state.history,
            targetTeamIds: ids,
        }) as any,
    };
};

export function applyPlayoffLogic(stateWithSim: GameState, dayResults: any[], numGamesPerRound: number[]): GameState {
    if (stateWithSim.leagueStats?.uiMode === 'euro_isolated' || stateWithSim.leagueStats?.uiMode === 'pba_isolated') return stateWithSim;
    let playoffs = stateWithSim.playoffs;
    let schedule = stateWithSim.schedule;
    const dateNorm = normalizeDate(stateWithSim.date);

    const seasonYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    const playoffStartDateStr = `${seasonYear}-04-13`;
    const playInStartDateStr = `${seasonYear}-04-15`;

    if (!playoffs && dateNorm >= playoffStartDateStr) {
        playoffs = PlayoffGenerator.generateBracket(
            stateWithSim.teams,
            stateWithSim.leagueStats.year,
            numGamesPerRound,
            stateWithSim.leagueStats.playIn !== false,
        );
    }

    if (playoffs && !playoffs.gamesInjected) {
        const playInStart = new Date(`${playInStartDateStr}T00:00:00Z`);
        const maxGid = Math.max(0, ...schedule.map(g => g.gid));
        const playInGames = PlayoffGenerator.injectPlayInGames(playoffs.playInGames, playInStart, maxGid);
        schedule = [...schedule, ...playInGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        playoffs = { ...playoffs, gamesInjected: true };
    }

    if (playoffs && (dayResults.length > 0 || (playoffs.playInComplete && !playoffs.round1Injected))) {
        const playoffResults = dayResults.filter(r => {
            const g = schedule.find(sg => sg.gid === r.gameId);
            return g && (g.isPlayoff || g.isPlayIn);
        });
        if (playoffResults.length > 0 || (playoffs.playInComplete && !playoffs.round1Injected)) {
            const { bracket: newBracket, newGames } = PlayoffAdvancer.advance(playoffs, playoffResults, schedule, numGamesPerRound);
            playoffs = newBracket;
            if (newGames.length > 0) {
                schedule = [...schedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            }
        }
    }

    if (playoffs) {
        for (const pig of playoffs.playInGames) {
            if (pig.gameType === 'loserGame' && pig.team1Tid !== -1 && pig.team2Tid !== -1 && !pig.gameId) {
                const maxGid = Math.max(0, ...schedule.map(g => g.gid));
                const playInStart = new Date(`${playInStartDateStr}T00:00:00Z`);
                const dayOffset = pig.conference === 'East' ? 3 : 4;
                const gameDate = addGameDays(playInStart, dayOffset);
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
