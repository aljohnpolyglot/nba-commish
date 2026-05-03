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
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Circle, ChevronRight, FastForward, Sparkles, Wrench, ListChecks, X, FileSignature, Bot, CheckCircle } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating, normalizeDate } from '../../utils/helpers';
import { getDraftDate, getDraftLotteryDate, getTrainingCampDate, toISODateString } from '../../utils/dateUtils';
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
    // Calendar-anchored phases: advance to event date if user is before it
    // so they land ON the day (matching sidebar Enter behavior).
    const ls = state.leagueStats as any;
    const lsYear = ls?.year ?? 2026;
    const todayNorm = state.date ? normalizeDate(state.date) : '';
    const simIfBefore = (targetISO: string) => {
      if (todayNorm && todayNorm < targetISO) {
        dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: { targetDate: targetISO, stopBefore: true },
        } as any);
      }
    };
    if (currentRow === 'draftLottery') {
      simIfBefore(toISODateString(getDraftLotteryDate(lsYear, ls)));
    } else if (currentRow === 'draft') {
      simIfBefore(toISODateString(getDraftDate(lsYear, ls)));
    } else if (currentRow === 'trainingCamp') {
      simIfBefore(toISODateString(getTrainingCampDate(lsYear, ls)));
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
  // Qualifying offers: empty candidate list = nothing to decide → done.
  const noQOCandidates = state.gameMode === 'gm'
    && state.userTeamId != null
    && (() => {
      const currentYear = state.leagueStats?.year ?? 2026;
      return !state.players.some((p: any) =>
        p.tid === state.userTeamId &&
        p.status === 'Active' &&
        p.contract &&
        (p.contract.exp ?? 0) === currentYear &&
        p.contract.rookie &&
        p.draft?.round === 1 &&
        !p.contract.qualifyingOfferSkipped &&
        !p.contract.qualifyingOfferSubmitted
      );
    })();

  useEffect(() => {
    if (!checklist) return;
    // Mark a row done if its engine signal fires AND status is anything
    // other than already-resolved (done/skipped). User may have clicked
    // Enter (→ 'in-progress') BEFORE the signal fires (e.g. clicks Run
    // Draft, simulates to draft day, last pick commits → draftComplete=true
    // → row should auto-flip to 'done' even though it's currently 'in-progress').
    const isUnresolved = (s: OffseasonRowStatus) => s === 'pending' || s === 'in-progress';
    if (lotteryDone && isUnresolved(checklist.draftLottery)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draftLottery' } } as any);
    }
    if (draftDone && isUnresolved(checklist.draft)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'draft' } } as any);
    }
    if (rookieContractsDone && isUnresolved(checklist.rookieContracts)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'rookieContracts' } } as any);
    }
    if (noPendingTeamOptions && isUnresolved(checklist.options)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'options' } } as any);
    }
    if (trainingCampDone && isUnresolved(checklist.trainingCamp)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
    }
    if (noQOCandidates && isUnresolved(checklist.qualifyingOffers)) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
    }
  }, [lotteryDone, draftDone, rookieContractsDone, noPendingTeamOptions, trainingCampDone, noQOCandidates, checklist?.draftLottery, checklist?.draft, checklist?.rookieContracts, checklist?.options, checklist?.trainingCamp, checklist?.qualifyingOffers]);

  if (!checklist) return null;

  const currentRow = firstUnfinishedRow(checklist);
  // Options modal — opens when user clicks "Enter" on the options row.
  // Reuses the existing TeamOptionGateModal which is already wired into
  // PlayButton's guards; this is a second mount-point for offseason flow.
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [exercisedIds, setExercisedIds] = useState<Set<string>>(new Set());
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());
  // Qualifying Offer modal — opens when user clicks "Enter" on the QO row.
  const [qoModalOpen, setQoModalOpen] = useState(false);
  const [qoSubmittedIds, setQoSubmittedIds] = useState<Set<string>>(new Set());
  const [qoSkippedIds, setQoSkippedIds] = useState<Set<string>>(new Set());

  // RFA-eligible expiring rookies on user team. Real NBA rule: only R1
  // picks coming off rookie scale are RFA-eligible (max 4 yrs of service).
  // R2 picks default to UFA — no QO available.
  const rfaCandidates = React.useMemo<NBAPlayer[]>(() => {
    if (state.gameMode !== 'gm' || state.userTeamId == null) return [];
    const currentYear = state.leagueStats?.year ?? 2026;
    return state.players.filter((p: any) => {
      if (p.tid !== state.userTeamId || p.status !== 'Active') return false;
      if (!p.contract) return false;
      // Expiring this offseason
      if ((p.contract.exp ?? 0) !== currentYear) return false;
      // R1 rookie scale (R2 picks not RFA-eligible)
      const isR1Rookie = !!(p.contract.rookie && p.draft?.round === 1);
      if (!isR1Rookie) return false;
      // Already opted out via skip — hide
      if (p.contract.qualifyingOfferSkipped) return false;
      return true;
    });
  }, [state.gameMode, state.userTeamId, state.players, state.leagueStats?.year]);

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

  // Helper: simulate forward to a target date if the calendar isn't there yet.
  // Lands ON the target date with games unplayed (stopBefore=true) so the
  // user can watch/run the event manually after navigating.
  const simToDateIfBefore = (targetISO: string) => {
    if (!state.date) return;
    const todayNorm = normalizeDate(state.date);
    if (todayNorm >= targetISO) return;
    dispatchAction({
      type: 'SIMULATE_TO_DATE',
      payload: { targetDate: targetISO, stopBefore: true },
    } as any);
  };

  const handleEnter = (row: OffseasonChecklistRow) => {
    if (row === 'options') {
      // Special-case options: open the existing TeamOptionGateModal in-place
      // instead of navigating away. Mark in-progress so sidebar reflects state.
      setOptionsModalOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'myFAs') {
      // Read-only review — deep-link to TeamIntel → Expiring sub-tab where
      // expiring contracts + RFA/UFA status are surfaced. Set the deep-link
      // slot BEFORE navigating so TeamOfficeView + TeamIntel pick it up on
      // mount and route the user straight to the right place.
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'expiring' } },
      } as any);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      // Defer the complete dispatch so the user sees the row as
      // 'in-progress' briefly before checking off.
      setTimeout(() => {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
      }, 400);
      return;
    }
    if (row === 'qualifyingOffers') {
      // Open the QO modal in-place. If no eligible R1 rookies expire this
      // year, instantly mark done — there's nothing for the GM to decide.
      if (rfaCandidates.length === 0) {
        dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row } } as any);
        return;
      }
      setQoModalOpen(true);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      return;
    }
    if (row === 'freeAgency') {
      // Enter FA: deep-link to TeamIntel → Free Agency dashboard, then
      // auto-skip moratorium silently to Tag 1/13. ADVANCE_FA_TAG with
      // counter=0 handles the skip + counter init.
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTeamOfficeNav: { tab: 'intel', intelTab: 'fa' } },
      } as any);
      dispatchAction({ type: 'OFFSEASON_ENTER_PHASE', payload: { row } } as any);
      if ((state.faTagCounter ?? 0) === 0) {
        dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
      }
      return;
    }
    // Calendar-anchored phases: advance to the event date if we're before it
    // so the user lands ON the relevant day instead of staring at June 23.
    const ls = state.leagueStats as any;
    const lsYear = ls?.year ?? 2026;
    if (row === 'draftLottery') {
      simToDateIfBefore(toISODateString(getDraftLotteryDate(lsYear, ls)));
    } else if (row === 'draft') {
      simToDateIfBefore(toISODateString(getDraftDate(lsYear, ls)));
    } else if (row === 'trainingCamp') {
      simToDateIfBefore(toISODateString(getTrainingCampDate(lsYear, ls)));
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

  // ── QO modal handlers ──────────────────────────────────────────────────
  const handleQoSubmitOne = (playerId: string) => {
    dispatchAction({ type: 'SUBMIT_QUALIFYING_OFFER', payload: { playerId } } as any);
    setQoSubmittedIds(prev => { const n = new Set(prev); n.add(playerId); return n; });
  };
  const handleQoSkipOne = (playerId: string) => {
    dispatchAction({ type: 'SKIP_QUALIFYING_OFFER', payload: { playerId } } as any);
    setQoSkippedIds(prev => { const n = new Set(prev); n.add(playerId); return n; });
  };
  const handleQoAssistantAll = () => {
    // AI default: submit QO for K2 ≥ 70 (worth retaining), skip below.
    rfaCandidates.forEach(p => {
      const k2 = convertTo2KRating(
        p.overallRating ?? 0,
        (p as any).ratings?.[(p as any).ratings?.length - 1]?.hgt ?? 50,
        (p as any).ratings?.[(p as any).ratings?.length - 1]?.tp ?? 50,
      );
      if (k2 >= 70) {
        handleQoSubmitOne(p.internalId);
      } else {
        handleQoSkipOne(p.internalId);
      }
    });
    setQoModalOpen(false);
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
  };
  const handleQoDismiss = () => {
    const totalDecided = qoSubmittedIds.size + qoSkippedIds.size;
    if (totalDecided >= rfaCandidates.length && rfaCandidates.length > 0) {
      dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'qualifyingOffers' } } as any);
    }
    setQoSubmittedIds(new Set());
    setQoSkippedIds(new Set());
    setQoModalOpen(false);
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

      {/* Qualifying Offer modal — RFA decision per expiring R1 rookie.
          Submit = retain match rights via Bird for next season's market;
          Skip = let player walk as UFA (no match rights). */}
      <QualifyingOfferModal
        isOpen={qoModalOpen}
        players={rfaCandidates}
        leagueStats={state.leagueStats}
        submittedIds={qoSubmittedIds}
        skippedIds={qoSkippedIds}
        onSubmitOne={handleQoSubmitOne}
        onSkipOne={handleQoSkipOne}
        onAssistant={handleQoAssistantAll}
        onDismiss={handleQoDismiss}
      />
    </aside>
  );
};

