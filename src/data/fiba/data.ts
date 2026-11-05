import { Team } from './types';

export const topThree: Team[] = [
  { rank: 1, name: 'Spain', code: 'ESP', flagId: '138' },
  { rank: 2, name: 'Argentina', code: 'ARG', flagId: '14' },
  { rank: 3, name: 'France', code: 'FRA', flagId: '59' },
];

export const standings: Team[] = [
  { rank: 4, name: 'Australia', flagId: '16' },
  { rank: 5, name: 'Serbia', flagId: '8323' },
  { rank: 6, name: 'Czech Republic', flagId: '886' },
  { rank: 7, name: 'USA', flagId: '154' },
  { rank: 8, name: 'Poland', flagId: '123' },
  { rank: 9, name: 'Lithuania', flagId: '611' },
  { rank: 10, name: 'Italy', flagId: '83' },
  { rank: 11, name: 'Greece', flagId: '67' },
  { rank: 12, name: 'Russia', flagId: '156' },
  { rank: 13, name: 'Brazil', flagId: '27' },
  { rank: 14, name: 'Venezuela', flagId: '158' },
  { rank: 15, name: 'Puerto Rico', flagId: '125' },
  { rank: 16, name: 'Dominican Republic', flagId: '51' },
  { rank: 17, name: 'Nigeria', flagId: '116' },
  { rank: 18, name: 'Germany', flagId: '64' },
  { rank: 19, name: 'New Zealand', flagId: '113' },
  { rank: 20, name: 'Tunisia', flagId: '151' },
  { rank: 21, name: 'Canada', flagId: '34' },
  { rank: 22, name: 'Turkey', flagId: '152' },
  { rank: 23, name: 'Iran', flagId: '879' },
  { rank: 24, name: 'China', flagId: '39' },
  { rank: 25, name: 'Montenegro', flagId: '8310' },
  { rank: 26, name: 'Korea', flagId: '89' },
  { rank: 27, name: 'Angola', flagId: '12' },
  { rank: 28, name: 'Jordan', flagId: '86' },
  { rank: 29, name: "Côte d'Ivoire", flagId: '44' },
  { rank: 30, name: 'Senegal', flagId: '134' },
  { rank: 31, name: 'Japan', flagId: '85' },
  { rank: 32, name: 'Philippines', flagId: '122' },
];

const FLAG_ISO_BY_FIBA_CODE: Record<string, string> = {
  ALB: 'al', ALG: 'dz', ANG: 'ao', ARG: 'ar', AUS: 'au', BEL: 'be', BIH: 'ba',
  BRA: 'br', BUL: 'bg', CAN: 'ca', CPV: 'cv', CHI: 'cn', CIV: 'ci', CRO: 'hr',
  CZE: 'cz', DOM: 'do', EGY: 'eg', FIN: 'fi', FRA: 'fr', GEO: 'ge', GER: 'de',
  GRE: 'gr', IRI: 'ir', ISR: 'il', ITA: 'it', JPN: 'jp', JOR: 'jo', KOR: 'kr',
  LAT: 'lv', LBN: 'lb', LTU: 'lt', MEX: 'mx', MKD: 'mk', MON: 'me', MNE: 'me',
  NED: 'nl', NEZ: 'nz', NGR: 'ng', NZL: 'nz', PHI: 'ph', POL: 'pl', POR: 'pt',
  PUR: 'pr', ROU: 'ro', RUS: 'ru', SEN: 'sn', SER: 'rs', SLO: 'si', SRB: 'rs',
  SSD: 'ss', SPA: 'es', ESP: 'es', SWE: 'se', TUN: 'tn', TUR: 'tr', UKR: 'ua',
  SOS: 'ss', URU: 'uy', USA: 'us', VEN: 've',
};

export const getFlagUrl = (id: string, teamCode?: string) => {
  if (id) return `https://assets.fiba.basketball/image/upload/w_200/f_auto/q_auto/.logoflag--light--organisation_${id}?buster=20650`;
  const iso = FLAG_ISO_BY_FIBA_CODE[String(teamCode ?? '').toUpperCase()];
  return iso ? `https://flagcdn.com/w80/${iso}.png` : '';
};
