import React, { useState } from 'react';
import { BarChart3, Landmark, Table2, TrendingDown, TrendingUp } from 'lucide-react';
import { computeAnnualBudget } from '../../../../../services/tycoon/budgetEngine';
import { computeStarPower } from '../../../../../services/tycoon/starPower';
import { ALL_SLOTS, type SponsorshipSlot, type TycoonState } from '../../../../../types/tycoon';
import { SectionTitle } from '../shared/helpers';
import { getClubFinanceSnapshot } from '../../../../../services/tycoon/clubFinance';
import { RevenueLedgerBreakdown } from '../../../../tycoon/RevenueLedgerBreakdown';
import { normalizeDate } from '../../../../../utils/helpers';
import { useGame } from '../../../../../store/GameContext';
import { usePlayerQuickActions } from '../../../../../hooks/usePlayerQuickActions';
import { convertUSDToExternalCurrency } from '../../../../../constants';
import { isOnRoster } from '../../../../../utils/teamLookup';
import { displayStaffRole } from '../../../../../services/staff/staffCareerRows';

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

const SummaryMetric: React.FC<{
  label: string;
  value: string;
  detail: string;
  tone: 'emerald' | 'rose' | 'amber' | 'slate';
}> = ({ label, value, detail, tone }) => {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : tone === 'amber' ? 'text-amber-300' : 'text-slate-200';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-black tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
};

