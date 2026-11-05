import archiveUrl from '../../data/nbacoaches.json?url';

let archive: unknown = { coachPages: [] };
let archivePromise: Promise<void> | null = null;
let archiveVersion = 0;

export function prepareHistoricalCoachArchive(): Promise<void> {
  if (archivePromise) return archivePromise;
  archivePromise = fetch(archiveUrl)
    .then(response => {
      if (!response.ok) throw new Error(`Historical coach archive request failed (${response.status}).`);
      return response.json();
    })
    .then(value => {
      archive = value;
      archiveVersion += 1;
    })
    .catch(error => {
      archivePromise = null;
      console.warn('[Historical coaches] Archive unavailable; continuing with the saved and fallback staff pool.', error);
    });
  return archivePromise;
}

export function getHistoricalCoachArchive(): unknown {
  return archive;
}

export function getHistoricalCoachArchiveVersion(): number {
  return archiveVersion;
}
