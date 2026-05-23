import React from 'react';
import { ChevronDown, ChevronUp, DollarSign, ExternalLink, Minus, Ticket, TrendingDown, TrendingUp } from 'lucide-react';
import { type CapThresholds, formatSalaryM, getCapStatus } from '../../../utils/salaryUtils';
import { ARENA_HARD_CAP, estimateAttendance, formatAttendance, formatRevM } from '../../../utils/attendanceUtils';
import { formatCurrencyWithCode } from '../../../utils/helpers';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { selectCompetitionTeamTids } from '../../../services/competition/competitionScheduler';
export interface TeamEnriched {
  team: any;
  payroll: number;
  expiringCount: number;
  standardCount: number;
  twoWayCount: number;
  confRank: number;
  gbFromLeader: number;
  effectiveWins: number;
  effectiveLosses: number;
  hasInjuredStar: boolean;
  mleAvailable: number;
  mleUsed: number;
  mleLimit: number;
  mleType: string;
  tpeTotalUSD: number;
  tpeCount: number;
  strategy: any;
}
export type TabKey = 'cap' | 'trade' | 'attendance';
export type CapSortKey = 'name' | 'wins' | 'strategy' | 'status' | 'payroll' | 'mle' | 'tpe' | 'expiring' | 'roster';
export type AttSortKey = 'name' | 'wins' | 'capacity' | 'fill' | 'attendance' | 'ticket' | 'revenue';
export type SortAlign = 'left' | 'center' | 'right';
export const ROSTER_MAX = 15;
export const TWO_WAY_MAX = 3;
export const CAP_GRID =
  'grid grid-cols-[20px_minmax(140px,1.4fr)_52px_92px_80px_minmax(140px,2fr)_minmax(96px,104px)_64px_72px_44px_72px_14px] gap-3 items-center';
export const ATT_GRID =
  'grid grid-cols-[20px_minmax(140px,1.4fr)_52px_68px_minmax(140px,2fr)_minmax(80px,92px)_56px_72px_14px] gap-3 items-center';
export const ROLE_RANK: Record<string, number> = {
  heavy_buyer: 0, buyer: 1, neutral: 2, seller: 3, rebuilding: 4,
};
export const STATUS_SEVERITY: Record<string, number> = {
  under_cap: 0, over_cap: 1, over_tax: 2, over_first_apron: 3, over_second_apron: 4,
};

export const PayrollBar: React.FC<{ payroll: number; thresholds: CapThresholds; maxPayroll: number }> = ({
  payroll, thresholds, maxPayroll,
}) => {
  const status = getCapStatus(payroll, thresholds);
  const pct = Math.min((payroll / maxPayroll) * 100, 100);
  const capPct = Math.min((thresholds.salaryCap / maxPayroll) * 100, 100);
  const taxPct = Math.min((thresholds.luxuryTax / maxPayroll) * 100, 100);
  const ap1Pct = Math.min((thresholds.firstApron / maxPayroll) * 100, 100);
  return (
    <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden w-full">
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: status.barColor }} />
      <div className="absolute inset-y-0 w-px bg-sky-400/70" style={{ left: `${capPct}%` }} />
      <div className="absolute inset-y-0 w-px bg-yellow-400/70" style={{ left: `${taxPct}%` }} />
      <div className="absolute inset-y-0 w-px bg-orange-400/50" style={{ left: `${ap1Pct}%` }} />
    </div>
  );
};

