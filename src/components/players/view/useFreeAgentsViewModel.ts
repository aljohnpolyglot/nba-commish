import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';
import { matchCheat, triggerCheat } from '../../../utils/debugCheats';
import { getCountryFromLoc, formatCurrencyWithCode, getLeagueCurrencyCode } from '../../../utils/helpers';
import { getCapThresholds, getMLEAvailability, getTeamCapProfileFromState, getTeamPayrollUSD } from '../../../utils/salaryUtils';
import { formatGameDateShort, getCurrentOffseasonFAMoratoriumEnd, getGameDateParts, isInMoratorium } from '../../../utils/dateUtils';
import { calcPot2K } from '../../../services/trade/tradeValueEngine';
import { useRosterComplianceGate } from '../../../hooks/useRosterComplianceGate';
import type { NBAPlayer } from '../../../types';
import { isEuroIsolatedMode, isNonNbaIsolatedMode } from '../../../utils/uiMode';
import { getDisplayAge } from '../../../store/playerRatingStore';
import {
  MARKET_POOLS_EURO,
  MARKET_POOLS_FICTIONAL,
  MARKET_POOLS_FULL,
  NON_NBA_STATUS_LABELS,
  ON_ROSTER_STATUSES,
  type FreeAgentViewMode,
  type PersonSelectorType,
} from './freeAgentsViewShared';

