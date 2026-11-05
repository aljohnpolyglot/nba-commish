import React from 'react';
import { FastForward, Sparkles } from 'lucide-react';
import {
  getVisibleOffseasonRows,
  isChecklistComplete,
} from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow } from '../../types';
import { OffseasonTaskRailFrame } from './OffseasonTaskRailFrame';

type Props = {
  checklist: any;
  visibleRows: ReturnType<typeof getVisibleOffseasonRows>;
  isEuroMode: boolean;
  expansionPin: React.ReactNode;
  orderedRows: OffseasonChecklistRow[];
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
  orderedRows,
  renderChecklistRow,
  onAutoResolveAll,
  onExit,
  uiMode,
  pbaConference,
  children,
}) => (
  <OffseasonTaskRailFrame>
    {expansionPin}

    <ol className="space-y-1.5">
      {orderedRows.map(renderChecklistRow)}
    </ol>

    {!isEuroMode && !isChecklistComplete(checklist, visibleRows) && (
      <button
        onClick={onAutoResolveAll}
        title="Advance through the remaining offseason phases and land in preseason."
        className="w-full mt-4 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest transition-colors"
      >
        <FastForward size={12} />
        {uiMode === 'pba_isolated' ? 'Skip Remaining Tasks' : 'Sim to Preseason'}
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
  </OffseasonTaskRailFrame>
);
