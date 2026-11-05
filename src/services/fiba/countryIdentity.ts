const COUNTRY_ALIASES: Record<string, string> = {
  american: 'United States',
  america: 'United States',
  us: 'United States',
  usa: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'united states of america': 'United States',
  guadeloupe: 'France',
  martinique: 'France',
  'french guiana': 'France',
  guyane: 'France',
  reunion: 'France',
  'réunion': 'France',
  mayotte: 'France',
  'saint martin': 'France',
  'saint barthelemy': 'France',
  'saint barthélemy': 'France',
  'saint pierre and miquelon': 'France',
  'new caledonia': 'France',
  'french polynesia': 'France',
  tahiti: 'France',
  'wallis and futuna': 'France',
  'czech republic': 'Czechia',
  korea: 'Korea Republic',
  'south korea': 'Korea Republic',
  'republic of korea': 'Korea Republic',
  'ivory coast': 'Côte d’Ivoire',
  "cote d'ivoire": 'Côte d’Ivoire',
  'côte d’ivoire': 'Côte d’Ivoire',
  'federal republic of yugoslavia': 'FR Yugoslavia',
  'republic of north macedonia': 'North Macedonia',
};

const EUROBASKET_COUNTRIES = new Set([
  'Albania',
  'Armenia',
  'Austria',
  'Azerbaijan',
  'Belarus',
  'Belgium',
  'Bosnia',
  'Bosnia and Herzegovina',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Czech Republic',
  'Czechia',
  'Czechoslovakia',
  'Denmark',
  'East Germany',
  'England',
  'Estonia',
  'Finland',
  'FR Yugoslavia',
  'France',
  'Georgia',
  'Germany',
  'Great Britain',
  'Greece',
  'Hungary',
  'Iceland',
  'Ireland',
  'Israel',
  'Italy',
  'Kosovo',
  'Latvia',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Moldova',
  'Monaco',
  'Montenegro',
  'Netherlands',
  'North Macedonia',
  'Norway',
  'Poland',
  'Portugal',
  'Romania',
  'Russia',
  'Scotland',
  'Serbia',
  'Serbia and Montenegro',
  'Slovakia',
  'Slovenia',
  'Soviet Union',
  'Spain',
  'Sweden',
  'Switzerland',
  'Turkey',
  'Ukraine',
  'United Kingdom',
  'Wales',
  'West Germany',
  'Yugoslavia',
]);

function identityKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
}

export function canonicalFibaCountry(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return COUNTRY_ALIASES[identityKey(raw)] ?? raw;
}

export function resolveFibaCountryForYear(value: unknown, year: number): string | undefined {
  const country = canonicalFibaCountry(value);
  if (!country) return undefined;
  if (country === 'Yugoslavia') {
    if (year <= 1992) return country;
    return year <= 2002 ? 'FR Yugoslavia' : undefined;
  }
  if (country === 'FR Yugoslavia') return year >= 1992 && year <= 2002 ? country : undefined;
  if (country === 'Serbia and Montenegro') {
    if (year <= 2002) return 'FR Yugoslavia';
    return year <= 2006 ? country : undefined;
  }
  if (country === 'Serbia' || country === 'Montenegro') return year >= 2007 ? country : undefined;
  if (country === 'Russia') return year >= 1992 ? country : undefined;
  if (country === 'Unified Team') return year === 1992 ? country : undefined;
  if (country === 'Soviet Union') return year <= 1991 ? country : undefined;
  return country;
}

export function isEuroBasketCountry(value: unknown): boolean {
  return EUROBASKET_COUNTRIES.has(canonicalFibaCountry(value));
}

export function normalizeFibaPersonName(value: unknown): string {
  const normalized = String(value ?? '')
    .replace(/\s+\d{4}\s*[–—-]\s*\d{4}\s*$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’]/g, "'")
    .replace(/[^a-zA-Z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return {
    'giorgi tsintsadze': 'george tsintsadze',
    'jim alapag': 'jimmy alapag',
    'jianlian yi': 'yi jianlian',
    'matt dellavedova': 'matthew dellavedova',
    'nene hilario': 'nene',
  }[normalized] ?? normalized;
}
