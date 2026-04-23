import React, { useState, useEffect, useMemo } from 'react';
import { Target, RotateCcw, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { NBAPlayer } from '../../../types';

interface ThreePointContestModalProps {
  onClose: () => void;
  onConfirm: (contestants: NBAPlayer[]) => void;
}

const ModalShell3P = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <motion.div
      initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
      className={`bg-slate-900 border border-slate-800 rounded-[2rem] w-full shadow-2xl flex flex-col max-h-[90vh] ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
    >
      {children}
    </motion.div>
  </div>
);

export const ThreePointContestModal: React.FC<ThreePointContestModalProps> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const season = state.leagueStats.year || 2026;

  const existingContestants: NBAPlayer[] = state.allStar?.threePointContestants ?? [];
  const isEditMode = existingContestants.length > 0;
  const [step, setStep] = useState<1 | 2>(isEditMode ? 1 : 2);

  useEffect(() => {
    const existingIds = new Set((state.allStar?.threePointContestants ?? []).map((p: NBAPlayer) => p.internalId));
    setSelected(existingIds);
  }, []);

  const allPlayers = useMemo(() => {
    return state.players
      .filter(p => p.status === 'Active' && p.tid >= 0)
      .map(p => {
        const stat = p.stats?.find(s => s.season === season && !s.playoffs);
        const gp = stat?.gp ?? 0;
        const tpa = gp > 0 ? (stat!.tpa ?? 0) / gp : 0;
        const tpp = stat?.tpp ?? 0;
        const score = tpa * 40 + tpp * 60;
        return { player: p, tpa, tpp, score, hasStats: gp >= 5 };
      })
      .sort((a, b) => b.score - a.score);
  }, [state.players, season]);

  const visiblePlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allPlayers.slice(0, 30);
    return allPlayers.filter(x =>
      x.player.name.toLowerCase().includes(q) ||
      x.player.pos.toLowerCase().includes(q) ||
      (state.teams.find(t => t.id === x.player.tid)?.abbrev ?? '').toLowerCase().includes(q)
    );
  }, [allPlayers, search, state.teams]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else if (n.size < 8) n.add(id);
      return n;
    });
  };

  const selectedPlayers = allPlayers
    .filter(x => selected.has(x.player.internalId))
    .map(x => x.player);

  // ── Step 1: Current lineup view ───────────────────────────────────────────
  if (step === 1) {
    return (
      <ModalShell3P wide>
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
              <Target size={22} />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-white uppercase tracking-widest">3-Point Contest</h3>
              <p className="text-slate-400 text-xs">{existingContestants.length} contestants set</p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600/20 border border-sky-500/30 text-sky-400 hover:bg-sky-600/40 transition-all text-xs font-black uppercase tracking-widest"
            >
              <RotateCcw size={13} /> Edit Lineup
            </button>
          </div>
        </div>
        <div className="overflow-y-auto custom-scrollbar px-8 pb-6 flex-1">
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 gap-4">
            {existingContestants.map((p) => {
              const team = state.teams.find(t => t.id === p.tid);
              return (
                <div key={p.internalId} className="flex flex-col items-center gap-2 relative group">
                  <div className="relative">
                    <PlayerPortrait imgUrl={p.imgURL} face={(p as any).face} playerName={p.name} teamLogoUrl={team?.logoUrl} overallRating={p.overallRating} size={80} />
                    <button
                      onClick={() => { toggle(p.internalId); setStep(2); }}
                      className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      title="Swap"
                    >
                      <RotateCcw size={20} className="text-white" />
                    </button>
                  </div>
                  <p className="font-bold text-white text-[11px] text-center leading-tight">{p.name}</p>
                  <p className="text-[9px] text-slate-500 text-center">{p.pos} · {team?.abbrev ?? '—'}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="p-8 pt-4 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-6 py-3 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold uppercase tracking-wider text-xs">Close</button>
        </div>
      </ModalShell3P>
    );
  }

  // ── Step 2: Player picker (grid) ──────────────────────────────────────────
  return (
    <ModalShell3P wide>
      <div className="p-8 pb-4">
        {isEditMode && (
          <button onClick={() => setStep(1)} className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5">
            ← Back to lineup
          </button>
        )}
        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
            <Target size={22} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black text-white uppercase tracking-widest">3-Point Contest</h3>
            <p className="text-slate-400 text-xs">
              {!search ? 'Top 30 recommended — ' : ''}{selected.size}/8 selected
            </p>
          </div>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search all players…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      <div className="overflow-y-auto custom-scrollbar px-8 pb-6 flex-1">
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
          {visiblePlayers.map(x => {
            const isSelected = selected.has(x.player.internalId);
            const canSelect = isSelected || selected.size < 8;
            const team = state.teams.find(t => t.id === x.player.tid);
            return (
              <button
                key={x.player.internalId}
                onClick={() => toggle(x.player.internalId)}
                disabled={!canSelect}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all text-center ${
                  isSelected
                    ? 'border-sky-500 bg-sky-500/15 shadow-lg shadow-sky-500/10'
                    : canSelect
                    ? 'border-slate-800 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-800/60'
                    : 'border-slate-800/50 bg-slate-900/20 opacity-30 cursor-not-allowed'
                }`}
              >
                <div className="relative">
                  <PlayerPortrait imgUrl={x.player.imgURL} face={(x.player as any).face} playerName={x.player.name} teamLogoUrl={team?.logoUrl} overallRating={x.player.overallRating} size={72} />
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-[10px] font-black">✓</span>
                    </div>
                  )}
                </div>
                <p className="font-bold text-white text-[11px] leading-tight line-clamp-2">{x.player.name}</p>
                <p className="text-[9px] text-slate-500">{x.player.pos} · {team?.abbrev ?? '—'}</p>
              </button>
            );
          })}
        </div>
        {!search && (
          <p className="text-center text-[10px] text-slate-600 mt-4">Recommended top 30 shown — search to find anyone</p>
        )}
      </div>

      <div className="p-8 pt-4 border-t border-slate-800 flex items-center justify-between">
        <p className="text-xs text-slate-500">{selected.size}/8 selected</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-bold uppercase tracking-wider text-xs">Cancel</button>
          <button
            disabled={selected.size < 2}
            onClick={() => onConfirm(selectedPlayers)}
            className="px-6 py-3 rounded-xl bg-sky-600 text-white hover:bg-sky-500 font-bold uppercase tracking-wider text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEditMode ? 'Update Contestants' : 'Set Contestants'}
          </button>
        </div>
      </div>
    </ModalShell3P>
  );
};