const Breakdown: React.FC<{
  title: string;
  total: number;
  rows: Array<{ label: string; value: number }>;
  fmt: (value: number) => string;
  tone: 'emerald' | 'rose';
}> = ({ title, total, rows, fmt, tone }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</div>
      <div className={`text-base font-black tabular-nums ${tone === 'emerald' ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(total)}</div>
    </div>
    <div className="mt-3 space-y-3">
      {[...rows].sort((a, b) => b.value - a.value).map(row => {
        const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
        return (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-400">{row.label}</span>
              <span className="font-bold tabular-nums text-slate-200">{fmt(row.value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full rounded-full ${tone === 'emerald' ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${row.value > 0 ? Math.max(2, pct) : 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const PayrollDrilldown: React.FC<{
  playerContracts: Array<{ id: string; name: string; annualEUR: number; contractEnd?: number }>;
  staffContracts: Array<{ id: string; name: string; role: string; annualEUR: number; yearsLeft: number }>;
  annualPlayerPayroll: number;
  annualStaffPayroll: number;
  paidPlayerPayroll: number;
  paidStaffPayroll: number;
  nextPayday: string;
  currentDate: string;
  fmt: (value: number) => string;
  onOpenPlayer: (playerId: string) => void;
}> = ({
  playerContracts,
  staffContracts,
  annualPlayerPayroll,
  annualStaffPayroll,
  paidPlayerPayroll,
  paidStaffPayroll,
  nextPayday,
  currentDate,
  fmt,
  onOpenPlayer,
}) => {
  const paydayOverdue = nextPayday < currentDate;
  const contractList = (
    rows: Array<{ id: string; primary: string; secondary: string; annualEUR: number; player?: boolean }>,
  ) => rows.length === 0
    ? <div className="px-4 py-5 text-center text-xs text-slate-500">No current contracts.</div>
    : (
      <div className="max-h-72 divide-y divide-slate-800/70 overflow-y-auto">
        {rows.map(row => (
          <button
            key={row.id}
            type="button"
            onClick={() => row.player && onOpenPlayer(row.id)}
            disabled={!row.player}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left enabled:hover:bg-slate-800/40"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-white">{row.primary}</span>
              <span className="block truncate text-[10px] text-slate-500">{row.secondary}</span>
            </span>
            <span className="shrink-0 text-sm font-black tabular-nums text-slate-200">{fmt(row.annualEUR)}<span className="ml-1 text-[9px] font-bold text-slate-600">/yr</span></span>
          </button>
        ))}
      </div>
    );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-black text-white">Club payroll</h3>
          <p className="mt-1 text-xs text-slate-500">Current senior-player and Staff contracts in one place.</p>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Annual total</div>
          <div className="mt-1 text-xl font-black tabular-nums text-amber-200">{fmt(annualPlayerPayroll + annualStaffPayroll)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryMetric label="Player Contracts" value={fmt(annualPlayerPayroll)} detail={`${playerContracts.length} senior contracts`} tone="slate" />
        <SummaryMetric label="Staff Contracts" value={fmt(annualStaffPayroll)} detail={`${staffContracts.length} Staff contracts`} tone="slate" />
        <SummaryMetric label="Paid This Season" value={fmt(paidPlayerPayroll + paidStaffPayroll)} detail={`Players ${fmt(paidPlayerPayroll)} · Staff ${fmt(paidStaffPayroll)}`} tone="rose" />
        <SummaryMetric label="Next Payday" value={nextPayday} detail={paydayOverdue ? 'Payroll is overdue' : 'Bi-weekly payroll'} tone={paydayOverdue ? 'rose' : 'amber'} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <details className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-300">
            Player contracts · {playerContracts.length}
          </summary>
          {contractList(playerContracts.map(contract => ({
            id: contract.id,
            primary: contract.name,
            secondary: contract.contractEnd ? `Through ${contract.contractEnd}` : 'Current contract',
            annualEUR: contract.annualEUR,
            player: true,
          })))}
        </details>
        <details className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-300">
            Staff contracts · {staffContracts.length}
          </summary>
          {contractList(staffContracts.map(contract => ({
            id: contract.id,
            primary: contract.name,
            secondary: `${displayStaffRole(contract.role)} · ${contract.yearsLeft} ${contract.yearsLeft === 1 ? 'year' : 'years'} left`,
            annualEUR: contract.annualEUR,
          })))}
        </details>
      </div>
    </div>
  );
};

export const AnnualProjectionCard: React.FC<{
  ledger: ReturnType<typeof computeAnnualBudget>;
  fmt: (value: number) => string;
  cashOnHand: number;
  currentYear: number;
  starPower: ReturnType<typeof computeStarPower>;
  ledgerHistory?: ReturnType<typeof computeAnnualBudget>[];
  onOpenPlayer?: (playerId: string) => void;
}> = ({ ledger, fmt, cashOnHand, currentYear, starPower, ledgerHistory, onOpenPlayer }) => {
  const revenueRows = [
    { label: 'Matchday', value: ledger.revenue.matchday },
    { label: 'Club Shop & Media', value: ledger.revenue.commercial ?? 0 },
    { label: 'Sponsorships', value: ledger.revenue.sponsorship },
    { label: 'TV Rights', value: ledger.revenue.tv },
    { label: 'Prize Money', value: ledger.revenue.prize },
    { label: 'Player Sales & Loan Fees', value: ledger.revenue.transfer },
  ];
  const expenseRows = [
    { label: 'Player Wages', value: ledger.expenses.wages },
    { label: 'Staff', value: ledger.expenses.staff },
    { label: 'Facility Operations', value: ledger.expenses.facility },
    { label: 'Scouting & Analytics', value: ledger.expenses.scouting ?? 0 },
    { label: 'Travel', value: ledger.expenses.travel },
    { label: 'Medical', value: ledger.expenses.medical ?? 0 },
    { label: 'Academy', value: ledger.expenses.academy ?? 0 },
    { label: 'Transfer Fees', value: ledger.expenses.transfer ?? 0 },
    { label: 'Finance Costs', value: ledger.expenses.financeCosts },
  ];
  const totalRevenue = revenueRows.reduce((sum, row) => sum + row.value, 0);
  const totalExpenses = expenseRows.reduce((sum, row) => sum + row.value, 0);
  const profit = totalRevenue - totalExpenses;
  const cashEnd = ledger.cashOnHandEnd;
  const previous = ledgerHistory?.[ledgerHistory.length - 1] ?? null;
  const previousProfit = previous?.profit ?? null;
  const runway = cashEnd < 0 ? 'Critical' : profit < 0 ? 'Ownership support needed' : 'Stable';
  const primaryDriver = [...expenseRows].sort((a, b) => b.value - a.value)[0];
  const starLabel = starPower.boost >= 0.6 && starPower.stars[0]
    ? `${starPower.stars[0]} is strengthening commercial demand.`
    : null;

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 sm:p-5 ${cashEnd >= 0 ? 'border-emerald-400/25 bg-emerald-400/[0.05]' : 'border-rose-400/30 bg-rose-400/[0.06]'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
              {profit >= 0 ? <TrendingUp size={15} className="text-emerald-300" /> : <TrendingDown size={15} className="text-rose-300" />}
              Season {currentYear}-{String(currentYear + 1).slice(-2)} projection
            </div>
            <div className={`mt-2 text-3xl font-black tabular-nums ${profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{profit < 0 ? '-' : ''}{fmt(Math.abs(profit))}</div>
            <div className="mt-1 text-sm text-slate-400">{profit >= 0 ? 'Projected operating profit' : 'Projected operating deficit'} · {runway}</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 sm:text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Year-end cash</div>
            <div className={`mt-1 text-2xl font-black tabular-nums ${cashEnd >= 0 ? 'text-amber-300' : 'text-rose-300'}`}>{cashEnd < 0 ? '-' : ''}{fmt(Math.abs(cashEnd))}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Revenue" value={fmt(totalRevenue)} detail="Projected this season" tone="emerald" />
        <SummaryMetric label="Expenses" value={fmt(totalExpenses)} detail={`Largest: ${primaryDriver.label}`} tone="rose" />
        <SummaryMetric label="Current Cash" value={fmt(cashOnHand)} detail="Available now" tone="amber" />
        <SummaryMetric label="Last Season" value={previousProfit === null ? 'No ledger' : fmt(previousProfit)} detail="Closed operating result" tone={previousProfit !== null && previousProfit < 0 ? 'rose' : 'slate'} />
      </div>

      {starLabel && <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-sm text-amber-100">{starLabel}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <RevenueLedgerBreakdown ledger={ledger} fmt={fmt} title="Revenue drivers" className="mt-0" onOpenPlayer={onOpenPlayer} />
        </div>
        <Breakdown title="Cost drivers" total={totalExpenses} rows={expenseRows} fmt={fmt} tone="rose" />
      </div>
    </div>
  );
};

export const FinanceSection: React.FC<{
  ledger: ReturnType<typeof computeAnnualBudget>;
  fmt: (value: number) => string;
  cashOnHand: number;
  currentYear: number;
  currentDate: string;
  starPower: ReturnType<typeof computeStarPower>;
  tycoon: TycoonState;
}> = ({ ledger, fmt, cashOnHand, currentYear, currentDate, starPower, tycoon }) => {
  const { state } = useGame();
  const quick = usePlayerQuickActions();
  const [financeTab, setFinanceTab] = useState<'overview' | 'graphs' | 'spreadsheet'>('overview');
  const rows = tycoon.ledgerHistory ?? [];
  const chartRows = [...rows, { ...ledger, year: currentYear, cashOnHandEnd: ledger.cashOnHandEnd }].slice(-6);
  const maxCash = Math.max(1, ...chartRows.map(row => Math.abs(row.cashOnHandEnd)));
  const maxFlow = Math.max(1, ...chartRows.flatMap(row => [
    Object.values(row.revenue).reduce((sum, value) => sum + value, 0),
    Object.values(row.expenses).reduce((sum, value) => sum + (value ?? 0), 0),
  ]));
  const sponsorRows = ALL_SLOTS.map(slot => ({
    slot,
    label: SPONSOR_SLOT_LABELS[slot],
    value: tycoon.sponsorships?.[slot]?.valuePerYear ?? 0,
  })).sort((a, b) => b.value - a.value);
  const maxSponsor = Math.max(1, ...sponsorRows.map(row => row.value));
  const snapshot = getClubFinanceSnapshot(tycoon, currentDate, ledger.cashOnHandEnd);
  const transactions = [...(tycoon.transactions ?? [])].sort((left, right) => (
    right.date.localeCompare(left.date) || right.id.localeCompare(left.id)
  ));
  const playerContracts = state.players
    .filter(player => player.tid === state.userTeamId && isOnRoster(player))
    .map(player => ({
      id: player.internalId,
      name: player.name,
      annualEUR: Math.round(convertUSDToExternalCurrency((player.contract?.amount ?? 0) * 1_000, 'Euroleague')),
      contractEnd: player.contract?.exp,
    }))
    .sort((left, right) => right.annualEUR - left.annualEUR || left.name.localeCompare(right.name));
  const staffContracts = (tycoon.staffMembers ?? [])
    .map(member => ({
      id: member.id,
      name: member.name,
      role: member.role,
      annualEUR: Math.round(member.salary),
      yearsLeft: Math.max(0, Math.round(member.contractYears)),
    }))
    .sort((left, right) => right.annualEUR - left.annualEUR || left.name.localeCompare(right.name));
  const paidPlayerPayroll = transactions
    .filter(transaction => (
      transaction.season === currentYear
      && transaction.category === 'wages'
      && transaction.sourceId.startsWith('payroll:players:')
      && transaction.amountEUR < 0
    ))
    .reduce((sum, transaction) => sum + Math.abs(transaction.amountEUR), 0);
  const paidStaffPayroll = transactions
    .filter(transaction => (
      transaction.season === currentYear
      && transaction.category === 'staff'
      && transaction.sourceId.startsWith('payroll:staff:')
      && transaction.amountEUR < 0
    ))
    .reduce((sum, transaction) => sum + Math.abs(transaction.amountEUR), 0);
  const currentDateKey = normalizeDate(currentDate);
  const nextPayday = normalizeDate(tycoon.pendingFinanceRecap?.nextPayday ?? (() => {
    const anchor = new Date(`${normalizeDate(tycoon.lastTycoonPayslipDate ?? currentDate)}T00:00:00Z`);
    anchor.setUTCDate(anchor.getUTCDate() + 14);
    return anchor.toISOString().slice(0, 10);
  })());
  const dueCutoff = new Date(`${currentDateKey}T00:00:00Z`);
  dueCutoff.setUTCDate(dueCutoff.getUTCDate() + 30);
  const dueCutoffKey = dueCutoff.toISOString().slice(0, 10);
  const upcomingObligations = (tycoon.commitments ?? [])
    .filter(commitment => commitment.status === 'scheduled' && commitment.amountEUR < 0 && normalizeDate(commitment.dueDate) <= dueCutoffKey)
    .sort((left, right) => normalizeDate(left.dueDate).localeCompare(normalizeDate(right.dueDate)) || left.id.localeCompare(right.id));
  const openPlayer = (playerId: string) => {
    const player = state.players.find(candidate => String(candidate.internalId) === String(playerId));
    if (player) quick.openBio(player);
  };
  if (quick.fullPageView) return quick.fullPageView;

  const seasonRows = [
    ...rows.filter(row => row.year !== currentYear).map(row => ({ ...row, current: false })),
    { ...ledger, year: currentYear, current: true },
  ].sort((a, b) => b.year - a.year);

  const exportCsv = () => {
    const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const csv = ['Date,Category,Description,Money In,Money Out,Balance', ...transactions.map(transaction => [
      transaction.date,
      transaction.category,
      transaction.label,
      transaction.amountEUR > 0 ? transaction.amountEUR : '',
      transaction.amountEUR < 0 ? Math.abs(transaction.amountEUR) : '',
      transaction.balanceAfterEUR,
    ].map(csvCell).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `club-statement-${currentYear}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const tabs: Array<{
    id: typeof financeTab;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
  }> = [
    { id: 'overview', label: 'Overview', icon: Landmark },
    { id: 'graphs', label: 'History', icon: BarChart3 },
    { id: 'spreadsheet', label: 'Ledger', icon: Table2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <SectionTitle icon={<Landmark size={22} />} title="Finances" subtitle="See the club's position first, then open the supporting detail you need." />
        <div className="flex overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70 p-1 scrollbar-hide">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFinanceTab(id)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-xs font-black uppercase tracking-widest ${financeTab === id ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200' : 'text-slate-400 hover:text-white'}`}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      </div>

      {financeTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <SummaryMetric label="Cash" value={fmt(snapshot.cashOnHandEUR)} detail="Bank balance" tone="amber" />
            <SummaryMetric label="Reserved" value={fmt(snapshot.reservedEUR)} detail="Active offers" tone="slate" />
            <SummaryMetric label="Due in 30 Days" value={fmt(snapshot.dueIn30DaysEUR)} detail="Scheduled payments" tone={snapshot.dueIn30DaysEUR > snapshot.availableEUR ? 'rose' : 'slate'} />
            <SummaryMetric label="Available" value={fmt(snapshot.availableEUR)} detail="Cash after reservations" tone={snapshot.availableEUR >= 0 ? 'emerald' : 'rose'} />
            <SummaryMetric label="Runway" value={snapshot.runwayMonths >= 99 ? 'Stable' : `${snapshot.runwayMonths.toFixed(1)} mo`} detail={`${snapshot.status} position`} tone={snapshot.status === 'healthy' ? 'emerald' : snapshot.status === 'critical' ? 'rose' : 'amber'} />
            <SummaryMetric label="Annual Payroll" value={fmt(ledger.expenses.wages + ledger.expenses.staff)} detail={`Players ${fmt(ledger.expenses.wages)} · Staff ${fmt(ledger.expenses.staff)}`} tone="slate" />
          </div>
          {upcomingObligations.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-black text-white">Payments due within 30 days</h3><p className="mt-1 text-xs text-slate-500">Scheduled items do not reduce Cash until their due date.</p></div><span className="shrink-0 text-sm font-black tabular-nums text-rose-300">{fmt(snapshot.dueIn30DaysEUR)}</span></div>
              <div className="divide-y divide-slate-800/70">{upcomingObligations.map(commitment => {
                const dueDate = normalizeDate(commitment.dueDate);
                return <div key={commitment.id} className="grid grid-cols-[1fr_auto] gap-3 py-3 sm:grid-cols-[110px_120px_1fr_auto]"><span className={`text-xs font-bold ${dueDate < currentDateKey ? 'text-rose-300' : 'text-slate-400'}`}>{dueDate < currentDateKey ? `Overdue · ${dueDate}` : dueDate}</span><span className="hidden text-[10px] font-black uppercase tracking-widest text-slate-500 sm:block">{commitment.category}</span><span className="min-w-0 truncate text-sm font-bold text-white">{commitment.label}</span><span className="text-right text-sm font-black tabular-nums text-rose-300">{fmt(Math.abs(commitment.amountEUR))}</span></div>;
              })}</div>
            </div>
          )}
          <PayrollDrilldown
            playerContracts={playerContracts}
            staffContracts={staffContracts}
            annualPlayerPayroll={ledger.expenses.wages}
            annualStaffPayroll={ledger.expenses.staff}
            paidPlayerPayroll={paidPlayerPayroll}
            paidStaffPayroll={paidStaffPayroll}
            nextPayday={nextPayday}
            currentDate={currentDateKey}
            fmt={fmt}
            onOpenPlayer={openPlayer}
          />
          <AnnualProjectionCard ledger={ledger} fmt={fmt} cashOnHand={cashOnHand} currentYear={currentYear} starPower={starPower} ledgerHistory={tycoon.ledgerHistory} onOpenPlayer={openPlayer} />
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.05] px-4 py-3 text-xs leading-5 text-slate-400">
            European clubs may operate at a planned deficit. Year-end cash determines whether that strategy remains sustainable.
          </div>
        </>
      )}

      {financeTab === 'graphs' && (
        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-5 text-xs font-black uppercase tracking-widest text-slate-400">Cash history</div>
            <div className="flex h-64 items-end gap-3 border-b border-slate-800 pb-4">
              {chartRows.map(row => (
                <div key={row.year} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div className={`w-full max-w-12 rounded-t ${row.cashOnHandEnd >= 0 ? 'bg-amber-300' : 'bg-rose-400'}`} style={{ height: `${Math.max(8, Math.abs(row.cashOnHandEnd) / maxCash * 100)}%` }} />
                  <div className="text-[10px] font-black text-slate-500">{row.year}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-5 text-xs font-black uppercase tracking-widest text-slate-400">Revenue vs expenses</div>
            <div className="space-y-4">
              {chartRows.map(row => {
                const revenue = Object.values(row.revenue).reduce((sum, value) => sum + value, 0);
                const expenses = Object.values(row.expenses).reduce((sum, value) => sum + (value ?? 0), 0);
                return (
                  <div key={row.year}>
                    <div className="mb-1 flex justify-between text-xs"><span className="font-black text-white">{row.year}</span><span className="text-slate-500">{fmt(revenue - expenses)}</span></div>
                    <div className="flex h-7 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                      <div className="bg-emerald-400/80" style={{ width: `${Math.max(4, revenue / maxFlow * 100)}%` }} />
                      <div className="bg-rose-400/80" style={{ width: `${Math.max(4, expenses / maxFlow * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 xl:col-span-2">
            <div className="mb-5 text-xs font-black uppercase tracking-widest text-slate-400">Sponsorship by slot</div>
            <div className="grid gap-4 md:grid-cols-2">
              {sponsorRows.map(row => (
                <div key={row.slot} className="grid grid-cols-[minmax(90px,130px)_1fr_auto] items-center gap-3">
                  <div className="truncate text-xs font-bold text-slate-300">{row.label}</div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-violet-400" style={{ width: `${Math.max(3, row.value / maxSponsor * 100)}%` }} /></div>
                  <div className="text-right text-xs font-black text-white">{fmt(row.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {financeTab === 'spreadsheet' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h3 className="font-black text-white">Club bank statement</h3><p className="mt-1 text-xs text-slate-500">Every posted receipt and payment with its running balance.</p></div>
              <button type="button" onClick={exportCsv} disabled={transactions.length === 0} className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-black uppercase tracking-widest text-amber-200 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40">Export CSV</button>
            </div>
            <div className="space-y-3 md:hidden">
              {transactions.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">No club transactions posted yet.</div> : transactions.map(transaction => (
                <div key={transaction.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{transaction.date} · {transaction.category}</div><div className="mt-1 text-sm font-bold text-white">{transaction.label}</div></div><div className={`shrink-0 font-black tabular-nums ${transaction.amountEUR >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{transaction.amountEUR >= 0 ? '+' : '-'}{fmt(Math.abs(transaction.amountEUR))}</div></div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-xs"><span className="text-slate-500">Balance after</span><span className="font-black tabular-nums text-amber-200">{fmt(transaction.balanceAfterEUR)}</span></div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-widest text-slate-500"><tr className="border-b border-slate-800"><th className="py-2 text-left">Date</th><th className="py-2 text-left">Category</th><th className="py-2 text-left">Description</th><th className="py-2 text-right">Money In</th><th className="py-2 text-right">Money Out</th><th className="py-2 text-right">Balance</th></tr></thead>
                <tbody>{transactions.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-slate-500">No club transactions posted yet.</td></tr> : transactions.map(transaction => <tr key={transaction.id} className="border-b border-slate-800/60"><td className="whitespace-nowrap py-2 text-slate-400">{transaction.date}</td><td className="py-2 pr-3 text-xs font-black uppercase tracking-wider text-slate-500">{transaction.category}</td><td className="py-2 pr-4 font-bold text-white">{transaction.label}</td><td className="py-2 text-right font-bold tabular-nums text-emerald-300">{transaction.amountEUR > 0 ? fmt(transaction.amountEUR) : '—'}</td><td className="py-2 text-right font-bold tabular-nums text-rose-300">{transaction.amountEUR < 0 ? fmt(Math.abs(transaction.amountEUR)) : '—'}</td><td className="py-2 text-right font-black tabular-nums text-amber-200">{fmt(transaction.balanceAfterEUR)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
            <h3 className="mb-4 font-black text-white">Season ledger</h3>
            <div className="space-y-3 md:hidden">{seasonRows.map(row => {
              const revenue = Object.values(row.revenue).reduce((sum, value) => sum + value, 0);
              const expenses = Object.values(row.expenses).reduce((sum, value) => sum + (value ?? 0), 0);
              return <div key={`${row.year}-${row.current}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex items-center justify-between"><span className="font-black text-white">{row.year} {row.current && <span className="ml-1 text-[10px] uppercase text-amber-300">Current projection</span>}</span><span className={`font-black ${row.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(row.profit)}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span className="text-emerald-300">{fmt(revenue)}</span><span className="text-center text-rose-300">{fmt(expenses)}</span><span className="text-right text-amber-300">{fmt(row.cashOnHandEnd)}</span></div></div>;
            })}</div>
            <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead className="text-xs uppercase tracking-widest text-slate-500"><tr className="border-b border-slate-800"><th className="py-2 text-left">Year</th><th className="py-2 text-left">Status</th><th className="py-2 text-right">Revenue</th><th className="py-2 text-right">Expenses</th><th className="py-2 text-right">Profit</th><th className="py-2 text-right">Ending Cash</th></tr></thead><tbody>{seasonRows.map(row => {
              const revenue = Object.values(row.revenue).reduce((sum, value) => sum + value, 0);
              const expenses = Object.values(row.expenses).reduce((sum, value) => sum + (value ?? 0), 0);
              return <tr key={`${row.year}-${row.current}`} className="border-b border-slate-800/60"><td className="py-2 font-bold text-white">{row.year}</td><td className="py-2 text-xs font-black uppercase tracking-wider text-slate-500">{row.current ? 'Current projection' : 'Closed'}</td><td className="py-2 text-right text-emerald-300">{fmt(revenue)}</td><td className="py-2 text-right text-rose-300">{fmt(expenses)}</td><td className={`py-2 text-right font-bold ${row.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(row.profit)}</td><td className={`py-2 text-right font-bold ${row.cashOnHandEnd >= 0 ? 'text-amber-300' : 'text-rose-300'}`}>{fmt(row.cashOnHandEnd)}</td></tr>;
            })}</tbody></table></div>
          </div>
        </div>
      )}
    </div>
  );
};
