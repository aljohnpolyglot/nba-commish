import type { GameState, LeagueStats } from '../../types';

type SummerLeagueTaskState = Pick<
  GameState,
  'date' | 'leagueStats' | 'leagueType' | 'moddedLeagueBase' | 'nbaGmStartMode' | 'nbaStartYear'
>;

export function isSummerLeagueEnabled(
  leagueStats: Pick<LeagueStats, 'summerLeagueEnabled'>,
  calendarYear: number,
): boolean {
  return leagueStats.summerLeagueEnabled ?? calendarYear >= 2003;
}

export function isSummerLeagueTournamentEnabled(
  leagueStats: Pick<LeagueStats, 'summerLeagueEnabled' | 'summerLeagueTournamentEnabled'>,
  calendarYear: number,
): boolean {
  return isSummerLeagueEnabled(leagueStats, calendarYear)
    && (leagueStats.summerLeagueTournamentEnabled ?? calendarYear >= 2003);
}

export function getSummerLeagueOffseasonTaskYear(state: Pick<GameState, 'date' | 'leagueStats'>): number {
  const dateYear = state.date ? new Date(state.date).getUTCFullYear() : Number.NaN;
  return Number.isFinite(dateYear) ? dateYear : Number(state.leagueStats.year);
}

export function isSummerLeagueOffseasonTaskAvailable(state: SummerLeagueTaskState): boolean {
  if (state.leagueStats.uiMode === 'pba_isolated' || state.leagueStats.uiMode === 'euro_isolated') return false;
  const nbaSave = state.leagueType === 'fictional'
    || (state.leagueType === 'modded' && (state.moddedLeagueBase ?? 'nba') === 'nba');
  if (!nbaSave) return false;
  const calendarYear = getSummerLeagueOffseasonTaskYear(state);
  if (!Number.isFinite(calendarYear) || !isSummerLeagueTournamentEnabled(state.leagueStats, calendarYear)) return false;
  return !(
    state.nbaGmStartMode === 'fixed_preseason'
    && Number(state.nbaStartYear) === calendarYear
  );
}

export function advanceSummerLeagueEraSettings(
  leagueStats: LeagueStats,
  nextSeason: number,
): LeagueStats {
  if (nextSeason < 2003) return leagueStats;
  return {
    ...leagueStats,
    summerLeagueEnabled: leagueStats.summerLeagueEnabled ?? true,
    summerLeagueTournamentEnabled: leagueStats.summerLeagueTournamentEnabled ?? true,
  };
}
