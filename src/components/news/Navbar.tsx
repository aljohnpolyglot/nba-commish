import React from 'react';
import { Search } from 'lucide-react';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function Navbar({ searchQuery, onSearchChange }: NavbarProps) {
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-[#051c2d] text-white border-b border-white/10">
      <div className="max-w-[1400px] mx-auto px-4">
        <div className="flex items-center h-[60px] md:h-[70px]">
          {/* Logo */}
          <div className="flex-shrink-0 mr-8">
            <img
              src="https://cdn.nba.com/logos/leagues/logo-nba.svg"
              alt="NBA Logo"
              className="h-10 w-auto"
            />
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
