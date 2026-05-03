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

import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ChevronRight, FastForward, Sparkles, Wrench, ListChecks, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  OFFSEASON_ROW_ORDER,
  OFFSEASON_ROW_LABELS,
  OFFSEASON_ROW_DESCRIPTIONS,
  defaultOffseasonChecklist,
  firstUnfinishedRow,
  isChecklistComplete,
} from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow, OffseasonRowStatus, NBAPlayer, Tab } from '../../types';
import { TeamOptionGateModal } from '../modals/TeamOptionGateModal';

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
      ? `End Day · Tag ${state.faTagCounter}/${state.faTagsTotal ?? 13}`
      : 'Enter Free Agency',
    trainingCamp:     'Open Training Camp',
  };
  const label = labelForRow[currentRow];

  const handleEnter = () => {
    // Special case: during active FA tag counter, the header CTA is "End Day"
    // — fire the tag advance directly instead of re-entering the phase.
    if (currentRow === 'freeAgency' && (state.faTagCounter ?? 0) > 0) {
      dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
      return;
    }
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row: currentRow } } as any);
    // Initial FA entry also fires the moratorium-skip + counter-init.
    if (currentRow === 'freeAgency' && (state.faTagCounter ?? 0) === 0) {
      dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
    }
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

  // Auto-sync: when engine state proves a phase is done, flip the
  // corresponding row to 'done' so the user doesn't see pending rows for
  // things already handled. Runs every render — cheap, only dispatches when
  // a status actually needs to change. Hooks must run before any early-return,
  // so the useEffect lives here even though the component bails out below.
  const lotteryDone = !!(state.draftLotteryResult && state.draftLotteryResult.length > 0);
  const draftDone = !!state.draftComplete;
  // Rookie contracts: in real NBA, R1 picks are guaranteed per CBA (mandatory
  // signing) and R2 defaults are handled by autoRunDraft + AI logic. Once the
  // draft is complete, the GM has nothing to actively decide here.
  const rookieContractsDone = draftDone;
  // Team options: row is done when no expiring team options remain for the
  // user team OR rollover has already advanced the year past them.
  const noPendingTeamOptions = (() => {
    if (state.gameMode !== 'gm' || state.userTeamId == null) return false;
    const currentYear = state.leagueStats?.year ?? 2026;
    const nextYear = currentYear + 1;
    const pending = state.players.filter((p: any) => {
      if (p.tid !== state.userTeamId || p.status !== 'Active') return false;
      if (!p.contract?.hasTeamOption) return false;
      const teamOptionExp = Number(p.contract?.teamOptionExp ?? p.contract?.exp ?? 0);
      return teamOptionExp === nextYear;
    });
    return pending.length === 0;
  })();
  // Training camp: marked done once the calendar reaches opening night-ish
  // (mid-October) — the user has had the camp window to set drills.
  const cMonth = state.date ? new Date(state.date).getUTCMonth() + 1 : 0;
  const cDay = state.date ? new Date(state.date).getUTCDate() : 0;
  const trainingCampDone = (cMonth === 10 && cDay >= 21) || cMonth >= 11;

  useEffect(() => {
    if (!checklist) return;
    if (lotteryDone && checklist.draftLottery === 'pending') {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draftLottery' } } as any);
    }
    if (draftDone && checklist.draft === 'pending') {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draft' } } as any);
    }
    if (rookieContractsDone && checklist.rookieContracts === 'pending') {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'rookieContracts' } } as any);
    }
    if (noPendingTeamOptions && (checklist.options === 'pending' || checklist.options === 'in-progress')) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
    }
    if (trainingCampDone && checklist.trainingCamp === 'pending') {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
    }
  }, [lotteryDone, draftDone, rookieContractsDone, noPendingTeamOptions, trainingCampDone, checklist?.draftLottery, checklist?.draft, checklist?.rookieContracts, checklist?.options, checklist?.trainingCamp]);

  if (!checklist) return null;

  const currentRow = firstUnfinishedRow(checklist);
  // Options modal — opens when user clicks "Enter" on the options row.
  // Reuses the existing TeamOptionGateModal which is already wired into
  // PlayButton's guards; this is a second mount-point for offseason flow.
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [exercisedIds, setExercisedIds] = useState<Set<string>>(new Set());
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());

  const pendingTeamOptions = React.useMemo<NBAPlayer[]>(() => {
    if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
    const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
    const nextYear = currentYear + 1;
    return state.players.filter((p: any) => {
      if (p.tid !== state.userTeamId || p.status !== 'Active') return false;
      if (!p.contract?.hasTeamOption) return false;
      const teamOptionExp = Number(p.contract?.teamOptionExp ?? p.contract?.exp ?? 0);
      return teamOptionExp === nextYear;
    });
  }, [state.gameMode, state.userTeamId, state.players, state.leagueStats?.year]);

  const handleEnter = (row: OffseasonChecklistRow) => {
    if (row === 'options') {
      // Special-case options: open the existing TeamOptionGateModal in-place
      // instead of navigating away. Mark in-progress so sidebar reflects state.
      setOptionsModalOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'myFAs') {
      // Read-only review — navigate to TeamIntel and instantly mark done.
      // The user will see their expiring FAs in TeamIntelExpiring.
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      // Defer the complete dispatch one tick so the user sees the row as
      // 'in-progress' briefly before checking off — feels intentional.
      setTimeout(() => {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
      }, 400);
      return;
    }
    if (row === 'qualifyingOffers') {
      // Phase B: full QO modal stack lands with Phase C alongside the FA
      // dashboard. For now, navigate to TeamIntel (Expiring tab shows RFA
      // candidates) and mark done — the existing TeamIntelExpiring view
      // surfaces the data the user needs.
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      setTimeout(() => {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
      }, 400);
      return;
    }
    if (row === 'freeAgency') {
      // Enter FA: navigate + auto-skip moratorium silently to Tag 1/13.
      // ADVANCE_FA_TAG with counter=0 handles the skip + counter init.
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      if ((state.faTagCounter ?? 0) === 0) {
        dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
      }
      return;
    }
    dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
  };
  const handleSkip = (row: OffseasonChecklistRow) => {
    dispatchAction({ type: 'OFFSEASON_SKIP_PHASE', payload: { row } } as any);
  };

  // Options modal handlers — exercise/decline dispatch existing reducer cases,
  // then mark the options row as done when user clicks Save & Close.
  const handleOptionsAssistant = async () => {
    for (const p of pendingTeamOptions) {
      await dispatchAction({ type: 'EXERCISE_TEAM_OPTION', payload: { playerId: p.internalId } } as any);
    }
    setExercisedIds(new Set());
    setDeclinedIds(new Set());
    setOptionsModalOpen(false);
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
  };
  const handleOptionsExerciseOne = async (playerId: string) => {
    await dispatchAction({ type: 'EXERCISE_TEAM_OPTION', payload: { playerId } } as any);
    setExercisedIds(prev => { const n = new Set(prev); n.add(playerId); return n; });
  };
  const handleOptionsDeclineOne = async (playerId: string) => {
    await dispatchAction({ type: 'DECLINE_TEAM_OPTION', payload: { playerId } } as any);
    setDeclinedIds(prev => { const n = new Set(prev); n.add(playerId); return n; });
  };
  const handleOptionsDismiss = () => {
    // If everything got resolved, mark done; otherwise leave as in-progress.
    const totalResolved = exercisedIds.size + declinedIds.size;
    if (totalResolved >= pendingTeamOptions.length && pendingTeamOptions.length > 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
    }
    setExercisedIds(new Set());
    setDeclinedIds(new Set());
    setOptionsModalOpen(false);
  };
  const handleOptionsManual = () => {
    // "Review Manually" → close modal, navigate to TeamIntel Expiring tab
    setOptionsModalOpen(false);
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {},  // no-op; navigation happens via setCurrentView caller
    } as any);
  };
  const handleAutoResolveAll = () => {
    // Phase D — real implementation. Dispatches the OFFSEASON_AUTO_RESOLVE_ALL
    // reducer case, which kicks off a SIMULATE_TO_DATE lazy sim with
    // assistantGM=true targeting opening night. The orchestrator handles
    // every offseason event under the hood: rollover, FA market ticks, AI
    // signing waves, Bird Rights pass, external routing, training camp.
    // Auto-tear-down useEffect in GameContext clears the checklist when
    // calendar phase returns to 'inSeason'.
    if (window.confirm(
      'Auto-resolve every remaining offseason phase via the AI assistant GM? ' +
      'This will skip directly to opening night.'
    )) {
      dispatchAction({ type: 'OFFSEASON_AUTO_RESOLVE_ALL' } as any);
    }
  };

  return (
    <aside className="w-full lg:w-[320px] shrink-0 bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
      <header className="mb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/80 block">
          Offseason
        </span>
        <h2 className="text-base font-black text-white uppercase tracking-tight">
          Aufgaben
        </h2>
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

      {/* Auto-resolve all — placed BELOW the row list (away from the mobile
          sheet's X close button up top) to prevent misclicks. Hidden once
          everything is already resolved. */}
      {!isChecklistComplete(checklist) && (
        <button
          onClick={handleAutoResolveAll}
          title="Auto-resolve every remaining phase via the AI assistant GM."
          className="w-full mt-4 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-600/80 hover:bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest transition-colors"
        >
          <FastForward size={12} />
          Auto-resolve all remaining
        </button>
      )}

      {isChecklistComplete(checklist) && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
          <p className="text-[11px] font-bold text-emerald-300">
            All offseason tasks complete — ready for opening night.
          </p>
        </div>
      )}

      {/* Existing TeamOptionGateModal — second mount-point for offseason flow.
          Same modal PlayButton uses for date-blocking guard, here surfaced as
          a phase entry. */}
      <TeamOptionGateModal
        isOpen={optionsModalOpen}
        players={pendingTeamOptions}
        onAssistant={handleOptionsAssistant}
        onManual={handleOptionsManual}
        onDismiss={handleOptionsDismiss}
        onExerciseOne={handleOptionsExerciseOne}
        onDeclineOne={handleOptionsDeclineOne}
        exercisedIds={exercisedIds}
        declinedIds={declinedIds}
      />
    </aside>
  );
};

