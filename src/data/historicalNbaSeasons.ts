import type { LeagueStats } from '../types';
import { DEFAULT_CAP_INFLATION_AVERAGE } from '../constants';
import { LATEST_NBA_ROSTER_START_YEAR } from './historicalNbaRosterSources';
import { EURO_BASKETBALL_SOURCE_ARCHIVES, EUROLEAGUE_2026_SOURCE } from './euroBasketballSources';
import { getEuropeHistoricalBackfillSources } from './europeHistoricalBackfill';
import { PBA_HISTORY } from '../services/pba/historyConfig';
import { getHistoricalBasketballGameRuleOverrides } from '../services/era/basketballEraRules';
import { HISTORICAL_NBA_LEAGUE_AVERAGE_TARGETS } from './historicalNbaStatBenchmarks';

export interface HistoricalNbaSeason {
  startYear: number;
  label: string;
}

export const NBA_START_YEAR_MIN = 1946;

export const NBA_START_YEAR_MAX = LATEST_NBA_ROSTER_START_YEAR;
export const DEFAULT_HISTORICAL_NBA_START_YEAR = NBA_START_YEAR_MAX;

export const HISTORICAL_NBA_SEASONS: HistoricalNbaSeason[] = Array.from(
  { length: NBA_START_YEAR_MAX - NBA_START_YEAR_MIN + 1 },
  (_, index) => {
    const startYear = NBA_START_YEAR_MIN + index;
    return {
      startYear,
      label: formatSeasonLabel(startYear),
    };
  },
);

