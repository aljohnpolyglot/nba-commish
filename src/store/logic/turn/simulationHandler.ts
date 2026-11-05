import { GameState, NBAPlayer as Player } from '../../../types';
import { getUnplayedInternationalPreseasonTeamIds, simulateDayGames } from '../../../services/logic/simulationRunner';
import { injectCupGroupGames } from '../../../services/nbaCup/scheduleInjector';
import { clearTeamStrengthCache } from '../../../utils/playerRatings';
import { normalizeDate } from '../../../utils/helpers';
import { daysBetweenGameDates, getDraftDate, getTradeDeadlineDate, toISODateString } from '../../../utils/dateUtils';
import { generateAIDayTradeProposals, executeAITrade } from '../../../services/AITradeHandler';
import { tickTransferMarket } from '../../../services/transfer/transferMarketTicker';
import { buildTransferMarketDailySummary } from '../../../services/transfer/transferMarketDailySummary';
import { tickLoanMarket } from '../../../services/transfer/loanMarket';
import { applySeasonRollover } from '../../../services/logic/seasonRollover';
import { repairPbaConferenceForDate } from '../../../services/pba/conferenceTransition';
import { isPbaTradeWindowOpen } from '../../../services/pba/tradeWindow';
import { tickPbaLocalFreeAgency } from '../../../services/pba/localFreeAgencyAi';
import { SettingsManager } from '../../../services/SettingsManager';
import { isEuroIsolatedMode, isPbaActiveConferenceMode, isPbaIsolatedMode } from '../../../utils/uiMode';
import { getSimulationSeed } from '../../../services/saveIdentity';
import { getStandardRosterLimit, getTwoWayRosterLimit } from '../../../utils/rosterLimits';
import { isTwoWayContract } from '../../../utils/contractTypes';
import { usesLegacyNbaCupState } from '../../../utils/ruleFlags';
import { getLeagueCalendarDates, isLeagueRegularSeasonWindow } from '../../../services/leagueCalendar';
import { getOffseasonDayPlan } from '../../../services/offseason/offseasonPlan';
import { injectCompetitionPostseasonGames, injectSingleEliminationProgression } from '../../../services/competition/competitionResolver';
import { repairCompetitionSchedules } from '../../../services/competition/competitionScheduler';
import { pushCoachMessage } from './simulation/coachMessages';
import { applyAIFreeAgencyPass, applyRosterTrimPass } from './simulation/aiFreeAgencyPass';
import { applyBirdRightsResignsPass } from './simulation/birdRightsPass';
import { applyCupSimulationPass } from './simulation/cupPass';
import { applyCompetitionProgression, applySimPatchState, dateSimulationResults } from './simulation/dayResults';
import { applyFAMarketTickPass, applyNonGuaranteedGuaranteePass, clearLegacyGLeagueAssignments } from './simulation/freeAgencyMarketPass';
import { applyPlayoffLogic, normalizeReservedJerseys, updateTeamStrengths } from './simulation/playoffPipeline';
import { applyExternalSigningRoutingPass, applySeasonCalendarPasses } from './simulation/seasonCalendarPasses';
import { isSimulationPerfEnabled, recordSimulationPerf } from '../../../services/simulation/simulationPerfDebug';
import { mergeFranchiseRecords } from '../../../services/stats/franchiseRecords';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { trimEuroOversizedRosters } from '../../../services/euro/rosterTrim';
import {
    buildFreeAgencyDailySummary,
    mergeFreeAgencySummaries,
} from '../../../services/freeAgency/freeAgencyDailySummary';
import {
    CENTRAL_CORE_FREE_AGENCY_DAYS,
    getCentralFreeAgencyDays,
    getHiddenFreeAgencyDecisionDay,
    getPriorityFreeAgencyDecisionDay,
} from '../../../services/freeAgency/freeAgencyDecisionTiming';
import { getK2 } from '../../../services/faMarketTickerUtils';
import { formatInjuryRecoveryWindow } from '../../../services/injuryService';
import { resolveSeasonRolloverPlayerScope } from '../../../services/logic/seasonRollover/leagueScope';
import { isPlayerInLeagueScope } from '../../../utils/playerLeagueScope';
import { simDebug } from '../../../utils/simDebug';
import { evaluateTargetPlan, type TargetPlan } from '../../../services/simulation/targetPlanner';
import { yieldLongSimIfDue, type LongSimYieldBudget } from '../../../services/simulation/longSimCoordinator';
import type { LazySimDayTrace } from '../../../services/logic/lazySimRunner';
import { processSimulationResults } from './postProcessor';
import { withDeterministicRandom } from '../../../services/simulation/deterministicRandom';
import { applyDailyFamiliarityTick, applyDailyFatigueTick } from '../../../services/training/trainingTick';
import { appendMediaFacts, buildSimulationMediaFacts } from '../../../services/media/mediaFacts';
import {
    resolveTradeActivityDecision,
    usesNbaTradeActivityModel,
    type TradeActivityDecision,
} from '../../../services/trade/tradeActivityPrior';

const perfNow = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

const perfMs = (start: number) => Math.round((perfNow() - start) * 10) / 10;

type PreparedSimulationScope = {
    activePlayers: Player[];
    activePlayerIds: Set<string>;
    activeTeamIds: Set<number>;
};

type CloneCallContext = {
    caller?: string;
    daysToSimulate?: number;
};

type AtomicFailurePoint = 'after-games' | 'after-calendar' | 'after-trade' | 'before-commit';

type CloneMutationBaseline = {
    players: Map<string, string>;
    playerContracts: Map<string, string>;
    teams: Map<number, string>;
    schedule: Map<number, string>;
    backgroundPlayers: Map<string, string>;
    playoffs: string;
    draft: string;
    lifecycle: string;
    historyLength: number;
    mediaFactsLength: number;
};

const cloneArchitectureForensicsEnabled = (): boolean =>
    isSimulationPerfEnabled()
    && (globalThis as typeof globalThis & { __cloneArchitectureForensics?: boolean }).__cloneArchitectureForensics === true;

const approximateJsonBytes = (value: unknown): number => {
    const json = JSON.stringify(value);
    if (json === undefined) return 0;
    return new TextEncoder().encode(json).byteLength;
};

const captureCloneMutationBaseline = (
    state: GameState,
    activePlayerIds: Set<string>,
): CloneMutationBaseline => ({
    players: new Map(state.players
        .filter(player => activePlayerIds.has(player.internalId))
        .map(player => [player.internalId, JSON.stringify(player)])),
    playerContracts: new Map(state.players
        .filter(player => activePlayerIds.has(player.internalId))
        .map(player => [player.internalId, JSON.stringify({
            contract: player.contract,
            contractYears: player.contractYears,
            hasBirdRights: (player as any).hasBirdRights,
            yearsWithTeam: (player as any).yearsWithTeam,
        })])),
    teams: new Map(state.teams.map(team => [team.id, JSON.stringify(team)])),
    schedule: new Map(state.schedule.map(game => [game.gid, JSON.stringify(game)])),
    backgroundPlayers: new Map(state.players
        .filter(player => !activePlayerIds.has(player.internalId))
        .map(player => [player.internalId, JSON.stringify(player)])),
    playoffs: JSON.stringify(state.playoffs ?? null),
    draft: JSON.stringify({
        draftPicks: state.draftPicks,
        draftClass: (state as any).draftClass,
        draftResults: (state as any).draftResults,
    }),
    lifecycle: JSON.stringify({
        seasonLifecycle: state.seasonLifecycle,
        offseasonChecklist: state.offseasonChecklist,
        commissionerTasks: state.commissionerTasks,
        leagueStats: state.leagueStats,
    }),
    historyLength: state.history?.length ?? 0,
    mediaFactsLength: state.mediaFacts?.length ?? 0,
});

const countChangedById = <T>(
    baseline: Map<T, string>,
    current: Map<T, string>,
): number => {
    const ids = new Set([...baseline.keys(), ...current.keys()]);
    let changed = 0;
    for (const id of ids) if (baseline.get(id) !== current.get(id)) changed += 1;
    return changed;
};

