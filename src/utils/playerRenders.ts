/**
 * playerRenders.ts
 * Lazy-loads NBA full-body player renders from GitHub (no local copy).
 * Mirrors the loader pattern in arenaData.ts.
 */

const RENDERS_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nbafullbodyrenders';

export interface PlayerRender {
  id: string;
  name: string;
  slug: string;
  image_url: string;
  league: string;
}

let renderMap: Map<string, string> | null = null;
let loadPromise: Promise<void> | null = null;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Pre-warm the cache. Safe to call multiple times. */
export function loadPlayerRenders(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(RENDERS_URL)
    .then(r => r.json())
    .then((data: PlayerRender[]) => {
      renderMap = new Map();
      for (const p of data) {
        if (!p.image_url) continue;
        if (p.slug) renderMap.set(p.slug.toLowerCase(), p.image_url);
        if (p.name) renderMap.set(slugify(p.name), p.image_url);
      }
    })
    .catch(() => {
      // Silently fail — renders are supplementary, fallback handles it.
    });
  return loadPromise;
}

/** Returns the render URL or null if not yet loaded / not found. */
export function getPlayerRender(name: string | undefined | null): string | null {
  if (!renderMap || !name) return null;
  const key = slugify(name);
  return renderMap.get(key) ?? null;
}

export function isPlayerRendersLoaded(): boolean {
  return renderMap !== null;
}
