export interface ExternalLeaguePresentation {
  name: string;
  longName: string;
  description: string;
  logo: string;
}

export const EXTERNAL_LEAGUE_PRESENTATION: ExternalLeaguePresentation[] = [
  {
    name: 'WNBA',
    longName: "Women's National Basketball Association",
    description: 'Elite women’s professional basketball.',
    logo: 'https://content.sportslogos.net/logos/16/1152/full/6613__wnba-alternate-2020.png',
  },
  {
    name: 'G-League',
    longName: 'NBA G League',
    description: 'NBA development league.',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/NBA_G_League_logo.svg/1280px-NBA_G_League_logo.svg.png',
  },
  {
    name: 'Euroleague',
    longName: 'EuroLeague',
    description: 'Top-tier European club competition.',
    logo: 'https://r2.thesportsdb.com/images/media/league/badge/7xjtuy1554397263.png',
  },
  {
    name: 'PBA',
    longName: 'Philippine Basketball Association',
    description: 'Premier professional league in the Philippines.',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/dd/Philippine_Basketball_Association_%28logo%29.svg/1280px-Philippine_Basketball_Association_%28logo%29.svg.png',
  },
  {
    name: 'B-League',
    longName: 'B.League',
    description: 'Japan’s professional basketball league.',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/B.LEAGUE_Logo.svg/1280px-B.LEAGUE_Logo.svg.png',
  },
  {
    name: 'Endesa',
    longName: 'Liga Endesa',
    description: 'Spain’s top professional basketball league.',
    logo: 'https://r2.thesportsdb.com/images/media/league/badge/9i99ii1549879285.png',
  },
  {
    name: 'China CBA',
    longName: 'Chinese Basketball Association',
    description: 'China’s top professional basketball league.',
    logo: 'https://upload.wikimedia.org/wikipedia/en/b/b9/CBAlogo.svg',
  },
  {
    name: 'NBL Australia',
    longName: 'National Basketball League',
    description: 'Australia and New Zealand’s premier league.',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c9/NBL_logo.svg/1280px-NBL_logo.svg.png',
  },
];
