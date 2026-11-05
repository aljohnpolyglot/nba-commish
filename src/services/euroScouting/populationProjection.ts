import type { EuroCountryProfile } from './types';

const POPULATION_BASE_YEAR = 2018;

const REGION_ANNUAL_GROWTH: Record<string, number> = {
  'Australia and New Zealand': 0.013,
  Balkans: -0.002,
  'Baltic Countries': -0.003,
  'British Isles': 0.006,
  Caribbean: 0.008,
  'Central Africa': 0.026,
  'Central America': 0.014,
  'Central and Southeast Europe': -0.001,
  'Eastern Africa': 0.027,
  'Eastern Asia': 0.004,
  'Eastern Europe': -0.002,
  Melanesia: 0.019,
  Micronesia: 0.012,
  'Middle East': 0.019,
  'Nordic Countries': 0.006,
  'North America': 0.008,
  'Northern Africa': 0.018,
  Polynesia: 0.01,
  'South America': 0.011,
  'Southeast Asia': 0.0165,
  'Southern Africa': 0.012,
  'Southern and Central Asia': 0.019,
  'Southern Asia': 0.017,
  'Southern Europe': 0.001,
  'Western Africa': 0.027,
  'Western Europe': 0.004,
};

export function projectEuroCountryPopulation(profile: EuroCountryProfile, season: number): number {
  const year = Math.max(1900, Math.min(2200, Math.trunc(Number.isFinite(season) ? season : POPULATION_BASE_YEAR)));
  const annualGrowth = REGION_ANNUAL_GROWTH[profile.region] ?? 0.01;
  const delta = year - POPULATION_BASE_YEAR;
  const effectiveYears = delta <= 32 ? delta : 32 + (delta - 32) * 0.35;
  return Math.max(10_000, Math.min(20_000_000_000, Math.round(profile.population * Math.pow(1 + annualGrowth, effectiveYears))));
}

export function projectEuroCountryProfile(profile: EuroCountryProfile, season: number): EuroCountryProfile {
  return { ...profile, population: projectEuroCountryPopulation(profile, season) };
}
