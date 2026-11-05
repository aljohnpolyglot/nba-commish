export const EURO_ECONOMY_BASE_SEASON = 2026;
export const EURO_ECONOMY_ANNUAL_INFLATION = 0.025;

export function getEuroHistoricalEconomyFactor(season: number): number {
  const normalizedSeason = Number.isFinite(season) ? Math.trunc(season) : EURO_ECONOMY_BASE_SEASON;
  return Math.pow(
    1 + EURO_ECONOMY_ANNUAL_INFLATION,
    normalizedSeason - EURO_ECONOMY_BASE_SEASON,
  );
}