// ─── Qualifying Offer modal ────────────────────────────────────────────────
// Mirrors TeamOptionGateModal layout for visual consistency. Each row shows
// the player's last salary + projected QO amount (≈ max(lastSalary × 1.3,
// leagueMin × 1.5) — the NBA QO formula is more complex but this captures
// the right magnitude). Default recommendation: Submit for K2 ≥ 70.

interface QualifyingOfferModalProps {
  isOpen: boolean;
  players: NBAPlayer[];
  leagueStats: any;
  submittedIds: Set<string>;
  skippedIds: Set<string>;
  onSubmitOne: (playerId: string) => void;
  onSkipOne: (playerId: string) => void;
  onAssistant: () => void;
  onDismiss: () => void;
}

const QualifyingOfferModal: React.FC<QualifyingOfferModalProps> = ({
  isOpen, players, leagueStats, submittedIds, skippedIds,
  onSubmitOne, onSkipOne, onAssistant, onDismiss,
}) => {
  const computeQOAmount = (p: NBAPlayer): number => {
    const lastSalaryUSD = (p.contract?.amount ?? 0) * 1_000;
    const rawMin = leagueStats?.minContract ?? 1.273;
    const minSalaryUSD = rawMin > 1000 ? rawMin : rawMin * 1_000_000;
    return Math.max(Math.round(lastSalaryUSD * 1.3), Math.round(minSalaryUSD * 1.5));
  };
  const fmtUSD = (n: number) => n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : `$${(n / 1_000).toFixed(0)}K`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={onDismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-[#0f0f0f] border border-fuchsia-500/30 rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-fuchsia-500/[0.05]">
              <div className="flex items-center gap-3">
                <FileSignature className="w-5 h-5 text-fuchsia-400" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Qualifying Offers</h3>
              </div>
              <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-300 mb-4">
                Submit a qualifying offer to make this expiring R1 rookie a <span className="font-black text-fuchsia-300">restricted free agent</span> — you keep match rights when other teams come calling. Skip = he walks as UFA.
              </p>
              {players.length === 0 ? (
                <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center text-sm text-emerald-200 font-bold">
                  No expiring R1 rookies on your roster — nothing to submit.
                </div>
              ) : (
                <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 max-h-60 overflow-y-auto">
                  {players.map(p => {
                    const submitted = submittedIds.has(p.internalId);
                    const skipped = skippedIds.has(p.internalId);
                    const decided = submitted || skipped;
                    const qoUSD = computeQOAmount(p);
                    const r = (p as any).ratings?.[(p as any).ratings?.length - 1];
                    const k2 = convertTo2KRating(p.overallRating ?? 0, r?.hgt ?? 50, r?.tp ?? 50);
                    return (
                      <div key={p.internalId} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-500">K2 {k2} · QO {fmtUSD(qoUSD)} / 1yr</div>
                        </div>
                        {decided ? (
                          <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-1 ${submitted ? 'text-fuchsia-300' : 'text-rose-400'}`}>
                            {submitted ? 'Submitted' : 'Skipped'}
                          </span>
                        ) : (
                          <div className="shrink-0 flex items-center gap-1.5">
                            <button
                              onClick={() => onSubmitOne(p.internalId)}
                              className="px-2 py-1 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-fuchsia-500/30"
                            >
                              Submit
                            </button>
                            <button
                              onClick={() => onSkipOne(p.internalId)}
                              className="px-2 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-rose-500/30"
                            >
                              Skip
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {(() => {
                  const total = players.length;
                  const decidedCount = players.filter(p => submittedIds.has(p.internalId) || skippedIds.has(p.internalId)).length;
                  const allDone = total === 0 || decidedCount === total;
                  if (allDone) {
                    return (
                      <button
                        onClick={onDismiss}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                      >
                        <CheckCircle size={14} />
                        Done
                      </button>
                    );
                  }
                  return (
                    <button
                      onClick={onAssistant}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-fuchsia-500 hover:bg-fuchsia-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                    >
                      <Bot size={14} />
                      Assistant GM: Submit Worth Keeping (K2 ≥ 70)
                    </button>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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

  // Pending RFA decisions — when other teams submit offer sheets to YOUR
  // RFA players, those markets sit in pendingMatch state until the user
  // dispatches MATCH_RFA_OFFER or DECLINE_RFA_OFFER. Surface a badge so
  // the user notices instead of relying solely on toasts.
  const userTid = state.userTeamId ?? -999;
  const pendingMatchCount = (state.faBidding?.markets ?? []).filter((m: any) =>
    m.pendingMatch && !m.resolved && m.pendingMatchPriorTid === userTid
  ).length;

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
        {pendingMatchCount > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-200 font-black text-[10px] uppercase tracking-widest animate-pulse"
            title="One or more of your RFA players has a pending offer sheet — match or decline via toast"
          >
            <FileSignature size={11} />
            {pendingMatchCount} RFA to match
          </div>
        )}
        <button
          onClick={handleEndDay}
          disabled={state.isProcessing || pendingMatchCount > 0}
          title={pendingMatchCount > 0 ? 'Resolve pending RFA offer sheets before advancing.' : 'Advance ~5 days, AI signings + RFA matches resolve.'}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors ${
            state.isProcessing || pendingMatchCount > 0
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
