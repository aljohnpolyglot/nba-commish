import type { LeagueStats } from '../../types';

export type ExhibitionEvent = 'allStar' | 'risingStars' | 'celebrity';

export interface ExhibitionRulesPack {
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
      quarterLength: leagueStats.allStarQuarterLength,
      numQuarters: leagueStats.allStarNumQuarters,
      overtimeDuration: leagueStats.allStarOvertimeDuration,
    },
    risingStars: {
      mirror: leagueStats.risingStarsMirrorLeagueRules,
      quarterLength: leagueStats.risingStarsQuarterLength,
      numQuarters: leagueStats.risingStarsNumQuarters,
      overtimeDuration: leagueStats.risingStarsOvertimeDuration,
    },
    celebrity: {
      mirror: leagueStats.celebrityGameMirrorLeagueRules,
      quarterLength: leagueStats.celebrityGameQuarterLength,
      numQuarters: leagueStats.celebrityGameNumQuarters,
      overtimeDuration: leagueStats.celebrityGameOvertimeDuration,
    },
  }[event];

  if (config.mirror) {
    return {
      quarterLength: leagueStats.quarterLength ?? 12,
      numQuarters: leagueStats.numQuarters ?? 4,
      overtimeDuration: leagueStats.overtimeDuration ?? 5,
    };
  }

  return {
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
