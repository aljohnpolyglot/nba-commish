import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Filter, X, ChevronDown, User, Globe, GraduationCap, Trophy, ArrowUpDown, LayoutGrid, ListFilter, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { NBAPlayer, NBATeam, NonNBATeam } from '../../../types';
import { convertTo2KRating, getCountryFromLoc, getCountryCode } from '../../../utils/helpers';
import { PlayerSearchCard } from './PlayerSearchCard';

interface UniversalPlayerSearcherProps {
  players: NBAPlayer[];
  teams: NBATeam[];
  nonNBATeams?: NonNBATeam[];
  onActionClick: (player: NBAPlayer) => void;
  onTeamClick?: (teamId: number) => void;
}

const LEAGUES = [
  { id: 'nba', name: 'NBA' },
  { id: 'wnba', name: 'WNBA' },
  { id: 'pba', name: 'PBA' },
  { id: 'euroleague', name: 'Euroleague' },
  { id: 'draft', name: 'Draft Prospects' }
];

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const GENDERS = ['Men', 'Women'];

export const UniversalPlayerSearcher: React.FC<UniversalPlayerSearcherProps> = ({ players, teams, nonNBATeams = [], onActionClick, onTeamClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(['nba']);
  const [ageRange, setAgeRange] = useState({ min: 18, max: 45 });
  const [selectedCountry, setSelectedCountry] = useState<string>('All');
  const [selectedGender, setSelectedGender] = useState<string[]>(['Men']);
  const [selectedPosition, setSelectedPosition] = useState<string>('All');
  const [selectedCollege, setSelectedCollege] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'name' | 'ovr'>('ovr');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [hasTouched, setHasTouched] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);
  const itemsPerPage = 24;

  const [countriesList, setCountriesList] = useState<string[]>([]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

  useEffect(() => {
    // Fetch a reliable list of countries to filter out from colleges
    fetch('https://restcountries.com/v3.1/all?fields=name')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const names = data.map((c: any) => c.name.common.toLowerCase());
          setCountriesList(names);
        }
      })
      .catch(err => {
        console.error("Failed to fetch countries:", err);
        // Fallback common countries
        setCountriesList(['usa', 'united states', 'canada', 'serbia', 'slovenia', 'france', 'spain', 'greece', 'australia', 'nigeria', 'cameroon', 'germany', 'italy', 'brazil', 'argentina', 'china', 'japan', 'philippines']);
      });
  }, []);

  const playersWithParsedData = useMemo(() => {
    // Filter out duplicates and retired/HOF first
    const uniquePlayers = new Map<string, NBAPlayer>();
    players.forEach(p => {
      if (p.status === 'Retired' || p.hof) return;
      const id = p.internalId || `${p.name}-${p.born?.loc}-${p.born?.year}`;
      if (!uniquePlayers.has(id)) {
        uniquePlayers.set(id, p);
      }
    });

    const currentYear = new Date().getFullYear();

    return Array.from(uniquePlayers.values()).map(p => {
      const country = getCountryFromLoc(p.born?.loc);
      const calculatedAge = p.born?.year ? (currentYear - p.born.year) : (p.age || 0);
      
      const rawOvr = p.overallRating || (p.ratings?.[0]?.ovr || 0);
      const displayOvr = convertTo2KRating(rawOvr, p.hgt || 50);

      return {
        ...p,
        extractedCountry: country,
        calculatedAge,
        displayOvr
      };
    });
  }, [players]);

  const allCountries = useMemo(() => {
    const set = new Set<string>();
    playersWithParsedData.forEach(p => {
      if (p.extractedCountry) set.add(p.extractedCountry);
    });
    return Array.from(set).sort();
  }, [playersWithParsedData]);

  const allColleges = useMemo(() => {
    const set = new Set<string>();
    playersWithParsedData.forEach(p => {
      if (p.college) {
        const collegeLower = p.college.toLowerCase();
        if (!countriesList.includes(collegeLower)) {
          set.add(p.college);
        }
      }
    });
    return Array.from(set).sort();
  }, [playersWithParsedData, countriesList]);

  const filteredPlayers = useMemo(() => {
    if (!hasTouched && !searchTerm) return [];

    let filtered = playersWithParsedData.filter(p => {
      // Filter out retired and HOF
      if (p.status === 'Retired' || p.hof) return false;

      // Name Search
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

      // League Filter
      if (selectedLeagues.length > 0) {
        let matchesLeague = false;
        
        if (selectedLeagues.includes('nba')) {
          // NBA includes Active players on teams (tid >= 0) and Free Agents who aren't specifically tagged as other leagues
          if ((p.tid >= 0 || p.tid === -1) && 
              p.status !== 'WNBA' && 
              p.status !== 'PBA' && 
              p.status !== 'Euroleague' &&
              p.status !== 'Prospect' &&
              p.tid !== -2) {
            matchesLeague = true;
          }
        }
        
        if (selectedLeagues.includes('wnba') && p.status === 'WNBA') matchesLeague = true;
        if (selectedLeagues.includes('draft') && (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect')) matchesLeague = true;
        if (selectedLeagues.includes('pba') && p.status === 'PBA') matchesLeague = true;
        if (selectedLeagues.includes('euroleague') && p.status === 'Euroleague') matchesLeague = true;
        
        if (!matchesLeague) return false;
      }

      // Age Filter
      if (p.calculatedAge < ageRange.min || p.calculatedAge > ageRange.max) return false;

      // Country Filter
      if (selectedCountry !== 'All' && p.extractedCountry !== selectedCountry) return false;

      // Gender Filter
      const gender = p.status === 'WNBA' ? 'Women' : 'Men';
      if (!selectedGender.includes(gender)) return false;

      // Position Filter
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

      // College Filter
      if (selectedCollege !== 'All' && p.college !== selectedCollege) return false;

      return true;
    });

    // Sorting
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
  }, [playersWithParsedData, searchTerm, selectedLeagues, ageRange, selectedCountry, selectedGender, selectedPosition, selectedCollege, sortBy, sortOrder, hasTouched]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 1.0 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [filteredPlayers.length]); // Re-observe when list changes

  const paginatedPlayers = filteredPlayers.slice(0, page * itemsPerPage);

  const handleTouch = () => {
    if (!hasTouched) setHasTouched(true);
  };

  const toggleLeague = (leagueId: string) => {
    handleTouch();
    setSelectedLeagues(prev => {
      const isSelecting = !prev.includes(leagueId);
      if (!isSelecting && prev.length === 1) return prev;

      const next = isSelecting ? [...prev, leagueId] : prev.filter(id => id !== leagueId);
      
      // Linking WNBA league to Women gender
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
      // Rule: at least one gender must be selected
      if (!isSelecting && prev.length === 1) return prev;

      const next = isSelecting ? [...prev, gender] : prev.filter(g => g !== gender);

      // Linking Women gender to WNBA league
      if (gender === 'Women') {
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
    <div className="flex flex-col lg:flex-row h-full gap-8">
      {/* Sidebar Filters */}
      <div className="w-full lg:w-80 flex-shrink-0 space-y-8 bg-slate-900/30 border border-slate-800/50 p-6 rounded-[2rem] h-fit sticky top-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
            <ListFilter size={16} className="text-indigo-500" /> Filters
          </h3>
          {hasTouched && (
            <button 
              onClick={() => {
                setSearchTerm('');
                setSelectedLeagues(['nba']);
                setAgeRange({ min: 18, max: 45 });
                setSelectedCountry('All');
                setSelectedGender(['Men']);
                setSelectedPosition('All');
                setSelectedCollege('All');
                setHasTouched(false);
              }}
              className="text-[10px] font-bold text-slate-500 hover:text-white transition-colors"
            >
              Reset
            </button>
          )}
        </div>

        <div className="space-y-6">
          {/* Leagues */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Trophy size={12} /> Leagues
            </label>
            <div className="flex flex-wrap gap-2">
              {LEAGUES.map(league => (
                <button
                  key={league.id}
                  onClick={() => toggleLeague(league.id)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all border ${selectedLeagues.includes(league.id) ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-700'}`}
                >
                  {league.name}
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
              {GENDERS.map(gender => (
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
              {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
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
                      {getCountryCode(selectedCountry) && (
                        <img 
                          src={`https://flagcdn.com/w20/${getCountryCode(selectedCountry)}.png`}
                          alt=""
                          className="w-4 h-2.5 object-cover rounded-[1px]"
                        />
                      )}
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
        <div className="flex-1 min-h-[400px]">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {paginatedPlayers.map(player => (
                <PlayerSearchCard
                  key={player.internalId}
                  player={player}
                  teams={teams}
                  nonNBATeams={nonNBATeams}
                  onClick={onActionClick}
                  onTeamClick={onTeamClick}
                />
              ))}
            </div>
          )}
        </div>

        {/* Infinite Scroll Sentinel */}
        {filteredPlayers.length > paginatedPlayers.length && (
          <div ref={loaderRef} className="flex justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Scouting More Talent...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
