import React from 'react';
import { Film, MinusCircle, Users } from 'lucide-react';
import type { MediaProjectInboxAction } from '../../types';

type Props = {
  action: MediaProjectInboxAction;
  onDecision: (decision: 'ignore' | 'respond') => void;
};

export const MediaProjectInboxPanel: React.FC<Props> = ({ action, onDecision }) => {
  const resolution = action.status === 'resolved' ? action.resolution : undefined;
  return (
    <div className="rounded-2xl border border-red-500/25 bg-slate-900/70 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-red-500/30 bg-black p-2">
          <img src={action.brandLogoUrl} alt={action.studioName} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-400">Original Documentary</p>
          <h4 className="mt-1 text-xl font-black text-white">{action.projectTitle}</h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Choose the five NBA players whose stories should anchor this season's series.
          </p>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Format</p>
              <p className="mt-1 font-black text-white">{action.formatLabel}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Featured Players</p>
              <p className="mt-1 flex items-center gap-2 font-black text-white"><Users size={15} /> {action.castSize}</p>
            </div>
          </div>
        </div>
      </div>

      {resolution ? (
        <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
            Decision: {resolution.decision}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{resolution.outcome}</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onDecision('ignore')}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-6 text-sm font-black text-slate-200 hover:bg-slate-700"
          >
            <MinusCircle size={16} /> IGNORE
          </button>
          <button
            type="button"
            onClick={() => onDecision('respond')}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-7 text-sm font-black text-white hover:bg-red-500"
          >
            <Film size={16} /> RESPOND
          </button>
        </div>
      )}
    </div>
  );
};
