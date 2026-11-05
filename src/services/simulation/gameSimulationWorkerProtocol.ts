import type { InjuryDefinition } from '../../types';
import type { GameResult } from './StatGenerator';
import type { PreparedDayGame } from './GameSimulator';
import type { SimulationRealmContext } from './simulationRealmContext';
import type { Defense2K } from '../Defense2KService';
import type { HighlightSimulationProfiles } from './HighlightGenerator';

export type ClubDebuffEntry = [string, 'heavy' | 'moderate' | 'mild'];

export interface GameSimulationWorkerJob extends PreparedDayGame {
  /** The adapter input has already been narrowed to the two game rosters. */
  args: PreparedDayGame['args'];
  realmContext: SimulationRealmContext;
  defenseProfiles: Record<string, Defense2K | null>;
  highlightProfiles: HighlightSimulationProfiles;
}

export interface GameSimulationWorkerBatchRequest {
  id: number;
  kind: 'simulate-batch';
  jobs: GameSimulationWorkerJob[];
  clubDebuffs?: ClubDebuffEntry[];
  injuryDefinitions: InjuryDefinition[];
  dispatchedAtEpochMs: number;
}

export interface GameSimulationWorkerJobResult {
  order: number;
  gid: number;
  result: GameResult;
}

export interface GameSimulationWorkerBatchMetrics {
  queueWaitMs: number;
  engineMs: number;
  sentAtEpochMs: number;
}

export type GameSimulationWorkerResponse =
  | { kind: 'ready' }
  | {
      id: number;
      kind: 'result';
      results: GameSimulationWorkerJobResult[];
      metrics: GameSimulationWorkerBatchMetrics;
    }
  | { id: number; kind: 'error'; message: string };

export const epochNow = (): number => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.timeOrigin + performance.now()
    : Date.now()
);
