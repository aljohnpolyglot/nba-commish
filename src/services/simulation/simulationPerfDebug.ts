export type SimulationPerfRow = Record<string, string | number | boolean | undefined>;

export type SimulationExecutionLedger = {
  routeSelectedFast: number;
  routeSelectedRealistic: number;
  fastEngineStarted: number;
  fastEngineCompleted: number;
  fastEngineAccepted: number;
  realisticEngineStarted: number;
  realisticEngineCompleted: number;
  realisticEngineAccepted: number;
  fastValidationFailure: number;
  realisticValidationFailure: number;
  fastFallbackToRealistic: number;
  realisticFallbackToFast: number;
  retryCount: number;
  doubleEngineInvocationCount: number;
};

export type SimulationExecutionLedgerKey = keyof SimulationExecutionLedger;

type SimulationPerfStore = {
  enabled: boolean;
  rows: SimulationPerfRow[];
  maxRows: number;
  ledger?: Partial<SimulationExecutionLedger>;
  counters?: Record<string, number>;
  capturePreparedGame?: (prepared: unknown) => void;
  captureTradeGenerator?: (capture: {
    phase: 'input' | 'output';
    state?: unknown;
    scope: 'auto' | 'pba' | 'nba';
    proposals?: unknown;
    reason?: string;
  }) => void;
};

const getStore = (): SimulationPerfStore | undefined =>
  (globalThis as typeof globalThis & { __gameSimPerf?: SimulationPerfStore }).__gameSimPerf;

export const recordSimulationPerf = (row: SimulationPerfRow): void => {
  const store = getStore();
  if (!store?.enabled) return;
  store.rows.push(row);
  if (store.rows.length > store.maxRows) store.rows.splice(0, store.rows.length - store.maxRows);
};

export const isSimulationPerfEnabled = (): boolean => getStore()?.enabled === true;

export const incrementSimulationExecutionLedger = (
  key: SimulationExecutionLedgerKey,
  amount: number = 1,
): void => {
  const store = getStore();
  if (!store?.enabled) return;
  store.ledger ??= {};
  store.ledger[key] = Number(store.ledger[key] ?? 0) + amount;
};

export const incrementSimulationPerfCounter = (key: string, amount: number = 1): void => {
  const store = getStore();
  if (!store?.enabled) return;
  store.counters ??= {};
  store.counters[key] = Number(store.counters[key] ?? 0) + amount;
};

/** Benchmark-only capture hook. Production stores never install the callback. */
export const capturePreparedSimulationGame = (prepared: unknown): void => {
  const store = getStore();
  if (!store?.enabled || !store.capturePreparedGame) return;
  store.capturePreparedGame(prepared);
};

/** Benchmark-only trade-generator hook. The state is never cloned unless a harness installs a callback. */
export const captureTradeGenerator = (capture: {
  phase: 'input' | 'output';
  state?: unknown;
  scope: 'auto' | 'pba' | 'nba';
  proposals?: unknown;
  reason?: string;
}): void => {
  const store = getStore();
  if (!store?.enabled || !store.captureTradeGenerator) return;
  store.captureTradeGenerator(capture);
};
