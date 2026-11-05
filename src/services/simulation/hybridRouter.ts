export type SimulationEnginePolicy = 'fast' | 'realistic' | 'hybrid';
export type RoutedSimulationEngine = 'fast' | 'realistic';

export type HybridRoutingInput = {
  policy: SimulationEnginePolicy;
  homeTeamId: number;
  awayTeamId: number;
  controlledTeamIds?: readonly number[];
  watched?: boolean;
  spotlight?: boolean;
  isPlayoff?: boolean;
  isEliminationGame?: boolean;
  isFinals?: boolean;
};

/** Deterministic routing only: the same saved policy/game metadata always chooses the same engine. */
export function resolveHybridEngine(input: HybridRoutingInput): RoutedSimulationEngine {
  if (input.policy === 'fast') return 'fast';
  if (input.policy === 'realistic') return 'realistic';
  const controlled = new Set(input.controlledTeamIds ?? []);
  if (input.watched || input.spotlight) return 'realistic';
  if (controlled.has(input.homeTeamId) || controlled.has(input.awayTeamId)) return 'realistic';
  if (input.isFinals || (input.isPlayoff && input.isEliminationGame)) return 'realistic';
  return 'fast';
}

