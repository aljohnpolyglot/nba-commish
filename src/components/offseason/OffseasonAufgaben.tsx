/**
 * Offseason 2K-style sandboxed task UI — Phase A.
 *
 * Single file colocates the three pieces (sidebar + header badge + header CTA)
 * for the new AUFGABEN flow. Phase B/C add their modal stacks here too so the
 * whole feature lives in one place.
 *
 * Renders ONLY when state.offseasonChecklist is set (i.e. offseason mode).
 * Driven by getOffseasonState (Sessions 1-5 orchestrator) — no calendar math.
 */

import React from 'react';
import { CheckCircle2, Circle, ChevronRight, FastForward, Sparkles } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  OFFSEASON_ROW_ORDER,
  OFFSEASON_ROW_LABELS,
  OFFSEASON_ROW_DESCRIPTIONS,
  firstUnfinishedRow,
  isChecklistComplete,
} from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, OffseasonRowStatus, Tab } from '../../types';

// ─── Header Phase Badge — replaces date during offseason ────────────────────
//
// Used in App.tsx header. When offseasonChecklist exists, swap the date pill
// for this badge so the GM sees "OFFSEASON · DRAFT LOTTERY" instead of
// "Jul 5, 2026". Falls back to nothing (caller renders date) when not in
// offseason.

export const OffseasonPhaseBadge: React.FC = () => {
  const { state } = useGame();
  if (!state.offseasonChecklist) return null;
  const currentRow = firstUnfinishedRow(state.offseasonChecklist);
  const phaseLabel = currentRow ? OFFSEASON_ROW_LABELS[currentRow] : 'Ready for next season';
  const isFA = currentRow === 'freeAgency';
  const tagSuffix = isFA && state.faTagCounter
    ? ` · TAG ${state.faTagCounter}/${state.faTagsTotal ?? 13}`
    : '';
  return (
    <div className="flex flex-col leading-none min-w-0">
      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300/80">
        Offseason
      </span>
      <span className="text-[11px] font-black text-white truncate uppercase tracking-tight">
        {phaseLabel}{tagSuffix}
      </span>
    </div>
  );
};

// ─── Header Next-Action CTA — replaces PlayButton during offseason ──────────

interface NextActionButtonProps {
  setCurrentView: (v: Tab) => void;
}

export const OffseasonNextActionButton: React.FC<NextActionButtonProps> = ({ setCurrentView }) => {
  const { state, dispatchAction } = useGame();
  if (!state.offseasonChecklist) return null;
  const currentRow = firstUnfinishedRow(state.offseasonChecklist);
  const allDone = isChecklistComplete(state.offseasonChecklist);

  const handleAdvanceSeason = () => {
    dispatchAction({ type: 'OFFSEASON_EXIT' } as any);
    setCurrentView('NBA Central' as Tab);
  };

  if (allDone || !currentRow) {
    return (
      <button
        onClick={handleAdvanceSeason}
        disabled={state.isProcessing}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest transition-colors"
      >
        <Sparkles size={14} />
        Advance to Next Season
      </button>
    );
  }

  // Context-aware label per phase row
  const labelForRow: Record<OffseasonChecklistRow, string> = {
    draftLottery:     'Watch Draft Lottery',
    options:          'Decide Options',
    qualifyingOffers: 'Submit Qualifying Offers',
    myFAs:            'Review Departing FAs',
    draft:            'Run NBA Draft',
    rookieContracts:  'Sign Rookies',
    freeAgency:       state.faTagCounter
      ? `Tag ${state.faTagCounter}/${state.faTagsTotal ?? 13} — End Day`
      : 'Enter Free Agency',
    trainingCamp:     'Open Training Camp',
  };
  const label = labelForRow[currentRow];

  const handleEnter = () => {
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: currentRow } } as any);
  };

  return (
    <button
      onClick={handleEnter}
      disabled={state.isProcessing}
      title={OFFSEASON_ROW_DESCRIPTIONS[currentRow]}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2d5a27] hover:bg-[#3a7233] disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest transition-colors"
    >
      <ChevronRight size={14} />
      {label}
    </button>
  );
};

