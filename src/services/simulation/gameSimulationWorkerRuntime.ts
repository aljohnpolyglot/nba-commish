import { GameSimulator } from './GameSimulator';
import './realistic';
import { withSimulationInjuryDefinitions } from '../injuryService';
import { withSimulationRealmContext } from './simulationRealmContext';
import type { InjuryDefinition } from '../../types';
import { Defense2KService } from '../Defense2KService';
import { HighlightGenerator } from './HighlightGenerator';
import type {
  ClubDebuffEntry,
  GameSimulationWorkerJob,
  GameSimulationWorkerJobResult,
} from './gameSimulationWorkerProtocol';

export function runGameSimulationWorkerBatch(
  jobs: GameSimulationWorkerJob[],
  clubDebuffEntries?: ClubDebuffEntry[],
  injuryDefinitions: InjuryDefinition[] = [],
): GameSimulationWorkerJobResult[] {
  const clubDebuffs = clubDebuffEntries?.length
    ? new Map<string, 'heavy' | 'moderate' | 'mild'>(clubDebuffEntries)
    : undefined;

  return withSimulationInjuryDefinitions(injuryDefinitions, () => jobs.map(job => (
    withSimulationRealmContext(job.realmContext, () => (
      Defense2KService.withSimulationProfiles(job.defenseProfiles, () => HighlightGenerator.withSimulationProfiles(job.highlightProfiles, () => {
        const result = GameSimulator.simulatePreparedGame(job, clubDebuffs, true);
        return {
          order: job.order,
          gid: job.gid,
          result,
        };
      }))
    ))
  )));
}
