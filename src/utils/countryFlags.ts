// Canonical country-name → flag-emoji map. Source: BBGM `born.loc` plus a
// comprehensive coverage of basketball-playing nations. Add new entries here
// instead of forking another local FLAGS dictionary.

const FLAGS: Record<string, string> = {
  // Europe
  Spain: '🇪🇸', France: '🇫🇷', Germany: '🇩🇪', Italy: '🇮🇹', Greece: '🇬🇷',
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
  USA: '🇺🇸', 'United States': '🇺🇸', America: '🇺🇸',
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

/** Lookup by exact country name (e.g. "Spain", "USA"). */
export const getCountryFlag = (country?: string) => FLAGS[country ?? ''] ?? '🏳️';

/** Lookup by a BBGM-style "City, Country" or bare country string.
 *  Tries the trailing comma segment first, then the whole string. */
export const getFlagForLoc = (loc?: string): string => {
  if (!loc) return '🏳️';
  const trimmed = loc.trim();
  const tail = trimmed.split(',').pop()?.trim() ?? trimmed;
  return FLAGS[tail] ?? FLAGS[trimmed] ?? '🏳️';
};
