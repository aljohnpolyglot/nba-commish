import { Briefcase, Globe, Trophy } from 'lucide-react';
import { EXTERNAL_LEAGUE_STATUSES, EXTERNAL_MENS_LEAGUE_STATUSES } from '../../../constants';
import type { GameState } from '../../../types';

export const MARKET_POOL_LEAGUE_STATUS: Record<string, string> = {
  euroleague: 'Euroleague',
  pba: 'PBA',
  bleague: 'B-League',
  gleague: 'G-League',
  endesa: 'Endesa',
  chinacba: 'China CBA',
  nblaustralia: 'NBL Australia',
  wnba: 'WNBA',
  eurocup: 'EuroCup',
  franceelite: 'France Elite',
  italyseriea: 'Italy Serie A',
  germanybbl: 'Germany BBL',
  greecea1: 'Greece A1',
  turkeybsl: 'Turkey BSL',
  lithuanialkl: 'Lithuania LKL',
  israelbsl: 'Israel BSL',
  vtb: 'VTB',
  aba: 'ABA',
};

export const MARKET_POOLS_FULL = [
  { id: 'all', label: 'All Available', icon: Globe },
  { id: 'nba', label: 'Free Agents', icon: Briefcase },
  { id: 'euroleague', label: 'Euroleague', icon: Trophy },
  { id: 'pba', label: 'PBA', icon: Trophy },
  { id: 'bleague', label: 'B-League', icon: Trophy },
  { id: 'gleague', label: 'G-League', icon: Trophy },
  { id: 'endesa', label: 'Endesa', icon: Trophy },
  { id: 'chinacba', label: 'China CBA', icon: Trophy },
  { id: 'nblaustralia', label: 'NBL Australia', icon: Trophy },
  { id: 'eurocup', label: 'EuroCup', icon: Trophy },
  { id: 'franceelite', label: 'France Elite', icon: Trophy },
  { id: 'italyseriea', label: 'Italy Serie A', icon: Trophy },
  { id: 'germanybbl', label: 'Germany BBL', icon: Trophy },
  { id: 'greecea1', label: 'Greece A1', icon: Trophy },
  { id: 'turkeybsl', label: 'Turkey BSL', icon: Trophy },
  { id: 'lithuanialkl', label: 'Lithuania LKL', icon: Trophy },
  { id: 'israelbsl', label: 'Israel BSL', icon: Trophy },
  { id: 'vtb', label: 'VTB', icon: Trophy },
  { id: 'aba', label: 'ABA', icon: Trophy },
] as const;

export const MARKET_POOLS_FICTIONAL = [
  { id: 'all', label: 'All Available', icon: Globe },
  { id: 'nba', label: 'Free Agents', icon: Briefcase },
] as const;

export const MARKET_POOLS_EURO = [
  { id: 'all', label: 'All Available', icon: Globe },
  { id: 'europe', label: 'Europe', icon: Trophy },
  { id: 'nba', label: 'NBA', icon: Briefcase },
  { id: 'gleague', label: 'G League', icon: Trophy },
  { id: 'other-international', label: 'Other International', icon: Globe },
  { id: 'undrafted', label: 'Undrafted', icon: Briefcase },
] as const;
export const MARKET_POOLS_PBA = [{ id: 'all', label: 'PBA Free Agents', icon: Trophy }] as const;
export const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'] as const;
export const NON_NBA_STATUS_LABELS = EXTERNAL_MENS_LEAGUE_STATUSES;
export const ON_ROSTER_STATUSES = new Set(['Active', ...NON_NBA_STATUS_LABELS]);

export function getActiveMarketPools(state: Pick<GameState, 'nonNBATeams' | 'players'>) {
  const leagueByTeamId = new Map(state.nonNBATeams.map(team => [team.tid, team.league]));
  const activeLeagues = new Set<string>();
  for (const player of state.players) {
    if (player.status && EXTERNAL_LEAGUE_STATUSES.includes(player.status as any)) {
      activeLeagues.add(player.status);
    }
    const rosterLeague = leagueByTeamId.get(player.tid);
    if (rosterLeague) activeLeagues.add(rosterLeague);
  }
  return MARKET_POOLS_FULL.filter(pool => {
    const league = MARKET_POOL_LEAGUE_STATUS[pool.id];
    return league == null || activeLeagues.has(league);
  });
}

export type EuroSigningMarketPool = Exclude<(typeof MARKET_POOLS_EURO)[number]['id'], 'all'>;

export function getEuroSigningMarketPool(player: GameState['players'][number]): EuroSigningMarketPool {
  if (player.euroMarketOrigin?.source === 'historical-nba') return 'nba';
  if (player.euroMarketSalaryStatus === 'G-League') return 'gleague';
  const drafted = Number(player.draft?.round ?? 0) > 0 || Number(player.draft?.pick ?? 0) > 0;
  if (player.euroGeneratedYouth === true && !drafted) return 'undrafted';
  if (player.historicalEndesaSource || EXTERNAL_MENS_LEAGUE_STATUSES.includes(player.euroMarketSalaryStatus as any)) {
    const status = String(player.euroMarketSalaryStatus ?? '');
    if (status !== 'PBA' && status !== 'B-League' && status !== 'China CBA' && status !== 'NBL Australia') {
      return 'europe';
    }
  }
  return 'other-international';
}

export type MarketPoolId = (typeof MARKET_POOLS_FULL)[number]['id'] | (typeof MARKET_POOLS_FICTIONAL)[number]['id'] | (typeof MARKET_POOLS_EURO)[number]['id'] | (typeof MARKET_POOLS_PBA)[number]['id'];
export type FreeAgentViewMode = 'available' | 'upcoming';
export type PersonSelectorType = 'dinner' | 'movie' | 'suspension' | 'waive' | 'sabotage' | 'general';
