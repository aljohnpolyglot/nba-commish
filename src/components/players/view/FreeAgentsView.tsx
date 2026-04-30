import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ArrowUpDown, User, Globe, Trophy, Briefcase, UserX, ChevronDown, Hourglass, Users, PlayCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { matchCheat, triggerCheat } from '../../../utils/debugCheats';
import { FreeAgentCard } from './FreeAgentCard';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';
import { PlayerActionsModal } from '../../central/view/PlayerActionsModal';
import { PlayerBioView } from '../../central/view/PlayerBioView';
import { PersonSelectorModal } from '../../modals/PersonSelectorModal';
import { PlayerRatingsModal } from '../../modals/PlayerRatingsModal';
import ContactModal from '../../ContactModal';
import { getCountryFromLoc } from '../../../utils/helpers';
import { getCapThresholds, getTeamCapProfileFromState, getMLEAvailability, getTeamPayrollUSD } from '../../../utils/salaryUtils';
import { calcPot2K } from '../../../services/trade/tradeValueEngine';
import { useRosterComplianceGate } from '../../../hooks/useRosterComplianceGate';
import type { NBAPlayer } from '../../../types';

const MARKET_POOLS = [
  { id: 'all', label: 'All Available', icon: Globe },
  { id: 'nba', label: 'NBA Free Agents', icon: Briefcase },
  { id: 'euroleague', label: 'Euroleague', icon: Trophy },
  { id: 'pba', label: 'PBA', icon: Trophy },
  { id: 'bleague', label: 'B-League', icon: Trophy },
  { id: 'gleague', label: 'G-League', icon: Trophy },
  { id: 'endesa', label: 'Endesa', icon: Trophy },
  { id: 'chinacba', label: 'China CBA', icon: Trophy },
  { id: 'nblaustralia', label: 'NBL Australia', icon: Trophy },
];

const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'];