// ─── FA Tag Footer — sticky "FREE AGENCY · TAG X/13 · End Day" bar ────────
//
// Renders globally during the Free Agency phase. Shows the Tag counter +
// a big "End Day" button that advances ~5 calendar days under the hood
// via the existing SIMULATE_TO_DATE / lazy-sim path. The user never sees
// raw calendar dates during FA — just Tag X/13.

export const OffseasonFATagFooter: React.FC = () => {
  const { state, dispatchAction } = useGame();
  // Visible only when FA phase is active and the tag counter has been init'd.
  if (!state.offseasonChecklist) return null;
  const counter = state.faTagCounter ?? 0;
  const total = state.faTagsTotal ?? 13;
  if (counter === 0) return null;

  const isLast = counter >= total;
  const handleEndDay = () => {
    dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[170] flex items-center justify-center pointer-events-none px-4 pb-3">
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/95 border border-amber-500/40 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col leading-none">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-300/80">
            Free Agency
          </span>
          <span className="text-sm font-black text-white tabular-nums uppercase tracking-tight">
            Tag {counter}/{total}
          </span>
        </div>
        <button
          onClick={handleEndDay}
          disabled={state.isProcessing}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors ${
            state.isProcessing
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : isLast
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-amber-500 hover:bg-amber-400 text-black'
          }`}
        >
          <FastForward size={12} />
          {isLast ? 'Complete Free Agency' : 'End Day'}
        </button>
      </div>
    </div>
  );
};

// ─── Mobile-only floating sheet: AUFGABEN access on small screens ──────────
// Desktop has the rail in App.tsx; mobile gets a bottom-right floating
// button that opens a slide-over sheet with the same sidebar inside.

export const OffseasonAufgabenMobileSheet: React.FC = () => {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  if (!state.offseasonChecklist) return null;

  const checklist = state.offseasonChecklist;
  const remaining = (Object.values(checklist) as string[]).filter(s => s === 'pending' || s === 'in-progress').length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-[180] flex items-center gap-2 px-4 py-3 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-widest shadow-2xl transition-colors"
      >
        <ListChecks size={14} />
        Offseason · {remaining} left
      </button>
      {open && (
        <div className="lg:hidden fixed inset-0 z-[190] flex">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative ml-auto h-full w-[320px] max-w-[88vw] bg-slate-950 border-l border-slate-800 overflow-y-auto scrollbar-hide p-3">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X size={14} />
            </button>
            <OffseasonAufgabenSidebar />
          </div>
        </div>
      )}
    </>
  );
};

// ─── Debug — force-init checklist outside of offseason for testing ──────────
//
// The auto-init useEffect (GameContext) only fires when the calendar enters
// an offseason phase. During development you often want to test the AUFGABEN
// UI from a regular-season save without simming. This component renders a
// small dev-tools button in the bottom corner; clicking it sets the checklist
// even though the calendar is mid-season. Safe to leave shipped — does
// nothing once a real offseason auto-init has run.

export const OffseasonDebugTrigger: React.FC = () => {
  const { state, dispatchAction } = useGame();
  if (state.gameMode !== 'gm') return null;
  if (state.offseasonChecklist) return null;  // already initialized

  const handleForceInit = () => {
    dispatchAction({ type: 'OFFSEASON_RESET_CHECKLIST' } as any);
  };

  return (
    <button
      onClick={handleForceInit}
      title="Dev — initialize the offseason AUFGABEN sidebar without simming to Finals end."
      className="fixed bottom-4 right-4 z-[200] flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white font-bold text-[10px] uppercase tracking-widest shadow-2xl backdrop-blur-md transition-colors"
    >
      <Wrench size={12} />
      Test Offseason UI
    </button>
  );
};
