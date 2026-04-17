/**
 * ImageCache — IndexedDB-backed blob cache for player portrait images.
 *
 * Downloads all player portrait URLs in the background on game load,
 * stores them as blobs in IndexedDB, and returns blob URLs for instant
 * offline rendering.
 */

import type { NBAPlayer } from '../types';
import { extractNbaId, hdPortrait } from '../utils/helpers';

// ── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME = 'nba_commish_image_cache';
const DB_VERSION = 1;
const STORE_NAME = 'images';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── In-memory blob URL map ───────────────────────────────────────────────────

/** Maps original image URL -> blob: URL for instant access */
const blobUrlMap = new Map<string, string>();

/** Whether an init is currently running (prevents duplicate runs) */
let initRunning = false;

// ── Rate-limited downloader ──────────────────────────────────────────────────

const MAX_CONCURRENT = 5;
const DELAY_MS = 50; // small delay between starting each download

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadAndCache(
  db: IDBDatabase,
  url: string,
): Promise<void> {
  try {
    // Already in memory
    if (blobUrlMap.has(url)) return;

    // Already in IndexedDB — just hydrate the memory map
    const existing = await idbGet(db, url);
    if (existing) {
      blobUrlMap.set(url, URL.createObjectURL(existing));
      return;
    }

    // Download
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return;
    const blob = await res.blob();
    if (blob.size === 0) return;

    // Store in IDB
    await idbPut(db, url, blob);

    // Create blob URL
    blobUrlMap.set(url, URL.createObjectURL(blob));
  } catch {
    // Silently skip failures — image will just load from network as usual
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the image cache for all players. Downloads portraits in the
 * background with rate limiting. Safe to call multiple times — duplicate
 * calls are ignored while one is already running.
 */
export async function initImageCache(players: NBAPlayer[]): Promise<void> {
  if (initRunning) return;
  initRunning = true;

  try {
    const db = await openDB();

    // Collect unique image URLs — computed inline to avoid circular dep with bioCache
    const urls = new Set<string>();
    for (const p of players) {
      if (p.imgURL && p.imgURL.trim() !== '' && !p.imgURL.includes('head-par-defaut')) {
        urls.add(p.imgURL);
      } else {
        const nbaId = extractNbaId('', p.name);
        if (nbaId) urls.add(hdPortrait(nbaId));
      }
    }

    // Download with concurrency limit
    const urlArray = Array.from(urls);
    let idx = 0;

    async function worker(): Promise<void> {
      while (idx < urlArray.length) {
        const url = urlArray[idx++];
        await downloadAndCache(db, url);
        await sleep(DELAY_MS);
      }
    }

    // Spawn workers
    const workers: Promise<void>[] = [];
    for (let i = 0; i < MAX_CONCURRENT; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    db.close();
    console.log(`[ImageCache] Cached ${blobUrlMap.size} player portraits.`);
  } catch (err) {
    console.warn('[ImageCache] Init failed:', err);
  } finally {
    initRunning = false;
  }
}

/**
 * Returns a blob: URL for the given image URL if it exists in cache,
 * otherwise returns null (caller should fall back to the original URL).
 */
export function getCachedImageUrl(url: string): string | null {
  return blobUrlMap.get(url) ?? null;
}

/**
 * Clears all cached images from IndexedDB and revokes blob URLs.
 */
export async function clearImageCache(): Promise<void> {
  try {
    // Revoke all blob URLs to free memory
    for (const blobUrl of blobUrlMap.values()) {
      URL.revokeObjectURL(blobUrl);
    }
    blobUrlMap.clear();

    const db = await openDB();
    await idbClear(db);
    db.close();
    console.log('[ImageCache] Cache cleared.');
  } catch (err) {
    console.warn('[ImageCache] Clear failed:', err);
  }
}
