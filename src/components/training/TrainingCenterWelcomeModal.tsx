import React from 'react';
import { X, Users, Compass, Star } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onDontShowAgain: () => void;
}

export const TrainingCenterWelcomeModal: React.FC<Props> = ({ open, onClose, onDontShowAgain }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[#FDB927]/35 bg-slate-900 p-5 shadow-[0_0_60px_rgba(253,185,39,0.16)] sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#FDB927]">Training Center</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Quick Start</h2>
            <p className="mt-2 text-sm text-slate-300">
              This page helps shape player growth through your daily choices.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="mb-2 inline-flex rounded-lg border border-sky-400/30 bg-sky-400/10 p-2 text-sky-300">
              <Users size={16} />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-300">Roster</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Set each player&apos;s growth focus and choose a mentor where it fits.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="mb-2 inline-flex rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2 text-emerald-300">
              <Compass size={16} />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-300">Systems</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Check which styles your current roster fits best before locking plans.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="mb-2 inline-flex rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-amber-300">
              <Star size={16} />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-300">Result</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Better role clarity, better growth path, and cleaner long-term progress.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-xs font-black uppercase tracking-widest text-slate-200 hover:bg-slate-700"
          >
            Close
          </button>
          <button
            onClick={onDontShowAgain}
            className="rounded-xl bg-[#FDB927] px-5 py-2 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-[#f3c54d]"
          >
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
};
