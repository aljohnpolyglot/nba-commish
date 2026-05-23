import React from 'react';
import { AlertTriangle, ChevronRight, FastForward, Sparkles } from 'lucide-react';
import {
  getVisibleOffseasonRows,
  isChecklistComplete,
} from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow } from '../../types';

type EuroSection = {
  id: string;
  title: string;
  blurb: string;
  rows: OffseasonChecklistRow[];
};

type Props = {
  checklist: any;
  visibleRows: ReturnType<typeof getVisibleOffseasonRows>;
  isEuroMode: boolean;
  expansionPin: React.ReactNode;
  euroRecap: React.ReactNode;
  euroSections: EuroSection[];
  orderedRows: OffseasonChecklistRow[];
  expiringUnsignedCount: number;
  showExpiringBanner: boolean;
  onExpiringBanner: () => void;
  renderChecklistRow: (row: OffseasonChecklistRow) => React.ReactNode;
  onAutoResolveAll: () => void;
  onExit: () => void;
  uiMode?: string;
  pbaConference?: string;
  children: React.ReactNode;
};

export const OffseasonSidebarShell: React.FC<Props> = ({
  checklist,
  visibleRows,
  isEuroMode,
  expansionPin,
  euroRecap,
  euroSections,
  orderedRows,
  expiringUnsignedCount,
  showExpiringBanner,
  onExpiringBanner,
  renderChecklistRow,
  onAutoResolveAll,
  onExit,
  uiMode,
  pbaConference,
  children,
}) => (
  <aside className="w-full lg:w-[320px] shrink-0 bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
    <header className="mb-2">
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/80 block">
        Offseason
      </span>
      <h2 className="text-base font-black text-white uppercase tracking-tight">
        Tasks
      </h2>
    </header>

    {showExpiringBanner && (
      <button
        onClick={onExpiringBanner}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 hover:bg-rose-500/20 transition-colors text-left"
        title="These players' contracts expire this offseason. Re-sign them before FA opens or they walk as UFA."
      >
        <AlertTriangle size={14} className="text-rose-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-black uppercase tracking-tight text-rose-200">
            {expiringUnsignedCount} expiring contract{expiringUnsignedCount === 1 ? '' : 's'}
          </div>
          <div className="text-[9px] text-rose-300/70">
            May walk as UFA — review before FA opens
          </div>
        </div>
        <ChevronRight size={12} className="text-rose-400/60 shrink-0" />
      </button>
    )}

    {expansionPin}

    {euroRecap}

    {isEuroMode ? (
      <div className="space-y-3">
        {euroSections.map(section => (
          <section key={section.id} className="space-y-1.5">
            <div className="px-1">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                {section.title}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {section.blurb}
              </div>
            </div>
            <ol className="space-y-1.5">
              {section.rows.map(renderChecklistRow)}
            </ol>
          </section>
        ))}
      </div>
    ) : (
      <ol className="space-y-1.5">
        {orderedRows.map(renderChecklistRow)}
      </ol>
    )}

    {!isEuroMode && !isChecklistComplete(checklist, visibleRows) && (
      <button
        onClick={onAutoResolveAll}
        title="Advance through the remaining offseason phases and land on opening night."
        className="w-full mt-4 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest transition-colors"
      >
        <FastForward size={12} />
        {uiMode === 'pba_isolated' ? 'Skip Remaining Tasks' : 'Sim to Opening Night'}
      </button>
    )}

    {isChecklistComplete(checklist, visibleRows) && (
      <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
        <p className="text-[11px] font-black uppercase tracking-widest text-emerald-300">
          {uiMode === 'pba_isolated' ? 'Tasks Complete' : 'Offseason Complete'}
        </p>
        <p className="text-[10px] text-emerald-200/80 leading-snug">
          {uiMode === 'pba_isolated'
            ? (pbaConference === 'governors'
              ? 'All tasks resolved. Start the new PBA season.'
              : 'All tasks resolved. Enter the next conference.')
            : 'All tasks resolved. Drop into preseason and start the new season.'}
        </p>
        <button
          onClick={onExit}
          className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest transition-colors"
        >
          <Sparkles size={12} />
          {uiMode === 'pba_isolated'
            ? (pbaConference === 'governors' ? 'Enter New Season' : 'Enter Next Conference')
            : uiMode === 'euro_isolated' ? 'Jump to Preseason' : 'Enter Preseason'}
        </button>
      </div>
    )}

    {children}
  </aside>
);
