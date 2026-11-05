import type { EuroBasketballSourceDescriptor } from '../data/euroBasketballSources';
import type { EuroBasketballRoster } from './euroleagueRosterFetcher';

type RosterResponse =
  | { id: number; kind: 'result'; roster: EuroBasketballRoster }
  | { id: number; kind: 'error'; message: string };

interface PendingRoster {
  resolve: (roster: EuroBasketballRoster) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;
const pending = new Map<number, PendingRoster>();

const stopWorker = (message: string) => {
  for (const request of pending.values()) request.reject(new Error(message));
  pending.clear();
  worker?.terminate();
  worker = null;
  workerUnavailable = true;
};

const getWorker = (): Worker | null => {
  if (workerUnavailable || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/euroRoster.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerUnavailable = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<RosterResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.kind === 'result') request.resolve(response.roster);
    else request.reject(new Error(response.message));
  };
  worker.onerror = () => stopWorker('The roster worker stopped unexpectedly.');
  worker.onmessageerror = () => stopWorker('The roster worker returned unreadable data.');
  return worker;
};

export function prepareEuroRosterInWorker(
  source: EuroBasketballSourceDescriptor,
  season: number,
): Promise<EuroBasketballRoster> | null {
  const rosterWorker = getWorker();
  if (!rosterWorker) return null;
  const id = nextRequestId++;
  return new Promise<EuroBasketballRoster>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    rosterWorker.postMessage({ id, source, season });
  });
}
