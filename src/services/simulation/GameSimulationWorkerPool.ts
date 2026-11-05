import { recordSimulationPerf } from './simulationPerfDebug';
import { getInjuries } from '../injuryService';
import type { GameSimulationWorkerJob } from './gameSimulationWorkerProtocol';
import {
  epochNow,
  type GameSimulationWorkerBatchRequest,
  type GameSimulationWorkerResponse,
  type GameSimulationWorkerJobResult,
} from './gameSimulationWorkerProtocol';

interface WorkerLike {
  onmessage: ((event: MessageEvent<GameSimulationWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

interface PendingBatch {
  resolve: (response: Extract<GameSimulationWorkerResponse, { kind: 'result' }>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  dispatchCloneMs: number;
}

interface WorkerSlot {
  worker: WorkerLike;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  pending: Map<number, PendingBatch>;
}

export interface GameWorkerPoolMetrics {
  workerPoolStartupMs: number;
  workerDispatchCloneMs: number;
  workerQueueWaitMs: number;
  workerEngineMs: number;
  workerReturnCloneMs: number;
}

export interface GameWorkerPoolDayResult {
  results: GameSimulationWorkerJobResult[];
  metrics: GameWorkerPoolMetrics;
}

export interface GameSimulationWorkerPoolOptions {
  size: number;
  timeoutMs?: number;
  workerFactory?: () => WorkerLike;
}

const perfNow = (): number => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

const balancedContiguousBatches = <T>(values: T[], count: number): T[][] => {
  const batchCount = Math.max(1, Math.min(count, values.length));
  return Array.from({ length: batchCount }, (_, index) => {
    const start = Math.floor((index * values.length) / batchCount);
    const end = Math.floor(((index + 1) * values.length) / batchCount);
    return values.slice(start, end);
  });
};

export class GameSimulationWorkerPool {
  private readonly size: number;
  private readonly timeoutMs: number;
  private readonly workerFactory: () => WorkerLike;
  private slots: WorkerSlot[] = [];
  private startupPromise: Promise<void> | null = null;
  private startupMs = 0;
  private nextRequestId = 1;
  private stopped = false;

  constructor(options: GameSimulationWorkerPoolOptions) {
    this.size = Math.max(1, Math.floor(options.size));
    this.timeoutMs = Math.max(1_000, options.timeoutMs ?? 60_000);
    this.workerFactory = options.workerFactory ?? (() => new Worker(
      new URL('../../workers/gameSimulation.worker.ts', import.meta.url),
      { type: 'module' },
    ));
  }

  private createSlot(): WorkerSlot {
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const slot: WorkerSlot = {
      worker: this.workerFactory(),
      ready,
      resolveReady,
      rejectReady,
      pending: new Map(),
    };

    slot.worker.onmessage = (event: MessageEvent<GameSimulationWorkerResponse>) => {
      const response = event.data;
      if (response?.kind === 'ready') {
        slot.resolveReady();
        return;
      }
      if (!response || !('id' in response) || !Number.isInteger(response.id)) {
        this.failAll('The game simulation worker returned malformed data.');
        return;
      }
      if (response.kind !== 'result' && response.kind !== 'error') {
        this.failAll('The game simulation worker returned an unknown response.');
        return;
      }
      const pending = slot.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      slot.pending.delete(response.id);
      if (response.kind === 'result') pending.resolve(response);
      else pending.reject(new Error(response.message));
    };
    slot.worker.onerror = () => this.failAll('The game simulation worker stopped unexpectedly.');
    slot.worker.onmessageerror = () => this.failAll('The game simulation worker returned unreadable data.');
    return slot;
  }

  private async ensureStarted(): Promise<void> {
    if (this.stopped) throw new Error('The game simulation worker pool is stopped.');
    if (this.startupPromise) return this.startupPromise;
    const startedAt = perfNow();
    this.startupPromise = (async () => {
      try {
        for (let index = 0; index < this.size; index += 1) this.slots.push(this.createSlot());
        await Promise.all(this.slots.map(slot => new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('The game simulation worker did not start in time.')),
            Math.min(this.timeoutMs, 15_000),
          );
          slot.ready.then(
            () => { clearTimeout(timer); resolve(); },
            error => { clearTimeout(timer); reject(error); },
          );
        })));
        this.startupMs = Math.max(0, perfNow() - startedAt);
      } catch (error) {
        this.failAll(error instanceof Error ? error.message : 'The game simulation worker could not start.');
        throw error;
      }
    })();
    return this.startupPromise;
  }

