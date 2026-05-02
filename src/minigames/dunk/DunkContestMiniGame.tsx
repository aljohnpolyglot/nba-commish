import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, ChevronRight } from 'lucide-react';
import { NBAPlayer } from '../../types';
import { DunkContest } from '../../components/allstar/allstarevents/dunk/DunkContest';
import { useDunkPicker, DUNK_MAX_PICKS, DUNK_MIN_PICKS } from './useDunkPicker';
import { getPlayerRealK2 } from '../../data/NBA2kRatings';

const FALLBACK_HEADSHOT = 'https://www.nba.com/assets/img/default-headshot.png';

function PickerGrid({
  players, selectedIds, onToggle,
}: {
  players: NBAPlayer[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [visible, setVisible] = useState(80);
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : players;
  return (
    <div className="space-y-4">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search player..."
        className="w-full bg-zinc-900 border border-zinc-700 text-white text-sm px-4 py-2 rounded placeholder-zinc-600 focus:outline-none focus:border-yellow-500"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {(search ? filtered : filtered.slice(0, visible)).map(p => {
          const r: any = Array.isArray(p.ratings) ? p.ratings[p.ratings.length - 1] : {};
          const sel = selectedIds.has(p.internalId);
          const lastName = p.name;
          return (
            <button
              key={p.internalId}
              onClick={() => onToggle(p.internalId)}
              disabled={!sel && selectedIds.size >= DUNK_MAX_PICKS}
              className={`flex flex-col items-center gap-2 p-3 border-2 rounded transition-all disabled:opacity-30 ${
                sel ? 'border-yellow-500 bg-yellow-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <img
                src={(p as any).imgURL ?? ''}
                alt={p.name}
                className="w-14 h-14 rounded-lg bg-zinc-800 object-cover"
                onError={e => (e.currentTarget.src = FALLBACK_HEADSHOT)}
              />
              <div className="text-center min-w-0 w-full">
                <div className="font-black text-[10px] uppercase italic truncate">{lastName}</div>
                <div className="text-[9px] text-zinc-500">{(p as any).pos ?? ''}</div>
                <div className="flex justify-center gap-2 mt-1">
                  <span className="text-[9px] text-yellow-500 font-bold">
                    DNK {getPlayerRealK2(p.name)?.IS?.[2] ?? r?.dnk ?? '--'}
                  </span>
                </div>
              </div>
              {sel && (
                <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-black font-black text-xs">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>
      {!search && visible < players.length && (
        <button
          onClick={() => setVisible(v => v + 80)}
          className="w-full py-2 bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs font-bold uppercase tracking-widest hover:text-white"
        >
          Load More ({visible}/{players.length})
        </button>
      )}
    </div>
  );
}

export default function DunkContestMiniGame() {
  const { view, players, selectedIds, selectedPlayers, toggle, start, reset } = useDunkPicker();

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <AnimatePresence mode="wait">
        {view === 'LOADING' && (
          <motion.div
            key="load"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-screen gap-4"
          >
            <div className="w-12 h-12 border-2 border-yellow-500/40 border-t-yellow-500 rounded-full animate-spin" />
            <p className="text-zinc-500 text-xs uppercase tracking-widest font-mono">Loading contestants...</p>
          </motion.div>
        )}

        {view === 'PICK' && (
          <motion.div
            key="pick"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 max-w-7xl mx-auto min-h-screen"
          >
            <div className="flex justify-between items-end mb-8 border-b border-zinc-800 pb-6">
              <div>
                <span className="text-yellow-500 font-mono text-xs tracking-widest uppercase mb-2 block">
                  Slam Dunk Contest
                </span>
                <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase">
                  Pick {DUNK_MAX_PICKS} Contestants
                </h1>
                <p className="text-zinc-500 text-sm mt-1">{selectedIds.size}/{DUNK_MAX_PICKS} selected</p>
              </div>
              <button
                onClick={start}
                disabled={selectedIds.size < DUNK_MIN_PICKS}
                className="px-8 py-4 bg-yellow-500 text-black font-black uppercase text-sm tracking-widest hover:bg-yellow-400 disabled:opacity-20 flex items-center gap-2 whitespace-nowrap"
              >
                Run Contest <ChevronRight size={16} />
              </button>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
                {selectedPlayers.map(p => {
                  const lastName = p.name;
                  return (
                    <div
                      key={p.internalId}
                      className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/40 rounded-full px-3 py-1.5 shrink-0"
                    >
                      <img
                        src={(p as any).imgURL ?? ''}
                        className="w-6 h-6 rounded-full object-cover bg-zinc-800"
                        alt=""
                        onError={e => (e.currentTarget.src = FALLBACK_HEADSHOT)}
                      />
                      <span className="text-[10px] font-black uppercase">{lastName}</span>
                      <button
                        onClick={() => toggle(p.internalId)}
                        className="text-zinc-500 hover:text-white text-xs ml-1"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <PickerGrid players={players} selectedIds={selectedIds} onToggle={toggle} />

            <div className="mt-8 text-center text-[10px] text-zinc-700 uppercase tracking-widest font-mono">
              <Zap className="w-3 h-3 inline mr-1" /> Sandbox mode — no save required
            </div>
          </motion.div>
        )}

        {view === 'RUN' && (
          <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen">
            <DunkContest contestants={selectedPlayers as any} onClose={reset} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
