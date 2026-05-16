import React, { useState } from 'react';
import { Landmark, TrendingUp, TrendingDown } from 'lucide-react';
import { computeAnnualBudget } from '../../../../../services/tycoon/budgetEngine';
import { computeStarPower } from '../../../../../services/tycoon/starPower';
import { ALL_SLOTS, type SponsorshipSlot, type TycoonState } from '../../../../../types/tycoon';
import { BoardPromisesCard } from './BoardPromisesCard';
import { SectionTitle } from '../shared/helpers';

const SPONSOR_SLOT_LABELS: Record<SponsorshipSlot, string> = {
  kit: 'Kit Sponsor',
  sleeve: 'Sleeve Sponsor',
  back: 'Back of Shirt',
  shorts: 'Shorts Sponsor',
  training: 'Training Kit',
  court: 'Court Logo',
  stadium: 'Arena Naming',
  practice: 'Practice Facility',
};

const MiniSparkline: React.FC<{ tone: 'green' | 'red' | 'gold' }> = ({ tone }) => {
  const color = tone === 'green' ? 'bg-emerald-400' : tone === 'red' ? 'bg-rose-400' : 'bg-amber-300';
  const heights = tone === 'red' ? [18, 14, 22, 19, 31, 25, 37, 34, 46, 42, 55] : [16, 20, 18, 27, 23, 35, 32, 44, 48, 42, 51];
  return (
    <div className="flex items-end gap-1 h-12 opacity-80">
      {heights.map((height, index) => (
        <span key={index} className={`w-2 rounded-t ${color}`} style={{ height }} />
      ))}
    </div>
  );
};

