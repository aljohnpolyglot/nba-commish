import React from 'react';
import type { AnnualLedger } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { HelpIconPopover } from './HelpIconPopover';

interface Props {
  ledger: AnnualLedger;
  currency: string;
}

export const AnnualLedgerCard: React.FC<Props> = ({ ledger, currency }) => {
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const row = (label: string, value: number, color = 'text-slate-300') => (
    <div key={label} className="flex justify-between py-1 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`font-bold tabular-nums ${color}`}>{fmt(value)}</span>
    </div>
  );
  const revenueTotal = ledger.revenue.matchday + ledger.revenue.sponsorship + ledger.revenue.prize + ledger.revenue.tv + ledger.revenue.transfer;
  const expensesTotal = ledger.expenses.wages + ledger.expenses.staff + ledger.expenses.facility + ledger.expenses.scouting + ledger.expenses.travel + ledger.expenses.financeCosts;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="font-black uppercase tracking-widest mb-4 text-sm flex items-center gap-1.5">
        Annual Ledger ({ledger.year})
        <HelpIconPopover
          title="How the Ledger Works"
          body={
            <>
              <p><strong className="text-emerald-300">Revenue</strong> comes from four sources: matchday (stadium capacity × attendance × ticket price × 30 games), sponsorship deals, end-of-season prize pool, and TV money.</p>
              <p><strong className="text-rose-300">Expenses</strong> are player wages, staff wages (10% of player wages), facility operations, travel (higher when in EuroLeague), and scouting.</p>
              <p>Strong sporting results boost matchday attendance and unlock prize pool. Losing seasons drag both down.</p>
            </>
          }
        />
      </h2>
      <p className="text-[10px] uppercase text-emerald-400 font-black mb-1">Revenue</p>
      {row('Matchday', ledger.revenue.matchday, 'text-emerald-300')}
      {row('Sponsorship', ledger.revenue.sponsorship, 'text-emerald-300')}
      {row('Prize Pool', ledger.revenue.prize, 'text-emerald-300')}
      {row('TV', ledger.revenue.tv, 'text-emerald-300')}
      {ledger.revenue.transfer > 0 && row('Transfers', ledger.revenue.transfer, 'text-emerald-300')}
      <div className="flex justify-between border-t border-slate-700 pt-1 mt-1 font-bold">
        <span className="text-slate-200">Total Revenue</span>
        <span className="text-emerald-300 tabular-nums">{fmt(revenueTotal)}</span>
      </div>
      <p className="text-[10px] uppercase text-rose-400 font-black mt-4 mb-1">Expenses</p>
      {row('Wages', -ledger.expenses.wages, 'text-rose-300')}
      {row('Staff', -ledger.expenses.staff, 'text-rose-300')}
      {row('Facility', -ledger.expenses.facility, 'text-rose-300')}
      {row('Travel', -ledger.expenses.travel, 'text-rose-300')}
      {row('Scouting', -ledger.expenses.scouting, 'text-rose-300')}
      {ledger.expenses.financeCosts > 0 && row('Finance Costs', -ledger.expenses.financeCosts, 'text-rose-300')}
      <div className="flex justify-between border-t border-slate-700 pt-1 mt-1 font-bold">
        <span className="text-slate-200">Total Expenses</span>
        <span className="text-rose-300 tabular-nums">{fmt(-expensesTotal)}</span>
      </div>
      <div className="flex justify-between border-t border-slate-600 pt-2 mt-2 text-base font-black">
        <span>Profit</span>
        <span className={ledger.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmt(ledger.profit)}</span>
      </div>
    </div>
  );
};
