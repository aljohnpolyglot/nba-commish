export type BasketballEraKey =
  | 'naismith-foundation'
  | 'early-professional'
  | 'pre-shot-clock'
  | 'post-shot-clock'
  | 'modern-training'
  | 'sports-science'
  | 'future-performance-science';

export const FIRST_BASKETBALL_YEAR = 1891;
export const NO_SHOT_CLOCK_FGA_RATE_MULTIPLIER = 75.4 / 86.4;
export const HISTORICAL_GAME_RULE_KEYS = [
  'gameFormat',
  'overtimeEnabled',
  'overtimeType',
  'startOfPossessionMethod',
  'maxPlayersOnCourt',
  'quarterLength',
  'numQuarters',
  'shotClockEnabled',
  'shotClockValue',
  'threePointLineEnabled',
  'fourPointLine',
  'fieldGoalValue',
  'dunkValue',
  'freeThrowsEnabled',
  'noDribbleRule',
  'dribbleRule',
  'madeBasketRestart',
  'teamFoulPenalty',
  'teamFoulPenaltyMode',
  'teamFoulPenaltyPoints',
  'temporaryDisqualificationFoulLimit',
  'temporaryDisqualificationUntilNextScore',
  'temporaryDisqualificationAllowsSubstitute',
  'foulOutLimit',
  'offensiveThreeSecondEnabled',
  'defensiveThreeSecondEnabled',
  'backcourtTimerEnabled',
  'backcourtViolationEnabled',
  'travelingEnabled',
  'doubleDribbleEnabled',
  'goaltendingEnabled',
  'outOfBoundsEnabled',
  'inboundTimerEnabled',
  'inboundTimerValue',
  'ballWeight',
  'coachChallenges',
  'maxCoachChallenges',
  'challengeReimbursed',
  'maxTimeouts',
  'clutchTimeoutLimit',
] as const;

const HISTORICAL_GAME_RULE_KEY_SET = new Set<string>(HISTORICAL_GAME_RULE_KEYS);

export function isHistoricalGameRuleKey(key: string): boolean {
  return HISTORICAL_GAME_RULE_KEY_SET.has(key);
}

export interface HistoricalBasketballGameRuleOverrides {
  historicalGameRulesVersion: number;
  historicalGameRulesAutoProgression: boolean;
  gameFormat: 'timed';
  overtimeEnabled: boolean;
  overtimeType: 'standard' | 'sudden_death';
  startOfPossessionMethod: 'jump_ball';
  maxPlayersOnCourt: number;
  quarterLength: number;
  numQuarters: number;
  shotClockEnabled: boolean;
  shotClockValue: number;
  threePointLineEnabled: boolean;
  fourPointLine: boolean;
  fieldGoalValue: 1 | 2;
  dunkValue: 1 | 2 | 3;
  freeThrowsEnabled: boolean;
  noDribbleRule: boolean;
  dribbleRule: 'none' | 'single_bounce_no_shot' | 'continuous';
  madeBasketRestart: 'center_jump' | 'inbound';
  teamFoulPenalty: number;
  teamFoulPenaltyMode: 'free_throws' | 'award_goal';
  teamFoulPenaltyPoints: number;
  temporaryDisqualificationFoulLimit: number;
  temporaryDisqualificationUntilNextScore: boolean;
  temporaryDisqualificationAllowsSubstitute: boolean;
  foulOutLimit: number;
  offensiveThreeSecondEnabled: boolean;
  defensiveThreeSecondEnabled: boolean;
  backcourtTimerEnabled: boolean;
  backcourtViolationEnabled: boolean;
  travelingEnabled: boolean;
  doubleDribbleEnabled: boolean;
  goaltendingEnabled: boolean;
  outOfBoundsEnabled: boolean;
  inboundTimerEnabled: boolean;
  inboundTimerValue: number;
  ballWeight: number;
  coachChallenges: boolean;
  maxCoachChallenges: number;
  challengeReimbursed: boolean;
  maxTimeouts: number;
  clutchTimeoutLimit: number;
}

export interface BasketballEraRules {
  key: BasketballEraKey;
  year: number;
  medicalStaffRatingMean: number;
  fatherTimeDeclineMultiplier: number;
  competitiveLongevityWeight: number;
}

const MEDICAL_MEAN_ANCHORS = [
  [1891, 28],
  [1940, 40],
  [1950, 45],
  [1960, 48],
  [1970, 52],
  [1980, 57],
  [1990, 62],
  [2000, 68],
  [2010, 74],
  [2020, 80],
  [2050, 88],
  [2100, 94],
  [2150, 96],
] as const;

const FATHER_TIME_ANCHORS = [
  [1891, 1.28],
  [1940, 1.18],
  [1950, 1.15],
  [1970, 1.11],
  [1990, 1.07],
  [2010, 1.03],
  [2020, 1.01],
  [2026, 1],
  [2050, 0.91],
  [2100, 0.78],
  [2150, 0.7],
] as const;

const WINNING_WEIGHT_ANCHORS = [
  [1891, 0.01],
  [1950, 0.02],
  [2000, 0.04],
  [2026, 0.06],
  [2050, 0.11],
  [2100, 0.2],
  [2150, 0.26],
] as const;