const MetricTile: React.FC<{ label: string; value: string; delta: string; tone: 'green' | 'red' | 'gold' }> = ({ label, value, delta, tone }) => {
  const text = tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-rose-300' : 'text-amber-300';
  return (
    <div className="min-h-[118px] border-r border-slate-800 last:border-r-0 px-5 py-4">
      <div className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`mt-3 text-3xl font-black tabular-nums ${text}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-400">{delta}</div>
      <div className="mt-2"><MiniSparkline tone={tone} /></div>
    </div>
  );
};

const moneyFlowColors = ['emerald', 'cyan', 'sky', 'violet', 'rose', 'orange', 'amber', 'yellow'] as const;

const FlowRow: React.FC<{
  label: string;
  value: number;
  total: number;
  fmt: (v: number) => string;
  color: typeof moneyFlowColors[number];
  align?: 'left' | 'right';
}> = ({ label, value, total, fmt, color, align = 'left' }) => {
  const pct = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
  const palette: Record<typeof moneyFlowColors[number], string> = {
    emerald: 'border-emerald-400/50 bg-emerald-500/12 text-emerald-300',
    cyan: 'border-cyan-400/50 bg-cyan-500/12 text-cyan-300',
    sky: 'border-sky-400/50 bg-sky-500/12 text-sky-300',
    violet: 'border-violet-400/50 bg-violet-500/12 text-violet-300',
    rose: 'border-rose-400/50 bg-rose-500/12 text-rose-300',
    orange: 'border-orange-400/50 bg-orange-500/12 text-orange-300',
    amber: 'border-amber-400/50 bg-amber-500/12 text-amber-300',
    yellow: 'border-yellow-400/50 bg-yellow-500/12 text-yellow-300',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${palette[color]}`}>
      <div className={`flex items-baseline justify-between gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
        <div>
          <div className="text-sm font-black text-white">{label}</div>
          <div className="text-xs text-slate-300">{fmt(value)}</div>
        </div>
        <div className="text-sm font-black tabular-nums">{pct}%</div>
      </div>
    </div>
  );
};

export const AnnualProjectionCard: React.FC<{
  ledger: ReturnType<typeof computeAnnualBudget>;
  fmt: (v: number) => string;
  cashOnHand: number;
  currentYear: number;
  starPower: ReturnType<typeof computeStarPower>;
  ledgerHistory?: ReturnType<typeof computeAnnualBudget>[];
}> = ({ ledger, fmt, cashOnHand, currentYear, starPower, ledgerHistory }) => {
  const totalRevenue = ledger.revenue.matchday + ledger.revenue.sponsorship + ledger.revenue.tv + ledger.revenue.prize;
  const totalExpenses = ledger.expenses.wages + ledger.expenses.staff + ledger.expenses.facility + (ledger.expenses.scouting ?? 0) + ledger.expenses.travel + (ledger.expenses.medical ?? 0) + ledger.expenses.financeCosts;
  const profit = totalRevenue - totalExpenses;
  const cashEnd = cashOnHand + profit;
  const profitable = profit >= 0;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  const marginPct = Math.max(0, Math.min(100, Math.round(profitMargin)));
  const prev = ledgerHistory && ledgerHistory.length > 0 ? ledgerHistory[ledgerHistory.length - 1] : null;
  const prevRevenue = prev ? Object.values(prev.revenue).reduce((s, v) => s + v, 0) : 0;
  const prevExpenses = prev ? Object.values(prev.expenses).reduce((s, v) => s + v, 0) : 0;
  const prevProfit = prev ? prev.profit : 0;
  const yoyDelta = (cur: number, old: number): { text: string; dir: 'up' | 'down' | 'flat' } => {
    if (!prev || old === 0) return { text: 'First season', dir: 'flat' };
    const pct = ((cur - old) / Math.abs(old)) * 100;
    return { text: `vs last season ${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}%`, dir: pct >= 0 ? 'up' : 'down' };
  };
  const revDelta = yoyDelta(totalRevenue, prevRevenue);
  const expDelta = yoyDelta(totalExpenses, prevExpenses);
  const profitDelta = yoyDelta(profit, prevProfit);
  const cashDelta = prev ? `vs last year-end ${cashEnd >= prev.cashOnHandEnd ? '↑' : '↓'} ${fmt(Math.abs(cashEnd - prev.cashOnHandEnd))}` : `Starting cash ${fmt(cashOnHand)}`;

  const revenueRows = [
    { label: 'Matchday Revenue', value: ledger.revenue.matchday, color: 'emerald' as const },
    { label: 'Sponsorships', value: ledger.revenue.sponsorship, color: 'cyan' as const },
    { label: 'TV Rights', value: ledger.revenue.tv, color: 'sky' as const },
    { label: 'Prize Money', value: ledger.revenue.prize, color: 'violet' as const },
  ].filter((row) => row.value > 0);
  const expenseRows = [
    { label: 'Wages', value: ledger.expenses.wages, color: 'rose' as const },
    { label: 'Staff', value: ledger.expenses.staff, color: 'rose' as const },
    { label: 'Facility Ops', value: ledger.expenses.facility, color: 'orange' as const },
    { label: 'Scouting & Analytics', value: ledger.expenses.scouting ?? 0, color: 'orange' as const },
    { label: 'Travel', value: ledger.expenses.travel, color: 'amber' as const },
    { label: 'Medical', value: ledger.expenses.medical ?? 0, color: 'yellow' as const },
    { label: 'Finance Costs', value: ledger.expenses.financeCosts, color: 'yellow' as const },
  ].filter((row) => row.value > 0);

  let starLabel: string | null = null;
  if (starPower.boost >= 1.2) starLabel = `Marquee crack — ${starPower.stars[0]} draws international sponsor interest`;
  else if (starPower.boost >= 0.6) starLabel = `${starPower.stars[0]} is a continental star, sponsors are queuing`;
  else if (starPower.boost >= 0.2) starLabel = `Strong core with ${starPower.stars[0]}`;
  else if (starPower.boost > 0) starLabel = `Rising star — ${starPower.stars[0]}`;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-slate-800">
          <h2 className="font-black text-base uppercase tracking-wide flex items-center gap-2 text-slate-100">
            {profitable ? <TrendingUp size={16} className="text-emerald-400" /> : <TrendingDown size={16} className="text-rose-400" />}
            Financial Snapshot <span className="text-slate-500 font-medium normal-case">(Live)</span>
          </h2>
          <span className="text-xs text-slate-500">Season {currentYear}-{String(currentYear + 1).slice(-2)}</span>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_220px]">
          <MetricTile label="Total Revenue" value={fmt(totalRevenue)} delta={revDelta.text} tone="green" />
          <MetricTile label="Total Expenses" value={fmt(totalExpenses)} delta={expDelta.text} tone="red" />
          <MetricTile label="Projected Profit" value={`${profit < 0 ? '-' : ''}${fmt(Math.abs(profit))}`} delta={profitDelta.text} tone={profitable ? 'green' : 'red'} />
          <MetricTile label="Year-End Cash" value={`${cashEnd < 0 ? '-' : ''}${fmt(Math.abs(cashEnd))}`} delta={cashDelta} tone={cashEnd >= 0 ? 'gold' : 'red'} />
          <div className="px-5 py-4 flex flex-col items-center justify-center">
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center"
              style={{ background: `conic-gradient(#34d399 ${marginPct * 3.6}deg, #334155 0deg)` }}
            >
              <div className="w-20 h-20 rounded-full bg-slate-950 border border-slate-800 flex flex-col items-center justify-center">
                <div className="text-2xl font-black text-white tabular-nums">{profitMargin.toFixed(1)}%</div>
                <div className={`text-xs ${profitable ? 'text-emerald-300' : 'text-rose-300'}`}>{profitable ? 'Healthy' : 'At Risk'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {starLabel && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <span className="font-black uppercase tracking-widest text-amber-300 mr-2">Star Power</span>{starLabel}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black uppercase tracking-wide text-white">Where The Money Comes From & Goes</h3>
          <div className="text-right">
            <div className="text-xs font-black uppercase tracking-widest text-rose-300">Cash Out</div>
            <div className="text-3xl font-black text-rose-300 tabular-nums">{fmt(totalExpenses)}</div>
          </div>
        </div>
        <div className="grid xl:grid-cols-[1fr_260px_1fr] gap-5 items-center">
          <div className="space-y-3">
            <div className="text-2xl font-black text-emerald-300 tabular-nums">{fmt(totalRevenue)}</div>
            {revenueRows.map((row) => (
              <FlowRow key={row.label} label={row.label} value={row.value} total={totalRevenue} fmt={fmt} color={row.color} />
            ))}
          </div>
          <div className="relative flex items-center justify-center min-h-[250px]">
            <div className="absolute inset-y-8 left-0 right-0 bg-[linear-gradient(90deg,rgba(16,185,129,0.22),rgba(20,184,166,0.06),rgba(244,63,94,0.22))] blur-xl" />
            <div className="relative w-44 h-44 rounded-full border border-cyan-400/30 bg-slate-950 shadow-2xl shadow-cyan-950/30 flex flex-col items-center justify-center text-center">
              <div className="text-xs font-black uppercase tracking-widest text-white">Projected Profit</div>
              <div className={`mt-2 text-3xl font-black tabular-nums ${profitable ? 'text-emerald-300' : 'text-rose-300'}`}>{profit < 0 ? '-' : ''}{fmt(Math.abs(profit))}</div>
            </div>
          </div>
          <div className="space-y-3">
            {expenseRows.map((row) => (
              <FlowRow key={row.label} label={row.label} value={row.value} total={totalExpenses} fmt={fmt} color={row.color} align="right" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const FinanceSection: React.FC<{
  ledger: ReturnType<typeof computeAnnualBudget>;
  fmt: (v: number) => string;
  cashOnHand: number;
  currentYear: number;
  starPower: ReturnType<typeof computeStarPower>;
  tycoon: TycoonState;
}> = ({ ledger, fmt, cashOnHand, currentYear, starPower, tycoon }) => {
  const [financeTab, setFinanceTab] = useState<'overview' | 'graphs' | 'spreadsheet'>('overview');
  const rows = tycoon.ledgerHistory ?? [];
  const currentRevenue = Object.values(ledger.revenue).reduce((s, v) => s + v, 0);
  const currentExpenses = Object.values(ledger.expenses).reduce((s, v) => s + v, 0);
  const chartRows = [
    ...rows,
    { ...ledger, year: currentYear, cashOnHandEnd: cashOnHand + ledger.profit },
  ].slice(-6);
  const maxCash = Math.max(1, ...chartRows.map((r) => Math.abs(r.cashOnHandEnd)));
  const maxFlow = Math.max(1, ...chartRows.flatMap((r) => [
    Object.values(r.revenue).reduce((s, v) => s + v, 0),
    Object.values(r.expenses).reduce((s, v) => s + v, 0),
  ]));
  const sponsorRows = ALL_SLOTS.map((slot) => ({
    slot,
    label: SPONSOR_SLOT_LABELS[slot],
    value: tycoon.sponsorships[slot]?.valuePerYear ?? 0,
  })).sort((a, b) => b.value - a.value);
  const maxSponsor = Math.max(1, ...sponsorRows.map((r) => r.value));
  const exportCsv = () => {
    const csv = ['Year,Revenue,Expenses,Profit,Ending Cash', ...rows.map((r) => {
      const revenue = Object.values(r.revenue).reduce((s, v) => s + v, 0);
      const expenses = Object.values(r.expenses).reduce((s, v) => s + v, 0);
      return [r.year, revenue, expenses, r.profit, r.cashOnHandEnd].join(',');
    })].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'front-office-ledger.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <SectionTitle icon={<Landmark size={22} />} title="Finances" subtitle="Track cash, revenue, expenses, and year-end risk." />
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-1 flex">
          {[
            ['overview', 'Overview'],
            ['graphs', 'Graphs'],
            ['spreadsheet', 'Spreadsheet'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFinanceTab(id as typeof financeTab)}
              className={`h-10 px-4 rounded-lg text-xs font-black uppercase tracking-widest ${financeTab === id ? 'bg-amber-400/15 text-amber-200 border border-amber-400/40' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {financeTab === 'overview' && (
        <>
          <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-5 text-sm text-sky-50">
            <div className="text-xs font-black uppercase tracking-widest text-sky-300 mb-2">European Basketball Finance</div>
            <p className="leading-relaxed">
              Year-end losses are normal in this ecosystem. Ownership, parent clubs, and sponsor support often cover competitive deficits, so the key risk is cash runway and board confidence, not forcing every club to show NBA-style profit.
            </p>
          </div>
          <BoardPromisesCard tycoon={tycoon} />
          <AnnualProjectionCard ledger={ledger} fmt={fmt} cashOnHand={cashOnHand} currentYear={currentYear} starPower={starPower} ledgerHistory={tycoon.ledgerHistory} />
          <div className="grid md:grid-cols-4 gap-3">
            <MetricTile label="Current Revenue" value={fmt(currentRevenue)} delta="Projected" tone="green" />
            <MetricTile label="Current Expenses" value={fmt(currentExpenses)} delta="Projected" tone="red" />
            <MetricTile label="Net Position" value={fmt(ledger.profit)} delta={ledger.profit >= 0 ? 'Profitable' : 'Deficit'} tone={ledger.profit >= 0 ? 'green' : 'red'} />
            <MetricTile label="Cash Runway" value={cashOnHand >= 0 ? 'Stable' : 'Critical'} delta={fmt(cashOnHand)} tone={cashOnHand >= 0 ? 'gold' : 'red'} />
          </div>
        </>
      )}

      {financeTab === 'graphs' && (
        <div className="grid xl:grid-cols-[1.2fr_1fr] gap-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5">Cash-on-Hand History</div>
            <div className="h-64 flex items-end gap-3 border-b border-slate-800 pb-4">
              {chartRows.map((row) => (
                <div key={row.year} className="flex-1 h-full flex flex-col justify-end items-center gap-2">
                  <div className={`w-full max-w-12 rounded-t ${row.cashOnHandEnd >= 0 ? 'bg-amber-300' : 'bg-rose-400'}`} style={{ height: `${Math.max(8, Math.abs(row.cashOnHandEnd) / maxCash * 100)}%` }} />
                  <div className="text-[10px] font-black text-slate-500">{row.year}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5">Revenue vs Expenses</div>
            <div className="space-y-4">
              {chartRows.map((row) => {
                const revenue = Object.values(row.revenue).reduce((s, v) => s + v, 0);
                const expenses = Object.values(row.expenses).reduce((s, v) => s + v, 0);
                return (
                  <div key={row.year}>
                    <div className="flex justify-between text-xs mb-1"><span className="font-black text-white">{row.year}</span><span className="text-slate-500">{fmt(revenue - expenses)}</span></div>
                    <div className="h-7 rounded-lg bg-slate-950 overflow-hidden border border-slate-800 flex">
                      <div className="bg-emerald-400/80" style={{ width: `${Math.max(4, revenue / maxFlow * 100)}%` }} />
                      <div className="bg-rose-400/80" style={{ width: `${Math.max(4, expenses / maxFlow * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5">Sponsorship by Slot</div>
            <div className="grid md:grid-cols-2 gap-4">
              {sponsorRows.map((row) => (
                <div key={row.slot} className="grid grid-cols-[130px_1fr_110px] items-center gap-3">
                  <div className="text-xs font-bold text-slate-300 truncate">{row.label}</div>
                  <div className="h-3 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${Math.max(3, row.value / maxSponsor * 100)}%` }} /></div>
                  <div className="text-right text-xs font-black text-white">{fmt(row.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {financeTab === 'spreadsheet' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-white">Ledger Spreadsheet</h3>
            <button
              onClick={exportCsv}
              className="text-xs font-black uppercase tracking-widest rounded-lg border border-amber-400/40 px-3 py-2 text-amber-200 hover:bg-amber-400/10"
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="text-left py-2">Year</th>
                  <th className="text-right py-2">Revenue</th>
                  <th className="text-right py-2">Expenses</th>
                  <th className="text-right py-2">Profit</th>
                  <th className="text-right py-2">Ending Cash</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-500">No closed seasons yet. The first ledger snapshot posts at year-end.</td></tr>
                ) : rows.map((row) => {
                  const revenue = Object.values(row.revenue).reduce((s, v) => s + v, 0);
                  const expenses = Object.values(row.expenses).reduce((s, v) => s + v, 0);
                  return (
                    <tr key={row.year} className="border-b border-slate-800/60">
                      <td className="py-2 font-bold text-white">{row.year}</td>
                      <td className="py-2 text-right text-emerald-300">{fmt(revenue)}</td>
                      <td className="py-2 text-right text-rose-300">{fmt(expenses)}</td>
                      <td className={`py-2 text-right font-bold ${row.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(row.profit)}</td>
                      <td className={`py-2 text-right font-bold ${row.cashOnHandEnd >= 0 ? 'text-amber-300' : 'text-rose-300'}`}>{fmt(row.cashOnHandEnd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
