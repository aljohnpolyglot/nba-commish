/**
 * injuryService.ts
 *
 * Runtime-fetch pattern for the injuries definition list (name, frequency, games).
 * Called once at app startup: fetchInjuryData() → cached.
 * Consumed synchronously via getInjuries() — same pattern as charaniaphotos / nbaMemesFetcher.
 *
 * Source: GitHub gist (100+ real NBA injury types with historical frequency).
 * If fetch fails the cache stays empty and getInjuries() returns [].
 */

import type { InjuryDefinition } from '../types';

const INJURY_DATA_URL =
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbainjurieslist';

let _cache: InjuryDefinition[] = [];
let _fetched = false;

export const fetchInjuryData = async (): Promise<void> => {
  console.log('[InjuryService] Fetching injury definitions...');
  try {
    const res = await fetch(INJURY_DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _cache = await res.json();
    _fetched = true;
    console.log(`[InjuryService] Loaded ${_cache.length} injury definitions.`);
  } catch (err) {
    console.warn('[InjuryService] Failed to fetch injury list:', err);
    _fetched = true; // mark done so callers don't hang; _cache stays []
  }
};

/** Synchronous accessor — always returns the fetched gist list. */
export const getInjuries = (): InjuryDefinition[] => _cache;

/** Legacy alias */
export const getInjuryData = fetchInjuryData;

export const getRandomInjury = (injuries: InjuryDefinition[]): InjuryDefinition => {
  const totalFreq = injuries.reduce((sum, i) => sum + i.frequency, 0);
  let rand = Math.random() * totalFreq;
  for (const injury of injuries) {
    if (rand < injury.frequency) return injury;
    rand -= injury.frequency;
  }
  return injuries[0];
};
