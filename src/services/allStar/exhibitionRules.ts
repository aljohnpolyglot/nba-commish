import type { LeagueStats } from '../../types';

export type ExhibitionEvent = 'allStar' | 'risingStars' | 'celebrity';

export interface ExhibitionRulesPack {
  gameFormat: 'timed' | 'target_score' | 'elam_ending';
  targetScore: number;
  quarterLength: number;
  numQuarters: number;
  overtimeDuration: number;
}

export function resolveExhibitionRules(
  leagueStats: Partial<LeagueStats> | any = {},
  event: ExhibitionEvent,
): ExhibitionRulesPack {
  const config = {
    allStar: {
      mirror: leagueStats.allStarMirrorLeagueRules,
      gameFormat: leagueStats.allStarGameFormat,
      targetScore: leagueStats.allStarGameTargetScore,
      quarterLength: leagueStats.allStarQuarterLength,
      numQuarters: leagueStats.allStarNumQuarters,
      overtimeDuration: leagueStats.allStarOvertimeDuration,
    },
    risingStars: {
      mirror: leagueStats.risingStarsMirrorLeagueRules,
      gameFormat: 'timed',
      targetScore: 40,
      quarterLength: leagueStats.risingStarsQuarterLength,
      numQuarters: leagueStats.risingStarsNumQuarters,
      overtimeDuration: leagueStats.risingStarsOvertimeDuration,
    },
    celebrity: {
      mirror: leagueStats.celebrityGameMirrorLeagueRules ?? true,
      gameFormat: 'timed',
      targetScore: 100,
      quarterLength: leagueStats.celebrityGameQuarterLength,
      numQuarters: leagueStats.celebrityGameNumQuarters,
      overtimeDuration: leagueStats.celebrityGameOvertimeDuration,
    },
  }[event];

  if (config.mirror) {
    return {
      gameFormat: (leagueStats.gameFormat ?? 'timed') as 'timed' | 'target_score' | 'elam_ending',
      targetScore: leagueStats.gameTargetScore ?? 100,
      quarterLength: leagueStats.quarterLength ?? 12,
      numQuarters: leagueStats.numQuarters ?? 4,
      overtimeDuration: leagueStats.overtimeDuration ?? 5,
    };
  }

  return {
    gameFormat: (config.gameFormat ?? 'timed') as 'timed' | 'target_score' | 'elam_ending',
    targetScore: config.targetScore ?? 100,
    quarterLength: config.quarterLength ?? 3,
    numQuarters: config.numQuarters ?? 4,
    overtimeDuration: config.overtimeDuration ?? 5,
  };
}

export function getExhibitionQL(
  leagueStats: Partial<LeagueStats> | any = {},
  event: ExhibitionEvent,
): number {
  return resolveExhibitionRules(leagueStats, event).quarterLength;
}
