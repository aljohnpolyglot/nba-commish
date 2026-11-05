import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Target, RotateCcw, Search, X } from 'lucide-react';
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
      className={`flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-[2rem] border border-slate-800 bg-slate-900 shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
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
  const contestantCount = Math.min(20, Math.max(2, Math.round(state.leagueStats.allStarThreePointContestPlayers ?? 8)));

  const existingContestants: NBAPlayer[] = state.allStar?.threePointContestants ?? [];
  const isEditMode = existingContestants.length > 0;
  const [step, setStep] = useState<1 | 2>(isEditMode ? 1 : 2);

  useEffect(() => {
    const existingIds = new Set((state.allStar?.threePointContestants ?? []).map((p: NBAPlayer) => p.internalId));
    setSelected(existingIds);
  }, []);

  const allPlayers = useMemo(() => {
    return state.players
      .filter(p => p.status === 'Active' && p.tid >= 0 && p.tid < 100)
      .map(p => {
        const stat = p.stats?.find(s => s.season === season && !s.playoffs);
        const rating = p.ratings?.find(row => Number(row.season) === Number(season))
          ?? p.ratings?.[p.ratings.length - 1];
        const gp = stat?.gp ?? 0;
        const tpa = gp > 0 ? (stat!.tpa ?? 0) / gp : 0;
        const tpp = stat?.tpp ?? 0;
        const score = tpa * 40 + tpp * 60;
        return { player: p, tp: Number(rating?.tp ?? 0), tpa, tpp, score, hasStats: gp >= 5 };
      })
      .sort((a, b) => b.tp - a.tp || b.score - a.score || a.player.name.localeCompare(b.player.name));
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
      else if (n.size < contestantCount) n.add(id);
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
        <div className="p-4 pb-4 sm:p-8">
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
            <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-6 sm:px-8">
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-8">
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
      </ModalShell3P>
    );
  }

  // ── Step 2: Player picker (grid) ──────────────────────────────────────────
  return (
    <ModalShell3P wide>
      <div className="p-4 pb-4 sm:p-8">
        {isEditMode && (
          <button onClick={() => setStep(1)} className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5">
            ← Back to lineup
          </button>
        )}
        <div className="mb-3 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
            <Target size={22} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black text-white uppercase tracking-widest">3-Point Contest</h3>
            <p className="text-slate-400 text-xs">
              {!search ? 'Top 30 recommended · ' : ''}{selected.size}/{contestantCount} selected
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setSelected(new Set(allPlayers.slice(0, contestantCount).map(entry => entry.player.internalId)))}
            disabled={allPlayers.length < contestantCount}
            className="flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
          >
            <Sparkles size={13} /> Auto-select participants
          </button>
          <div className="relative flex-1">
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
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-6 sm:px-8">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {visiblePlayers.map(x => {
            const isSelected = selected.has(x.player.internalId);
            const canSelect = isSelected || selected.size < contestantCount;
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

      <div className="flex flex-col gap-3 border-t border-slate-800 p-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <p className="text-xs text-slate-500">{selected.size}/{contestantCount} selected</p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            disabled={selected.size !== contestantCount}
            onClick={() => onConfirm(selectedPlayers)}
            className="w-full rounded-xl bg-sky-600 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {isEditMode ? 'Update Contestants' : 'Set Contestants'}
          </button>
        </div>
      </div>
    </ModalShell3P>
  );
};
