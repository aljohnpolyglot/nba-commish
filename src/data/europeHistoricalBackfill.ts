import type { EuroBasketballSourceDescriptor } from './euroBasketballSources';

export type EuropeHistoricalBackfillMarket = 'spain' | 'france' | 'italy' | 'germany' | 'greece' | 'turkey';

const DATA_ROOT = '/data/historical/europe-backfill-v1';

export const EUROPE_HISTORICAL_BACKFILL_VERSION = 'europe-historical-v1-2026-08-09';

export const EUROPE_HISTORICAL_BACKFILL_BY_MARKET: Record<
  EuropeHistoricalBackfillMarket,
  EuroBasketballSourceDescriptor
> = {
  spain: {
    id: 'europe-historical-esp-acb-v1',
    kind: 'domestic',
    leagueId: 'endesa',
    competitionId: 'endesa',
    countryCode: 'ES',
    coverageStart: 1984,
    coverageThrough: 2003,
    teamTidOffset: 5000,
    rosterUrl: `${DATA_ROOT}/europe-ESP-ACB-BBGM-RATED-V1.json.gz`,
    archivePath: 'referenceactions/europe-ESP-ACB-BBGM-RATED-V1-2026-08-09T13-28-09-294Z.json.gz',
    identityNamespace: 'europe-historical-esp-acb',
    leagueStatus: 'Endesa',
    displayName: 'Liga ACB',
    shortName: 'ACB',
    accentColor: '#E8590C',
    sourceVersion: EUROPE_HISTORICAL_BACKFILL_VERSION,
  },
  france: {
    id: 'europe-historical-fra-lnb-v1',
    kind: 'domestic',
    leagueId: 'french-jeep-elite',
    competitionId: 'french-jeep-elite',
    countryCode: 'FR',
    coverageStart: 1988,
    coverageThrough: 2004,
    teamTidOffset: 13000,
    rosterUrl: `${DATA_ROOT}/europe-FRA-LNB-BBGM-RATED-V1.json.gz`,
    archivePath: 'referenceactions/europe-FRA-LNB-BBGM-RATED-V1-2026-08-09T13-28-09-294Z.json.gz',
    identityNamespace: 'europe-historical-fra-lnb',
    leagueStatus: 'France Elite',
    displayName: 'France Pro A',
    shortName: 'LNB',
    accentColor: '#2563EB',
    sourceVersion: EUROPE_HISTORICAL_BACKFILL_VERSION,
  },
  italy: {
    id: 'europe-historical-ita-lba-v1',
    kind: 'domestic',
    leagueId: 'italian-serie-a',
    competitionId: 'italian-serie-a',
    countryCode: 'IT',
    coverageStart: 1988,
    coverageThrough: 2003,
    teamTidOffset: 8000,
    rosterUrl: `${DATA_ROOT}/europe-ITA-LBA-BBGM-RATED-V1.json.gz`,
    archivePath: 'referenceactions/europe-ITA-LBA-BBGM-RATED-V1-2026-08-09T13-28-09-294Z.json.gz',
    identityNamespace: 'europe-historical-ita-lba',
    leagueStatus: 'Italy Serie A',
    displayName: 'Lega Basket Serie A',
    shortName: 'LBA',
    accentColor: '#059669',
    sourceVersion: EUROPE_HISTORICAL_BACKFILL_VERSION,
  },
  germany: {
    id: 'europe-historical-ger-bbl-v1',
    kind: 'domestic',
    leagueId: 'german-bbl',
    competitionId: 'german-bbl',
    countryCode: 'DE',
    coverageStart: 1999,
    coverageThrough: 2003,
    teamTidOffset: 9000,
    rosterUrl: `${DATA_ROOT}/europe-GER-BBL-BBGM-RATED-V1.json.gz`,
    archivePath: 'referenceactions/europe-GER-BBL-BBGM-RATED-V1-2026-08-09T13-28-09-294Z.json.gz',
    identityNamespace: 'europe-historical-ger-bbl',
    leagueStatus: 'Germany BBL',
    displayName: 'Basketball Bundesliga',
    shortName: 'BBL',
    accentColor: '#DC2626',
    sourceVersion: EUROPE_HISTORICAL_BACKFILL_VERSION,
  },
  greece: {
    id: 'europe-historical-gre-gbl-v1',
    kind: 'domestic',
    leagueId: 'greek-heba-a1',
    competitionId: 'greek-heba-a1',
    countryCode: 'GR',
    coverageStart: 2002,
    coverageThrough: 2011,
    teamTidOffset: 6000,
    rosterUrl: `${DATA_ROOT}/europe-GRE-GBL-BBGM-RATED-V1.json.gz`,
    archivePath: 'referenceactions/europe-GRE-GBL-BBGM-RATED-V1-2026-08-09T13-28-09-294Z.json.gz',
    identityNamespace: 'europe-historical-gre-gbl',
    leagueStatus: 'Greece A1',
    displayName: 'Greek Basket League',
    shortName: 'GBL',
    accentColor: '#0EA5E9',
    sourceVersion: EUROPE_HISTORICAL_BACKFILL_VERSION,
  },
  turkey: {
    id: 'europe-historical-tur-bsl-v1',
    kind: 'domestic',
    leagueId: 'turkish-bsl',
    competitionId: 'turkish-bsl',
    countryCode: 'TR',
    coverageStart: 2004,
    coverageThrough: 2011,
    teamTidOffset: 7000,
    rosterUrl: '/data/historical/turkish-bsl/proballers-turkey-bsl-2003-04_to_2010-11-bbgm.json.gz',
    archivePath: 'data/sources/turkish-bsl/proballers-turkey-bsl-2003-04_to_2010-11-source.json',
    identityNamespace: 'europe-historical-tur-bsl',
    leagueStatus: 'Turkey BSL',
    displayName: 'Basketbol Süper Ligi',
    shortName: 'BSL',
    accentColor: '#DC2626',
    sourceVersion: 'europe-historical-v1-2026-08-16-turkey',
  },
};

