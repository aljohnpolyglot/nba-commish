import type { NBAGMStat } from '../types';

export const ADVANCED_STAT_FORMULA_VERSION = 5;
export const LEGACY_SIM_PER_SCALE = 1.4;
const ELITE_PER_THRESHOLD = 30;
const ELITE_PER_SLOPE = 0.4;
const EWA_REPLACEMENT_LEVEL = 11;
const MINUTES_PER_GAME = 48;
const EWA_MINUTES_PER_WIN = 42;

type AdvancedStatLike = Partial<NBAGMStat>;

export function isSimulatorAdvancedStat(stat: AdvancedStatLike): boolean {
  return Number(stat._advancedStatVersion ?? 0) > 0 || '_perSum' in stat;
}

export function calculateIndividualOrtg(stat: Pick<NBAGMStat, 'pts' | 'fga' | 'fta' | 'tov'>): number {
  const possessions = Number(stat.fga ?? 0) + 0.44 * Number(stat.fta ?? 0) + Number(stat.tov ?? 0);
  return possessions > 0 ? (Number(stat.pts ?? 0) * 100) / possessions : 0;
}

function softenElitePer(per: number): number {
  return per <= ELITE_PER_THRESHOLD
    ? per
    : ELITE_PER_THRESHOLD + (per - ELITE_PER_THRESHOLD) * ELITE_PER_SLOPE;
}

function rotationPerUplift(per: number): number {
  if (per <= 8 || per >= 22) return 0;
  if (per <= 10.5) return ((per - 8) / 2.5) * 1.2;
  if (per <= 12) return 1.2 + ((per - 10.5) / 1.5) * 1.5;
  if (per <= 16) return 2.7 - ((per - 12) / 4) * 0.5;
  return 2.2 * (1 - (per - 16) / 6);
}

function calibrateLegacyScaledPer(per: number): number {
  return per + rotationPerUplift(per);
}

export function calibrateRawSimulatorPer(per: number): number {
  if (!Number.isFinite(per)) return 0;
  return calibrateLegacyScaledPer(softenElitePer(per * LEGACY_SIM_PER_SCALE));
}

export function calibrateStoredSimulatorPer(per: number, version: number): number {
  if (!Number.isFinite(per)) return 0;
  if (version >= ADVANCED_STAT_FORMULA_VERSION) return per;
  if (version === 3) return calibrateLegacyScaledPer(per);
  if (version === 2) return calibrateRawSimulatorPer(per);
  return calibrateLegacyScaledPer(softenElitePer(per));
}

export function getCalibratedPer(stat: AdvancedStatLike): number {
  const per = Number(stat.per ?? 0);
  if (!Number.isFinite(per)) return 0;
  if (!isSimulatorAdvancedStat(stat)) return per;
  return calibrateStoredSimulatorPer(per, Number(stat._advancedStatVersion ?? 0));
}

export function calculateEwaFromPer(per: number, minutes: number): number {
  if (!Number.isFinite(per) || !Number.isFinite(minutes)) return 0;
  return (per - EWA_REPLACEMENT_LEVEL) * (minutes / MINUTES_PER_GAME) / EWA_MINUTES_PER_WIN;
}

export function getCalibratedEwa(stat: AdvancedStatLike): number {
  const stored = Number(stat.ewa ?? 0);
  if (!isSimulatorAdvancedStat(stat)) return Number.isFinite(stored) ? stored : 0;
  if (Number(stat._advancedStatVersion ?? 0) >= ADVANCED_STAT_FORMULA_VERSION) {
    return Number.isFinite(stored) ? stored : 0;
  }
  return calculateEwaFromPer(getCalibratedPer(stat), Number(stat.min ?? 0));
}

export function getCalibratedOrtg(stat: AdvancedStatLike): number {
  const stored = Number(stat.ortg ?? 0);
  if (!isSimulatorAdvancedStat(stat)) return Number.isFinite(stored) ? stored : 0;
  return calculateIndividualOrtg(stat as Pick<NBAGMStat, 'pts' | 'fga' | 'fta' | 'tov'>);
}