export function formatSeasonLabel(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function getHistoricalNbaSeason(startYear: number): HistoricalNbaSeason {
  return HISTORICAL_NBA_SEASONS.find(season => season.startYear === startYear)
    ?? HISTORICAL_NBA_SEASONS[HISTORICAL_NBA_SEASONS.length - 1];
}

export interface HistoricalExternalLeagueAvailability {
  euroleague: boolean;
  europeDomestic: boolean;
  pba: boolean;
  gleague: boolean;
  bleague: boolean;
  chinaCba: boolean;
  nblAustralia: boolean;
  wnba: boolean;
  currentOnlySources: boolean;
}

export function getHistoricalExternalLeagueAvailability(
  startYear: number,
): HistoricalExternalLeagueAvailability {
  const sourceSeason = startYear + 1;
  return {
    euroleague: sourceSeason >= EUROLEAGUE_2026_SOURCE.coverageStart,
    europeDomestic: getEuropeHistoricalBackfillSources(sourceSeason).length > 0
      || EURO_BASKETBALL_SOURCE_ARCHIVES.some(source => sourceSeason >= source.coverageStart),
    pba: sourceSeason >= PBA_HISTORY.playableStartYear && sourceSeason <= PBA_HISTORY.latestPlayableSeason,
    gleague: sourceSeason >= 2002,
    bleague: sourceSeason >= 2017,
    chinaCba: sourceSeason >= 2012,
    nblAustralia: sourceSeason >= 2012,
    wnba: sourceSeason >= 1997,
    currentOnlySources: startYear >= DEFAULT_HISTORICAL_NBA_START_YEAR,
  };
}

export function shouldLoadExternalLeaguesForNbaStart(startYear: number): boolean {
  return Object.values(getHistoricalExternalLeagueAvailability(startYear)).some(Boolean);
}

export function getHistoricalExternalLeagueLabels(startYear: number): string[] {
  const sourceSeason = startYear + 1;
  const availability = getHistoricalExternalLeagueAvailability(startYear);
  const labels: string[] = [];
  if (availability.pba) labels.push('PBA');
  if (availability.europeDomestic) {
    const domesticSources = [
      ...getEuropeHistoricalBackfillSources(sourceSeason),
      ...EURO_BASKETBALL_SOURCE_ARCHIVES.filter(source => (
        sourceSeason >= source.coverageStart && sourceSeason <= source.coverageThrough
      )),
    ];
    for (const source of domesticSources) labels.push(source.shortName);
  }
  if (availability.euroleague) labels.push('EuroLeague');
  if (availability.gleague) labels.push('G League');
  if (availability.bleague) labels.push('B.League');
  if (availability.chinaCba) labels.push('CBA');
  if (availability.nblAustralia) labels.push('NBL');
  if (availability.wnba) labels.push('WNBA');
  return [...new Set(labels)];
}

export function isHistoricalNbaStart(startYear: number): boolean {
  return startYear < DEFAULT_HISTORICAL_NBA_START_YEAR;
}

export function isNbaCupEra(startYear: number): boolean {
  return startYear >= 2023;
}

export function isPlayInEra(startYear: number): boolean {
  return startYear >= 2019;
}

export function getHistoricalNbaPlayInFormat(startYear: number): 'modern_7_10' | 'bubble_8_9' {
  return startYear === 2019 ? 'bubble_8_9' : 'modern_7_10';
}

export function getHistoricalNbaAllStarFormat(startYear: number): 'east_vs_west' | 'captains_draft' {
  return startYear >= 2017 && startYear <= 2022 ? 'captains_draft' : 'east_vs_west';
}

export function getHistoricalNbaAllStarGameFormat(startYear: number): 'timed' | 'elam_ending' {
  return startYear >= 2019 && startYear <= 2022 ? 'elam_ending' : 'timed';
}

export function getHistoricalNbaRisingStarsFormat(startYear: number): 'rookies_vs_sophomores' | 'captains_draft' | 'usa_vs_world' | '4team_tournament' {
  if (startYear >= 2021) return '4team_tournament';
  if (startYear >= 2014) return 'usa_vs_world';
  if (startYear >= 2011) return 'captains_draft';
  return 'rookies_vs_sophomores';
}

export function isThreePointEra(startYear: number): boolean {
  return startYear >= 1979;
}

export function isSalaryCapEra(startYear: number): boolean {
  return startYear >= 1984;
}

export type HistoricalNbaEraKey =
  | 'pre_shot_clock'
  | 'pre_three_point'
  | 'early_three'
  | 'physical_nineties'
  | 'deadball'
  | 'seven_seconds'
  | 'pace_and_space'
  | 'modern_spacing';

export interface HistoricalNbaEraContext {
  key: HistoricalNbaEraKey;
  startYear: number;
  seasonEndYear: number;
  hasShotClock: boolean;
  hasThreePointLine: boolean;
  salaryCapModel: 'none' | 'soft';
  sim: {
    paceMultiplier: number;
    fieldGoalAttemptMultiplier?: number;
    threePointRateMultiplier: number;
    midRangeRateMultiplier: number;
    lowPostRateMultiplier: number;
    freeThrowRateMultiplier: number;
    turnoverMultiplier: number;
    efficiencyMultiplier: number;
    assistRateMultiplier: number;
    assistDistributionExponent?: number;
    reboundOpportunityMultiplier: number;
    freeThrowAccuracyMultiplier: number;
    reboundDistributionExponent?: number;
    orbRateMultiplier: number;
    blockRateMultiplier: number;
  };
}

function historicalNbaEraKey(startYear: number): HistoricalNbaEraKey {
  if (startYear < 1954) return 'pre_shot_clock';
  if (startYear < 1979) return 'pre_three_point';
  if (startYear < 1989) return 'early_three';
  if (startYear < 1998) return 'physical_nineties';
  if (startYear < 2005) return 'deadball';
  if (startYear < 2014) return 'seven_seconds';
  if (startYear < 2019) return 'pace_and_space';
  return 'modern_spacing';
}

export const HISTORICAL_NBA_CALIBRATION_ANCHOR_YEARS = [
  ...HISTORICAL_NBA_LEAGUE_AVERAGE_TARGETS.map(target => target.startYear),
  2023,
] as const;

const HISTORICAL_FAST_FGA_MULTIPLIER_ANCHORS = [
  [1979, 0.945],
  [1987, 0.926],
  [1995, 0.885],
  [2003, 0.893],
  [2015, 0.916],
  [2023, 0.965],
] as const;

const HISTORICAL_STEAL_FACTOR_ANCHORS = HISTORICAL_NBA_LEAGUE_AVERAGE_TARGETS
  .filter(target => target.stl != null && target.tov != null && target.tov > 0)
  .map(target => [target.startYear, (target.stl! / target.tov!) / 0.58] as const);

function getHistoricalStealFactor(startYear: number): number {
  if (HISTORICAL_STEAL_FACTOR_ANCHORS.length === 0 || startYear < HISTORICAL_STEAL_FACTOR_ANCHORS[0][0]) return 1;
  for (let index = 1; index < HISTORICAL_STEAL_FACTOR_ANCHORS.length; index += 1) {
    const [rightYear, rightValue] = HISTORICAL_STEAL_FACTOR_ANCHORS[index];
    if (startYear > rightYear) continue;
    const [leftYear, leftValue] = HISTORICAL_STEAL_FACTOR_ANCHORS[index - 1];
    return leftValue + (rightValue - leftValue) * ((startYear - leftYear) / (rightYear - leftYear));
  }
  return HISTORICAL_STEAL_FACTOR_ANCHORS[HISTORICAL_STEAL_FACTOR_ANCHORS.length - 1][1];
}

function getHistoricalFastFgaMultiplier(startYear: number): number | undefined {
  if (startYear < HISTORICAL_FAST_FGA_MULTIPLIER_ANCHORS[0][0]) return undefined;
  for (let index = 1; index < HISTORICAL_FAST_FGA_MULTIPLIER_ANCHORS.length; index += 1) {
    const [rightYear, rightValue] = HISTORICAL_FAST_FGA_MULTIPLIER_ANCHORS[index];
    if (startYear > rightYear) continue;
    const [leftYear, leftValue] = HISTORICAL_FAST_FGA_MULTIPLIER_ANCHORS[index - 1];
    return leftValue + (rightValue - leftValue) * ((startYear - leftYear) / (rightYear - leftYear));
  }
  return HISTORICAL_FAST_FGA_MULTIPLIER_ANCHORS[HISTORICAL_FAST_FGA_MULTIPLIER_ANCHORS.length - 1][1];
}

export function getHistoricalNbaCalibrationSpan(startYear: number): {
  leftYear: number;
  rightYear: number;
  progress: number;
} {
  const first = HISTORICAL_NBA_CALIBRATION_ANCHOR_YEARS[0];
  if (startYear <= first) return { leftYear: first, rightYear: first, progress: 0 };
  for (let index = 1; index < HISTORICAL_NBA_CALIBRATION_ANCHOR_YEARS.length; index += 1) {
    const rightYear = HISTORICAL_NBA_CALIBRATION_ANCHOR_YEARS[index];
    if (startYear > rightYear) continue;
    const leftYear = HISTORICAL_NBA_CALIBRATION_ANCHOR_YEARS[index - 1];
    return { leftYear, rightYear, progress: (startYear - leftYear) / (rightYear - leftYear) };
  }
  const last = HISTORICAL_NBA_CALIBRATION_ANCHOR_YEARS[HISTORICAL_NBA_CALIBRATION_ANCHOR_YEARS.length - 1];
  return { leftYear: last, rightYear: last, progress: 0 };
}

function getRawHistoricalNbaEraContext(startYear: number): HistoricalNbaEraContext {
  const key = historicalNbaEraKey(startYear);
  const hasThreePointLine = isThreePointEra(startYear);
  const salaryCapModel = isSalaryCapEra(startYear) ? 'soft' : 'none';
  const simByEra: Record<HistoricalNbaEraKey, HistoricalNbaEraContext['sim']> = {
    pre_shot_clock: {
      paceMultiplier: 1.18,
      fieldGoalAttemptMultiplier: Math.max(1.02, 1.14 - Math.max(0, startYear - 1948) * 0.024),
      threePointRateMultiplier: 0,
      midRangeRateMultiplier: 1.22,
      lowPostRateMultiplier: 1.24,
      freeThrowRateMultiplier: 1.64,
      turnoverMultiplier: 1.10,
      efficiencyMultiplier: 0.73,
      assistRateMultiplier: 1.38,
      assistDistributionExponent: 1.00,
      reboundOpportunityMultiplier: 1.15,
      freeThrowAccuracyMultiplier: 1.02,
      reboundDistributionExponent: 1.80,
      orbRateMultiplier: 1.00,
      blockRateMultiplier: 1.00,
    },
    pre_three_point: {
      paceMultiplier: startYear < 1960
        ? 1.18 + (startYear - 1954) * 0.025
        : startYear < 1962
          ? 1.30 + (startYear - 1960) * 0.15
          : Math.max(1.05, 1.30 - (startYear - 1961) * 0.01),
      threePointRateMultiplier: 0,
      midRangeRateMultiplier: 1.18,
      lowPostRateMultiplier: 1.16,
      freeThrowRateMultiplier: startYear < 1960 ? 1.65 : 1.45,
      turnoverMultiplier: 1.04,
      efficiencyMultiplier: startYear < 1960 ? 0.84 : Math.min(0.94, 0.88 + (startYear - 1960) * 0.01),
      assistRateMultiplier: startYear < 1960 ? 0.82 : 0.86,
      assistDistributionExponent: startYear < 1960 ? 0.80 : 0.90,
      reboundOpportunityMultiplier: startYear >= 1960 && startYear < 1962 ? 1.45 : 1.40,
      freeThrowAccuracyMultiplier: startYear < 1960 ? 1.04 : 0.94,
      reboundDistributionExponent: 1.50,
      orbRateMultiplier: 1.00,
      blockRateMultiplier: 1.00,
    },
    early_three: {
      paceMultiplier: 1.08 - (startYear - 1979) * 0.0025,
      threePointRateMultiplier: (startYear <= 1980
        ? 0.38
        : Math.max(0.085, 0.38 - (startYear - 1980) * 0.042)) * 0.75,
      midRangeRateMultiplier: 1.16,
      lowPostRateMultiplier: 1.12,
      freeThrowRateMultiplier: 1.35,
      turnoverMultiplier: startYear <= 1980 ? 1.15 : 1.02,
      efficiencyMultiplier: 0.94 + (startYear - 1979) * 0.0075,
      assistRateMultiplier: 1.00,
      assistDistributionExponent: 0.80,
      reboundOpportunityMultiplier: 1.00,
      freeThrowAccuracyMultiplier: 0.99,
      reboundDistributionExponent: 1.60,
      orbRateMultiplier: 1.30,
      blockRateMultiplier: 1.25,
    },
    physical_nineties: {
      paceMultiplier: 0.99,
      threePointRateMultiplier: startYear >= 1994 && startYear <= 1996 ? 0.25 : 0.22,
      midRangeRateMultiplier: 1.18,
      lowPostRateMultiplier: 1.14,
      freeThrowRateMultiplier: 1.33,
      turnoverMultiplier: 1.04,
      efficiencyMultiplier: 0.96,
      assistRateMultiplier: 1.00,
      assistDistributionExponent: 0.75,
      reboundOpportunityMultiplier: 1.00,
      freeThrowAccuracyMultiplier: 0.99,
      reboundDistributionExponent: 1.65,
      orbRateMultiplier: 1.15,
      blockRateMultiplier: 1.25,
    },
    deadball: {
      paceMultiplier: 0.94,
      threePointRateMultiplier: 0.36,
      midRangeRateMultiplier: 1.20,
      lowPostRateMultiplier: 1.14,
      freeThrowRateMultiplier: 1.33,
      turnoverMultiplier: 0.96,
      efficiencyMultiplier: 0.94,
      assistRateMultiplier: 1.00,
      assistDistributionExponent: 0.72,
      reboundOpportunityMultiplier: 1.00,
      freeThrowAccuracyMultiplier: 1.00,
      reboundDistributionExponent: 1.55,
      orbRateMultiplier: 1.12,
      blockRateMultiplier: 1.25,
    },
    seven_seconds: {
      paceMultiplier: 0.95,
      threePointRateMultiplier: 0.46,
      midRangeRateMultiplier: 1.12,
      lowPostRateMultiplier: 1.05,
      freeThrowRateMultiplier: 1.02,
      turnoverMultiplier: 0.98,
      efficiencyMultiplier: 0.99,
      assistRateMultiplier: 0.90,
      assistDistributionExponent: 0.78,
      reboundOpportunityMultiplier: 1.00,
      freeThrowAccuracyMultiplier: 1.00,
      reboundDistributionExponent: 1.65,
      orbRateMultiplier: 1.05,
      blockRateMultiplier: 1.25,
    },
    pace_and_space: {
      paceMultiplier: 1.04,
      threePointRateMultiplier: 0.76,
      midRangeRateMultiplier: 1.04,
      lowPostRateMultiplier: 0.98,
      freeThrowRateMultiplier: 1.10,
      turnoverMultiplier: 1.00,
      efficiencyMultiplier: 0.98,
      assistRateMultiplier: 0.95,
      assistDistributionExponent: 0.78,
      reboundOpportunityMultiplier: 1.00,
      freeThrowAccuracyMultiplier: 1.00,
      reboundDistributionExponent: 1.70,
      orbRateMultiplier: 0.94,
      blockRateMultiplier: 1.40,
    },
    modern_spacing: {
      paceMultiplier: 1.03,
      threePointRateMultiplier: 1.00,
      midRangeRateMultiplier: 1.00,
      lowPostRateMultiplier: 1.00,
      freeThrowRateMultiplier: 1.00,
      turnoverMultiplier: 1.00,
      efficiencyMultiplier: 1.00,
      assistRateMultiplier: 0.88,
      assistDistributionExponent: 1.00,
      reboundOpportunityMultiplier: 1.00,
      freeThrowAccuracyMultiplier: 1.00,
      orbRateMultiplier: 0.94,
      blockRateMultiplier: 1.25,
    },
  };

  return {
    key,
    startYear,
    seasonEndYear: startYear + 1,
    hasShotClock: startYear >= 1954,
    hasThreePointLine,
    salaryCapModel,
    sim: simByEra[key],
  };
}

export function getHistoricalNbaEraContext(startYear: number): HistoricalNbaEraContext {
  const current = getRawHistoricalNbaEraContext(startYear);
  const { leftYear, rightYear, progress } = getHistoricalNbaCalibrationSpan(startYear);
  const sim = { ...current.sim } as Record<string, number | undefined>;
  if (leftYear !== rightYear && progress !== 0 && progress !== 1) {
    const left = getRawHistoricalNbaEraContext(leftYear).sim as Record<string, number | undefined>;
    const right = getRawHistoricalNbaEraContext(rightYear).sim as Record<string, number | undefined>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (key === 'fieldGoalAttemptMultiplier') continue;
      const from = left[key] ?? 1;
      const to = right[key] ?? 1;
      sim[key] = from + (to - from) * progress;
    }
  }
  sim.fieldGoalAttemptMultiplier = getHistoricalFastFgaMultiplier(startYear) ?? sim.fieldGoalAttemptMultiplier;
  if (!current.hasThreePointLine) sim.threePointRateMultiplier = 0;

  return { ...current, sim: sim as unknown as HistoricalNbaEraContext['sim'] };
}

