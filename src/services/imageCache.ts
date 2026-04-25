/**
 * ImageCache — IndexedDB-backed blob cache for player portrait images.
 * v2: quota-aware (skip at >80%, evict LRU 20% at >95%) + LRU tracking.
 */

import type { NBAPlayer } from '../types';
import { extractNbaId, hdPortrait } from '../utils/helpers';

// ── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME = 'nba_commish_image_cache';
const DB_VERSION = 2; // bumped: adds LRU store
const STORE_NAME = 'images';
const LRU_STORE = 'lru';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(LRU_STORE))
        db.createObjectStore(LRU_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
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

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, LRU_STORE], 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.objectStore(LRU_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── LRU helpers ──────────────────────────────────────────────────────────────

interface LRUEntry { lastAccessed: number }

function lruUpdate(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(LRU_STORE, 'readwrite');
    tx.objectStore(LRU_STORE).put({ lastAccessed: Date.now() }, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve(); // non-fatal
  });
}

function lruDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(LRU_STORE, 'readwrite');
    tx.objectStore(LRU_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function lruGetAll(db: IDBDatabase): Promise<{ key: string; lastAccessed: number }[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(LRU_STORE, 'readonly').objectStore(LRU_STORE).openCursor();
    const result: { key: string; lastAccessed: number }[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        result.push({ key: cursor.key as string, lastAccessed: (cursor.value as LRUEntry).lastAccessed });
        cursor.continue();
      } else {
        resolve(result);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function evictLRU(db: IDBDatabase, fraction: number): Promise<void> {
  try {
    const entries = await lruGetAll(db);
    if (entries.length === 0) return;
    const toEvict = Math.max(1, Math.ceil(entries.length * fraction));
    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
    const victims = entries.slice(0, toEvict);
    for (const v of victims) {
      await idbDelete(db, v.key);
      await lruDelete(db, v.key);
      const blobUrl = blobUrlMap.get(v.key);
      if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrlMap.delete(v.key); }
    }
    console.log(`[ImageCache] Evicted ${victims.length} cached portraits (LRU).`);
  } catch {
    // non-fatal
  }
}

// ── Quota check ──────────────────────────────────────────────────────────────

async function shouldSkipCaching(db: IDBDatabase): Promise<boolean> {
  if (!navigator.storage?.estimate) return false;
  try {
    const { usage = 0, quota = 1 } = await navigator.storage.estimate();
    const ratio = usage / quota;
    if (ratio > 0.95) await evictLRU(db, 0.2);
    if (ratio > 0.80) return true; // too full — skip caching
  } catch { /* estimate unavailable */ }
  return false;
}

// ── In-memory blob URL map ───────────────────────────────────────────────────

const blobUrlMap = new Map<string, string>();
let initRunning = false;

// ── Rate-limited downloader ──────────────────────────────────────────────────

const MAX_CONCURRENT = 5;
const DELAY_MS = 50;

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function downloadAndCache(db: IDBDatabase, url: string): Promise<void> {
  try {
    if (blobUrlMap.has(url)) return;

    const existing = await idbGet(db, url);
    if (existing) {
      blobUrlMap.set(url, URL.createObjectURL(existing));
      await lruUpdate(db, url);
      return;
    }

    if (url.includes('ak-static.cms.nba.com') || url.includes('cdn.nba.com')) return;

    // Quota check before download — skip if storage too full
    if (await shouldSkipCaching(db)) return;

    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return;
    const blob = await res.blob();
    if (blob.size === 0) return;

    await idbPut(db, url, blob);
    await lruUpdate(db, url);
    blobUrlMap.set(url, URL.createObjectURL(blob));
  } catch {
    // Silently skip failures — image loads from network
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function initImageCache(players: NBAPlayer[]): Promise<void> {
  if (initRunning) return;
  initRunning = true;

  try {
    const db = await openDB();

    const urls = new Set<string>();
    for (const p of players) {
      if (p.imgURL && p.imgURL.trim() !== '' && !p.imgURL.includes('head-par-defaut')) {
        urls.add(p.imgURL);
      } else {
        const nbaId = extractNbaId('', p.name);
        if (nbaId) urls.add(hdPortrait(nbaId));
      }
    }

    const urlArray = Array.from(urls);
    let idx = 0;

    async function worker(): Promise<void> {
      while (idx < urlArray.length) {
        const url = urlArray[idx++];
        await downloadAndCache(db, url);
        await sleep(DELAY_MS);
      }
    }

    const workers: Promise<void>[] = [];
    for (let i = 0; i < MAX_CONCURRENT; i++) workers.push(worker());
    await Promise.all(workers);

    db.close();
    console.log(`[ImageCache] Cached ${blobUrlMap.size} player portraits.`);
  } catch (err) {
    console.warn('[ImageCache] Init failed:', err);
  } finally {
    initRunning = false;
  }
}

export function getCachedImageUrl(url: string): string | null {
  return blobUrlMap.get(url) ?? null;
}

export async function clearImageCache(): Promise<void> {
  try {
    for (const blobUrl of blobUrlMap.values()) URL.revokeObjectURL(blobUrl);
    blobUrlMap.clear();
    const db = await openDB();
    await idbClear(db);
    db.close();
    console.log('[ImageCache] Cache cleared.');
  } catch (err) {
    console.warn('[ImageCache] Clear failed:', err);
  }
}