function interpolate(anchors: readonly (readonly [number, number])[], year: number): number {
  if (year <= anchors[0][0]) return anchors[0][1];
  for (let index = 1; index < anchors.length; index += 1) {
    const [rightYear, rightValue] = anchors[index];
    const [leftYear, leftValue] = anchors[index - 1];
    if (year > rightYear) continue;
    const progress = (year - leftYear) / (rightYear - leftYear);
    return leftValue + (rightValue - leftValue) * progress;
  }
  return anchors[anchors.length - 1][1];
}

function eraKey(year: number): BasketballEraKey {
  if (year <= 1900) return 'naismith-foundation';
  if (year <= 1945) return 'early-professional';
  if (year <= 1953) return 'pre-shot-clock';
  if (year <= 1989) return 'post-shot-clock';
  if (year <= 2009) return 'modern-training';
  if (year <= 2034) return 'sports-science';
  return 'future-performance-science';
}

export function getBasketballEraRules(year: number): BasketballEraRules {
  const resolvedYear = Number.isFinite(year) ? Math.round(year) : 2026;
  return {
    key: eraKey(resolvedYear),
    year: resolvedYear,
    medicalStaffRatingMean: Math.round(interpolate(MEDICAL_MEAN_ANCHORS, resolvedYear)),
    fatherTimeDeclineMultiplier: interpolate(FATHER_TIME_ANCHORS, resolvedYear),
    competitiveLongevityWeight: interpolate(WINNING_WEIGHT_ANCHORS, resolvedYear),
  };
}

export function getHistoricalBasketballGameRuleOverrides(year: number): HistoricalBasketballGameRuleOverrides {
  const resolvedYear = Number.isFinite(year) ? Math.max(FIRST_BASKETBALL_YEAR, Math.round(year)) : 2026;
  const originalRules = resolvedYear <= 1893;
  const freeThrowsEnabled = resolvedYear >= 1894;
  const fiveOnFive = resolvedYear >= 1897;
  const dribbleRule = resolvedYear < 1901
    ? 'none'
    : resolvedYear < 1909
      ? 'single_bounce_no_shot'
      : 'continuous';
  return {
    historicalGameRulesVersion: 2,
    historicalGameRulesAutoProgression: true,
    gameFormat: 'timed',
    overtimeEnabled: true,
    overtimeType: originalRules ? 'sudden_death' : 'standard',
    startOfPossessionMethod: 'jump_ball',
    maxPlayersOnCourt: fiveOnFive ? 5 : 9,
    quarterLength: originalRules ? 15 : 12,
    numQuarters: originalRules ? 2 : 4,
    shotClockEnabled: resolvedYear >= 1954,
    shotClockValue: 24,
    threePointLineEnabled: resolvedYear >= 1979,
    fourPointLine: false,
    fieldGoalValue: resolvedYear >= 1896 ? 2 : 1,
    dunkValue: resolvedYear >= 1896 ? 2 : 1,
    freeThrowsEnabled,
    noDribbleRule: dribbleRule === 'none',
    dribbleRule,
    madeBasketRestart: resolvedYear >= 1938 ? 'inbound' : 'center_jump',
    teamFoulPenalty: originalRules ? 3 : 5,
    teamFoulPenaltyMode: originalRules ? 'award_goal' : 'free_throws',
    teamFoulPenaltyPoints: 1,
    temporaryDisqualificationFoulLimit: originalRules ? 2 : 0,
    temporaryDisqualificationUntilNextScore: originalRules,
    temporaryDisqualificationAllowsSubstitute: true,
    foulOutLimit: originalRules ? 99 : 6,
    offensiveThreeSecondEnabled: resolvedYear >= 1936,
    defensiveThreeSecondEnabled: resolvedYear >= 2001,
    backcourtTimerEnabled: resolvedYear >= 1933,
    backcourtViolationEnabled: resolvedYear >= 1933,
    travelingEnabled: true,
    doubleDribbleEnabled: dribbleRule !== 'none',
    goaltendingEnabled: resolvedYear >= 1944,
    outOfBoundsEnabled: true,
    inboundTimerEnabled: true,
    inboundTimerValue: 5,
    ballWeight: originalRules ? 1 : 1.4,
    coachChallenges: resolvedYear >= 2019,
    maxCoachChallenges: resolvedYear >= 2023 ? 2 : resolvedYear >= 2019 ? 1 : 0,
    challengeReimbursed: resolvedYear >= 2023,
    maxTimeouts: originalRules ? 0 : 7,
    clutchTimeoutLimit: originalRules ? 0 : 2,
  };
}

export function getEraAwareStaffRatingMean(role: string, year: number): number | null {
  const normalized = String(role ?? '').trim().toLowerCase();
  const medicalRole = normalized === 'head physio'
    || normalized === 'head physiologist'
    || normalized === 'head of sports science'
    || normalized === 'sports science head';
  return medicalRole ? getBasketballEraRules(year).medicalStaffRatingMean : null;
}

export function resolveEraAwareStaffRating(
  role: string,
  year: number,
  unitRoll: number,
  fallbackRating: number,
  marketOffset = 0,
): number {
  const mean = getEraAwareStaffRatingMean(role, year);
  if (mean == null) return fallbackRating;
  const roll = Math.max(0, Math.min(0.999999, unitRoll));
  const outlier = roll < 0.025
    ? -28 + roll * 120
    : roll > 0.975
      ? 14 + (roll - 0.975) * 120
      : (roll - 0.5) * 28;
  return Math.max(25, Math.min(99, Math.round(mean + marketOffset + outlier)));
}
