import type { LeagueStats } from '../../types';
import {
  getHistoricalNbaCalibrationSpan,
  getHistoricalNbaEraContext,
} from '../../data/historicalNbaSeasons';

export interface EraCoachingBias {
  eraKey?: string;
  startYear?: number;
  tempoMultiplier: number;
  rimRateMultiplier: number;
  lowPostRateMultiplier: number;
  midRangeRateMultiplier: number;
  outsideRateMultiplier: number;
  primaryOptionUsageMultiplier: number;
  starMpgTarget?: number;
  maxPlayerMinutes?: number;
}

export const NEUTRAL_ERA_COACHING_BIAS: EraCoachingBias = {
  tempoMultiplier: 1,
  rimRateMultiplier: 1,
  lowPostRateMultiplier: 1,
  midRangeRateMultiplier: 1,
  outsideRateMultiplier: 1,
  primaryOptionUsageMultiplier: 1,
};

export const PBA_COACHING_BIAS: EraCoachingBias = {
  tempoMultiplier: 0.95,
  rimRateMultiplier: 0.98,
  lowPostRateMultiplier: 0.95,
  midRangeRateMultiplier: 1.08,
  outsideRateMultiplier: 0.96,
  primaryOptionUsageMultiplier: 1,
};

export interface EraShotDistributionInput {
  shotInside: number;
  shotClose: number;
  shotMedium: number;
  shot3pt: number;
}

export interface FastEraSimulationAdapter {
  efficiencyMultiplier: number;
  threePointRateMultiplier: number;
  threePointEfficiencyMultiplier: number;
  freeThrowRateMultiplier: number;
  threePointSkillExponentMultiplier?: number;
  threePointPersonalCapMultiplier?: number;
}

function getRawFastEraSimulationAdapter(
  bias: EraCoachingBias,
  leagueEfficiencyMultiplier: number,
): FastEraSimulationAdapter {
  switch (bias.eraKey) {
    case 'pre_shot_clock':
    case 'pre_three_point':
      return {
        efficiencyMultiplier: Math.pow(leagueEfficiencyMultiplier, 0.7),
        threePointRateMultiplier: 1,
        threePointEfficiencyMultiplier: 1,
        freeThrowRateMultiplier: bias.startYear != null && bias.startYear < 1960 ? 0.92 : 1,
      };
    case 'early_three':
      return {
        efficiencyMultiplier: 1.04,
        threePointRateMultiplier: bias.startYear != null && bias.startYear <= 1980 ? 0.65 : 1,
        threePointEfficiencyMultiplier: 0.75,
        freeThrowRateMultiplier: 1.02,
        threePointSkillExponentMultiplier: bias.startYear != null && bias.startYear <= 1980 ? 0.70 : 1,
      };
    case 'physical_nineties':
      return {
        efficiencyMultiplier: 1.17,
        threePointRateMultiplier: 0.80,
        threePointEfficiencyMultiplier: 0.84,
        freeThrowRateMultiplier: 1.03,
      };
    case 'deadball':
      return {
        efficiencyMultiplier: 1.22,
        threePointRateMultiplier: 0.74,
        threePointEfficiencyMultiplier: 0.87,
        freeThrowRateMultiplier: 1.03,
      };
    case 'pace_and_space':
      return {
        efficiencyMultiplier: 1.11,
        threePointRateMultiplier: 0.88,
        threePointEfficiencyMultiplier: 0.89,
        freeThrowRateMultiplier: 0.96,
        threePointPersonalCapMultiplier: 1.70,
      };
    default:
      return {
        efficiencyMultiplier: 1,
        threePointRateMultiplier: 1,
        threePointEfficiencyMultiplier: 1,
        freeThrowRateMultiplier: 1,
      };
  }
}

function blendAdapters(
  left: FastEraSimulationAdapter,
  right: FastEraSimulationAdapter,
  progress: number,
): FastEraSimulationAdapter {
  const blended = {} as Record<string, number>;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const from = Number((left as unknown as Record<string, number | undefined>)[key] ?? 1);
    const to = Number((right as unknown as Record<string, number | undefined>)[key] ?? 1);
    blended[key] = from + (to - from) * progress;
  }
  return blended as unknown as FastEraSimulationAdapter;
}

