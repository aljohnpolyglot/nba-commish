import React from 'react';
import { Search, Trophy, Users } from 'lucide-react';
import { useGame } from '../../../store/GameContext';

interface NBACentralHeaderProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export const NBACentralHeader: React.FC<NBACentralHeaderProps> = ({
  searchTerm,
  setSearchTerm
}) => {
  const { setCurrentView } = useGame();

  return (
    <div className="p-4 md:p-10 border-b border-slate-800 bg-slate-900/50 flex flex-col gap-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-lg md:text-3xl font-black text-white flex items-center gap-2 md:gap-4 tracking-tighter uppercase">
            <Trophy className="text-amber-500" size={20} />
            NBA Central
          </h2>
          <p className="text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mt-0.5 md:mt-2">League Intelligence Hub</p>
        </div>
        
        <button
          onClick={() => setCurrentView('Player Search')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs transition-colors shadow-lg shadow-indigo-500/20"
        >
          <Users size={16} />
          <span className="hidden sm:inline">Search Players</span>
        </button>
      </div>

      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
        <input
          type="text"
          placeholder="Search teams..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 text-slate-200 pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-[11px] font-medium placeholder:text-slate-700"
        />
      </div>
    </div>
  );
};
