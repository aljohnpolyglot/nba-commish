import { getCountryFlagCode } from './countryFlags';
import { getCountryCode } from './helpers';

const INVALID_SCHOOL_VALUES = new Set(['', '-', '—', 'n/a', 'na', 'none', 'unknown']);

const cleanSchoolSegment = (value: string): string => value
  .replace(/^[\s,;/|]+/, '')
  .replace(/^(?:and|then)\s+/i, '')
  .replace(/[\s,;/|]+$/, '')
  .replace(/\s+/g, ' ')
  .trim();

export function getLastAttendedSchool(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (INVALID_SCHOOL_VALUES.has(raw.toLowerCase())) return null;
  if (getCountryCode(raw) || getCountryFlagCode(raw)) return null;

  const proseTransfer = raw.match(
    /\b(?:and|then)\s+(.+?)\s+(?:from|in)\s+(?:19|20)\d{2}(?:\s*(?:to|[-–—])\s*(?:(?:19|20)?\d{2}))?\s*$/i,
  );
  if (proseTransfer?.[1]) return cleanSchoolSegment(proseTransfer[1]) || null;

  const attendanceYears = /\(\s*(?:19|20)\d{2}(?:\s*(?:to|[-–—])\s*(?:(?:19|20)?\d{2}))?\s*\)/g;
  let lastEnd = 0;
  let lastSchool = '';
  let matched = false;
  for (const match of raw.matchAll(attendanceYears)) {
    matched = true;
    const school = cleanSchoolSegment(raw.slice(lastEnd, match.index));
    if (school) lastSchool = school;
    lastEnd = (match.index ?? 0) + match[0].length;
  }
  if (!matched) return raw;

  const trailingSchool = cleanSchoolSegment(raw.slice(lastEnd));
  return trailingSchool || lastSchool || null;
}
