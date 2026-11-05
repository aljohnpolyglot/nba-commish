export type HistoricalNbaRosterSource = {
  startYear: number;
  label: string;
  url: string;
  strategy?: 'alexnoob_full' | 'alexnoob_post_draft_hybrid';
};

export const FIRST_ZENGM_RECONSTRUCTED_START_YEAR = 1946;
export const LATEST_NBA_ROSTER_START_YEAR = 2026;
export const BUNDLED_REAL_PLAYER_DATA_URL = '/data/historical/nba/real-player-data.basketball.json';
export const BUNDLED_REAL_PLAYER_STATS_URL = '/data/historical/nba/real-player-stats.basketball.json';
export const BUNDLED_REMOVED_PLAYERS_URL = '/data/historical/nba/removed-players.json';
export const BUNDLED_PLAYER_DEATHS_URL = '/data/historical/nba/player-deaths.wikidata.json';
export const PINNED_REAL_PLAYER_DATA_FALLBACK_URL = 'https://play.basketball-gm.com/gen/real-player-data-1f4b14853f.json';
export const PINNED_REAL_PLAYER_STATS_FALLBACK_URL = 'https://play.basketball-gm.com/gen/real-player-stats-1e67887648.json';

export const SUPPORTED_HISTORICAL_NBA_START_YEARS = Array.from(
  { length: LATEST_NBA_ROSTER_START_YEAR - FIRST_ZENGM_RECONSTRUCTED_START_YEAR + 1 },
  (_, index) => FIRST_ZENGM_RECONSTRUCTED_START_YEAR + index,
);

export function getHistoricalNbaRosterSource(startYear: number): HistoricalNbaRosterSource | null {
  void startYear;
  return null;
}

export function hasHistoricalNbaRosterSource(startYear: number): boolean {
  return startYear >= FIRST_ZENGM_RECONSTRUCTED_START_YEAR && startYear <= LATEST_NBA_ROSTER_START_YEAR;
}
