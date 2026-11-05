import archiveUrl from '../../data/basketball_reference_executives.json?url';

let archive: unknown = { executives: [] };
let archivePromise: Promise<void> | null = null;

export function prepareHistoricalExecutiveArchive(): Promise<void> {
  if (archivePromise) return archivePromise;
  archivePromise = fetch(archiveUrl)
    .then(response => {
      if (!response.ok) throw new Error(`Historical executive archive request failed (${response.status}).`);
      return response.json();
    })
    .then(value => {
      archive = value;
    })
    .catch(error => {
      archivePromise = null;
      console.warn('[Historical executives] Archive unavailable; continuing with the saved and fallback executive pool.', error);
    });
  return archivePromise;
}

export function getHistoricalExecutiveArchive(): unknown {
  return archive;
}
