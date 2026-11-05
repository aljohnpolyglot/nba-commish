import {
  PBA_HISTORICAL_SOURCE,
  formatPbaSeasonKeyLabel,
} from './historyConfig';
import type { PbaMasterSource } from './historicalTypes';

export const PBA_HISTORICAL_CATALOG = {
  sourceUrl: PBA_HISTORICAL_SOURCE.sourceUrl,
  sourceVersion: PBA_HISTORICAL_SOURCE.sourceVersion,
  teamTidOffset: PBA_HISTORICAL_SOURCE.teamTidOffset,
  nbaCoexistSourceSeason: PBA_HISTORICAL_SOURCE.nbaCoexistSeason,
} as const;

export const pbaStartYearToSourceSeason = (startYear: number): number => startYear + 1;

export const formatPbaSeasonLabel = (season: number, leagueData?: PbaMasterSource): string => (
  formatPbaSeasonKeyLabel(season, leagueData)
);

export const PBA_FOUR_POINT_LINE_SOURCE_SEASON = 2025;

export function getHistoricalPbaRuleOverrides(sourceSeason: number) {
  return {
    fourPointLine: sourceSeason >= PBA_FOUR_POINT_LINE_SOURCE_SEASON,
    fourPointLineDistance: 27,
  } as const;
}
