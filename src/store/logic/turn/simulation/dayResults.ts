import { GameState } from '../../../../types';
import { injectCompetitionPostseasonGames, injectSingleEliminationProgression } from '../../../../services/competition/competitionResolver';
import { applyPbaConferenceLifecycle } from '../../../../services/pba/conferenceTransition';

export function applySimPatchState(
    stateWithSim: GameState,
    simPatch: any,
    justEliminated: boolean,
    newInjToasts: any[],
    newFightToasts: any[],
    newFeatToasts: any[],
): GameState {
    return {
        ...stateWithSim,
        teams: simPatch.teams,
        schedule: simPatch.schedule,
        ...(simPatch.headToHead ? { headToHead: simPatch.headToHead } : {}),
        ...(justEliminated ? { pendingElimToast: true } : {}),
        ...(newInjToasts.length > 0 ? { pendingInjuryToasts: [...(stateWithSim.pendingInjuryToasts ?? []), ...newInjToasts] } : {}),
        ...(newFightToasts.length > 0 ? { pendingFightToasts: [...(stateWithSim.pendingFightToasts ?? []), ...newFightToasts] } : {}),
        ...(newFeatToasts.length > 0 ? { pendingFeatToasts: [...(stateWithSim.pendingFeatToasts ?? []), ...newFeatToasts] } : {}),
    };
}

export function dateSimulationResults(stateWithSim: GameState, results: any[]): any[] {
    return results.map((result: any) => ({
        ...result,
        date: result.date ?? stateWithSim.date,
        season: result.season ?? stateWithSim.leagueStats?.year,
    }));
}

export function applyCompetitionProgression(
    stateWithSim: GameState,
    allSimResults: any[],
    activeCompetitions: any[],
    seasonYear: number,
): GameState {
    const stateWithBatchCompetitionResults = {
        ...stateWithSim,
        boxScores: [...(stateWithSim.boxScores ?? []), ...allSimResults],
    };

    const schedule = injectSingleEliminationProgression(
        {
            ...stateWithSim,
            schedule: injectCompetitionPostseasonGames(
                stateWithBatchCompetitionResults,
                activeCompetitions,
                seasonYear,
            ),
        },
        activeCompetitions,
        seasonYear,
    );
    const nextState = {
        ...stateWithSim,
        schedule,
    };
    return {
        ...nextState,
        ...applyPbaConferenceLifecycle(nextState, allSimResults),
    };
}
