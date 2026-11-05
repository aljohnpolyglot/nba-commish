import { NBATeam as Team, NBAPlayer as Player } from '../../types';
import { GameResult } from './StatGenerator';
import { SimulatorKnobs, KNOBS_DEFAULT } from './SimulatorKnobs';
import { SettingsManager } from '../SettingsManager';
import { normalizeGameResultScoreIntegrity, validateGameResultContract } from './resultIntegrity';
import { resolveHybridEngine, type SimulationEnginePolicy } from './hybridRouter';
import { attachCanonicalShotStats } from './shotAttribution';
import {
  incrementSimulationExecutionLedger,
  recordSimulationPerf,
} from './simulationPerfDebug';
import { withDeterministicRandom } from './deterministicRandom';

export type SimulatorMode = SimulationEnginePolicy;

export const getSimulatorMode = (): SimulatorMode => {
  return SettingsManager.getSettings().simulatorMode ?? 'hybrid';
};

export interface SimulateGameArgs {
  homeTeam: Team;
  awayTeam: Team;
  players: Player[];
  gameId: number;
  date: string;
  season?: number;
  playerApproval?: number;
  homeOverridePlayers?: Player[];
  awayOverridePlayers?: Player[];
  isAllStar?: boolean;
  isRisingStars?: boolean;
  isEliminationGame?: boolean;
  riggedForTid?: number;
  homeKnobs?: SimulatorKnobs;
  awayKnobs?: SimulatorKnobs;
  injuryFrequencyFactor?: number;
  rngSeed?: string | number;
  enginePolicy?: SimulationEnginePolicy;
  controlledTeamIds?: number[];
  watched?: boolean;
  spotlight?: boolean;
  isPlayoff?: boolean;
  isFinals?: boolean;
  /** Exact league-season rule. Never enabled for a postseason game. */
  allowTies?: boolean;
}

export type FastSimRunner = (args: SimulateGameArgs) => GameResult;

let realisticRunner: FastSimRunner | null = null;

export const registerRealisticRunner = (runner: FastSimRunner) => {
  realisticRunner = runner;
};

/**
 * Isolate an engine attempt without cloning the full saved player universe.
 * Both simulation engines scope ordinary game input to the two participating
 * team IDs; exhibition/all-star rosters are carried by the explicit override
 * arrays. Keeping that boundary here preserves retry isolation while avoiding
 * a whole-save clone for every scheduled game.
 */
export const prepareIsolatedAttemptInput = (args: SimulateGameArgs): SimulateGameArgs => {
  const gamePlayers = args.players.filter(player => (
    player.tid === args.homeTeam.id || player.tid === args.awayTeam.id
  ));
  const cloneValue = <T>(value: T): T => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
  };
  const clonePlayer = (player: Player): Player => ({
    ...player,
    ratings: player.ratings.map(rating => ({ ...rating })),
    injury: player.injury ? { ...player.injury } : player.injury,
    contract: player.contract ? { ...player.contract } : player.contract,
    draft: player.draft ? { ...player.draft } : player.draft,
    born: player.born ? { ...player.born } : player.born,
    // Career stats, transactions, awards, and timeline rows are read-only
    // engine evidence. Sharing them avoids re-copying years of history while
    // current ratings/injury/contract identity remain isolated above.
  });
  return {
    ...args,
    homeTeam: cloneValue(args.homeTeam),
    awayTeam: cloneValue(args.awayTeam),
    players: gamePlayers.map(clonePlayer),
    homeOverridePlayers: args.homeOverridePlayers?.map(clonePlayer),
    awayOverridePlayers: args.awayOverridePlayers?.map(clonePlayer),
    homeKnobs: args.homeKnobs ? cloneValue(args.homeKnobs) : undefined,
    awayKnobs: args.awayKnobs ? cloneValue(args.awayKnobs) : undefined,
    controlledTeamIds: args.controlledTeamIds ? [...args.controlledTeamIds] : undefined,
  };
};

export const buildSimulationAttemptSeed = (args: SimulateGameArgs, engine: string): string => [
  args.rngSeed ?? 'game',
  args.gameId,
  args.date,
  args.season ?? '',
  args.homeTeam.id,
  args.awayTeam.id,
  engine,
].join(':');

