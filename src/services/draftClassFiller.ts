/**
 * draftClassFiller.ts
 *
 * Keeps every upcoming draft class at a healthy size. Detects which years have
 * fewer than the target head-count and synthesizes prospects to fill the gap.
 *
 * Runs at:
 *   • Game init — after roster import, before the player sees the dashboard.
 *   • Every season rollover — after the year bump, so the far-future class stays
 *     populated season over season.
 *
 * Design: synthesize only the DEFICIT, never replace existing prospects. BBGM
 * import may have real prospects for the next couple years; we just top them up.
 */

import type { NBAPlayer } from '../types';
import { generateDraftClassForGame } from './genDraftPlayers';
import { getNameData } from '../data/nameDataFetcher';

const TARGET_CLASS_SIZE = 100;
const HORIZON_YEARS = 4; // current + next 3 = always 4 populated classes

export interface FillResult {
  /** Only the newly-synthesized prospects. Caller appends these to state.players. */
  additions: NBAPlayer[];
  generatedByYear: Record<number, number>;
}

/**
 * Returns ONLY the newly-synthesized prospects (caller pushes them into state.players).
 * If every class is already full, additions is empty.
 */
export function ensureDraftClasses(players: NBAPlayer[], currentYear: number): FillResult {
  const nameData = getNameData();
  // Count ANY prospect pool entry — `tid === -2` is canonical for "not yet drafted"
  // per the project README. Status varies ('Prospect', 'Draft Prospect') so don't
  // filter on it or we'll miscount and add duplicates.
  const counts: Record<number, number> = {};
  for (const p of players) {
    if (p.tid !== -2) continue;
    const dy = p.draft?.year;
    if (typeof dy !== 'number') continue;
    if (dy < currentYear) continue;
    counts[dy] = (counts[dy] ?? 0) + 1;
  }

  const additions: NBAPlayer[] = [];
  const generatedByYear: Record<number, number> = {};
  for (let offset = 0; offset < HORIZON_YEARS; offset++) {
    const year = currentYear + offset;
    const have = counts[year] ?? 0;
    const need = TARGET_CLASS_SIZE - have;
    if (need <= 0) continue;
    // Pass currentYear so prospects synthesized for future classes are aged-down appropriately.
    const fresh = generateDraftClassForGame(year, need, Math.random, nameData, currentYear);
    // Stamp each prospect with a deterministic id prefix so they don't collide with BBGM ids.
    for (let i = 0; i < fresh.length; i++) {
      (fresh[i] as any).internalId = `gen-${year}-${Date.now().toString(36)}-${i}`;
    }
    additions.push(...fresh);
    generatedByYear[year] = fresh.length;
  }

  return { additions, generatedByYear };
}
