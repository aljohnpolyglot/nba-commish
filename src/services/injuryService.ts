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
import { fetchWithCache } from './utils/fetchWithCache';

const INJURY_DATA_URL =
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbainjurieslist';

let _cache: InjuryDefinition[] = [];

export const fetchInjuryData = async (): Promise<void> => {
  const data = await fetchWithCache<InjuryDefinition[]>('injury-definitions', INJURY_DATA_URL);
  if (data) {
    _cache = data;
    console.log(`[InjuryService] Loaded ${_cache.length} injury definitions.`);
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