export function cloneSimulationState(
    state: GameState,
    preparedScope?: PreparedSimulationScope,
    context: CloneCallContext = {},
): GameState {
    const totalStart = perfNow();
    // Completed box scores are append-only evidence during a simulation batch.
    // Day processing only reads them and produces replacement arrays when new
    // results are committed, so cloning the full historical ledger (often the
    // largest save field after players) is unnecessary and expensive.
    const scopeStart = perfNow();
    const resolvedScope = preparedScope ?? (() => {
        const { playerScope, activeTeamIds } = resolveSeasonRolloverPlayerScope(state);
        const activePlayers = state.players.filter(player => (
            activeTeamIds.has(Number(player.tid)) || isPlayerInLeagueScope(player, playerScope, activeTeamIds)
        ));
        return {
            activePlayers,
            activePlayerIds: new Set(activePlayers.map(player => player.internalId)),
            activeTeamIds,
        };
    })();
    const { activePlayers, activePlayerIds, activeTeamIds } = resolvedScope;
    const scopeResolutionMs = perfNow() - scopeStart;
    const playerFilterStart = perfNow();
    // Scope filtering is owned by the caller when `preparedScope` is supplied.
    const playerScopeFilteringMs = perfNow() - playerFilterStart;
    const idBuildStart = perfNow();
    const activeIdBuildMs = perfNow() - idBuildStart;
    const objectPreparationStart = perfNow();
    const cloneProfile = (globalThis as typeof globalThis & { __cloneArchitectureProfile?: string })
        .__cloneArchitectureProfile;
    const useLegacyProjection = cloneProfile === 'legacy';
    const scopedState = { ...state, players: activePlayers };
    const {
        boxScores,
        historicalPeople,
        historicalAwards,
        refereePool,
        ...optimizedMutableState
    } = scopedState;
    const { boxScores: legacyBoxScores, ...legacyMutableState } = scopedState;
    const mutableState = useLegacyProjection ? legacyMutableState : optimizedMutableState;
    const objectPreparationMs = perfNow() - objectPreparationStart;
    const sizeAttributionStart = perfNow();
    let sizeAttribution: Record<string, number> = {};
    if (cloneArchitectureForensicsEnabled()) {
        const ownerGroups: Record<string, unknown[]> = {
            players: [],
            teams: [],
            schedule: [],
            history: [],
            draft: [],
            playoffs: [],
            offseasonLifecycle: [],
            leagueStats: [],
            mediaFacts: [],
            backgroundUniverse: [],
            international: [],
            historicalStatic: [],
            other: [],
        };
        const historicalStaticKeys = new Set(['historicalPeople', 'historicalAwards', 'refereePool']);
        for (const [key, value] of Object.entries(scopedState)) {
            if (key === 'players') ownerGroups.players.push(value);
            else if (key === 'teams' || key === 'nonNBATeams') ownerGroups.teams.push(value);
            else if (key === 'schedule') ownerGroups.schedule.push(value);
            else if (key === 'history' || key === 'news' || key === 'socialFeed') ownerGroups.history.push(value);
            else if (/^draft/i.test(key)) ownerGroups.draft.push(value);
            else if (/playoff|postseason|headToHead|activeCompetitions/i.test(key)) ownerGroups.playoffs.push(value);
            else if (/offseason|seasonLifecycle|commissionerTask|freeAgency|faBidding/i.test(key)) ownerGroups.offseasonLifecycle.push(value);
            else if (key === 'leagueStats') ownerGroups.leagueStats.push(value);
            else if (key === 'mediaFacts') ownerGroups.mediaFacts.push(value);
            else if (/background|universe/i.test(key)) ownerGroups.backgroundUniverse.push(value);
            else if (/international|fiba|olympic/i.test(key)) ownerGroups.international.push(value);
            else if (historicalStaticKeys.has(key)) ownerGroups.historicalStatic.push(value);
            else if (key !== 'boxScores') ownerGroups.other.push(value);
        }
        sizeAttribution = Object.fromEntries(Object.entries(ownerGroups).map(([owner, values]) => [
            `${owner}Bytes`,
            values.reduce<number>((total, value) => total + approximateJsonBytes(value), 0),
        ])) as Record<string, number>;
        sizeAttribution.sourceStateBytes = approximateJsonBytes(scopedState);
        sizeAttribution.cloneInputBytes = approximateJsonBytes(mutableState);
        sizeAttribution.boxScoresBytes = approximateJsonBytes(boxScores);
        sizeAttribution.contractSubsetBytes = approximateJsonBytes(activePlayers.map(player => ({
            internalId: player.internalId,
            contract: player.contract,
            contractYears: player.contractYears,
            hasBirdRights: (player as any).hasBirdRights,
            yearsWithTeam: (player as any).yearsWithTeam,
        })));
    }
    const sizeAttributionMs = perfNow() - sizeAttributionStart;
    const structuredCloneStart = perfNow();
    const cloned = typeof structuredClone === 'function'
        ? structuredClone(mutableState)
        : JSON.parse(JSON.stringify(mutableState));
    const structuredCloneMs = perfNow() - structuredCloneStart;
    const clonedMapStart = perfNow();
    const clonedPlayers = preparedScope ? undefined : new Map(
        (cloned.players as Player[]).map(player => [player.internalId, player]),
    );
    const clonedPlayerMapMs = perfNow() - clonedMapStart;
    const remergeStart = perfNow();
    const result = {
        ...cloned,
        boxScores: boxScores ?? legacyBoxScores,
        ...(!useLegacyProjection ? { historicalPeople, historicalAwards, refereePool } : {}),
        players: preparedScope
            ? (cloned.players as Player[])
            : state.players.map(player => (
                activePlayerIds.has(player.internalId) ? (clonedPlayers?.get(player.internalId) ?? player) : player
            )),
    } as GameState;
    const universeRemergeMs = perfNow() - remergeStart;
    recordSimulationPerf({
        engine: 'clone-forensics',
        scopeResolutionMs,
        playerScopeFilteringMs,
        activeIdBuildMs,
        objectPreparationMs,
        sizeAttributionMs,
        structuredCloneMs,
        clonedPlayerMapMs,
        universeRemergeMs,
        totalMs: perfNow() - totalStart,
        universePlayers: state.players.length,
        activePlayers: activePlayers.length,
        backgroundPlayers: state.players.length - activePlayers.length,
        activeTeams: activeTeamIds.size,
        boxScoresShared: boxScores?.length ?? 0,
        caller: context.caller ?? 'unknown',
        date: normalizeDate(state.date),
        daysToSimulate: context.daysToSimulate ?? 0,
        scheduleRows: state.schedule.length,
        historicalPeopleShared: !useLegacyProjection,
        historicalAwardsShared: !useLegacyProjection,
        refereePoolShared: !useLegacyProjection,
        ...sizeAttribution,
    });
    return result;
}

