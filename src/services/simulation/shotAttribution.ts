import type { GameResult, PlayerGameStats } from '../../types';

export type CanonicalTeamShotStats = {
  pointsInPaint: number;
  paintMakes: number;
  paintAttempts: number;
};

export type CanonicalShotEvent = {
  made: boolean;
  shotValue: number;
  location: 'paint' | 'midrange' | 'three' | 'four' | 'free_throw';
};

export function attributeShot(events: readonly CanonicalShotEvent[]): CanonicalTeamShotStats {
  const paint = events.filter(event => event.location === 'paint' && event.shotValue === 2);
  const paintMakes = paint.filter(event => event.made).length;
  return { pointsInPaint: paintMakes * 2, paintMakes, paintAttempts: paint.length };
}

export function playerLinesToCanonicalShotStats(lines: readonly PlayerGameStats[]): CanonicalTeamShotStats {
  const paintMakes = lines.reduce((total, line) => total + (line.fgAtRim ?? 0) + (line.fgLowPost ?? 0), 0);
  const paintAttempts = lines.reduce((total, line) => total + (line.fgaAtRim ?? 0) + (line.fgaLowPost ?? 0), 0);
  return { pointsInPaint: paintMakes * 2, paintMakes, paintAttempts };
}

export function attachCanonicalShotStats<T extends GameResult>(result: T): T {
  return {
    ...result,
    teamShotStats: {
      home: playerLinesToCanonicalShotStats(result.homeStats),
      away: playerLinesToCanonicalShotStats(result.awayStats),
    },
  };
}

