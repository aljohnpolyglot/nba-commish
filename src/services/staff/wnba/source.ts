const WNBA_COACH_SOURCE_PATH = '/data/external/wnba/coaches/wnba-coaches.json';

let archive: unknown = { coaches: [] };
let archivePromise: Promise<void> | null = null;
let archiveVersion = 0;

export function prepareWnbaCoachSource(): Promise<void> {
  if (archivePromise) return archivePromise;
  archivePromise = fetch(WNBA_COACH_SOURCE_PATH)
    .then(response => {
      if (!response.ok) throw new Error(`WNBA coach source request failed (${response.status}).`);
      return response.json();
    })
    .then(value => {
      archive = value;
      archiveVersion += 1;
    })
    .catch(error => {
      archivePromise = null;
      console.warn('[WNBA coaches] Source unavailable; continuing with saved staff.', error);
    });
  return archivePromise;
}

export function getWnbaCoachSource(): unknown {
  return archive;
}

export function getWnbaCoachSourceVersion(): number {
  return archiveVersion;
}
