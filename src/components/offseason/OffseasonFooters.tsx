import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, FastForward, FileSignature, Sparkles } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getOffseasonState } from '../../services/offseason/offseasonState';
import type { OffseasonChecklistRow } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { getNextPostFaTargetISO, getTransferWindowProgress } from './aufgabenShared';

type OffseasonConfirmSpec = {
  eyebrow: string;
  title: string;
  body: string;
  confirmLabel: string;
};

export const OffseasonFATagFooter: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const confirmActionRef = useRef<(() => void) | null>(null);
  const [confirmSpec, setConfirmSpec] = useState<OffseasonConfirmSpec | null>(null);
  if (!state.offseasonChecklist) return null;
  const faStatus = state.offseasonChecklist.freeAgency;
  const counter = state.faTagCounter ?? 0;
  const total = state.faTagsTotal ?? 13;
  if (counter === 0) return null;
  if (faStatus !== 'pending' && faStatus !== 'in-progress' && faStatus !== 'skipped') return null;
  if (!state.date) return null;
  const os = getOffseasonState(state.date, state.leagueStats as any, state.schedule as any);
  if (os.phase !== 'moratorium' && os.phase !== 'birdRights' && os.phase !== 'openFA') return null;

  const isLast = counter >= total;
  const openConfirm = (spec: OffseasonConfirmSpec, action: () => void) => {
    confirmActionRef.current = action;
    setConfirmSpec(spec);
  };
  const closeConfirm = () => {
    confirmActionRef.current = null;
    setConfirmSpec(null);
  };
  const handleEndDay = () => {
    dispatchAction({ type: 'OFFSEASON_ADVANCE_FA_TAG' } as any);
  };
  const handleNextTask = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'freeAgency' } } as any);
    const targetISO = getNextPostFaTargetISO(state);
    const todayNorm = state.date ? normalizeDate(state.date) : '';
    if (todayNorm && todayNorm < targetISO) {
      dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: targetISO, stopBefore: true },
      } as any);
    }
  };

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
            Day {counter}/{total}
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
          onClick={() => openConfirm(
            {
              eyebrow: 'Summer Checklist',
              title: isLast ? 'Complete Free Agency' : 'Advance Free Agency Day',
              body: isLast
                ? 'This resolves the final free agency day and closes out the free agency step.'
                : 'This advances free agency forward and resolves the next batch of offers, signings, and RFA outcomes.',
              confirmLabel: isLast ? 'Complete Free Agency' : 'End Day',
            },
            handleEndDay,
          )}
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
        {!isLast && (
          <button
            onClick={() => openConfirm(
              {
                eyebrow: 'Summer Checklist',
                title: 'Go to Next Task',
                body: 'This marks free agency complete and advances to the next unresolved offseason event before camp. If none remain, it stops at training camp.',
                confirmLabel: 'Next Task',
              },
              handleNextTask,
            )}
            disabled={state.isProcessing || pendingMatchCount > 0}
            title="Finish free agency and stop at the next unresolved offseason task."
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors border ${
              state.isProcessing || pendingMatchCount > 0
                ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                : 'bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-500/40'
            }`}
          >
            <Sparkles size={12} />
            Next Task
          </button>
        )}
      </div>
      {confirmSpec && createPortal(
        <div className="fixed inset-0 z-[171] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={closeConfirm} />
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 mb-2">{confirmSpec.eyebrow}</p>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">{confirmSpec.title}</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                {confirmSpec.body}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={closeConfirm}
                  className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs py-3 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const action = confirmActionRef.current;
                    closeConfirm();
                    action?.();
                  }}
                  className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors"
                >
                  {confirmSpec.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export const OffseasonTransferMarketFooter: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const [simClickPending, setSimClickPending] = useState(false);
  const simClickPendingRef = useRef(false);
  useEffect(() => {
    simClickPendingRef.current = false;
    setSimClickPending(false);
  }, [state.date, state.isProcessing]);

  if (!state.offseasonChecklist) return null;
  if (state.leagueStats?.uiMode !== 'euro_isolated') return null;
  const status = state.offseasonChecklist.transferMarket;
  if (status !== 'pending' && status !== 'in-progress') return null;
  if (!state.date) return null;
  const transferMarketCanComplete = (['sponsorRenewals', 'facilityUpgrades', 'staffSignings'] as OffseasonChecklistRow[])
    .every(row => state.offseasonChecklist?.[row] === 'done' || state.offseasonChecklist?.[row] === 'skipped');

  const progress = getTransferWindowProgress(state.date, state.leagueStats);

  const handleSimDay = () => {
    if (!progress || progress.isLast || state.isProcessing || simClickPendingRef.current) return;
    simClickPendingRef.current = true;
    setSimClickPending(true);
    dispatchAction({ type: 'ADVANCE_DAY' } as any);
  };
  const handleComplete = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'transferMarket' } } as any);
  };

  if (!progress) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[170] flex items-center justify-center pointer-events-none px-4 pb-3">
        <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/95 border border-amber-500/40 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col leading-none">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-300/80">Player Market</span>
            <span className="text-sm font-black text-white tabular-nums uppercase tracking-tight">Closed</span>
          </div>
          {transferMarketCanComplete ? (
            <button
              onClick={handleComplete}
              disabled={state.isProcessing}
              title="Close the transfer-market task and continue to the next offseason task."
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors border ${
                state.isProcessing
                  ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                  : 'bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-500/40'
              }`}
            >
              <CheckCircle size={12} />
              Next Task
            </button>
          ) : (
            <div className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Finish staff, sponsors, and facilities
            </div>
          )}
        </div>
      </div>
    );
  }

  const { current, total, isLast } = progress;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[170] flex items-center justify-center pointer-events-none px-4 pb-3">
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/95 border border-sky-500/40 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col leading-none">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-sky-300/80">
            Player Market
          </span>
          <span className="text-sm font-black text-white tabular-nums uppercase tracking-tight">
            Day {current}/{total}
          </span>
        </div>
        <button
          onClick={handleSimDay}
          disabled={state.isProcessing || simClickPending || isLast}
          title="Advance one day — AI clubs evaluate listings, place bids, accept offers."
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors ${
            state.isProcessing || simClickPending || isLast
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-sky-500 hover:bg-sky-400 text-black'
          }`}
        >
          <FastForward size={12} />
          Sim Day
        </button>
        {transferMarketCanComplete && (
          <button
            onClick={handleComplete}
            disabled={state.isProcessing}
            title="Mark transfer market complete and continue to the next offseason task."
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors border ${
              state.isProcessing
                ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                : 'bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-500/40'
            }`}
          >
            <CheckCircle size={12} />
            Next Task
          </button>
        )}
      </div>
    </div>
  );
};

