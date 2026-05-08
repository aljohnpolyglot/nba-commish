/**
 * saveScopedMapStore — Factory für `Map<number, T>`-Stores die per `state.saveId`
 * skopt in localStorage persistieren. Pattern stammt aus `gameplanStore.ts`;
 * wird hier extrahiert, weil 5 Stores (gameplan, defenseGameplan, defenderDetail,
 * rivalGameplan, matchupAssignments) dasselbe Boilerplate hatten.
 *
 * Per-Save-Bucket-Keys folgen dem Schema `<prefix>::<saveId>`. Wenn kein saveId
 * gesetzt ist, fällt der Store auf `<prefix>::__default` zurück (z.B. bevor das
 * GameContext einen Save geladen hat).
 *
 * Verwendung — siehe Konsumenten in diesem Verzeichnis.
 */

const DEFAULT_SAVE_ID = '__default';

export interface SaveScopedMapStore<T> {
  setActiveSaveId(saveId: string | undefined | null): void;
  get(teamId: number): T | undefined;
  getAll(): Map<number, T>;
  set(teamId: number, value: T): void;
  delete(teamId: number): boolean;
  /** Read-modify-write helper — lädt den existing value, übergibt ihn an `mutate`,
   *  speichert das Ergebnis. `mutate` darf den Wert in-place ändern oder einen
   *  neuen zurückgeben. Returns false wenn `mutate` undefined/null returnt. */
  update(teamId: number, mutate: (current: T | undefined) => T | undefined | null): boolean;
}

export function createSaveScopedMapStore<T>(prefix: string): SaveScopedMapStore<T> {
  let activeSaveId: string = DEFAULT_SAVE_ID;
  let cache: Map<number, T> = new Map();
  let hydratedFor: string | null = null;

  const storageKey = (saveId: string) => `${prefix}::${saveId}`;

  function hydrate() {
    if (hydratedFor === activeSaveId) return;
    cache = new Map();
    hydratedFor = activeSaveId;
    try {
      const raw = localStorage.getItem(storageKey(activeSaveId));
      if (!raw) return;
      const obj = JSON.parse(raw) as Record<string, T>;
      for (const [k, v] of Object.entries(obj)) cache.set(Number(k), v);
    } catch {
      // Corrupt storage — start fresh rather than crash.
    }
  }

  function persist() {
    try {
      const obj: Record<number, T> = {};
      for (const [k, v] of cache) obj[k] = v;
      localStorage.setItem(storageKey(activeSaveId), JSON.stringify(obj));
    } catch {
      // Quota / disabled storage — silent.
    }
  }

  return {
    setActiveSaveId(saveId) {
      const next = saveId && saveId.length > 0 ? saveId : DEFAULT_SAVE_ID;
      if (next === activeSaveId) return;
      activeSaveId = next;
      hydratedFor = null;
    },
    get(teamId) {
      hydrate();
      return cache.get(teamId);
    },
    getAll() {
      hydrate();
      return new Map(cache);
    },
    set(teamId, value) {
      hydrate();
      cache.set(teamId, value);
      persist();
    },
    delete(teamId) {
      hydrate();
      const had = cache.delete(teamId);
      if (had) persist();
      return had;
    },
    update(teamId, mutate) {
      hydrate();
      const next = mutate(cache.get(teamId));
      if (next == null) return false;
      cache.set(teamId, next);
      persist();
      return true;
    },
  };
}