const runPreparedAttempt = (
  args: SimulateGameArgs,
  runner: FastSimRunner,
  engine: 'realistic' | 'fast' | 'fast-fallback',
  prepareMs: number = 0,
  totalStart: number = performance.now(),
  adapterMetrics: { policyLookupMs?: number; routeDecisionMs?: number } = {},
): GameResult => {
  const ledgerEngine = engine === 'realistic' ? 'realistic' : 'fast';
  const startedKey = ledgerEngine === 'realistic' ? 'realisticEngineStarted' : 'fastEngineStarted';
  const completedKey = ledgerEngine === 'realistic' ? 'realisticEngineCompleted' : 'fastEngineCompleted';
  const acceptedKey = ledgerEngine === 'realistic' ? 'realisticEngineAccepted' : 'fastEngineAccepted';
  const validationFailureKey = ledgerEngine === 'realistic' ? 'realisticValidationFailure' : 'fastValidationFailure';
  incrementSimulationExecutionLedger(startedKey);
  recordSimulationPerf({
    engine: 'execution-ledger',
    event: 'engine-started',
    selectedEngine: ledgerEngine,
    attemptEngine: engine,
    gameId: args.gameId,
  });
  const runnerStart = performance.now();
  let raw: GameResult;
  try {
    raw = withDeterministicRandom(buildSimulationAttemptSeed(args, engine), () => runner(args));
  } catch (error) {
    recordSimulationPerf({
      engine: 'execution-ledger',
      event: 'engine-error',
      selectedEngine: ledgerEngine,
      attemptEngine: engine,
      gameId: args.gameId,
    });
    throw error;
  }
  const runnerMs = performance.now() - runnerStart;
  incrementSimulationExecutionLedger(completedKey);
  if (!Array.isArray(raw.homeStats) || !Array.isArray(raw.awayStats) || raw.homeStats.length === 0 || raw.awayStats.length === 0) {
    incrementSimulationExecutionLedger(validationFailureKey);
    throw new Error(`Simulation result score contract failed: empty player lines for game ${args.gameId} (${engine})`);
  }
  const normalizeStart = performance.now();
  const normalized = normalizeGameResultScoreIntegrity(raw);
  const normalizeMs = performance.now() - normalizeStart;
  const validationStart = performance.now();
  try {
    validateGameResultContract(normalized, {
      allowTies: args.allowTies === true,
      isPostseason: args.isPlayoff === true || args.isEliminationGame === true,
    });
  } catch (error) {
    incrementSimulationExecutionLedger(validationFailureKey);
    throw error;
  }
  const validationMs = performance.now() - validationStart;
  const attributionStart = performance.now();
  const result = attachCanonicalShotStats({ ...normalized, simulationEngine: engine } as GameResult);
  const attributionMs = performance.now() - attributionStart;
  incrementSimulationExecutionLedger(acceptedKey);
  recordSimulationPerf({
    engine: 'execution-ledger',
    event: 'engine-accepted',
    selectedEngine: ledgerEngine,
    attemptEngine: engine,
    gameId: args.gameId,
  });
  recordSimulationPerf({
    engine: `adapter-${engine}`,
    gameId: args.gameId,
    prepareMs,
    runnerMs,
    normalizeMs,
    validationMs,
    attributionMs,
    policyLookupMs: adapterMetrics.policyLookupMs ?? 0,
    routeDecisionMs: adapterMetrics.routeDecisionMs ?? 0,
    totalMs: performance.now() - totalStart,
  });
  return result;
};

const runIsolatedAttempt = (
  args: SimulateGameArgs,
  runner: FastSimRunner,
  engine: 'realistic' | 'fast' | 'fast-fallback',
  adapterMetrics: { policyLookupMs?: number; routeDecisionMs?: number } = {},
): GameResult => {
  const totalStart = performance.now();
  const prepareStart = performance.now();
  const isolatedArgs = prepareIsolatedAttemptInput(args);
  const prepareMs = performance.now() - prepareStart;
  return runPreparedAttempt(isolatedArgs, runner, engine, prepareMs, totalStart, adapterMetrics);
};

