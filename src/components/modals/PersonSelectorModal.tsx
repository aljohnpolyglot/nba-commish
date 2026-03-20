import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../store/GameContext';
import { Contact } from '../../types';
import { Search, User, X, Check, Utensils, MapPin, CheckCircle2, ChevronDown, SortAsc, SortDesc, Activity, Film, Music, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Restaurant, RESTAURANT_DATA_URL, Movie, MOVIE_DATA_URL } from './PersonSelector/types';
import { LocationStep } from './PersonSelector/LocationStep';
import { MovieStep } from './PersonSelector/MovieStep';
import { ClubStep } from './PersonSelector/ClubStep';
import { Club } from '../../data/clubs';
import { ContactList } from './PersonSelector/ContactList';
import { convertTo2KRating } from '../../utils/helpers';
import { INJURIES } from '../../data/injuries';
import { InjurySystem } from '../../services/simulation/InjurySystem';
import { getAllReferees, fetchRefereeData, getRefereePhoto } from '../../data/photos';

interface PersonSelectorModalProps {
  onSelect: (contacts: Contact[], reason?: string, amount?: number, location?: string, duration?: string) => void;
  onClose: () => void;
  title: string;
  actionType: 'suspension' | 'drug_test' | 'dinner' | 'general' | 'fine' | 'bribe' | 'movie' | 'leak_scandal' | 'give_money' | 'contact' | 'hypnotize' | 'sabotage' | 'club' | 'endorse_hof';
  preSelectedContact?: Contact;
  skipPersonSelection?: boolean;
}

