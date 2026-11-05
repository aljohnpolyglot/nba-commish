import type { SimulationEnginePolicy } from './hybridRouter';

export type DayProcessingProfile = 'interactive' | 'bulk';
export type MediaProcessingProfile = 'eager' | 'on-demand';
export type PersistenceProfile = 'immediate' | 'event-boundaries';

export interface SimulationExecutionProfile {
  gameRouting: SimulationEnginePolicy;
  dayProcessing: DayProcessingProfile;
  mediaProcessing: MediaProcessingProfile;
  persistence: PersistenceProfile;
}

export const resolveLongSimulationExecutionProfile = (
  gameRouting: SimulationEnginePolicy,
  override?: Partial<SimulationExecutionProfile>,
): SimulationExecutionProfile => ({
  gameRouting,
  dayProcessing: 'bulk',
  mediaProcessing: 'on-demand',
  persistence: 'event-boundaries',
  ...override,
});
