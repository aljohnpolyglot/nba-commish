import { get, set, del } from 'idb-keyval';
import { GameState } from '../types';

export interface SaveMetadata {
  id: string;
  name: string;
  dateSaved: number;
  gameDate: string;
  commissionerName: string;
  day: number;
}

const SAVES_PREFIX = 'nba_commish_save_';
const METADATA_KEY = 'nba_commish_metadata';
const FOLDER_HANDLE_KEY = 'nba_commish_folder_handle';

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

async function gunzipBuffer(buf: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(buf);
  writer.close();
  return new Response(ds.readable).text();
}

/** Detect whether a value from IndexedDB is a compressed save ({__gz, data}) */
function isCompressed(v: any): v is { __gz: true; data: ArrayBuffer } {
  return v && v.__gz === true && v.data instanceof ArrayBuffer;
}

// ── SaveManager ───────────────────────────────────────────────────────────────

export class SaveManager {
  static async getMetadata(): Promise<SaveMetadata[]> {
    return (await get<SaveMetadata[]>(METADATA_KEY)) ?? [];
  }

  static async saveGame(state: GameState, saveName: string): Promise<string> {
    const id = state.saveId || `${SAVES_PREFIX}${Date.now()}`;
    const metadata = await this.getMetadata();

    const newMeta: SaveMetadata = {
      id,
      name: saveName,
      dateSaved: Date.now(),
      gameDate: state.date,
      commissionerName: state.commissionerName,
      day: state.day,
    };

    const existingIndex = metadata.findIndex(m => m.id === id);
    if (existingIndex >= 0) metadata[existingIndex] = newMeta;
    else metadata.push(newMeta);

    const stateToSave = { ...state, saveId: id };
    const json = JSON.stringify(stateToSave); // no whitespace
    const compressed = await gzipString(json);
    const payload = { __gz: true, data: compressed };

    try {
      await set(id, payload);
    } catch (e: any) {
      if (e?.name === 'QuotaExceededError' || e?.code === 22) {
        const ok = window.confirm(
          'Storage is full — save failed.\n\nClear the portrait image cache to free space and retry?\n(Your game progress will not be lost.)'
        );
        if (ok) {
          await SaveManager._deleteImageCacheDB();
          await set(id, payload);
        } else {
          throw new Error('Save cancelled: storage full');
        }
      } else {
        throw e;
      }
    }
    await set(METADATA_KEY, metadata);

    // Mirror to chosen folder (silent best-effort, also compressed)
    try {
      const folderHandle = await this.getSaveFolder();
      if (folderHandle) await this.writeToFolder(folderHandle, compressed, saveName);
    } catch { /* non-fatal */ }

    return id;
  }

  static async loadGame(id: string): Promise<GameState | undefined> {
    const raw = await get<any>(id);
    if (!raw) return undefined;

    let parsed: any;
    if (isCompressed(raw)) {
      const json = await gunzipBuffer(raw.data);
      parsed = JSON.parse(json);
    } else {
      parsed = raw; // legacy uncompressed save
    }

    try {
      return SaveManager.migrateSave({ ...parsed, saveId: id });
    } catch {
      return parsed as GameState;
    }
  }

  static async deleteSave(id: string): Promise<void> {
    const metadata = await this.getMetadata();
    await del(id);
    await set(METADATA_KEY, metadata.filter(m => m.id !== id));
  }

  /** Export: gzip + streaming download (.json.gz). Falls back to blob URL. */
  static async exportSave(id: string): Promise<void> {
    const state = await this.loadGame(id);
    if (!state) return;

    const metadata = (await this.getMetadata()).find(m => m.id === id);
    const safeName = (metadata?.name ?? id).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `basketcommish_${safeName}.json.gz`;

    const compressed = await gzipString(JSON.stringify(state));

    // Try streaming save-file picker first (Chrome/Edge)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'Compressed save', accept: { 'application/gzip': ['.gz'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(compressed);
        await writable.close();
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        // fall through to blob download
      }
    }

    // Fallback blob URL download
    const blob = new Blob([compressed], { type: 'application/gzip' });
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
  static migrateSave(raw: any): GameState {
    if (!raw || typeof raw !== 'object') throw new Error('Not a valid save file');
    if (!Array.isArray(raw.players) || raw.players.length === 0)
      throw new Error('Save file has no player data — may be corrupted or incompatible');

    return {
      ...raw,
      isDataLoaded: true,
      commissionerName: raw.commissionerName ?? 'Commissioner',
      gameMode: raw.gameMode ?? 'commissioner',
      day: raw.day ?? 1,
      date: raw.date ?? `${raw.leagueStats?.year ?? 2025}-10-01`,
      news: raw.news ?? [],
      history: raw.history ?? [],
      chats: raw.chats ?? [],
      draftPicks: raw.draftPicks ?? [],
      staff: raw.staff ?? null,
      followedHandles: raw.followedHandles ?? [],
      nonNBATeams: raw.nonNBATeams ?? [],
      isProcessing: false,
      saveId: raw.saveId,
    } as unknown as GameState;
  }

  /** Import: accepts both .json and .json.gz files. */
  static async importSave(file: File): Promise<void> {
    let raw: any;

    if (file.name.endsWith('.gz')) {
      const buf = await file.arrayBuffer();
      const json = await gunzipBuffer(buf);
      raw = JSON.parse(json);
    } else {
      const text = await file.text();
      raw = JSON.parse(text);
    }

    const state = SaveManager.migrateSave({ ...raw, saveId: undefined });
    await this.saveGame(state, `Imported - ${new Date().toLocaleDateString()}`);
  }

  /** Deletes the portrait image cache DB to free quota. */
  static _deleteImageCacheDB(): Promise<void> {
    return new Promise(resolve => {
      const req = indexedDB.deleteDatabase('nba_commish_image_cache');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }

  // ── Folder mirror (File System Access API) ───────────────────────────────────

  static async getSaveFolder(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const handle = await get<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY);
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
      await set(FOLDER_HANDLE_KEY, handle);
      return { handle, name: handle.name };
    } catch {
      return null;
    }
  }

  static async clearSaveFolder(): Promise<void> {
    await del(FOLDER_HANDLE_KEY);
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
