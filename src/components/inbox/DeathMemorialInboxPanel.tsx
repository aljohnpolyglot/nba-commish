import React from 'react';
import { Heart, MinusCircle } from 'lucide-react';
import type { DeathMemorialInboxAction } from '../../types';

type Props = {
  action: DeathMemorialInboxAction;
  onDecision: (decision: 'ignore' | 'honor') => void;
};

export const DeathMemorialInboxPanel: React.FC<Props> = ({ action, onDecision }) => {
  const resolved = action.status === 'resolved' && action.resolution;
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10">
          <Heart size={20} className="text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">
            Memorial Request
          </p>
          <h4 className="mt-1 text-xl font-black text-white">Remembering {action.playerName}</h4>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Age</p>
              <p className="mt-1 font-black text-white">{action.age}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">League Career</p>
              <p className="mt-1 font-black text-white">{action.yearsInLeague} season{action.yearsInLeague === 1 ? '' : 's'}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Remembered By</p>
              <p className="mt-1 font-black text-white">{action.primaryTeamName ?? 'The league'}</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            {action.cause.startsWith(action.playerName) ? action.cause : `Recorded cause: ${action.cause}.`}
          </p>
        </div>
      </div>

      {resolved ? (
        <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
            Decision: {resolved.decision}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{resolved.outcome}</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={() => onDecision('ignore')}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-6 text-sm font-black text-slate-200 hover:bg-slate-700"
          >
            <MinusCircle size={16} /> IGNORE
          </button>
          <button
            onClick={() => onDecision('honor')}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-7 text-sm font-black text-slate-950 hover:bg-amber-400"
          >
            <Heart size={16} /> HONOR
          </button>
        </div>
      )}
    </div>
  );
};
