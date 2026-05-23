import { GameState, Game, NBAPlayer as Player } from '../../../../types';
import { applyCupResult } from '../../../../services/nbaCup/updateCupStandings';
import { resolveCupGroupStage, advanceKnockoutBracket } from '../../../../services/nbaCup/resolveGroupStage';
import { buildKnockoutGames, trimAndPairReplacements, hasCupTBDPlaceholders, materializeTBDSlots } from '../../../../services/nbaCup/scheduleInjector';
import { computeCupAwards, applyPrizePool, applyCupAwardsToPlayers } from '../../../../services/nbaCup/awards';
import { isNbaCupEnabled } from '../../../../utils/ruleFlags';

type SimulationPatchBase = {
    schedule: Game[];
    results: any[];
};

export function applyCupSimulationPass<TPatch extends SimulationPatchBase>(stateWithSim: GameState, simPatch: TPatch): {
    stateWithSim: GameState;
    simPatch: TPatch;
} {
    if (!(isNbaCupEnabled(stateWithSim.leagueStats) && stateWithSim.nbaCup && simPatch.results.length > 0)) {
        return { stateWithSim, simPatch };
    }

    let cup = stateWithSim.nbaCup;
    let schedule = simPatch.schedule;

    for (const res of simPatch.results) {
        const game = schedule.find(g => g.gid === res.gameId);
        if (!game?.isNBACup) continue;
        const updated = applyCupResult(cup, game, res);
        if (updated) cup = updated;
    }

    if (cup.status === 'group') {
        const totalGroupGames = cup.groups.length * 10;
        const playedGroupGames = schedule.filter(g => g.isNBACup && g.nbaCupRound === 'group' && g.played).length;
        if (playedGroupGames >= totalGroupGames) {
            cup = resolveCupGroupStage(cup, schedule, stateWithSim.saveId ?? 'default', stateWithSim.teams);
            const prevYr = stateWithSim.leagueStats.year - 1;
            const qfMatchups = cup.knockout
                .filter(k => k.round === 'QF' && k.tid1 >= 0 && k.tid2 >= 0)
                .map(k => ({ tid1: k.tid1, tid2: k.tid2 }));
            const qfTeams = qfMatchups.flatMap(m => [m.tid1, m.tid2]);

            if (hasCupTBDPlaceholders(schedule)) {
                for (const ko of cup.knockout) {
                    if (ko.round === 'SF') ko.countsTowardRecord = false;
                }
                const koSet = new Set(qfTeams);
                const allTids = stateWithSim.teams.filter(t => t.id >= 0 && t.id < 100).map(t => t.id);
                const nonKOTeams = allTids.filter(t => !koSet.has(t));
                const startGid = Math.max(0, ...schedule.map(g => g.gid)) + 1;
                const materialized = materializeTBDSlots(
                    schedule,
                    qfMatchups,
                    nonKOTeams,
                    prevYr,
                    stateWithSim.saveId ?? 'default',
                    startGid,
                );
                schedule = materialized.schedule;
                for (const ko of cup.knockout) {
                    if (ko.round !== 'QF' || ko.tid1 < 0 || ko.tid2 < 0) continue;
                    const key = `${Math.min(ko.tid1, ko.tid2)}-${Math.max(ko.tid1, ko.tid2)}`;
                    const gid = materialized.qfGameIds.get(key);
                    if (gid !== undefined) ko.gameId = gid;
                }
            } else {
                const maxGid = Math.max(0, ...schedule.map(g => g.gid));
                const newGames = buildKnockoutGames(cup.knockout, maxGid, prevYr);
                schedule = [...schedule, ...newGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                for (const ng of newGames) {
                    const ko = cup.knockout.find(k => k.round === ng.nbaCupRound && k.gameId === undefined && ng.homeTid === k.tid1);
                    if (ko) ko.gameId = ng.gid;
                }
                if (qfTeams.length > 0) {
                    const nextGid = Math.max(0, ...schedule.map(g => g.gid)) + 1;
                    const trimmed = trimAndPairReplacements(schedule, qfTeams, `${prevYr}-12-09`, nextGid);
                    schedule = trimmed.schedule;
                }
            }
        }
    }

    if (cup.status === 'knockout') {
        cup = advanceKnockoutBracket(cup);
        const newKOGames: Game[] = [];
        let runningMaxGid = Math.max(0, ...schedule.map(g => g.gid));
        const prevYr = stateWithSim.leagueStats.year - 1;
        for (const ko of cup.knockout) {
            if (ko.tid1 >= 0 && ko.tid2 >= 0 && !ko.gameId) {
                const injected = buildKnockoutGames([ko], runningMaxGid, prevYr);
                if (injected[0]) {
                    newKOGames.push(...injected);
                    ko.gameId = injected[0].gid;
                    runningMaxGid = injected[0].gid;
                }
            }
        }
        if (newKOGames.length > 0) {
            schedule = [...schedule, ...newKOGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const sfJustInjected = newKOGames
                .filter((g: any) => g.nbaCupRound === 'SF' && !g.excludeFromRecord)
                .flatMap((g: any) => [g.homeTid, g.awayTid]);
            if (sfJustInjected.length > 0) {
                const nextGid = Math.max(0, ...schedule.map(g => g.gid)) + 1;
                const trimmed = trimAndPairReplacements(schedule, sfJustInjected, `${prevYr}-12-13`, nextGid);
                schedule = trimmed.schedule;
            }
        }
    }

    let cupPlayersPatch: Player[] | null = null;
    if (cup.status === 'complete' && !cup.mvpPlayerId) {
        cup = computeCupAwards(cup, schedule, stateWithSim.boxScores ?? [], stateWithSim.players);
        const prizeEnabled = stateWithSim.leagueStats.cupPrizePoolEnabled !== false;
        cup = applyPrizePool(cup, prizeEnabled, prizeEnabled ? {
            winner: stateWithSim.leagueStats.cupPrizeWinner ?? 500_000,
            runnerUp: stateWithSim.leagueStats.cupPrizeRunnerUp ?? 200_000,
            semi: stateWithSim.leagueStats.cupPrizeSemi ?? 100_000,
            quarter: stateWithSim.leagueStats.cupPrizeQuarter ?? 50_000,
        } : undefined);
        cupPlayersPatch = applyCupAwardsToPlayers(cup, stateWithSim.players);
    }

    const nextState = {
        ...stateWithSim,
        nbaCup: cup,
        schedule,
        ...(cupPlayersPatch ? { players: cupPlayersPatch } : {}),
    };

    return {
        stateWithSim: nextState,
        simPatch: {
            ...simPatch,
            schedule,
        } as TPatch,
    };
}
