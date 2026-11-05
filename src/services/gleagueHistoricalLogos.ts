export const G_LEAGUE_LOGO_SOURCE = {
  revision: 'f8083030235ea4c3684969c18f27d7d9407825d7',
  path: 'nba_g_league_logos (1).json',
  url: 'https://github.com/aljohnpolyglot/nba-store-data/blob/f8083030235ea4c3684969c18f27d7d9407825d7/nba_g_league_logos%20(1).json',
} as const;

type HistoricalLogo = {
  start: number;
  end: number;
  url: string;
};

const LOGOS: Partial<Record<string, HistoricalLogo[]>> = {
  albuquerque: [{
    start: 2005,
    end: 2010,
    url: 'https://static.wikia.nocookie.net/logopedia/images/2/28/Albuquerque_Thunderbirds.webp/revision/latest?cb=20251020113153',
  }],
  asheville: [{
    start: 2001,
    end: 2004,
    url: 'https://static.wikia.nocookie.net/logopedia/images/9/97/Ashevillealtitude20012004.png/revision/latest?cb=20260127190251',
  }],
  austin: [
    {
      start: 2005,
      end: 2007,
      url: 'https://static.wikia.nocookie.net/logopedia/images/4/47/Austin_Toros_logo_%282005-2007%29.png/revision/latest?cb=20131014193539',
    },
    {
      start: 2008,
      end: 2015,
      url: 'https://static.wikia.nocookie.net/logopedia/images/0/08/Austin_Toros_logo.svg/revision/latest?cb=20131014193605',
    },
  ],
  bakersfield: [{
    start: 2007,
    end: 2016,
    url: 'https://static.wikia.nocookie.net/logopedia/images/7/71/Bakersfield_Jam_logo.svg/revision/latest?cb=20131014193052',
  }],
  colorado: [{
    start: 2006,
    end: 2009,
    url: 'https://static.wikia.nocookie.net/logopedia/images/2/28/Colorado_14ers_Logo.gif/revision/latest?cb=20250601153926',
  }],
  columbus: [{
    start: 2001,
    end: 2004,
    url: 'https://static.wikia.nocookie.net/logopedia/images/b/b2/Columbusriverdragons20012004.png/revision/latest?cb=20260127185906',
  }],
  dakota: [{
    start: 2005,
    end: 2008,
    url: 'https://static.wikia.nocookie.net/logopedia/images/8/82/Dakota_Wizards_Logo_%282005%29.gif/revision/latest?cb=20250627011425',
  }],
  huntsville: [{
    start: 2001,
    end: 2005,
    url: 'https://static.wikia.nocookie.net/logopedia/images/c/c6/Huntsville_Flight.webp/revision/latest?cb=20251020113257',
  }],
  losAngeles: [{
    start: 2006,
    end: 2017,
    url: 'https://static.wikia.nocookie.net/logopedia/images/f/fd/Los_Angeles_D-Fenders_logo.svg/revision/latest?cb=20131014204136',
  }],
  tulsa: [
    {
      start: 2005,
      end: 2007,
      url: 'https://static.wikia.nocookie.net/logopedia/images/2/25/Tulsa_66ers_logo_%282005-2007%29.png/revision/latest?cb=20131014211517',
    },
    {
      start: 2008,
      end: 2010,
      url: 'https://static.wikia.nocookie.net/logopedia/images/3/3b/Tulsa_66ers_logo_%282007-2009%29.png/revision/latest?cb=20131014211540',
    },
  ],
};

export function getPinnedHistoricalGLeagueLogo(teamKey: string, season: number): string | undefined {
  return LOGOS[teamKey]?.find(row => season >= row.start && season <= row.end)?.url;
}
