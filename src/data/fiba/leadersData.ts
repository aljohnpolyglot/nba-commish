export interface LeaderPlayer {
  id: string;
  playerId?: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  countryFlagId: string;
  countryFlagUrl?: string;
  value: string;
}

export interface LeaderCategory {
  title: string;
  subtitle: string;
  players: LeaderPlayer[];
}

export const leadersData: LeaderCategory[] = [
  {
    title: 'Efficiency',
    subtitle: 'PER GAME',
    players: [
      { id: 'eff-1', firstName: 'Guna', lastName: 'RA', countryCode: 'KOR', countryFlagId: '89', value: '26.4' },
      { id: 'eff-2', firstName: 'Corey', lastName: 'Webster', countryCode: 'NZL', countryFlagId: '113', value: '25.6' },
      { id: 'eff-3', firstName: 'Salah', lastName: 'Mejri', countryCode: 'TUN', countryFlagId: '151', value: '25.2' },
    ]
  },
  {
    title: 'Points',
    subtitle: 'PER GAME',
    players: [
      { id: 'pts-1', firstName: 'Guna', lastName: 'RA', countryCode: 'KOR', countryFlagId: '89', value: '23.0' },
      { id: 'pts-2', firstName: 'Bogdan', lastName: 'Bogdanovic', countryCode: 'SRB', countryFlagId: '8323', value: '22.9' },
      { id: 'pts-3', firstName: 'Corey', lastName: 'Webster', countryCode: 'NZL', countryFlagId: '113', value: '22.8' },
    ]
  },
  {
    title: 'Rebounds',
    subtitle: 'PER GAME',
    players: [
      { id: 'reb-1', firstName: 'Guna', lastName: 'RA', countryCode: 'KOR', countryFlagId: '89', value: '12.8' },
      { id: 'reb-2', firstName: 'Hamed', lastName: 'Haddadi', countryCode: 'IRI', countryFlagId: '91', value: '10.8' },
      { id: 'reb-3', firstName: 'Salah', lastName: 'Mejri', countryCode: 'TUN', countryFlagId: '151', value: '10.2' },
    ]
  },
  {
    title: 'Assists',
    subtitle: 'PER GAME',
    players: [
      { id: 'ast-1', firstName: 'Dennis', lastName: 'Schroder', countryCode: 'GER', countryFlagId: '63', value: '9.4' },
      { id: 'ast-2', firstName: 'Tomas', lastName: 'Satoransky', countryCode: 'CZE', countryFlagId: '886', value: '8.5' },
      { id: 'ast-3', firstName: 'Facundo', lastName: 'Campazzo', countryCode: 'ARG', countryFlagId: '14', value: '7.8' },
    ]
  },
  {
    title: 'Steals',
    subtitle: 'PER GAME',
    players: [
      { id: 'stl-1', firstName: 'Omar', lastName: 'Abada', countryCode: 'TUN', countryFlagId: '151', value: '2.6' },
      { id: 'stl-2', firstName: 'Josh', lastName: 'Okogie', countryCode: 'NGR', countryFlagId: '119', value: '2.4' },
      { id: 'stl-3', firstName: 'Andray', lastName: 'Blatche', countryCode: 'PHI', countryFlagId: '122', value: '2.4' },
    ]
  },
  {
    title: 'Blocks',
    subtitle: 'PER GAME',
    players: [
      { id: 'blk-1', firstName: 'Salah', lastName: 'Mejri', countryCode: 'TUN', countryFlagId: '151', value: '3.2' },
      { id: 'blk-2', firstName: 'Rudy', lastName: 'Gobert', countryCode: 'FRA', countryFlagId: '59', value: '1.9' },
      { id: 'blk-3', firstName: 'Maximilian', lastName: 'Kleber', countryCode: 'GER', countryFlagId: '63', value: '1.9' },
    ]
  }
];
