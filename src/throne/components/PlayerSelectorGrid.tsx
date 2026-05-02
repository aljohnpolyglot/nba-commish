import React from 'react';
import { Player } from '../types/throne';

interface PlayerSelectorGridProps {
  items: Array<{ player: Player; score: number }>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  maxSelections: number;
  defaultVisible?: number;
}

export const PlayerSelectorGrid: React.FC<PlayerSelectorGridProps> = ({
  items,
  selectedIds,
  onToggle,
  maxSelections,
  defaultVisible = 100
}) => {
  const [visibleCount, setVisibleCount] = React.useState(defaultVisible);
  const [search, setSearch] = React.useState('');

  const filtered = search.trim()
    ? items.filter(({ player }) =>
        player.name.toLowerCase().includes(search.toLowerCase()) ||
        player.lastName.toLowerCase().includes(search.toLowerCase()) ||
        player.team.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const visible = search.trim() ? filtered : filtered.slice(0, visibleCount);

  return (
    <div className="space-y-6">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search player or team..."
        className="w-full bg-zinc-900 border border-zinc-700 text-white text-sm px-4 py-2.5 rounded placeholder-zinc-600 focus:outline-none focus:border-yellow-500"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {visible.map(({ player }) => (
          <button
            key={player.id}
            onClick={() => onToggle(player.id)}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
              selectedIds.has(player.id)
                ? 'border-yellow-500 bg-yellow-500/10'
                : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
            }`}
          >
            <img
              src={player.imgURL}
              alt={player.name}
              className="w-16 h-16 rounded-lg bg-zinc-800 object-cover"
              onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
            />
            <div className="text-center min-w-0">
              <div className="font-black text-xs uppercase italic truncate">{player.name}</div>
              <div className="text-[10px] text-zinc-500 font-bold">{player.team}</div>
              <div className="text-sm font-black text-yellow-500 mt-1">{player.ovr}</div>
            </div>
            {selectedIds.has(player.id) && (
              <div className="mt-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center text-black font-black text-sm">
                ✓
              </div>
            )}
          </button>
        ))}
      </div>

      {!search && visibleCount < items.length && (
        <div className="text-center">
          <button
            onClick={() => setVisibleCount(prev => Math.min(prev + 50, items.length))}
            className="px-8 py-3 bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white uppercase font-black text-xs tracking-widest transition-all"
          >
            Load More ({visibleCount}/{items.length})
          </button>
        </div>
      )}
    </div>
  );
};