const NBA_SALARY_CAP_BY_START_YEAR_MILLIONS: Record<number, number> = {
  1984: 3.6,
  1985: 4.233,
  1986: 4.945,
  1987: 6.164,
  1988: 7.232,
  1989: 9.802,
  1990: 11.871,
  1991: 12.5,
  1992: 14,
  1993: 15.175,
  1994: 15.964,
  1995: 23,
  1996: 24.363,
  1997: 26.9,
  1998: 30,
  1999: 34,
  2000: 35.5,
  2001: 42.5,
  2002: 40.271,
  2003: 43.84,
  2004: 43.87,
  2005: 49.5,
  2006: 53.135,
  2007: 55.63,
  2008: 58.68,
  2009: 57.7,
  2010: 58.044,
  2011: 58.044,
  2012: 58.044,
  2013: 58.679,
  2014: 63.065,
  2015: 70,
  2016: 94.143,
  2017: 99.093,
  2018: 101.869,
  2019: 109.14,
  2020: 109.14,
  2021: 112.414,
  2022: 123.655,
  2023: 136.021,
  2024: 140.588,
  2025: 154.647,
  2026: 164.961,
};

const NBA_APRONS_BY_START_YEAR: Record<number, { first: number; second: number; luxury?: number }> = {
  2023: { first: 172_346_000, second: 182_794_000 },
  2024: { first: 178_132_000, second: 188_931_000 },
  2025: { first: 195_945_000, second: 207_824_000 },
  2026: { first: 209_015_000, second: 221_686_000, luxury: 200_428_000 },
};

