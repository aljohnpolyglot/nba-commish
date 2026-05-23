import React from 'react';
import { Search, ShoppingCart, Wallet } from 'lucide-react';

export function CommishStoreNav({
  searchQuery,
  setSearchQuery,
  onSubmit,
  view,
  onInventoryOpen,
  assetCount,
  personalWealthLabel,
  onHome,
}: {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  onSubmit: () => void;
  view: 'home' | 'search' | 'inventory';
  onInventoryOpen: () => void;
  assetCount: number;
  personalWealthLabel: string;
  onHome: () => void;
}) {
  return (
    <nav className="bg-nba-dark px-3 md:px-6 py-2 md:py-3 sticky top-0 z-50 border-b-4 border-nba-blue shadow-xl">
      <div className="flex justify-between items-center mb-1 md:mb-0">
        <h1 className="text-white font-black text-lg md:text-xl tracking-tighter cursor-pointer flex items-center gap-2 shrink-0" onClick={onHome}>
          <span className="text-xl">🏀</span>
          <span className="hidden sm:inline">COMMISH STORE</span>
          <span className="sm:hidden">STORE</span>
        </h1>

        <div className="hidden md:flex gap-2 items-center flex-1 justify-center px-6">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Search"
              className="bg-white px-4 py-2 rounded-l-md outline-none w-64 text-sm focus:ring-2 focus:ring-nba-blue transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSubmit()}
            />
            <button className="bg-nba-blue text-white px-4 py-2 rounded-r-md font-bold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center h-[36px]" onClick={onSubmit}>
              <Search size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-6 shrink-0">
          <button onClick={onInventoryOpen} className={`relative flex items-center gap-1.5 font-mono font-bold text-sm transition-all ${view === 'inventory' ? 'text-white' : 'text-white/70 hover:text-white'}`}>
            <ShoppingCart size={18} />
            <span className="hidden md:inline">ASSETS </span>
            {assetCount > 0 && <span className="absolute -top-2 -right-2 md:static md:ml-0 bg-nba-red text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center md:w-auto md:h-auto md:bg-transparent md:text-white md:rounded-none md:text-sm">{assetCount}</span>}
          </button>
          <div className="flex items-center gap-1.5 text-nba-green font-mono font-bold text-sm md:text-lg">
            <Wallet size={16} className="md:w-5 md:h-5" />
            {personalWealthLabel}
          </div>
        </div>
      </div>

      <div className="md:hidden flex gap-2 items-center">
        <input
          type="text"
          placeholder="Search gear..."
          className="bg-white px-3 py-2 rounded-l-md outline-none flex-1 text-sm focus:ring-2 focus:ring-nba-blue transition-all"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSubmit()}
        />
        <button className="bg-nba-blue text-white px-3 py-2 rounded-r-md font-bold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center" onClick={onSubmit}>
          <Search size={16} />
        </button>
      </div>
    </nav>
  );
}