// ─── Sidebar — the AUFGABEN checklist ───────────────────────────────────────
//
// Mounted inside TeamOfficeView when state.offseasonChecklist is set. Vertical
// list of 8 rows; current row highlighted; each row has an Enter / Skip pair.

const STATUS_ICON: Record<OffseasonRowStatus, React.ReactNode> = {
  'pending':     <Circle className="w-4 h-4 text-slate-500" />,
  'in-progress': <Circle className="w-4 h-4 text-amber-400 animate-pulse" />,
  'done':        <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  'skipped':     <CheckCircle2 className="w-4 h-4 text-slate-600" />,
};

const STATUS_LABEL: Record<OffseasonRowStatus, string> = {
  'pending':     '',
  'in-progress': 'In progress',
  'done':        'Complete',
  'skipped':     'Skipped',
};

export const OffseasonAufgabenSidebar: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const checklist = state.offseasonChecklist;
  if (!checklist) return null;

  const currentRow = firstUnfinishedRow(checklist);

  const handleEnter = (row: OffseasonChecklistRow) => {
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
  };
  const handleSkip = (row: OffseasonChecklistRow) => {
    dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row } } as any);
  };
  const handleAutoResolveAll = () => {
    // Phase A stub — Phase D wires this to runLazySim with assistantGM=true.
    // For now mark every pending row as skipped so the sidebar advances and
    // the user can see the end-state. The actual lazy-sim dispatch happens
    // in Phase D.
    OFFSEASON_ROW_ORDER.forEach(row => {
      const status = checklist[row];
      if (status === 'pending' || status === 'in-progress') {
        dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row } } as any);
      }
    });
  };

  return (
    <aside className="w-full lg:w-[320px] shrink-0 bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
      <header className="flex items-center justify-between mb-2">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/80">
            Offseason
          </span>
          <h2 className="text-base font-black text-white uppercase tracking-tight">
            Aufgaben
          </h2>
        </div>
        <button
          onClick={handleAutoResolveAll}
          title="Auto-resolve every remaining phase via the AI assistant GM."
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] uppercase tracking-widest transition-colors"
        >
          <FastForward size={11} />
          Auto-resolve all
        </button>
      </header>

      <ol className="space-y-1.5">
        {OFFSEASON_ROW_ORDER.map(row => {
          const status = checklist[row];
          const isCurrent = row === currentRow;
          const isResolved = status === 'done' || status === 'skipped';
          return (
            <li
              key={row}
              className={`rounded-xl px-3 py-2.5 flex flex-col gap-1 transition-colors ${
                isCurrent
                  ? 'bg-amber-500/10 border border-amber-500/40'
                  : 'bg-slate-900/40 border border-slate-800/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {STATUS_ICON[status]}
                  <span
                    className={`text-[11px] font-black uppercase tracking-tight truncate ${
                      isResolved ? 'text-slate-500' : 'text-white'
                    }`}
                  >
                    {OFFSEASON_ROW_LABELS[row]}
                  </span>
                </div>
                {STATUS_LABEL[status] && (
                  <span className="text-[8px] uppercase tracking-widest font-bold text-slate-500 shrink-0">
                    {STATUS_LABEL[status]}
                  </span>
                )}
              </div>

              {isCurrent && (
                <>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    {OFFSEASON_ROW_DESCRIPTIONS[row]}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleEnter(row)}
                      className="flex-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-widest transition-colors"
                    >
                      Enter
                    </button>
                    <button
                      onClick={() => handleSkip(row)}
                      title="Let the AI assistant handle this phase."
                      className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] uppercase tracking-widest transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {isChecklistComplete(checklist) && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
          <p className="text-[11px] font-bold text-emerald-300">
            All offseason tasks complete — ready for opening night.
          </p>
        </div>
      )}
    </aside>
  );
};
