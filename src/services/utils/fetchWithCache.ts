// IDB-backed fetch helper: retry (4 attempts, 0/500ms/1s/2s) + 24h cache.
// Separate 'gist-cache' DB — isolated from keyval-store saves.

const GC_DB = 'gist-cache';
const GC_STORE = 'entries';

interface CacheEntry<T> { data: T; lastFetched: number }

const IDB_TIMEOUT_MS = 2000; // if IDB doesn't respond in 2s, bypass cache
const FETCH_TIMEOUT_MS = 8000; // per-attempt — browser fetch has no default, stalled connections hang forever

/** Race a promise against a timeout. Rejects with a tagged error if timer wins. */
function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`[fetchWithCache timeout] ${tag} > ${ms}ms`)), ms);
    p.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
  });
}

function openGC(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GC_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(GC_STORE))
        req.result.createObjectStore(GC_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // Critical: without onblocked handler, a version-mismatch or transaction-in-progress
    // on this DB name (e.g. another tab) can leave the open request pending forever.
    req.onblocked = () => reject(new Error('[openGC] blocked — IDB busy'));
  });
}

async function gcGet<T>(key: string): Promise<CacheEntry<T> | undefined> {
  const db = await withTimeout(openGC(), IDB_TIMEOUT_MS, 'openGC(get)');
  try {
    return await withTimeout(new Promise<CacheEntry<T> | undefined>((resolve, reject) => {
      const req = db.transaction(GC_STORE, 'readonly').objectStore(GC_STORE).get(key);
      req.onsuccess = () => resolve(req.result as CacheEntry<T> | undefined);
      req.onerror = () => reject(req.error);
    }), IDB_TIMEOUT_MS, 'gcGet tx');
  } finally {
    // Always close — if withTimeout rejected, the txn handlers never fire and db would leak.
    try { db.close(); } catch { /* already closed */ }
  }
}

async function gcSet<T>(key: string, entry: CacheEntry<T>): Promise<void> {
  const db = await withTimeout(openGC(), IDB_TIMEOUT_MS, 'openGC(set)');
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      const tx = db.transaction(GC_STORE, 'readwrite');
      tx.objectStore(GC_STORE).put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }), IDB_TIMEOUT_MS, 'gcSet tx');
  } finally {
    try { db.close(); } catch { /* already closed */ }
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const BACKOFF = [0, 500, 1000, 2000];

/**
 * Fetch URL with retry + IDB cache (TTL 24h default).
 * Returns null on total failure with no stale cache.
 * Returns stale cache if all retry attempts fail but cache exists.
 */
export async function fetchWithCache<T>(
  key: string,
  url: string,
  opts?: { ttlHours?: number; parse?: 'json' | 'text' },
): Promise<T | null> {
  const ttlMs = (opts?.ttlHours ?? 24) * 3_600_000;
  const parse = opts?.parse ?? 'json';

  let cached: CacheEntry<T> | undefined;
  try {
    cached = await gcGet<T>(key);
    if (cached && Date.now() - cached.lastFetched < ttlMs) return cached.data;
  } catch { /* IDB unavailable — proceed to fetch */ }

  for (let i = 0; i < BACKOFF.length; i++) {
    if (BACKOFF[i] > 0) await sleep(BACKOFF[i]);
    // AbortController with per-attempt timeout — browser fetch() has no
    // built-in timeout and will hang forever on stalled connections, which
    // froze the lazy-sim loop every batch when called from SocialEngine.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: T = parse === 'json' ? await res.json() : (await res.text()) as unknown as T;
      try { await gcSet(key, { data, lastFetched: Date.now() }); } catch { /* non-fatal */ }
      return data;
    } catch {
      clearTimeout(timeoutId);
      if (i < BACKOFF.length - 1) continue;
      if (cached) {
        console.warn(`[fetchWithCache] ${key}: all attempts failed, using stale cache`);
        return cached.data;
      }
      console.warn(`[fetchWithCache] ${key}: all attempts failed, no cache`);
      return null;
    }
  }
  return null;
}
