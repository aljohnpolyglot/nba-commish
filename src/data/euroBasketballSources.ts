export type EuroBasketballSourceKind = 'domestic' | 'cross-border';

export interface EuroBasketballSourceDescriptor {
  id: string;
  kind: EuroBasketballSourceKind;
  leagueId: string;
  competitionId: string;
  countryCode?: string;
  coverageStart: number;
  coverageThrough: number;
  teamTidOffset: number;
  rosterUrl: string;
  archivePath: string;
  identityNamespace: string;
  leagueStatus: string;
  displayName: string;
  shortName: string;
  accentColor: string;
  sourceVersion?: string;
}

export const EUROLEAGUE_2026_SOURCE: EuroBasketballSourceDescriptor = {
  id: 'realgm-euroleague-2026-v1',
  kind: 'cross-border',
  leagueId: 'euroleague',
  competitionId: 'euroleague',
  coverageStart: 2001,
  coverageThrough: 2026,
  teamTidOffset: 1000,
  rosterUrl: '/data/external/euroleague/euroleague-2026-bbgm.json',
  archivePath: 'data/sources/euroleague/euroleague-2026-realgm-source.json',
  identityNamespace: 'euro-realgm',
  leagueStatus: 'Euroleague',
  displayName: 'EuroLeague',
  shortName: 'EL',
  accentColor: '#F77F00',
};

export const EURO_BASKETBALL_SOURCE_ARCHIVES: readonly EuroBasketballSourceDescriptor[] = [
  {
    id: 'realgm-french-jeep-elite-2026-v1',
    kind: 'domestic',
    leagueId: 'french-jeep-elite',
    competitionId: 'french-jeep-elite',
    countryCode: 'FR',
    coverageStart: 2005,
    coverageThrough: 2026,
    teamTidOffset: 13000,
    rosterUrl: '/data/external/french-jeep-elite/french-jeep-elite-2026-bbgm.json',
    archivePath: 'data/sources/french-jeep-elite/french-jeep-elite-2026-realgm-source.json',
    identityNamespace: 'french-jeep-elite-realgm',
    leagueStatus: 'France Elite',
    displayName: 'Betclic Élite',
    shortName: 'FRA-1',
    accentColor: '#2563EB',
  },
  {
    id: 'realgm-italian-serie-a-2026-v1',
    kind: 'domestic',
    leagueId: 'italian-serie-a',
    competitionId: 'italian-serie-a',
    countryCode: 'IT',
    coverageStart: 2004,
    coverageThrough: 2026,
    teamTidOffset: 8000,
    rosterUrl: '/data/external/italian-serie-a/italian-lega-basket-serie-a-2026-bbgm.json',
    archivePath: 'data/sources/italian-serie-a/italian-lega-basket-serie-a-2026-realgm-source.json',
    identityNamespace: 'italian-serie-a-realgm',
    leagueStatus: 'Italy Serie A',
    displayName: 'Lega Basket Serie A',
    shortName: 'LBA',
    accentColor: '#16A34A',
  },
  {
    id: 'realgm-german-bbl-2026-v1',
    kind: 'domestic',
    leagueId: 'german-bbl',
    competitionId: 'german-bbl',
    countryCode: 'DE',
    coverageStart: 2004,
    coverageThrough: 2026,
    teamTidOffset: 9000,
    rosterUrl: '/data/external/german-bbl/german-bbl-2026-bbgm.json',
    archivePath: 'data/sources/german-bbl/german-bbl-2026-realgm-source.json',
    identityNamespace: 'german-bbl-realgm',
    leagueStatus: 'Germany BBL',
    displayName: 'Basketball Bundesliga',
    shortName: 'BBL',
    accentColor: '#F59E0B',
  },
  {
    id: 'realgm-greek-heba-a1-2026-v1',
    kind: 'domestic',
    leagueId: 'greek-heba-a1',
    competitionId: 'greek-heba-a1',
    countryCode: 'GR',
    coverageStart: 2012,
    coverageThrough: 2026,
    teamTidOffset: 6000,
    rosterUrl: '/data/external/greek-heba-a1/greek-heba-a1-2026-bbgm.json',
    archivePath: 'data/sources/greek-heba-a1/greek-heba-a1-2026-realgm-source.json',
    identityNamespace: 'greek-heba-a1-realgm',
    leagueStatus: 'Greece A1',
    displayName: 'Greek Basket League',
    shortName: 'GBL',
    accentColor: '#0EA5E9',
  },
  {
    id: 'realgm-turkish-bsl-2026-v1',
    kind: 'domestic',
    leagueId: 'turkish-bsl',
    competitionId: 'turkish-bsl',
    countryCode: 'TR',
    coverageStart: 2012,
    coverageThrough: 2026,
    teamTidOffset: 7000,
    rosterUrl: '/data/external/turkish-bsl/turkish-bsl-2026-bbgm.json',
    archivePath: 'data/sources/turkish-bsl/turkish-bsl-2026-realgm-source.json',
    identityNamespace: 'turkish-bsl-realgm',
    leagueStatus: 'Turkey BSL',
    displayName: 'Basketbol Süper Ligi',
    shortName: 'BSL',
    accentColor: '#DC2626',
  },
  {
    id: 'realgm-lithuanian-lkl-2026-v1',
    kind: 'domestic',
    leagueId: 'lithuanian-lkl',
    competitionId: 'lithuanian-lkl',
    countryCode: 'LT',
    coverageStart: 2012,
    coverageThrough: 2026,
    teamTidOffset: 10000,
    rosterUrl: '/data/external/lithuanian-lkl/lithuanian-lkl-2026-bbgm.json',
    archivePath: 'data/sources/lithuanian-lkl/lithuanian-lkl-2026-realgm-source.json',
    identityNamespace: 'lithuanian-lkl-realgm',
    leagueStatus: 'Lithuania LKL',
    displayName: 'Lietuvos Krepšinio Lyga',
    shortName: 'LKL',
    accentColor: '#059669',
  },
  {
    id: 'realgm-israeli-bsl-2026-v1',
    kind: 'domestic',
    leagueId: 'israeli-bsl',
    competitionId: 'israeli-bsl',
    countryCode: 'IL',
    coverageStart: 2012,
    coverageThrough: 2026,
    teamTidOffset: 11000,
    rosterUrl: '/data/external/israeli-bsl/israeli-bsl-2026-bbgm.json',
    archivePath: 'data/sources/israeli-bsl/israeli-bsl-2026-realgm-source.json',
    identityNamespace: 'israeli-bsl-realgm',
    leagueStatus: 'Israel BSL',
    displayName: 'Israeli Basketball Premier League',
    shortName: 'ISBL',
    accentColor: '#3B82F6',
  },
  {
    id: 'realgm-vtb-united-league-2026-v1',
    kind: 'cross-border',
    leagueId: 'vtb-united-league',
    competitionId: 'vtb-united-league',
    coverageStart: 2012,
    coverageThrough: 2026,
    teamTidOffset: 12000,
    rosterUrl: '/data/external/vtb-united-league/vtb-united-league-2026-bbgm.json',
    archivePath: 'data/sources/vtb-united-league/vtb-united-league-2026-realgm-source.json',
    identityNamespace: 'vtb-united-league-realgm',
    leagueStatus: 'VTB',
    displayName: 'VTB United League',
    shortName: 'VTB',
    accentColor: '#7C3AED',
  },
  {
    id: 'realgm-adriatic-league-2026-v1',
    kind: 'cross-border',
    leagueId: 'adriatic-league',
    competitionId: 'adriatic-league',
    coverageStart: 2012,
    coverageThrough: 2026,
    teamTidOffset: 14000,
    rosterUrl: '/data/external/adriatic-league/adriatic-league-liga-aba-2026-bbgm.json',
    archivePath: 'data/sources/adriatic-league/adriatic-league-liga-aba-2026-realgm-source.json',
    identityNamespace: 'adriatic-league-realgm',
    leagueStatus: 'ABA',
    displayName: 'ABA League',
    shortName: 'ABA',
    accentColor: '#E11D48',
  },
  {
    id: 'realgm-eurocup-2026-v1',
    kind: 'cross-border',
    leagueId: 'eurocup',
    competitionId: 'eurocup',
    coverageStart: 2003,
    coverageThrough: 2026,
    teamTidOffset: 15000,
    rosterUrl: '/data/external/eurocup/eurocup-2026-bbgm.json',
    archivePath: 'data/sources/eurocup/eurocup-2026-realgm-source.json',
    identityNamespace: 'eurocup-realgm',
    leagueStatus: 'EuroCup',
    displayName: 'EuroCup',
    shortName: 'EC',
    accentColor: '#F59E0B',
  },
] as const;