const RECORDED_NBA_CAP_START_YEARS = Object.keys(NBA_SALARY_CAP_BY_START_YEAR_MILLIONS)
  .map(Number)
  .sort((a, b) => a - b);
const LATEST_RECORDED_NBA_CAP_START_YEAR = RECORDED_NBA_CAP_START_YEARS[RECORDED_NBA_CAP_START_YEARS.length - 1];

export function getRecordedHistoricalNbaSalaryCap(startYear: number): number | null {
  const capMillions = NBA_SALARY_CAP_BY_START_YEAR_MILLIONS[startYear];
  return capMillions == null ? null : Math.round(capMillions * 1_000_000);
}

export function getHistoricalNbaSalaryCap(startYear: number): number | null {
  const recordedCap = getRecordedHistoricalNbaSalaryCap(startYear);
  if (recordedCap != null || startYear < 1984 || startYear <= LATEST_RECORDED_NBA_CAP_START_YEAR) {
    return recordedCap;
  }
  const latestRecordedCap = getRecordedHistoricalNbaSalaryCap(LATEST_RECORDED_NBA_CAP_START_YEAR);
  if (latestRecordedCap == null) return null;
  const growth = 1 + DEFAULT_CAP_INFLATION_AVERAGE / 100;
  return Math.round(latestRecordedCap * Math.pow(growth, startYear - LATEST_RECORDED_NBA_CAP_START_YEAR));
}