export function getEuropeHistoricalBackfillSource(
  market: string | undefined,
  sourceSeason: number,
): EuroBasketballSourceDescriptor | null {
  const source = EUROPE_HISTORICAL_BACKFILL_BY_MARKET[market as EuropeHistoricalBackfillMarket];
  if (!source || sourceSeason < source.coverageStart || sourceSeason > source.coverageThrough) return null;
  return source;
}

export function getEuropeHistoricalBackfillSources(
  sourceSeason: number,
): EuroBasketballSourceDescriptor[] {
  return Object.values(EUROPE_HISTORICAL_BACKFILL_BY_MARKET).filter(source => (
    sourceSeason >= source.coverageStart && sourceSeason <= source.coverageThrough
  ));
}

export function getEuropeHistoricalCoverageStart(market: string | undefined): number | null {
  return EUROPE_HISTORICAL_BACKFILL_BY_MARKET[market as EuropeHistoricalBackfillMarket]?.coverageStart ?? null;
}

export function buildEuropeanSourceSeasonOptions(
  market: string | undefined,
  modernSource: EuroBasketballSourceDescriptor | null,
  modernSpainCoverage?: { start: number; through: number },
): Array<{ sourceSeason: number; startYear: number; label: string }> {
  const backfill = EUROPE_HISTORICAL_BACKFILL_BY_MARKET[market as EuropeHistoricalBackfillMarket];
  const coverage = [
    ...(backfill ? [{ start: backfill.coverageStart, through: backfill.coverageThrough }] : []),
    ...(modernSource ? [{ start: modernSource.coverageStart, through: modernSource.coverageThrough }] : []),
    ...(modernSpainCoverage ? [modernSpainCoverage] : []),
  ];
  const seasons = new Set<number>();
  for (const range of coverage) {
    for (let season = range.start; season <= range.through; season += 1) seasons.add(season);
  }
  return [...seasons].sort((left, right) => left - right).map(sourceSeason => ({
    sourceSeason,
    startYear: sourceSeason - 1,
    label: `${sourceSeason - 1}/${String(sourceSeason).slice(-2)}`,
  }));
}