export const simulateGameViaAdapter = (args: SimulateGameArgs, fastRunner: FastSimRunner): GameResult => {
  if (args.riggedForTid !== undefined) {
    incrementSimulationExecutionLedger('routeSelectedFast');
    return runIsolatedAttempt(args, fastRunner, 'fast');
  }
  const policyLookupStart = performance.now();
  const mode = args.enginePolicy ?? getSimulatorMode();
  const policyLookupMs = performance.now() - policyLookupStart;
  const routeStart = performance.now();
  const routedEngine = resolveHybridEngine({
    policy: mode,
    homeTeamId: args.homeTeam.id,
    awayTeamId: args.awayTeam.id,
    controlledTeamIds: args.controlledTeamIds,
    watched: args.watched,
    spotlight: args.spotlight,
    isPlayoff: args.isPlayoff,
    isEliminationGame: args.isEliminationGame,
    isFinals: args.isFinals,
  });
  const routeDecisionMs = performance.now() - routeStart;
  incrementSimulationExecutionLedger(routedEngine === 'realistic' ? 'routeSelectedRealistic' : 'routeSelectedFast');
  recordSimulationPerf({
    engine: 'execution-ledger',
    event: 'route-selected',
    selectedEngine: routedEngine,
    policy: mode,
    gameId: args.gameId,
  });
  const adapterMetrics = { policyLookupMs, routeDecisionMs };
  if (routedEngine === 'realistic' && realisticRunner) {
    try {
      return runIsolatedAttempt(args, realisticRunner, 'realistic', adapterMetrics);
    } catch (err) {
      incrementSimulationExecutionLedger('realisticFallbackToFast');
      incrementSimulationExecutionLedger('retryCount');
      incrementSimulationExecutionLedger('doubleEngineInvocationCount');
      recordSimulationPerf({ engine: 'execution-ledger', event: 'fallback', fromEngine: 'realistic', toEngine: 'fast', gameId: args.gameId });
      if (typeof console !== 'undefined') {
        console.warn('[SimulatorAdapter] realistic engine failed, falling back to fast:', err);
      }
      try {
        return runIsolatedAttempt(args, fastRunner, 'fast-fallback', adapterMetrics);
      } catch (fallbackError) {
        const realisticMessage = err instanceof Error ? err.message : String(err);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`Simulation attempts failed. Realistic: ${realisticMessage}. Fast fallback: ${fallbackMessage}`);
      }
    }
  }
  return runIsolatedAttempt(args, fastRunner, 'fast', adapterMetrics);
};

/**
 * Worker entry point. postMessage has already produced the isolated realm copy,
 * so cloning it again would make the worker path observably different from the
 * single isolated clone used by serial simulation.
 */
export const simulatePreparedGameViaAdapter = (args: SimulateGameArgs, fastRunner: FastSimRunner): GameResult => {
  if (args.riggedForTid !== undefined) {
    incrementSimulationExecutionLedger('routeSelectedFast');
    return runPreparedAttempt(args, fastRunner, 'fast');
  }
  const policyLookupStart = performance.now();
  const mode = args.enginePolicy ?? getSimulatorMode();
  const policyLookupMs = performance.now() - policyLookupStart;
  const routeStart = performance.now();
  const routedEngine = resolveHybridEngine({
    policy: mode,
    homeTeamId: args.homeTeam.id,
    awayTeamId: args.awayTeam.id,
    controlledTeamIds: args.controlledTeamIds,
    watched: args.watched,
    spotlight: args.spotlight,
    isPlayoff: args.isPlayoff,
    isEliminationGame: args.isEliminationGame,
    isFinals: args.isFinals,
  });
  const routeDecisionMs = performance.now() - routeStart;
  incrementSimulationExecutionLedger(routedEngine === 'realistic' ? 'routeSelectedRealistic' : 'routeSelectedFast');
  recordSimulationPerf({
    engine: 'execution-ledger',
    event: 'route-selected',
    selectedEngine: routedEngine,
    policy: mode,
    gameId: args.gameId,
  });
  const adapterMetrics = { policyLookupMs, routeDecisionMs };
  if (routedEngine === 'realistic' && realisticRunner) {
    // Preserve an untouched compact fallback input before the realistic runner
    // gets a chance to mutate its own isolated attempt.
    const fallbackArgs = prepareIsolatedAttemptInput(args);
    try {
      return runPreparedAttempt(args, realisticRunner, 'realistic', 0, performance.now(), adapterMetrics);
    } catch (err) {
      incrementSimulationExecutionLedger('realisticFallbackToFast');
      incrementSimulationExecutionLedger('retryCount');
      incrementSimulationExecutionLedger('doubleEngineInvocationCount');
      recordSimulationPerf({ engine: 'execution-ledger', event: 'fallback', fromEngine: 'realistic', toEngine: 'fast', gameId: args.gameId });
      if (typeof console !== 'undefined') {
        console.warn('[SimulatorAdapter] realistic worker engine failed, falling back to fast:', err);
      }
      try {
        return runPreparedAttempt(fallbackArgs, fastRunner, 'fast-fallback', 0, performance.now(), adapterMetrics);
      } catch (fallbackError) {
        const realisticMessage = err instanceof Error ? err.message : String(err);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`Simulation attempts failed. Realistic: ${realisticMessage}. Fast fallback: ${fallbackMessage}`);
      }
    }
  }
  return runPreparedAttempt(args, fastRunner, 'fast', 0, performance.now(), adapterMetrics);
};