export function getHistoricalNbaContractScaleCap(startYear: number): number {
  const salaryCap = getHistoricalNbaSalaryCap(startYear);
  if (salaryCap != null && salaryCap > 0) return salaryCap;
  if (startYear < 1954) return 900_000;
  if (startYear < 1960) return 1_200_000;
  if (startYear < 1970) return 1_800_000;
  if (startYear < 1976) return 2_400_000;
  return 3_200_000;
}

export function getHistoricalNbaGamesPerSeason(startYear: number): number {
  if (startYear === 1998) return 50;
  if (startYear === 2011) return 66;
  if (startYear === 2019 || startYear === 2020) return 72;
  if (startYear <= 1946) return 60;
  if (startYear === 1947) return 48;
  if (startYear === 1948) return 60;
  if (startYear <= 1951) return 66;
  if (startYear === 1952) return 70;
  if (startYear <= 1958) return 72;
  if (startYear === 1959) return 75;
  if (startYear === 1960) return 79;
  if (startYear <= 1965) return 80;
  if (startYear === 1966) return 81;
  return 82;
}

export function getHistoricalNbaRosterMinimum(startYear: number): number {
  if (startYear < 1960) return 10;
  if (startYear < 1976) return 11;
  if (startYear < 2005) return 12;
  return 14;
}

