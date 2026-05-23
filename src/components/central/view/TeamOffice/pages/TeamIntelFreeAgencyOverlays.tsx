import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../../lib/utils';
import { PlayerSelectorGrid, type PlayerSelectorItem } from '../../../../shared/PlayerSelectorGrid';
import type { ResolvedTeam, AutoBidSummary } from './TeamIntelFreeAgencyShared';

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

export function AutoBidSummaryModal({
  summary,
  onClose,
}: {
  summary: AutoBidSummary | null;
  onClose: () => void;
}) {
  if (!summary) return null;

  return createPortal(
    <div className="fixed inset-0 z-[121] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 bg-blue-500/[0.06]">
          <h2 className="text-lg font-black uppercase tracking-tight text-white">Auto-Bids Submitted</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Submitted</div>
              <div className="mt-1 text-2xl font-black text-white tabular-nums">{summary.submitted}</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">Skipped</div>
              <div className="mt-1 text-2xl font-black text-white tabular-nums">{summary.skipped}</div>
            </div>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Skipped players did not fit within your current cap room plus remaining MLE space.
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-blue-500 hover:bg-blue-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MoratoriumHeadsUpModal({
  open,
  moratoriumEndLabel,
  onClose,
}: {
  open: boolean;
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
            July 1 is when teams can start talking money with players who are already free agents. Those are the players you can bid on now.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            Players still listed as upcoming are still attached to a team. They may re-sign, pick up an option, have a team option decided, or become free agents later.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            During the first few days, deals are mostly being negotiated. Use the top PlayButton dropdown and click <span className="font-black text-amber-300">Through moratorium</span> to jump to {moratoriumEndLabel}, when signings and market decisions start landing.
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

export function ShortlistEditorModal({
  editing,
  onClose,
  shortlistSize,
  shortlistCap,
  items,
  teams,
  selectedIds,
  onToggle,
}: {
  editing: boolean;
  onClose: () => void;
  shortlistSize: number;
  shortlistCap: number;
  items: PlayerSelectorItem[];
  teams: ResolvedTeam[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (!editing) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh]"
        onClick={event => event.stopPropagation()}
      >
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-sm sm:text-lg font-black text-white uppercase tracking-widest">FA Shortlist</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{shortlistSize}/{shortlistCap}</span>
            <button onClick={onClose} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase text-xs rounded-xl">
              Done
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <PlayerSelectorGrid
            items={items}
            teams={teams as any}
            selectedIds={selectedIds}
            onToggle={onToggle}
            maxSelections={shortlistCap}
            accentColor="amber"
            searchPlaceholder="Search free agents..."
          />
        </div>
      </div>
    </div>
  );
}
