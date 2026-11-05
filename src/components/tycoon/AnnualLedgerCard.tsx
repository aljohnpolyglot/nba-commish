import React from 'react';
import type { AnnualLedger } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { HelpIconPopover } from './HelpIconPopover';

interface Props {
  ledger: AnnualLedger;
  currency: string;
  pending?: Partial<Record<'matchday' | 'sponsorship' | 'tv' | 'travel' | 'profit', boolean>>;
}

export const AnnualLedgerCard: React.FC<Props> = ({ ledger, currency, pending = {} }) => {
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const row = (label: string, value: number, color = 'text-slate-300', isPending = false) => (
    <div key={label} className="flex justify-between py-1 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`font-bold tabular-nums ${isPending ? 'text-sky-300' : color}`}>{isPending ? 'Pending' : fmt(value)}</span>
    </div>
  );
  const revenueTotal = ledger.revenue.matchday + (ledger.revenue.commercial ?? 0) + ledger.revenue.sponsorship + ledger.revenue.prize + ledger.revenue.tv + ledger.revenue.transfer;
  const expensesTotal = ledger.expenses.wages + ledger.expenses.staff + ledger.expenses.facility + ledger.expenses.scouting + ledger.expenses.travel + (ledger.expenses.medical ?? 0) + (ledger.expenses.academy ?? 0) + (ledger.expenses.transfer ?? 0) + ledger.expenses.financeCosts;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="font-black uppercase tracking-widest mb-4 text-sm flex items-center gap-1.5">
        Annual Ledger ({ledger.year})
        <HelpIconPopover
          title="How the Ledger Works"
          body={
            <>
              <p><strong className="text-emerald-300">Revenue</strong> combines completed and projected Matchday receipts with sponsorships, prize money, media rights, and player sales.</p>
              <p><strong className="text-rose-300">Expenses</strong> are player wages, staff wages (10% of player wages), facility operations, travel (higher when in EuroLeague), and scouting.</p>
              <p>Strong sporting results boost matchday attendance and unlock prize pool. Losing seasons drag both down.</p>
            </>
          }
        />
      </h2>
      <p className="text-[10px] uppercase text-emerald-400 font-black mb-1">Revenue</p>
      {row('Matchday', ledger.revenue.matchday, 'text-emerald-300', pending.matchday)}
      {row('Club Shop & Media', ledger.revenue.commercial ?? 0, 'text-emerald-300', pending.matchday)}
      {row('Sponsorship', ledger.revenue.sponsorship, 'text-emerald-300', pending.sponsorship)}
      {row('Prize Pool', ledger.revenue.prize, 'text-emerald-300')}
      {row('TV', ledger.revenue.tv, 'text-emerald-300', pending.tv)}
      {row('Player Sales & Loan Fees', ledger.revenue.transfer, 'text-emerald-300')}
      <div className="flex justify-between border-t border-slate-700 pt-1 mt-1 font-bold">
        <span className="text-slate-200">Total Revenue</span>
        <span className="text-emerald-300 tabular-nums">{pending.matchday || pending.sponsorship || pending.tv ? 'Pending' : fmt(revenueTotal)}</span>
      </div>
      <p className="text-[10px] uppercase text-rose-400 font-black mt-4 mb-1">Expenses</p>
      {row('Wages', -ledger.expenses.wages, 'text-rose-300')}
      {row('Staff', -ledger.expenses.staff, 'text-rose-300')}
      {row('Facility', -ledger.expenses.facility, 'text-rose-300')}
      {row('Travel', -ledger.expenses.travel, 'text-rose-300', pending.travel)}
      {row('Scouting', -ledger.expenses.scouting, 'text-rose-300')}
      {row('Medical', -(ledger.expenses.medical ?? 0), 'text-rose-300')}
      {row('Academy', -(ledger.expenses.academy ?? 0), 'text-rose-300')}
      {row('Transfer Fees', -(ledger.expenses.transfer ?? 0), 'text-rose-300')}
      {row('Finance Costs', -ledger.expenses.financeCosts, 'text-rose-300')}
      <div className="flex justify-between border-t border-slate-700 pt-1 mt-1 font-bold">
        <span className="text-slate-200">Total Expenses</span>
        <span className="text-rose-300 tabular-nums">{pending.travel ? 'Pending' : fmt(-expensesTotal)}</span>
      </div>
      <div className="flex justify-between border-t border-slate-600 pt-2 mt-2 text-base font-black">
        <span>Profit</span>
        <span className={pending.profit ? 'text-sky-300' : ledger.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{pending.profit ? 'Pending' : fmt(ledger.profit)}</span>
      </div>
    </div>
  );
};
