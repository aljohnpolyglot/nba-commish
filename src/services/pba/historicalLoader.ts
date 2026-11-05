import { PBA_HISTORICAL_CATALOG } from './historicalCatalog';
import type { PbaMasterSource } from './historicalTypes';
import { readJsonResponse } from '../utils/jsonResponse';
import { getPlayablePbaSeasons } from './historyConfig';
import { loadExternalPortraitCatalog } from '../externalPortraitCatalog';

let sourcePromise: Promise<PbaMasterSource> | null = null;
let cachedSource: PbaMasterSource | null = null;

function validateSource(value: unknown): PbaMasterSource {
  if (!value || typeof value !== 'object') throw new Error('Historical PBA source is not an object.');
  const source = value as Partial<PbaMasterSource>;
  if (!Array.isArray(source.players) || !Array.isArray(source.teams)) {
    throw new Error('Historical PBA source is missing players or teams.');
  }
  const validated = source as PbaMasterSource;
  if (getPlayablePbaSeasons(validated).length === 0) {
    throw new Error('Historical PBA source has no playable seasons.');
  }
  return validated;
}

export async function loadHistoricalPbaSource(): Promise<PbaMasterSource> {
  if (!sourcePromise) {
    sourcePromise = Promise.all([
      fetch(PBA_HISTORICAL_CATALOG.sourceUrl)
        .then(response => readJsonResponse<unknown>(response, 'Historical PBA source'))
        .then(validateSource),
      loadExternalPortraitCatalog('PBA').catch(() => new Map()),
    ])
      .then(([source]) => {
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

export function getCachedHistoricalPbaSource(): PbaMasterSource | null {
  return cachedSource;
}

export function clearHistoricalPbaSourceCache(): void {
  sourcePromise = null;
  cachedSource = null;
}