export function getFastEraSimulationAdapter(
  bias: EraCoachingBias,
  leagueEfficiencyMultiplier: number,
): FastEraSimulationAdapter {
  if (bias.startYear == null || !bias.eraKey) {
    return getRawFastEraSimulationAdapter(bias, leagueEfficiencyMultiplier);
  }
  const { leftYear, rightYear, progress } = getHistoricalNbaCalibrationSpan(bias.startYear);
  if (leftYear === rightYear || progress === 0 || progress === 1) {
    return getRawFastEraSimulationAdapter(bias, leagueEfficiencyMultiplier);
  }
  const adapterForYear = (year: number) => getRawFastEraSimulationAdapter({
    ...bias,
    eraKey: getHistoricalNbaEraContext(year).key,
    startYear: year,
  }, leagueEfficiencyMultiplier);
  return blendAdapters(adapterForYear(leftYear), adapterForYear(rightYear), progress);
}

function getRawRealisticEraTempoAdapter(bias: EraCoachingBias): number {
  switch (bias.eraKey) {
    case 'pre_shot_clock': return 1.08;
    case 'pre_three_point': return bias.startYear != null && bias.startYear < 1960 ? 1.08 : 1;
    case 'early_three': return 1.06;
    case 'physical_nineties': return 1.04;
    case 'deadball': return 1.06;
    default: return 1;
  }
}

export function getRealisticEraTempoAdapter(bias: EraCoachingBias): number {
  if (bias.startYear == null || !bias.eraKey) return getRawRealisticEraTempoAdapter(bias);
  const { leftYear, rightYear, progress } = getHistoricalNbaCalibrationSpan(bias.startYear);
  if (leftYear === rightYear || progress === 0 || progress === 1) {
    return getRawRealisticEraTempoAdapter(bias);
  }
  const valueForYear = (year: number) => getRawRealisticEraTempoAdapter({
    ...bias,
    eraKey: getHistoricalNbaEraContext(year).key,
    startYear: year,
  });
  const left = valueForYear(leftYear);
  return left + (valueForYear(rightYear) - left) * progress;
}

export function getFastEraAssistDistributionExponent(
  bias: EraCoachingBias,
  configured = 1,
): number {
  if (!bias.eraKey) return configured;
  return Math.max(0.5, 1 - (1 - configured) * 1.6);
}

export function getFastEraReboundDistributionExponent(
  bias: EraCoachingBias,
  configured?: number,
): number | undefined {
  if (!bias.eraKey) return configured;
  const raw = (yearBias: EraCoachingBias, value?: number): number | undefined => {
    if (yearBias.eraKey === 'pre_three_point') {
      return yearBias.startYear != null && yearBias.startYear < 1960 ? 2.2 : 1.95;
    }
    if (yearBias.eraKey === 'pace_and_space') return 2.15;
    return value;
  };
  if (bias.startYear == null) return raw(bias, configured);
  const { leftYear, rightYear, progress } = getHistoricalNbaCalibrationSpan(bias.startYear);
  if (leftYear === rightYear || progress === 0 || progress === 1) return raw(bias, configured);
  const valueForYear = (year: number) => {
    const context = getHistoricalNbaEraContext(year);
    return raw({ ...bias, eraKey: context.key, startYear: year }, context.sim.reboundDistributionExponent) ?? 2.75;
  };
  const left = valueForYear(leftYear);
  return left + (valueForYear(rightYear) - left) * progress;
}

export function getRealisticEraReboundDistributionExponent(
  bias: EraCoachingBias | undefined,
  configured?: number,
): number | undefined {
  if (!bias?.eraKey || bias.startYear == null) return configured;
  const { leftYear, rightYear, progress } = getHistoricalNbaCalibrationSpan(bias.startYear);
  if (leftYear === rightYear || progress === 0 || progress === 1) return configured;
  const valueForYear = (year: number) => getHistoricalNbaEraContext(year).sim.reboundDistributionExponent ?? 2.35;
  const left = valueForYear(leftYear);
  return left + (valueForYear(rightYear) - left) * progress;
}

function interpolateHistoricalAdapter(
  bias: EraCoachingBias,
  raw: (bias: EraCoachingBias) => number,
): number {
  if (!bias.eraKey || bias.startYear == null) return raw(bias);
  const { leftYear, rightYear, progress } = getHistoricalNbaCalibrationSpan(bias.startYear);
  if (leftYear === rightYear || progress === 0 || progress === 1) return raw(bias);
  const valueForYear = (year: number) => raw({
    ...bias,
    eraKey: getHistoricalNbaEraContext(year).key,
    startYear: year,
  });
  const left = valueForYear(leftYear);
  return left + (valueForYear(rightYear) - left) * progress;
}

