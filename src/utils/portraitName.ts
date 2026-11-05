export function normalizePortraitName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+stats$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[её]/g, 'e')
    .replace(/[^a-z0-9]/g, '');
}