export function getHistoricalNbaDraftType(startYear: number): string {
  if (startYear < 1965) return 'inverse_standings';
  if (startYear < 1984) return 'nba1966';
  if (startYear < 1986) return 'nba1985';
  if (startYear < 1989) return 'nba1987';
  if (startYear < 1993) return 'nba1990';
  if (startYear < 2018) return 'nba1994';
  return 'nba2019';
}

export function getHistoricalNbaPlayoffSeries(startYear: number): number[] {
  const eventYear = startYear + 1;
  if (eventYear < 1948) return [3, 3, 7];
  if (eventYear === 1949) return [3, 3, 3, 7];
  if (eventYear < 1953) return [3, 5, 7];
  if (eventYear === 1953) return [3, 7];
  if (eventYear < 1957) return [3, 5, 7];
  if (eventYear < 1960) return [3, 7, 7];
  if (eventYear < 1967) return [5, 7, 7];
  if (eventYear < 1974) return [7, 7, 7];
  if (eventYear < 1983) return [3, 7, 7, 7];
  if (eventYear < 2003) return [5, 7, 7, 7];
  return [7, 7, 7, 7];
}

export function getHistoricalNbaPlayoffByes(startYear: number): number {
  const eventYear = startYear + 1;
  if (eventYear < 1948) return 2;
  if (eventYear === 1949) return 4;
  if (eventYear >= 1954 && eventYear < 1967) return 2;
  if (eventYear >= 1974 && eventYear < 1976) return 6;
  if (eventYear >= 1976 && eventYear < 1983) return 4;
  return 0;
}

export function getHistoricalNbaPlayoffTeams(startYear: number): number {
  const series = getHistoricalNbaPlayoffSeries(startYear);
  const slots = 2 ** series.length;
  return Math.max(2, slots - getHistoricalNbaPlayoffByes(startYear));
}

function getHistoricalNbaConfs(startYear: number): LeagueStats['confs'] {
  if (startYear < 1970) {
    return [
      { cid: 0, name: 'Eastern Division' },
      { cid: 1, name: 'Western Division' },
    ];
  }
  return undefined;
}

function getHistoricalNbaMinimumSalaryMillions(startYear: number): number {
  const scaleCap = getHistoricalNbaContractScaleCap(startYear);
  const modernMinToCap = 1.27287 / 154.647;
  const minMillions = (scaleCap / 1_000_000) * modernMinToCap;
  return Math.max(0.012, Math.round(minMillions * 1000) / 1000);
}

function getHistoricalContractLengthRules(startYear: number): Pick<
  LeagueStats,
  'maxContractLengthStandard' | 'maxContractLengthBird'
> {
  if (startYear < 1983) return { maxContractLengthStandard: 25, maxContractLengthBird: 25 };
  if (startYear < 1995) return { maxContractLengthStandard: 12, maxContractLengthBird: 12 };
  if (startYear < 2005) return { maxContractLengthStandard: 6, maxContractLengthBird: 7 };
  if (startYear < 2011) return { maxContractLengthStandard: 5, maxContractLengthBird: 6 };
  return { maxContractLengthStandard: 4, maxContractLengthBird: 5 };
}

