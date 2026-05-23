import { calcPot2K } from '../../../services/trade/tradeValueEngine';
import { getDisplayAge } from '../../../store/playerRatingStore';
import { getGameDateParts } from '../../../utils/dateUtils';
import { getCountryFromLoc } from '../../../utils/helpers';
import { getCapThresholds, getMLEAvailability, getTeamCapProfileFromState, getTeamPayrollUSD } from '../../../utils/salaryUtils';

export const MARKET_POOLS_FULL = [
  { id: 'all', label: 'All Available', icon: 'Globe' },
  { id: 'nba', label: 'NBA Free Agents', icon: 'Briefcase' },
  { id: 'euroleague', label: 'Euroleague', icon: 'Trophy' },
  { id: 'pba', label: 'PBA', icon: 'Trophy' },
  { id: 'bleague', label: 'B-League', icon: 'Trophy' },
  { id: 'gleague', label: 'G-League', icon: 'Trophy' },
  { id: 'endesa', label: 'Endesa', icon: 'Trophy' },
  { id: 'chinacba', label: 'China CBA', icon: 'Trophy' },
  { id: 'nblaustralia', label: 'NBL Australia', icon: 'Trophy' },
] as const;

export const MARKET_POOLS_FICTIONAL = [
  { id: 'all', label: 'All Available', icon: 'Globe' },
  { id: 'nba', label: 'Free Agents', icon: 'Briefcase' },
] as const;

export const MARKET_POOLS_EURO = [{ id: 'all', label: 'All Available', icon: 'Globe' }] as const;
export const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'] as const;

const INTERNATIONAL_STATUSES = ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'];
const ON_ROSTER_STATUSES = new Set(['Active', ...INTERNATIONAL_STATUSES]);
const LEAGUE_MAP: Record<string, string> = {
  euroleague: 'Euroleague',
  pba: 'PBA',
  bleague: 'B-League',
  gleague: 'G-League',
  endesa: 'Endesa',
  chinacba: 'China CBA',
  nblaustralia: 'NBL Australia',
};

export const getMarketPools = (leagueType: string, nonNbaIsolated: boolean) =>
  nonNbaIsolated ? MARKET_POOLS_EURO : leagueType === 'fictional' ? MARKET_POOLS_FICTIONAL : MARKET_POOLS_FULL;

export const getFreeAgents = (players: any[], seasonYear: number, nonNbaIsolated: boolean) => players.filter((player) => {
  if (player.status === 'Retired' || player.hof || player.tid === -100) return false;
  if (player.tid === -2 || player.status === 'Prospect' || player.status === 'Draft Prospect') return false;
  if (nonNbaIsolated && (player.tid ?? -1) >= 0) return false;
  const isInternational = INTERNATIONAL_STATUSES.includes(player.status || '');
  const isNBAFreeAgent = player.tid === -1 || player.status === 'Free Agent';
  if (!isInternational && !isNBAFreeAgent) return false;
  return getDisplayAge(player, seasonYear) >= 19;
});

export const getUpcomingFAs = (players: any[], seasonYear: number) => players.filter((player) => {
  if (!ON_ROSTER_STATUSES.has(player.status ?? '')) return false;
  if ((player.tid ?? -1) < 0) return false;
  const exp = player.contract?.exp;
  if (typeof exp !== 'number') return false;
  if (exp <= seasonYear) return true;
  const contractYears = (player as any).contractYears as Array<{ option?: string }> | undefined;
  const finalOpt = contractYears?.[contractYears.length - 1]?.option;
  return (finalOpt === 'player' || finalOpt === 'team') && exp <= seasonYear + 1;
});

export const getUserRosterSlots = (state: any, isGM: boolean, nonNbaIsolated: boolean) => {
  if (!isGM || state.userTeamId == null) return null;
  const roster = state.players.filter((player: any) => player.tid === state.userTeamId);
  const twoWayCount = nonNbaIsolated ? 0 : roster.filter((player: any) => (player as any).twoWay).length;
  const ngCount = nonNbaIsolated ? 0 : roster.filter((player: any) => !!(player as any).nonGuaranteed && !(player as any).twoWay).length;
  const standardCount = roster.length - twoWayCount;
  const { month, day } = state.date ? getGameDateParts(state.date) : getGameDateParts(new Date());
  const isTrainingCamp = (month >= 7 && month <= 9) || (month === 10 && day <= 21);
  const maxStandard = isTrainingCamp ? (state.leagueStats?.maxTrainingCampRoster ?? 21) : (state.leagueStats?.maxStandardPlayersPerTeam ?? 15);
  const maxTwoWay = state.leagueStats?.maxTwoWayPlayersPerTeam ?? 3;
  const thresholds = getCapThresholds(state.leagueStats as any);
  const userTeam = state.teams.find((team: any) => team.id === state.userTeamId);
  const profile = getTeamCapProfileFromState(state, state.userTeamId, thresholds);
  const payroll = getTeamPayrollUSD(state.players, state.userTeamId, userTeam, state.leagueStats?.year);
  const mle = getMLEAvailability(state.userTeamId, payroll, 0, thresholds, state.leagueStats as any);
  const guaranteedCount = standardCount - ngCount;
  return {
    standardCount,
    twoWayCount,
    ngCount,
    guaranteedCount,
    maxGuaranteed: state.leagueStats?.maxStandardPlayersPerTeam ?? 15,
    maxStandard,
    maxTwoWay,
    isTrainingCamp,
    totalCount: roster.length,
    standardLeft: Math.max(0, maxStandard - standardCount),
    twoWayLeft: Math.max(0, maxTwoWay - twoWayCount),
    capSpaceUSD: profile.capSpaceUSD as number,
    mleAvailable: (mle?.available as number) ?? 0,
    mleType: (mle?.type as string | null) ?? null,
  };
};

