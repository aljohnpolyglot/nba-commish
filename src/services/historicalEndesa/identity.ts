const YEAR_RANGE_SUFFIX = /\s+\d{4}\s*[–—-]\s*\d{4}\s*$/u;

export function cleanHistoricalEndesaPlayerName(name: string): string {
  return name.replace(YEAR_RANGE_SUFFIX, '').replace(/\s+/g, ' ').trim();
}

export function normalizeHistoricalEndesaPlayerName(name: string): string {
  return cleanHistoricalEndesaPlayerName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function historicalEndesaIdentityKey(name: string, birthYear?: number): string {
  return `${normalizeHistoricalEndesaPlayerName(name)}|${birthYear ?? ''}`;
}