function getHistoricalNbaBusinessRuleOverrides(startYear: number, hasCap: boolean): Partial<LeagueStats> {
  const contractLengths = getHistoricalContractLengthRules(startYear);
  const rookieScaleActive = startYear >= 1995;
  const twoWayActive = startYear >= 2017;
  const maxContractActive = startYear >= 1999;
  const mleActive = hasCap && startYear >= 1999;
  const tradeExceptionsActive = hasCap && startYear >= 1984;
  const deadMoneyActive = hasCap && startYear >= 1999;
  const luxuryTaxActive = hasCap && startYear >= 2002;
  const apronActive = startYear >= 2023;
  const legacyApronActive = startYear >= 2011;
  const supermaxActive = startYear >= 2017;
  const rookieExtensionActive = startYear >= 2005;
  const playerOptionsActive = startYear >= 1995;
  const minSalaryM = getHistoricalNbaMinimumSalaryMillions(startYear);
  const apronAmounts = NBA_APRONS_BY_START_YEAR[startYear];
  const salaryCap = getHistoricalNbaSalaryCap(startYear);
  const luxuryTaxThresholdPercentage = salaryCap && apronAmounts?.luxury
    ? (apronAmounts.luxury / salaryCap) * 100
    : 121.5;

  return {
    historicalContractScaleCap: getHistoricalNbaContractScaleCap(startYear),
    minimumPayrollEnabled: hasCap,
    minimumPayrollPercentage: 90,
    luxuryTaxEnabled: luxuryTaxActive,
    luxuryTaxThresholdPercentage,
    apronsEnabled: legacyApronActive,
    numberOfAprons: apronActive ? 2 : legacyApronActive ? 1 : 0,
    firstApronPercentage: legacyApronActive ? (apronActive ? 126.7 : 127.5) : undefined,
    secondApronPercentage: apronActive ? 134.4 : undefined,
    firstApronAmount: apronActive ? apronAmounts?.first ?? 0 : 0,
    secondApronAmount: apronActive ? apronAmounts?.second ?? 0 : 0,
    tradeMatchingRatioUnder: hasCap ? 1.25 : 10,
    tradeMatchingRatioOver1st: apronActive ? 1.10 : 1.25,
    tradeMatchingRatioOver2nd: apronActive ? 1.00 : 1.25,
    restrictCashSendOver2ndApron: apronActive,
    restrictAggregationOver2ndApron: apronActive,
    restrictSignAndTradeAcquisitionOver1stApron: apronActive,
    freezePickAt2ndApron: apronActive,
    restrictTPEProvenanceOver2ndApron: apronActive,
    twoWayContractsEnabled: twoWayActive,
    maxTwoWayPlayersPerTeam: twoWayActive ? (startYear >= 2023 ? 3 : 2) : 0,
    minPlayersPerTeam: getHistoricalNbaRosterMinimum(startYear),
    maxStandardPlayersPerTeam: 15,
    maxPlayersPerTeam: 15 + (twoWayActive ? (startYear >= 2023 ? 3 : 2) : 0),
    maxTrainingCampRoster: startYear >= 2023 ? 21 : startYear >= 1974 ? 20 : 18,
    nonGuaranteedContractsEnabled: hasCap,
    r2ContractsNonGuaranteed: startYear >= 2017,
    minContractType: hasCap ? 'dynamic' : 'static',
    minContractStaticAmount: minSalaryM,
    maxContractType: maxContractActive ? 'service_tiered' : 'none',
    maxContractStaticPercentage: maxContractActive ? 30 : 100,
    supermaxEnabled: supermaxActive,
    supermaxPercentage: 35,
    supermaxMinYears: 7,
    rookieExtEnabled: rookieExtensionActive,
    rookieExtPct: 25,
    rookieExtRosePct: startYear >= 2011 ? 30 : 25,
    birdRightsEnabled: hasCap,
    ...contractLengths,
    playerOptionsEnabled: playerOptionsActive,
    deadMoneyEnabled: deadMoneyActive,
    tradeExceptionsEnabled: tradeExceptionsActive,
    tenDayContractsEnabled: startYear >= 1950,
    jerseyPatchProgramEnabled: startYear >= 2017,
    rookieScaleType: rookieScaleActive ? 'dynamic' : 'none',
    rookieStaticAmount: minSalaryM,
    rookieMaxContractPercentage: 9,
    rookieScaleAppliesTo: 'first_round',
    rookieContractLength: rookieScaleActive ? 2 : 1,
    rookieTeamOptionsEnabled: rookieScaleActive,
    rookieTeamOptionYears: rookieScaleActive ? 2 : 0,
    rookieRestrictedFreeAgentEligibility: rookieScaleActive,
    rookieContractCapException: hasCap && rookieScaleActive,
    mleEnabled: mleActive,
    biannualEnabled: mleActive,
    roomMlePercentage: mleActive ? 5.68 : 0,
    nonTaxpayerMlePercentage: mleActive ? 9.12 : 0,
    taxpayerMlePercentage: mleActive ? 3.68 : 0,
    biannualPercentage: mleActive ? (startYear >= 2017 ? 3.32 : 3.08) : 0,
    biannualTradeWaiverEnabled: startYear >= 2023,
    biannualFirstApronHardCapEnabled: legacyApronActive,
    biannualProrationEnabled: mleActive,
  };
}

