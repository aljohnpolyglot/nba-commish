import { PHILIPPINE_COLLEGE_POOL } from '../../data/philippineCollegePool';

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\(ph\)/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const initials = (value: string) => value
  .split(/\s+/)
  .filter(word => !['of', 'the', 'de', 'la'].includes(word.toLowerCase()))
  .map(word => word[0])
  .join('')
  .toUpperCase();

const lookup = (() => {
  const values = new Map<string, string | null>();
  const add = (alias: string, canonical: string) => {
    const key = normalize(alias);
    if (!key) return;
    const existing = values.get(key);
    if (existing && existing !== canonical) values.set(key, null);
    else if (!values.has(key)) values.set(key, canonical);
  };
  for (const canonical of Object.keys(PHILIPPINE_COLLEGE_POOL)) {
    add(canonical, canonical);
    add(initials(canonical), canonical);
    add(canonical.replace(/^University of (?:the )?/i, ''), canonical);
    add(canonical.replace(/ University$/i, ''), canonical);
    add(canonical.replace(/ University$/i, ' U'), canonical);
    if (!/University/i.test(canonical)) add(`${canonical} University`, canonical);
    const firstWord = canonical.split(/\s+/)[0];
    if (firstWord.length >= 5 && !/^University$/i.test(firstWord)) add(firstWord, canonical);
  }
  return values;
})();

export function getPhilippineCollegeLabel(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const canonical = lookup.get(normalize(raw));
  if (!canonical) return null;
  const acronym = initials(canonical);
  const compactInput = raw.replace(/\(PH\)/gi, '').replace(/\s+/g, '').trim();
  const compact = /^[A-Z]{2,6}$/.test(compactInput) ? acronym : canonical;
  return `${compact} (PH)`;
}
