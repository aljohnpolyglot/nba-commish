import { get, set, setMany, del, createStore } from 'idb-keyval';
import { GameLoadProgress, GameState } from '../types';
import { isBBGMLeagueFile, parseBBGMLeagueFile } from './bbgmParser';
import {
  buildLeagueExport,
  buildPersistableGameState,
  DEFAULT_LEAGUE_EXPORT_OPTIONS,
  type LeagueExportOptions,
} from './saveExport';
import { decodeLeagueBuffer } from './saveCodec';
import { resolveAnyTeam } from '../utils/teamLookup';
import { getLeagueCalendarDates } from './leagueCalendar';
import { toISODateString } from '../utils/dateUtils';
import { createIndependentSaveCopy, ensureSaveIdentity } from './saveIdentity';

export interface SaveMetadata {
  id: string;
  name: string;
  dateSaved: number;
  gameDate: string;
  commissionerName: string;
  day: number;
  leagueName?: string;
  leagueType?: GameState['leagueType'];
  gameMode?: GameState['gameMode'];
  seasonYear?: number;
  sizeBytes?: number;
  userTeamId?: number;
  userTeamLogoUrl?: string;
  saveRevision?: number;
}

export interface ImportedLeague {
  metadata: SaveMetadata;
  state: GameState;
}

export interface SaveGameResult {
  id: string;
  saveRevision: number;
  metadata: SaveMetadata;
  stateFingerprint?: string;
  stringifyMs: number;
  gzipMs: number;
  storageMs: number;
  totalMs: number;
  skippedEquivalent: boolean;
}

export interface SaveRevisionSnapshot {
  state: GameState;
  metadata: SaveMetadata;
}

export type SavePairWriter = (entries: Array<[IDBValidKey, unknown]>) => Promise<void>;

export type SaveConflictPolicy = 'guard' | 'replace';

export const isRecoverableStorageError = (error: any): boolean =>
  error?.name === 'QuotaExceededError' || error?.name === 'UnknownError' || error?.code === 22;

export class SaveConflictError extends Error {
  readonly saveId: string;
  readonly expectedRevision: number;
  readonly persistedRevision: number;

  constructor(saveId: string, expectedRevision: number, persistedRevision: number) {
    super('This save was updated in another tab. Reload it before saving again.');
    this.name = 'SaveConflictError';
    this.saveId = saveId;
    this.expectedRevision = expectedRevision;
    this.persistedRevision = persistedRevision;
  }
}

export function resolveNextSaveRevision(params: {
  saveId: string;
  stateRevision?: number;
  observedRevision?: number;
  persistedRevision?: number;
  hasPersistedSave: boolean;
  conflictPolicy?: SaveConflictPolicy;
}): number {
  const stateRevision = Number.isSafeInteger(params.stateRevision) && Number(params.stateRevision) >= 0
    ? Number(params.stateRevision)
    : 0;
  const persistedRevision = Number.isSafeInteger(params.persistedRevision) && Number(params.persistedRevision) >= 0
    ? Number(params.persistedRevision)
    : 0;
  const expectedRevision = Number.isSafeInteger(params.observedRevision) && Number(params.observedRevision) >= 0
    ? Number(params.observedRevision)
    : stateRevision;
  if (
    params.hasPersistedSave
    && (params.conflictPolicy ?? 'guard') === 'guard'
    && expectedRevision !== persistedRevision
  ) {
    throw new SaveConflictError(params.saveId, expectedRevision, persistedRevision);
  }
  return persistedRevision + 1;
}

const SAVES_PREFIX = 'nba_commish_save_';
const METADATA_KEY = 'nba_commish_metadata';
const FOLDER_HANDLE_KEY = 'nba_commish_folder_handle';
const LOAD_STEPS_TOTAL = 12;
const now = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();
const elapsed = (startedAt: number): number => Math.round((now() - startedAt) * 10) / 10;
let saveWriteTail: Promise<void> = Promise.resolve();
const observedSaveRevisions = new Map<string, number>();
let saveStore = createStore('keyval-store', 'keyval');
// idb-keyval retains rejected open promises. Discard only the connection cache,
// never saved data; surface this failure and let the next access reopen normally.
const recoverableSaveStore: typeof saveStore = (mode, callback) => {
  const attemptedStore = saveStore;
  return attemptedStore(mode, callback).catch(error => {
    if (saveStore === attemptedStore && (error?.name === 'UnknownError' || error?.name === 'InvalidStateError')) {
      saveStore = createStore('keyval-store', 'keyval');
    }
    throw error;
  });
};