export const PersonSelectorModal: React.FC<PersonSelectorModalProps> = ({ onSelect, onClose, title, actionType, preSelectedContact, skipPersonSelection }) => {
  const { state } = useGame();
  const [step, setStep] = useState<'people' | 'location' | 'movie' | 'movie_prompt' | 'club' | 'club_choice'>(actionType === 'club' ? 'club_choice' : 'people');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>(preSelectedContact ? [preSelectedContact] : []);
  
  // Injury State
  const [injurySort, setInjurySort] = useState<'name' | 'games-asc' | 'games-desc'>('name');
  const [selectedInjuryName, setSelectedInjuryName] = useState('');

  // Restaurant State
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);

  // Movie State
  const [movies, setMovies] = useState<Movie[]>([]);
  const [movieSearch, setMovieSearch] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [useMovieDatabase, setUseMovieDatabase] = useState<boolean | null>(null);

  // Club State
  const [clubSearch, setClubSearch] = useState('');
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);

  // Referee State
  const [refsLoaded, setRefsLoaded] = useState(false);

  const isMultiSelect = ['dinner', 'movie', 'bribe', 'drug_test', 'suspension', 'sabotage', 'club', 'endorse_hof'].includes(actionType);
  const maxSelections = isMultiSelect ? 100 : 1;
  const requiresLocation = actionType === 'dinner';
  const requiresClub = actionType === 'club';
  const isMovieAction = actionType === 'movie';

  useEffect(() => {
    fetchRefereeData().then(() => setRefsLoaded(true)).catch(() => setRefsLoaded(true));
  }, []);

  useEffect(() => {
    if (isMovieAction && useMovieDatabase === null && step === 'people') {
        setStep('movie_prompt');
    }
  }, [isMovieAction, useMovieDatabase, step]);

  useEffect(() => {
    if (requiresLocation && step === 'location' && restaurants.length === 0) {
      setLoadingRestaurants(true);
      fetch(RESTAURANT_DATA_URL)
        .then(res => res.text())
        .then(text => {
          const names = text.split('\n').map(n => n.trim()).filter(n => n.length > 0);
          const mapped = names.map((name, i) => ({
            name,
            city: 'Various',
            state: 'USA',
            telephone: 'N/A',
            genre: 'Restaurant'
          }));
          setRestaurants(mapped);
          setLoadingRestaurants(false);
        })
        .catch(err => {
          console.error("Failed to fetch restaurants", err);
          setLoadingRestaurants(false);
        });
    }
  }, [requiresLocation, step, restaurants.length]);

  useEffect(() => {
    if (isMovieAction && step === 'movie' && movies.length === 0) {
        setLoadingMovies(true);
        fetch(MOVIE_DATA_URL)
            .then(res => res.json())
            .then(data => {
                setMovies(data.data || []);
                setLoadingMovies(false);
            })
            .catch(err => {
                console.error("Failed to fetch movies", err);
                setLoadingMovies(false);
            });
    }
  }, [isMovieAction, step, movies.length]);

  const allContacts = useMemo(() => {
    const contactsMap = new Map<string, Contact>();
    const { staff, players, teams, nonNBATeams } = state;

    if (actionType === 'fine' || actionType === 'give_money') {
        teams.forEach(t => {
            contactsMap.set(`team-${t.id}`, {
                id: `team-${t.id}`,
                name: t.name,
                title: 'Franchise',
                organization: 'NBA',
                type: 'team' as const,
                teamLogoUrl: t.logoUrl
            });
        });
    }
    
    // Also include non-NBA teams for these actions if applicable
    if (actionType === 'give_money') {
        nonNBATeams.forEach(t => {
            contactsMap.set(`non-nba-team-${t.tid}`, {
                id: `non-nba-team-${t.tid}`,
                name: t.name,
                title: 'International Franchise',
                organization: t.league,
                type: 'team' as const,
                teamLogoUrl: t.imgURL
            });
        });
    }

    if (staff) {
        staff.gms.forEach(gm => {
            const id = `gm-${gm.name}`;
            const org = gm.team || 'NBA';
            contactsMap.set(id, { 
                id, 
                name: gm.name, 
                title: 'General Manager', 
                organization: org, 
                type: 'gm' as const, 
                playerPortraitUrl: gm.playerPortraitUrl, 
                teamLogoUrl: gm.teamLogoUrl,
                league: 'GM'
            });
        });
        staff.owners.forEach(o => {
            const id = `owner-${o.name}`;
            const org = o.team || 'NBA';
            contactsMap.set(id, { 
                id, 
                name: o.name, 
                title: 'Owner', 
                organization: org, 
                type: 'owner' as const, 
                playerPortraitUrl: o.playerPortraitUrl, 
                teamLogoUrl: o.teamLogoUrl,
                league: 'Owner'
            });
        });
        staff.coaches.forEach(c => {
            const id = `coach-${c.name}`;
            const org = c.team || 'NBA';
            contactsMap.set(id, { 
                id, 
                name: c.name, 
                title: 'Head Coach', 
                organization: org, 
                type: 'coach' as const, 
                playerPortraitUrl: c.playerPortraitUrl, 
                teamLogoUrl: c.teamLogoUrl,
                league: 'Coach'
            });
        });
        staff.leagueOffice.forEach(lo => {
            const id = `league-office-${lo.name}`;
            contactsMap.set(id, { 
                id, 
                name: lo.name, 
                title: lo.jobTitle || 'Executive', 
                organization: 'NBA League Office', 
                type: 'league_office' as const,
                playerPortraitUrl: lo.playerPortraitUrl 
            });
        });
    }

    // Inject referees (only for eligible action types)
    const refEligibleActions = ['fine', 'bribe', 'dinner', 'suspension', 'drug_test', 'contact', 'give_money', 'general'];
    if (refEligibleActions.includes(actionType)) {
        getAllReferees().forEach(ref => {
            const id = `ref-${ref.id}`;
            const photo = getRefereePhoto(ref.name) || undefined;
            contactsMap.set(id, {
                id,
                name: ref.name,
                title: 'NBA Referee',
                organization: 'NBA Officials',
                type: 'coach' as const,
                playerPortraitUrl: photo,
                league: 'Referee',
            });
        });
    }

    const activePlayers = players.filter(p => {
        // Exclude deceased players
        if (p.diedYear) return false;
        
        if (actionType === 'endorse_hof') {
            return (p.status === 'Retired' || p.tid === -3) && !p.hof;
        }
        
        // Include retired players only for personal actions
        if (p.status === 'Retired' || p.tid === -3) {
            return ['dinner', 'movie', 'give_money', 'bribe', 'contact', 'hypnotize', 'club'].includes(actionType);
        }
        
        // Include WNBA players only for personal actions
        if (p.status === 'WNBA' || p.tid === -100) {
            return ['dinner', 'movie', 'give_money', 'bribe', 'contact', 'hypnotize', 'club'].includes(actionType);
        }

        // Include PBA/Euroleague only for personal actions or specific executive actions if needed (but user said exclude)
        if (p.status === 'PBA' || p.status === 'Euroleague') {
             return ['dinner', 'movie', 'give_money', 'bribe', 'contact', 'hypnotize', 'club'].includes(actionType);
        }

        return true;
    });
    
    // Filter out prospects and free agents for discipline actions
    const disciplineActions = ['suspension', 'fine', 'drug_test', 'leak_scandal', 'sabotage'];
    const filteredPlayers = disciplineActions.includes(actionType) 
        ? activePlayers.filter(p => {
            const isExcludedStatus = 
                p.tid === -2 || 
                p.tid === -1 || 
                p.status === 'Prospect' || 
                p.status === 'Draft Prospect' || 
                p.status === 'WNBA' ||
                p.status === 'Free Agent' ||
                p.status === 'Euroleague' ||
                p.status === 'PBA';
            
            if (isExcludedStatus) return false;
            
            // Exclude already injured players for sabotage
            if (actionType === 'sabotage' && p.injury && p.injury.gamesRemaining > 0) {
                return false;
            }
            
            return true;
        })
        : activePlayers;

    const processedPlayerNames = new Set<string>();
    filteredPlayers.forEach(p => {
        if (processedPlayerNames.has(p.name)) return;
        
        if (actionType === 'endorse_hof') {
            if (p.hof || state.endorsedPlayers.includes(p.internalId)) return;
        }

        processedPlayerNames.add(p.name);

        let org = 'NBA';
        let title = 'Player';
        let league = 'NBA';
        
        const isNBA = !['WNBA', 'Euroleague', 'PBA', 'Draft Prospect', 'Prospect'].includes(p.status || '');
        const playerTeam = isNBA ? teams.find(t => t.id === p.tid) : null;
        const nonNBATeam = !isNBA ? nonNBATeams.find(t => t.tid === p.tid && t.league === p.status) : null;

        if (p.tid === -100 || p.status === 'WNBA') {
            org = 'WNBA';
            title = 'WNBA Player';
            league = 'WNBA';
        } else if (playerTeam) {
            org = playerTeam.name;
            league = 'NBA';
        } else if (nonNBATeam) {
            org = nonNBATeam.name;
            league = p.status || 'International';
        } else if (p.tid === -1 && p.status === 'Free Agent') {
            org = 'Free Agent';
            league = 'Free Agent';
        } else if (p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect') {
            org = 'Draft Prospect';
            title = 'Prospect';
            league = 'Draft Prospect';
        } else if (p.tid === -3 || p.status === 'Retired') {
            org = p.hof ? 'Hall of Famer' : 'Retired Player';
            title = 'Retired';
            league = 'Retired';
        }

        // Only append org if it's not already part of the title (though we simplified titles above)
        // Actually, let's just keep title simple as requested to avoid duplication
        // title = `${title} • ${org}`; // REMOVED to avoid duplication

        const rating2k = convertTo2KRating(p.overallRating || 0, p.hgt || 77);

        const teamLogoUrl = playerTeam?.logoUrl || nonNBATeam?.imgURL;
        contactsMap.set(p.internalId, {
            id: p.internalId,
            name: p.name,
            title: title,
            organization: org,
            type: 'player' as const,
            playerPortraitUrl: p.imgURL,
            teamLogoUrl,
            ovr: Math.round(rating2k),
            league: league
        });
    });
    
    return Array.from(contactsMap.values()).sort((a, b) => {
        const isStaffA = ['owner', 'gm', 'coach'].includes(a.type);
        const isStaffB = ['owner', 'gm', 'coach'].includes(b.type);
        
        if (isStaffA && isStaffB) {
            // Both are staff, sort alphabetically by team (organization)
            return (a.organization || '').localeCompare(b.organization || '');
        } else if (!isStaffA && !isStaffB) {
            // Both are players, sort by ovr descending
            return (b.ovr || 0) - (a.ovr || 0);
        } else {
            // Players before staff
            return isStaffA ? 1 : -1;
        }
    });
  }, [state, actionType, refsLoaded]);

  const availableFilters = useMemo(() => {
    const filters = ['All', 'NBA', 'Euroleague', 'PBA', 'WNBA', 'Draft Prospect', 'Owner', 'GM', 'Coach', 'Referee', 'Free Agent', 'Retired'];
    return filters.filter(filter => {
      if (filter === 'All') return true;
      if (actionType === 'endorse_hof' && ['Owner', 'GM', 'Coach', 'Referee'].includes(filter)) return false;
      return allContacts.some(c => c.league === filter);
    });
  }, [allContacts, actionType]);

  useEffect(() => {
    if (!availableFilters.includes(activeFilter)) {
      setActiveFilter('All');
    }
  }, [availableFilters, activeFilter]);

  const filteredContacts = useMemo(() => {
    return allContacts.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c.organization?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      
      if (actionType === 'endorse_hof' && c.type !== 'player') return false;

      if (activeFilter === 'All') return true;
      return c.league === activeFilter;
    }).slice(0, 50);
  }, [allContacts, searchTerm, activeFilter, actionType]);

  const filteredRestaurants = useMemo(() => {
    if (!restaurantSearch) return restaurants.slice(0, 50);
    return restaurants.filter(r => 
      r.name.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
      r.city.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
      r.genre.toLowerCase().includes(restaurantSearch.toLowerCase())
    ).slice(0, 50);
  }, [restaurants, restaurantSearch]);

  const sortedInjuries = useMemo(() => {
    return [...INJURIES].sort((a, b) => {
      if (injurySort === 'name') return a.name.localeCompare(b.name);
      if (injurySort === 'games-asc') return a.games - b.games;
      if (injurySort === 'games-desc') return b.games - a.games;
      return 0;
    });
  }, [injurySort]);

  const handleInjurySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const injuryName = e.target.value;
    setSelectedInjuryName(injuryName);
    const injury = INJURIES.find(i => i.name === injuryName);
    if (injury) {
      setReason(injury.name);
      // Use InjurySystem to calculate fluctuating games
      const games = InjurySystem.getSabotageGames(injury.games);
      setDuration(games.toString());
    }
  };

  const handleContactToggle = (contact: Contact) => {
    if (isMultiSelect) {
      if (selectedContacts.find(c => c.id === contact.id)) {
        setSelectedContacts(selectedContacts.filter(c => c.id !== contact.id));
      } else {
        if (selectedContacts.length < maxSelections) {
          setSelectedContacts([...selectedContacts, contact]);
        }
      }
    } else {
      if (selectedContacts.find(c => c.id === contact.id)) {
          setSelectedContacts([]);
      } else {
          setSelectedContacts([contact]);
      }
    }
  };

  const handleNext = () => {
    if (step === 'movie_prompt') {
        if (useMovieDatabase) {
            setStep('movie');
        } else {
            setStep('people');
        }
    } else if (step === 'movie') {
        setStep('people');
    } else if (step === 'people' && requiresLocation) {
      setStep('location');
    } else if (step === 'people' && requiresClub) {
      setStep('club');
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    let finalReason = reason;
    if (actionType === 'suspension' && duration) {
        finalReason = `${reason} (Duration: ${duration})`;
    }
    
    if (actionType === 'movie' && selectedMovie) {
        finalReason = `${reason ? reason + ' - ' : ''}Watching ${selectedMovie.title}`;
    }
    
    const locationName = selectedRestaurant 
        ? selectedRestaurant.name 
        : selectedClub
        ? selectedClub.name
        : undefined;
    onSelect(selectedContacts, finalReason, amount ? parseFloat(amount) : undefined, locationName, duration);
  };

  const isFormValid = () => {
    if (step === 'movie_prompt') return useMovieDatabase !== null;
    if (step === 'movie') return !!selectedMovie;
    if (step === 'club_choice') return true;
    if (step === 'people' && selectedContacts.length === 0) return false;
    if (actionType !== 'club' && selectedContacts.length === 0) return false;
    if (actionType === 'club' && step !== 'club' && step !== 'club_choice' && selectedContacts.length === 0) return false;
    if (actionType === 'suspension' && !reason.trim()) return false;
    if (actionType === 'sabotage' && (!reason.trim() || !duration.trim())) return false;
    if (actionType === 'drug_test' && !reason.trim()) return false;
    if (actionType === 'leak_scandal' && !reason.trim()) return false;
    if (actionType === 'hypnotize' && !reason.trim()) return false;
    if ((actionType === 'fine' || actionType === 'bribe' || actionType === 'give_money') && (!amount || !reason.trim())) return false;
    if (requiresLocation && step === 'location' && !selectedRestaurant) return false;
    if (requiresClub && step === 'club' && !selectedClub) return false;
    return true;
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      >
        <motion.div 
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-3 text-indigo-400">
                {step === 'location' ? <Utensils size={24} /> : step === 'movie' ? <Film size={24} /> : step === 'club' || step === 'club_choice' ? <Music size={24} /> : <User size={24} />}
                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                    {step === 'location' ? 'Select Venue' : step === 'movie' ? 'Select Movie' : step === 'movie_prompt' ? 'Movie Selection' : step === 'club' ? 'Select Club' : step === 'club_choice' ? 'Clubbing Choice' : title}
                </h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {step === 'movie_prompt' ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-8">
                    <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400">
                        <Film size={40} />
                    </div>
                    <div className="text-center space-y-2">
                        <h4 className="text-lg font-black text-white uppercase tracking-tight">IMDb Movie Database</h4>
                        <p className="text-sm text-slate-500 max-w-sm mx-auto">
                            Commissioner, would you like to browse our curated database of top-rated movies for this event?
                        </p>
                    </div>
                    <div className="flex gap-4 w-full max-w-xs">
                        <button 
                            onClick={() => {
                                setUseMovieDatabase(true);
                                setStep('movie');
                            }}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20 uppercase tracking-widest text-xs"
                        >
                            Yes, Please
                        </button>
                        <button 
                            onClick={() => {
                                setUseMovieDatabase(false);
                                setStep('people');
                            }}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                        >
                            No Thanks
                        </button>
                    </div>
                </div>
            ) : step === 'movie' ? (
                <MovieStep 
                    movies={movies}
                    movieSearch={movieSearch}
                    setMovieSearch={setMovieSearch}
                    selectedMovie={selectedMovie}
                    setSelectedMovie={setSelectedMovie}
                    loadingMovies={loadingMovies}
                />
            ) : step === 'club_choice' ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-8">
                <div className="text-center space-y-2">
                  <h4 className="text-xl font-bold text-white uppercase tracking-tight">Nightlife Choice</h4>
                  <p className="text-slate-400 text-sm">How do you want to experience the club tonight?</p>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <button
                    onClick={() => {
                      setSelectedContacts([]);
                      setStep('club');
                    }}
                    className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-violet-500 hover:bg-violet-500/10 transition-all group"
                  >
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-violet-500 group-hover:text-white transition-colors">
                      <User size={32} />
                    </div>
                    <div className="text-center">
                      <span className="block text-sm font-bold text-white uppercase tracking-wider">Go Alone</span>
                      <span className="block text-[10px] text-slate-500 mt-1">Solo mission, mysterious vibes</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setStep('people')}
                    className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500 hover:bg-indigo-500/10 transition-all group"
                  >
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                      <Users size={32} />
                    </div>
                    <div className="text-center">
                      <span className="block text-sm font-bold text-white uppercase tracking-wider">Invite Someone</span>
                      <span className="block text-[10px] text-slate-500 mt-1">Bring the squad or a special guest</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : step === 'people' ? (
                <>
                    {!skipPersonSelection && (
                      <>
                        {/* Search & Filters */}
                        <div className="space-y-3">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search by name or team..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                                {availableFilters.map((filter) => (
                                    <button
                                        key={filter}
                                        onClick={() => setActiveFilter(filter)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                                            activeFilter === filter 
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                                        }`}
                                    >
                                        {filter}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Contact List */}
                        {activeFilter === 'Referee' && !refsLoaded ? (
                          <div className="flex items-center justify-center h-32 text-slate-500 text-xs uppercase tracking-widest gap-3">
                            <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                            Loading referee photos...
                          </div>
                        ) : (
                          <ContactList
                            contacts={filteredContacts}
                            selectedContacts={selectedContacts}
                            onToggle={handleContactToggle}
                          />
                        )}
                      </>
                    )}

                    {/* Additional Inputs */}
                    <div className={`space-y-4 ${skipPersonSelection ? '' : 'pt-4 border-t border-slate-800'}`}>
                        {actionType === 'suspension' && (
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reason <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Violation of league policy..."
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
                                    />
                                </div>
                                <div className="w-1/3 space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Duration <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        value={duration}
                                        onChange={(e) => setDuration(e.target.value)}
                                        placeholder="e.g. 5 games"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
                                    />
                                </div>
                            </div>
                        )}

                        {actionType === 'sabotage' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Injury <span className="text-rose-500">*</span></label>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setInjurySort('name')}
                                            className={`p-1.5 rounded-lg transition-colors ${injurySort === 'name' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                                            title="Sort A-Z"
                                        >
                                            <SortAsc size={14} />
                                        </button>
                                        <button 
                                            onClick={() => setInjurySort('games-asc')}
                                            className={`p-1.5 rounded-lg transition-colors ${injurySort === 'games-asc' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                                            title="Sort by Lowest Games"
                                        >
                                            <ChevronDown size={14} className="rotate-180" />
                                        </button>
                                        <button 
                                            onClick={() => setInjurySort('games-desc')}
                                            className={`p-1.5 rounded-lg transition-colors ${injurySort === 'games-desc' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                                            title="Sort by Highest Games"
                                        >
                                            <ChevronDown size={14} />
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="flex gap-4">
                                    <div className="flex-1 space-y-2">
                                        <div className="relative">
                                            <select
                                                value={selectedInjuryName}
                                                onChange={handleInjurySelect}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none appearance-none cursor-pointer"
                                            >
                                                <option value="" disabled>Choose an injury...</option>
                                                {sortedInjuries.map(injury => (
                                                    <option key={injury.name} value={injury.name}>
                                                        {injury.name} ({injury.games} games)
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                                <ChevronDown size={16} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-1/3 space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <Activity size={10} />
                                            Games <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={duration}
                                            onChange={(e) => setDuration(e.target.value)}
                                            placeholder="e.g. 15"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none placeholder:text-slate-700 transition-all"
                                        />
                                    </div>
                                </div>
                                {reason && (
                                    <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                                        <p className="text-[10px] text-violet-300 font-medium leading-relaxed">
                                            <span className="font-bold uppercase tracking-wider">Covert Plan:</span> Target will suffer a <span className="text-white underline decoration-violet-500/50">{reason}</span> and be sidelined for approximately <span className="text-white font-bold">{duration}</span> games. The media will report this as a natural occurrence.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {actionType === 'drug_test' && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reason / Suspicion <span className="text-rose-500">*</span></label>
                                <input
                                    type="text"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Erratic behavior, anonymous tip..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none placeholder:text-slate-700 transition-all"
                                />
                            </div>
                        )}

                        {actionType === 'leak_scandal' && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Scandal Topic / Details <span className="text-rose-500">*</span></label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="e.g., Unpaid gambling debts, locker room altercation..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all h-24 resize-none"
                                />
                            </div>
                        )}

                        {actionType === 'hypnotize' && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Command / Suggestion <span className="text-rose-500">*</span></label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="e.g., Demand a trade to the Knicks, shave your head, guarantee a championship..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none placeholder:text-slate-700 transition-all h-24 resize-none"
                                />
                            </div>
                        )}

                        {(actionType === 'fine' || actionType === 'bribe' || actionType === 'give_money') && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reason <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder={actionType === 'fine' ? "Technical foul, conduct detrimental..." : actionType === 'give_money' ? "Charitable donation, performance bonus..." : "Influence decision, silence scandal..."}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Amount ($) <span className="text-rose-500">*</span></label>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="50000"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
                                    />
                                </div>
                            </div>
                        )}
                        
                        {(actionType === 'dinner' || actionType === 'movie' || actionType === 'club') && (
                             <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Occasion / Note (Optional)</label>
                                <input
                                    type="text"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder={actionType === 'dinner' ? "Discussing contract extension..." : actionType === 'movie' ? "Team bonding..." : actionType === 'club' ? "Night out..." : "Violation of league policy..."}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
                                />
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* Location Selection Step */}
                    {step === 'location' ? (
                      <LocationStep
                        restaurants={restaurants}
                        restaurantSearch={restaurantSearch}
                        setRestaurantSearch={setRestaurantSearch}
                        selectedRestaurant={selectedRestaurant}
                        setSelectedRestaurant={setSelectedRestaurant}
                        loadingRestaurants={loadingRestaurants}
                        guestCount={selectedContacts.length}
                      />
                    ) : (
                      <ClubStep
                        clubSearch={clubSearch}
                        setClubSearch={setClubSearch}
                        selectedClub={selectedClub}
                        setSelectedClub={setSelectedClub}
                        guestCount={selectedContacts.length}
                      />
                    )}
                </>
            )}
          </div>

          <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {selectedContacts.length} Selected
            </div>
            <div className="flex gap-3">
                {(step === 'location' || step === 'movie' || step === 'club' || step === 'club_choice' || (step === 'people' && isMovieAction && useMovieDatabase)) && (
                    <button 
                        onClick={() => {
                            if (step === 'location') setStep('people');
                            else if (step === 'club') {
                                if (actionType === 'club') setStep('club_choice');
                                else setStep('people');
                            }
                            else if (step === 'club_choice') onClose();
                            else if (step === 'movie') setStep('movie_prompt');
                            else if (step === 'people' && isMovieAction && useMovieDatabase) setStep('movie');
                            else if (step === 'people' && actionType === 'club') setStep('club_choice');
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-white hover:bg-slate-800 transition-colors uppercase tracking-wider"
                    >
                        Back
                    </button>
                )}
                <button 
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-white hover:bg-slate-800 transition-colors uppercase tracking-wider"
                >
                    Cancel
                </button>
                {step !== 'club_choice' && (
                  <button 
                      onClick={handleNext}
                      disabled={!isFormValid()}
                      className="px-6 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                  >
                      {step === 'movie_prompt' ? 'Select Option' : 
                       step === 'movie' ? 'Next: Select Guests' :
                       step === 'people' && requiresLocation ? 'Next: Select Venue' : 
                       step === 'people' && requiresClub ? 'Next: Select Club' : 'Confirm Selection'}
                      {(step === 'people' && requiresLocation) && <Utensils size={14} />}
                      {(step === 'people' && requiresClub) && <Music size={14} />}
                      {step === 'movie' && <User size={14} />}
                  </button>
                )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