export const OffseasonTrainingCampFooter: React.FC = () => {
  const { state, dispatchAction } = useGame();
  if (!state.offseasonChecklist) return null;
  if (state.leagueStats?.uiMode === 'euro_isolated') return null;
  const status = state.offseasonChecklist.trainingCamp;
  if (status !== 'pending' && status !== 'in-progress') return null;

  const userTid = state.userTeamId ?? -999;
  const rosterSize = (state.players ?? []).filter((p: any) => p.tid === userTid && !p.gLeagueAssigned).length;
  const target = state.leagueStats?.maxStandardPlayersPerTeam ?? 15;
  const needsTrim = rosterSize > target;

  const handleComplete = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'trainingCamp' } } as any);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[170] flex items-center justify-center pointer-events-none px-4 pb-3">
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/95 border border-sky-500/40 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col leading-none">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-sky-300/80">Training Camp</span>
          <span className="text-sm font-black text-white tabular-nums uppercase tracking-tight">
            {rosterSize}/{target} roster
          </span>
        </div>
        {needsTrim && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 font-black text-[10px] uppercase tracking-widest">
            Trim to {target}
          </div>
        )}
        <button
          onClick={handleComplete}
          disabled={needsTrim || state.isProcessing}
          title={needsTrim ? `Cut roster to ${target} before completing training camp.` : 'Complete training camp and open the regular season.'}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-colors ${
            needsTrim || state.isProcessing
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-sky-600 hover:bg-sky-500 text-white'
          }`}
        >
          Complete Training Camp
        </button>
      </div>
    </div>
  );
};
