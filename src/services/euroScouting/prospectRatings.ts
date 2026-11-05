import type { GameState, NBAPlayer } from '../../types';
import { GENERATED_EXTERNAL_SCALE_ATTRS } from '../externalLeague/externalLeagueIdentity';
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';
import { fuzzRatingValue, fuzzRatingValueWithBand, getScoutedDisplayOverall, getScoutedDisplayPotential } from '../../utils/scoutingFuzz';
import type { EuroCountryProfile } from './types';
import { getAcademyBudgetStrength } from '../tycoon/economyScale';

const SKILL_ATTRIBUTES = ['ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'] as const;
const ATHLETIC_ATTRIBUTES = ['stre', 'spd', 'jmp', 'endu'] as const;
const AGE_OVR_MEAN: Record<number, number> = { 14: 28, 15: 33, 16: 41, 17: 49, 18: 57 };
const AGE_POT_GAP: Record<number, number> = { 14: 30, 15: 27, 16: 22, 17: 16, 18: 10 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const getEuroYouthAgeOverallMean = (age: number): number => AGE_OVR_MEAN[clamp(Math.round(age), 14, 18)] ?? 41;

const seededUnit = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

const seededNormal = (seed: string): number => {
  const first = Math.max(0.000001, seededUnit(`${seed}:normal-a`));
  const second = seededUnit(`${seed}:normal-b`);
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
};

export type EuroYouthRatingProjection = {
  overall: number;
  potential: number;
  rareOutlier: boolean;
};

export function projectGeneratedEuroYouthRatings(
  profile: Pick<EuroCountryProfile, 'talentRating'>,
  age: number,
  seed: string,
): EuroYouthRatingProjection {
  const boundedAge = clamp(Math.round(age), 14, 18);
  const mean = getEuroYouthAgeOverallMean(boundedAge) + (profile.talentRating - 40) * 0.2;
  const rareOutlier = seededUnit(`${seed}:rare-outlier`) < 0.003;
  const outlierBonus = rareOutlier ? 10 + seededUnit(`${seed}:rare-bonus`) * 10 : 0;
  const overall = Math.round(clamp(mean + seededNormal(`${seed}:overall`) * 5 + outlierBonus, 20, 88));
  const potentialMean = overall
    + (AGE_POT_GAP[boundedAge] ?? 18)
    + (profile.talentRating - 50) * 0.06;
  const potential = Math.round(clamp(
    Math.max(overall, potentialMean + seededNormal(`${seed}:potential`) * 5 + (rareOutlier ? 5 : 0)),
    overall,
    99,
  ));
  return { overall, potential, rareOutlier };
}

const bbgmFromVisibleRating = (value: number): number => clamp(Math.round((value - 31) / 0.88), 0, 99);

export const getEuroYouthAgeOverallBbgm = (age: number): number => bbgmFromVisibleRating(getEuroYouthAgeOverallMean(age));

function reshapeAttributes(
  rating: Record<string, unknown>,
  targetOverall: number,
  profile: Pick<EuroCountryProfile, 'talentRating' | 'athleticismRating'>,
): Record<string, unknown> {
  const targetBbgm = bbgmFromVisibleRating(targetOverall);
  const currentAverage = GENERATED_EXTERNAL_SCALE_ATTRS.reduce((total, attribute) => (
    total + Number(rating[attribute] ?? 50)
  ), 0) / GENERATED_EXTERNAL_SCALE_ATTRS.length;
  const scale = targetBbgm / Math.max(1, currentAverage);
  const next: Record<string, unknown> = { ...rating };
  for (const attribute of GENERATED_EXTERNAL_SCALE_ATTRS) {
    next[attribute] = clamp(Math.round(Number(rating[attribute] ?? 50) * scale), 1, 99);
  }
  const talentDelta = Math.round((profile.talentRating - 50) / 12);
  const athleticDelta = Math.round((profile.athleticismRating - 50) / 12);
  for (const attribute of SKILL_ATTRIBUTES) {
    next[attribute] = clamp(Number(next[attribute] ?? targetBbgm) + talentDelta, 1, 99);
  }
  for (const attribute of ATHLETIC_ATTRIBUTES) {
    next[attribute] = clamp(Number(next[attribute] ?? targetBbgm) + athleticDelta, 1, 99);
  }
  next.ovr = targetBbgm;
  return next;
}

export function calibrateGeneratedEuroScoutingProspect(
  player: NBAPlayer,
  profile: Pick<EuroCountryProfile, 'talentRating' | 'athleticismRating'>,
  age: number,
  seed: string,
): NBAPlayer & {
  euroGeneratedYouth: true;
  academyOverall: number;
  academyPotential: number;
  academyRatingVersion: 2;
} {
  const projected = projectGeneratedEuroYouthRatings(profile, age, seed);
  const latestIndex = Math.max(0, player.ratings.length - 1);
  const potentialBbgm = bbgmFromVisibleRating(projected.potential);
  const ratings = player.ratings.map((rating, index) => index === latestIndex
    ? { ...reshapeAttributes(rating, projected.overall, profile), pot: potentialBbgm }
    : rating);
  return {
    ...player,
    overallRating: bbgmFromVisibleRating(projected.overall),
    potential: potentialBbgm,
    ratings,
    euroGeneratedYouth: true,
    academyOverall: projected.overall,
    academyBaseOverall: projected.overall,
    academyDevelopmentForm: 0,
    academyPotential: projected.potential,
    academyRatingVersion: 2,
  };
}

export function getEuroYouthDisplayOverall(player: NBAPlayer): number {
  const value = Number((player as any).academyOverall);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function getEuroYouthDisplayPotential(player: NBAPlayer): number {
  const value = Number((player as any).academyPotential);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function getEuroYouthEvaluatorFuzzBand(evaluatorRating: number): number {
  return clamp(Math.round((100 - Number(evaluatorRating)) / 7), 1, 8);
}

export function getEuroYouthReportRatings(
  state: GameState,
  player: NBAPlayer,
  year: number,
  evaluatorRating?: number,
): { overall: number; potential: number } {
  const projectedOverall = getEuroYouthDisplayOverall(player);
  const projectedPotential = getEuroYouthDisplayPotential(player);
  const trueOverall = projectedOverall > 0 ? projectedOverall : getDisplayOverall(player, year);
  const truePotential = projectedPotential > 0
    ? projectedPotential
    : getDisplayPotential(player, year, year, { floorAtEstimated: true });
  if (!Number.isFinite(evaluatorRating)) {
    return {
      overall: getScoutedDisplayOverall(state, player, year),
      potential: getScoutedDisplayPotential(state, player, year, year, { floorAtEstimated: true }),
    };
  }
  const band = getEuroYouthEvaluatorFuzzBand(Number(evaluatorRating));
  const overall = fuzzRatingValueWithBand(trueOverall, state, player, 'euro-regional-overall', band);
  const potential = fuzzRatingValueWithBand(truePotential, state, player, 'euro-regional-potential', band);
  return { overall, potential: Math.max(overall, potential) };
}

export function getEuroAcademyEvaluatedRatings(
  state: GameState,
  player: NBAPlayer & { academyJoinedDay?: number; euroGeneratedYouth?: true },
  year: number,
  directorRating?: number,
): { overall: number; potential: number } {
  const trueRatings = getEuroAcademyDisplayRatings(player, year);
  const tenureDays = Math.max(0, Number(state.day ?? 0) - Number(player.academyJoinedDay ?? state.day ?? 0));
  const baseBand = Number.isFinite(directorRating) ? Math.round((100 - Number(directorRating)) / 7) : 8;
  const band = clamp(baseBand - Math.floor(tenureDays / 120), 0, 8);
  const evaluatedOverall = fuzzRatingValueWithBand(trueRatings.overall, state, player, 'euro-academy-overall', band);
  const evaluatedPotential = fuzzRatingValueWithBand(trueRatings.potential, state, player, 'euro-academy-potential', band);
  const team = [...state.teams, ...(state.nonNBATeams ?? [])]
    .find(candidate => Number('tid' in candidate ? candidate.tid : candidate.id) === Number((player as any).academyTeamId ?? state.userTeamId ?? -1));
  const age = Number.isFinite(Number(player.age))
    ? Math.round(Number(player.age))
    : Math.max(14, year - Number(player.born?.year ?? year - 16));
  const ageFloor = ({ 14: 42, 15: 46, 16: 50, 17: 54, 18: 58 } as Record<number, number>)[clamp(age, 14, 18)] ?? 46;
  const budgetStrength = getAcademyBudgetStrength(
    team?.tycoon?.academyBudget,
    team?.tycoon?.tier,
    team?.tycoon?.currentEconomyIndex ?? 1,
  );
  const sourceEvaluationFloor = player.euroGeneratedYouth
    ? 0
    : ageFloor + Math.round(budgetStrength * 5);
  const overall = Math.max(evaluatedOverall, sourceEvaluationFloor);
  const potential = Math.max(evaluatedPotential, sourceEvaluationFloor > 0 ? Math.min(99, overall + 10) : overall);
  return { overall, potential: Math.max(overall, potential) };
}

export function getEuroAcademyDisplayRatings(
  player: NBAPlayer,
  year: number,
): { overall: number; potential: number } {
  const projectedOverall = getEuroYouthDisplayOverall(player);
  const projectedPotential = getEuroYouthDisplayPotential(player);
  if (projectedOverall <= 0 || projectedPotential <= 0) {
    return {
      overall: getDisplayOverall(player, year),
      potential: getDisplayPotential(player, year, year, { floorAtEstimated: true }),
    };
  }
  return { overall: projectedOverall, potential: Math.max(projectedOverall, projectedPotential) };
}

export function progressGeneratedEuroYouthProjection(
  player: NBAPlayer,
  developmentMultiplier: number,
  date: string,
): NBAPlayer {
  const overall = getEuroYouthDisplayOverall(player);
  const potential = getEuroYouthDisplayPotential(player);
  if (overall <= 0 || potential <= 0) return player;
  const age = Number(player.age ?? 16);
  const annualGrowth = age <= 14 ? 6 : age === 15 ? 8 : age === 16 ? 9 : age === 17 ? 9 : 3;
  const previousForm = Number.isFinite(Number(player.academyDevelopmentForm))
    ? Number(player.academyDevelopmentForm)
    : 0;
  const baseOverall = Number.isFinite(Number(player.academyBaseOverall))
    ? Number(player.academyBaseOverall)
    : overall - previousForm;
  const intensityMultiplier =
    player.trainingIntensity === 'Rest' ? 0.3 :
    player.trainingIntensity === 'Half' ? 0.7 :
    player.trainingIntensity === 'Double' ? 1.35 :
    1;
  const focusMultiplier = player.devFocus && player.devFocus !== 'Balanced' ? 1.06 : 1;
  const nextBaseOverall = Math.min(
    potential,
    baseOverall + annualGrowth * clamp(developmentMultiplier, 0.5, 1.8) * intensityMultiplier * focusMultiplier / 365,
  );
  const month = date.slice(0, 7);
  const formMonth = player.academyDevelopmentFormMonth;
  const targetForm = clamp(seededNormal(`${player.internalId}:${month}:academy-form`) * 1.05, -1.8, 1.8);
  const nextForm = formMonth === month
    ? previousForm
    : clamp(previousForm * 0.35 + targetForm * 0.65, -1.8, 1.8);
  return {
    ...player,
    academyBaseOverall: nextBaseOverall,
    academyDevelopmentForm: nextForm,
    academyDevelopmentFormMonth: month,
    academyOverall: clamp(nextBaseOverall + nextForm, 20, potential),
    academyRatingVersion: 2,
  } as NBAPlayer;
}

export function materializeGeneratedEuroYouthRatings(player: NBAPlayer): NBAPlayer {
  const overall = getEuroYouthDisplayOverall(player);
  const potential = getEuroYouthDisplayPotential(player);
  if (overall <= 0 || potential <= 0 || player.ratings.length === 0) return player;
  const latestIndex = player.ratings.length - 1;
  const targetBbgm = bbgmFromVisibleRating(overall);
  const rating = reshapeAttributes(player.ratings[latestIndex], overall, {
    talentRating: 50,
    athleticismRating: 50,
  });
  const ratings = player.ratings.map((row, index) => index === latestIndex
    ? { ...rating, ovr: targetBbgm, pot: bbgmFromVisibleRating(potential) }
    : row);
  return {
    ...player,
    overallRating: targetBbgm,
    potential: bbgmFromVisibleRating(potential),
    ratings,
  };
}
