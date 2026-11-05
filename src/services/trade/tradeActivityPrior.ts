import type { GameState, LeagueStats } from '../../types';
import trainingHeatmap from '../../data/tradeActivityTraining/nba_trade_activity_heatmap.training.json';
import {
  addGameDays,
  daysBetweenGameDates,
  getDraftDate,
  getFreeAgencyStartDate,
  getTradeDeadlineDate,
  getTrainingCampDate,
  parseGameDate,
  toISODateString,
} from '../../utils/dateUtils';
import { createDeterministicRandom } from '../simulation/deterministicRandom';

export const NBA_TRADE_ACTIVITY_MODEL_VERSION = 'nba-trade-activity-v3';
const RAW_RATE_BLEND = 0.25;
export const NBA_TRADE_EXPECTED_EVENTS_PER_OPPORTUNITY = 2;
// Three overlapping offseason anchor curves are resolved by their daily max.
// 0.716 preserves the fully observed local sample's 22.6-event offseason mean.
const OFFSEASON_ANCHOR_OVERLAP_CALIBRATION = 0.716;
const COLD_DAY_ELIGIBILITY_FLOOR = 0.01;
const MAX_DAILY_OPPORTUNITIES = 4;

type ActivityBand = 'cold' | 'cool' | 'warm' | 'hot' | 'peak';
type ActivityPoint = {
  offset: number;
  tradeEvents: number;
  seasonsObserved: number;
  tradeEventsPerObservedSeason: number;
  smoothedRate: number;
  normalizedIntensity: number;
  band: ActivityBand;
};

type RelativeAnchor = 'trade-deadline' | 'draft' | 'free-agency-open' | 'training-camp';

export interface TradeActivityPrior {
  modelVersion: string;
  phase: 'in-season' | 'offseason';
  relativeAnchor: RelativeAnchor;
  relativeOffset: number;
  activityIntensity: number;
  historicalSampleCount: number;
  rawTradeEventsPerObservedSeason: number;
  smoothedTradeEventsPerObservedSeason: number;
  calibratedTradeEventRate: number;
  band: ActivityBand;
  generatorEligibilityWeight: number;
  generatorOpportunityHazard: number;
}

export interface TradeActivityDecision extends TradeActivityPrior {
  semanticSeed: string;
  eligibilityRoll: number;
  eligible: boolean;
  opportunityCount: number;
}

const deadlinePoints = new Map<number, ActivityPoint>(
  (trainingHeatmap.deadlineRelative.points as ActivityPoint[]).map(point => [point.offset, point]),
);
const offseasonPoints = {
  draft: new Map<number, ActivityPoint>(
    (trainingHeatmap.offseasonRelative.draft.points as ActivityPoint[]).map(point => [point.offset, point]),
  ),
  freeAgencyOpen: new Map<number, ActivityPoint>(
    (trainingHeatmap.offseasonRelative.freeAgencyOpen.points as ActivityPoint[]).map(point => [point.offset, point]),
  ),
  trainingCamp: new Map<number, ActivityPoint>(
    (trainingHeatmap.offseasonRelative.trainingCamp.points as ActivityPoint[]).map(point => [point.offset, point]),
  ),
};

const emptyPoint = (offset: number): ActivityPoint => ({
  offset,
  tradeEvents: 0,
  seasonsObserved: 0,
  tradeEventsPerObservedSeason: 0,
  smoothedRate: 0,
  normalizedIntensity: 0,
  band: 'cold',
});

const calibratedWeight = (
  phase: TradeActivityPrior['phase'],
  point: ActivityPoint,
  aiTradeFrequency: number,
): {
  rate: number;
  weight: number;
  hazard: number;
} => {
  const frequencyScale = Math.max(0, Math.min(2, aiTradeFrequency / 50));
  if (frequencyScale === 0) return { rate: 0, weight: 0, hazard: 0 };
  const rate = point.smoothedRate * (1 - RAW_RATE_BLEND)
    + point.tradeEventsPerObservedSeason * RAW_RATE_BLEND;
  const phaseCalibration = phase === 'offseason' ? OFFSEASON_ANCHOR_OVERLAP_CALIBRATION : 1;
  const hazard = Math.min(
    MAX_DAILY_OPPORTUNITIES,
    Math.max(COLD_DAY_ELIGIBILITY_FLOOR, rate / NBA_TRADE_EXPECTED_EVENTS_PER_OPPORTUNITY) * phaseCalibration * frequencyScale,
  );
  return {
    rate,
    weight: Math.min(1, hazard),
    hazard,
  };
};

