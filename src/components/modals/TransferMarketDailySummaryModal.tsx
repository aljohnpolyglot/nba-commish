import React from 'react';
import { ArrowRight, CalendarDays, X } from 'lucide-react';
import type { TransferMarketDailyDecision } from '../../types';
import { useGame } from '../../store/GameContext';

function formatEUR(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function Club({ name, logo }: { name: string; logo?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {logo ? (
        <img src={logo} alt="" className="h-8 w-8 shrink-0 object-contain" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[8px] font-black text-slate-500">CLUB</span>
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

function DecisionCard({ decision }: { decision: TransferMarketDailyDecision }) {
  const typeLabel = decision.type === 'transfer'
    ? 'Permanent Transfer'
    : decision.type === 'loan-return'
      ? 'Loan Return'
      : 'Loan Move';
  return (
    <article className={`rounded-xl border p-4 ${decision.involvesUserTeam ? 'border-sky-500/40 bg-sky-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-black text-white">{decision.playerName}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-sky-300">{typeLabel}</div>
        </div>
        <div className="shrink-0 text-right text-sm font-black text-emerald-300">
          {decision.feeEUR > 0 ? formatEUR(decision.feeEUR) : 'Return'}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs font-bold text-slate-200">
        <Club name={decision.fromTeamName} logo={decision.fromTeamLogo} />
        <ArrowRight size={15} className="text-slate-600" />
        <Club name={decision.toTeamName} logo={decision.toTeamLogo} />
      </div>
    </article>
  );
}

export const TransferMarketDailySummaryModal: React.FC = () => {
  const { state, dispatchAction, setCurrentView } = useGame();
  const summary = state.pendingTransferMarketSummary;
  if (!summary) return null;
  const transfers = summary.decisions.filter(decision => decision.type === 'transfer').length;
  const loans = summary.decisions.length - transfers;
  const yourClub = summary.decisions.filter(decision => decision.involvesUserTeam).length;
  const close = () => {
    dispatchAction({ type: 'UPDATE_STATE', payload: { pendingTransferMarketSummary: undefined } } as any);
    setCurrentView('Front Office Transfer Market');
  };

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/90 p-2 backdrop-blur-md sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="transfer-market-summary-title" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#07111d] shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-700/70 px-4 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-sky-700 p-2 text-white"><CalendarDays size={22} /></span>
              <div>
                <h2 id="transfer-market-summary-title" className="text-xl font-black uppercase tracking-wide text-white sm:text-3xl">Daily Transfer Market Summary</h2>
                <p className="text-xs text-slate-400 sm:text-sm">{formatDate(summary.date)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              {summary.decisions.length > 0 ? 'These moves were completed today.' : 'No players moved today.'}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close transfer market summary" className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={24} /></button>
        </header>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-800 px-4 py-3 sm:grid-cols-4 sm:px-6">
          <div className="rounded-lg bg-slate-900 p-3"><div className="text-xl font-black text-white">{summary.decisions.length}</div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total Moves</div></div>
          <div className="rounded-lg bg-sky-500/10 p-3"><div className="text-xl font-black text-sky-300">{transfers}</div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Transfers</div></div>
          <div className="rounded-lg bg-violet-500/10 p-3"><div className="text-xl font-black text-violet-300">{loans}</div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Loan Moves</div></div>
          <div className="rounded-lg bg-emerald-500/10 p-3"><div className="text-xl font-black text-emerald-300">{yourClub}</div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Your Club</div></div>
        </div>

        <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-3 sm:p-6">
          {summary.decisions.map(decision => <DecisionCard key={decision.id} decision={decision} />)}
        </div>

        <footer className="shrink-0 border-t border-slate-700/70 bg-slate-950/90 p-3 sm:px-6 sm:py-4">
          <button type="button" onClick={close} className="w-full rounded-xl bg-sky-700 px-5 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-sky-600 sm:ml-auto sm:block sm:w-auto">
            Back to Transfer Market
          </button>
        </footer>
      </section>
    </div>
  );
};
