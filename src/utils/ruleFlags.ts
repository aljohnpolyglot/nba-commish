export function isNbaCupEnabled(leagueStats?: any): boolean {
  if (leagueStats?.uiMode === 'wnba_isolated') {
    return (leagueStats?.nbaCupEnabled ?? leagueStats?.inSeasonTournament) !== false;
  }
  if (leagueStats?.uiMode && leagueStats.uiMode !== 'nba' && leagueStats?.nbaCupEnabled !== true) return false;
  return (leagueStats?.nbaCupEnabled ?? leagueStats?.inSeasonTournament) !== false;
}

export function usesLegacyNbaCupState(leagueStats?: any): boolean {
  const uiMode = leagueStats?.uiMode;
  return isNbaCupEnabled(leagueStats) && (uiMode == null || uiMode === 'nba' || uiMode === 'fictional');
}

export function isFourPointEnabled(leagueStats?: any): boolean {
  return (leagueStats?.fourPointLineEnabled ?? leagueStats?.fourPointLine) === true;
}

export function isThreePointEnabled(leagueStats?: any): boolean {
  return leagueStats?.threePointLineEnabled !== false;
}

function hasExplicitBoolean(leagueStats: any, key: string): boolean {
  return typeof leagueStats?.[key] === 'boolean';
}

function getHistoricalStartYear(leagueStats?: any): number | null {
  const raw = Number(leagueStats?.historicalEraStartYear);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function isSalaryCapEnabled(leagueStats?: any): boolean {
  const salaryCap = Number(leagueStats?.salaryCap);
  const historicalStartYear = getHistoricalStartYear(leagueStats);
  const hasExplicitCapToggle = hasExplicitBoolean(leagueStats, 'salaryCapEnabled') || leagueStats?.salaryCapType != null;
  if (historicalStartYear != null && historicalStartYear < 1984 && !hasExplicitCapToggle) return false;
  return leagueStats?.uiMode !== 'pba_isolated' &&
    leagueStats?.salaryCapEnabled !== false &&
    leagueStats?.salaryCapType !== 'none' &&
    Number.isFinite(salaryCap) &&
    salaryCap > 0;
}

export function isMleEnabled(leagueStats?: any): boolean {
  if (!isSalaryCapEnabled(leagueStats)) return false;
  if (hasExplicitBoolean(leagueStats, 'mleEnabled')) return leagueStats.mleEnabled;
  const historicalStartYear = getHistoricalStartYear(leagueStats);
  return historicalStartYear == null || historicalStartYear >= 1999;
}

export function isDeadMoneyEnabled(leagueStats?: any): boolean {
  if (!isSalaryCapEnabled(leagueStats)) return false;
  if (hasExplicitBoolean(leagueStats, 'deadMoneyEnabled')) return leagueStats.deadMoneyEnabled;
  const historicalStartYear = getHistoricalStartYear(leagueStats);
  return historicalStartYear == null || historicalStartYear >= 1999;
}

export function isStretchProvisionEnabled(leagueStats?: any): boolean {
  const seasonYear = Number(leagueStats?.year ?? new Date().getFullYear());
  const startYear = Number(leagueStats?.stretchProvisionStartYear ?? 2006);
  return isDeadMoneyEnabled(leagueStats) &&
    leagueStats?.stretchProvisionEnabled !== false &&
    Number.isFinite(seasonYear) &&
    Number.isFinite(startYear) &&
    seasonYear >= startYear;
}

export function areApronsEnabled(leagueStats?: any): boolean {
  const apronCount = Number(leagueStats?.numberOfAprons ?? 0);
  return isSalaryCapEnabled(leagueStats) &&
    leagueStats?.apronsEnabled === true &&
    Number.isFinite(apronCount) &&
    apronCount > 0;
}

export function areTradeExceptionsEnabled(leagueStats?: any): boolean {
  if (!isSalaryCapEnabled(leagueStats)) return false;
  if (hasExplicitBoolean(leagueStats, 'tradeExceptionsEnabled')) return leagueStats.tradeExceptionsEnabled;
  const historicalStartYear = getHistoricalStartYear(leagueStats);
  return historicalStartYear == null || historicalStartYear >= 1984;
}

export function areBirdRightsEnabled(leagueStats?: any): boolean {
  return isSalaryCapEnabled(leagueStats) && leagueStats?.birdRightsEnabled !== false;
}

export function isSupermaxEnabled(leagueStats?: any): boolean {
  return areBirdRightsEnabled(leagueStats) && leagueStats?.supermaxEnabled === true;
}

export function isRookieExtensionEnabled(leagueStats?: any): boolean {
  return areBirdRightsEnabled(leagueStats) &&
    leagueStats?.rookieScaleType !== 'none' &&
    leagueStats?.rookieExtEnabled === true;
}

export function getFourPointDistance(leagueStats?: any): number {
  const distance = Number(leagueStats?.fourPointLineDistance);
  return Number.isFinite(distance) && distance > 0 ? distance : 27;
}

export function isRfaMatchingEnabled(leagueStats?: any): boolean {
  return (leagueStats?.rfaMatchingEnabled ?? leagueStats?.rfaEnabled ?? leagueStats?.rookieRestrictedFreeAgentEligibility) !== false;
}