export function getRealisticEraEfficiencyExponent(bias: EraCoachingBias): number {
  return interpolateHistoricalAdapter(bias, yearBias => (
    yearBias.eraKey === 'pre_shot_clock'
      ? 2.2
      : yearBias.startYear != null && yearBias.startYear < 1960
        ? 2.1
        : 2.4
  ));
}

export function getRealisticEraFreeThrowResponse(bias: EraCoachingBias): number {
  return interpolateHistoricalAdapter(bias, yearBias => {
    const lateHistoricalEra = ['early_three', 'physical_nineties', 'deadball', 'seven_seconds', 'pace_and_space', 'modern_spacing']
      .includes(yearBias.eraKey ?? '');
    if (lateHistoricalEra) return 1;
    return yearBias.eraKey === 'pre_three_point' ? 0 : 0.15;
  });
}

export function getFastEraInteriorBlockMissShare(bias: EraCoachingBias): number {
  return interpolateHistoricalAdapter(
    bias,
    yearBias => yearBias.eraKey && !['pre_shot_clock', 'pre_three_point'].includes(yearBias.eraKey) ? 0.12 : 0.20,
  );
}

const clampSlider = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export function applyEraTempoBias(
  value: number,
  leagueStats?: Partial<LeagueStats> | null,
): number {
  const bias = buildEraCoachingBiasFromLeagueStats(leagueStats);
  if (!bias) return clampSlider(value);
  return clampSlider(value + (bias.tempoMultiplier - 1) * 250);
}

function clampMultiplier(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(min, Math.min(max, value));
}

function renormalizeShots<T extends EraShotDistributionInput>(
  shots: T,
  bias: EraCoachingBias,
): T {
  const raw = {
    shotInside: Math.max(0, shots.shotInside * bias.rimRateMultiplier),
    shotClose: Math.max(0, shots.shotClose * bias.lowPostRateMultiplier),
    shotMedium: Math.max(0, shots.shotMedium * bias.midRangeRateMultiplier),
    shot3pt: Math.max(0, shots.shot3pt * bias.outsideRateMultiplier),
  };
  const total = raw.shotInside + raw.shotClose + raw.shotMedium + raw.shot3pt || 1;
  const next = {
    shotInside: Math.round((raw.shotInside / total) * 100),
    shotClose: Math.round((raw.shotClose / total) * 100),
    shotMedium: Math.round((raw.shotMedium / total) * 100),
    shot3pt: Math.round((raw.shot3pt / total) * 100),
  };
  const delta = 100 - (next.shotInside + next.shotClose + next.shotMedium + next.shot3pt);
  if (delta !== 0) {
    const target = Object.entries(raw)
      .filter(([key]) => bias.outsideRateMultiplier >= 1 || key !== 'shot3pt')
      .sort((a, b) => b[1] - a[1])[0]?.[0] as keyof EraShotDistributionInput | undefined;
    if (target) next[target] += delta;
  }
  return { ...shots, ...next };
}

export function applyEraShotDistributionBias<T extends EraShotDistributionInput>(
  shots: T,
  leagueStats?: Partial<LeagueStats> | null,
): T {
  const bias = buildEraCoachingBiasFromLeagueStats(leagueStats);
  if (!bias) return shots;
  if (
    bias.rimRateMultiplier === 1 &&
    bias.lowPostRateMultiplier === 1 &&
    bias.midRangeRateMultiplier === 1 &&
    bias.outsideRateMultiplier === 1
  ) {
    return shots;
  }
  return renormalizeShots(shots, bias);
}

