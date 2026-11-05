export type HistoricalCoachCareerRole = 'head' | 'assistant' | 'development' | 'youth' | 'consultant';

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function classifyCoachRoleText(value: unknown): HistoricalCoachCareerRole | null {
  const role = normalize(value);
  if (/\b(?:assistant|associate|asst)\b/.test(role)) return 'assistant';
  if (/\b(?:consultant|advisor|adviser)\b|\btechnical director\b/.test(role)) return 'consultant';
  if (/\b(?:youth|academy|junior|cadet)\b|\bu\d{2}\b/.test(role)) return 'youth';
  if (/\b(?:development|reserve)\b/.test(role)) return 'development';
  if (/\b(?:coach|trainer|head|interim|temporary)\b/.test(role)) return 'head';
  return null;
}

export function classifyInlineCoachRole(value: unknown): HistoricalCoachCareerRole | null {
  return [...String(value ?? '').matchAll(/\(([^)]*)\)/g)]
    .map(match => classifyCoachRoleText(match[1]))
    .find((role): role is HistoricalCoachCareerRole => role !== null) ?? null;
}

export function cleanInlineCoachRoleTags(value: unknown): string {
  return String(value ?? '')
    .replace(/\s*\(([^)]*)\)\s*/g, (full, roleText: string) => classifyCoachRoleText(roleText) ? ' ' : full)
    .replace(/\s+/g, ' ')
    .trim();
}