export async function persistSaveRevisionAtomically(
  saveId: string,
  payload: unknown,
  metadata: SaveMetadata[],
  writer: SavePairWriter = entries => setMany(entries, recoverableSaveStore),
): Promise<void> {
  await writer([
    [saveId, payload],
    [METADATA_KEY, metadata],
  ]);
}

export interface ExternalSaveNotice {
  saveId: string;
  kind: 'updated' | 'deleted';
  saveRevision?: number;
}

const externalSaveNoticeListeners = new Set<(notice: ExternalSaveNotice) => void>();
let revisionChannel: BroadcastChannel | null = null;

const getRevisionChannel = (): BroadcastChannel | null => {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (revisionChannel) return revisionChannel;
  revisionChannel = new BroadcastChannel('basketcommish-save-revisions');
  revisionChannel.onmessage = event => {
    const notice = event.data as Partial<ExternalSaveNotice> | null;
    if (!notice || typeof notice.saveId !== 'string') return;
    if (notice.kind !== 'updated' && notice.kind !== 'deleted') return;
    externalSaveNoticeListeners.forEach(listener => listener(notice as ExternalSaveNotice));
  };
  return revisionChannel;
};

export const subscribeToExternalSaveNotices = (
  listener: (notice: ExternalSaveNotice) => void,
): (() => void) => {
  externalSaveNoticeListeners.add(listener);
  getRevisionChannel();
  return () => { externalSaveNoticeListeners.delete(listener); };
};

export const isExternalSaveRevisionNewer = (
  currentRevision: number | undefined,
  notice: ExternalSaveNotice,
): boolean => notice.kind === 'deleted'
  || Number(notice.saveRevision ?? -1) > Number(currentRevision ?? 0);

export const reconcileExternalSaveNoticeAfterReload = (
  current: ExternalSaveNotice | null,
  saveId: string,
  loadedRevision: number | undefined,
): ExternalSaveNotice | null => {
  if (!current || current.saveId !== saveId || current.kind === 'deleted') return current;
  return Number(current.saveRevision ?? 0) <= Number(loadedRevision ?? 0) ? null : current;
};

const announceSaveRevision = (saveId: string, saveRevision: number): void => {
  observedSaveRevisions.set(saveId, saveRevision);
  getRevisionChannel()?.postMessage({ saveId, saveRevision, kind: 'updated' } satisfies ExternalSaveNotice);
};

const withSaveWriteLock = async <T>(task: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined;
  if (locks) return locks.request('basketcommish-save-writer', { mode: 'exclusive' }, task);
  const previous = saveWriteTail;
  let release = () => {};
  saveWriteTail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
};

export const hasFSAccess = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// ── Gzip helpers ──────────────────────────────────────────────────────────────

async function gzipString(str: string): Promise<ArrayBuffer> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(str));
  writer.close();
  return new Response(cs.readable).arrayBuffer();
}

/** Detect whether a value from IndexedDB is a compressed save ({__gz, data}) */
function isCompressed(v: any): v is { __gz: true; data: ArrayBuffer } {
  return v && v.__gz === true && v.data instanceof ArrayBuffer;
}

const lastSavedObject = new WeakMap<object, { saveId: string; saveRevision: number }>();
const lastContentFingerprint = new Map<string, string>();

