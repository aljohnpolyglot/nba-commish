import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../../lib/utils';

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'red' | 'amber' }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div
        className={cn(
          'text-base sm:text-lg font-black tabular-nums',
          tone === 'red' ? 'text-rose-400' : tone === 'amber' ? 'text-amber-400' : tone === 'emerald' ? 'text-emerald-400' : 'text-white',
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function MoratoriumHeadsUpModal({
  open,
  freeAgencyStartLabel,
  moratoriumEndLabel,
  onClose,
}: {
  open: boolean;
  freeAgencyStartLabel: string;
  moratoriumEndLabel: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
          <h2 className="text-lg font-black uppercase tracking-tight text-white">FA Moratorium Active</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            Free agency opens on {freeAgencyStartLabel}. Players already on the market are available for bids now.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            Players still listed as upcoming are still attached to a team. They may re-sign, pick up an option, have a team option decided, or become free agents later.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            Free agency opens on {moratoriumEndLabel}. Start it from the offseason checklist, then use <span className="font-black text-amber-300">Sim Free Agency</span> in the Play control to advance one day and review that day&apos;s decisions.
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