export const getAllCountries = (sourcePool: any[]) => {
  const set = new Set<string>();
  sourcePool.forEach((player) => {
    const country = getCountryFromLoc(player.born?.loc);
    if (country) set.add(country);
  });
  return Array.from(set).sort();
};

export const getLeagueTeams = (selectedPool: string, nonNBATeams: any[]) => {
  if (selectedPool === 'all' || selectedPool === 'nba') return [];
  const league = LEAGUE_MAP[selectedPool];
  return league ? nonNBATeams.filter((team) => team.league === league) : [];
};

export const getFilteredPlayers = ({
  sourcePool,
  viewMode,
  searchTerm,
  selectedPool,
  selectedPosition,
  selectedCountry,
  selectedTeamId,
  upcomingTeamFilter,
  sortBy,
  sortOrder,
  currentYear,
}: {
  sourcePool: any[];
  viewMode: 'available' | 'upcoming';
  searchTerm: string;
  selectedPool: string;
  selectedPosition: string;
  selectedCountry: string;
  selectedTeamId: number | null;
  upcomingTeamFilter: number | 'all';
  sortBy: 'ovr' | 'pot' | 'age' | 'name';
  sortOrder: 'asc' | 'desc';
  currentYear: number;
}) => {
  const filtered = sourcePool.filter((player) => {
    if (searchTerm && !player.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (selectedPool !== 'all') {
      if (selectedPool === 'nba') {
        if (viewMode === 'upcoming') {
          if (player.status !== 'Active') return false;
        } else if (player.status !== 'Free Agent' && player.tid !== -1) {
          return false;
        }
      } else if (player.status !== LEAGUE_MAP[selectedPool]) {
        return false;
      }
    }
    if (selectedPosition !== 'All') {
      const position = player.pos || '';
      if (selectedPosition === 'PG' || selectedPosition === 'SG') {
        if (!position.includes(selectedPosition) && !position.includes('G')) return false;
      } else if (selectedPosition === 'SF' || selectedPosition === 'PF') {
        if (!position.includes(selectedPosition) && !position.includes('F')) return false;
      } else if (!position.includes(selectedPosition)) {
        return false;
      }
    }
    if (selectedCountry !== 'All' && getCountryFromLoc(player.born?.loc) !== selectedCountry) return false;
    if (selectedTeamId !== null && player.tid !== selectedTeamId) return false;
    if (viewMode === 'upcoming' && upcomingTeamFilter !== 'all' && (selectedPool === 'all' || selectedPool === 'nba') && player.tid !== upcomingTeamFilter) return false;
    return true;
  });

  filtered.sort((left, right) => {
    let comparison = 0;
    if (sortBy === 'ovr') comparison = (left.overallRating || 0) - (right.overallRating || 0);
    else if (sortBy === 'pot') comparison = calcPot2K(left, currentYear) - calcPot2K(right, currentYear);
    else if (sortBy === 'age') comparison = getDisplayAge(left, currentYear) - getDisplayAge(right, currentYear);
    else comparison = left.name.localeCompare(right.name);
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return filtered;
};

export const getContactFromPlayer = (player: any, state: any) => {
  const isNBA = !['WNBA', ...INTERNATIONAL_STATUSES].includes(player.status || '');
  const playerTeam = isNBA ? state.teams.find((team: any) => team.id === player.tid) : null;
  const nonNBATeam = !isNBA ? state.nonNBATeams?.find((team: any) => team.tid === player.tid) : null;
  return {
    id: player.internalId,
    name: player.name,
    title: 'Player',
    organization: playerTeam?.name || nonNBATeam?.name || player.status || 'Free Agent',
    type: 'player' as const,
    playerPortraitUrl: player.imgURL,
  };
};