  private failAll(message: string): void {
    const error = new Error(message);
    for (const slot of this.slots) {
      slot.rejectReady(error);
      for (const pending of slot.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      slot.pending.clear();
      slot.worker.terminate();
    }
    this.slots = [];
    this.stopped = true;
  }

  private dispatch(
    slot: WorkerSlot,
    jobs: GameSimulationWorkerJob[],
    clubDebuffs: Array<[string, 'heavy' | 'moderate' | 'mild']> | undefined,
  ): Promise<{ response: Extract<GameSimulationWorkerResponse, { kind: 'result' }>; dispatchCloneMs: number }> {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        slot.pending.delete(id);
        reject(new Error(`The game simulation worker timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);
      const pending: PendingBatch = {
        resolve: response => resolve({ response, dispatchCloneMs: pending.dispatchCloneMs }),
        reject,
        timer,
        dispatchCloneMs: 0,
      };
      slot.pending.set(id, pending);
      const request: GameSimulationWorkerBatchRequest = {
        id,
        kind: 'simulate-batch',
        jobs,
        clubDebuffs,
        injuryDefinitions: getInjuries(),
        dispatchedAtEpochMs: epochNow(),
      };
      const dispatchStart = perfNow();
      try {
        slot.worker.postMessage(request);
        pending.dispatchCloneMs = Math.max(0, perfNow() - dispatchStart);
      } catch (error) {
        clearTimeout(timer);
        slot.pending.delete(id);
        reject(error instanceof Error ? error : new Error('The game simulation worker rejected its job.'));
      }
    });
  }

  async runDay(
    jobs: GameSimulationWorkerJob[],
    clubDebuffs?: Map<string, 'heavy' | 'moderate' | 'mild'>,
  ): Promise<GameWorkerPoolDayResult> {
    if (jobs.length === 0) {
      return {
        results: [],
        metrics: {
          workerPoolStartupMs: 0,
          workerDispatchCloneMs: 0,
          workerQueueWaitMs: 0,
          workerEngineMs: 0,
          workerReturnCloneMs: 0,
        },
      };
    }
    await this.ensureStarted();
    const batches = balancedContiguousBatches(jobs, this.slots.length);
    const debuffEntries = clubDebuffs?.size ? [...clubDebuffs.entries()] : undefined;
    try {
      const responses = await Promise.all(batches.map((batch, index) => (
        this.dispatch(this.slots[index], batch, debuffEntries)
      )));
      const receivedAt = epochNow();
      const results = responses.flatMap(({ response }) => response.results);
      const metrics: GameWorkerPoolMetrics = {
        workerPoolStartupMs: this.startupMs,
        workerDispatchCloneMs: responses.reduce((sum, row) => sum + row.dispatchCloneMs, 0),
        workerQueueWaitMs: Math.max(0, ...responses.map(row => row.response.metrics.queueWaitMs)),
        workerEngineMs: Math.max(0, ...responses.map(row => row.response.metrics.engineMs)),
        workerReturnCloneMs: Math.max(0, ...responses.map(row => receivedAt - row.response.metrics.sentAtEpochMs)),
      };
      this.startupMs = 0;
      recordSimulationPerf({ engine: 'game-worker-pool', games: jobs.length, workers: batches.length, ...metrics });
      return { results, metrics };
    } catch (error) {
      this.failAll(error instanceof Error ? error.message : 'The game simulation worker pool failed.');
      throw error;
    }
  }

  dispose(message: string = 'The game simulation worker pool was disposed.'): void {
    if (this.stopped) return;
    this.failAll(message);
  }
}

let activePool: GameSimulationWorkerPool | null = null;
let activePoolSize = 0;
let unavailableForSession = false;

export const getConservativeGameWorkerCount = (requested?: number): number => {
  if (Number.isFinite(requested)) return Math.max(1, Math.min(6, Math.floor(Number(requested))));
  const logicalThreads = typeof navigator !== 'undefined'
    ? Number(navigator.hardwareConcurrency ?? 2)
    : 2;
  return Math.max(1, Math.min(4, Math.max(1, logicalThreads - 2)));
};

export const beginGameSimulationWorkerSession = (): void => {
  activePool?.dispose('A new game simulation worker session started.');
  activePool = null;
  activePoolSize = 0;
  unavailableForSession = false;
};

export const endGameSimulationWorkerSession = (): void => {
  activePool?.dispose('The game simulation worker session ended.');
  activePool = null;
  activePoolSize = 0;
  unavailableForSession = false;
};

export async function runGameSimulationJobsInWorkerPool(
  jobs: GameSimulationWorkerJob[],
  clubDebuffs: Map<string, 'heavy' | 'moderate' | 'mild'> | undefined,
  requestedSize?: number,
): Promise<GameWorkerPoolDayResult | null> {
  if (unavailableForSession || typeof Worker === 'undefined') return null;
  const size = getConservativeGameWorkerCount(requestedSize);
  if (!activePool || activePoolSize !== size) {
    activePool?.dispose('The game simulation worker pool size changed.');
    activePool = new GameSimulationWorkerPool({ size });
    activePoolSize = size;
  }
  try {
    return await activePool.runDay(jobs, clubDebuffs);
  } catch {
    activePool = null;
    activePoolSize = 0;
    unavailableForSession = true;
    throw new Error('The game simulation worker pool failed; the full day must be rerun serially.');
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => endGameSimulationWorkerSession());
}
