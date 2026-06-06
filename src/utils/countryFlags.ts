// Canonical country-name → flag-emoji map. Source: BBGM `born.loc` plus a
// comprehensive coverage of basketball-playing nations. Add new entries here
// instead of forking another local FLAGS dictionary.

const FLAGS: Record<string, string> = {
  // Europe
  Spain: '🇪🇸', Spanish: '🇪🇸', France: '🇫🇷', Germany: '🇩🇪', Italy: '🇮🇹', Greece: '🇬🇷',
  Turkey: '🇹🇷', Serbia: '🇷🇸', Croatia: '🇭🇷', Slovenia: '🇸🇮', Lithuania: '🇱🇹',
  Latvia: '🇱🇻', Estonia: '🇪🇪', Russia: '🇷🇺', Poland: '🇵🇱', Ukraine: '🇺🇦',
  Belarus: '🇧🇾', 'Czech Republic': '🇨🇿', Czechia: '🇨🇿', Slovakia: '🇸🇰',
  Hungary: '🇭🇺', Romania: '🇷🇴', Bulgaria: '🇧🇬', Austria: '🇦🇹', Switzerland: '🇨🇭',
  Netherlands: '🇳🇱', Belgium: '🇧🇪', Luxembourg: '🇱🇺', Denmark: '🇩🇰',
  Sweden: '🇸🇪', Norway: '🇳🇴', Finland: '🇫🇮', Iceland: '🇮🇸', Ireland: '🇮🇪',
  Portugal: '🇵🇹', Bosnia: '🇧🇦', 'Bosnia and Herzegovina': '🇧🇦', Montenegro: '🇲🇪',
  'North Macedonia': '🇲🇰', Macedonia: '🇲🇰', Kosovo: '🇽🇰', Albania: '🇦🇱',
  UK: '🇬🇧', 'United Kingdom': '🇬🇧', England: '🇬🇧', Scotland: '🇬🇧',
  Wales: '🇬🇧', 'Northern Ireland': '🇬🇧', Cyprus: '🇨🇾', Malta: '🇲🇹',
  Israel: '🇮🇱', Monaco: '🇲🇨', Georgia: '🇬🇪', Armenia: '🇦🇲', Azerbaijan: '🇦🇿',

  // Americas
  USA: '🇺🇸', 'United States': '🇺🇸', America: '🇺🇸', American: '🇺🇸',
  Canada: '🇨🇦', Mexico: '🇲🇽', Argentina: '🇦🇷', Brazil: '🇧🇷', Chile: '🇨🇱',
  Uruguay: '🇺🇾', Venezuela: '🇻🇪', Colombia: '🇨🇴', Peru: '🇵🇪',
  'Dominican Republic': '🇩🇴', Jamaica: '🇯🇲', 'Puerto Rico': '🇵🇷',
  Cuba: '🇨🇺', Bahamas: '🇧🇸', Haiti: '🇭🇹', 'US Virgin Islands': '🇻🇮',

  // Africa
  Nigeria: '🇳🇬', Senegal: '🇸🇳', Cameroon: '🇨🇲', 'DR Congo': '🇨🇩',
  'Congo, DR': '🇨🇩', Congo: '🇨🇬', 'Ivory Coast': '🇨🇮', 'Côte d\'Ivoire': '🇨🇮',
  Ghana: '🇬🇭', 'South Africa': '🇿🇦', Egypt: '🇪🇬', Morocco: '🇲🇦', Tunisia: '🇹🇳',
  Algeria: '🇩🇿', Kenya: '🇰🇪', Angola: '🇦🇴', 'South Sudan': '🇸🇸', Sudan: '🇸🇩',
  Mali: '🇲🇱', 'Burkina Faso': '🇧🇫', Guinea: '🇬🇳', Ethiopia: '🇪🇹',

  // Asia / Oceania
  Australia: '🇦🇺', 'New Zealand': '🇳🇿', Japan: '🇯🇵', China: '🇨🇳',
  Taiwan: '🇹🇼', 'South Korea': '🇰🇷', Korea: '🇰🇷', Philippines: '🇵🇭',
  Iran: '🇮🇷', Lebanon: '🇱🇧', Jordan: '🇯🇴', UAE: '🇦🇪',
  'Saudi Arabia': '🇸🇦', India: '🇮🇳', Pakistan: '🇵🇰', Kazakhstan: '🇰🇿',
  Indonesia: '🇮🇩', Vietnam: '🇻🇳', Thailand: '🇹🇭', Malaysia: '🇲🇾',
};

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

export const normalizeNationality = (value?: string): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Unknown';
  const upper = raw.toUpperCase();
  const codePlusCountry = raw.match(/^[A-Z]{2}\s+(.+)$/);
  if (codePlusCountry?.[1]) return normalizeNationality(codePlusCountry[1]);
  const adjectiveAliases: Record<string, string> = {
    BRAZILIAN: 'Brazil',
    DOMINICAN: 'Dominican Republic',
    FRENCH: 'France',
    GERMAN: 'Germany',
    ITALIAN: 'Italy',
    GREEK: 'Greece',
    TURKISH: 'Turkey',
    SERBIAN: 'Serbia',
    CROATIAN: 'Croatia',
    SLOVENIAN: 'Slovenia',
    LITHUANIAN: 'Lithuania',
    LATVIAN: 'Latvia',
    ESTONIAN: 'Estonia',
    RUSSIAN: 'Russia',
    SPANISH: 'Spain',
    FILIPINO: 'Philippines',
    CANADIAN: 'Canada',
  };
  if (upper === 'USA' || upper === 'US' || upper === 'U.S.A.' || upper === 'U.S.' || upper === 'AMERICA' || upper === 'UNITED STATES' || upper === 'UNITED STATES OF AMERICA' || US_STATE_CODES.has(upper)) {
    return 'American';
  }
  if (upper === 'BR') return 'Brazil';
  if (upper === 'DO') return 'Dominican Republic';
  if (upper === 'PH') return 'Philippines';
  if (upper === 'ES') return 'Spain';
  if (upper === 'FR') return 'France';
  if (adjectiveAliases[upper]) return adjectiveAliases[upper];
  return raw;
};

/** Lookup by exact country name (e.g. "Spain", "USA"). */
export const getCountryFlag = (country?: string) => {
  const normalized = normalizeNationality(country);
  return FLAGS[normalized] ?? FLAGS[country ?? ''] ?? '🏳️';
};

/** Lookup by a BBGM-style "City, Country" or bare country string.
 *  Tries the trailing comma segment first, then the whole string. */
export const getFlagForLoc = (loc?: string): string => {
  if (!loc) return '🏳️';
  const trimmed = loc.trim();
  const tail = trimmed.split(',').pop()?.trim() ?? trimmed;
  return FLAGS[tail] ?? FLAGS[trimmed] ?? '🏳️';
};
