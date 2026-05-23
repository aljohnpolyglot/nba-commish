import React from 'react';
import { Search, User, X, Check, Utensils, MapPin, CheckCircle2, ChevronDown, SortAsc, SortDesc, Activity, Film, Music, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LocationStep } from './PersonSelector/LocationStep';
import { MovieStep } from './PersonSelector/MovieStep';
import { ClubStep } from './PersonSelector/ClubStep';
import { ContactList } from './PersonSelector/ContactList';
import { usePersonSelectorModalModel } from './usePersonSelectorModalModel';
import type { PersonSelectorModalProps } from './personSelectorModalShared';

export const PersonSelectorModal: React.FC<PersonSelectorModalProps> = ({ onSelect, onClose, title, actionType, preSelectedContact, skipPersonSelection }) => {
  const {
    step,
    setStep,
    searchTerm,
    setSearchTerm,
    activeFilter,
    setActiveFilter,
    reason,
    setReason,
    duration,
    setDuration,
    amount,
    setAmount,
    selectedContacts,
    setSelectedContacts,
    injurySort,
    setInjurySort,
    selectedInjuryName,
    restaurants,
    restaurantSearch,
    setRestaurantSearch,
    selectedRestaurant,
    setSelectedRestaurant,
    loadingRestaurants,
    movies,
    movieSearch,
    setMovieSearch,
    selectedMovie,
    setSelectedMovie,
    loadingMovies,
    useMovieDatabase,
    setUseMovieDatabase,
    clubSearch,
    setClubSearch,
    selectedClub,
    setSelectedClub,
    refsLoaded,
    requiresLocation,
    requiresClub,
    isMovieAction,
    availableFilters,
    filteredContacts,
    sortedInjuries,
    handleInjurySelect,
    handleContactToggle,
    handleNext,
    goBack,
    isFormValid,
  } = usePersonSelectorModalModel({
    actionType,
    onClose,
    onSelect,
    preSelectedContact,
    skipPersonSelection,
  });

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
                        
                        {(actionType === 'dinner' || actionType === 'movie' || actionType === 'club' || actionType === 'general') && (
                             <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                  {actionType === 'general' ? 'Reason for Invite (Optional)' : 'Occasion / Note (Optional)'}
                                </label>
                                <input
                                    type="text"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder={actionType === 'dinner' ? "Discussing contract extension..." : actionType === 'movie' ? "Team bonding..." : actionType === 'club' ? "Night out..." : "Business meeting, partnership discussion..."}
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
                        onClick={goBack}
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