function contentFingerprint(json: string): string {
  const normalized = json.replace(/"saveRevision":\d+/g, '"saveRevision":0');
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${normalized.length}:${(hash >>> 0).toString(16)}`;
}

// ── SaveManager ───────────────────────────────────────────────────────────────

export class SaveManager {
  static async getMetadata(): Promise<SaveMetadata[]> {
    return (await get<SaveMetadata[]>(METADATA_KEY, recoverableSaveStore)) ?? [];
  }

  static async saveGame(
    state: GameState,
    saveName: string,
    conflictPolicy: SaveConflictPolicy = 'guard',
  ): Promise<string> {
    return (await this.saveGameDetailed(state, saveName, conflictPolicy)).id;
  }

  static async saveGameDetailed(
    state: GameState,
    saveName: string,
    conflictPolicy: SaveConflictPolicy = 'guard',
  ): Promise<SaveGameResult> {
    return withSaveWriteLock(async () => {
    const totalStartedAt = now();
    const identity = ensureSaveIdentity(state);
    const id = identity.saveId;
    const metadata = await this.getMetadata();
    const existingMetadata = metadata.find(entry => entry.id === id);
    const objectCheckpoint = lastSavedObject.get(state);
    if (
      objectCheckpoint?.saveId === id
      && objectCheckpoint.saveRevision === Number(state.saveRevision ?? 0)
      && Number(existingMetadata?.saveRevision ?? 0) === objectCheckpoint.saveRevision
    ) {
      console.info('[SAVE_PERF]', { saveId: id, skippedEquivalent: true, guard: 'object-checkpoint' });
      return {
        id,
        saveRevision: objectCheckpoint.saveRevision,
        metadata: existingMetadata!,
        stringifyMs: 0,
        gzipMs: 0,
        storageMs: 0,
        totalMs: elapsed(totalStartedAt),
        skippedEquivalent: true,
      };
    }
    const saveRevision = resolveNextSaveRevision({
      saveId: id,
      stateRevision: identity.saveRevision,
      observedRevision: observedSaveRevisions.get(id),
      persistedRevision: existingMetadata?.saveRevision,
      hasPersistedSave: existingMetadata != null,
      conflictPolicy,
    });
    const stateToSave = { ...buildPersistableGameState(state), ...identity, saveRevision };
    const stringifyStartedAt = now();
    const json = JSON.stringify(stateToSave); // no whitespace
    const stringifyMs = elapsed(stringifyStartedAt);
    const stateFingerprint = contentFingerprint(json);
    if (
      existingMetadata
      && lastContentFingerprint.get(id) === stateFingerprint
      && Number(existingMetadata.saveRevision ?? 0) === Number(state.saveRevision ?? 0)
    ) {
      lastSavedObject.set(state, { saveId: id, saveRevision: Number(state.saveRevision ?? 0) });
      console.info('[SAVE_PERF]', {
        saveId: id,
        stateFingerprint,
        stringifyMs,
        gzipMs: 0,
        skippedEquivalent: true,
        guard: 'content-fingerprint',
      });
      return {
        id,
        saveRevision: Number(existingMetadata.saveRevision ?? state.saveRevision ?? 0),
        metadata: existingMetadata,
        stateFingerprint,
        stringifyMs,
        gzipMs: 0,
        storageMs: 0,
        totalMs: elapsed(totalStartedAt),
        skippedEquivalent: true,
      };
    }
    const gzipStartedAt = now();
    const compressed = await gzipString(json);
    const gzipMs = elapsed(gzipStartedAt);
    const payload = { __gz: true, data: compressed };
    const userTeam = state.gameMode === 'gm' && state.userTeamId != null
      ? resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? []) ?? undefined
      : undefined;
    const userTeamRecord = userTeam as unknown as Record<string, unknown> | undefined;
    const userTeamLogoUrl = [
      userTeamRecord?.logoUrl,
      userTeamRecord?.imgURLSmall,
      userTeamRecord?.imgURL,
      (userTeamRecord?.logos as Record<string, unknown> | undefined)?.primary,
    ].find(value => typeof value === 'string' && value.trim()) as string | undefined;
    const newMeta: SaveMetadata = {
      id,
      name: saveName,
      dateSaved: Date.now(),
      gameDate: state.date,
      commissionerName: state.commissionerName,
      day: state.day,
      leagueName: state.leagueStats?.leagueName,
      leagueType: state.leagueType,
      gameMode: state.gameMode,
      seasonYear: state.leagueStats?.year,
      sizeBytes: compressed.byteLength,
      userTeamId: state.gameMode === 'gm' ? state.userTeamId : undefined,
      userTeamLogoUrl,
      saveRevision,
    };
    const existingIndex = metadata.findIndex(m => m.id === id);
    if (existingIndex >= 0) metadata[existingIndex] = newMeta;
    else metadata.push(newMeta);

    const storageStartedAt = now();
    try {
      await persistSaveRevisionAtomically(id, payload, metadata);
    } catch (e: any) {
      if (isRecoverableStorageError(e)) {
        await SaveManager._clearTransientCaches();
        await persistSaveRevisionAtomically(id, payload, metadata);
      } else {
        throw e;
      }
    }
    state.saveRevision = saveRevision;
    lastContentFingerprint.set(id, stateFingerprint);
    lastSavedObject.set(state, { saveId: id, saveRevision });
    announceSaveRevision(id, saveRevision);
    const storageMs = elapsed(storageStartedAt);

    // Mirror to chosen folder (silent best-effort, also compressed)
    try {
      const folderHandle = await this.getSaveFolder();
      if (folderHandle) await this.writeToFolder(folderHandle, compressed, saveName);
    } catch { /* non-fatal */ }

    const totalMs = elapsed(totalStartedAt);
    console.info('[SAVE_PERF]', {
      saveId: id,
      jsonBytes: json.length,
      compressedBytes: compressed.byteLength,
      stringifyMs,
      gzipMs,
      storageMs,
      totalMs,
      stateFingerprint,
      skippedEquivalent: false,
    });
    return {
      id,
      saveRevision,
      metadata: newMeta,
      stateFingerprint,
      stringifyMs,
      gzipMs,
      storageMs,
      totalMs,
      skippedEquivalent: false,
    };
    });
  }

  static async loadGame(
    id: string,
    onProgress?: (progress: GameLoadProgress) => void,
  ): Promise<GameState | undefined> {
    const totalStartedAt = now();
    onProgress?.({
      currentPhase: 'Opening your league...',
      percentComplete: 4,
      stepsComplete: 1,
      stepsTotal: LOAD_STEPS_TOTAL,
    });
    const storageStartedAt = now();
    const raw = await get<any>(id, recoverableSaveStore);
    const storageMs = elapsed(storageStartedAt);
    if (!raw) return undefined;

    let parsed: any;
    let decodeMs = 0;
    if (isCompressed(raw)) {
      onProgress?.({
        currentPhase: 'Unpacking the saved season...',
        percentComplete: 11,
        stepsComplete: 2,
        stepsTotal: LOAD_STEPS_TOTAL,
      });
      const decodeStartedAt = now();
      parsed = await decodeLeagueBuffer(raw.data, true, () => {
        onProgress?.({
          currentPhase: 'Checking the saved league...',
          percentComplete: 18,
          stepsComplete: 3,
          stepsTotal: LOAD_STEPS_TOTAL,
        });
      });
      decodeMs = elapsed(decodeStartedAt);
    } else {
      onProgress?.({
        currentPhase: 'Checking the saved league...',
        percentComplete: 18,
        stepsComplete: 3,
        stepsTotal: LOAD_STEPS_TOTAL,
      });
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      parsed = raw;
    }

    const migrateStartedAt = now();
    const migrated = SaveManager.migrateSave(parsed, id);
    observedSaveRevisions.set(id, migrated.saveRevision ?? 0);
    console.info('[LOAD_PERF]', {
      saveId: id,
      storageMs,
      decodeMs,
      migrateMs: elapsed(migrateStartedAt),
      totalMs: elapsed(totalStartedAt),
    });
    return migrated;
  }

  static async loadGameWithMetadata(
    id: string,
    onProgress?: (progress: GameLoadProgress) => void,
  ): Promise<SaveRevisionSnapshot | undefined> {
    return withSaveWriteLock(async () => {
      const state = await this.loadGame(id, onProgress);
      if (!state) return undefined;
      const metadata = (await this.getMetadata()).find(entry => entry.id === id);
      if (!metadata) throw new Error('Save metadata is missing.');
      const stateRevision = Number(state.saveRevision ?? 0);
      const metadataRevision = Number(metadata.saveRevision ?? 0);
      if (stateRevision !== metadataRevision) {
        throw new Error('Save payload and metadata revisions do not match.');
      }
      return { state, metadata };
    });
  }

  static async deleteSave(id: string): Promise<void> {
    await withSaveWriteLock(async () => {
    const metadata = await this.getMetadata();
    await del(id, recoverableSaveStore);
    await set(METADATA_KEY, metadata.filter(m => m.id !== id), recoverableSaveStore);
    getRevisionChannel()?.postMessage({ saveId: id, kind: 'deleted' } satisfies ExternalSaveNotice);
    });
  }

  static async exportSave(
    id: string,
    options: LeagueExportOptions = DEFAULT_LEAGUE_EXPORT_OPTIONS,
  ): Promise<void> {
    const state = await this.loadGame(id);
    if (!state) return;

    const metadata = (await this.getMetadata()).find(m => m.id === id);
    await this.exportState(state, metadata?.name ?? id, options);
  }

  static async exportState(
    state: GameState,
    saveName: string,
    options: LeagueExportOptions = DEFAULT_LEAGUE_EXPORT_OPTIONS,
  ): Promise<void> {
    const exported = buildLeagueExport(state, options);
    const json = JSON.stringify(exported, null, options.compact ? undefined : 2);
    const bytes = options.gzip
      ? await gzipString(json)
      : new TextEncoder().encode(json);
    const safeName = saveName.replace(/[^a-z0-9_\- ]/gi, '_').trim().replace(/\s+/g, '_').toLowerCase();
    const fileName = `basketcommish_${safeName || 'league'}.json${options.gzip ? '.gz' : ''}`;
    const mime = options.gzip ? 'application/gzip' : 'application/json';

    if (options.streaming && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: options.gzip ? 'Compressed league file' : 'League file',
            accept: { [mime]: [options.gzip ? '.gz' : '.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    }

    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Patch an old save to meet the current schema minimum. */
  static migrateSave(raw: any, storageId?: string): GameState {
    if (!raw || typeof raw !== 'object') throw new Error('Not a valid save file');
    if (!Array.isArray(raw.players) || raw.players.length === 0)
      throw new Error('Save file has no player data — may be corrupted or incompatible');

    const identity = ensureSaveIdentity(raw, storageId);
    if (storageId && raw.saveId && raw.saveId !== storageId) {
      console.warn(`[SaveManager] Embedded saveId ${raw.saveId} differs from storage key ${storageId}; preserving the immutable embedded identity.`);
    }
    return {
      ...raw,
      isDataLoaded: true,
      commissionerName: raw.commissionerName ?? 'Commissioner',
      gameMode: raw.gameMode ?? 'commissioner',
      day: raw.day ?? 1,
      date: raw.date ?? toISODateString(getLeagueCalendarDates(raw.leagueStats?.year ?? 2025, raw.leagueStats).regularSeasonStart),
      news: raw.news ?? [],
      history: raw.history ?? [],
      chats: raw.chats ?? [],
      draftPicks: raw.draftPicks ?? [],
      staff: raw.staff ?? null,
      followedHandles: raw.followedHandles ?? [],
      nonNBATeams: raw.nonNBATeams ?? [],
      isProcessing: false,
      ...identity,
    } as unknown as GameState;
  }

  static async importSave(
    file: File,
    onProgress?: (progress: GameLoadProgress) => void,
  ): Promise<ImportedLeague> {
    const totalStartedAt = now();
    let raw: any;
    const report = (currentPhase: string, percentComplete: number, stepsComplete: number) => {
      onProgress?.({ currentPhase, percentComplete, stepsComplete, stepsTotal: LOAD_STEPS_TOTAL });
    };

    report('Reading the league file...', 5, 1);
    const readStartedAt = now();
    const buf = await file.arrayBuffer();
    const readMs = elapsed(readStartedAt);
    const bytes = new Uint8Array(buf);
    const isGzip = file.name.toLowerCase().endsWith('.gz') || (bytes[0] === 0x1f && bytes[1] === 0x8b);
    const decodeStartedAt = now();
    if (isGzip) {
      report('Unpacking the league file...', 12, 2);
      raw = await decodeLeagueBuffer(buf, true, () => report('Checking the league format...', 20, 3));
    } else {
      raw = await decodeLeagueBuffer(buf, false, () => report('Checking the league format...', 20, 3));
    }
    const decodeMs = elapsed(decodeStartedAt);

    let state: GameState;
    const convertStartedAt = now();
    const embeddedSaveId = typeof raw?.saveId === 'string' && raw.saveId.trim() ? raw.saveId : undefined;
    if (isBBGMLeagueFile(raw)) {
      report('Preparing teams, players, and league rules...', 38, 4);
      state = await parseBBGMLeagueFile(raw);
    } else {
      report('Checking native save data...', 38, 4);
      state = SaveManager.migrateSave(raw);
    }
    if (embeddedSaveId) {
      state = createIndependentSaveCopy(state);
    } else if (!embeddedSaveId) {
      state = { ...state, ...ensureSaveIdentity({ ...state, saveId: undefined, simulationSeed: state.simulationSeed }) };
    }
    const convertMs = elapsed(convertStartedAt);

    report('Saving the imported league in this browser...', 50, 5);
    const baseName = file.name.replace(/\.json(?:\.gz)?$/i, '').replace(/\.gz$/i, '');
    const saveName = state.leagueStats?.leagueName || baseName || 'Imported League';
    const id = await this.saveGame(state, saveName, 'guard');
    const metadata = (await this.getMetadata()).find(entry => entry.id === id);
    if (!metadata) throw new Error('The imported league was saved but its metadata is missing.');
    console.info('[IMPORT_PERF]', {
      fileName: file.name,
      fileBytes: file.size,
      readMs,
      decodeMs,
      convertMs,
      totalMs: elapsed(totalStartedAt),
    });
    return { metadata, state: { ...state, saveId: id, saveRevision: state.saveRevision } };
  }

  static async cloneSave(id: string, saveName?: string): Promise<ImportedLeague> {
    const source = await this.loadGame(id);
    if (!source) throw new Error('The save to copy could not be found.');
    const sourceMetadata = (await this.getMetadata()).find(entry => entry.id === id);
    const clone = createIndependentSaveCopy(source);
    const cloneId = await this.saveGame(clone, saveName ?? `${sourceMetadata?.name ?? 'League'} Copy`);
    const metadata = (await this.getMetadata()).find(entry => entry.id === cloneId);
    if (!metadata) throw new Error('The copied save was written but its metadata is missing.');
    return { metadata, state: clone };
  }

  /** Deletes the portrait image cache DB to free quota. */
  static _deleteImageCacheDB(): Promise<void> {
    return new Promise(resolve => {
      const req = indexedDB.deleteDatabase('nba_commish_image_cache');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }

  static async _clearTransientCaches(): Promise<void> {
    await this._deleteImageCacheDB();
    if (typeof caches === 'undefined') return;
    await Promise.all((await caches.keys()).map(key => caches.delete(key)));
  }

  // ── Folder mirror (File System Access API) ───────────────────────────────────

  static async getSaveFolder(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const handle = await get<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY, recoverableSaveStore);
      if (!handle) return null;
      const perm = await (handle as any).requestPermission({ mode: 'readwrite' });
      return perm === 'granted' ? handle : null;
    } catch {
      return null;
    }
  }

  static async chooseSaveFolder(): Promise<{ handle: FileSystemDirectoryHandle; name: string } | null> {
    if (!hasFSAccess()) return null;
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'nba-commish-saves' });
      await set(FOLDER_HANDLE_KEY, handle, recoverableSaveStore);
      return { handle, name: handle.name };
    } catch {
      return null;
    }
  }

  static async clearSaveFolder(): Promise<void> {
    await del(FOLDER_HANDLE_KEY, recoverableSaveStore);
  }

  /** Write compressed gzip save to the chosen folder. */
  static async writeToFolder(handle: FileSystemDirectoryHandle, compressed: ArrayBuffer, saveName: string): Promise<void> {
    const safeName = saveName.replace(/[^a-z0-9_\- ]/gi, '_');
    const fileHandle = await handle.getFileHandle(`${safeName}.json.gz`, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(compressed);
    await writable.close();
  }
}
