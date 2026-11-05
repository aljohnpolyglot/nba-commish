import type { GameState, LazySimProgress } from '../../types';
import { recordSimulationPerf } from './simulationPerfDebug';

export type LongSimCheckpoint = {
  runId: string;
  saveKey: string;
  targetDate: string;
  state: GameState;
  progress: LazySimProgress;
  updatedAt: number;
};

type ActiveRun = Omit<LongSimCheckpoint, 'state' | 'progress' | 'updatedAt'> & {
  checkpoint?: LongSimCheckpoint;
};

type LeaseResult<T> =
  | { acquired: true; value: T }
  | { acquired: false; owner: 'local' | 'another-tab' };

type LeaseControl = {
  runId: string;
  checkpoint: (state: GameState, progress: LazySimProgress) => void;
};

let activeRun: ActiveRun | undefined;
let visibleProgress: LazySimProgress | undefined;
const visibleProgressListeners = new Set<() => void>();

export const publishLongSimProgress = (progress: LazySimProgress | undefined): void => {
  visibleProgress = progress;
  for (const listener of visibleProgressListeners) listener();
};

export const subscribeLongSimProgress = (listener: () => void): (() => void) => {
  visibleProgressListeners.add(listener);
  return () => visibleProgressListeners.delete(listener);
};

export const getVisibleLongSimProgress = (): LazySimProgress | undefined => visibleProgress;

const lockManager = (): LockManager | undefined =>
  typeof navigator !== 'undefined' && 'locks' in navigator
    ? navigator.locks
    : undefined;

const executeLease = async <T>(
  saveKey: string,
  targetDate: string,
  task: (control: LeaseControl) => Promise<T>,
): Promise<T> => {
  const runId = crypto.randomUUID();
  activeRun = { runId, saveKey, targetDate };
  try {
    return await task({
      runId,
      checkpoint: (state, progress) => {
        if (activeRun?.runId !== runId) return;
        activeRun.checkpoint = {
          runId,
          saveKey,
          targetDate,
          state,
          progress,
          updatedAt: Date.now(),
        };
      },
    });
  } finally {
    if (activeRun?.runId === runId) activeRun = undefined;
  }
};

export async function withLongSimLease<T>(
  saveKey: string,
  targetDate: string,
  task: (control: LeaseControl) => Promise<T>,
): Promise<LeaseResult<T>> {
  if (activeRun) return { acquired: false, owner: 'local' };
  const locks = lockManager();
  if (!locks) {
    return { acquired: true, value: await executeLease(saveKey, targetDate, task) };
  }

  let acquired = false;
  let value: T | undefined;
  await locks.request(
    `basketcommish-sim:${saveKey}`,
    { mode: 'exclusive', ifAvailable: true },
    async lock => {
      if (!lock) return;
      acquired = true;
      value = await executeLease(saveKey, targetDate, task);
    },
  );
  return acquired
    ? { acquired: true, value: value as T }
    : { acquired: false, owner: 'another-tab' };
}

export const getLongSimCheckpoint = (): LongSimCheckpoint | undefined => activeRun?.checkpoint;

export const hasActiveLongSim = (): boolean => !!activeRun;

let yieldPort: MessagePort | undefined;
const yieldQueue: Array<() => void> = [];

const perfNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export const DEFAULT_LONG_SIM_YIELD_BUDGET_MS = 100;

export type LongSimYieldBudget = {
  budgetMs: number;
  lastYieldAt: number;
  yieldCount: number;
  skippedCount: number;
  waitMs: number;
};

export const createLongSimYieldBudget = (
  budgetMs = DEFAULT_LONG_SIM_YIELD_BUDGET_MS,
): LongSimYieldBudget => ({
  budgetMs: Math.max(1, Number.isFinite(budgetMs) ? budgetMs : DEFAULT_LONG_SIM_YIELD_BUDGET_MS),
  lastYieldAt: perfNow(),
  yieldCount: 0,
  skippedCount: 0,
  waitMs: 0,
});

export const yieldLongSimControl = (): Promise<void> => {
  const browserScheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  if (browserScheduler?.yield) return browserScheduler.yield();
  if (typeof window === 'undefined' || typeof MessageChannel === 'undefined') {
    return new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!yieldPort) {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => yieldQueue.shift()?.();
    (channel.port1 as MessagePort & { unref?: () => void }).unref?.();
    (channel.port2 as MessagePort & { unref?: () => void }).unref?.();
    yieldPort = channel.port2;
  }
  return new Promise(resolve => {
    yieldQueue.push(resolve);
    yieldPort!.postMessage(null);
  });
};

export const yieldLongSimIfDue = async (
  budget: LongSimYieldBudget,
  options?: { force?: boolean; reason?: string },
): Promise<boolean> => {
  const elapsedMs = perfNow() - budget.lastYieldAt;
  if (!options?.force && elapsedMs < budget.budgetMs) {
    budget.skippedCount += 1;
    return false;
  }
  const waitStart = perfNow();
  await yieldLongSimControl();
  const waitMs = perfNow() - waitStart;
  budget.lastYieldAt = perfNow();
  budget.yieldCount += 1;
  budget.waitMs += waitMs;
  recordSimulationPerf({
    engine: 'long-sim-yield',
    reason: options?.reason,
    forced: options?.force === true,
    budgetMs: budget.budgetMs,
    elapsedMs,
    waitMs,
  });
  return true;
};
