import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { X, Search, Music, Mic2, CheckCircle2, Star, Trophy, MapPin, Users, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NBATeam } from '../../types';

interface Artist {
  id: string;
  name: string;
  track?: string;
}

interface InvitePerformanceModalProps {
  onClose: () => void;
  preselectedEvent?: string | null;
  onConfirm: (payload: { 
    type: 'performance' | 'national_anthem', 
    event?: string, 
    teamId?: number, 
    gameId?: number,
    artists: string[],
    isHighProfile?: boolean
  }) => void;
}

const ARTISTS_URL = 'https://gist.githubusercontent.com/tmcw/890b953ee7f2488f56b515a4f013191a/raw/bf1f72f36cee071d12d343f65d3cd2d5dcaa50ac/tracks.json';

const EXCLUDED_ARTISTS = new Set([
  'XXXTENTACION', 'Juice WRLD', 'Pop Smoke', 'Mac Miller', 'Nipsey Hussle', 
  'Lil Peep', 'Avicii', 'Prince', 'Michael Jackson', 'David Bowie', 
  'Whitney Houston', 'Amy Winehouse', '2Pac', 'The Notorious B.I.G.',
  'Eazy-E', 'Left Eye', 'Aaliyah', 'Liam Payne'
]);

export const InvitePerformanceModal: React.FC<InvitePerformanceModalProps> = ({ onClose, onConfirm, preselectedEvent }) => {
  const { state } = useGame();
  const [step, setStep] = useState<'type' | 'event' | 'team' | 'game' | 'artists'>('type');
  const [performanceType, setPerformanceType] = useState<'performance' | 'national_anthem' | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(preselectedEvent || null);

  useEffect(() => {
    if (preselectedEvent) {
      setPerformanceType('performance');
      if (preselectedEvent === 'Regular Season Halftime') {
        setStep('team');
      } else {
        setStep('artists');
      }
    }
  }, [preselectedEvent]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>([]);

  useEffect(() => {
    fetch(ARTISTS_URL)
      .then(res => res.json())
      .then(data => {
        const rawArtists = data.idMap ? Object.values(data.idMap) : [];
        const processed = new Map<string, Artist>();
        
        (rawArtists as any[]).forEach(item => {
          let name = item.artist;
          if (name) {
            // Clean leading asterisks and whitespace
            name = name.replace(/^[*]+/, '').trim();
            
            if (!EXCLUDED_ARTISTS.has(name) && !processed.has(name)) {
              processed.set(name, {
                id: item.id || Math.random().toString(),
                name: name
              });
            }
          }
        });
        
        setArtists(Array.from(processed.values()).sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch artists", err);
        setLoading(false);
      });
  }, []);

  const filteredArtists = useMemo(() => {
    if (!searchTerm) return artists.slice(0, 50);
    return artists.filter(a => 
      a.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 50);
  }, [artists, searchTerm]);

  const hasPastChamp = useMemo(() => {
    return state.teams.some(t => t.seasons?.some(s => s.playoffRoundsWon === 4));
  }, [state.teams]);

  const isPastSeasonOpener = useMemo(() => {
    return state.schedule.some(g => g.played);
  }, [state.schedule]);

  const events = [
    { id: 'halftime_finals', name: 'NBA Finals Halftime Show', icon: Trophy, disabled: state.leagueStats.hasFinalsHalftime },
    { id: 'ring_ceremony', name: 'Championship Ring Ceremony', icon: Trophy, disabled: state.leagueStats.hasRingCeremony || !hasPastChamp || isPastSeasonOpener },
    { id: 'all_star', name: 'All-Star Game Halftime', icon: Star, disabled: state.leagueStats.hasAllStarHalftime },
    { id: 'random_halftime', name: 'Regular Season Halftime', icon: Music, disabled: false },
  ];

  const handleConfirm = () => {
    if (performanceType && selectedArtists.length > 0) {
      onConfirm({
        type: performanceType,
        event: performanceType === 'performance' ? selectedEvent || undefined : undefined,
        teamId: (performanceType === 'national_anthem' || selectedEvent === 'Regular Season Halftime') ? selectedTeamId || undefined : undefined,
        gameId: (performanceType === 'national_anthem' || selectedEvent === 'Regular Season Halftime') ? selectedGameId || undefined : undefined,
        artists: selectedArtists.map(a => a.name),
        isHighProfile: performanceType === 'performance' && selectedEvent !== 'Regular Season Halftime'
      });
    }
  };

  const isStepValid = () => {
    if (step === 'type') return performanceType !== null;
    if (step === 'event') {
      return selectedEvent !== null;
    }
    if (step === 'team') {
      return selectedTeamId !== null;
    }
    if (step === 'game') {
      return selectedGameId !== null;
    }
    if (step === 'artists') {
      if (performanceType === 'national_anthem') return selectedArtists.length === 1;
      return selectedArtists.length > 0;
    }
    return false;
  };

  const handleArtistToggle = (artist: Artist) => {
    if (performanceType === 'national_anthem') {
      setSelectedArtists([artist]);
    } else {
      if (selectedArtists.find(a => a.id === artist.id)) {
        setSelectedArtists(selectedArtists.filter(a => a.id !== artist.id));
      } else {
        setSelectedArtists([...selectedArtists, artist]);
      }
    }
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
            <div className="flex items-center gap-3 text-amber-400">
                <Music size={24} />
                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                    {step === 'type' ? 'Invite Performance' : 
                     step === 'event' ? 'Select Event' : 
                     step === 'team' ? 'Select Team' :
                     step === 'game' ? 'Select Game' :
                     'Select Artist(s)'}
                </h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {step === 'type' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setPerformanceType('performance');
                    setStep('event');
                  }}
                  className="flex flex-col items-center gap-4 p-8 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-amber-500/50 transition-all group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                    <Music size={32} />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-white uppercase tracking-tight">Full Performance</div>
                    <p className="text-xs text-slate-500 mt-1">Halftime shows, ceremonies, and concerts.</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setPerformanceType('national_anthem');
                    setStep('team');
                  }}
                  className="flex flex-col items-center gap-4 p-8 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-blue-500/50 transition-all group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                    <Mic2 size={32} />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-white uppercase tracking-tight">National Anthem</div>
                    <p className="text-xs text-slate-500 mt-1">Single artist performance before tip-off.</p>
                  </div>
                </button>
              </div>
            )}

            {step === 'event' && (
              <div className="grid grid-cols-1 gap-3">
                {events.map(event => (
                  <button
                    key={event.id}
                    disabled={event.disabled}
                    onClick={() => setSelectedEvent(event.name)}
                    className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                      event.disabled ? 'opacity-40 grayscale cursor-not-allowed' :
                      selectedEvent === event.name 
                        ? 'bg-amber-600/20 border-amber-500/50' 
                        : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${selectedEvent === event.name ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      <event.icon size={20} />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-white">{event.name}</span>
                        {event.disabled && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Already Held This Season</span>}
                    </div>
                    {selectedEvent === event.name && <CheckCircle2 size={18} className="ml-auto text-amber-400" />}
                  </button>
                ))}
              </div>
            )}

            {step === 'team' && (
              <div className="space-y-4">
                <div className="text-sm text-slate-400 mb-2">
                  Select the home team hosting the {performanceType === 'national_anthem' ? 'National Anthem' : 'Regular Season Halftime'} performance.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {state.teams.map(team => (
                    <button
                      key={team.id}
                      onClick={() => {
                        setSelectedTeamId(team.id);
                        setSelectedGameId(null);
                      }}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        selectedTeamId === team.id 
                          ? 'bg-blue-600/20 border-blue-500/50' 
                          : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      <img src={team.logoUrl} alt={team.name} className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                      <span className="text-sm font-bold text-white truncate">{team.name}</span>
                      {selectedTeamId === team.id && <CheckCircle2 size={16} className="ml-auto text-blue-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'game' && (
              <div className="space-y-4">
                <div className="text-sm text-slate-400 mb-2">
                  Select the upcoming home game for the performance.
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {state.schedule.filter(g => g.homeTid === selectedTeamId && !g.played).slice(0, 10).map(game => {
                    const awayTeam = state.teams.find(t => t.id === game.awayTid);
                    return (
                      <button
                        key={game.gid}
                        onClick={() => setSelectedGameId(game.gid)}
                        className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                          selectedGameId === game.gid 
                            ? 'bg-amber-600/20 border-amber-500/50' 
                            : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex flex-col flex-1">
                          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{game.date}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-slate-300">vs</span>
                            <img src={awayTeam?.logoUrl} alt={awayTeam?.name} className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />
                            <span className="font-bold text-white">{awayTeam?.name}</span>
                          </div>
                        </div>
                        {selectedGameId === game.gid && <CheckCircle2 size={18} className="text-amber-400" />}
                      </button>
                    );
                  })}
                  {state.schedule.filter(g => g.homeTid === selectedTeamId && !g.played).length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      No upcoming home games found for this team.
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 'artists' && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search artists..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none placeholder:text-slate-700 transition-all"
                    autoFocus
                  />
                </div>
                
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <Music className="animate-bounce mb-4" size={32} />
                    <p className="text-sm font-bold uppercase tracking-widest">Loading Artist Database...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredArtists.map(artist => {
                      const isSelected = selectedArtists.some(a => a.id === artist.id);
                      return (
                        <button
                          key={artist.id}
                          onClick={() => handleArtistToggle(artist)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                            isSelected 
                              ? 'bg-amber-600/20 border-amber-500/50 shadow-lg shadow-amber-500/10' 
                              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isSelected ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            {artist.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>{artist.name}</div>
                          </div>
                          {isSelected && <CheckCircle2 size={16} className="text-amber-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {step === 'artists' ? `${selectedArtists.length} Artist(s) Selected` : ''}
            </div>
            <div className="flex gap-3">
              {step !== 'type' && (
                <button 
                  onClick={() => {
                    if (step === 'event') setStep('type');
                    if (step === 'team') setStep(performanceType === 'performance' ? 'event' : 'type');
                    if (step === 'game') setStep('team');
                    if (step === 'artists') {
                        if (performanceType === 'national_anthem') setStep('game');
                        else if (selectedEvent === 'Regular Season Halftime') setStep('game');
                        else setStep('event');
                    }
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
              {step !== 'artists' ? (
                <button 
                  onClick={() => {
                      if (step === 'type') {
                          if (performanceType === 'performance') setStep('event');
                          else setStep('team');
                      } else if (step === 'event') {
                          if (selectedEvent === 'Regular Season Halftime') setStep('team');
                          else setStep('artists');
                      } else if (step === 'team') {
                          setStep('game');
                      } else if (step === 'game') {
                          setStep('artists');
                      }
                  }}
                  disabled={!isStepValid()}
                  className="px-6 py-2 rounded-xl text-xs font-black text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-all uppercase tracking-wider shadow-lg shadow-amber-600/20"
                >
                  Next
                </button>
              ) : (
                <button 
                  onClick={handleConfirm}
                  disabled={!isStepValid()}
                  className="px-6 py-2 rounded-xl text-xs font-black text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-all uppercase tracking-wider shadow-lg shadow-amber-600/20"
                >
                  Confirm Invite
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