export const runSimulation = async (state: GameState, daysToSimulate: number, action?: any, onGame?: (result: any) => void) => {
    const batchStart = perfNow();
    // Test-only fault injection exercises the real atomic batch boundary. The
    // hook is deliberately local to runSimulation so production callers cannot
    // accidentally commit a partially processed working state.
    const atomicFailurePoint = action?.payload?.injectAtomicFailureAt as AtomicFailurePoint | undefined;
    const throwInjectedAtomicFailure = (point: AtomicFailurePoint): void => {
        if (atomicFailurePoint === point) {
            throw new Error(`[SIM_ATOMIC_TEST] injected failure ${point}`);
        }
    };
    const universePlayers = state.players;
    const outerScopeStart = perfNow();
    const { playerScope, activeTeamIds } = resolveSeasonRolloverPlayerScope(state);
    const internationalPreseasonTeamIds = getUnplayedInternationalPreseasonTeamIds(state.schedule);
    const outerScopeResolutionMs = perfNow() - outerScopeStart;
    const outerFilterStart = perfNow();
    const activePlayers = universePlayers.filter(player => (
        activeTeamIds.has(Number(player.tid))
        || internationalPreseasonTeamIds.has(Number(player.tid))
        || isPlayerInLeagueScope(player, playerScope, activeTeamIds)
    ));
    const outerPlayerFilteringMs = perfNow() - outerFilterStart;
    const outerIdStart = perfNow();
    const activePlayerIds = new Set(activePlayers.map(player => player.internalId));
    const outerActiveIdBuildMs = perfNow() - outerIdStart;
    recordSimulationPerf({
        engine: 'simulation-scope-forensics',
        outerScopeResolutionMs,
        outerPlayerFilteringMs,
        outerActiveIdBuildMs,
        universePlayers: universePlayers.length,
        activePlayers: activePlayers.length,
        activeTeams: activeTeamIds.size,
    });
    const cloneArchitectureProfile = (globalThis as typeof globalThis & { __cloneArchitectureProfile?: string })
        .__cloneArchitectureProfile;
    const useLegacyCloneArchitecture = cloneArchitectureProfile === 'legacy';
    const cloneMutationBaseline = cloneArchitectureForensicsEnabled()
        ? captureCloneMutationBaseline(state, activePlayerIds)
        : undefined;
    const cloneStart = perfNow();
    let stateWithSim = cloneSimulationState(
        { ...state, players: activePlayers },
        useLegacyCloneArchitecture ? undefined : { activePlayers, activePlayerIds, activeTeamIds },
        { caller: 'runSimulation', daysToSimulate },
    );
    const cloneSimulationStateMs = perfMs(cloneStart);
    const longSimYieldBudget = action?.payload?.longSimYieldBudget as LongSimYieldBudget | undefined;
    const onDayTrace = action?.payload?.onDayTrace as ((trace: LazySimDayTrace) => void) | undefined;
    const processResultsPerDay = action?.payload?.processResultsPerDay === true;
    const gameWorkerExecution = {
        useWorkerPool: action?.payload?.useGameWorkerPool === true,
        workerPoolSize: action?.payload?.gameWorkerPoolSize as number | undefined,
        workerThreshold: action?.payload?.gameWorkerThreshold as number | undefined,
    };
    let lastDailyProgressionDate = normalizeDate(
        String(action?.payload?.lastDailyProgressionDate ?? stateWithSim.date),
    );

    // Forward-healing normalize: pre-migration saves (or any save that bypassed
    // LOAD_GAME) can carry the 'FreeAgent' (no-space) legacy typo on hundreds of
    // players, making them invisible to every FA signing filter (which compares
    // against 'Free Agent' with a space). One-pass O(n) rewrite per sim batch.
    let hadFreeAgentTypo = false;
    stateWithSim.players = stateWithSim.players.map(p => {
        if ((p as any).status === 'FreeAgent') {
            hadFreeAgentTypo = true;
            return { ...p, status: 'Free Agent' as const };
        }
        return p;
    });
    if (hadFreeAgentTypo) {
        simDebug('lifecycle', () => "Normalized legacy 'FreeAgent' player status rows.");
    }

    let strengthPrepMs = 0;
    if (!processResultsPerDay) {
        clearTeamStrengthCache();
        const strengthPrepStart = perfNow();
        stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);
        strengthPrepMs += perfMs(strengthPrepStart);
    }

    let allSimResults: any[] = [];
    let lastDaySimResults: any[] = [];
    const perDayResults: Array<{ date: string; results: any[] }> = [];
    let dailyProgressionMs = 0;
    // Set when faMarketTicker reports a user-facing FA event (bid accepted/rejected,
    // RFA offer sheet to decide). Used to break the day loop at end-of-day so the
    // toast/modal fires at the resolution moment instead of after a 7-day batch.
    let userInterrupted = false;
    const targetPlan = action?.payload?.targetPlan as TargetPlan | undefined;
    const lifecycleTransitionTarget = targetPlan != null && [
        'TO_PLAYOFFS',
        'TO_CHAMPION',
        'TO_OFFSEASON',
        'SKIP_TO_PRESEASON',
    ].includes(targetPlan.name);

    const effectiveRiggedForTid: number | undefined = action?.payload?.riggedForTid ?? undefined;
    const includeDerivedMedia = action?.payload?.mediaProcessing !== 'on-demand';
    const numGamesPerRound: number[] = state.leagueStats.numGamesPlayoffSeries ?? [7, 7, 7, 7];
    for (let i = 0; i < daysToSimulate; i++) {
        const dayStart = perfNow();
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
        const mediaStateBeforeDay = stateWithSim;
        const freeAgencySummaryBefore = stateWithSim;
        const requestedFreeAgencyDay = Number(action?.payload?.freeAgencyDayStart);
        const freeAgencyDay = Number.isFinite(requestedFreeAgencyDay)
            ? requestedFreeAgencyDay + i
            : Number(stateWithSim.faTagCounter ?? 0);
        const freeAgencyTotal = Number(action?.payload?.freeAgencyTotal ?? getCentralFreeAgencyDays(stateWithSim));

        // Apply playoff/play-in bracket logic before simulating this day's games
        // so that injected play-in/playoff games are in the schedule when simulateDayGames runs.
        const playoffPreparationStart = perfNow();
        stateWithSim = repairPbaConferenceForDate(stateWithSim);
        stateWithSim = applyPlayoffLogic(stateWithSim, [], numGamesPerRound);
        const activeCompetitions = stateWithSim.activeCompetitions ?? [];
        const hasCompetitionState = activeCompetitions.length > 0
            || stateWithSim.schedule.some(game => !!game.competitionId);
        if (hasCompetitionState) {
            stateWithSim = {
                ...stateWithSim,
                schedule: repairCompetitionSchedules(
                    stateWithSim,
                    activeCompetitions,
                    stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
                ),
            };
            stateWithSim = {
                ...stateWithSim,
                schedule: injectCompetitionPostseasonGames(
                    stateWithSim,
                    activeCompetitions,
                    stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
                ),
            };
            stateWithSim = {
                ...stateWithSim,
                schedule: injectSingleEliminationProgression(
                    stateWithSim,
                    activeCompetitions,
                    stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
                ),
            };
        } else {
            const compareGames = (left: GameState['schedule'][number], right: GameState['schedule'][number]) =>
                new Date(left.date).getTime() - new Date(right.date).getTime() || left.gid - right.gid;
            const scheduleSorted = stateWithSim.schedule.every((game, index, schedule) =>
                index === 0 || compareGames(schedule[index - 1], game) <= 0
            );
            if (!scheduleSorted) {
                stateWithSim = { ...stateWithSim, schedule: [...stateWithSim.schedule].sort(compareGames) };
            }
        }
        let playoffPassMs = perfMs(playoffPreparationStart);
        let rosterPassMs = 0;
        let rolloverMs = 0;
        let birdRightsPassMs = 0;
        let faMarketPassMs = 0;
        let aiFreeAgencyPassMs = 0;
        let trainingDayMs = 0;

        const simDateNorm = normalizeDate(stateWithSim.date);
        const [, simMonth, simDayNum] = simDateNorm.split('-').map(Number);
        const isRegularSeason = isLeagueRegularSeasonWindow(simDateNorm, stateWithSim.leagueStats);
        const leagueCalendar = getLeagueCalendarDates(stateWithSim.leagueStats.year, stateWithSim.leagueStats);
        const isOpeningDay = simDateNorm === toISODateString(leagueCalendar.regularSeasonStart);
        const isEuroCompetitionGameDay = isEuroIsolatedMode(stateWithSim) && stateWithSim.schedule.some(game => (
            !game.played
            && !!game.competitionId
            && (!game.competitionPhase || game.competitionPhase === 'regular' || game.competitionPhase === 'regular-season'
                || game.competitionPhase === 'group' || game.competitionPhase.startsWith('r'))
            && normalizeDate(game.date) === simDateNorm
        ));
        if (isOpeningDay || isEuroCompetitionGameDay) {
            const rosterPassStart = perfNow();
            if (isEuroIsolatedMode(stateWithSim)) {
                const euroTrim = trimEuroOversizedRosters(stateWithSim, stateWithSim.players);
                if (euroTrim.trimmed.length > 0) {
                    stateWithSim = {
                        ...stateWithSim,
                        players: euroTrim.players,
                        history: [...(stateWithSim.history ?? []), ...(euroTrim.history ?? [])],
                    };
                }
            }
            stateWithSim = applyRosterTrimPass(stateWithSim, simMonth, simDayNum, includeDerivedMedia);
            rosterPassMs += perfMs(rosterPassStart);
        }

        if (processResultsPerDay) {
            const dailyProgressionStart = perfNow();
            const calendarDays = Math.max(0, Math.round(daysBetweenGameDates(lastDailyProgressionDate, simDateNorm)));
            if (calendarDays > 0) {
                const teamsAfterFamiliarity = applyDailyFamiliarityTick(
                    stateWithSim.teams,
                    lastDailyProgressionDate,
                    calendarDays,
                    {
                        schedule: stateWithSim.schedule,
                        currentYear: stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
                        userTeamId: stateWithSim.userTeamId,
                        gameMode: stateWithSim.gameMode,
                    },
                );
                const isTrainingCampChecklistOpen =
                    !!stateWithSim.offseasonChecklist
                    && !isPbaActiveConferenceMode(stateWithSim)
                    && stateWithSim.offseasonChecklist.trainingCamp !== 'done'
                    && stateWithSim.offseasonChecklist.trainingCamp !== 'skipped';
                const teamsForFatigueTick = isTrainingCampChecklistOpen
                    ? teamsAfterFamiliarity.map(team => ({ ...team, trainingCalendar: {} as any }))
                    : teamsAfterFamiliarity;
                stateWithSim = {
                    ...stateWithSim,
                    teams: teamsAfterFamiliarity,
                    players: applyDailyFatigueTick(
                        stateWithSim.players,
                        teamsForFatigueTick,
                        lastDailyProgressionDate,
                        calendarDays,
                        stateWithSim.schedule,
                        stateWithSim.leagueStats,
                    ),
                };
                lastDailyProgressionDate = simDateNorm;
            }
            trainingDayMs = perfMs(dailyProgressionStart);
            dailyProgressionMs += trainingDayMs;

            clearTeamStrengthCache();
            const dailyStrengthPrepStart = perfNow();
            stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);
            strengthPrepMs += perfMs(dailyStrengthPrepStart);
        }

        const watchedResult = i === 0 ? action?.payload?.watchedGameResult : undefined;

        onDayTrace?.({
            phase: 'before-games',
            date: simDateNorm,
            state: stateWithSim,
            results: [],
        });

        // Snapshot user team's pre-sim elimination status
        const preSimUserTeam = stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined
            ? stateWithSim.teams.find(t => t.id === stateWithSim.userTeamId)
            : undefined;

        const simulateGamesStart = perfNow();
        let simPatch = await simulateDayGames(
            stateWithSim,
            watchedResult,
            effectiveRiggedForTid,
            onGame,
            gameWorkerExecution,
        );
        const simulateGamesMs = perfMs(simulateGamesStart);

        const postSimUserTeam = preSimUserTeam
            ? simPatch.teams.find(t => t.id === stateWithSim.userTeamId)
            : undefined;
        const justEliminated = preSimUserTeam?.clinchedPlayoffs !== 'o' && postSimUserTeam?.clinchedPlayoffs === 'o';

        // Collect injury toasts for user team (accumulates across multi-day sim)
        const newInjToasts = (stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined)
            ? simPatch.results
                .flatMap((r: any) => r.injuries ?? [])
                .filter((inj: any) => inj.teamId === stateWithSim.userTeamId && inj.injuryType !== 'Load Management')
                .map((inj: any) => {
                    const player = stateWithSim.players.find(p => p.name === inj.playerName);
                    const team = stateWithSim.teams.find(t => t.id === inj.teamId);
                    return {
                        playerName: inj.playerName,
                        injuryType: inj.injuryType,
                        gamesRemaining: inj.gamesRemaining,
                        pos: (player as any)?.pos ?? '',
                        teamName: team?.name ?? '',
                    };
                })
            : [];

        const newFightToasts = (stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined)
            ? simPatch.results
                .flatMap((r: any) => {
                    const fight = r.fight;
                    if (!fight) return [];
                    const userTid = stateWithSim.userTeamId;
                    if (fight.player1TeamId !== userTid && fight.player2TeamId !== userTid) return [];
                    const isPlayerOne = fight.player1TeamId === userTid;
                    const playerName = isPlayerOne ? fight.player1Name : fight.player2Name;
                    const opponentName = isPlayerOne ? fight.player2Name : fight.player1Name;
                    const team = stateWithSim.teams.find(t => t.id === userTid);
                    return [{
                        playerName,
                        opponentName,
                        teamName: team?.name ?? '',
                        severity: fight.severity,
                    }];
                })
            : [];

        // Push coach message for star player injuries (>10 games out)
        if (newInjToasts.length > 0) {
            for (const inj of newInjToasts) {
                if (inj.gamesRemaining > 10) {
                    const recoveryWindow = formatInjuryRecoveryWindow(inj.gamesRemaining);
                    const messages = [
                        `${inj.playerName} has been ruled out for about ${recoveryWindow} with ${inj.injuryType}. We'll adjust the rotation and review our options.`,
                        `Medical expects ${inj.playerName} to miss roughly ${recoveryWindow} because of ${inj.injuryType}. We'll plan the rotation accordingly.`,
                        `We're without ${inj.playerName} for an estimated ${recoveryWindow} after the ${inj.injuryType}. The staff is reviewing how best to cover the minutes.`,
                    ];
                    const messageIndex = (inj.playerName.length + inj.injuryType.length + inj.gamesRemaining) % messages.length;
                    const msg = messages[messageIndex];
                    stateWithSim = pushCoachMessage(stateWithSim, msg);
                }
            }
        }

        // Collect feat toasts: own-team GmSc > 30, league-wide GmSc > 50 (trigger only — rendered as narrative card)
        const newFeatToasts: { playerName: string; teamName: string; oppName: string; homeScore: number; awayScore: number; isHome: boolean; won: boolean; pts: number; reb: number; ast: number; isOwnTeam: boolean }[] = [];
        const userTid = stateWithSim.userTeamId;
        for (const r of simPatch.results) {
            if (r.isAllStar || r.isRisingStars) continue;
            const homeTeam = resolveAnyTeam(r.homeTeamId, stateWithSim.teams, stateWithSim.nonNBATeams ?? []);
            const awayTeam = resolveAnyTeam(r.awayTeamId, stateWithSim.teams, stateWithSim.nonNBATeams ?? []);
            const homeTeamName = homeTeam ? getTeamFullName(homeTeam) : '';
            const awayTeamName = awayTeam ? getTeamFullName(awayTeam) : '';
            const homeWon = (r.homeScore ?? 0) > (r.awayScore ?? 0);
            const sides: { stats: any[]; teamId: number; isHome: boolean; teamName: string; oppName: string; won: boolean }[] = [
                { stats: r.homeStats ?? [], teamId: r.homeTeamId, isHome: true,  teamName: homeTeamName, oppName: awayTeamName, won: homeWon },
                { stats: r.awayStats ?? [], teamId: r.awayTeamId, isHome: false, teamName: awayTeamName, oppName: homeTeamName, won: !homeWon },
            ];
            for (const { stats, teamId, isHome, teamName, oppName, won } of sides) {
                const isOwnTeamSide = stateWithSim.gameMode === 'gm' && teamId === userTid;
                for (const stat of stats) {
                    const gmSc = stat.gameScore ?? 0;
                    const passes = (isOwnTeamSide && gmSc > 30) || (!isOwnTeamSide && gmSc > 50);
                    if (!passes) continue;
                    const pts = stat.pts ?? 0;
                    const reb = stat.reb ?? stat.trb ?? ((stat.orb ?? 0) + (stat.drb ?? 0));
                    const ast = stat.ast ?? 0;
                    newFeatToasts.push({
                        playerName: stat.name, teamName, oppName,
                        homeScore: r.homeScore ?? 0, awayScore: r.awayScore ?? 0,
                        isHome, won, pts, reb, ast,
                        isOwnTeam: isOwnTeamSide,
                    });
                }
            }
        }

        {
            const updatedSimRecords = mergeFranchiseRecords({
                existing: stateWithSim.simFranchiseRecords ?? [],
                results: simPatch.results,
                schedule: stateWithSim.schedule ?? [],
                teams: stateWithSim.teams,
                nonNBATeams: stateWithSim.nonNBATeams ?? [],
                fallbackDate: stateWithSim.date ?? '',
                fallbackSeason: stateWithSim.leagueStats.year,
            });
            if (updatedSimRecords.length !== (stateWithSim.simFranchiseRecords ?? []).length ||
                updatedSimRecords.some((r, i) => r !== (stateWithSim.simFranchiseRecords ?? [])[i])) {
                stateWithSim = { ...stateWithSim, simFranchiseRecords: updatedSimRecords };
            }
        }

        // Check roster compliance: if still over 15 during regular season, send coach message
        if (stateWithSim.gameMode === 'gm' && stateWithSim.userTeamId !== undefined) {
            if (isRegularSeason) {
                const maxStd = getStandardRosterLimit(stateWithSim.leagueStats);
                const twoWayActive = getTwoWayRosterLimit(stateWithSim.leagueStats) > 0;
                const userRoster = stateWithSim.players.filter(p =>
                    p.tid === stateWithSim.userTeamId && (!twoWayActive || !isTwoWayContract(p, stateWithSim.leagueStats)) && p.status === 'Active'
                );
                if (userRoster.length > maxStd) {
                    const excess = userRoster.length - maxStd;
                    const msg = `Boss, we're still over ${maxStd} standard players (${userRoster.length} total). We can't sim the regular season like this—need to cut ${excess} player(s).`;
                    stateWithSim = pushCoachMessage(stateWithSim, msg);
                }
            }
        }

        // ── Self-heal: catch saves where Cup groups exist but no Cup games tagged ─
        // Fires once per sim tick, idempotent. Recovers any save that missed the
        // Cup-injection codepath at schedule generation time.
        // Precondition: only self-heal when a real RS schedule already exists.
        // Without this, after Y2 rollover (schedule=[], nbaCup.groups reseeded)
        // we'd inject Cup games into the empty schedule, which then trips the
        // Aug-14 generator's "regular season already exists" guard and the new
        // season never gets a real schedule.
        const hasRegularSeasonGamesSelfHeal = simPatch.schedule.some(
          g => !(g as any).isPreseason && !(g as any).isPlayoff && !(g as any).isPlayIn && !(g as any).isNBACup && !(g as any).isCupTBD
        );
        if (
          hasRegularSeasonGamesSelfHeal &&
          usesLegacyNbaCupState(stateWithSim.leagueStats) &&
          stateWithSim.nbaCup?.groups?.length &&
          !simPatch.schedule.some(g => (g as any).isNBACup)
        ) {
          const scheduledDates: Record<string, Set<number>> = {};
          for (const g of simPatch.schedule as any[]) {
            const ds = String(g.date).split('T')[0];
            if (!scheduledDates[ds]) scheduledDates[ds] = new Set<number>();
            scheduledDates[ds].add(g.homeTid); scheduledDates[ds].add(g.awayTid);
          }
          const maxGid = Math.max(0, ...simPatch.schedule.map(g => g.gid));
          const prevYr = stateWithSim.leagueStats.year - 1;
          const cupCalendar = getLeagueCalendarDates(stateWithSim.leagueStats.year, stateWithSim.leagueStats);
          const result = injectCupGroupGames(
            [], maxGid + 1, stateWithSim.nbaCup.groups,
            getSimulationSeed(stateWithSim), prevYr, scheduledDates,
            {
              excludeFromRecord: true,
              cupStart: cupCalendar.cupStart,
              cupFinal: cupCalendar.cupFinal,
            },
          );
          if (result.games.length > 0) {
            simDebug('lifecycle', () => `Injected ${result.games.length} missing legacy Cup group games.`, {
              gamesInjected: result.games.length,
            });
            simPatch.schedule = [...simPatch.schedule, ...result.games].sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
            );
          }
        }

        // ── NBA Cup standings + phase transitions ────────────────────────────
        const applyPatchStart = perfNow();
        ({ stateWithSim, simPatch } = applyCupSimulationPass(stateWithSim, simPatch));

        stateWithSim = applySimPatchState(stateWithSim, simPatch, justEliminated, newInjToasts, newFightToasts, newFeatToasts);

        const datedSimResults = dateSimulationResults(stateWithSim, simPatch.results);

        if (processResultsPerDay && datedSimResults.length > 0) {
            const processed = withDeterministicRandom(
                `${getSimulationSeed(stateWithSim)}:daily-result-merge:${simDateNorm}`,
                () => processSimulationResults(
                    datedSimResults,
                    stateWithSim.players,
                    stateWithSim.draftPicks,
                    stateWithSim.schedule,
                    stateWithSim.leagueStats?.year,
                    stateWithSim.teams,
                    stateWithSim.leagueStats,
                ),
            );
            stateWithSim = {
                ...stateWithSim,
                players: processed.updatedPlayers,
                draftPicks: processed.updatedDraftPicks,
            };
        }

        allSimResults.push(...datedSimResults);
        perDayResults.push({ date: stateWithSim.date, results: datedSimResults });

        if (i === daysToSimulate - 1) {
            lastDaySimResults = datedSimResults;
        }

        // Advance playoff bracket after today's results (handles play-in advancement + round injection)
        if (datedSimResults.length > 0) {
            const playoffAdvanceStart = perfNow();
            stateWithSim = applyPlayoffLogic(stateWithSim, datedSimResults, numGamesPerRound);
            stateWithSim = applyCompetitionProgression(
                stateWithSim,
                processResultsPerDay ? datedSimResults : allSimResults,
                stateWithSim.activeCompetitions ?? [],
                stateWithSim.leagueStats?.year ?? new Date().getFullYear(),
            );
            playoffPassMs += perfMs(playoffAdvanceStart);
        }
        if (processResultsPerDay && datedSimResults.length > 0) {
            stateWithSim = {
                ...stateWithSim,
                boxScores: [
                    ...(stateWithSim.boxScores ?? []),
                    ...datedSimResults,
                ],
            };
        }
        const applyPatchMs = perfMs(applyPatchStart);
        throwInjectedAtomicFailure('after-games');

        const calendarPassStart = perfNow();
        const { stateWithSim: calendarState, simDateNorm: simDateForEvents, isPlayoffDay } =
            applySeasonCalendarPasses(stateWithSim, includeDerivedMedia);
        stateWithSim = calendarState;
        const calendarPassMs = perfMs(calendarPassStart);
        throwInjectedAtomicFailure('after-calendar');

        // AI trade proposals — frequency increases as trade deadline approaches
        const tradePassStart = perfNow();
        let tradeProposalGeneratorCalls = 0;
        let tradeProposalsGenerated = 0;
        let pendingAITradesScanned = 0;
        let tradeMutationsExecuted = 0;
        const simDateForTrades = normalizeDate(stateWithSim.date);
        const tradeDeadline = toISODateString(getTradeDeadlineDate(stateWithSim.leagueStats?.year ?? new Date().getFullYear(), stateWithSim.leagueStats));
        const beforeTradeDeadline = simDateForTrades <= tradeDeadline;
        const pbaTradeWindowOpen = isPbaIsolatedMode(stateWithSim) && isPbaTradeWindowOpen(stateWithSim);
        const tradeSeasonYear = stateWithSim.leagueStats?.year ?? new Date().getFullYear();
        const draftDate = toISODateString(getDraftDate(tradeSeasonYear, stateWithSim.leagueStats));
        const playoffsResolved = !stateWithSim.playoffs || Number.isInteger(Number(stateWithSim.playoffs.champion));
        const nbaOffseasonTradeWindowOpen = !isPbaIsolatedMode(stateWithSim)
            && simDateForTrades >= draftDate
            && playoffsResolved;
        const tradeWindowOpen = pbaTradeWindowOpen
            || (!isPbaIsolatedMode(stateWithSim) && (beforeTradeDeadline || nbaOffseasonTradeWindowOpen));
        const forceLegacyTradeTiming = (globalThis as typeof globalThis & {
            __tradeActivityTimingProfile?: string;
        }).__tradeActivityTimingProfile === 'legacy';
        const useEmpiricalNbaTiming = usesNbaTradeActivityModel(stateWithSim) && !forceLegacyTradeTiming;
        const freqSlider = SettingsManager.getSettings().aiTradeFrequency ?? 50;
        let nbaTradeActivityDecision: TradeActivityDecision | undefined;
        if (useEmpiricalNbaTiming) {
            nbaTradeActivityDecision = resolveTradeActivityDecision({
                date: stateWithSim.date,
                seasonYear: tradeSeasonYear,
                leagueStats: stateWithSim.leagueStats,
                aiTradeFrequency: freqSlider,
                saveSeed: getSimulationSeed(stateWithSim),
            });
            recordSimulationPerf({
                engine: 'trade-activity-prior',
                date: simDateForTrades,
                phase: nbaTradeActivityDecision.phase,
                relativeAnchor: nbaTradeActivityDecision.relativeAnchor,
                relativeOffset: nbaTradeActivityDecision.relativeOffset,
                activityIntensity: nbaTradeActivityDecision.activityIntensity,
                historicalSampleCount: nbaTradeActivityDecision.historicalSampleCount,
                band: nbaTradeActivityDecision.band,
                generatorEligibilityWeight: nbaTradeActivityDecision.generatorEligibilityWeight,
                generatorOpportunityHazard: nbaTradeActivityDecision.generatorOpportunityHazard,
                opportunityCount: nbaTradeActivityDecision.opportunityCount,
                eligibilityRoll: nbaTradeActivityDecision.eligibilityRoll,
                legalWindowOpen: tradeWindowOpen,
                isPlayoffDay,
                generatorEligible: tradeWindowOpen && !isPlayoffDay && nbaTradeActivityDecision.eligible,
            });
        }
        const executePendingAITrades = (limit: number) => {
            const pendingAITrades = (stateWithSim.tradeProposals ?? []).filter(
                proposal => proposal.isAIvsAI && proposal.status === 'accepted',
            );
            pendingAITradesScanned += pendingAITrades.length;
            for (const proposal of pendingAITrades.slice(0, limit)) {
                const historyCount = stateWithSim.history?.length ?? 0;
                const patch = executeAITrade(proposal, stateWithSim);
                stateWithSim = { ...stateWithSim, ...patch };
                if ((stateWithSim.history?.length ?? 0) > historyCount) tradeMutationsExecuted += 1;
            }
        };
        let empiricalOpportunitiesCommitted = false;
        if (!isPlayoffDay && tradeWindowOpen) {
            const freqMult = freqSlider <= 0 ? 999 : Math.max(0.5, 1.5 - freqSlider / 100);
            const attemptedProposalIds = new Set<string>();
            const collectTradeProposals = (
                daysToDeadline: number,
                scope: 'pba' | 'nba',
                opportunityIndex = 0,
            ) => {
                if (scope === 'nba' && nbaTradeActivityDecision) {
                    if (opportunityIndex >= nbaTradeActivityDecision.opportunityCount) {
                        return [] as ReturnType<typeof generateAIDayTradeProposals>;
                    }
                } else {
                    const tradeFreq = Math.round((daysToDeadline <= 7 ? 3 : daysToDeadline <= 14 ? 7 : 14) * freqMult);
                    if (stateWithSim.day % tradeFreq !== 0) return [] as ReturnType<typeof generateAIDayTradeProposals>;
                }
                tradeProposalGeneratorCalls += 1;
                const baseSeed = `${getSimulationSeed(stateWithSim)}:ai-trade-proposals:${simDateForTrades}:${scope}`;
                const proposalSeed = opportunityIndex === 0
                    ? baseSeed
                    : `${baseSeed}:trade-activity-opportunity-${opportunityIndex}`;
                const proposals = withDeterministicRandom(
                    proposalSeed,
                    () => generateAIDayTradeProposals(
                        stateWithSim,
                        scope,
                        scope === 'nba' && useEmpiricalNbaTiming
                            ? {
                                excludeProposalIds: opportunityIndex > 0 ? attemptedProposalIds : undefined,
                                requireExecutableRosterFit: true,
                            }
                            : (opportunityIndex > 0 ? { excludeProposalIds: attemptedProposalIds } : undefined),
                    ),
                );
                proposals.forEach(proposal => attemptedProposalIds.add(proposal.id));
                tradeProposalsGenerated += proposals.length;
                return proposals;
            };

            const daysToDeadline = (new Date(tradeDeadline).getTime() - new Date(simDateForTrades).getTime()) / 86_400_000;
            if (!isPbaIsolatedMode(stateWithSim) && (nbaTradeActivityDecision?.opportunityCount ?? 0) > 1) {
                empiricalOpportunitiesCommitted = true;
                for (let opportunityIndex = 0; opportunityIndex < nbaTradeActivityDecision!.opportunityCount; opportunityIndex += 1) {
                    const proposals = collectTradeProposals(daysToDeadline, 'nba', opportunityIndex);
                    if (proposals.length > 0) {
                        stateWithSim = {
                            ...stateWithSim,
                            tradeProposals: [...(stateWithSim.tradeProposals ?? []), ...proposals],
                        };
                    }
                    executePendingAITrades(2);
                }
            } else {
                const newProposals = [
                    ...(pbaTradeWindowOpen ? collectTradeProposals(14, 'pba') : []),
                    ...((beforeTradeDeadline && isPbaIsolatedMode(stateWithSim))
                        ? collectTradeProposals(daysToDeadline, 'nba')
                        : (!isPbaIsolatedMode(stateWithSim) ? collectTradeProposals(daysToDeadline, 'nba') : [])),
                ];
                if (newProposals.length > 0) {
                    stateWithSim = {
                        ...stateWithSim,
                        tradeProposals: [...(stateWithSim.tradeProposals ?? []), ...newProposals],
                    };
                }
            }
        }

        // Execute accepted AI-vs-AI proposals (max 2 per sim day to avoid roster chaos)
        if (!isPlayoffDay && !empiricalOpportunitiesCommitted) executePendingAITrades(2);
        const tradePassMs = perfMs(tradePassStart);
        recordSimulationPerf({
            engine: 'trade-pass-forensics',
            day: simDateNorm,
            tradeWindowOpen,
            isPlayoffDay,
            proposalGeneratorCalls: tradeProposalGeneratorCalls,
            proposalsGenerated: tradeProposalsGenerated,
            pendingAITradesScanned,
            mutations: tradeMutationsExecuted,
            noOp: tradeProposalsGenerated === 0 && tradeMutationsExecuted === 0,
            totalMs: tradePassMs,
            stateTeams: stateWithSim.teams.length,
            statePlayers: stateWithSim.players.length,
        });
        throwInjectedAtomicFailure('after-trade');

        // ── Offseason orchestrator (Sessions 3-4 — plan is AUTHORITATIVE) ──
        // The plan owns all four offseason dispatch decisions: rollover,
        // tickFAMarkets, runAIFAPass, runBirdRightsPass. Date arithmetic, the
        // moratorium check, and the FA frequency taper all live in
        // src/services/offseason/offseasonPlan.ts. Per-function drift warnings
        // (Session 1) still fire if a non-orchestrator caller invokes one of
        // these in the wrong phase.
        const offseasonPlan = getOffseasonDayPlan(stateWithSim);

        // Season rollover — fires once at the postDraft → moratorium boundary.
        // Year increment inside applySeasonRollover acts as the idempotency guard.
        if (offseasonPlan.actions.rollover === 'fire') {
            const rolloverStart = perfNow();
            simDebug('lifecycle', () => `[OSPLAN] simulationHandler.rollover fire date=${stateWithSim.date}`);
            const rolloverPatch = applySeasonRollover(stateWithSim);
            stateWithSim = { ...stateWithSim, ...rolloverPatch };
            // Re-compute strengths after roster changes from contract expiry
            const rolloverStrengthStart = perfNow();
            stateWithSim.teams = updateTeamStrengths(stateWithSim.teams, stateWithSim.players);
            recordSimulationPerf({
                engine: 'simulation-rollover',
                day: simDateNorm,
                stage: 'rolloverStrengthRefresh',
                ms: perfMs(rolloverStrengthStart),
                teams: stateWithSim.teams.length,
                players: stateWithSim.players.length,
            });
            rolloverMs += perfMs(rolloverStart);

            // (Historical note: an inline Bird Rights pass used to fire here on
            // the season-transition date, but it was disabled because that is
            // pre-moratorium and would create tampering signings that jump
            // active user bids. Bird Rights now fires via the orchestrator's
            // runBirdRightsPass action on the first post-moratorium day.)
        }

        // Free-agency window detection, moratorium checks and signing cadence
        // are owned by offseasonPlan; this local flag only scopes legacy roster cleanup.

        // Incumbent Bird Rights signings should not land on the season transition or
        // during the moratorium. They resolve once the market can actually sign.
        // Plan-authoritative since Session 3.
        if (offseasonPlan.actions.runBirdRightsPass === 'fire') {
            const birdRightsStart = perfNow();
            simDebug('lifecycle', () => `[OSPLAN] simulationHandler.runBirdRightsPass fire date=${stateWithSim.date}`);
            stateWithSim = applyBirdRightsResignsPass(stateWithSim);
            stateWithSim = normalizeReservedJerseys(
                stateWithSim,
                stateWithSim.players.filter(p => (p as any).birdRightsResignedThisYear === (stateWithSim.leagueStats?.year ?? new Date().getFullYear())).map(p => p.tid),
            );
            birdRightsPassMs += perfMs(birdRightsStart);
        }

        // G-League auto-assignment used to run every 7 days and stash every 0-GP
        // standard player — that compounded into IND's 36-man roster by mid-Feb
        // because the trim excluded gLeagueAssigned from the 15-man count. In the
        // real NBA, G-League assignment is mostly a two-way mechanic; standard
        // players who don't play just sit on the bench or get waived. Since this
        // sim doesn't simulate G-League games, we removed the auto-demotion
        // entirely — over-roster teams are now handled by autoTrimOversizedRosters,
        // which waives excess standard players straight to the FA pool.
        //
        // Legacy cleanup: any player still flagged gLeagueAssigned=true from a
        // previous save gets the flag cleared here so they re-enter the normal
        // roster count (and the trim will cut them if the team is over 15).
        const offseasonPassStart = perfNow();
        const legacyRosterPassStart = perfNow();
        stateWithSim = clearLegacyGLeagueAssignments(stateWithSim, isRegularSeason);
        rosterPassMs += perfMs(legacyRosterPassStart);
        const isCentralFreeAgencyDay =
            !isEuroIsolatedMode(stateWithSim)
            && freeAgencyDay > 0
            && freeAgencyDay <= freeAgencyTotal;
        if (isCentralFreeAgencyDay) {
            const season = stateWithSim.leagueStats?.year ?? new Date().getUTCFullYear();
            const pbaCentralDay = isPbaIsolatedMode(stateWithSim);
            const coreDecisionTotal = Math.min(freeAgencyTotal, CENTRAL_CORE_FREE_AGENCY_DAYS);
            const unresolvedCentralMarkets = (stateWithSim.faBidding?.markets ?? [])
                .filter(market => !market.resolved)
                .map(market => {
                    const player = stateWithSim.players.find(candidate => candidate.internalId === market.playerId);
                    return { market, k2: player ? getK2(player) : Number.NEGATIVE_INFINITY };
                })
                .sort((left, right) => right.k2 - left.k2
                    || left.market.playerId.localeCompare(right.market.playerId));
            const centralPriorityByPlayerId = new Map(
                unresolvedCentralMarkets.map((entry, index) => [entry.market.playerId, index]),
            );
            stateWithSim = {
                ...stateWithSim,
                ...(!pbaCentralDay
                    ? {
                        faBidding: {
                            markets: (stateWithSim.faBidding?.markets ?? []).map(market => {
                                if (market.resolved) return market;
                                const centralDecisionDay = market.centralDecisionDay
                                    ?? getPriorityFreeAgencyDecisionDay(
                                        centralPriorityByPlayerId.get(market.playerId) ?? unresolvedCentralMarkets.length,
                                        unresolvedCentralMarkets.length,
                                        freeAgencyDay,
                                        coreDecisionTotal,
                                    );
                                const isDue = centralDecisionDay <= freeAgencyDay || freeAgencyDay >= coreDecisionTotal;
                                return {
                                    ...market,
                                    centralDecisionDay,
                                    centralDecisionLocked: isDue,
                                    decidesOnDay: isDue ? stateWithSim.day : Math.max(
                                        stateWithSim.day + 1,
                                        stateWithSim.day + centralDecisionDay - freeAgencyDay,
                                    ),
                                    bids: market.bids.map(bid => ({
                                        ...bid,
                                        expiresDay: isDue ? stateWithSim.day : Math.max(
                                            stateWithSim.day + 1,
                                            stateWithSim.day + centralDecisionDay - freeAgencyDay,
                                        ),
                                    })),
                                };
                            }),
                        },
                    }
                    : {}),
                faResolveAllToday:
                    !pbaCentralDay
                    && freeAgencyDay >= coreDecisionTotal,
                ...(stateWithSim.pbaLocalFreeAgency?.period === 'offseason'
                    ? {
                        pbaLocalFreeAgency: {
                            ...stateWithSim.pbaLocalFreeAgency,
                            markets: stateWithSim.pbaLocalFreeAgency.markets.map(market => {
                                if (market.resolved) return market;
                                const centralDecisionDay = market.centralDecisionDay
                                    ?? getHiddenFreeAgencyDecisionDay(market.playerId, season, freeAgencyDay, freeAgencyTotal);
                                const resolvesOnDay = centralDecisionDay <= freeAgencyDay || freeAgencyDay >= freeAgencyTotal
                                    ? stateWithSim.day
                                    : stateWithSim.day + centralDecisionDay - freeAgencyDay;
                                return {
                                    ...market,
                                    centralDecisionDay,
                                    bids: market.bids.map(bid => ({ ...bid, resolvesOnDay })),
                                };
                            }),
                        },
                    }
                    : {}),
            };
        }
        if (offseasonPlan.actions.tickFAMarkets === 'fire') {
            const faMarketStart = perfNow();
            const faTickPass = applyFAMarketTickPass(stateWithSim, includeDerivedMedia);
            stateWithSim = { ...faTickPass.stateWithSim, faResolveAllToday: undefined };
            if (faTickPass.userInterrupted) userInterrupted = true;
            faMarketPassMs += perfMs(faMarketStart);
        }
        if (stateWithSim.faResolveAllToday) {
            stateWithSim = { ...stateWithSim, faResolveAllToday: undefined };
        }
        const nonGuaranteedStart = perfNow();
        stateWithSim = applyNonGuaranteedGuaranteePass(stateWithSim);
        faMarketPassMs += perfMs(nonGuaranteedStart);
        const aiFreeAgencyPlan = isCentralFreeAgencyDay && !isPbaIsolatedMode(stateWithSim)
            ? {
                ...offseasonPlan,
                actions: { ...offseasonPlan.actions, runAIFAPass: 'fire' as const },
            }
            : offseasonPlan;
        const aiFreeAgencyStart = perfNow();
        stateWithSim = applyAIFreeAgencyPass(
            stateWithSim,
            aiFreeAgencyPlan,
            simMonth,
            simDayNum,
            isCentralFreeAgencyDay
                ? { day: freeAgencyDay, totalDays: freeAgencyTotal }
                : undefined,
            includeDerivedMedia,
        );
        if (isCentralFreeAgencyDay && freeAgencyDay > CENTRAL_CORE_FREE_AGENCY_DAYS) {
            stateWithSim = applyExternalSigningRoutingPass(
                stateWithSim,
                includeDerivedMedia,
                {
                    day: freeAgencyDay - CENTRAL_CORE_FREE_AGENCY_DAYS,
                    totalDays: freeAgencyTotal - CENTRAL_CORE_FREE_AGENCY_DAYS,
                },
            );
        }
        if (isPbaIsolatedMode(stateWithSim)) {
            const pendingToastCount = stateWithSim.pendingFAToasts?.length ?? 0;
            stateWithSim = tickPbaLocalFreeAgency(
                stateWithSim,
                freeAgencyDay > 0 && freeAgencyDay <= freeAgencyTotal
                    ? freeAgencyDay
                    : undefined,
            );
            if ((stateWithSim.pendingFAToasts?.length ?? 0) > pendingToastCount) {
                userInterrupted = true;
            }
        }
        aiFreeAgencyPassMs += perfMs(aiFreeAgencyStart);
        if (isCentralFreeAgencyDay) {
            const summary = buildFreeAgencyDailySummary(
                freeAgencySummaryBefore,
                stateWithSim,
                freeAgencyDay,
                freeAgencyTotal,
            );
            const previousSummary = action?.payload?.freeAgencyCombinedSummaryReset === true && i === 0
                ? undefined
                : stateWithSim.pendingFreeAgencySummary;
            const mergedSummary = mergeFreeAgencySummaries(
                previousSummary,
                summary,
                action?.payload?.freeAgencyCombinedSummary === true,
            );
            stateWithSim = {
                ...stateWithSim,
                pendingFreeAgencySummary: action?.payload?.commissionerFreeAgencyReview === true
                    ? { ...mergedSummary, commissionerReview: true }
                    : mergedSummary,
                pendingFAToasts: freeAgencySummaryBefore.pendingFAToasts,
            };
            if (action?.payload?.freeAgencyCombinedSummary === true) userInterrupted = false;
        }
        const offseasonPassMs = perfMs(offseasonPassStart);

        // Euro Transfer Market: daily tick (AI listings/bids/accepts).
        // Safe to run in NBA mode too — transferListings array would be empty —
        // but gate on euro_isolated for clarity + perf.
        const transferPassStart = perfNow();
        if (stateWithSim.leagueStats?.uiMode === 'euro_isolated') {
            const transferSummaryBefore = stateWithSim;
            const tmTick = tickTransferMarket(stateWithSim);
            stateWithSim = {
                ...stateWithSim,
                transferListings: tmTick.transferListings,
                transferBids: tmTick.transferBids,
                transferActivity: tmTick.transferActivity,
                players: tmTick.players,
                teams: tmTick.teams,
                nonNBATeams: tmTick.nonNBATeams,
                ...(tmTick.historyEntries.length > 0 ? {
                    history: [...(stateWithSim.history ?? []), ...tmTick.historyEntries] as any,
                } : {}),
                ...(tmTick.userBidResolutions.length > 0 ? {
                    pendingTransferToasts: [
                        ...(stateWithSim.pendingTransferToasts ?? []),
                        ...tmTick.userBidResolutions,
                    ],
                } : {}),
            };
            const loanTick = tickLoanMarket(stateWithSim);
            stateWithSim = {
                ...stateWithSim,
                players: loanTick.players,
                teams: loanTick.teams,
                nonNBATeams: loanTick.nonNBATeams,
                loanOffers: loanTick.loanOffers,
                loanAgreements: loanTick.loanAgreements,
                history: loanTick.history,
                pendingLoanToasts: loanTick.pendingLoanToasts,
            };
            if (action?.payload?.transferMarketDailySummary === true) {
                stateWithSim = {
                    ...stateWithSim,
                    pendingTransferMarketSummary: buildTransferMarketDailySummary(
                        transferSummaryBefore,
                        stateWithSim,
                        simDateNorm,
                    ),
                };
            }
        }
        const transferPassMs = perfMs(transferPassStart);

        if (processResultsPerDay) {
            stateWithSim = appendMediaFacts(stateWithSim, buildSimulationMediaFacts({
                before: mediaStateBeforeDay,
                after: stateWithSim,
                results: datedSimResults,
            }));
        }

        onDayTrace?.({
            phase: 'after-day',
            date: simDateNorm,
            state: stateWithSim,
            results: datedSimResults,
        });

        recordSimulationPerf({
            engine: 'simulation-day',
            dayIndex: i + 1,
            totalDays: daysToSimulate,
            day: simDateNorm,
            games: datedSimResults.length,
            simulateGamesMs,
            applyPatchMs,
            calendarPassMs,
            tradePassMs,
            offseasonPassMs,
            transferPassMs,
            playoffPassMs,
            rosterPassMs,
            rolloverMs,
            birdRightsPassMs,
            faMarketPassMs,
            aiFreeAgencyPassMs,
            trainingDayMs,
            totalDayMs: perfMs(dayStart),
        });

        // A composite lifecycle command stops on the first fully committed day
        // that satisfies its immutable plan, even when the outer runner chose a
        // multi-day batch. No later calendar day may drift past that transition.
        if (lifecycleTransitionTarget && evaluateTargetPlan(stateWithSim, targetPlan!).satisfied) {
            break;
        }

        // Bulk targets retain one atomic batch commit, but yield after a fully
        // processed day so the outer runner can publish a state-neutral stage
        // heartbeat. No date, result, stat or lifecycle patch is exposed here.
        if (!includeDerivedMedia && !userInterrupted && i < daysToSimulate - 1) {
            if (longSimYieldBudget) {
                await yieldLongSimIfDue(longSimYieldBudget, { reason: 'simulation-day' });
            } else {
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            }
        }

        // End-of-day: if a user-facing FA event fired this tick, stop the batch
        // so the toast/modal lands at the resolution moment. The day's full
        // pipeline (games, trim, AI signings, etc.) has completed, so state is
        // coherent — next sim resumes on day+1.
        if (userInterrupted) break;
    }

    throwInjectedAtomicFailure('before-commit');
    const updatedActivePlayers = new Map(stateWithSim.players.map(player => [player.internalId, player]));
    const originalPlayerIds = new Set(universePlayers.map(player => player.internalId));
    stateWithSim = {
        ...stateWithSim,
        players: [
            ...universePlayers.map(player => (
                activePlayerIds.has(player.internalId) ? (updatedActivePlayers.get(player.internalId) ?? player) : player
            )),
            ...stateWithSim.players.filter(player => !originalPlayerIds.has(player.internalId)),
        ],
    };

    if (cloneMutationBaseline) {
        const currentPlayers = new Map(stateWithSim.players
            .filter(player => activePlayerIds.has(player.internalId))
            .map(player => [player.internalId, JSON.stringify(player)]));
        const currentContracts = new Map(stateWithSim.players
            .filter(player => activePlayerIds.has(player.internalId))
            .map(player => [player.internalId, JSON.stringify({
                contract: player.contract,
                contractYears: player.contractYears,
                hasBirdRights: (player as any).hasBirdRights,
                yearsWithTeam: (player as any).yearsWithTeam,
            })]));
        const currentTeams = new Map(stateWithSim.teams.map(team => [team.id, JSON.stringify(team)]));
        const currentSchedule = new Map(stateWithSim.schedule.map(game => [game.gid, JSON.stringify(game)]));
        const currentBackgroundPlayers = new Map(stateWithSim.players
            .filter(player => !activePlayerIds.has(player.internalId))
            .map(player => [player.internalId, JSON.stringify(player)]));
        recordSimulationPerf({
            engine: 'clone-mutation-forensics',
            caller: 'runSimulation',
            startDate: normalizeDate(state.date),
            endDate: normalizeDate(stateWithSim.date),
            daysToSimulate,
            playersTotal: currentPlayers.size,
            playersChanged: countChangedById(cloneMutationBaseline.players, currentPlayers),
            contractsChanged: countChangedById(cloneMutationBaseline.playerContracts, currentContracts),
            teamsTotal: currentTeams.size,
            teamsChanged: countChangedById(cloneMutationBaseline.teams, currentTeams),
            scheduleRowsTotal: currentSchedule.size,
            scheduleRowsChanged: countChangedById(cloneMutationBaseline.schedule, currentSchedule),
            backgroundPlayersTotal: currentBackgroundPlayers.size,
            backgroundPlayersChanged: countChangedById(cloneMutationBaseline.backgroundPlayers, currentBackgroundPlayers),
            playoffsChanged: cloneMutationBaseline.playoffs !== JSON.stringify(stateWithSim.playoffs ?? null),
            draftChanged: cloneMutationBaseline.draft !== JSON.stringify({
                draftPicks: stateWithSim.draftPicks,
                draftClass: (stateWithSim as any).draftClass,
                draftResults: (stateWithSim as any).draftResults,
            }),
            lifecycleChanged: cloneMutationBaseline.lifecycle !== JSON.stringify({
                seasonLifecycle: stateWithSim.seasonLifecycle,
                offseasonChecklist: stateWithSim.offseasonChecklist,
                commissionerTasks: stateWithSim.commissionerTasks,
                leagueStats: stateWithSim.leagueStats,
            }),
            historyRowsAppended: Math.max(0, (stateWithSim.history?.length ?? 0) - cloneMutationBaseline.historyLength),
            mediaFactsAppended: Math.max(0, (stateWithSim.mediaFacts?.length ?? 0) - cloneMutationBaseline.mediaFactsLength),
        });
    }

    recordSimulationPerf({
        engine: 'simulation-batch',
        daysToSimulate,
        totalGames: allSimResults.length,
        activePlayers: activePlayers.length,
        backgroundPlayers: universePlayers.length - activePlayers.length,
        cloneSimulationStateMs,
        strengthPrepMs,
        totalBatchMs: perfMs(batchStart),
    });

    return {
        stateWithSim,
        allSimResults,
        lastDaySimResults,
        perDayResults,
        userInterrupted,
        lastDailyProgressionDate,
        dailyProgressionMs,
    };
};
