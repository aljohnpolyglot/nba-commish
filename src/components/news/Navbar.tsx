import React from 'react';
import { Search } from 'lucide-react';
import { useGame } from '../../store/GameContext';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function Navbar({ searchQuery, onSearchChange }: NavbarProps) {
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const { state } = useGame();
  const brandLabel = state.leagueType === 'modded' ? 'NBA News' : 'League News';
  const brandSubLabel = state.leagueType === 'modded' ? 'Official Wire' : 'League Wire';

  return (
    <nav className="sticky top-0 z-50 bg-[#051c2d] text-white border-b border-white/10">
      <div className="max-w-[1400px] mx-auto px-4">
        <div className="flex items-center h-[60px] md:h-[70px]">
          <div className="flex-shrink-0 mr-8 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center">
                <span className="text-[11px] font-black tracking-[0.2em] text-white">LN</span>
              </div>
              <div className="leading-none min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.28em] text-cyan-200/70">
                  {brandSubLabel}
                </div>
                <div className="text-xl font-black uppercase tracking-tight text-white truncate">
                  {brandLabel}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-grow flex items-center justify-center max-w-xl mx-auto">
            <div className={`relative w-full transition-all duration-300 ${isSearchOpen ? 'opacity-100' : 'opacity-0 md:opacity-100'}`}>
              <input
                type="text"
                placeholder="Search news, players, teams..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-full py-2 px-10 text-sm focus:outline-none focus:bg-white/20 focus:border-white/40 transition-all placeholder-white/40"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            </div>
          </div>

          <div className="flex items-center space-x-4 ml-4">
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors md:hidden"
            >
              <Search size={20} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
