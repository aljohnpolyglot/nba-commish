import React, { useMemo, useState } from 'react';
import type { GameState, NBAPlayer } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { formatLeagueSeasonLabel } from '../../services/leagueCalendar';
import {
  buildLeagueFinanceRow,
  getFinanceTeamId,
  getFinanceTeamLogo,
  type FinanceRow,
  type FinanceTeamLike,
} from './leagueFinanceModel';

export type { FinanceTeamLike } from './leagueFinanceModel';

type FinanceSortKey =
  | 'team'
  | 'cashOnHand'
  | 'projectedCash'
  | 'matchday'
  | 'sponsorship'
  | 'tv'
  | 'otherRevenue'
  | 'totalRev'
  | 'profit'
  | 'wages'
  | 'staff'
  | 'facility'
  | 'scouting'
  | 'travel'
  | 'medical'
  | 'academy'
  | 'transferFees'
  | 'financeCosts'
  | 'totalExp'
  | 'wageRevPct'
  | 'health';

const HEALTH_STYLES: Record<FinanceRow['health']['tone'], { dot: string; text: string; bg: string }> = {
  pending:   { dot: 'bg-sky-400',     text: 'text-sky-300',     bg: 'bg-sky-500/10' },
  excellent: { dot: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-500/10' },
  good:      { dot: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  stable:    { dot: 'bg-yellow-400',  text: 'text-yellow-400',  bg: 'bg-yellow-500/10' },
  risk:      { dot: 'bg-orange-400',  text: 'text-orange-400',  bg: 'bg-orange-500/10' },
  critical:  { dot: 'bg-rose-500',    text: 'text-rose-400',    bg: 'bg-rose-500/10' },
};

function fmtMoney(value: number, symbol: string): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${sign}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)         return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`;
  if (abs === 0)            return `${symbol}0`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

// Conic-gradient donut. Slices in the order given.
const Donut: React.FC<{
  slices: Array<{ value: number; color: string }>;
  size?: number;
}> = ({ slices, size = 96 }) => {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  let acc = 0;
  const stops = total > 0
    ? slices.map(s => {
        const start = (acc / total) * 360;
        acc += Math.max(0, s.value);
        const end = (acc / total) * 360;
        return `${s.color} ${start}deg ${end}deg`;
      }).join(', ')
    : '#1e293b 0deg 360deg';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full"
        style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
      />
      <div
        className="absolute rounded-full bg-[#0f1218]"
        style={{ inset: size * 0.18 }}
      />
    </div>
  );
};

const SummaryCard: React.FC<{
  title: string;
  total: number;
  totalColor: string;
  symbol: string;
  slices: Array<{ label: string; value: number; color: string }>;
  pending?: boolean;
}> = ({ title, total, totalColor, symbol, slices, pending = false }) => (
  <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</span>
      <span className="text-lg font-black tabular-nums" style={{ color: totalColor }}>
        {pending ? 'Pending' : fmtMoney(total, symbol)}
      </span>
    </div>
    <div className="flex items-center gap-4">
      <Donut slices={slices.map(s => ({ value: s.value, color: s.color }))} />
      <div className="flex-1 min-w-0 space-y-1.5">
        {slices.map(s => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <div key={s.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-slate-400 flex-1 truncate">{s.label}</span>
              <span className="font-bold text-slate-200 tabular-nums">{fmtMoney(s.value, symbol)}</span>
              <span className="text-slate-500 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export interface LeagueFinancesPanelProps {
  teams: FinanceTeamLike[];
  players: NBAPlayer[];
  /** Display name shown in the panel header — e.g. "Liga Endesa (ACB)". */
  displayName: string;
  /** Short tag shown in the scope chip — e.g. "Liga ACB". */
  shortName: string;
  /** Currency symbol for all money cells. */
  currencySymbol: string;
  /** Converts internally stored USD player contracts into the displayed local currency. */
  contractCurrencyRate?: number;
  seasonYear: number;
  state?: GameState;
  onSelectTeam?: (teamId: number) => void;
}

export const LeagueFinancesPanel: React.FC<LeagueFinancesPanelProps> = ({
  teams, players, displayName, shortName, currencySymbol: symbol, contractCurrencyRate = 1, seasonYear, state, onSelectTeam,
}) => {
  const [sortKey, setSortKey] = useState<FinanceSortKey>('profit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const healthRank = useMemo(
    () => ({ pending: 5, excellent: 4, good: 3, stable: 2, risk: 1, critical: 0 } as const),
    [],
  );
  const handleSort = (nextKey: FinanceSortKey) => {
    if (sortKey === nextKey) {
      setSortDir(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === 'team' || nextKey === 'health' ? 'asc' : 'desc');
  };
  const rows = useMemo(
    () => teams
      .map(team => buildLeagueFinanceRow(team, players, state, contractCurrencyRate))
      .sort((a, b) => {
        let comparison = 0;
        switch (sortKey) {
          case 'team':
            comparison = getTeamFullName(a.team).localeCompare(getTeamFullName(b.team));
            break;
          case 'health':
            comparison = healthRank[a.health.tone] - healthRank[b.health.tone]
              || a.health.label.localeCompare(b.health.label);
            break;
          default:
            comparison = (a[sortKey] as number) - (b[sortKey] as number);
            break;
        }
        if (comparison === 0) comparison = a.team.name.localeCompare(b.team.name);
        return sortDir === 'asc' ? comparison : -comparison;
      }),
    [teams, players, state, contractCurrencyRate, sortKey, sortDir, healthRank],
  );

  const totals = useMemo(() => {
    const r = rows.reduce(
      (acc, row) => {
        acc.matchday    += row.matchday;
        acc.sponsorship += row.sponsorship;
        acc.tv          += row.tv;
        acc.otherRevenue += row.otherRevenue;
        acc.wages       += row.wages;
        acc.staff       += row.staff;
        acc.facility    += row.facility;
        acc.scouting    += row.scouting;
        acc.travel      += row.travel;
        acc.medical     += row.medical;
        acc.academy     += row.academy;
        acc.transferFees += row.transferFees;
        acc.financeCosts += row.financeCosts;
        acc.profit      += row.profit;
        if (row.profit > 0) acc.profitableTeams += 1;
        return acc;
      },
      { matchday: 0, sponsorship: 0, tv: 0, otherRevenue: 0, wages: 0, staff: 0, facility: 0, scouting: 0, travel: 0, medical: 0, academy: 0, transferFees: 0, financeCosts: 0, profit: 0, profitableTeams: 0 },
    );
    const totalRev = r.matchday + r.sponsorship + r.tv + r.otherRevenue;
    const totalExp = r.wages + r.staff + r.facility + r.scouting + r.travel + r.medical + r.academy + r.transferFees + r.financeCosts;
    const avgProfit = rows.length ? r.profit / rows.length : 0;
    return { ...r, totalRev, totalExp, avgProfit };
  }, [rows]);

  const revenueSlices = [
    { label: 'Matchday Revenue', value: totals.matchday,    color: '#3b82f6' },
    { label: 'Sponsorships',     value: totals.sponsorship, color: '#22c55e' },
    { label: 'TV Rights',        value: totals.tv,          color: '#a855f7' },
    { label: 'Commercial, Prize & Transfer Income', value: totals.otherRevenue, color: '#14b8a6' },
  ];
  const pendingRevenue = rows.some(row => row.pending.matchday || row.pending.sponsorship || row.pending.tv);
  const pendingExpense = rows.some(row => row.pending.travel);
  const pendingProfit = rows.some(row => row.pending.profit);
  const valueOrPending = (row: FinanceRow, key: keyof FinanceRow['pending'], value: number) => (
    row.pending[key] ? <span className="font-bold text-sky-300">Pending</span> : fmtMoney(value, symbol)
  );
  const expenseSlices = [
    { label: 'Wages',        value: totals.wages,    color: '#ef4444' },
    { label: 'Staff',        value: totals.staff,    color: '#f97316' },
    { label: 'Facility Ops', value: totals.facility, color: '#eab308' },
    { label: 'Scouting',     value: totals.scouting, color: '#84cc16' },
    { label: 'Travel',       value: totals.travel,   color: '#06b6d4' },
    { label: 'Medical',      value: totals.medical,  color: '#a855f7' },
    { label: 'Youth Academy', value: totals.academy, color: '#10b981' },
    { label: 'Transfer Fees', value: totals.transferFees, color: '#fb7185' },
    { label: 'Finance Costs', value: totals.financeCosts, color: '#f43f5e' },
  ];
  const healthLegend = [
    { tone: 'excellent', label: 'Excellent' },
    { tone: 'good', label: 'Good' },
    { tone: 'stable', label: 'Stable' },
    { tone: 'risk', label: 'At Risk' },
    { tone: 'critical', label: 'Critical' },
  ] as const;
  const ownTid = state?.userTeamId == null ? null : Number(state.userTeamId);
  const SortHeader: React.FC<{
    label: string;
    sort: FinanceSortKey;
    align?: 'left' | 'center' | 'right';
    className?: string;
  }> = ({ label, sort, align = 'right', className = '' }) => {
    const active = sortKey === sort;
    return (
      <button
        type="button"
        onClick={() => handleSort(sort)}
        className={`inline-flex items-center gap-1 font-bold hover:text-slate-300 transition-colors ${
          align === 'left' ? 'justify-start' : align === 'center' ? 'justify-center' : 'justify-end'
        } w-full ${className}`}
      >
        <span>{label}</span>
        <span className={`${active ? 'text-slate-300' : 'text-slate-700'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black uppercase italic tracking-tight text-white">League Finances</h2>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            {displayName} · {formatLeagueSeasonLabel(seasonYear, state?.leagueStats)} season
          </p>
        </div>
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
          {teams.length} clubs · scope: {shortName}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SummaryCard
          title="Money in"
          total={totals.totalRev}
          totalColor="#34d399"
          symbol={symbol}
          slices={revenueSlices}
          pending={pendingRevenue}
        />
        <SummaryCard
          title="Money out"
          total={totals.totalExp}
          totalColor="#f87171"
          symbol={symbol}
          slices={expenseSlices}
          pending={pendingExpense}
        />
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Projected League Profit</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-500 mt-3">Total</span>
          <span className={`text-3xl font-black tabular-nums mt-0.5 ${totals.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pendingProfit ? 'Pending' : fmtMoney(totals.profit, symbol)}
          </span>
          <div className="grid grid-cols-2 gap-3 mt-auto pt-4">
            <div className="bg-black/30 rounded-lg px-3 py-2 border border-white/5">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Avg Profit / Team</div>
              <div className={`text-sm font-black tabular-nums ${totals.avgProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {pendingProfit ? 'Pending' : fmtMoney(totals.avgProfit, symbol)}
              </div>
            </div>
            <div className="bg-black/30 rounded-lg px-3 py-2 border border-white/5">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Profitable Teams</div>
              <div className="text-sm font-black tabular-nums text-emerald-300">
                {totals.profitableTeams}<span className="text-slate-500 font-normal"> / {rows.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row, index) => {
          const style = HEALTH_STYLES[row.health.tone];
          const logo = getFinanceTeamLogo(row.team);
          const isOwn = ownTid !== null && getFinanceTeamId(row.team) === ownTid;
          return (
            <button type="button" key={getFinanceTeamId(row.team)} onClick={() => onSelectTeam?.(getFinanceTeamId(row.team))} className={`w-full rounded-2xl border p-4 text-left ${isOwn ? 'border-amber-400/50 bg-amber-400/[0.08] shadow-[0_0_0_1px_rgba(251,191,36,0.08)]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-center gap-3">
                <span className="w-5 text-xs font-black text-slate-500">{index + 1}</span>
                {logo && <img src={logo} alt="" className="h-9 w-9 shrink-0 object-contain" referrerPolicy="no-referrer" />}
                <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><div className="truncate text-sm font-black text-white">{getTeamFullName(row.team)}</div>{isOwn && <span className="shrink-0 rounded bg-amber-400/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-200">Your club</span>}</div><span className={`mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[9px] font-black uppercase ${style.bg} ${style.text}`}><span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />{row.health.label}</span></div>
                <div className={`text-right text-sm font-black ${row.pending.profit ? 'text-sky-300' : row.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{valueOrPending(row, 'profit', row.profit)}</div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-3 text-xs">
                <div><div className="text-[9px] font-black uppercase text-slate-600">Current Cash</div><div className="mt-1 font-black text-amber-200">{row.cashAvailable ? fmtMoney(row.cashOnHand, symbol) : '—'}</div></div>
                <div><div className="text-[9px] font-black uppercase text-slate-600">Year-End Cash</div><div className={`mt-1 font-black ${row.cashAvailable && row.projectedCash < 0 ? 'text-rose-300' : 'text-amber-200'}`}>{row.cashAvailable ? fmtMoney(row.projectedCash, symbol) : '—'}</div></div>
              </div>
              <div className="mt-3 border-t border-white/5 pt-3 text-xs">
                <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-emerald-400">Money In</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Matchday</div><div className="mt-1 text-slate-300">{valueOrPending(row, 'matchday', row.matchday)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Sponsors</div><div className="mt-1 text-slate-300">{valueOrPending(row, 'sponsorship', row.sponsorship)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">TV Rights</div><div className="mt-1 text-slate-300">{valueOrPending(row, 'tv', row.tv)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Commercial, Prize & Transfer Income</div><div className="mt-1 text-slate-300">{fmtMoney(row.otherRevenue, symbol)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Total Revenue</div><div className="mt-1 font-black text-emerald-300">{fmtMoney(row.totalRev, symbol)}</div></div>
                </div>
                <div className="mb-2 mt-4 text-[9px] font-black uppercase tracking-widest text-rose-400">Money Out</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Player Wages</div><div className="mt-1 text-slate-300">{fmtMoney(row.wages, symbol)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Staff</div><div className="mt-1 text-slate-300">{fmtMoney(row.staff, symbol)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Facility</div><div className="mt-1 text-slate-300">{fmtMoney(row.facility, symbol)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Scouting</div><div className="mt-1 text-slate-300">{fmtMoney(row.scouting, symbol)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Travel</div><div className="mt-1 text-slate-300">{valueOrPending(row, 'travel', row.travel)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Medical</div><div className="mt-1 text-slate-300">{fmtMoney(row.medical, symbol)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Academy</div><div className="mt-1 text-slate-300">{fmtMoney(row.academy, symbol)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Transfer Fees</div><div className="mt-1 text-slate-300">{fmtMoney(row.transferFees, symbol)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Finance Costs</div><div className="mt-1 text-slate-300">{fmtMoney(row.financeCosts, symbol)}</div></div>
                  <div><div className="text-[9px] font-black uppercase text-slate-600">Total Expenses</div><div className="mt-1 font-black text-rose-300">{fmtMoney(row.totalExp, symbol)}</div></div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1480px] text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                <th rowSpan={2} className="px-3 py-2 text-left font-bold">#</th>
                <th rowSpan={2} className="px-3 py-2 text-left font-bold">
                  <SortHeader label="Team" sort="team" align="left" />
                </th>
                <th rowSpan={2} className="px-3 py-2 text-right font-bold border-l border-white/5"><SortHeader label="Current Cash" sort="cashOnHand" /></th>
                <th rowSpan={2} className="px-3 py-2 text-right font-bold"><SortHeader label="Year-End Cash" sort="projectedCash" /></th>
                <th colSpan={5} className="px-3 py-2 text-center font-bold border-l border-white/5">Money In</th>
                <th rowSpan={2} className="px-3 py-2 text-right font-bold border-l border-white/5">
                  <SortHeader label="Projected Profit" sort="profit" />
                </th>
                <th colSpan={10} className="px-3 py-2 text-center font-bold border-l border-white/5">Money Out</th>
                <th rowSpan={2} className="px-3 py-2 text-right font-bold border-l border-white/5">
                  <SortHeader label="Wage / Rev" sort="wageRevPct" />
                </th>
                <th rowSpan={2} className="px-3 py-2 text-center font-bold border-l border-white/5">
                  <SortHeader label="Outlook" sort="health" align="center" />
                </th>
              </tr>
              <tr className="text-[9px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                <th className="px-2 py-2 text-right font-bold border-l border-white/5"><SortHeader label="Matchday" sort="matchday" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Sponsors" sort="sponsorship" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="TV Rights" sort="tv" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Commercial, Prize & Transfer Income" sort="otherRevenue" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Total Rev" sort="totalRev" /></th>
                <th className="px-2 py-2 text-right font-bold border-l border-white/5"><SortHeader label="Wages" sort="wages" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Staff" sort="staff" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Facility" sort="facility" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Scouting" sort="scouting" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Travel" sort="travel" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Medical" sort="medical" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Academy" sort="academy" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Transfers" sort="transferFees" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Finance" sort="financeCosts" /></th>
                <th className="px-2 py-2 text-right font-bold"><SortHeader label="Total Exp" sort="totalExp" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, idx) => {
                const style = HEALTH_STYLES[row.health.tone];
                const wageColor =
                  row.wageRevPct > 100 ? 'text-rose-400'   :
                  row.wageRevPct > 70  ? 'text-orange-400' :
                  row.wageRevPct > 55  ? 'text-yellow-300' :
                                          'text-slate-300';
                const logo = getFinanceTeamLogo(row.team);
                const isOwn = ownTid !== null && getFinanceTeamId(row.team) === ownTid;
                return (
                  <tr key={getFinanceTeamId(row.team)} onClick={() => onSelectTeam?.(getFinanceTeamId(row.team))} className={`transition-colors ${isOwn ? 'bg-amber-400/[0.09] hover:bg-amber-400/[0.13]' : 'hover:bg-white/[0.04]'} ${onSelectTeam ? 'cursor-pointer' : ''}`}>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-500 font-black">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {logo && (
                          <div className="w-6 h-6 rounded bg-white/95 p-0.5 shrink-0">
                            <img
                              src={logo}
                              alt=""
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        )}
                        <span className={`font-bold truncate ${isOwn ? 'text-amber-100' : 'text-slate-200'}`}>
                          {getTeamFullName(row.team)}
                        </span>
                        {isOwn && <span className="shrink-0 rounded bg-amber-400/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-200">Your club</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-200 border-l border-white/5">{row.cashAvailable ? fmtMoney(row.cashOnHand, symbol) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-bold tabular-nums ${row.cashAvailable && row.projectedCash < 0 ? 'text-rose-300' : 'text-amber-200'}`}>{row.cashAvailable ? fmtMoney(row.projectedCash, symbol) : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300 border-l border-white/5">{valueOrPending(row, 'matchday', row.matchday)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300">{valueOrPending(row, 'sponsorship', row.sponsorship)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300">{valueOrPending(row, 'tv', row.tv)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300">{fmtMoney(row.otherRevenue, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-300">{fmtMoney(row.totalRev, symbol)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-black border-l border-white/5 ${row.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {valueOrPending(row, 'profit', row.profit)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300 border-l border-white/5">{fmtMoney(row.wages, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{fmtMoney(row.staff, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{fmtMoney(row.facility, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{fmtMoney(row.scouting, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{valueOrPending(row, 'travel', row.travel)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{fmtMoney(row.medical, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-300/80">{fmtMoney(row.academy, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-rose-300/80">{fmtMoney(row.transferFees, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-rose-300/80">{fmtMoney(row.financeCosts, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-rose-300">{fmtMoney(row.totalExp, symbol)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-bold border-l border-white/5 ${wageColor}`}>
                      {row.pending.profit ? '—' : `${row.wageRevPct.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-2 border-l border-white/5">
                      <span className={`flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {row.health.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={22} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No clubs loaded for {shortName} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-4 px-4 py-2.5 border-t border-white/5 text-[10px] font-bold uppercase tracking-widest">
          {healthLegend.map(({ tone, label }) => {
            const s = HEALTH_STYLES[tone];
            return (
            <span key={tone} className={`flex items-center gap-1.5 ${s.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {label}
            </span>
          )})}
        </div>
      </div>
    </div>
  );
};