export type EuroDomesticMarket = 'france' | 'italy' | 'germany' | 'greece' | 'turkey' | 'lithuania' | 'israel' | 'russia' | 'serbia';

export const EURO_DOMESTIC_SOURCE_BY_MARKET: Record<EuroDomesticMarket, EuroBasketballSourceDescriptor> = {
  france: EURO_BASKETBALL_SOURCE_ARCHIVES[0],
  italy: EURO_BASKETBALL_SOURCE_ARCHIVES[1],
  germany: EURO_BASKETBALL_SOURCE_ARCHIVES[2],
  greece: EURO_BASKETBALL_SOURCE_ARCHIVES[3],
  turkey: EURO_BASKETBALL_SOURCE_ARCHIVES[4],
  lithuania: EURO_BASKETBALL_SOURCE_ARCHIVES[5],
  israel: EURO_BASKETBALL_SOURCE_ARCHIVES[6],
  russia: EURO_BASKETBALL_SOURCE_ARCHIVES[7],
  serbia: EURO_BASKETBALL_SOURCE_ARCHIVES[8],
};

export function getEuroDomesticSourceForMarket(market?: string): EuroBasketballSourceDescriptor | null {
  return EURO_DOMESTIC_SOURCE_BY_MARKET[market as EuroDomesticMarket] ?? null;
}

export function resolveEuroBasketballSourceSeason(
  source: EuroBasketballSourceDescriptor,
  requestedSeason?: number,
): number | null {
  if (!Number.isFinite(requestedSeason)) return source.coverageThrough;
  const season = Math.trunc(requestedSeason!);
  if (season < source.coverageStart) return null;
  return Math.min(source.coverageThrough, season);
}
