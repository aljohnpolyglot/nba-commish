import React from 'react';
import { History, AlertTriangle } from 'lucide-react';
import type { TycoonState } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { HelpIconPopover } from './HelpIconPopover';

interface Props {
  tycoon: TycoonState;
  currency: string;
}

export const LedgerHistoryCard: React.FC<Props> = ({ tycoon, currency }) => {
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const rows = tycoon.ledgerHistory.slice(-5);
  const ffpWarn = tycoon.ffpRollingDeficit < -20_000_000;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="font-black uppercase tracking-widest mb-4 text-sm flex items-center gap-2">
        <History size={14} className="text-blue-400" /> Ledger History
        <HelpIconPopover
          title="Cash & Financial Fair Play"
          body={
            <>
              <p><strong>Cash on Hand</strong> carries year-to-year. Profit adds to it, losses drain it. Negative cash incurs 5% interest as a finance cost.</p>
              <p><strong>FFP 3-Year Deficit</strong> sums your losses across the last 3 seasons. Over €20M warns; in a future update, over €30M triggers a transfer ban, over €50M brings point deductions.</p>
              <p>The history table shows the last 5 completed seasons. Run sustainable books and the deficit stays at 0.</p>
            </>
          }
        />
      </h2>
      <div className="flex justify-between items-baseline mb-3">
        <span className="text-[10px] uppercase text-slate-500 font-black">Cash on Hand</span>
        <span className={`text-lg font-black ${tycoon.cashOnHand >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
          {fmt(tycoon.cashOnHand)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No completed seasons yet — first year-end will seed history.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((l) => (
            <div key={l.year} className="flex justify-between text-sm border-b border-slate-800 py-1">
              <span className="text-slate-400">{l.year}</span>
              <div className="flex gap-3 tabular-nums">
                <span className={l.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmt(l.profit)}</span>
                <span className="text-slate-500 text-xs">cash {fmt(l.cashOnHandEnd)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={`mt-3 rounded-lg px-3 py-2 flex items-center gap-2 text-xs ${ffpWarn ? 'bg-amber-500/10 border border-amber-500/40 text-amber-200' : 'bg-slate-800/40 text-slate-400'}`}>
        {ffpWarn && <AlertTriangle size={12} className="text-amber-400" />}
        FFP 3-Year Deficit: <span className="font-bold tabular-nums">{fmt(tycoon.ffpRollingDeficit)}</span>
      </div>
    </div>
  );
};
