import React, { useState, useMemo, useEffect } from 'react';
import { Search, Filter, X, ChevronDown, User, Globe, GraduationCap, Trophy, ArrowUpDown, LayoutGrid, ListFilter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { NBAPlayer, NBATeam, NonNBATeam } from '../../../types';
import { PlayerSearchCard } from './PlayerSearchCard';
import { useGame } from '../../../store/GameContext';
import { getScoutedDisplayOverall } from '../../../utils/scoutingFuzz';
import { getCompetitionPlayerStatus, getDefaultEuroLeagueSearcherIds } from '../../../utils/euroLeagueDefaults';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../../utils/uiMode';
import { PLAYER_SEARCH_GENDERS, PLAYER_SEARCH_LEAGUES, PLAYER_SEARCH_POSITIONS } from './playerSearchConfig';
import { usePlayerSearchReferenceData } from './usePlayerSearchReferenceData';
import { isExternalLeaguePlayer, isPlayerInLeagueScope } from '../../../utils/playerLeagueScope';
import { getPlayerNationalityCountries } from '../../../utils/playerNationality';
import { CountryFlag } from '../../shared/CountryFlag';
import { projectCanonicalPlayerBiography } from '../../../services/playerUniverse/realGmBiographyContinuity';
import { isUnavailableInternationalTournamentPlayer } from '../../../utils/prospectUtils';

interface UniversalPlayerSearcherProps {
  players: NBAPlayer[];
  teams: NBATeam[];
  nonNBATeams?: NonNBATeam[];
  onActionClick: (player: NBAPlayer) => void;
  onTeamClick?: (teamId: number) => void;
}

export const UniversalPlayerSearcher: React.FC<UniversalPlayerSearcherProps> = ({ players, teams, nonNBATeams = [], onActionClick, onTeamClick }) => {
  const { state } = useGame();
  const isPba = isPbaIsolatedMode(state);
  const isFictional = state.leagueType === 'fictional';
  const leagueOptions = isFictional
    ? PLAYER_SEARCH_LEAGUES.filter(league => league.id === 'nba' || league.id === 'freeagents' || league.id === 'draft')
    : isEuroIsolatedMode(state)
      ? [...new Map([
          ...PLAYER_SEARCH_LEAGUES
            .filter(league => league.id !== 'draft')
            .map(league => [league.id, league] as const),
          ...(state.activeCompetitions ?? [])
            .filter(competition => getCompetitionPlayerStatus(competition.id) !== null)
            .map(competition => [competition.id, { id: competition.id, name: competition.displayName }] as const),
        ]).values()]
      : PLAYER_SEARCH_LEAGUES;
  const getInitialLeagues = () => {
    if (isPba) return ['pba'];
    const euroIds = getDefaultEuroLeagueSearcherIds(state as any);
    return isEuroIsolatedMode(state) && euroIds.length > 0 ? euroIds : ['nba'];
  };
  const getInitialGenders = () => {
    if (!isFictional) return ['Men'];
    if (state.leagueStats.fictionalPlayerPool === 'womens') return ['Women'];
    if (state.leagueStats.fictionalPlayerPool === 'mixed') return ['Men', 'Women'];
    return ['Men'];
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(getInitialLeagues);
  const [ageRange, setAgeRange] = useState({ min: 18, max: 45 });
  const [selectedCountry, setSelectedCountry] = useState<string>('All');
  const [selectedGender, setSelectedGender] = useState<string[]>(getInitialGenders);
  const [selectedPosition, setSelectedPosition] = useState<string>('All');
  const [selectedCollege, setSelectedCollege] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'name' | 'ovr'>('ovr');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [injuryFilter, setInjuryFilter] = useState<'all' | 'injured' | 'healthy'>('all');
  const [page, setPage] = useState(1);
  const [hasTouched, setHasTouched] = useState(true);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const nbaTeamIds = useMemo(
    () => new Set(teams.map(team => Number(team.id)).filter(tid => tid >= 0 && tid < 100)),
    [teams],
  );

  useEffect(() => {
    if (!isFictional) return;
    setSelectedLeagues(previous => {
      const scoped = previous.filter(league => league === 'nba' || league === 'freeagents' || league === 'draft');
      return scoped.length > 0 ? scoped : ['nba'];
    });
    setSelectedGender(getInitialGenders());
  }, [isFictional, state.leagueStats.fictionalPlayerPool]);

  const playersWithParsedData = useMemo(() => {
    const uniquePlayers = new Map<string, NBAPlayer>();
    players.forEach(p => {
      if (p.status === 'Retired' || p.hof) return;
      if (isFictional && isExternalLeaguePlayer(p)) return;
      const id = p.internalId || `${p.name}-${p.born?.loc}-${p.born?.year}`;
      const existing = uniquePlayers.get(id);
      if (
        !existing
        || ((p as any).externalArchiveOnly === true && (existing.status === 'Retired' || existing.tid < 0))
      ) {
        uniquePlayers.set(id, p);
      }
    });

    const simYear = state.leagueStats?.year ?? new Date().getFullYear();

    return Array.from(uniquePlayers.values()).map(rawPlayer => {
      const p = projectCanonicalPlayerBiography(rawPlayer);
      const extractedCountries = getPlayerNationalityCountries(p as NBAPlayer & { nationality?: unknown });
      const country = extractedCountries.join(' / ') || 'Unknown';
      const calculatedAge = p.born?.year ? (simYear - p.born.year) : (p.age || 0);
      
      const displayOvr = getScoutedDisplayOverall(state, p);

      return {
        ...p,
        extractedCountry: country,
        extractedCountries,
        calculatedAge,
        displayOvr,
      };
    });
  }, [isFictional, players, state]);

  const { allColleges, allCountries } = usePlayerSearchReferenceData(playersWithParsedData);

  const filteredPlayers = useMemo(() => {
    if (!hasTouched && !searchTerm) return [];

    let filtered = playersWithParsedData.filter(p => {
      if (p.status === 'Retired' || p.hof) return false;
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (selectedLeagues.length > 0) {
        let matchesLeague = false;
        if (selectedLeagues.includes('nba')) {
          const matchesNbaScope = isFictional
            ? (p.tid >= 0 || p.tid === -1) && !isExternalLeaguePlayer(p)
            : isPlayerInLeagueScope(p, 'nba', nbaTeamIds);
          if (matchesNbaScope &&
              p.status !== 'Prospect' &&
              p.tid !== -2) {
            matchesLeague = true;
          }
        }

        if (selectedLeagues.includes('wnba') && p.status === 'WNBA') matchesLeague = true;
        if (selectedLeagues.includes('freeagents')
          && p.tid === -1
          && p.status === 'Free Agent'
          && !isUnavailableInternationalTournamentPlayer(p)) matchesLeague = true;
        if (selectedLeagues.includes('draft') && (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect')) matchesLeague = true;
        if (selectedLeagues.includes('pba') && p.status === 'PBA') matchesLeague = true;
        if (selectedLeagues.includes('euroleague') && p.status === 'Euroleague') matchesLeague = true;
        if (selectedLeagues.includes('bleague') && p.status === 'B-League') matchesLeague = true;
        if (selectedLeagues.includes('gleague') && p.status === 'G-League') matchesLeague = true;
        if (selectedLeagues.includes('endesa') && p.status === 'Endesa') matchesLeague = true;
        if (selectedLeagues.includes('chinacba') && p.status === 'China CBA') matchesLeague = true;
        if (selectedLeagues.includes('nblaustralia') && p.status === 'NBL Australia') matchesLeague = true;
        if (selectedLeagues.some(competitionId => getCompetitionPlayerStatus(competitionId) === p.status)) matchesLeague = true;
        
        if (!matchesLeague) return false;
      }
      if (p.calculatedAge < ageRange.min || p.calculatedAge > ageRange.max) return false;
      if (selectedCountry !== 'All' && !p.extractedCountries.includes(selectedCountry)) return false;
      const gender = p.gender === 'female' || p.status === 'WNBA' ? 'Women' : 'Men';
      if (!selectedGender.includes(gender)) return false;
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
      if (selectedCollege !== 'All' && p.college !== selectedCollege) return false;
      const isInjured = (p as any)?.injury?.gamesRemaining > 0;
      if (injuryFilter === 'injured' && !isInjured) return false;
      if (injuryFilter === 'healthy' && isInjured) return false;

      return true;
    });
    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        const res = a.name.localeCompare(b.name);
        return sortOrder === 'asc' ? res : -res;
      } else {
        const res = a.displayOvr - b.displayOvr;
        return sortOrder === 'asc' ? res : -res;
      }
    });

    return filtered;
  }, [playersWithParsedData, searchTerm, selectedLeagues, ageRange, selectedCountry, selectedGender, selectedPosition, selectedCollege, sortBy, sortOrder, hasTouched, injuryFilter, isFictional, nbaTeamIds]);
  useEffect(() => { setPage(1); }, [searchTerm, selectedLeagues, ageRange, selectedCountry, selectedGender, selectedPosition, selectedCollege, sortBy, sortOrder, injuryFilter, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / itemsPerPage));
  const paginatedPlayers = filteredPlayers.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleTouch = () => {
    if (!hasTouched) setHasTouched(true);
  };

  const toggleLeague = (leagueId: string) => {
    handleTouch();
    setSelectedLeagues(prev => {
      const isSelecting = !prev.includes(leagueId);
      if (!isSelecting && prev.length === 1) return prev;

      const next = isSelecting ? [...prev, leagueId] : prev.filter(id => id !== leagueId);
      if (leagueId === 'wnba') {
        if (isSelecting) {
          setSelectedGender(g => g.includes('Women') ? g : [...g, 'Women']);
        } else {
          setSelectedGender(g => {
            if (g.includes('Women') && g.includes('Men')) {
              return g.filter(x => x !== 'Women');
            }
            return g;
          });
        }
      }
      return next;
    });
  };

  const toggleGender = (gender: string) => {
    handleTouch();
    setSelectedGender(prev => {
      const isSelecting = !prev.includes(gender);
      if (!isSelecting && prev.length === 1) return prev;

      const next = isSelecting ? [...prev, gender] : prev.filter(g => g !== gender);
      if (!isFictional && gender === 'Women') {
        if (isSelecting) {
          setSelectedLeagues(l => l.includes('wnba') ? l : [...l, 'wnba']);
        } else {
          setSelectedLeagues(l => {
            if (l.includes('wnba') && l.length > 1) {
              return l.filter(x => x !== 'wnba');
            }
            return l;
          });
        }
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full gap-4">
    <div className="flex flex-col lg:flex-row gap-8">
      <div className="w-full lg:w-80 flex-shrink-0 space-y-8 bg-slate-900/30 border border-slate-800/50 p-6 rounded-[2rem] h-fit sticky top-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
            <ListFilter size={16} className="text-indigo-500" /> Filters
          </h3>
          {hasTouched && (
            <button 
              onClick={() => {
                setSearchTerm('');
                setSelectedLeagues(getInitialLeagues());
                setAgeRange({ min: 18, max: 45 });
                setSelectedCountry('All');
                setSelectedGender(getInitialGenders());
                setSelectedPosition('All');
                setSelectedCollege('All');
                setInjuryFilter('all');
                setHasTouched(false);
              }}
              className="text-[10px] font-bold text-slate-500 hover:text-white transition-colors"
            >
              Reset
            </button>
          )}
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Trophy size={12} /> Leagues
            </label>
            <div className="flex flex-wrap gap-2">
              {leagueOptions.map(league => (
                <button
                  key={league.id}
                  onClick={() => toggleLeague(league.id)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all border ${selectedLeagues.includes(league.id) ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-700'}`}
                >
                  {isFictional && league.id === 'nba' ? 'Association' : league.name}
                </button>
              ))}
            </div>
          </div>

          {/* Gender */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <User size={12} /> Gender
            </label>
            <div className="flex gap-2">
              {PLAYER_SEARCH_GENDERS.map(gender => (
                <button
                  key={gender}
                  onClick={() => toggleGender(gender)}
                  className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all border ${selectedGender.includes(gender) ? 'bg-pink-500/20 text-pink-400 border-pink-500/50' : 'bg-slate-950 text-slate-500 border-slate-800'}`}
                >
                  {gender}
                </button>
              ))}
            </div>
          </div>

          {/* Age Range */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Age Range</label>
              <span className="text-[10px] font-bold text-indigo-400">{ageRange.min} - {ageRange.max}</span>
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="range"
                min="15"
                max="50"
                value={ageRange.min}
                onChange={(e) => { handleTouch(); setAgeRange({ ...ageRange, min: parseInt(e.target.value) }); }}
                className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
              <input
                type="range"
                min="15"
                max="50"
                value={ageRange.max}
                onChange={(e) => { handleTouch(); setAgeRange({ ...ageRange, max: parseInt(e.target.value) }); }}
                className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* Position */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Position</label>
            <select
              value={selectedPosition}
              onChange={(e) => { handleTouch(); setSelectedPosition(e.target.value); }}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs py-2.5 px-3 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="All">All Positions</option>
              {PLAYER_SEARCH_POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
            </select>
          </div>

          {/* Country */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Globe size={12} /> Country
            </label>
            <div className="relative">
              <button
                onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs py-2.5 px-3 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2 truncate">
                  {selectedCountry === 'All' ? (
                    <span>All Countries</span>
                  ) : (
                    <>
                      <CountryFlag country={selectedCountry} className="inline-flex h-2.5 w-4" imageClassName="h-full w-full rounded-[1px] object-cover" />
                      <span className="truncate">{selectedCountry}</span>
                    </>
                  )}
                </div>
                <ChevronDown size={14} className={`transition-transform ${isCountryDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isCountryDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsCountryDropdownOpen(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-50 mt-2 w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar"
                    >
                      <button
                        onClick={() => { setSelectedCountry('All'); setIsCountryDropdownOpen(false); handleTouch(); }}
                        className={`w-full text-left px-4 py-3 text-xs hover:bg-slate-800 transition-colors ${selectedCountry === 'All' ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-300'}`}
                      >
                        All Countries
                      </button>
                      {allCountries.map(c => (
                        <button
                          key={c}
                          onClick={() => { setSelectedCountry(c); setIsCountryDropdownOpen(false); handleTouch(); }}
                          className={`w-full text-left px-4 py-3 text-xs hover:bg-slate-800 transition-colors flex items-center gap-3 ${selectedCountry === c ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-300'}`}
                        >
                          <span className="truncate">{c}</span>
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* College */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <GraduationCap size={12} /> College
            </label>
            <select
              value={selectedCollege}
              onChange={(e) => { handleTouch(); setSelectedCollege(e.target.value); }}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs py-2.5 px-3 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="All">All Colleges</option>
              {allColleges.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Injury Status */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Health Status</label>
            <div className="flex gap-2">
              {(['all', 'healthy', 'injured'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { handleTouch(); setInjuryFilter(f); }}
                  className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all border ${
                    injuryFilter === f
                      ? f === 'injured' ? 'bg-rose-500/20 text-rose-400 border-rose-500/50'
                        : f === 'healthy' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                        : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50'
                      : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'healthy' ? 'Healthy' : 'Injured'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Top Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input
              type="text"
              placeholder="Search players by name..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); handleTouch(); }}
              className="w-full bg-slate-900 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
            />
          </div>
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-1 w-full md:w-auto">
            <button
              onClick={() => { setSortBy('ovr'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); handleTouch(); }}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${sortBy === 'ovr' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
            >
              Overall {sortBy === 'ovr' && <ArrowUpDown size={12} />}
            </button>
            <button
              onClick={() => { setSortBy('name'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); handleTouch(); }}
              className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${sortBy === 'name' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
            >
              A-Z {sortBy === 'name' && <ArrowUpDown size={12} />}
            </button>
          </div>
        </div>

        {/* Results Grid */}
        <div className="min-h-[400px]">
          {!hasTouched && !searchTerm ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-600 bg-slate-900/10 rounded-[3rem] border border-dashed border-slate-800">
              <LayoutGrid size={64} className="mb-6 opacity-10" />
              <p className="font-black uppercase tracking-[0.3em] text-sm">Ready to Scout</p>
              <p className="text-xs font-medium mt-3 text-slate-500 max-w-xs text-center leading-relaxed">
                Start typing a name or adjust filters to explore the global talent pool.
              </p>
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-600">
              <User size={48} className="mb-4 opacity-20" />
              <p className="font-black uppercase tracking-widest text-sm">No players found</p>
              <p className="text-xs font-medium mt-2">Try adjusting your filters or search term</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
              {paginatedPlayers.map(player => (
                <PlayerSearchCard
                  key={player.internalId}
                  player={player}
                  teams={teams}
                  nonNBATeams={nonNBATeams}
                  season={state.leagueStats.year}
                  onClick={onActionClick}
                  onTeamClick={onTeamClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Pagination — spans full width below sidebar + main */}
    {filteredPlayers.length > 0 && (
      <div className="flex items-center justify-between gap-2 sm:gap-4 pt-4 mt-2 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold hidden sm:inline-block">Show</span>
          <select
            className="bg-slate-900 border border-slate-800 text-white text-xs font-bold rounded-md px-2 py-1 outline-none appearance-none text-center"
            value={itemsPerPage}
            onChange={e => { setItemsPerPage(Number(e.target.value)); setPage(1); }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center flex-1">
          Page {page} <span className="text-slate-600">of</span> {totalPages}
          <span className="hidden sm:inline"> • {filteredPlayers.length} Players</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 sm:px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-slate-900 border border-slate-800 text-white rounded-full hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Prev
          </button>
          <button
            className="px-3 sm:px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-slate-900 border border-slate-800 text-white rounded-full hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
    )}
    </div>
  );
};
