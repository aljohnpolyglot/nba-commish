export type HistoricalDomesticLeagueId = 'endesa';

export interface HistoricalDomesticLeagueCatalogEntry {
  id: HistoricalDomesticLeagueId;
  country: string;
  displayName: string;
  shortName: string;
  sourceUrl: string;
  sourceVersion: string;
  firstStartYear: number;
  latestStartYear: number;
  nbaDraftReferenceCutoffYear: number;
  teamTidOffset: number;
  broadcastBaseSeason: number;
  broadcastBasePoolEUR: number;
  historicalEconomyInflation: number;
}

export const HISTORICAL_DOMESTIC_LEAGUES: Record<HistoricalDomesticLeagueId, HistoricalDomesticLeagueCatalogEntry> = {
  endesa: {
    id: 'endesa',
    country: 'Spain',
    displayName: 'Liga Endesa',
    shortName: 'ACB',
    sourceUrl: '/data/historical/endesa/endesa_master_bbgm.wip-2026-07-19.json',
    sourceVersion: 'wip-2026-07-19-22259879',
    firstStartYear: 2003,
    latestStartYear: 2025,
    nbaDraftReferenceCutoffYear: 2025,
    teamTidOffset: 5000,
    broadcastBaseSeason: 2026,
    broadcastBasePoolEUR: 172_000_000,
    historicalEconomyInflation: 0.025,
  },
};

export const ENDESA_HISTORICAL_CATALOG = HISTORICAL_DOMESTIC_LEAGUES.endesa;

export const endesaStartYearToSourceSeason = (startYear: number): number => startYear + 1;

export const endesaSourceSeasonToStartYear = (sourceSeason: number): number => sourceSeason - 1;

export const formatEndesaSeasonLabel = (startYear: number): string => (
  `${startYear}/${String(startYear + 1).slice(-2)}`
);

export const getEndesaHistoricalEconomyFactor = (sourceSeason: number): number => Math.pow(
  1 + ENDESA_HISTORICAL_CATALOG.historicalEconomyInflation,
  sourceSeason - ENDESA_HISTORICAL_CATALOG.broadcastBaseSeason,
);

export const HISTORICAL_ENDESA_SEASONS = Array.from(
  { length: ENDESA_HISTORICAL_CATALOG.latestStartYear - ENDESA_HISTORICAL_CATALOG.firstStartYear + 1 },
  (_, index) => {
    const startYear = ENDESA_HISTORICAL_CATALOG.firstStartYear + index;
    return {
      startYear,
      sourceSeason: endesaStartYearToSourceSeason(startYear),
      label: formatEndesaSeasonLabel(startYear),
    };
  },
);