const buildPrior = (
  phase: TradeActivityPrior['phase'],
  relativeAnchor: RelativeAnchor,
  point: ActivityPoint,
  aiTradeFrequency: number,
): TradeActivityPrior => {
  const calibrated = calibratedWeight(phase, point, aiTradeFrequency);
  return {
    modelVersion: NBA_TRADE_ACTIVITY_MODEL_VERSION,
    phase,
    relativeAnchor,
    relativeOffset: point.offset,
    activityIntensity: point.normalizedIntensity,
    historicalSampleCount: point.seasonsObserved,
    rawTradeEventsPerObservedSeason: point.tradeEventsPerObservedSeason,
    smoothedTradeEventsPerObservedSeason: point.smoothedRate,
    calibratedTradeEventRate: Number(calibrated.rate.toFixed(12)),
    band: point.band,
    generatorEligibilityWeight: Number(calibrated.weight.toFixed(12)),
    generatorOpportunityHazard: Number(calibrated.hazard.toFixed(12)),
  };
};

type PriorInput = {
  date: string | Date;
  seasonYear: number;
  leagueStats?: LeagueStats;
  aiTradeFrequency?: number;
};

export function resolveTradeActivityPrior(input: PriorInput): TradeActivityPrior {
  const current = parseGameDate(input.date);
  const currentIso = toISODateString(current);
  const aiTradeFrequency = input.aiTradeFrequency ?? 50;
  const offseasonCandidates: Array<{
    cycleYear: number;
    draft: Date;
    freeAgencyOpen: Date;
    trainingCamp: Date;
  }> = [];
  for (const cycleYear of [input.seasonYear - 1, input.seasonYear, input.seasonYear + 1]) {
    const draft = getDraftDate(cycleYear, input.leagueStats);
    const freeAgencyOpen = getFreeAgencyStartDate(cycleYear, input.leagueStats);
    const trainingCamp = getTrainingCampDate(cycleYear + 1, input.leagueStats);
    if (current >= addGameDays(draft, -30) && current <= addGameDays(trainingCamp, 30)) {
      offseasonCandidates.push({ cycleYear, draft, freeAgencyOpen, trainingCamp });
    }
  }
  if (offseasonCandidates.length > 0) {
    const cycle = offseasonCandidates.sort((left, right) => {
      const leftDistance = Math.abs(daysBetweenGameDates(left.freeAgencyOpen, current));
      const rightDistance = Math.abs(daysBetweenGameDates(right.freeAgencyOpen, current));
      return leftDistance - rightDistance || left.cycleYear - right.cycleYear;
    })[0];
    const candidates: Array<{ anchor: RelativeAnchor; point: ActivityPoint }> = [
      {
        anchor: 'draft',
        point: offseasonPoints.draft.get(Math.round(daysBetweenGameDates(cycle.draft, current)))
          ?? emptyPoint(Math.round(daysBetweenGameDates(cycle.draft, current))),
      },
      {
        anchor: 'free-agency-open',
        point: offseasonPoints.freeAgencyOpen.get(Math.round(daysBetweenGameDates(cycle.freeAgencyOpen, current)))
          ?? emptyPoint(Math.round(daysBetweenGameDates(cycle.freeAgencyOpen, current))),
      },
      {
        anchor: 'training-camp',
        point: offseasonPoints.trainingCamp.get(Math.round(daysBetweenGameDates(cycle.trainingCamp, current)))
          ?? emptyPoint(Math.round(daysBetweenGameDates(cycle.trainingCamp, current))),
      },
    ];
    const selected = candidates.sort((left, right) => {
      const rateDelta = right.point.smoothedRate - left.point.smoothedRate;
      return rateDelta || right.point.tradeEventsPerObservedSeason - left.point.tradeEventsPerObservedSeason;
    })[0];
    return buildPrior('offseason', selected.anchor, selected.point, aiTradeFrequency);
  }

  const deadline = getTradeDeadlineDate(input.seasonYear, input.leagueStats);
  const offset = Math.round(daysBetweenGameDates(deadline, currentIso));
  return buildPrior(
    'in-season',
    'trade-deadline',
    deadlinePoints.get(offset) ?? emptyPoint(offset),
    aiTradeFrequency,
  );
}

export function resolveTradeActivityDecision(input: PriorInput & { saveSeed: string }): TradeActivityDecision {
  const prior = resolveTradeActivityPrior(input);
  const date = toISODateString(parseGameDate(input.date));
  const semanticSeed = `${input.saveSeed}:${input.seasonYear}:${date}:trade-activity`;
  const eligibilityRoll = createDeterministicRandom(semanticSeed)();
  const wholeOpportunities = Math.floor(prior.generatorOpportunityHazard);
  const fractionalOpportunity = prior.generatorOpportunityHazard - wholeOpportunities;
  const opportunityCount = Math.min(
    MAX_DAILY_OPPORTUNITIES,
    wholeOpportunities + (eligibilityRoll < fractionalOpportunity ? 1 : 0),
  );
  return {
    ...prior,
    semanticSeed,
    eligibilityRoll,
    eligible: opportunityCount > 0,
    opportunityCount,
  };
}

export function usesNbaTradeActivityModel(state: Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats'>): boolean {
  const uiMode = state.leagueStats?.uiMode;
  return state.leagueType === 'modded'
    && (state.moddedLeagueBase ?? 'nba') === 'nba'
    && (uiMode == null || uiMode === 'nba');
}
