import React from 'react';
import { Landmark, BellOff, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { isEuroIsolatedMode } from '../../utils/uiMode';

export const FinanceRecapModal: React.FC = () => {
  const { state, applyTycoonMutation, setCurrentView } = useGame() as any;
  if (!isEuroIsolatedMode(state) || state.gameMode !== 'gm') return null;
  const team = resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? []) as any;
  const recap = team?.tycoon?.pendingFinanceRecap;
  if (!recap) return null;

  const close = (muteMonth = false) => {
    applyTycoonMutation(state.userTeamId, (t: any) => {
      if (!t.tycoon) return;
      if (muteMonth) {
        t.tycoon.financeRecapSettings = {
          ...(t.tycoon.financeRecapSettings ?? {}),
          mutedMonth: recap.endDate.slice(0, 7),
        };
      }
      delete t.tycoon.pendingFinanceRecap;
    });
  };

  return (
    <div className="fixed inset-0 z-[140] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-emerald-400/30 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl border border-emerald-400/40 bg-emerald-400/10 flex items-center justify-center text-emerald-200">
              <Landmark size={22} />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-emerald-300">Finance Recap</div>
              <div className="text-sm text-slate-400">{recap.startDate} to {recap.endDate}</div>
            </div>
          </div>
          <button onClick={() => close()} className="w-10 h-10 rounded-xl border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-5 overflow-y-auto p-4 sm:p-5">
          <div className="grid sm:grid-cols-4 gap-3">
            <Kpi label="Cash In" value={formatCurrencyWithCode(recap.cashIn, 'EUR', false)} tone="text-emerald-300" />
            <Kpi label="Cash Out" value={formatCurrencyWithCode(recap.cashOut, 'EUR', false)} tone="text-rose-300" />
            <Kpi label="Net" value={formatCurrencyWithCode(recap.net, 'EUR', false)} tone={recap.net >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
            <Kpi label="Cash" value={formatCurrencyWithCode(recap.cashOnHand, 'EUR', false)} tone="text-white" />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
            {recap.lines.map((line: any, index: number) => (
              <div key={`${line.label}-${index}`} className="flex items-center justify-between gap-4 border-b border-slate-800 last:border-b-0 p-4">
                <div>
                  <div className="text-sm font-black text-white">{line.label}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{line.kind}</div>
                </div>
                <div className={`text-sm font-black tabular-nums ${line.kind === 'expense' ? 'text-rose-300' : line.kind === 'income' ? 'text-emerald-300' : 'text-slate-300'}`}>
                  {line.kind === 'note' ? formatCurrencyWithCode(line.amount, 'EUR', false) : formatCurrencyWithCode(Math.abs(line.amount), 'EUR', false)}
                </div>
              </div>
            ))}
          </div>
          {recap.nextPayday && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
              Next payroll cadence date: <span className="font-black">{recap.nextPayday}</span>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={() => { close(); setCurrentView('Front Office Finances'); }} className="h-12 flex-1 rounded-xl border border-emerald-400/50 bg-emerald-400/15 text-emerald-200 font-black uppercase tracking-widest text-xs">
              Open Finances
            </button>
            <button onClick={() => close(true)} className="h-12 rounded-xl border border-slate-700 px-5 text-slate-300 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
              <BellOff size={16} /> Mute This Month
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className={`mt-2 text-lg font-black tabular-nums ${tone}`}>{value}</div>
  </div>
);
