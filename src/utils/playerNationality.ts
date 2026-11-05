import { getCountryFlagCode, normalizeNationality } from './countryFlags';
import { getCountryCode } from './helpers';

type PlayerCountrySource = {
  nationality?: unknown;
  born?: { country?: unknown; loc?: string };
};

const COUNTRY_ALIASES: Record<string, string> = {
  american: 'United States',
  américain: 'United States',
  américaine: 'United States',
  america: 'United States',
  usa: 'United States',
  'ee.uu.': 'United States',
  'estados unidos': 'United States',
  estadounidense: 'United States',
  'états-unis': 'United States',
  'stati uniti': 'United States',
  'united states of america': 'United States',
  spanish: 'Spain',
  española: 'Spain',
  italian: 'Italy',
  italiana: 'Italy',
  italia: 'Italy',
  greek: 'Greece',
  griega: 'Greece',
  french: 'France',
  française: 'France',
  german: 'Germany',
  alemana: 'Germany',
  deutschland: 'Germany',
  british: 'United Kingdom',
  británico: 'United Kingdom',
  english: 'United Kingdom',
  galles: 'United Kingdom',
  irish: 'Ireland',
  turkish: 'Turkey',
  turca: 'Turkey',
  australian: 'Australia',
  australiana: 'Australia',
  canadian: 'Canada',
  ontario: 'Canada',
  on: 'Canada',
  quebec: 'Canada',
  qc: 'Canada',
  'british columbia': 'Canada',
  bc: 'Canada',
  alberta: 'Canada',
  ab: 'Canada',
  manitoba: 'Canada',
  mb: 'Canada',
  saskatchewan: 'Canada',
  sk: 'Canada',
  'nova scotia': 'Canada',
  ns: 'Canada',
  'new brunswick': 'Canada',
  nb: 'Canada',
  'newfoundland and labrador': 'Canada',
  nl: 'Canada',
  'prince edward island': 'Canada',
  pe: 'Canada',
  yukon: 'Canada',
  yt: 'Canada',
  'northwest territories': 'Canada',
  nt: 'Canada',
  nunavut: 'Canada',
  nu: 'Canada',
  austrian: 'Austria',
  danish: 'Denmark',
  israélien: 'Israel',
  mexican: 'Mexico',
  'rep. dominicana': 'Dominican Republic',
  'rep. ceca': 'Czech Republic',
  'kingdom of the netherlands': 'Netherlands',
  'kingdom of denmark': 'Denmark',
  'the bahamas': 'Bahamas',
  bosnia: 'Bosnia and Herzegovina',
  czechia: 'Czech Republic',
  'congo, dr': 'Democratic Republic of the Congo',
  'dr congo': 'Democratic Republic of the Congo',
  'côte d\'ivoire': 'Ivory Coast',
  swaziland: 'Eswatini',
  'republic of north macedonia': 'North Macedonia',
};

const MISSING_COUNTRY_VALUES = new Set(['-', '—', '0', 'n/a', 'na', 'none', 'null', 'undefined', 'unknown']);

function canonicalCountry(value: string): string {
  const normalized = normalizeNationality(value).trim();
  return COUNTRY_ALIASES[normalized.toLowerCase()] ?? normalized;
}

function isKnownCountry(value: string): boolean {
  return !!getCountryCode(value) || !!getCountryFlagCode(value) || value === 'Eswatini';
}

export function parsePlayerCountryValue(value: unknown, locationFallback = false): string[] {
  if (Array.isArray(value)) return value.flatMap(item => parsePlayerCountryValue(item, locationFallback));
  const raw = String(value ?? '').trim();
  if (!raw || MISSING_COUNTRY_VALUES.has(raw.toLowerCase())) return [];

  const explicitCountry = raw.match(/(?:^|[-–—,;|])\s*country\s*:\s*(.+)$/i)?.[1];
  if (explicitCountry) {
    const countries = parsePlayerCountryValue(explicitCountry);
    if (countries.length > 0) return countries;
  }

  const compound = raw.split(/\s*(?:\/|;|\|)\s*/).filter(Boolean);
  if (compound.length > 1) return [...new Set(compound.flatMap(item => parsePlayerCountryValue(item, locationFallback)))];

  const whole = canonicalCountry(raw);
  if (isKnownCountry(whole)) return [whole];

  const connected = raw.split(/\s+(?:and|y|e|et)\s+/i).filter(Boolean);
  if (connected.length > 1) {
    const countries = connected.flatMap(item => parsePlayerCountryValue(item, locationFallback));
    if (countries.length > 0) return [...new Set(countries)];
  }

  if (raw.includes(',')) {
    const tail = canonicalCountry(raw.split(',').pop() ?? '');
    if (isKnownCountry(tail)) return [tail];
  }

  return locationFallback || whole === 'Unknown' ? [] : [whole];
}

export function getPlayerNationalityCountries(player: PlayerCountrySource, fallback?: unknown): string[] {
  const explicit = [
    ...parsePlayerCountryValue(player.nationality),
    ...parsePlayerCountryValue(player.born?.country),
  ];
  const resolved = explicit.length > 0
    ? explicit
    : [
        ...parsePlayerCountryValue(player.born?.loc, true),
        ...parsePlayerCountryValue(fallback),
      ];
  return [...new Set(resolved.filter(country => country && country !== 'Unknown'))];
}

export function getPrimaryPlayerCountry(player: PlayerCountrySource, fallback?: unknown): string {
  return getPlayerNationalityCountries(player, fallback)[0] ?? 'Unknown';
}
