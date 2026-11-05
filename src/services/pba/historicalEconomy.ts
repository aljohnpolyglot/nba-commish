export const PBA_ECONOMY_BASE_SEASON = 2026;
export const PBA_STAFF_ANNUAL_INFLATION = 0.055;
export const PBA_STAFF_ECONOMY_VERSION = 1;
export const PBA_PLAYER_ECONOMY_VERSION = 1;

export function getPbaHistoricalEconomyFactor(
  season: number,
  annualInflation = PBA_STAFF_ANNUAL_INFLATION,
): number {
  const normalizedSeason = Number.isFinite(season) ? Math.trunc(season) : PBA_ECONOMY_BASE_SEASON;
  const normalizedInflation = Math.max(-0.05, Math.min(0.2, annualInflation));
  return Math.pow(
    1 + normalizedInflation,
    normalizedSeason - PBA_ECONOMY_BASE_SEASON,
  );
}
