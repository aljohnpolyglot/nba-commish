import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, FastForward } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getEuroOffseasonMarketProgress } from '../../services/offseason/euroOffseasonMarkets';

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
  const transferMarketCanComplete = state.offseasonChecklist.myFAs === 'done'
    || state.offseasonChecklist.myFAs === 'skipped';

  const progress = getEuroOffseasonMarketProgress(state.date, 'transfer');

  const handleSimDay = () => {
    if (!progress || progress.isLast || state.isProcessing || simClickPendingRef.current) return;
    simClickPendingRef.current = true;
    setSimClickPending(true);
    dispatchAction({ type: 'OFFSEASON_ADVANCE_TRANSFER_MARKET_DAY' } as any);
  };
  const handleComplete = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'transferMarket' } } as any);
  };

  if (!progress) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[170] flex items-center justify-center pointer-events-none px-4 pb-3">
        <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/95 border border-amber-500/40 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col leading-none">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-300/80">Transfer Market</span>
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
              Review expiring players first
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
            Transfer Market
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
  if (state.leagueStats?.uiMode === 'pba_isolated') return null;
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
