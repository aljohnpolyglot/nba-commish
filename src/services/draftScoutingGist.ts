/**
 * draftScoutingGist.ts
 * Shared gist cache + name-matcher for draft-class scouting data.
 * Consumed by both DraftScoutingView (mock-draft slot cards) and
 * DraftScoutingModal (header rank chips, college stats, photos).
 */

import type { NBAPlayer } from '../types';

const GIST_BASE = 'https://gist.githubusercontent.com/aljohnpolyglot/bb8c80155c6c225cf1be9428892c6329/raw/';

export interface GistProspect {
  id: string;
  rank: string;
  name: string;
  position?: string;
  college?: string;
  headshot?: string;
  silo?: string;
  height?: string;
  age?: string;
  stats?: { pts?: number; reb?: number; ast?: number; fg?: string };
  externalRanks?: { noCeilings?: string; espn?: string };
  comparisons?: string;
  scoutingReport?: string;
}

// Module-level cache keyed by draft year. `null` = fetch already failed
// (don't retry on every modal open).
const gistCache = new Map<number, GistProspect[] | null>();

async function fetchDraftClassScouting(year: number): Promise<GistProspect[] | null> {
  try {
    const res = await fetch(`${GIST_BASE}${year}classScouting`);
    const text = await res.text();
    const jsonStart = text.indexOf('[');
    if (jsonStart === -1) throw new Error('Invalid Gist format');
    return JSON.parse(text.substring(jsonStart));
  } catch (e) {
    console.error(`Failed to fetch scouting data for ${year}:`, e);
    return null;
  }
}

/** Prefetch + cache. Safe to fire-and-forget at game init. */
export function prefetchDraftScouting(year: number): Promise<void> {
  if (gistCache.has(year)) return Promise.resolve();
  return fetchDraftClassScouting(year).then(data => {
    gistCache.set(year, data);
  });
}

/** Synchronous cache read; returns undefined if not yet fetched, null if fetch failed. */
export function getCachedDraftScouting(year: number): GistProspect[] | null | undefined {
  return gistCache.get(year);
}

/** Async fetch+cache; resolves with cached value (null on failure). */
export async function ensureDraftScouting(year: number): Promise<GistProspect[] | null> {
  if (gistCache.has(year)) return gistCache.get(year) ?? null;
  const data = await fetchDraftClassScouting(year);
  gistCache.set(year, data);
  return data;
}

/** Strip accents, suffixes, punctuation, casing — for fuzzy name matching. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Fuzzy-match a player to a gist entry. Returns null when no overlap. */
export function matchProspectToGist(
  player: NBAPlayer,
  gistData: GistProspect[] | null | undefined,
): GistProspect | null {
  if (!gistData?.length) return null;
  const norm = normalizeName(player.name);
  return gistData.find(g => {
    const gn = normalizeName(g.name);
    return gn === norm || gn.includes(norm) || norm.includes(gn);
  }) ?? null;
}
