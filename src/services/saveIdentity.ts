import type { GameState } from '../types';

export interface SaveBranchPoint {
  date?: string;
  season?: number;
  sourceRevision?: string;
}

export interface SaveIdentityFields {
  saveId: string;
  simulationSeed: string;
  saveRevision: number;
  parentSaveId?: string;
  branchPoint?: SaveBranchPoint;
}

const randomToken = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const createSaveId = (): string => `nba_commish_save_${randomToken()}`;

export const createSimulationSeed = (): string => `universe_${randomToken()}`;

export function createNewSaveIdentity(simulationSeed = createSimulationSeed()): SaveIdentityFields {
  return {
    saveId: createSaveId(),
    simulationSeed,
    saveRevision: 0,
  };
}

export function ensureSaveIdentity(
  state: Partial<GameState>,
  storageId?: string,
): SaveIdentityFields {
  const embeddedId = typeof state.saveId === 'string' && state.saveId.trim() ? state.saveId : undefined;
  const saveId = embeddedId ?? storageId ?? createSaveId();
  const simulationSeed = typeof state.simulationSeed === 'string' && state.simulationSeed.trim()
    ? state.simulationSeed
    : saveId;
  return {
    saveId,
    simulationSeed,
    saveRevision: Number.isSafeInteger(state.saveRevision) && Number(state.saveRevision) >= 0
      ? Number(state.saveRevision)
      : 0,
    ...(state.parentSaveId !== undefined ? { parentSaveId: state.parentSaveId } : {}),
    ...(state.branchPoint !== undefined ? { branchPoint: state.branchPoint } : {}),
  };
}

export function createIndependentSaveCopy<T extends GameState>(
  state: T,
  branchPoint?: SaveBranchPoint,
): T {
  const source = ensureSaveIdentity(state);
  const resolvedBranchPoint = branchPoint ?? state.branchPoint;
  return {
    ...state,
    saveId: createSaveId(),
    simulationSeed: source.simulationSeed,
    saveRevision: 0,
    parentSaveId: source.saveId,
    ...(resolvedBranchPoint !== undefined ? { branchPoint: resolvedBranchPoint } : {}),
  };
}

export const getSimulationSeed = (
  state: Pick<GameState, 'saveId' | 'simulationSeed'>,
): string => state.simulationSeed || state.saveId || 'unsaved-universe';
