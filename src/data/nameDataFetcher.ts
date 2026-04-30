/**
 * nameDataFetcher.ts
 *
 * Loads the bundled ZenGM names.json (124 countries, ~760KB) at startup.
 * No network fetch needed — the file ships with the app.
 */

import type { NameData } from '../genplayersconstants';
import rawNames from './names.json';

// names.json ships in the correct NameData shape ({ countries: { ... } }) already.
const BUNDLED: NameData = rawNames as unknown as NameData;

let cachedNameData: NameData = BUNDLED;

/** Synchronous accessor — always returns the full 124-country bundled set. */
export function getNameData(): NameData {
  return cachedNameData;
}

/** No-op kept for call-site compatibility — data is already loaded synchronously. */
export async function loadNameData(): Promise<NameData> {
  return cachedNameData;
}
