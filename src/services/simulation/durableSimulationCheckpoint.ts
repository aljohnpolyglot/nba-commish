import type { GameState } from '../../types';
import { SaveManager, type SaveGameResult } from '../SaveManager';
import { buildPersistableGameState } from '../saveExport';

export const DURABLE_SIMULATION_SAVE_FAILURE = 'Simulation completed, but saving failed. Retry Save.';

export function getAutomaticSaveName(state: Pick<GameState, 'gameMode' | 'commissionerName'>): string {
  const modePrefix = state.gameMode === 'gm' ? 'GM' : 'Commissioner';
  return `${modePrefix}: ${state.commissionerName}'s Legacy`;
}

export type SimulationCheckpointWriter = (
  state: GameState,
  saveName: string,
) => Promise<SaveGameResult>;

export async function persistCommittedSimulationState(
  committedState: GameState,
  writer: SimulationCheckpointWriter = (state, saveName) => SaveManager.saveGameDetailed(state, saveName),
): Promise<{ state: GameState; save: SaveGameResult }> {
  const persistable = buildPersistableGameState(committedState);
  const save = await writer(persistable, getAutomaticSaveName(committedState));
  return {
    save,
    state: {
      ...committedState,
      saveId: save.id,
      saveRevision: save.saveRevision,
      durableSavePending: false,
      lastDurableSaveError: undefined,
    },
  };
}

export async function finalizeCommittedSimulationState(
  committedState: GameState,
  writer?: SimulationCheckpointWriter,
): Promise<{ state: GameState; save?: SaveGameResult; error?: unknown }> {
  try {
    const durable = await persistCommittedSimulationState(committedState, writer);
    return {
      save: durable.save,
      state: {
        ...durable.state,
        isProcessing: false,
        processingAction: undefined,
      },
    };
  } catch (error) {
    return {
      error,
      state: {
        ...committedState,
        isProcessing: false,
        processingAction: undefined,
        durableSavePending: true,
        lastDurableSaveError: DURABLE_SIMULATION_SAVE_FAILURE,
        lastOutcome: DURABLE_SIMULATION_SAVE_FAILURE,
      },
    };
  }
}