export const FreeAgentsView: React.FC = () => {
  const { state, dispatchAction, healPlayer } = useGame();
  const isGM = state.gameMode === 'gm';
  const [viewMode, setViewMode] = useState<'available' | 'upcoming'>('available');
  const [searchTerm, setSearchTerm] = useState('');
  // GM defaults to NBA pool (they mostly care about NBA FAs); commissioner sees the whole market.
  const [selectedPool, setSelectedPool] = useState<string>(isGM ? 'nba' : 'all');
  const [selectedPosition, setSelectedPosition] = useState('All');
  const [sortBy, setSortBy] = useState<'ovr' | 'pot' | 'age' | 'name'>('ovr');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [selectedCountry, setSelectedCountry] = useState('All');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  // Upcoming-FA team filter: 'all' = no team filter; any number = NBA team id.
  // Defaults to user's team in GM mode so they immediately see their own expiring players.
  const [upcomingTeamFilter, setUpcomingTeamFilter] = useState<number | 'all'>(
    isGM && state.userTeamId != null ? state.userTeamId : 'all',
  );

  const [selectedActionPlayer, setSelectedActionPlayer] = useState<NBAPlayer | null>(null);
  // Sign / re-sign / waive are delegated to the shared quick-actions hook.
  const quick = usePlayerQuickActions();
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [viewingRatingsPlayer, setViewingRatingsPlayer] = useState<NBAPlayer | null>(null);
  const [personSelectorOpen, setPersonSelectorOpen] = useState(false);
  const [personSelectorType, setPersonSelectorType] = useState<'contact' | 'bribe' | 'dinner' | 'movie' | 'suspension' | 'waive' | 'sabotage' | 'general'>('general');
  const [preSelectedContact, setPreSelectedContact] = useState<any>(null);
  const [contactModalPerson, setContactModalPerson] = useState<any>(null);
  const [page, setPage] = useState(1);
  const loaderRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  const seasonYear = state.leagueStats?.year ?? new Date(state.date || Date.now()).getFullYear();
  const simMonth = state.date ? parseInt(state.date.split('-')[1], 10) : 0;
  const isFreeAgencySeason = (simMonth >= 7 && simMonth <= 9) || simMonth >= 10 || simMonth <= 2;

  // Roster compliance gate — shared hook enforces the check across all sim paths.
  const rosterGate = useRosterComplianceGate();
  const handleSimDayClick = () => {
    rosterGate.attempt(() => dispatchAction({ type: 'ADVANCE_DAY' as any, payload: {} }));
  };

  const freeAgents = useMemo(() => {
    return state.players.filter(p => {
      if (p.status === 'Retired' || p.hof || p.tid === -100) return false;
      if (p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect') return false;

      const isInternational = ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '');
      const isNBAFreeAgent = p.tid === -1 || p.status === 'Free Agent';

      if (!isInternational && !isNBAFreeAgent) return false;

      // Hide under-19s from the free agent market (international prospects not yet draft-eligible)
      const age = p.born?.year ? seasonYear - p.born.year : (p.age ?? 99);
      if (age < 19) return false;

      return true;
    });
  }, [state.players, seasonYear]);

  // Upcoming FAs: any on-roster player (NBA or overseas club) whose contract expires soon.
  // Includes: (a) contract ends this season, OR (b) final year is a player/team option — either side can walk.
  const ON_ROSTER_STATUSES = new Set(['Active', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
  const upcomingFAs = useMemo(() => {
    return state.players.filter(p => {
      if (!ON_ROSTER_STATUSES.has(p.status ?? '')) return false;
      if ((p.tid ?? -1) < 0) return false;
      const exp = p.contract?.exp;
      if (typeof exp !== 'number') return false;
      if (exp <= seasonYear) return true;
      // Final year is an option (player/team) → flight risk.
      const contractYears = (p as any).contractYears as Array<{ option?: string }> | undefined;
      const finalOpt = contractYears?.[contractYears.length - 1]?.option;
      if ((finalOpt === 'player' || finalOpt === 'team') && exp <= seasonYear + 1) return true;
      return false;
    });
  }, [state.players, seasonYear]);

  const sourcePool = viewMode === 'upcoming' ? upcomingFAs : freeAgents;

  // GM-mode roster-slot counter — tells the user at a glance how many standard
  // vs two-way seats remain on their team, plus cap space and MLE headroom so
  // they can decide where to slot a signing without opening negotiation first.
  const userRosterSlots = useMemo(() => {
    if (!isGM || state.userTeamId == null) return null;
    const roster = state.players.filter(p => p.tid === state.userTeamId);
    const twoWayCount = roster.filter(p => (p as any).twoWay).length;
    const ngCount = roster.filter(p => !!(p as any).nonGuaranteed && !(p as any).twoWay).length;
    const standardCount = roster.length - twoWayCount;
    // Training camp (Jul 1 – Oct 21): standard cap expands to 21 (shared pool).
    // Otherwise regular-season 15-man cap. Without this, mid-camp display reads
    // "18/15" and looks 3 over even though the team is fine.
    const d = state.date ? new Date(state.date) : new Date();
    const mo = d.getMonth() + 1;
    const dy = d.getDate();
    const isTrainingCamp = (mo >= 7 && mo <= 9) || (mo === 10 && dy <= 21);
    const maxStandard = isTrainingCamp
      ? (state.leagueStats?.maxTrainingCampRoster ?? 21)
      : (state.leagueStats?.maxStandardPlayersPerTeam ?? 15);
    const maxTwoWay = state.leagueStats?.maxTwoWayPlayersPerTeam ?? 3;
    const thresholds = getCapThresholds(state.leagueStats as any);
    const userTeam = state.teams.find(t => t.id === state.userTeamId);
    const profile = getTeamCapProfileFromState(state, state.userTeamId, thresholds);
    const payroll = getTeamPayrollUSD(state.players, state.userTeamId, userTeam, state.leagueStats?.year);
    const mle = getMLEAvailability(state.userTeamId, payroll, 0, thresholds, state.leagueStats as any);
    // Split "standard" into true guaranteed vs NG so the badges mirror the
    // Team Office breakdown ("6/15 guaranteed · 3/3 two-way · 12 non-guaranteed")
    // instead of a single "Standard 18/21" that hides the NG count inside it.
    const guaranteedCount = standardCount - ngCount;
    const maxGuaranteed = state.leagueStats?.maxStandardPlayersPerTeam ?? 15;
    return {
      standardCount,
      twoWayCount,
      ngCount,
      guaranteedCount,
      maxGuaranteed,
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
  }, [isGM, state.userTeamId, state.players, state.leagueStats, state.teams, state.date]);

  // All unique countries from the current pool (available OR upcoming)
  const allCountries = useMemo(() => {
    const set = new Set<string>();
    sourcePool.forEach(p => {
      const c = getCountryFromLoc(p.born?.loc);
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [sourcePool]);

  // Teams available for the selected non-NBA league
  const leagueTeams = useMemo(() => {
    if (selectedPool === 'all' || selectedPool === 'nba') return [];
    const leagueMap: Record<string, string> = { euroleague: 'Euroleague', pba: 'PBA', bleague: 'B-League', gleague: 'G-League', endesa: 'Endesa', chinacba: 'China CBA', nblaustralia: 'NBL Australia' };
    const league = leagueMap[selectedPool];
    if (!league) return [];
    return state.nonNBATeams.filter(t => t.league === league);
  }, [selectedPool, state.nonNBATeams]);

  const filteredPlayers = useMemo(() => {
    let filtered = sourcePool.filter(p => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

      // League chips apply to both pools — upcoming mode now also has Euroleague/PBA/etc. contracts.
      if (selectedPool !== 'all') {
        // "NBA" in upcoming mode means on-roster NBA players (status==='Active'); in available mode means FAs.
        if (selectedPool === 'nba') {
          if (viewMode === 'upcoming') {
            if (p.status !== 'Active') return false;
          } else {
            if (p.status !== 'Free Agent' && p.tid !== -1) return false;
          }
        }
        if (selectedPool === 'euroleague' && p.status !== 'Euroleague') return false;
        if (selectedPool === 'pba' && p.status !== 'PBA') return false;
        if (selectedPool === 'bleague' && p.status !== 'B-League') return false;
        if (selectedPool === 'gleague' && p.status !== 'G-League') return false;
        if (selectedPool === 'endesa' && p.status !== 'Endesa') return false;
        if (selectedPool === 'chinacba' && p.status !== 'China CBA') return false;
        if (selectedPool === 'nblaustralia' && p.status !== 'NBL Australia') return false;
      }

      if (selectedPosition !== 'All') {
        const pPos = p.pos || '';
        if (selectedPosition === 'PG' || selectedPosition === 'SG') {
          if (!pPos.includes(selectedPosition) && !pPos.includes('G')) return false;
        } else if (selectedPosition === 'SF' || selectedPosition === 'PF') {
          if (!pPos.includes(selectedPosition) && !pPos.includes('F')) return false;
        } else {
          if (!pPos.includes(selectedPosition)) return false;
        }
      }

      // Country filter
      if (selectedCountry !== 'All') {
        const c = getCountryFromLoc(p.born?.loc);
        if (c !== selectedCountry) return false;
      }

      // Team filter (only for non-NBA leagues)
      if (selectedTeamId !== null) {
        if (p.tid !== selectedTeamId) return false;
      }

      // Upcoming-mode NBA-team filter only applies when viewing NBA pool (or All).
      // Non-NBA leagues have their own `selectedTeamId` dropdown that handles team filtering there.
      if (viewMode === 'upcoming' && upcomingTeamFilter !== 'all' && (selectedPool === 'all' || selectedPool === 'nba')) {
        if (p.tid !== upcomingTeamFilter) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

      if (sortBy === 'ovr') {
        comparison = (a.overallRating || 0) - (b.overallRating || 0);
      } else if (sortBy === 'pot') {
        comparison = calcPot2K(a, currentYear) - calcPot2K(b, currentYear);
      } else if (sortBy === 'age') {
        const ageA = a.born?.year ? currentYear - a.born.year : a.age || 0;
        const ageB = b.born?.year ? currentYear - b.born.year : b.age || 0;
        comparison = ageA - ageB;
      } else {
        comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [sourcePool, viewMode, searchTerm, selectedPool, selectedPosition, sortBy, sortOrder, selectedCountry, selectedTeamId, upcomingTeamFilter, state.leagueStats?.year]);

  // Reset page when any filter changes
  useEffect(() => { setPage(1); }, [searchTerm, selectedPool, selectedPosition, sortBy, sortOrder, selectedCountry, selectedTeamId, upcomingTeamFilter, viewMode]);

  const visiblePlayers = filteredPlayers.slice(0, page * PAGE_SIZE);

  // Infinite scroll — fire when sentinel enters viewport (pre-trigger 200px early)
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setPage(p => p + 1); },
      { threshold: 0, rootMargin: '0px 0px 200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visiblePlayers.length, filteredPlayers.length]);

  const getContactFromPlayer = (player: NBAPlayer) => {
    const isNBA = !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '');
    const playerTeam = isNBA ? state.teams.find(t => t.id === player.tid) : null;
    const nonNBATeam = !isNBA ? state.nonNBATeams?.find((t: any) => t.tid === player.tid) : null;
    return {
      id: player.internalId,
      name: player.name,
      title: 'Player',
      organization: playerTeam?.name || nonNBATeam?.name || player.status || 'Free Agent',
      type: 'player' as const,
      playerPortraitUrl: player.imgURL,
    };
  };

  const handleActionClick = (player: NBAPlayer) => {
    setSelectedActionPlayer(player);
  };

  const handleActionSelect = async (actionType: string) => {
    if (!selectedActionPlayer) return;

    if (actionType === 'view_bio') {
      setViewingBioPlayer(selectedActionPlayer);
      setSelectedActionPlayer(null);
      return;
    }

    if (actionType === 'view_ratings') {
      setViewingRatingsPlayer(selectedActionPlayer);
      setSelectedActionPlayer(null);
      return;
    }

    // Sign / re-sign / waive / view_fa_offers → delegated to the shared hook.
    if (quick.handle(selectedActionPlayer, actionType)) {
      setSelectedActionPlayer(null);
      return;
    }

    const contact = getContactFromPlayer(selectedActionPlayer);
    setSelectedActionPlayer(null);

    if (actionType === 'contact') {
      setContactModalPerson({
        id: contact.id,
        name: contact.name,
        title: contact.title,
        organization: contact.organization,
        type: contact.type,
        playerPortraitUrl: contact.playerPortraitUrl,
      });
      return;
    }

    // For all other actions: open PersonSelectorModal with player pre-selected
    setPreSelectedContact(contact);
    setPersonSelectorType(actionType as any);
    setPersonSelectorOpen(true);
  };

  const handlePersonSelected = async (contacts: any[], reason?: string, amount?: number, location?: string, duration?: string) => {
    setPersonSelectorOpen(false);
    setPreSelectedContact(null);

    const typeMap: Record<string, string> = {
      bribe: 'BRIBE_PERSON',
      dinner: 'INVITE_DINNER',
      movie: 'INVITE_DINNER',
      suspension: 'SUSPEND_PLAYER',
      waive: 'WAIVE_PLAYER',
      sabotage: 'SABOTAGE_PLAYER',
      drug_test: 'DRUG_TEST_PERSON',
      fine: 'FINE_PERSON',
      general: 'INVITE_DINNER',
    };
    const dispatchType = typeMap[personSelectorType];
    if (!dispatchType) return;

    const targetNames = contacts.map((c: any) => c.name).join(', ');
    const targetRoles = contacts.map((c: any) => c.title).join(', ');
    const targetIds = contacts.map((c: any) => c.id).join(',');
    let finalReason = reason || (personSelectorType === 'movie' ? 'Movie Night' : 'No reason provided.');
    if (location) finalReason += ` at ${location}`;

    await dispatchAction({
      type: dispatchType as any,
      payload: {
        targetName: targetNames,
        targetRole: targetRoles,
        targetId: targetIds,
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

  const nbaFreeAgents = freeAgents.filter(p => p.status === 'Free Agent' || p.tid === -1).length;
  const internationalPlayers = freeAgents.filter(p => ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '')).length;

  if (viewingBioPlayer) {
    return (
      <PlayerBioView
        player={viewingBioPlayer}
        onBack={() => setViewingBioPlayer(null)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-950 rounded-[2.5rem] border border-slate-800 shadow-2xl">
      <div className="p-4 sm:p-8 space-y-4 sm:space-y-8">
        {/* Header */}
        <div className="space-y-3 sm:space-y-4">
          {/* Title row — icon + title/desc. Toggle drops below on mobile so the
              title doesn't get squeezed into three-line wrap. */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-16 sm:h-16 bg-rose-600/20 rounded-xl sm:rounded-2xl flex items-center justify-center border border-rose-500/30 flex-shrink-0">
              <UserX size={20} className="text-rose-400 sm:hidden" />
              <UserX size={32} className="text-rose-400 hidden sm:block" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-3xl font-black text-white uppercase tracking-tight leading-tight">
                {viewMode === 'upcoming' ? 'Upcoming Free Agents' : 'Free Agent Market'}
              </h1>
              <p className="hidden sm:block text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1 font-medium">
                {viewMode === 'upcoming'
                  ? 'Players on the last year of their deal — re-sign before they hit the market.'
                  : 'Browse and interact with available players.'}
              </p>
            </div>
            {/* Desktop-only upper-right controls */}
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
                <button
                  onClick={() => setViewMode('available')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    viewMode === 'available' ? 'bg-rose-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Users size={12} />
                  Available
                </button>
                <button
                  onClick={() => setViewMode('upcoming')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    viewMode === 'upcoming' ? 'bg-amber-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Hourglass size={12} />
                  Upcoming
                </button>
              </div>
              {isFreeAgencySeason && (
                <button
                  onClick={handleSimDayClick}
                  disabled={state.isProcessing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 disabled:opacity-50 text-white transition-all shadow-lg"
                >
                  <PlayCircle size={14} />
                  Sim Day
                </button>
              )}
            </div>
          </div>

          {/* Mobile-only toggle — full-width segmented row below title */}
          <div className="sm:hidden flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setViewMode('available')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === 'available' ? 'bg-rose-600 text-white shadow' : 'text-slate-500'
              }`}
            >
              <Users size={12} />
              Available
            </button>
            <button
              onClick={() => setViewMode('upcoming')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === 'upcoming' ? 'bg-amber-600 text-white shadow' : 'text-slate-500'
              }`}
            >
              <Hourglass size={12} />
              Upcoming
            </button>
          </div>

          {/* Sim Day button — mobile header */}
          {isFreeAgencySeason && (
            <button
              onClick={handleSimDayClick}
              disabled={state.isProcessing}
              className="sm:hidden w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-widest bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 disabled:opacity-50 text-white transition-all shadow-lg"
            >
              <PlayCircle size={16} />
              Simulate Day
            </button>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-6 text-[11px] sm:text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
              <span className="text-slate-400 font-medium">{nbaFreeAgents} NBA Free Agents</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              <span className="text-slate-400 font-medium">{internationalPlayers} International</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span className="text-slate-400 font-medium">{freeAgents.length} Total Available</span>
            </div>
            {userRosterSlots && (
              <>
                {userRosterSlots.isTrainingCamp && (
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                      userRosterSlots.totalCount >= userRosterSlots.maxStandard
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                    }`}>
                      Camp {userRosterSlots.totalCount}/{userRosterSlots.maxStandard}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                    userRosterSlots.guaranteedCount >= userRosterSlots.maxGuaranteed
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  }`}>
                    Guaranteed {userRosterSlots.guaranteedCount}/{userRosterSlots.maxGuaranteed}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                    userRosterSlots.twoWayLeft === 0
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                  }`}>
                    Two-Way {userRosterSlots.twoWayCount}/{userRosterSlots.maxTwoWay}
                  </span>
                </div>
                {userRosterSlots.ngCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border bg-amber-500/10 border-amber-500/30 text-amber-300">
                      {userRosterSlots.ngCount} Non-Guaranteed
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                    userRosterSlots.capSpaceUSD >= 0
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-700/30 border-slate-600/40 text-slate-400'
                  }`}>
                    {userRosterSlots.capSpaceUSD >= 0
                      ? `Cap Space $${(userRosterSlots.capSpaceUSD / 1_000_000).toFixed(1)}M`
                      : `Over Cap -$${(Math.abs(userRosterSlots.capSpaceUSD) / 1_000_000).toFixed(1)}M`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                    userRosterSlots.mleAvailable > 0
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-slate-700/30 border-slate-600/40 text-slate-500'
                  }`}>
                    MLE {userRosterSlots.mleAvailable > 0
                      ? `$${(userRosterSlots.mleAvailable / 1_000_000).toFixed(1)}M`
                      : 'N/A'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filters & Search */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input
              type="text"
              placeholder="Search free agents by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter') return;
                const code = matchCheat(searchTerm);
                if (!code) return;
                e.preventDefault();
                setSearchTerm('');
                await triggerCheat(code, { state, dispatchAction, healPlayer });
              }}
              className="w-full bg-slate-900 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all font-medium"
            />
          </div>

          <div className="space-y-3">
            {/* Row 1: League chips — scrolls horizontally, standalone row */}
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="flex items-center gap-2 min-w-max">
                {MARKET_POOLS.map(pool => (
                  <button
                    key={pool.id}
                    onClick={() => { setSelectedPool(pool.id); setSelectedTeamId(null); setSelectedCountry('All'); }}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-tight transition-all border whitespace-nowrap ${
                      selectedPool === pool.id
                        ? (viewMode === 'upcoming' ? 'bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/20' : 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-500/20')
                        : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <pool.icon size={14} />
                    {pool.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Sort buttons + Position + Country + conditional team dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {(['ovr', 'pot', 'age', 'name'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    if (sortBy === s) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                    else { setSortBy(s); setSortOrder(s === 'name' ? 'asc' : 'desc'); }
                  }}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-tight transition-all whitespace-nowrap ${
                    sortBy === s ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-900'
                  }`}
                >
                  {s === 'ovr' ? 'Overall' : s === 'pot' ? 'Potential' : s === 'age' ? 'Age' : 'A-Z'}
                  {sortBy === s && <ArrowUpDown size={12} />}
                </button>
              ))}

              <div className="w-px h-5 bg-slate-700 mx-0.5" />

              <select
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-rose-500 transition-colors font-bold uppercase tracking-tight"
              >
                {POSITIONS.map(pos => (
                  <option key={pos} value={pos}>{pos === 'All' ? 'All Positions' : pos}</option>
                ))}
              </select>

              {/* Country dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                  className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-rose-500 transition-colors font-bold uppercase tracking-tight min-w-[130px] justify-between"
                >
                  <span className="truncate">{selectedCountry === 'All' ? 'All Countries' : selectedCountry}</span>
                  <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${isCountryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {isCountryDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsCountryDropdownOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute z-50 mt-2 left-0 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar"
                      >
                        <button
                          onClick={() => { setSelectedCountry('All'); setIsCountryDropdownOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-xs hover:bg-slate-800 transition-colors ${selectedCountry === 'All' ? 'bg-rose-500/10 text-rose-400' : 'text-slate-300'}`}
                        >
                          All Countries
                        </button>
                        {allCountries.map(c => (
                          <button
                            key={c}
                            onClick={() => { setSelectedCountry(c); setIsCountryDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-xs hover:bg-slate-800 transition-colors ${selectedCountry === c ? 'bg-rose-500/10 text-rose-400' : 'text-slate-300'}`}
                          >
                            {c}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Upcoming-mode NBA-team dropdown */}
              {viewMode === 'upcoming' && (selectedPool === 'all' || selectedPool === 'nba') && (() => {
                const userTid = isGM ? state.userTeamId ?? null : null;
                const userTeam = userTid != null ? state.teams.find(t => t.id === userTid) : null;
                const sortedTeams = [...state.teams].sort((a, b) => a.name.localeCompare(b.name));
                return (
                  <select
                    value={upcomingTeamFilter === 'all' ? 'all' : String(upcomingTeamFilter)}
                    onChange={e => setUpcomingTeamFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                    className="bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-amber-500 transition-colors font-bold uppercase tracking-tight max-w-[220px]"
                  >
                    {userTeam && (
                      <option value={String(userTeam.id)}>Your Team — {userTeam.name}</option>
                    )}
                    <option value="all">All Players</option>
                    {sortedTeams.filter(t => t.id !== userTid).map(t => (
                      <option key={t.id} value={String(t.id)}>{t.name}</option>
                    ))}
                  </select>
                );
              })()}

              {/* Team dropdown — visible when a non-NBA league is selected */}
              {leagueTeams.length > 0 && (
                <select
                  value={selectedTeamId ?? ''}
                  onChange={(e) => setSelectedTeamId(e.target.value ? parseInt(e.target.value) : null)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-rose-500 transition-colors font-bold uppercase tracking-tight max-w-[200px]"
                >
                  <option value="">All Teams</option>
                  {leagueTeams.map(t => {
                    const fullName = t.region ? `${t.region} ${t.name}`.trim() : t.name;
                    return <option key={t.tid} value={t.tid}>{fullName}</option>;
                  })}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Results Grid */}
        {filteredPlayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-600 bg-slate-900/10 rounded-[3rem] border border-dashed border-slate-800">
            <User size={64} className="mb-6 opacity-10" />
            <p className="font-black uppercase tracking-[0.3em] text-sm">No Free Agents Found</p>
            <p className="text-xs font-medium mt-3 text-slate-500 max-w-xs text-center leading-relaxed">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {visiblePlayers.map(player => (
                <FreeAgentCard
                  key={player.internalId}
                  player={player}
                  nonNBATeams={state.nonNBATeams}
                  onClick={handleActionClick}
                  onViewOffers={p => quick.handle(p, 'view_fa_offers')}
                />
              ))}
            </div>
            {visiblePlayers.length < filteredPlayers.length && (
              <div ref={loaderRef} className="h-16" />
            )}
          </>
        )}
      </div>

      {selectedActionPlayer && (
        <PlayerActionsModal
          player={selectedActionPlayer}
          onClose={() => setSelectedActionPlayer(null)}
          onActionSelect={handleActionSelect}
          onHeal={() => { healPlayer(selectedActionPlayer.internalId); setSelectedActionPlayer(null); }}
        />
      )}

      {quick.portals}

      {contactModalPerson && (
        <ContactModal
          contact={contactModalPerson}
          onClose={() => setContactModalPerson(null)}
          onSend={async ({ message }: { message: string }) => {
            const chat = state.chats.find((c: any) =>
              c.participants.includes(contactModalPerson.id) &&
              c.participants.includes('commissioner')
            );
            await dispatchAction({
              type: 'SEND_CHAT_MESSAGE',
              payload: {
                chatId: chat?.id,
                text: message,
                targetId: contactModalPerson.id,
                targetName: contactModalPerson.name,
                targetRole: contactModalPerson.title,
                targetOrg: contactModalPerson.organization || 'Unknown',
                avatarUrl: contactModalPerson.playerPortraitUrl,
              },
            });
            setContactModalPerson(null);
          }}
          isLoading={state.isProcessing}
        />
      )}

      {viewingRatingsPlayer && (
        <PlayerRatingsModal
          player={viewingRatingsPlayer}
          season={state.leagueStats?.year ?? 2026}
          onClose={() => setViewingRatingsPlayer(null)}
        />
      )}

      {rosterGate.modal}

      {personSelectorOpen && preSelectedContact && (
        <PersonSelectorModal
          title={
            personSelectorType === 'bribe' ? 'Offer Bribe' :
            personSelectorType === 'dinner' ? 'Invite to Dinner' :
            personSelectorType === 'movie' ? 'Invite to Movie' :
            personSelectorType === 'suspension' ? 'Suspend Player' :
            personSelectorType === 'waive' ? 'Waive Player' :
            personSelectorType === 'sabotage' ? 'Sabotage' :
            'Action'
          }
          actionType={personSelectorType as any}
          preSelectedContact={preSelectedContact}
          skipPersonSelection={true}
          onClose={() => { setPersonSelectorOpen(false); setPreSelectedContact(null); }}
          onSelect={handlePersonSelected}
        />
      )}
    </div>
  );
};
