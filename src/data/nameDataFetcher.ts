/**
 * nameDataFetcher.ts
 *
 * Loads the bundled ZenGM names.json (124 countries, ~760KB) at startup.
 * No network fetch needed — the file ships with the app.
 */

import type { NameData } from '../genplayersconstants';
import { normalizeNationality } from '../utils/countryFlags';
import rawNames from './names.json';
import rawFemaleNames from './names-female.json';

// names.json ships in the correct NameData shape ({ countries: { ... } }) already.
const BUNDLED: NameData = rawNames as unknown as NameData;
const BUNDLED_FEMALE = rawFemaleNames as { countries: Record<string, Record<string, number>> };

let cachedNameData: NameData = BUNDLED;

/** Synchronous accessor — always returns the full 124-country bundled set. */
export function getNameData(): NameData {
  return cachedNameData;
}

export function getGenderedNamePools(
  nameData: NameData,
  country: string,
  gender: 'male' | 'female' = 'male',
): { first: Record<string, number>; last: Record<string, number> } {
  const tail = String(country).split(',').pop()?.trim() ?? country;
  const normalized = normalizeNationality(tail);
  const canonical = normalized === 'American' ? 'USA' : normalized;
  const candidates = [...new Set([tail, canonical, canonical.replace(/ /g, '_'), canonical.replace(/_/g, ' ')])];
  const countryData = candidates.map(key => nameData.countries[key]).find(Boolean)
    ?? nameData.countries.USA
    ?? Object.values(nameData.countries).find(entry => Object.keys(entry.first ?? {}).length > 0);
  const femaleFirst = candidates.map(key => BUNDLED_FEMALE.countries[key]).find(Boolean)
    ?? BUNDLED_FEMALE.countries.USA;
  return {
    first: gender === 'female' && femaleFirst ? femaleFirst : countryData?.first ?? { Alex: 1 },
    last: countryData?.last ?? nameData.countries.USA?.last ?? { Smith: 1 },
  };
}

function pickWeightedName(values: Record<string, number>, rng: () => number): string | undefined {
  const entries = Object.entries(values).filter(([, weight]) => Number(weight) > 0);
  const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (total <= 0) return entries[0]?.[0];
  let roll = rng() * total;
  for (const [name, weight] of entries) {
    roll -= Number(weight);
    if (roll <= 0) return name;
  }
  return entries.at(-1)?.[0];
}

export function pickGenderedName(
  nameData: NameData,
  country: string,
  gender: 'male' | 'female',
  rng: () => number,
): string {
  const pools = getGenderedNamePools(nameData, country, gender);
  const first = pickWeightedName(pools.first, rng);
  const last = pickWeightedName(pools.last, rng);
  return first && last ? `${first} ${last}` : gender === 'female' ? 'Jane Smith' : 'John Smith';
}

/** No-op kept for call-site compatibility — data is already loaded synchronously. */
export async function loadNameData(): Promise<NameData> {
  return cachedNameData;
}
