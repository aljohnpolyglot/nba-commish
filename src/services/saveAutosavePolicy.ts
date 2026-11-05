interface SaveRevisionIdentity {
  isDataLoaded?: boolean;
  saveId?: string;
  saveRevision?: number;
}

export function resolveAutosaveRevisionCheckpoint(
  previousKey: string | null,
  state: SaveRevisionIdentity,
): { key: string | null; suppressAutosave: boolean } {
  if (!state.isDataLoaded || !state.saveId) return { key: null, suppressAutosave: false };
  const revision = Number.isSafeInteger(state.saveRevision) && Number(state.saveRevision) >= 0
    ? Number(state.saveRevision)
    : 0;
  const key = `${state.saveId}:${revision}`;
  return { key, suppressAutosave: previousKey !== key };
}
