import type { LeagueStats } from '../types';

export interface GameTimingConfig {
  numQuarters: number;
  quarterLengthSeconds: number;
  overtimeLengthSeconds: number;
}

const clampPositiveInt = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export function getGameTimingConfig(leagueStats?: Partial<LeagueStats> | null): GameTimingConfig {
  return {
    numQuarters: clampPositiveInt(leagueStats?.numQuarters, 4),
    quarterLengthSeconds: clampPositiveInt(leagueStats?.quarterLength, 12) * 60,
    overtimeLengthSeconds: clampPositiveInt(leagueStats?.overtimeDuration, 5) * 60,
  };
}

export function getPeriodDurationSeconds(period: number, config: GameTimingConfig): number {
  return period <= config.numQuarters
    ? config.quarterLengthSeconds
    : config.overtimeLengthSeconds;
}

export function getPeriodStartSeconds(period: number, config: GameTimingConfig): number {
  if (period <= config.numQuarters) {
    return (period - 1) * config.quarterLengthSeconds;
  }
  return (
    config.numQuarters * config.quarterLengthSeconds +
    (period - config.numQuarters - 1) * config.overtimeLengthSeconds
  );
}

export function getPeriodLabel(period: number, numQuarters: number = 4): string {
  if (period > numQuarters) {
    const ot = period - numQuarters;
    return ot === 1 ? 'OT' : `OT${ot}`;
  }
  const suffix = period === 1 ? 'ST' : period === 2 ? 'ND' : period === 3 ? 'RD' : 'TH';
  return `${period}${suffix}`;
}

export function getFinalStatusLabel(otCount: number = 0): string {
  if (!otCount) return 'FINAL';
  return `FINAL/${otCount > 1 ? otCount : ''}OT`;
}

export function formatClockSeconds(seconds: number): string {
  const safe = Math.max(0, seconds);
  if (safe <= 60 && safe > 0) {
    const whole = Math.floor(safe);
    const tenths = Math.floor((safe % 1) * 10);
    return `${whole}.${tenths}`;
  }
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function getPeriodStartClock(period: number, config: GameTimingConfig): string {
  const duration = getPeriodDurationSeconds(period, config);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
