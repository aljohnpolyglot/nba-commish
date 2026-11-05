const hasExplicitBoolean = (leagueStats: any, key: string): boolean =>
  typeof leagueStats?.[key] === 'boolean';

const getHistoricalStartYear = (leagueStats?: any): number | null => {
  const raw = Number(leagueStats?.historicalEraStartYear);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
};

const getRuleYear = (leagueStats?: any): number | null => {
  const startYear = getHistoricalStartYear(leagueStats);
  if (startYear != null) return startYear;
  const year = Number(leagueStats?.year);
  return Number.isFinite(year) && year > 0 ? year : null;
};

const historicalDefault = (leagueStats: any, firstStartYear: number, modernDefault: boolean): boolean => {
  const startYear = getRuleYear(leagueStats);
  return startYear == null ? modernDefault : startYear >= firstStartYear;
};

const afterHistoricalIntroduction = (leagueStats: any, firstStartYear: number): boolean => {
  const year = getRuleYear(leagueStats);
  return year == null || year >= firstStartYear;
};

const isEuroAllStarMode = (leagueStats?: any): boolean =>
  leagueStats?.uiMode === 'euro_isolated';

const isWnbaAllStarMode = (leagueStats?: any): boolean =>
  leagueStats?.uiMode === 'wnba_isolated';

const getWnbaRuleYear = (leagueStats?: any): number | null => {
  const year = Number(leagueStats?.year);
  return Number.isFinite(year) && year > 0 ? year : getRuleYear(leagueStats);
};

export const isWnbaAllStarGameSeason = (year: number): boolean =>
  year >= 1999 && ![2004, 2008, 2010, 2012, 2016, 2020].includes(year);

export const isWnbaThreePointContestSeason = (year: number): boolean =>
  year === 2006 || year === 2007 || (year >= 2009 && year <= 2010) ||
  (year >= 2017 && year <= 2019) || year >= 2021;

export const isWnbaSkillsChallengeSeason = (year: number): boolean =>
  year === 2003 || (year >= 2005 && year <= 2007) ||
  (year >= 2009 && year <= 2010) || year === 2019 || (year >= 2022 && year <= 2025);

export const isAllStarGameEnabled = (leagueStats?: any): boolean => {
  if (isEuroAllStarMode(leagueStats)) return false;
  if (isWnbaAllStarMode(leagueStats)) {
    const year = getWnbaRuleYear(leagueStats);
    return year != null && isWnbaAllStarGameSeason(year) && leagueStats?.allStarGameEnabled !== false;
  }
  if (!afterHistoricalIntroduction(leagueStats, 1950)) return false;
  const year = getRuleYear(leagueStats);
  if (year === 1998) return false;
  if (hasExplicitBoolean(leagueStats, 'allStarGameEnabled')) return leagueStats.allStarGameEnabled;
  return true;
};

export const isPbaAllStarMode = (leagueStats?: any): boolean =>
  leagueStats?.uiMode === 'pba_isolated';

export const isDanceContestEnabled = (leagueStats?: any): boolean =>
  isAllStarGameEnabled(leagueStats) &&
  (isPbaAllStarMode(leagueStats)
    ? leagueStats?.pbaAllStarDanceContestEnabled !== false
    : !isWnbaAllStarMode(leagueStats) && leagueStats?.allStarDanceContestEnabled === true);

export const isRisingStarsEnabled = (leagueStats?: any): boolean =>
  isAllStarGameEnabled(leagueStats) &&
  !isPbaAllStarMode(leagueStats) &&
  !isWnbaAllStarMode(leagueStats) &&
  afterHistoricalIntroduction(leagueStats, 1993) &&
  (hasExplicitBoolean(leagueStats, 'risingStarsEnabled') ? leagueStats.risingStarsEnabled : historicalDefault(leagueStats, 1993, true));

export const isDunkContestEnabled = (leagueStats?: any): boolean => {
  const year = getRuleYear(leagueStats);
  return isAllStarGameEnabled(leagueStats) &&
    !isWnbaAllStarMode(leagueStats) &&
    afterHistoricalIntroduction(leagueStats, 1983) &&
    year !== 1997 &&
    year !== 1998 &&
    (hasExplicitBoolean(leagueStats, 'allStarDunkContest') ? leagueStats.allStarDunkContest : true);
};

export const isThreePointContestEnabled = (leagueStats?: any): boolean => {
  const year = isWnbaAllStarMode(leagueStats) ? getWnbaRuleYear(leagueStats) : getRuleYear(leagueStats);
  return (isWnbaAllStarMode(leagueStats) ? year != null : isAllStarGameEnabled(leagueStats)) &&
    (isWnbaAllStarMode(leagueStats)
      ? year != null && isWnbaThreePointContestSeason(year)
      : afterHistoricalIntroduction(leagueStats, 1985) && year !== 1998) &&
    (hasExplicitBoolean(leagueStats, 'allStarThreePointContest') ? leagueStats.allStarThreePointContest : true) &&
    leagueStats?.threePointLineEnabled !== false;
};

export const isCelebrityGameEnabled = (leagueStats?: any): boolean =>
  isAllStarGameEnabled(leagueStats) &&
  !isPbaAllStarMode(leagueStats) &&
  !isWnbaAllStarMode(leagueStats) &&
  afterHistoricalIntroduction(leagueStats, 2002) &&
  (hasExplicitBoolean(leagueStats, 'celebrityGameEnabled') ? leagueStats.celebrityGameEnabled : historicalDefault(leagueStats, 2002, false));

export const isShootingStarsEnabled = (leagueStats?: any): boolean => {
  const year = getRuleYear(leagueStats);
  const configured = hasExplicitBoolean(leagueStats, 'allStarShootingStars')
    ? leagueStats.allStarShootingStars
    : year != null && year <= 2014;
  return isAllStarGameEnabled(leagueStats) &&
    !isPbaAllStarMode(leagueStats) &&
    !isWnbaAllStarMode(leagueStats) &&
    afterHistoricalIntroduction(leagueStats, 2003) &&
    configured;
};

export const isSkillsChallengeEnabled = (leagueStats?: any): boolean => {
  if (isWnbaAllStarMode(leagueStats)) {
    const year = getWnbaRuleYear(leagueStats);
    return year != null &&
      isWnbaSkillsChallengeSeason(year) &&
      leagueStats?.allStarSkillsChallenge !== false;
  }
  return isAllStarGameEnabled(leagueStats) && (
    isPbaAllStarMode(leagueStats) ||
    (afterHistoricalIntroduction(leagueStats, 2002) &&
      (hasExplicitBoolean(leagueStats, 'allStarSkillsChallenge')
        ? leagueStats.allStarSkillsChallenge
        : historicalDefault(leagueStats, 2002, false)))
  );
};

export const getRisingStarsEventLabel = (leagueStats?: any): string => {
  const startYear = getRuleYear(leagueStats);
  if (startYear === 1993) return 'Rookie Game';
  if (startYear != null && startYear <= 2010) return 'Rookie Challenge';
  return 'Rising Stars';
};

export const getRisingStarsTwoTeamNames = (
  format: string | undefined,
  captainNames: string[],
): [string, string] => {
  if (format === 'usa_vs_world') return ['Team USA', 'Team World'];
  if (format === 'rookies_vs_sophomores') return ['Team Sophomores', 'Team Rookies'];
  return [captainNames[0] || 'Team 1', captainNames[1] || 'Team 2'];
};
