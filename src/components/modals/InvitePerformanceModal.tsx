import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { X, Search, Music, CheckCircle2, Star, Trophy, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getGameDateParts } from '../../utils/dateUtils';
import {
  isAllStarHalftimePerformance,
  isAllStarSaturdayPerformance,
  isFinalsPerformance,
  getPerformanceEventNames,
} from '../../services/events/performanceEvents';
import {
  getRecommendedPerformanceArtists,
  loadPerformanceArtists,
  type PerformanceArtist as Artist,
} from '../../services/events/performanceArtists';

interface InvitePerformanceModalProps {
  onClose: () => void;
  preselectedEvent?: string | null;
  onConfirm: (payload: Array<{
    type: 'performance',
    event: string,
    artists: string[],
    artistDetails?: Array<Pick<Artist, 'name' | 'imageUrl'>>,
    seasonYear?: number,
    isHighProfile?: boolean
  }>) => void;
}

export const InvitePerformanceModal: React.FC<InvitePerformanceModalProps> = ({ onClose, onConfirm, preselectedEvent }) => {
  const { state } = useGame();
  const [step, setStep] = useState<'event' | 'artists'>('event');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [artistLoadFailed, setArtistLoadFailed] = useState(false);
  const [artistDecade, setArtistDecade] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [bookings, setBookings] = useState<Record<string, Artist>>({});
  const gameDateYear = getGameDateParts(state.date).year;
  const artistYear = Number.isFinite(gameDateYear) ? gameDateYear : state.leagueStats.year;
  const usePbaPool = state.leagueStats?.uiMode === 'pba_isolated';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setArtistLoadFailed(false);
    setArtistDecade('');

    loadPerformanceArtists(artistYear, usePbaPool)
      .then(selected => {
        if (cancelled) return;
        setArtists(selected.artists);
        setArtistDecade(selected.decade);
      })
      .catch(err => {
        if (cancelled) return;
        console.error("Failed to fetch artists", err);
        setArtists([]);
        setArtistDecade('');
        setArtistLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [artistYear, usePbaPool]);

  const filteredArtists = useMemo(() => {
    if (!searchTerm) return artists;
    return artists.filter(a => 
      a.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [artists, searchTerm]);

  const events = useMemo(() => {
    const eventNames = getPerformanceEventNames(state.leagueStats.uiMode);
    const scheduledThisSeason = (state.scheduledEvents ?? [])
      .filter(event =>
        event.type === 'PERFORMANCE_DAY'
        && Number(event.payload?.seasonYear ?? String(event.date).slice(0, 4)) === state.leagueStats.year,
      )
      .map(event => String(event.payload?.event ?? ''));
    const flagsAreCurrent = state.leagueStats.performanceInvitationYear === state.leagueStats.year;
    return [
      {
        id: 'all_star',
        name: eventNames.allStarHalftime,
        icon: Star,
        disabled: (flagsAreCurrent && state.leagueStats.hasAllStarHalftime)
          || scheduledThisSeason.some(isAllStarHalftimePerformance),
      },
      {
        id: 'all_star_saturday',
        name: eventNames.allStarSaturday,
        icon: Music,
        disabled: (flagsAreCurrent && state.leagueStats.hasAllStarSaturdayPerformance)
          || scheduledThisSeason.some(isAllStarSaturdayPerformance),
      },
      {
        id: 'halftime_finals',
        name: eventNames.finals,
        icon: Trophy,
        disabled: (flagsAreCurrent && state.leagueStats.hasFinalsHalftime)
          || scheduledThisSeason.some(isFinalsPerformance),
      },
    ];
  }, [
    state.leagueStats.hasAllStarHalftime,
    state.leagueStats.hasAllStarSaturdayPerformance,
    state.leagueStats.hasFinalsHalftime,
    state.leagueStats.performanceInvitationYear,
    state.leagueStats.uiMode,
    state.leagueStats.year,
    state.scheduledEvents,
  ]);

  const recommendations = useMemo(() => {
    const chosen = getRecommendedPerformanceArtists(artists, artistYear, events.length);
    return events.map((event, index) => ({ event, artist: chosen[index] })).filter(row => row.artist);
  }, [artistYear, artists, events]);

  useEffect(() => {
    if (!preselectedEvent) return;
    const event = events.find(candidate => candidate.id === preselectedEvent || candidate.name === preselectedEvent);
    if (!event || event.disabled) return;
    setSelectedEventId(event.id);
    setStep('artists');
  }, [events, preselectedEvent]);

  const handleConfirm = () => {
    const payload: Parameters<InvitePerformanceModalProps['onConfirm']>[0] = events.flatMap(event => {
      const artist = bookings[event.id];
      return artist ? [{
        type: 'performance' as const,
        event: event.name,
        artists: [artist.name],
        artistDetails: [{ name: artist.name, imageUrl: artist.imageUrl }],
        seasonYear: state.leagueStats.year,
        isHighProfile: true,
      }] : [];
    });
    if (payload.length > 0) onConfirm(payload);
  };

  const selectEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setSearchTerm('');
    setStep('artists');
  };

  const selectArtist = (artist: Artist) => {
    if (!selectedEventId) return;
    setBookings(current => ({ ...current, [selectedEventId]: artist }));
    setSelectedEventId(null);
    setSearchTerm('');
    setStep('event');
  };

  const applyRecommendations = () => {
    setBookings(current => {
      const next = { ...current };
      for (const event of events) {
        if (event.disabled || next[event.id]) continue;
        const recommended = recommendations.find(row => row.event.id === event.id)?.artist;
        if (recommended) next[event.id] = recommended;
      }
      return next;
    });
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-3 md:p-4"
      >
        <motion.div 
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-2rem)]"
        >
          <div className="p-4 sm:p-6 border-b border-slate-800 flex items-start justify-between gap-3 bg-slate-900/50">
            <div className="flex min-w-0 items-start gap-3 text-amber-400">
                <Music size={24} />
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white leading-tight">
                    {step === 'event' ? 'Invite Performers' : 'Select Artist'}
                </h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-6">
            {step === 'event' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4 text-xs leading-relaxed text-sky-100">
                  Regular-season ceremonies, anthems, and halftime entertainment are handled by the home team. This screen controls the league's marquee events.
                </div>
                {!loading && recommendations.length === events.length && (
                  <section className="rounded-2xl border border-violet-500/20 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.12),transparent_38%),rgba(15,23,42,0.55)] p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Sparkles className="shrink-0 text-violet-400" size={24} />
                        <div>
                          <h4 className="font-black uppercase tracking-wide text-white">Recommended Slate</h4>
                          <p className="mt-1 text-xs text-slate-400">Suggested artists for the league's three biggest stages.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={applyRecommendations}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-violet-500"
                      >
                        <Sparkles size={15} />
                        Use recommendations
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {recommendations.map(({ event, artist }) => (
                        <button
                          type="button"
                          key={event.id}
                          onClick={() => selectEvent(event.id)}
                          className="overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/35 text-left transition hover:border-violet-500/50"
                        >
                          <div className="relative aspect-[4/3] bg-slate-800">
                            {artist.imageUrl ? (
                              <img
                                src={artist.imageUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="absolute inset-0 h-full w-full object-cover"
                                onError={imageEvent => {
                                  imageEvent.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <Music className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-600" size={28} />
                            )}
                          </div>
                          <div className="p-3">
                            <div className="truncate text-sm font-black text-white">{artist.name}</div>
                            <div className="mt-1 line-clamp-2 text-[10px] font-bold uppercase tracking-wide text-violet-300">{event.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <div className="grid grid-cols-1 gap-3">
                  {events.map(event => (
                    <button
                      key={event.id}
                      disabled={event.disabled && !bookings[event.id]}
                      onClick={() => selectEvent(event.id)}
                      className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                        event.disabled && !bookings[event.id] ? 'opacity-40 grayscale cursor-not-allowed' :
                        bookings[event.id]
                          ? 'bg-emerald-500/10 border-emerald-500/40'
                          : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      <div className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xl flex items-center justify-center ${bookings[event.id] ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                        <event.icon size={20} />
                        {bookings[event.id]?.imageUrl && (
                          <img
                            src={bookings[event.id].imageUrl}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={event => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                          <span className="font-bold text-white">{event.name}</span>
                          {bookings[event.id] ? (
                            <span className="truncate text-xs font-bold text-emerald-300">{bookings[event.id].name}</span>
                          ) : event.disabled ? (
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Already Held This Season</span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select performer</span>
                          )}
                      </div>
                      {bookings[event.id] && <CheckCircle2 size={18} className="ml-auto shrink-0 text-emerald-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'artists' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    {artistDecade ? `${artistDecade} artists` : 'Artists'}
                  </p>
                  {!loading && !artistLoadFailed && (
                    <span className="text-xs text-slate-600">{artists.length} available</span>
                  )}
                </div>
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
                ) : artistLoadFailed ? (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-8 text-center text-sm text-red-200">
                    The artist list is unavailable right now. Close this window and try again.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredArtists.map(artist => {
                      const isSelected = selectedEventId ? bookings[selectedEventId]?.id === artist.id : false;
                      return (
                        <button
                          key={artist.id}
                          onClick={() => selectArtist(artist)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                            isSelected 
                              ? 'bg-amber-600/20 border-amber-500/50 shadow-lg shadow-amber-500/10' 
                              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className={`relative w-12 h-12 overflow-hidden rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isSelected ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            <span>{artist.name.charAt(0)}</span>
                            {artist.imageUrl && (
                              <img
                                src={artist.imageUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="absolute inset-0 h-full w-full object-cover"
                                onError={event => {
                                  event.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>{artist.name}</div>
                          </div>
                          {isSelected && <CheckCircle2 size={16} className="text-amber-400 shrink-0" />}
                        </button>
                      );
                    })}
                    {filteredArtists.length === 0 && (
                      <div className="col-span-full rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-500">
                        No artists match your search.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 sm:p-6 border-t border-slate-800 bg-slate-900/50 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider text-center sm:text-left">
              {step === 'event' ? `${Object.keys(bookings).length} event${Object.keys(bookings).length === 1 ? '' : 's'} booked` : ''}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              {step === 'artists' && (
                <button 
                  onClick={() => setStep('event')}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-white hover:bg-slate-800 transition-colors uppercase tracking-wider"
                >
                  Back
                </button>
              )}
              {step === 'event' && (
                <button 
                  onClick={handleConfirm}
                  disabled={Object.keys(bookings).length === 0}
                  className="px-6 py-2 rounded-xl text-xs font-black text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-all uppercase tracking-wider shadow-lg shadow-amber-600/20"
                >
                  Mark Done
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
