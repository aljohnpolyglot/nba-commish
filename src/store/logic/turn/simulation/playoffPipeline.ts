import { GameState, Game, NBATeam, NBAPlayer as Player } from '../../../../types';
import { buildTeamStrengthContext, calculateTeamStrength } from '../../../../utils/playerRatings';
import { normalizeDate } from '../../../../utils/helpers';
import { addGameDays } from '../../../../utils/dateUtils';
import { PlayoffGenerator } from '../../../../services/playoffs/PlayoffGenerator';
import { PlayoffAdvancer } from '../../../../services/playoffs/PlayoffAdvancer';
import { resolveStandingsChampion } from '../../../../services/logic/standingsChampion';
import { normalizeTeamJerseyNumbers } from '../../../../utils/jerseyUtils';
import { getLeagueCalendarDates } from '../../../../services/leagueCalendar';
import { TimeService } from '../../../../services/time/TimeService';
import { finalizeChampionTransition } from '../../../../services/lifecycle/finalizeChampionTransition';
import { resolveLeagueSeasonLifecycle } from '../../../../services/lifecycle/leagueSeasonLifecycle';
import { transitionSeasonLifecycle } from '../../../../services/lifecycle/seasonLifecycleMachine';
import { upgradeLegacyBracketGraph } from '../../../../services/playoffs/bracketGraph';
import { materializePlayoffBracket } from '../../../../services/playoffs/materializePlayoffBracket';
import { isPlayoffCompletionProvable } from '../../../../services/playoffs/playoffCompletion';
import { getSimulationSeed } from '../../../../services/saveIdentity';
import { createDeterministicRandom } from '../../../../services/simulation/deterministicRandom';

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
    const jerseyRng = createDeterministicRandom([
        getSimulationSeed(state),
        state.leagueStats?.year ?? new Date().getFullYear(),
        normalizeDate(state.date),
        'reserved-jersey-normalization',
        [...ids].sort((left, right) => left - right).join(','),
    ].join(':'));
    return {
        ...state,
        players: normalizeTeamJerseyNumbers(state.players as any, state.teams as any, state.leagueStats?.year ?? new Date().getFullYear(), {
            history: state.history,
            targetTeamIds: ids,
            rng: jerseyRng,
        }) as any,
    };
};

export function applyPlayoffLogic(stateWithSim: GameState, dayResults: any[], numGamesPerRound: number[]): GameState {
    const uiMode = stateWithSim.leagueStats?.uiMode;
    if (uiMode === 'euro_isolated' || uiMode === 'pba_isolated') return stateWithSim;
    let playoffs = stateWithSim.playoffs;
    let schedule = stateWithSim.schedule;
    const dateNorm = normalizeDate(stateWithSim.date);

    const seasonYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
    if (playoffs) playoffs = upgradeLegacyBracketGraph(playoffs, numGamesPerRound);
    const calendarDates = getLeagueCalendarDates(seasonYear, stateWithSim.leagueStats);
    const playoffStartDateStr = TimeService.normalize(calendarDates.playoffStart);
    const playInStartDateStr = TimeService.normalize(calendarDates.playInStart);
    const playInEnabled = stateWithSim.leagueStats.playIn !== false
        && stateWithSim.leagueStats.playoffsByConf !== false;
    const postseasonStartDateStr = playInEnabled ? playInStartDateStr : playoffStartDateStr;
    if (stateWithSim.leagueStats.playoffsEnabled === false) {
        const isMainPostseasonGame = (game: Game) => !game.competitionId && (game.isPlayoff || game.isPlayIn);
        const postseasonStarted = schedule.some(game => game.played && isMainPostseasonGame(game));
        if (postseasonStarted || playoffs?.bracketComplete) return stateWithSim;

        const stateWithoutPlayoffs = playoffs || schedule.some(isMainPostseasonGame)
            ? {
                ...stateWithSim,
                playoffs: undefined,
                schedule: schedule.filter(game => !isMainPostseasonGame(game)),
            }
            : stateWithSim;
        return dateNorm >= playoffStartDateStr
            ? resolveStandingsChampion(stateWithoutPlayoffs)
            : stateWithoutPlayoffs;
    }

    if (!playoffs && dateNorm >= postseasonStartDateStr) {
        const materialized = materializePlayoffBracket(stateWithSim);
        // Keep the lifecycle transition written by the canonical materializer.
        // Dropping it here left completed seasons persisted as regular season,
        // so champion finalization and long-sim target closure could never run.
        stateWithSim = materialized;
        playoffs = materialized.playoffs;
        schedule = materialized.schedule;
    }

    if (playoffs && !playoffs.gamesInjected) {
        const playInStart = new Date(`${playoffs.playInStartDate ?? playInStartDateStr}T00:00:00Z`);
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
            const { bracket: newBracket, newGames } = PlayoffAdvancer.advance(
                playoffs,
                playoffResults,
                schedule,
                numGamesPerRound,
                stateWithSim.leagueStats,
            );
            playoffs = newBracket;
            if (newGames.length > 0) {
                schedule = [...schedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            }
        }
    }

    if (playoffs) {
        for (const pig of playoffs.playInGames) {
            if ((pig.gameType === 'loserGame' || pig.gameType === '8v9Game2') && Number(pig.team1Tid) !== -1 && Number(pig.team2Tid) !== -1 && !pig.gameId) {
                const maxGid = Math.max(0, ...schedule.map(g => g.gid));
                const playInStart = new Date(`${playoffs.playInStartDate ?? playInStartDateStr}T00:00:00Z`);
                const dayOffset = pig.gameType === '8v9Game2'
                    ? pig.conference === 'East' ? 2 : 3
                    : pig.conference === 'East' ? 3 : 4;
                const gameDate = addGameDays(playInStart, dayOffset);
                const newGid = maxGid + 1;
                const loserGame: Game = {
                    gid: newGid,
                    homeTid: Number(pig.team1Tid),
                    awayTid: Number(pig.team2Tid),
                    homeScore: 0,
                    awayScore: 0,
                    played: false,
                    date: TimeService.normalize(gameDate),
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

    let playoffState = playoffs === stateWithSim.playoffs && schedule === stateWithSim.schedule
        ? stateWithSim
        : { ...stateWithSim, playoffs, schedule };

    const lifecycle = resolveLeagueSeasonLifecycle(playoffState);
    const postseasonHasStarted = playoffState.schedule.some(game => (
        game.played
        && !game.competitionId
        && (game.isPlayoff || game.isPlayIn)
        && (game.season == null || Number(game.season) === lifecycle.activeSeason)
    ));
    if (lifecycle.currentPhase === 'PLAYOFFS_MATERIALIZED' && postseasonHasStarted) {
        const active = transitionSeasonLifecycle(playoffState, {
            league: lifecycle.mode,
            season: lifecycle.activeSeason,
            from: 'PLAYOFFS_MATERIALIZED',
            to: 'PLAYOFFS_ACTIVE',
            atDate: playoffState.date,
        });
        if (active.status !== 'rejected') playoffState = { ...playoffState, seasonLifecycle: active.lifecycle };
    }

    // The simulation pipeline owns this transition for ordinary Sim Day as well
    // as long simulation. The championship modal is deliberately not a writer.
    return isPlayoffCompletionProvable(playoffState.playoffs, playoffState.schedule)
        ? finalizeChampionTransition(playoffState)
        : playoffState;
}