export function getHistoricalNbaRuleOverrides(startYear: number): Partial<LeagueStats> {
  const hasCap = isSalaryCapEra(startYear);
  const salaryCap = getHistoricalNbaSalaryCap(startYear);
  const hasAllStarGame = startYear >= 1950 && startYear !== 1998;
  const allStarGameFormat = getHistoricalNbaAllStarGameFormat(startYear);
  const era = getHistoricalNbaEraContext(startYear);
  const businessRules = getHistoricalNbaBusinessRuleOverrides(startYear, hasCap);
  const salaryCapFields: Partial<LeagueStats> = !hasCap
    ? {
        salaryCap: 0,
        luxuryPayroll: 0,
      }
    : salaryCap != null
      ? {
          salaryCap,
          luxuryPayroll: NBA_APRONS_BY_START_YEAR[startYear]?.luxury ?? Math.round(salaryCap * 1.215),
        }
      : {};
  return {
    ...getHistoricalBasketballGameRuleOverrides(startYear),
    year: startYear + 1,
    gamesPerSeason: getHistoricalNbaGamesPerSeason(startYear),
    numGamesPlayoffSeries: getHistoricalNbaPlayoffSeries(startYear),
    numPlayoffTeams: getHistoricalNbaPlayoffTeams(startYear),
    numPlayoffByes: getHistoricalNbaPlayoffByes(startYear),
    draftType: getHistoricalNbaDraftType(startYear),
    confs: getHistoricalNbaConfs(startYear),
    divs: startYear < 1970 ? [] : undefined,
    playIn: isPlayInEra(startYear),
    playInFormat: getHistoricalNbaPlayInFormat(startYear),
    inSeasonTournament: isNbaCupEra(startYear),
    threePointLineEnabled: era.hasThreePointLine,
    threePointLineDistance: era.hasThreePointLine
      ? (startYear >= 1994 && startYear <= 1996 ? 22 : 23.75)
      : 0,
    shotClockEnabled: era.hasShotClock,
    shotClockValue: 24,
    shotClockResetOffensiveRebound: startYear >= 2018 ? 14 : 24,
    handcheckingEnabled: startYear < 2004,
    illegalZoneDefenseEnabled: startYear < 2001,
    defensiveThreeSecondEnabled: startYear >= 2001,
    backToBasketTimerEnabled: startYear >= 1999,
    salaryCapEnabled: hasCap,
    salaryCapType: hasCap ? 'soft' : 'none',
    ...salaryCapFields,
    ...businessRules,
    minGamesRequirement: startYear >= 2023 ? 65 : 0,
    allStarGameEnabled: hasAllStarGame,
    allStarFormat: getHistoricalNbaAllStarFormat(startYear),
    allStarTeams: 2,
    allStarMirrorLeagueRules: false,
    allStarGameFormat,
    allStarQuarterLength: 12,
    allStarNumQuarters: allStarGameFormat === 'elam_ending' ? 3 : 4,
    allStarOvertimeDuration: 5,
    allStarOvertimeTargetPoints: allStarGameFormat === 'elam_ending' ? 24 : 7,
    allStarDunkContest: startYear >= 1983 && startYear !== 1997 && startYear !== 1998,
    allStarThreePointContest: startYear >= 1985 && startYear !== 1998,
    allStarShootingStars: startYear >= 2003 && startYear <= 2014,
    allStarSkillsChallenge: startYear >= 2002,
    risingStarsEnabled: startYear >= 1993,
    risingStarsFormat: getHistoricalNbaRisingStarsFormat(startYear),
    risingStarsCaptainType: startYear >= 2011 && startYear <= 2013 ? 'legend' : 'player',
    risingStarsLegendCaptainIds: [],
    risingStarsMirrorLeagueRules: false,
    risingStarsQuarterLength: 12,
    risingStarsNumQuarters: 4,
    risingStarsOvertimeDuration: 5,
    celebrityGameEnabled: startYear >= 2002,
    allStarHosts: [],
    historicalEraKey: era.key,
    historicalEraStartYear: startYear,
    historicalPaceMultiplier: era.sim.paceMultiplier,
    historicalFieldGoalAttemptMultiplier: era.sim.fieldGoalAttemptMultiplier ?? 1,
    historicalThreePointRateMultiplier: era.sim.threePointRateMultiplier,
    historicalMidRangeRateMultiplier: era.sim.midRangeRateMultiplier,
    historicalLowPostRateMultiplier: era.sim.lowPostRateMultiplier,
    historicalFreeThrowRateMultiplier: era.sim.freeThrowRateMultiplier,
    historicalTurnoverMultiplier: era.sim.turnoverMultiplier,
    historicalEfficiencyMultiplier: era.sim.efficiencyMultiplier,
    historicalAssistRateMultiplier: era.sim.assistRateMultiplier,
    historicalAssistDistributionExponent: era.sim.assistDistributionExponent,
    historicalReboundOpportunityMultiplier: era.sim.reboundOpportunityMultiplier,
    historicalFreeThrowAccuracyMultiplier: era.sim.freeThrowAccuracyMultiplier,
    historicalReboundDistributionExponent: era.sim.reboundDistributionExponent,
    historicalOrbRateMultiplier: era.sim.orbRateMultiplier,
    historicalBlockRateMultiplier: era.sim.blockRateMultiplier,
    stealFactor: getHistoricalStealFactor(startYear),
  };
}
