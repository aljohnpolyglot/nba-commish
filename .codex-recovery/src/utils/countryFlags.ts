const FLAGS: Record<string, string> = {
  Spain: '🇪🇸',
  Greece: '🇬🇷',
  France: '🇫🇷',
  Germany: '🇩🇪',
  Italy: '🇮🇹',
  Turkey: '🇹🇷',
  Serbia: '🇷🇸',
  Lithuania: '🇱🇹',
  Israel: '🇮🇱',
  Monaco: '🇲🇨',
  UAE: '🇦🇪',
  USA: '🇺🇸',
  Philippines: '🇵🇭',
  China: '🇨🇳',
  Australia: '🇦🇺',
  Japan: '🇯🇵',
};

export const getCountryFlag = (country?: string) => FLAGS[country ?? ''] ?? '🏳️';