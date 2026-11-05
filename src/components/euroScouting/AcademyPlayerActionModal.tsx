import React from 'react';
import { ArrowUpRight, Dumbbell, Eye, Trash2, X } from 'lucide-react';
import type { EuroAcademyPlayer } from '../../services/euroScouting/types';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { normalizePositionLabel } from '../../utils/positionUtils';

export const AcademyPlayerActionModal: React.FC<{
  player: EuroAcademyPlayer;
  onViewRatings: () => void;
  onPromote: () => void;
  onRelease: () => void;
  onOpenDevelopmentFocus: () => void;
  onClose: () => void;
}> = ({ player, onViewRatings, onPromote, onRelease, onOpenDevelopmentFocus, onClose }) => {
  const release = () => {
    if (!window.confirm(`Release ${player.name} from the youth academy? This cannot be undone.`)) return;
    onRelease();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/90 sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-4 border-b border-slate-800 p-5"><PlayerPortrait imgUrl={player.imgURL} face={player.face} playerName={player.name} size={62} /><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Youth Academy</p><h2 className="truncate text-xl font-black text-white">{player.name}</h2><p className="text-xs text-slate-500">{normalizePositionLabel(player.pos, player.hgt)} · Age {player.age}</p></div><button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={18} /></button></div>
        <div className="space-y-2 p-4">
          <button onClick={onViewRatings} className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-left hover:border-blue-500/50"><Eye size={17} className="text-blue-400" /><span><span className="block text-sm font-bold text-white">View Ratings</span><span className="text-[10px] text-slate-500">Open the full development profile</span></span></button>
          <button onClick={onOpenDevelopmentFocus} className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-left hover:border-violet-500/50"><Dumbbell size={17} className="text-violet-400" /><span><span className="block text-sm font-bold text-white">Development Focus</span><span className="text-[10px] text-slate-500">{player.developmentArchetype ?? 'Balanced'}</span></span></button>
          <button onClick={onPromote} className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-left hover:bg-emerald-500/15"><ArrowUpRight size={17} className="text-emerald-400" /><span><span className="block text-sm font-bold text-emerald-100">Assign to Senior Team</span><span className="text-[10px] text-emerald-300/60">Uses one senior roster place</span></span></button>
          <button onClick={release} className="flex w-full items-center gap-3 rounded-xl border border-red-500/20 p-3 text-left hover:bg-red-500/10"><Trash2 size={17} className="text-red-400" /><span><span className="block text-sm font-bold text-red-200">Release Player</span><span className="text-[10px] text-red-300/50">Remove him from your academy</span></span></button>
        </div>
      </div>
    </div>
  );
};
