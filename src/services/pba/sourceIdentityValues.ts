const EMPTY_SOURCE_VALUES = new Set(['', '-', '—', '0', 'none', 'n/a', 'na', 'unknown']);

export function hasMeaningfulSourceText(value: unknown): value is string {
  return !EMPTY_SOURCE_VALUES.has(String(value ?? '').trim().toLowerCase());
}

export function parsePlausibleBirthYear(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
}