export function useFreeAgentsViewModel() {
  const { state, dispatchAction, healPlayer } = useGame();
  const currencyCode = getLeagueCurrencyCode(state.leagueStats);
  const rosterGate = useRosterComplianceGate();
  const quick = usePlayerQuickActions();
  const isGM = state.gameMode === 'gm';
  const isFictional = state.leagueType === 'fictional';
  const euroIsolated = isEuroIsolatedMode(state);
  const nonNbaIsolated = isNonNbaIsolatedMode(state);
  const marketPools = nonNbaIsolated ? MARKET_POOLS_EURO : isFictional ? MARKET_POOLS_FICTIONAL : MARKET_POOLS_FULL;

  const [viewMode, setViewMode] = useState<FreeAgentViewMode>('available');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPool, setSelectedPool] = useState<string>(nonNbaIsolated ? 'all' : isGM ? 'nba' : 'all');
  const [selectedPosition, setSelectedPosition] = useState('All');
  const [sortBy, setSortBy] = useState<'ovr' | 'pot' | 'age' | 'name'>('ovr');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedCountry, setSelectedCountry] = useState('All');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [upcomingTeamFilter, setUpcomingTeamFilter] = useState<number | 'all'>(isGM && state.userTeamId != null ? state.userTeamId : 'all');
  const [selectedActionPlayer, setSelectedActionPlayer] = useState<NBAPlayer | null>(null);
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [viewingRatingsPlayer, setViewingRatingsPlayer] = useState<NBAPlayer | null>(null);
  const [personSelectorOpen, setPersonSelectorOpen] = useState(false);
  const [personSelectorType, setPersonSelectorType] = useState<PersonSelectorType>('general');
  const [preSelectedContact, setPreSelectedContact] = useState<any>(null);
  const [contactModalPerson, setContactModalPerson] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [offseasonBlockOpen, setOffseasonBlockOpen] = useState(false);
  const [showFaHeadsUp, setShowFaHeadsUp] = useState(false);

  useEffect(() => {
    if (!nonNbaIsolated) return;
    setViewMode('available');
    setSelectedPool('all');
    setSelectedTeamId(null);
  }, [nonNbaIsolated]);

  const gameDateParts = state.date ? getGameDateParts(state.date) : null;
  const seasonYear = state.leagueStats?.year ?? gameDateParts?.year ?? new Date().getFullYear();
  const simMonth = gameDateParts?.month ?? 0;
  const isFreeAgencySeason = (simMonth >= 7 && simMonth <= 9) || simMonth >= 10 || simMonth <= 2;
  const isMoratoriumActive = state.date ? isInMoratorium(state.date, seasonYear, state.leagueStats as any, state.schedule as any) : false;
  const moratoriumEndLabel = state.date ? formatGameDateShort(getCurrentOffseasonFAMoratoriumEnd(state.date, state.leagueStats as any, state.schedule as any)) : 'the moratorium ends';
  const faHeadsUpKey = `fa-moratorium-headsup-${state.saveId ?? 'default'}-${gameDateParts?.year ?? seasonYear}`;

  useEffect(() => {
    if (nonNbaIsolated || !isMoratoriumActive) return;
    try {
      if (window.localStorage.getItem(faHeadsUpKey)) return;
    } catch {}
    setShowFaHeadsUp(true);
  }, [faHeadsUpKey, isMoratoriumActive, nonNbaIsolated]);

  const dismissFaHeadsUp = () => {
    try {
      window.localStorage.setItem(faHeadsUpKey, '1');
    } catch {}
    setShowFaHeadsUp(false);
  };

  const handleSimDayClick = () => {
    if (state.offseasonChecklist) {
      setOffseasonBlockOpen(true);
      return;
    }
    rosterGate.attempt(() => dispatchAction({ type: 'ADVANCE_DAY' as any, payload: {} }));
  };

  const freeAgents = useMemo(
    () =>
      state.players.filter(player => {
        if (player.status === 'Retired' || player.hof || player.tid === -100) return false;
        if (player.tid === -2 || player.status === 'Prospect' || player.status === 'Draft Prospect') return false;
        if (nonNbaIsolated && (player.tid ?? -1) >= 0) return false;
        const isInternational = NON_NBA_STATUS_LABELS.includes((player.status || '') as any);
        const isNBAFreeAgent = player.tid === -1 || player.status === 'Free Agent';
        if (!isInternational && !isNBAFreeAgent) return false;
        return getDisplayAge(player, seasonYear) >= 19;
      }),
    [state.players, seasonYear, nonNbaIsolated],
  );

  const upcomingFAs = useMemo(
    () =>
      state.players.filter(player => {
        if (!ON_ROSTER_STATUSES.has(player.status ?? '')) return false;
        if ((player.tid ?? -1) < 0) return false;
        const exp = player.contract?.exp;
        if (typeof exp !== 'number') return false;
        if (exp <= seasonYear) return true;
        const finalOpt = ((player as any).contractYears as Array<{ option?: string }> | undefined)?.slice(-1)[0]?.option;
        return (finalOpt === 'player' || finalOpt === 'team') && exp <= seasonYear + 1;
      }),
    [state.players, seasonYear],
  );

  const sourcePool = viewMode === 'upcoming' ? upcomingFAs : freeAgents;

  const userRosterSlots = useMemo(() => {
    if (!isGM || state.userTeamId == null) return null;
    const roster = state.players.filter(player => player.tid === state.userTeamId);
    const twoWayCount = nonNbaIsolated ? 0 : roster.filter(player => (player as any).twoWay).length;
    const ngCount = nonNbaIsolated ? 0 : roster.filter(player => !!(player as any).nonGuaranteed && !(player as any).twoWay).length;
    const standardCount = roster.length - twoWayCount;
    const { month, day } = state.date ? getGameDateParts(state.date) : getGameDateParts(new Date());
    const isTrainingCamp = (month >= 7 && month <= 9) || (month === 10 && day <= 21);
    const maxStandard = isTrainingCamp ? (state.leagueStats?.maxTrainingCampRoster ?? 21) : (state.leagueStats?.maxStandardPlayersPerTeam ?? 15);
    const maxTwoWay = state.leagueStats?.maxTwoWayPlayersPerTeam ?? 3;
    const userTeam = state.teams.find(team => team.id === state.userTeamId);
    const profile = getTeamCapProfileFromState(state, state.userTeamId, getCapThresholds(state.leagueStats as any));
    const payroll = getTeamPayrollUSD(state.players, state.userTeamId, userTeam, state.leagueStats?.year);
    const mle = getMLEAvailability(state.userTeamId, payroll, 0, getCapThresholds(state.leagueStats as any), state.leagueStats as any);
    return {
      standardCount,
      twoWayCount,
      ngCount,
      guaranteedCount: standardCount - ngCount,
      maxGuaranteed: state.leagueStats?.maxStandardPlayersPerTeam ?? 15,
      maxStandard,
      maxTwoWay,
      isTrainingCamp,
      totalCount: roster.length,
      capSpaceUSD: profile.capSpaceUSD as number,
      mleAvailable: (mle?.available as number) ?? 0,
      mleType: (mle?.type as string | null) ?? null,
    };
  }, [isGM, state.userTeamId, state.players, state.leagueStats, state.teams, state.date, nonNbaIsolated, state]);

  const allCountries = useMemo(() => {
    const set = new Set<string>();
    sourcePool.forEach(player => {
      const country = getCountryFromLoc(player.born?.loc);
      if (country) set.add(country);
    });
    return Array.from(set).sort();
  }, [sourcePool]);

  const leagueTeams = useMemo(() => {
    if (selectedPool === 'all' || selectedPool === 'nba') return [];
    const leagueMap: Record<string, string> = { euroleague: 'Euroleague', pba: 'PBA', bleague: 'B-League', gleague: 'G-League', endesa: 'Endesa', chinacba: 'China CBA', nblaustralia: 'NBL Australia' };
    return state.nonNBATeams.filter(team => team.league === leagueMap[selectedPool]);
  }, [selectedPool, state.nonNBATeams]);

  const filteredPlayers = useMemo(() => {
    const filtered = sourcePool.filter(player => {
      if (searchTerm && !player.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (selectedPool !== 'all') {
        if (selectedPool === 'nba') {
          if (viewMode === 'upcoming' ? player.status !== 'Active' : player.status !== 'Free Agent' && player.tid !== -1) return false;
        } else if (player.status !== leagueTeams.find(() => true)?.league && !NON_NBA_STATUS_LABELS.includes((player.status || '') as any)) {
          const leagueStatusMap: Record<string, string> = { euroleague: 'Euroleague', pba: 'PBA', bleague: 'B-League', gleague: 'G-League', endesa: 'Endesa', chinacba: 'China CBA', nblaustralia: 'NBL Australia' };
          if (player.status !== leagueStatusMap[selectedPool]) return false;
        }
      }
      if (selectedPosition !== 'All') {
        const pos = player.pos || '';
        if ((selectedPosition === 'PG' || selectedPosition === 'SG') && !pos.includes(selectedPosition) && !pos.includes('G')) return false;
        if ((selectedPosition === 'SF' || selectedPosition === 'PF') && !pos.includes(selectedPosition) && !pos.includes('F')) return false;
        if (!['PG', 'SG', 'SF', 'PF'].includes(selectedPosition) && !pos.includes(selectedPosition)) return false;
      }
      if (selectedCountry !== 'All' && getCountryFromLoc(player.born?.loc) !== selectedCountry) return false;
      if (selectedTeamId !== null && player.tid !== selectedTeamId) return false;
      if (viewMode === 'upcoming' && upcomingTeamFilter !== 'all' && (selectedPool === 'all' || selectedPool === 'nba') && player.tid !== upcomingTeamFilter) return false;
      return true;
    });
    filtered.sort((a, b) => {
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
      const comparison =
        sortBy === 'ovr'
          ? (a.overallRating || 0) - (b.overallRating || 0)
          : sortBy === 'pot'
            ? calcPot2K(a, currentYear) - calcPot2K(b, currentYear)
            : sortBy === 'age'
              ? getDisplayAge(a, currentYear) - getDisplayAge(b, currentYear)
              : a.name.localeCompare(b.name);
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return filtered;
  }, [sourcePool, searchTerm, selectedPool, viewMode, selectedPosition, selectedCountry, selectedTeamId, upcomingTeamFilter, sortBy, sortOrder, state.leagueStats?.year, leagueTeams]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedPool, selectedPosition, sortBy, sortOrder, selectedCountry, selectedTeamId, upcomingTeamFilter, viewMode, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / itemsPerPage));
  const visiblePlayers = filteredPlayers.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const getContactFromPlayer = (player: NBAPlayer) => {
    const isNBA = !NON_NBA_STATUS_LABELS.includes((player.status || '') as any);
    const playerTeam = isNBA ? state.teams.find(team => team.id === player.tid) : null;
    const nonNBATeam = !isNBA ? state.nonNBATeams?.find(team => team.tid === player.tid) : null;
    return {
      id: player.internalId,
      name: player.name,
      title: 'Player',
      organization: playerTeam?.name || nonNBATeam?.name || player.status || 'Free Agent',
      type: 'player' as const,
      playerPortraitUrl: player.imgURL,
    };
  };

  const handleActionSelect = async (actionType: string) => {
    if (!selectedActionPlayer) return;
    if (actionType === 'view_bio') return void (setViewingBioPlayer(selectedActionPlayer), setSelectedActionPlayer(null));
    if (actionType === 'view_ratings') return void (setViewingRatingsPlayer(selectedActionPlayer), setSelectedActionPlayer(null));
    if (quick.handle(selectedActionPlayer, actionType)) return void setSelectedActionPlayer(null);
    const contact = getContactFromPlayer(selectedActionPlayer);
    setSelectedActionPlayer(null);
    if (actionType === 'contact') return void setContactModalPerson(contact);
    setPreSelectedContact(contact);
    setPersonSelectorType(actionType as PersonSelectorType);
    setPersonSelectorOpen(true);
  };

  const handlePersonSelected = async (contacts: any[], reason?: string, amount?: number, location?: string, duration?: string) => {
    setPersonSelectorOpen(false);
    setPreSelectedContact(null);
    const typeMap: Record<string, string> = { bribe: 'BRIBE_PERSON', dinner: 'INVITE_DINNER', movie: 'INVITE_DINNER', suspension: 'SUSPEND_PLAYER', waive: 'WAIVE_PLAYER', sabotage: 'SABOTAGE_PLAYER', drug_test: 'DRUG_TEST_PERSON', fine: 'FINE_PERSON', general: 'INVITE_DINNER' };
    const dispatchType = typeMap[personSelectorType];
    if (!dispatchType) return;
    let finalReason = reason || (personSelectorType === 'movie' ? 'Movie Night' : 'No reason provided.');
    if (location) finalReason += ` at ${location}`;
    await dispatchAction({
      type: dispatchType as any,
      payload: {
        targetName: contacts.map(contact => contact.name).join(', '),
        targetRole: contacts.map(contact => contact.title).join(', '),
        targetId: contacts.map(contact => contact.id).join(','),
        reason: finalReason,
        amount,
        duration,
        count: contacts.length,
        subType: personSelectorType,
        location,
        contacts,
      },
    });
  };

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const code = matchCheat(searchTerm);
    if (!code) return;
    e.preventDefault();
    setSearchTerm('');
    await triggerCheat(code, { state, dispatchAction, healPlayer });
  };

  return {
    state,
    dispatchAction,
    healPlayer,
    quick,
    rosterGate,
    currencyCode,
    isGM,
    isFictional,
    euroIsolated,
    nonNbaIsolated,
    marketPools,
    viewMode,
    setViewMode,
    searchTerm,
    setSearchTerm,
    selectedPool,
    setSelectedPool,
    selectedPosition,
    setSelectedPosition,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    selectedCountry,
    setSelectedCountry,
    isCountryDropdownOpen,
    setIsCountryDropdownOpen,
    selectedTeamId,
    setSelectedTeamId,
    upcomingTeamFilter,
    setUpcomingTeamFilter,
    selectedActionPlayer,
    setSelectedActionPlayer,
    viewingBioPlayer,
    setViewingBioPlayer,
    viewingRatingsPlayer,
    setViewingRatingsPlayer,
    personSelectorOpen,
    setPersonSelectorOpen,
    personSelectorType,
    preSelectedContact,
    setPreSelectedContact,
    contactModalPerson,
    setContactModalPerson,
    page,
    setPage,
    itemsPerPage,
    setItemsPerPage,
    offseasonBlockOpen,
    setOffseasonBlockOpen,
    showFaHeadsUp,
    dismissFaHeadsUp,
    isFreeAgencySeason,
    moratoriumEndLabel,
    freeAgents,
    upcomingFAs,
    sourcePool,
    userRosterSlots,
    allCountries,
    leagueTeams,
    filteredPlayers,
    visiblePlayers,
    totalPages,
    seasonYear,
    nbaFreeAgents: freeAgents.filter(player => player.status === 'Free Agent' || player.tid === -1).length,
    internationalPlayers: freeAgents.filter(player => NON_NBA_STATUS_LABELS.includes((player.status || '') as any)).length,
    handleSimDayClick,
    handleSearchKeyDown,
    handleActionSelect,
    handlePersonSelected,
  };
}
