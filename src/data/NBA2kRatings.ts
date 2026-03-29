/**
 * NBA 2K26 Ratings data fetcher — single source of truth for player attribute data.
 * Fetched once from gist and cached for the session.
 * Consumed by: Defense2KService.ts (team defense ratings), DunkContestModal.tsx (dunk ratings)
 */

const GIST_URL =
  'https://gist.githubusercontent.com/aljohnpolyglot/10016f0800ee9b57420c4c74ad9060e3/raw/f6f4fbb0024f37e08f823379577ca2d0ae77abe4/NBA2k26_Ratings';

let teamsCache: any[] | null = null;

export async function loadRatings(): Promise<void> {
  if (teamsCache) return;
  try {
    const res = await fetch(GIST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    teamsCache = await res.json();
    console.log('[NBA2kRatings] ✅ Ratings loaded successfully!');
  } catch (e) {
    console.error('[NBA2kRatings] ❌ Failed to load ratings:', e);
    teamsCache = [];
  }
}

/** Returns the raw teams array (each team has a .roster array with .name and .attributes). */
export function getRawTeams(): any[] {
  return teamsCache ?? [];
}