export const AttendanceBar: React.FC<{ fill: number }> = ({ fill }) => {
  const pct = Math.min(fill * 100, 100);
  const color = fill >= 0.9 ? '#34d399' : fill >= 0.75 ? '#60a5fa' : fill >= 0.6 ? '#facc15' : '#f87171';
  return (
    <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden w-full">
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
};

export const CapRow: React.FC<{
  d: TeamEnriched;
  thresholds: CapThresholds;
  maxPayroll: number;
  rank: number;
  isOwn: boolean;
  onClick: () => void;
}> = ({ d, thresholds, maxPayroll, rank, isOwn, onClick }) => {
  const { team, payroll, expiringCount, effectiveWins, effectiveLosses, mleAvailable, mleType } = d;
  const status = getCapStatus(payroll, thresholds);
  const outlook = d.hasInjuredStar && !d.strategy.manualStatus
    ? { ...d.strategy.outlook, label: 'Injured Star', color: 'text-amber-300', bgColor: 'bg-amber-500/10' }
    : { ...d.strategy.outlook, label: d.strategy.label };
  const capSpace = thresholds.salaryCap - payroll;
  const taxOver = payroll - thresholds.luxuryTax;

  return (
    <div
      className={`${CAP_GRID} px-4 py-2.5 cursor-pointer transition-colors border-b border-slate-800/40 last:border-0 group ${
        isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-slate-800/30'
      }`}
      onClick={onClick}
    >
      <span className="text-[10px] font-mono text-slate-500 text-right">{rank}</span>
      <div className="flex items-center gap-2 min-w-0">
        <img src={team.logoUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-black text-white uppercase tracking-tight leading-none flex items-center gap-1">
            <span>{team.abbrev}</span>
            {isOwn && <span className="text-[7px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1 py-0.5 rounded border border-indigo-500/40 shrink-0">You</span>}
          </div>
          <div className="text-[9px] text-slate-400 truncate">{team.name}</div>
        </div>
      </div>
      <div className="text-[10px] font-bold text-slate-300 text-center tabular-nums">{effectiveWins}–{effectiveLosses}</div>
      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md text-center truncate ${outlook.bgColor} ${outlook.color}`}>
        {outlook.label}
      </span>
      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md text-center truncate ${status.bgColor} ${status.color}`}>
        {status.label}
      </span>
      <div className="min-w-0">
        <PayrollBar payroll={payroll} thresholds={thresholds} maxPayroll={maxPayroll} />
      </div>
      <div className="text-right min-w-0">
        <div className="text-sm font-black text-white leading-none tabular-nums">{formatSalaryM(payroll)}</div>
        <div className={`text-[9px] font-bold leading-none mt-0.5 tabular-nums ${capSpace >= 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
          {capSpace >= 0 ? `+${formatSalaryM(capSpace)}` : taxOver > 0 ? <span className="text-yellow-400">{formatSalaryM(taxOver)} tax</span> : `${formatSalaryM(Math.abs(capSpace))} over`}
        </div>
      </div>
      <div className="text-right">
        {mleAvailable > 0 ? (
          <>
            <div className="text-[10px] font-bold text-cyan-400 tabular-nums">{formatSalaryM(mleAvailable)}</div>
            <div className="text-[8px] text-slate-500">{mleType} MLE</div>
            {d.mleUsed > 0 && <div className="text-[8px] text-amber-400/70 tabular-nums">{formatSalaryM(d.mleUsed)} used</div>}
          </>
        ) : (
          <div className="text-[10px] text-slate-600">—</div>
        )}
      </div>
      <div className="text-right">
        {d.tpeTotalUSD > 0 ? (
          <>
            <div className="text-[10px] font-bold text-emerald-400 tabular-nums">{formatSalaryM(d.tpeTotalUSD)}</div>
            <div className="text-[8px] text-slate-500">{d.tpeCount} active</div>
          </>
        ) : (
          <div className="text-[10px] text-slate-600">—</div>
        )}
      </div>
      <div className="text-[10px] text-right tabular-nums">
        {expiringCount > 0 ? <span className="text-amber-400 font-bold">{expiringCount}</span> : <span className="text-slate-600">—</span>}
      </div>
      <div className="text-right leading-none">
        <div className="text-[10px] font-bold tabular-nums">
          <span className={d.standardCount >= ROSTER_MAX ? 'text-emerald-400' : d.standardCount < 13 ? 'text-amber-400' : 'text-slate-200'}>{d.standardCount}</span>
          <span className="text-slate-600">/{ROSTER_MAX}</span>
        </div>
        <div className="text-[9px] font-bold tabular-nums mt-0.5">
          <span className={d.twoWayCount >= TWO_WAY_MAX ? 'text-cyan-400' : 'text-slate-400'}>{d.twoWayCount}</span>
          <span className="text-slate-600">/{TWO_WAY_MAX} 2W</span>
        </div>
      </div>
      <ExternalLink size={10} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
    </div>
  );
};

export const AttRow: React.FC<{ d: TeamEnriched; rank: number; isOwn: boolean; onClick: () => void }> = ({ d, rank, isOwn, onClick }) => {
  const { team, effectiveWins, effectiveLosses } = d;
  const att = estimateAttendance(team);
  const fillPct = (att.fillRate * 100).toFixed(1);
  const fillColor = att.fillRate >= 0.9 ? 'text-emerald-400' : att.fillRate >= 0.75 ? 'text-sky-400' : att.fillRate >= 0.6 ? 'text-yellow-400' : 'text-rose-400';

  return (
    <div
      className={`${ATT_GRID} px-4 py-2.5 cursor-pointer transition-colors border-b border-slate-800/40 last:border-0 group ${
        isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-slate-800/30'
      }`}
      onClick={onClick}
    >
      <span className="text-[10px] font-mono text-slate-600 text-right">{rank}</span>
      <div className="flex items-center gap-2 min-w-0">
        <img src={team.logoUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-black text-white uppercase tracking-tight leading-none flex items-center gap-1">
            <span>{team.abbrev}</span>
            {isOwn && <span className="text-[7px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1 py-0.5 rounded border border-indigo-500/40 shrink-0">You</span>}
          </div>
          <div className="text-[9px] text-slate-500 truncate">{team.name}</div>
        </div>
      </div>
      <div className="text-[10px] font-bold text-slate-300 text-center tabular-nums">{effectiveWins}–{effectiveLosses}</div>
      <div className="text-[10px] text-slate-400 text-right tabular-nums">{formatAttendance(att.arenaCapacity)}</div>
      <div className="min-w-0">
        <AttendanceBar fill={att.fillRate} />
      </div>
      <div className="text-right">
        <div className="text-sm font-black text-white leading-none tabular-nums">{formatAttendance(att.avgAttendance)}</div>
        <div className={`text-[9px] font-bold leading-none mt-0.5 tabular-nums ${fillColor}`}>{fillPct}%</div>
      </div>
      <div className="text-[10px] text-slate-400 text-right tabular-nums">${att.avgTicketPrice}</div>
      <div className="text-[10px] font-bold text-emerald-400 text-right tabular-nums">{formatRevM(att.seasonRevenue)}</div>
      <ExternalLink size={10} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
    </div>
  );
};

export const TradeCard: React.FC<{
  d: TeamEnriched;
  thresholds: CapThresholds;
  isOwn: boolean;
  onClick: () => void;
}> = ({ d, thresholds, isOwn, onClick }) => {
  const { team, payroll, expiringCount, effectiveWins, effectiveLosses } = d;
  const outlook = d.hasInjuredStar && !d.strategy.manualStatus
    ? { ...d.strategy.outlook, label: 'Injured Star', color: 'text-amber-300', bgColor: 'bg-amber-500/10' }
    : { ...d.strategy.outlook, label: d.strategy.label };
  const capSpace = thresholds.salaryCap - payroll;
  const taxOver = payroll - thresholds.luxuryTax;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group ${
        isOwn
          ? 'bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/40 ring-1 ring-inset ring-indigo-500/30'
          : 'border border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-800/40'
      }`}
      onClick={onClick}
    >
      <img src={team.logoUrl} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-white uppercase tracking-tight">{team.abbrev}</span>
          {isOwn && <span className="text-[7px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1 py-0.5 rounded border border-indigo-500/40">You</span>}
          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${outlook.bgColor} ${outlook.color}`}>{outlook.label}</span>
        </div>
        <div className="text-[9px] text-slate-400 mt-0.5 tabular-nums">{effectiveWins}–{effectiveLosses}</div>
      </div>
      <div className="text-right flex-shrink-0">
        {capSpace > 0 ? (
          <div className="text-[10px] font-bold text-emerald-400 tabular-nums">+{formatSalaryM(capSpace)}</div>
        ) : taxOver > 0 ? (
          <div className="text-[10px] font-bold text-yellow-400 tabular-nums">{formatSalaryM(taxOver)} tax</div>
        ) : (
          <div className="text-[10px] font-bold text-slate-400 tabular-nums">{formatSalaryM(Math.abs(capSpace))} over</div>
        )}
        {expiringCount > 0 && <div className="text-[9px] text-amber-400">{expiringCount} exp</div>}
      </div>
      <ExternalLink size={9} className="text-slate-700 group-hover:text-slate-500 transition-colors flex-shrink-0" />
    </div>
  );
};

export const LeagueFinancesEuroView: React.FC<{
  state: any;
  ownTid: number | null;
  navigateToTeamFinances: (teamId: number) => void;
}> = ({ state, ownTid, navigateToTeamFinances }) => {
  const fmt = (value: number) => formatCurrencyWithCode(value, state.leagueStats?.currency ?? 'EUR', false);
  const domesticSpec = state.activeCompetitions?.find((spec: any) => spec.id === 'endesa');
  const activeTeams = (domesticSpec ? selectCompetitionTeamTids(domesticSpec, state as any) : [])
    .map((tid: number) => resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []))
    .filter((team: any) => team !== null);
  const rows = activeTeams.map((team: any) => {
    const raw = (state.nonNBATeams ?? []).find((nonNBA: any) => nonNBA.tid === team.id) as any;
    const tycoon = raw?.tycoon ?? (team as any).tycoon;
    const payroll = state.players
      .filter((player: any) => player.tid === team.id && (player as any).status !== 'Retired')
      .reduce((sum: number, player: any) => sum + (Number(player.contract?.amount ?? 0) * 1000), 0);
    const sponsorship = tycoon
      ? (Object.values(tycoon.sponsorships ?? {}) as any[]).reduce((sum: number, sponsorshipSlot: any) => sum + Number(sponsorshipSlot?.valuePerYear ?? 0), 0)
      : 0;
    const latestLedger = tycoon?.ledgerHistory?.[tycoon.ledgerHistory.length - 1];
    const profit = Number(latestLedger?.profit ?? Math.round(sponsorship - payroll));
    const budgetTier = tycoon?.tier ?? '—';
    const elAppearances = (((state as any).competitionHistory?.euroleague ?? []) as any[])
      .slice(-3)
      .filter((entry: any) => [
        ...(entry?.standings ?? []).map((row: any) => row.tid),
        ...(entry?.quarterfinalistTids ?? []),
        ...(entry?.semifinalistTids ?? []),
        entry?.runnerUpTid,
        entry?.championTid,
      ].includes(team.id))
      .length;
    return { team, payroll, sponsorship, profit, budgetTier, elAppearances };
  }).sort((a, b) => b.sponsorship - a.sponsorship || b.payroll - a.payroll);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-black uppercase tracking-tight">League Finances</h1>
        <p className="text-sm text-slate-500 mb-6">Euro budget overview for active domestic clubs.</p>
        <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/70">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-[10px] uppercase tracking-widest text-slate-500">
              <tr><th className="px-4 py-3 text-left">#</th><th className="px-4 py-3 text-left">Club</th><th>Budget Tier</th><th>Wage Bill</th><th>Sponsorship</th><th>EL 3yr</th><th>Profit Projection</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.team.id} onClick={() => navigateToTeamFinances(row.team.id)} className={row.team.id === ownTid ? 'border-t border-amber-500/30 bg-amber-500/10 cursor-pointer' : 'border-t border-slate-900 hover:bg-slate-900 cursor-pointer'}>
                  <td className="px-4 py-3 text-slate-500 font-black">{index + 1}</td>
                  <td className="px-4 py-3 font-bold">{getTeamFullName(row.team)}</td>
                  <td className="text-center">{row.budgetTier}</td>
                  <td className="text-center">{fmt(row.payroll)}</td>
                  <td className="text-center">{fmt(row.sponsorship)}</td>
                  <td className="text-center">{row.elAppearances}</td>
                  <td className="text-center text-emerald-300 font-bold">{fmt(row.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const CapSortHeader: React.FC<{
  capSort: CapSortKey;
  capDir: 'desc' | 'asc';
  col: CapSortKey;
  label: string;
  align?: SortAlign;
  onToggle: (col: CapSortKey) => void;
}> = ({ capSort, capDir, col, label, align = 'left', onToggle }) => {
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  const active = capSort === col;
  return (
    <button onClick={() => onToggle(col)} className={`flex items-center gap-0.5 hover:text-white transition-colors ${justify} ${active ? 'text-white' : ''}`}>
      <span className="truncate">{label}</span>
      {active && (capDir === 'desc' ? <ChevronDown size={9} className="flex-shrink-0" /> : <ChevronUp size={9} className="flex-shrink-0" />)}
    </button>
  );
};

export const AttSortHeader: React.FC<{
  attSort: AttSortKey;
  attDir: 'desc' | 'asc';
  col: AttSortKey;
  label: string;
  align?: SortAlign;
  onToggle: (col: AttSortKey) => void;
}> = ({ attSort, attDir, col, label, align = 'left', onToggle }) => {
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  const active = attSort === col;
  return (
    <button onClick={() => onToggle(col)} className={`flex items-center gap-0.5 hover:text-white transition-colors ${justify} ${active ? 'text-white' : ''}`}>
      <span className="truncate">{label}</span>
      {active && (attDir === 'desc' ? <ChevronDown size={9} className="flex-shrink-0" /> : <ChevronUp size={9} className="flex-shrink-0" />)}
    </button>
  );
};

export const LeagueFinancesHeader: React.FC<{
  seasonYear: number;
  thresholds: CapThresholds;
  avgPayroll: number;
  overTaxCount: number;
  underCapCount: number;
}> = ({ seasonYear, thresholds, avgPayroll, overTaxCount, underCapCount }) => (
  <div className="flex-shrink-0 border-b border-slate-800/50 p-5">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
        <DollarSign size={16} className="text-emerald-400" />
      </div>
      <div>
        <h1 className="text-lg font-black text-white tracking-tight">Team Finances</h1>
        <p className="text-[10px] text-slate-400">{seasonYear}–{seasonYear + 1} · All 30 Teams · Click any row for full breakdown</p>
      </div>
    </div>
    <div className="grid grid-cols-4 gap-2.5">
      <div className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-700/30">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Salary Cap</div>
        <div className="text-base font-black text-sky-400">{formatSalaryM(thresholds.salaryCap)}</div>
      </div>
      <div className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-700/30">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Luxury Tax</div>
        <div className="text-base font-black text-yellow-400">{formatSalaryM(thresholds.luxuryTax)}</div>
      </div>
      <div className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-700/30">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Avg Payroll</div>
        <div className="text-base font-black text-white">{formatSalaryM(avgPayroll)}</div>
      </div>
      <div className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-700/30">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Tax Payers</div>
        <div className="text-base font-black text-rose-400">{overTaxCount}<span className="text-xs text-slate-500 font-normal"> / 30</span></div>
      </div>
    </div>
    <div className="flex flex-wrap gap-3 mt-3 text-[9px] text-slate-300">
      <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-sky-400 inline-block" /> Cap {formatSalaryM(thresholds.salaryCap)}</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-yellow-400 inline-block" /> Tax {formatSalaryM(thresholds.luxuryTax)}</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-orange-400 inline-block" /> 1st Apron {formatSalaryM(thresholds.firstApron)}</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-rose-400 inline-block" /> 2nd Apron {formatSalaryM(thresholds.secondApron)}</span>
      <span className="ml-auto">{underCapCount} teams under cap</span>
    </div>
  </div>
);

export const TradeBoardTab: React.FC<{
  buyers: TeamEnriched[];
  sellers: TeamEnriched[];
  neutrals: TeamEnriched[];
  thresholds: CapThresholds;
  ownTid: number | null;
  navigateToTeamFinances: (teamId: number) => void;
}> = ({ buyers, sellers, neutrals, thresholds, ownTid, navigateToTeamFinances }) => (
  <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={13} className="text-emerald-400" />
          <span className="text-xs font-black text-white uppercase tracking-wider">Buyers</span>
          <span className="text-[9px] text-slate-300 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded-full ml-1">{buyers.length} teams</span>
          <span className="text-[9px] text-slate-400 ml-auto">Contenders with room to add</span>
        </div>
        <div className="space-y-1.5">
          {buyers.length === 0 ? <div className="text-[10px] text-slate-400 italic text-center py-4">No teams currently qualify</div> : buyers.map(d => (
            <TradeCard key={d.team.id} d={d} thresholds={thresholds} isOwn={ownTid !== null && d.team.id === ownTid} onClick={() => navigateToTeamFinances(d.team.id)} />
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={13} className="text-rose-400" />
          <span className="text-xs font-black text-white uppercase tracking-wider">Sellers / Rebuilding</span>
          <span className="text-[9px] text-slate-300 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded-full ml-1">{sellers.length} teams</span>
          <span className="text-[9px] text-slate-400 ml-auto">Moving assets or shedding salary</span>
        </div>
        <div className="space-y-1.5">
          {sellers.length === 0 ? <div className="text-[10px] text-slate-400 italic text-center py-4">No teams currently qualify</div> : sellers.map(d => (
            <TradeCard key={d.team.id} d={d} thresholds={thresholds} isOwn={ownTid !== null && d.team.id === ownTid} onClick={() => navigateToTeamFinances(d.team.id)} />
          ))}
        </div>
      </div>
      {neutrals.length > 0 && (
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Minus size={13} className="text-slate-400" />
            <span className="text-xs font-black text-white uppercase tracking-wider">Neutral</span>
            <span className="text-[9px] text-slate-300 font-bold bg-slate-700/40 px-1.5 py-0.5 rounded-full ml-1">{neutrals.length} teams</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {neutrals.map(d => (
              <TradeCard key={d.team.id} d={d} thresholds={thresholds} isOwn={ownTid !== null && d.team.id === ownTid} onClick={() => navigateToTeamFinances(d.team.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
);

export const AttendanceTab: React.FC<{
  attTotals: { totalRev: number; avgFill: number; avgAtt: number; soldOut: number };
  attSorted: TeamEnriched[];
  attSort: AttSortKey;
  attDir: 'desc' | 'asc';
  ownTid: number | null;
  navigateToTeamFinances: (teamId: number) => void;
  onToggleAtt: (col: AttSortKey) => void;
}> = ({ attTotals, attSorted, attSort, attDir, ownTid, navigateToTeamFinances, onToggleAtt }) => (
  <>
    <div className="flex-shrink-0 border-b border-slate-800/40 bg-[#161616] px-4 py-2.5">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Total Gate Rev</div>
          <div className="text-sm font-black text-emerald-400">{formatRevM(attTotals.totalRev)}</div>
        </div>
        <div>
          <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Avg Attendance</div>
          <div className="text-sm font-black text-white">{formatAttendance(attTotals.avgAtt)}</div>
        </div>
        <div>
          <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Avg Fill Rate</div>
          <div className="text-sm font-black text-sky-400">{(attTotals.avgFill * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Sold Out</div>
          <div className="text-sm font-black text-slate-200">{attTotals.soldOut}<span className="text-xs text-slate-500 font-normal"> / 30</span></div>
        </div>
      </div>
    </div>
    <div className="flex-1 overflow-auto custom-scrollbar">
      <div className="min-w-[780px]">
        <div className={`${ATT_GRID} sticky top-0 z-10 border-b border-slate-800/40 bg-[#161616] px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest`}>
          <span className="text-right">#</span>
          <AttSortHeader attSort={attSort} attDir={attDir} col="name" label="Team" onToggle={onToggleAtt} />
          <AttSortHeader attSort={attSort} attDir={attDir} col="wins" label="W-L" align="center" onToggle={onToggleAtt} />
          <AttSortHeader attSort={attSort} attDir={attDir} col="capacity" label="Capacity" align="right" onToggle={onToggleAtt} />
          <AttSortHeader attSort={attSort} attDir={attDir} col="fill" label="Fill Rate" onToggle={onToggleAtt} />
          <AttSortHeader attSort={attSort} attDir={attDir} col="attendance" label="Avg Att" align="right" onToggle={onToggleAtt} />
          <AttSortHeader attSort={attSort} attDir={attDir} col="ticket" label="$/Tkt" align="right" onToggle={onToggleAtt} />
          <AttSortHeader attSort={attSort} attDir={attDir} col="revenue" label="Revenue" align="right" onToggle={onToggleAtt} />
          <span />
        </div>
        {attSorted.map((d, i) => (
          <AttRow key={d.team.id} d={d} rank={i + 1} isOwn={ownTid !== null && d.team.id === ownTid} onClick={() => navigateToTeamFinances(d.team.id)} />
        ))}
      </div>
    </div>
  </>
);

export const areAttendanceSoldOut = (avgAttendance: number) => avgAttendance >= ARENA_HARD_CAP * 0.97;
