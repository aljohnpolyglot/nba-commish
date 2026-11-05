import { INITIAL_LEAGUE_STATS } from '../../constants';
import { getHistoricalNbaRuleOverrides } from '../../data/historicalNbaSeasons';
import type { GameState, LeagueStats } from '../../types';
import { isPbaIsolatedMode } from '../../utils/uiMode';

const isNbaTeamId = (tid: number): boolean => tid >= 0 && tid < 100;

export function getTradeValidationLeagueStats(
  state: Pick<GameState, 'leagueStats' | 'moddedLeagueBase'>,
  teamAId: number,
  teamBId: number,
): LeagueStats {
  const leagueStats = state.leagueStats ?? INITIAL_LEAGUE_STATS;
  const uiMode = String((leagueStats as any)?.uiMode ?? '');
  const needsBackgroundNbaRules = isPbaIsolatedMode(state) || uiMode === 'euro_isolated';
  if (!needsBackgroundNbaRules || !isNbaTeamId(teamAId) || !isNbaTeamId(teamBId)) {
    return leagueStats;
  }

  const currentYear = leagueStats.year ?? INITIAL_LEAGUE_STATS.year;
  return {
    ...INITIAL_LEAGUE_STATS,
    ...getHistoricalNbaRuleOverrides(currentYear - 1),
    year: currentYear,
    uiMode: 'nba',
    currency: 'USD',
    mleUsage: leagueStats.backgroundNbaMleUsage ?? {},
    capExceptionUsage: leagueStats.backgroundNbaCapExceptionUsage ?? {},
  };
}
