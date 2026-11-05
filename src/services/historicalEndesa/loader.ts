import { ENDESA_HISTORICAL_CATALOG } from './catalog';
import type { EndesaMasterSource } from './types';
import { readJsonResponse } from '../utils/jsonResponse';

let sourcePromise: Promise<EndesaMasterSource> | null = null;
let cachedSource: EndesaMasterSource | null = null;

function validateSource(value: unknown): EndesaMasterSource {
  if (!value || typeof value !== 'object') throw new Error('Historical Liga Endesa source is not an object.');
  const source = value as Partial<EndesaMasterSource>;
  if (!Array.isArray(source.players) || !Array.isArray(source.teams)) {
    throw new Error('Historical Liga Endesa source is missing players or teams.');
  }
  return source as EndesaMasterSource;
}

export async function loadHistoricalEndesaSource(): Promise<EndesaMasterSource> {
  if (!sourcePromise) {
    sourcePromise = fetch(ENDESA_HISTORICAL_CATALOG.sourceUrl)
      .then(response => readJsonResponse<unknown>(response, 'Historical Liga Endesa source'))
      .then(validateSource)
      .then(source => {
        cachedSource = source;
        return source;
      })
      .catch(error => {
        sourcePromise = null;
        throw error;
      });
  }
  return sourcePromise;
}

export function clearHistoricalEndesaSourceCache(): void {
  sourcePromise = null;
  cachedSource = null;
}

export function getCachedHistoricalEndesaSource(): EndesaMasterSource | null {
  return cachedSource;
}
