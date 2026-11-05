import {
  epochNow,
  type GameSimulationWorkerBatchRequest,
  type GameSimulationWorkerResponse,
} from '../services/simulation/gameSimulationWorkerProtocol';
import { runGameSimulationWorkerBatch } from '../services/simulation/gameSimulationWorkerRuntime';

self.onmessage = (event: MessageEvent<GameSimulationWorkerBatchRequest>) => {
  const request = event.data;
  if (!request || request.kind !== 'simulate-batch' || !Number.isInteger(request.id) || !Array.isArray(request.jobs)) {
    self.postMessage({
      id: Number(request?.id ?? -1),
      kind: 'error',
      message: 'Malformed game simulation worker request.',
    } satisfies GameSimulationWorkerResponse);
    return;
  }

  const startedAt = epochNow();
  try {
    const results = runGameSimulationWorkerBatch(request.jobs, request.clubDebuffs, request.injuryDefinitions);
    const engineMs = Math.max(0, epochNow() - startedAt);
    self.postMessage({
      id: request.id,
      kind: 'result',
      results,
      metrics: {
        queueWaitMs: Math.max(0, startedAt - request.dispatchedAtEpochMs),
        engineMs,
        sentAtEpochMs: epochNow(),
      },
    } satisfies GameSimulationWorkerResponse);
  } catch (error) {
    self.postMessage({
      id: request.id,
      kind: 'error',
      message: error instanceof Error ? error.message : 'The game simulation worker failed.',
    } satisfies GameSimulationWorkerResponse);
  }
};

self.postMessage({ kind: 'ready' } satisfies GameSimulationWorkerResponse);

export {};
