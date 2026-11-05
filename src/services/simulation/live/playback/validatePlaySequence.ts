import type { PlayLine } from './playRenderer';

export type PlaySequenceIssue = {
  code: 'clock_regression';
  sequenceIndex: number;
  period: string;
  previousClock: string;
  clock: string;
};

const clockSeconds = (clock: string): number => {
  const [minutes, seconds] = String(clock).split(':').map(Number);
  return (Number.isFinite(minutes) ? minutes : 0) * 60 + (Number.isFinite(seconds) ? seconds : 0);
};

const formatClock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, '0')}`;

export function validateAndNormalizePlaySequence(lines: readonly PlayLine[]): { plays: PlayLine[]; issues: PlaySequenceIssue[] } {
  const issues: PlaySequenceIssue[] = [];
  const stable = lines.map((line, sourceIndex) => ({ line, sourceIndex }))
    .sort((left, right) => (left.line.gs ?? 0) - (right.line.gs ?? 0) || left.sourceIndex - right.sourceIndex);
  const lastClockByPeriod = new Map<string, number>();
  const plays = stable.map(({ line }, sequenceIndex) => {
    const seconds = clockSeconds(line.clock);
    const previous = lastClockByPeriod.get(line.period);
    if (previous != null && seconds > previous) {
      issues.push({
        code: 'clock_regression',
        sequenceIndex,
        period: line.period,
        previousClock: formatClock(previous),
        clock: line.clock,
      });
      return { ...line, clock: formatClock(previous), time: `${line.period} ${formatClock(previous)}`, sequenceIndex };
    }
    lastClockByPeriod.set(line.period, seconds);
    return { ...line, sequenceIndex };
  });
  return { plays, issues };
}

