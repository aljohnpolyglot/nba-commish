import React from 'react';
import { Search, Music, MapPin, Check, Star } from 'lucide-react';
import { Club, CLUB_DATA } from '../../../data/clubs';

interface ClubStepProps {
  clubSearch: string;
  setClubSearch: (search: string) => void;
  selectedClub: Club | null;
  setSelectedClub: (club: Club) => void;
  guestCount: number;
}

export const ClubStep: React.FC<ClubStepProps> = ({
  clubSearch,
  setClubSearch,
  selectedClub,
  setSelectedClub,
  guestCount
}) => {
  const filteredClubs = CLUB_DATA.filter(c => 
    c.name.toLowerCase().includes(clubSearch.toLowerCase()) ||
    c.city.toLowerCase().includes(clubSearch.toLowerCase()) ||
    c.state.toLowerCase().includes(clubSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-violet-500/10 border border-violet-500/20 p-4 rounded-2xl flex items-start gap-3">
        <Music className="text-violet-400 shrink-0 mt-0.5" size={18} />
        <p className="text-sm text-violet-200 leading-relaxed">
          Select a top-tier nightclub for your outing {guestCount > 0 ? <>with <strong>{guestCount} guests</strong></> : <strong>alone</strong>}. Experience the flashing lights and high-energy atmosphere.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
        <input
          type="text"
          value={clubSearch}
          onChange={(e) => setClubSearch(e.target.value)}
          placeholder="Search clubs by name, city, or state..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none placeholder:text-slate-700 transition-all"
        />
      </div>

      <div className="space-y-3">
        {filteredClubs.map((club) => {
          const isSelected = selectedClub?.name === club.name;
          return (
            <button
              key={club.name}
              onClick={() => setSelectedClub(club)}
              className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-200 ${
                isSelected 
                  ? 'bg-violet-600/20 border-violet-500/50 shadow-lg shadow-violet-500/10' 
                  : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  <Music size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>{club.name}</h4>
                    {club.rank <= 3 && <Star size={12} className="text-amber-400 fill-amber-400" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {club.city}, {club.state} {club.nba_city ? `• ${club.nba_team}` : ''}
                  </p>
                  <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mt-1">Rank #{club.rank} in USA</p>
                </div>
              </div>
              {isSelected && (
                <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                  <Check size={14} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
        {filteredClubs.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No clubs found matching your search.
          </div>
        )}
      </div>
    </div>
  );
};