export function buildEraCoachingBiasFromLeagueStats(
  leagueStats?: Partial<LeagueStats> | null,
): EraCoachingBias | undefined {
  const isPbaIsolated = leagueStats?.uiMode === 'pba_isolated';
  const hasHistoricalBias = !!leagueStats?.historicalEraKey || leagueStats?.historicalEraStartYear != null;
  if (!hasHistoricalBias && !isPbaIsolated) return undefined;

  const lowPost = clampMultiplier(leagueStats?.historicalLowPostRateMultiplier ?? 1, 0.65, 1.55);
  const midRange = clampMultiplier(leagueStats?.historicalMidRangeRateMultiplier ?? 1, 0.65, 1.55);
  const insideTilt = (lowPost + midRange) / 2;

  const historicalBias = hasHistoricalBias ? {
    eraKey: leagueStats?.historicalEraKey,
    startYear: leagueStats?.historicalEraStartYear,
    tempoMultiplier: clampMultiplier(leagueStats?.historicalPaceMultiplier ?? 1, 0.72, 1.50),
    rimRateMultiplier: clampMultiplier(1 + (insideTilt - 1) * 0.4, 0.75, 1.25),
    lowPostRateMultiplier: lowPost,
    midRangeRateMultiplier: midRange,
    outsideRateMultiplier: clampMultiplier(leagueStats?.historicalThreePointRateMultiplier ?? 1, 0, 1.6),
    primaryOptionUsageMultiplier: historicalPrimaryUsageMultiplier(leagueStats?.historicalEraStartYear),
    starMpgTarget: historicalRotationDefaults(leagueStats?.historicalEraStartYear).starMpgTarget,
    maxPlayerMinutes: historicalRotationDefaults(leagueStats?.historicalEraStartYear).maxPlayerMinutes,
  } : NEUTRAL_ERA_COACHING_BIAS;

  if (!isPbaIsolated) return historicalBias;

  return {
    eraKey: historicalBias.eraKey,
    startYear: historicalBias.startYear,
    tempoMultiplier: clampMultiplier(historicalBias.tempoMultiplier * PBA_COACHING_BIAS.tempoMultiplier, 0.72, 1.35),
    rimRateMultiplier: clampMultiplier(historicalBias.rimRateMultiplier * PBA_COACHING_BIAS.rimRateMultiplier, 0.75, 1.35),
    lowPostRateMultiplier: clampMultiplier(historicalBias.lowPostRateMultiplier * PBA_COACHING_BIAS.lowPostRateMultiplier, 0.65, 1.65),
    midRangeRateMultiplier: clampMultiplier(historicalBias.midRangeRateMultiplier * PBA_COACHING_BIAS.midRangeRateMultiplier, 0.65, 1.65),
    outsideRateMultiplier: clampMultiplier(historicalBias.outsideRateMultiplier * PBA_COACHING_BIAS.outsideRateMultiplier, 0, 1.6),
    primaryOptionUsageMultiplier: historicalBias.primaryOptionUsageMultiplier,
    starMpgTarget: historicalBias.starMpgTarget,
    maxPlayerMinutes: historicalBias.maxPlayerMinutes,
  };
}

function rawHistoricalPrimaryUsageMultiplier(startYear: number): number {
  if (startYear < 1954) return 1.00;
  if (startYear < 1960) return 1.05;
  if (startYear < 1970) return 1.23;
  if (startYear < 1980) return 1.08;
  return 1;
}

function historicalPrimaryUsageMultiplier(startYear?: number): number {
  if (startYear == null) return 1;
  const { leftYear, rightYear, progress } = getHistoricalNbaCalibrationSpan(startYear);
  const left = rawHistoricalPrimaryUsageMultiplier(leftYear);
  return left + (rawHistoricalPrimaryUsageMultiplier(rightYear) - left) * progress;
}

function rawHistoricalRotationDefaults(startYear: number): Required<Pick<EraCoachingBias, 'starMpgTarget' | 'maxPlayerMinutes'>> {
  if (startYear < 1954) return { starMpgTarget: 42, maxPlayerMinutes: 45 };
  if (startYear < 1960) return { starMpgTarget: 41, maxPlayerMinutes: 44 };
  if (startYear < 1970) return { starMpgTarget: 47, maxPlayerMinutes: 48 };
  if (startYear < 1980) return { starMpgTarget: 41, maxPlayerMinutes: 44 };
  if (startYear < 1990) return { starMpgTarget: 39, maxPlayerMinutes: 42 };
  if (startYear < 2000) return { starMpgTarget: 38, maxPlayerMinutes: 41 };
  return { starMpgTarget: 36, maxPlayerMinutes: 40 };
}

function historicalRotationDefaults(startYear?: number): Pick<EraCoachingBias, 'starMpgTarget' | 'maxPlayerMinutes'> {
  if (startYear == null) return {};
  const { leftYear, rightYear, progress } = getHistoricalNbaCalibrationSpan(startYear);
  const left = rawHistoricalRotationDefaults(leftYear);
  const right = rawHistoricalRotationDefaults(rightYear);
  return {
    starMpgTarget: left.starMpgTarget + (right.starMpgTarget - left.starMpgTarget) * progress,
    maxPlayerMinutes: left.maxPlayerMinutes + (right.maxPlayerMinutes - left.maxPlayerMinutes) * progress,
  };
}
