import React, { useMemo, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import {
  DollarSign, ChevronDown, ChevronUp, ExternalLink,
  TrendingUp, TrendingDown, Minus, Ticket,
} from 'lucide-react';
import {
  getCapThresholds, getCapStatus, formatSalaryM, contractToUSD,
  getTradeOutlook, effectiveRecord, topNAvgK2, CapThresholds,
  getMLEAvailability, resolveManualOutlook, type TradeOutlook,
} from '../../../utils/salaryUtils';
import {
  estimateAttendance, formatAttendance, formatRevM, ARENA_HARD_CAP,
} from '../../../utils/attendanceUtils';
import { getOwnTeamId } from '../../../utils/helpers';

// ─── types ────────────────────────────────────────────────────────────────
interface TeamEnriched {
  team: any;
  payroll: number;
  expiringCount: number;
  standardCount: number; // active non-two-way (fills the 15-man roster)
  twoWayCount: number;   // two-way contracts (max 3)
  confRank: number;
  gbFromLeader: number;
  effectiveWins: number;
  effectiveLosses: number;
  topThreeAvgK2: number;
  hasInjuredStar: boolean;
  mleAvailable: number;
  mleUsed: number;
  mleLimit: number;
  mleType: string; // 'Room' | 'Tax' | 'NT' | '—'
  manualOutlook?: TradeOutlook; // GM-mode manual override, if set
}

const ROSTER_MAX = 15;
const TWO_WAY_MAX = 3;

// ─── bars ─────────────────────────────────────────────────────────────────
const PayrollBar: React.FC<{ payroll: number; thresholds: CapThresholds; maxPayroll: number }> = ({
  payroll, thresholds, maxPayroll,
}) => {
  const status = getCapStatus(payroll, thresholds);
  const pct    = Math.min((payroll / maxPayroll) * 100, 100);
  const capPct = Math.min((thresholds.salaryCap / maxPayroll) * 100, 100);
  const taxPct = Math.min((thresholds.luxuryTax / maxPayroll) * 100, 100);
  const ap1Pct = Math.min((thresholds.firstApron  / maxPayroll) * 100, 100);
  return (
    <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden w-full">
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: status.barColor }} />
      <div className="absolute inset-y-0 w-px bg-sky-400/70"    style={{ left: `${capPct}%` }} />
      <div className="absolute inset-y-0 w-px bg-yellow-400/70" style={{ left: `${taxPct}%` }} />
      <div className="absolute inset-y-0 w-px bg-orange-400/50" style={{ left: `${ap1Pct}%` }} />
    </div>
  );
};

const AttendanceBar: React.FC<{ fill: number }> = ({ fill }) => {
  const pct = Math.min(fill * 100, 100);
  const color = fill >= 0.9 ? '#34d399' : fill >= 0.75 ? '#60a5fa' : fill >= 0.6 ? '#facc15' : '#f87171';
  return (
    <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden w-full">
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
};

// ─── shared grid templates (header & rows use the SAME string) ────────────
// cols: rank | team | W-L | strategy | status | bar | payroll | MLE | exp | roster | ext
const CAP_GRID =
  'grid grid-cols-[20px_minmax(140px,1.4fr)_52px_92px_80px_minmax(140px,2fr)_minmax(96px,104px)_64px_44px_72px_14px] gap-3 items-center';

// cols: rank | team | W-L | capacity | bar | avg att | $/tkt | revenue | ext
const ATT_GRID =
  'grid grid-cols-[20px_minmax(140px,1.4fr)_52px_68px_minmax(140px,2fr)_minmax(80px,92px)_56px_72px_14px] gap-3 items-center';

const ROLE_RANK: Record<string, number> = {
  heavy_buyer: 0, buyer: 1, neutral: 2, seller: 3, rebuilding: 4,
};

const STATUS_SEVERITY: Record<string, number> = {
  under_cap: 0, over_cap: 1, over_tax: 2, over_first_apron: 3, over_second_apron: 4,
};

// ─── Cap row ─────────────────────────────────────────────────────────────
const CapRow: React.FC<{
  d: TeamEnriched; thresholds: CapThresholds; maxPayroll: number;
  rank: number; isOwn: boolean; onClick: () => void;
}> = ({ d, thresholds, maxPayroll, rank, isOwn, onClick }) => {
  const { team, payroll, expiringCount, effectiveWins, effectiveLosses, mleAvailable, mleType } = d;
  const status      = getCapStatus(payroll, thresholds);
  const baseOutlook = d.manualOutlook ?? getTradeOutlook(payroll, effectiveWins, effectiveLosses, expiringCount, thresholds, d.confRank, d.gbFromLeader, d.topThreeAvgK2);
  const outlook     = d.hasInjuredStar && !d.manualOutlook
    ? { ...baseOutlook, label: 'Injured Star', color: 'text-amber-300', bgColor: 'bg-amber-500/10' }
    : baseOutlook;
  const capSpace = thresholds.salaryCap - payroll;
  const taxOver  = payroll - thresholds.luxuryTax;

  return (
    <div
      className={`${CAP_GRID} px-4 py-2.5 cursor-pointer transition-colors border-b border-slate-800/40 last:border-0 group ${
        isOwn
          ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40'
          : 'hover:bg-slate-800/30'
      }`}
      onClick={onClick}
    >
      {/* rank */}
      <span className="text-[10px] font-mono text-slate-500 text-right">{rank}</span>

      {/* team */}
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

      {/* W-L */}
      <div className="text-[10px] font-bold text-slate-300 text-center tabular-nums">
        {effectiveWins}–{effectiveLosses}
      </div>

      {/* strategy */}
      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md text-center truncate ${outlook.bgColor} ${outlook.color}`}>
        {outlook.label}
      </span>

      {/* status */}
      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md text-center truncate ${status.bgColor} ${status.color}`}>
        {status.label}
      </span>

      {/* bar */}
      <div className="min-w-0">
        <PayrollBar payroll={payroll} thresholds={thresholds} maxPayroll={maxPayroll} />
      </div>

      {/* payroll + space/tax */}
      <div className="text-right min-w-0">
        <div className="text-sm font-black text-white leading-none tabular-nums">{formatSalaryM(payroll)}</div>
        <div className={`text-[9px] font-bold leading-none mt-0.5 tabular-nums ${capSpace >= 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
          {capSpace >= 0
            ? `+${formatSalaryM(capSpace)}`
            : taxOver > 0
              ? <span className="text-yellow-400">{formatSalaryM(taxOver)} tax</span>
              : `${formatSalaryM(Math.abs(capSpace))} over`
          }
        </div>
      </div>

      {/* MLE */}
      <div className="text-right">
        {mleAvailable > 0 ? (
          <>
            <div className="text-[10px] font-bold text-cyan-400 tabular-nums">{formatSalaryM(mleAvailable)}</div>
            <div className="text-[8px] text-slate-500">{mleType} MLE</div>
            {d.mleUsed > 0 && (
              <div className="text-[8px] text-amber-400/70 tabular-nums">{formatSalaryM(d.mleUsed)} used</div>
            )}
          </>
        ) : (
          <div className="text-[10px] text-slate-600">—</div>
        )}
      </div>

      {/* expiring */}
      <div className="text-[10px] text-right tabular-nums">
        {expiringCount > 0
          ? <span className="text-amber-400 font-bold">{expiringCount}</span>
          : <span className="text-slate-600">—</span>
        }
      </div>

      {/* roster: standard / two-way */}
      <div className="text-right leading-none">
        <div className="text-[10px] font-bold tabular-nums">
          <span className={d.standardCount >= ROSTER_MAX ? 'text-emerald-400' : d.standardCount < 13 ? 'text-amber-400' : 'text-slate-200'}>
            {d.standardCount}
          </span>
          <span className="text-slate-600">/{ROSTER_MAX}</span>
        </div>
        <div className="text-[9px] font-bold tabular-nums mt-0.5">
          <span className={d.twoWayCount >= TWO_WAY_MAX ? 'text-cyan-400' : 'text-slate-400'}>
            {d.twoWayCount}
          </span>
          <span className="text-slate-600">/{TWO_WAY_MAX} 2W</span>
        </div>
      </div>

      <ExternalLink size={10} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
    </div>
  );
};

// ─── Attendance row ──────────────────────────────────────────────────────
const AttRow: React.FC<{ d: TeamEnriched; rank: number; isOwn: boolean; onClick: () => void }> = ({ d, rank, isOwn, onClick }) => {
  const { team, effectiveWins, effectiveLosses } = d;
  const att = estimateAttendance(team);
  const fillPct = (att.fillRate * 100).toFixed(1);
  const fillColor = att.fillRate >= 0.9 ? 'text-emerald-400' : att.fillRate >= 0.75 ? 'text-sky-400' : att.fillRate >= 0.6 ? 'text-yellow-400' : 'text-rose-400';

  return (
    <div
      className={`${ATT_GRID} px-4 py-2.5 cursor-pointer transition-colors border-b border-slate-800/40 last:border-0 group ${
        isOwn
          ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40'
          : 'hover:bg-slate-800/30'
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

      <div className="text-[10px] font-bold text-slate-300 text-center tabular-nums">
        {effectiveWins}–{effectiveLosses}
      </div>

      <div className="text-[10px] text-slate-400 text-right tabular-nums">
        {formatAttendance(att.arenaCapacity)}
      </div>

      <div className="min-w-0">
        <AttendanceBar fill={att.fillRate} />
      </div>

      <div className="text-right">
        <div className="text-sm font-black text-white leading-none tabular-nums">{formatAttendance(att.avgAttendance)}</div>
        <div className={`text-[9px] font-bold leading-none mt-0.5 tabular-nums ${fillColor}`}>{fillPct}%</div>
      </div>

      <div className="text-[10px] text-slate-400 text-right tabular-nums">${att.avgTicketPrice}</div>

      <div className="text-[10px] font-bold text-emerald-400 text-right tabular-nums">
        {formatRevM(att.seasonRevenue)}
      </div>

      <ExternalLink size={10} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
    </div>
  );
};

// ─── Trade Board card ────────────────────────────────────────────────────
const TradeCard: React.FC<{
  d: TeamEnriched; thresholds: CapThresholds; isOwn: boolean; onClick: () => void;
}> = ({ d, thresholds, isOwn, onClick }) => {
  const { team, payroll, expiringCount, effectiveWins, effectiveLosses } = d;
  const baseOutlook = d.manualOutlook ?? getTradeOutlook(payroll, effectiveWins, effectiveLosses, expiringCount, thresholds, d.confRank, d.gbFromLeader, d.topThreeAvgK2);
  const outlook = d.hasInjuredStar && !d.manualOutlook
    ? { ...baseOutlook, label: 'Injured Star', color: 'text-amber-300', bgColor: 'bg-amber-500/10' }
    : baseOutlook;
  const capSpace = thresholds.salaryCap - payroll;
  const taxOver  = payroll - thresholds.luxuryTax;

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
        <div className="text-[9px] text-slate-400 mt-0.5 tabular-nums">
          {effectiveWins}–{effectiveLosses}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        {capSpace > 0
          ? <div className="text-[10px] font-bold text-emerald-400 tabular-nums">+{formatSalaryM(capSpace)}</div>
          : taxOver > 0
            ? <div className="text-[10px] font-bold text-yellow-400 tabular-nums">{formatSalaryM(taxOver)} tax</div>
            : <div className="text-[10px] font-bold text-slate-400 tabular-nums">{formatSalaryM(Math.abs(capSpace))} over</div>
        }
        {expiringCount > 0 && (
          <div className="text-[9px] text-amber-400">{expiringCount} exp</div>
        )}
      </div>
      <ExternalLink size={9} className="text-slate-700 group-hover:text-slate-500 transition-colors flex-shrink-0" />
    </div>
  );
};

// ─── Main view ───────────────────────────────────────────────────────────
type TabKey = 'cap' | 'trade' | 'attendance';
type CapSortKey = 'name' | 'wins' | 'strategy' | 'status' | 'payroll' | 'mle' | 'expiring' | 'roster';
type AttSortKey = 'name' | 'wins' | 'capacity' | 'fill' | 'attendance' | 'ticket' | 'revenue';

export const LeagueFinancesView: React.FC = () => {
  const { state, navigateToTeamFinances } = useGame();
  const ownTid = getOwnTeamId(state);
  const [tab, setTab]         = useState<TabKey>('cap');
  const [capSort, setCapSort] = useState<CapSortKey>('payroll');
  const [capDir, setCapDir]   = useState<'desc' | 'asc'>('desc');
  const [attSort, setAttSort] = useState<AttSortKey>('attendance');
  const [attDir, setAttDir]   = useState<'desc' | 'asc'>('desc');

  const thresholds = useMemo(() => getCapThresholds(state.leagueStats), [state.leagueStats]);
  const seasonYear = state.leagueStats.year;

  // conference standings
  const confStandings = useMemo(() => {
    const byConf: Record<string, { teamId: number; wins: number; losses: number }[]> = {};
    state.teams.forEach(t => {
      const conf = t.conference || 'East';
      if (!byConf[conf]) byConf[conf] = [];
      const rec = effectiveRecord(t, seasonYear);
      byConf[conf].push({ teamId: t.id, wins: rec.wins, losses: rec.losses });
    });

    const result: Record<number, { confRank: number; gbFromLeader: number }> = {};
    Object.values(byConf).forEach(list => {
      list.sort((a, b) => {
        const aWp = a.wins / (a.wins + a.losses || 1);
        const bWp = b.wins / (b.wins + b.losses || 1);
        return bWp - aWp || b.wins - a.wins;
      });
      const leader = list[0];
      list.forEach((entry, idx) => {
        const gb = ((leader.wins - entry.wins) + (entry.losses - leader.losses)) / 2;
        result[entry.teamId] = { confRank: idx + 1, gbFromLeader: Math.max(0, gb) };
      });
    });
    return result;
  }, [state.teams, seasonYear]);

  const teamData: TeamEnriched[] = useMemo(() => state.teams.map(team => {
    const players = state.players.filter(p =>
      p.tid === team.id &&
      !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '')
    );
    const payroll       = players.reduce((s, p) => s + contractToUSD(p.contract?.amount || 0), 0);
    const expiringCount = players.filter(p => (p.contract?.exp ?? 0) <= seasonYear).length;
    const twoWayCount   = players.filter(p => p.twoWay === true).length;
    const standardCount = players.length - twoWayCount;
    const { confRank = 15, gbFromLeader = 0 } = confStandings[team.id] ?? {};
    const { wins: effectiveWins, losses: effectiveLosses } = effectiveRecord(team, seasonYear);
    const topThreeAvgK2 = topNAvgK2(state.players, team.id, 3);
    const topPlayer = [...players].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))[0];
    const hasInjuredStar = !!topPlayer && (topPlayer.injury?.gamesRemaining ?? 0) >= 30;
    const mle = getMLEAvailability(team.id, payroll, 0, thresholds, state.leagueStats);
    const mleAvailable = mle.type && !mle.blocked ? mle.available : 0;
    const mleUsed      = mle.type && !mle.blocked ? (mle.used ?? 0) : 0;
    const mleLimit     = mle.type && !mle.blocked ? (mle.limit ?? 0) : 0;
    const mleType = mle.type === 'room' ? 'Room' : mle.type === 'taxpayer' ? 'Tax' : mle.type ? 'NT' : '—';
    const manualOutlook = resolveManualOutlook(team, state.gameMode, state.userTeamId);
    return { team, payroll, expiringCount, standardCount, twoWayCount, confRank, gbFromLeader, effectiveWins, effectiveLosses, topThreeAvgK2, hasInjuredStar, mleAvailable, mleUsed, mleLimit, mleType, manualOutlook };
  }), [state.teams, state.players, seasonYear, confStandings, thresholds, state.leagueStats, state.gameMode, state.userTeamId]);

  const maxPayroll = useMemo(
    () => Math.max(...teamData.map(d => d.payroll), thresholds.secondApron * 1.05),
    [teamData, thresholds]
  );

  const totalPayroll  = useMemo(() => teamData.reduce((s, d) => s + d.payroll, 0), [teamData]);
  const overTaxCount  = useMemo(() => teamData.filter(d => d.payroll >= thresholds.luxuryTax).length, [teamData, thresholds]);
  const underCapCount = useMemo(() => teamData.filter(d => d.payroll < thresholds.salaryCap).length, [teamData, thresholds]);
  const avgPayroll    = totalPayroll / (teamData.length || 1);

  // cap sort
  const capSorted = useMemo(() => [...teamData].sort((a, b) => {
    let diff = 0;
    if (capSort === 'payroll')       diff = a.payroll - b.payroll;
    else if (capSort === 'wins')     diff = a.effectiveWins - b.effectiveWins;
    else if (capSort === 'mle')      diff = a.mleAvailable - b.mleAvailable;
    else if (capSort === 'expiring') diff = a.expiringCount - b.expiringCount;
    else if (capSort === 'roster')   diff = (a.standardCount * 10 + a.twoWayCount) - (b.standardCount * 10 + b.twoWayCount);
    else if (capSort === 'status') {
      const sa = STATUS_SEVERITY[getCapStatus(a.payroll, thresholds).key] ?? 0;
      const sb = STATUS_SEVERITY[getCapStatus(b.payroll, thresholds).key] ?? 0;
      diff = sa - sb;
    }
    else if (capSort === 'strategy') {
      const ra = ROLE_RANK[(a.manualOutlook ?? getTradeOutlook(a.payroll, a.effectiveWins, a.effectiveLosses, a.expiringCount, thresholds, a.confRank, a.gbFromLeader, a.topThreeAvgK2)).role] ?? 2;
      const rb = ROLE_RANK[(b.manualOutlook ?? getTradeOutlook(b.payroll, b.effectiveWins, b.effectiveLosses, b.expiringCount, thresholds, b.confRank, b.gbFromLeader, b.topThreeAvgK2)).role] ?? 2;
      diff = rb - ra;
    }
    else diff = a.team.name.localeCompare(b.team.name);
    return capDir === 'desc' ? -diff : diff;
  }), [teamData, capSort, capDir, thresholds]);

  // att sort (precompute profiles once)
  const attSorted = useMemo(() => {
    const profiles = teamData.map(d => ({ d, p: estimateAttendance(d.team) }));
    profiles.sort((a, b) => {
      let diff = 0;
      if (attSort === 'attendance')    diff = a.p.avgAttendance - b.p.avgAttendance;
      else if (attSort === 'revenue')  diff = a.p.seasonRevenue - b.p.seasonRevenue;
      else if (attSort === 'fill')     diff = a.p.fillRate - b.p.fillRate;
      else if (attSort === 'capacity') diff = a.p.arenaCapacity - b.p.arenaCapacity;
      else if (attSort === 'ticket')   diff = a.p.avgTicketPrice - b.p.avgTicketPrice;
      else if (attSort === 'wins')     diff = a.d.effectiveWins - b.d.effectiveWins;
      else diff = a.d.team.name.localeCompare(b.d.team.name);
      return attDir === 'desc' ? -diff : diff;
    });
    return profiles.map(x => x.d);
  }, [teamData, attSort, attDir]);

  // trade board groups
  const buyers = useMemo(() =>
    teamData
      .filter(d => {
        const r = (d.manualOutlook ?? getTradeOutlook(d.payroll, d.effectiveWins, d.effectiveLosses, d.expiringCount, thresholds, d.confRank, d.gbFromLeader, d.topThreeAvgK2)).role;
        return r === 'buyer' || r === 'heavy_buyer';
      })
      .sort((a, b) => a.confRank - b.confRank)
  , [teamData, thresholds]);

  const sellers = useMemo(() =>
    teamData
      .filter(d => {
        const r = (d.manualOutlook ?? getTradeOutlook(d.payroll, d.effectiveWins, d.effectiveLosses, d.expiringCount, thresholds, d.confRank, d.gbFromLeader, d.topThreeAvgK2)).role;
        return r === 'seller' || r === 'rebuilding';
      })
      .sort((a, b) => b.confRank - a.confRank)
  , [teamData, thresholds]);

  const neutrals = useMemo(() =>
    teamData.filter(d => {
      const r = (d.manualOutlook ?? getTradeOutlook(d.payroll, d.effectiveWins, d.effectiveLosses, d.expiringCount, thresholds, d.confRank, d.gbFromLeader, d.topThreeAvgK2)).role;
      return r === 'neutral';
    })
  , [teamData, thresholds]);

  // attendance totals
  const attTotals = useMemo(() => {
    const profiles = teamData.map(d => estimateAttendance(d.team));
    const totalRev = profiles.reduce((s, p) => s + p.seasonRevenue, 0);
    const avgFill  = profiles.reduce((s, p) => s + p.fillRate,      0) / (profiles.length || 1);
    const avgAtt   = profiles.reduce((s, p) => s + p.avgAttendance, 0) / (profiles.length || 1);
    const soldOut  = profiles.filter(p => p.avgAttendance >= ARENA_HARD_CAP * 0.97).length;
    return { totalRev, avgFill, avgAtt: Math.round(avgAtt), soldOut };
  }, [teamData]);

  const toggleCap = (col: CapSortKey) => {
    if (capSort === col) setCapDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setCapSort(col); setCapDir('desc'); }
  };
  const toggleAtt = (col: AttSortKey) => {
    if (attSort === col) setAttDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setAttSort(col); setAttDir('desc'); }
  };

  // Sort header cells (live inside the grid — same column widths as rows)
  type Align = 'left' | 'center' | 'right';
  const CapH: React.FC<{ col: CapSortKey; label: string; align?: Align }> = ({ col, label, align = 'left' }) => {
    const a = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
    const active = capSort === col;
    return (
      <button
        onClick={() => toggleCap(col)}
        className={`flex items-center gap-0.5 hover:text-white transition-colors ${a} ${active ? 'text-white' : ''}`}
      >
        <span className="truncate">{label}</span>
        {active && (capDir === 'desc' ? <ChevronDown size={9} className="flex-shrink-0" /> : <ChevronUp size={9} className="flex-shrink-0" />)}
      </button>
    );
  };
  const AttH: React.FC<{ col: AttSortKey; label: string; align?: Align }> = ({ col, label, align = 'left' }) => {
    const a = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
    const active = attSort === col;
    return (
      <button
        onClick={() => toggleAtt(col)}
        className={`flex items-center gap-0.5 hover:text-white transition-colors ${a} ${active ? 'text-white' : ''}`}
      >
        <span className="truncate">{label}</span>
        {active && (attDir === 'desc' ? <ChevronDown size={9} className="flex-shrink-0" /> : <ChevronUp size={9} className="flex-shrink-0" />)}
      </button>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#1a1d24] text-slate-200 overflow-hidden">

      {/* ── Header ── */}
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

      {/* ── Tab bar ── */}
      <div className="flex-shrink-0 flex items-center gap-1 border-b border-slate-800/50 bg-[#161616] px-4">
        {([
          { key: 'cap',        label: 'Cap Overview', icon: DollarSign },
          { key: 'trade',      label: 'Trade Board',  icon: TrendingUp },
          { key: 'attendance', label: 'Attendance',   icon: Ticket },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              tab === t.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <t.icon size={11} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CAP OVERVIEW ── */}
      {tab === 'cap' && (
        <div className="flex-1 overflow-auto custom-scrollbar">
          <div className="min-w-[964px]">
            <div className={`${CAP_GRID} sticky top-0 z-10 border-b border-slate-800/40 bg-[#161616] px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest`}>
              <span className="text-right">#</span>
              <CapH col="name"     label="Team" />
              <CapH col="wins"     label="W-L"      align="center" />
              <CapH col="strategy" label="Strategy" align="center" />
              <CapH col="status"   label="Status"   align="center" />
              <span className="px-1">Payroll vs. Cap</span>
              <CapH col="payroll"  label="Payroll"  align="right" />
              <CapH col="mle"      label="MLE"      align="right" />
              <CapH col="expiring" label="Exp"      align="right" />
              <CapH col="roster"   label="Roster"   align="right" />
              <span />
            </div>
            {capSorted.map((d, i) => (
              <CapRow
                key={d.team.id}
                d={d}
                thresholds={thresholds}
                maxPayroll={maxPayroll}
                rank={i + 1}
                isOwn={ownTid !== null && d.team.id === ownTid}
                onClick={() => navigateToTeamFinances(d.team.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── TRADE BOARD ── */}
      {tab === 'trade' && (
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
                {buyers.length === 0
                  ? <div className="text-[10px] text-slate-400 italic text-center py-4">No teams currently qualify</div>
                  : buyers.map(d => (
                    <TradeCard key={d.team.id} d={d} thresholds={thresholds} isOwn={ownTid !== null && d.team.id === ownTid} onClick={() => navigateToTeamFinances(d.team.id)} />
                  ))
                }
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
                {sellers.length === 0
                  ? <div className="text-[10px] text-slate-400 italic text-center py-4">No teams currently qualify</div>
                  : sellers.map(d => (
                    <TradeCard key={d.team.id} d={d} thresholds={thresholds} isOwn={ownTid !== null && d.team.id === ownTid} onClick={() => navigateToTeamFinances(d.team.id)} />
                  ))
                }
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
      )}

      {/* ── ATTENDANCE ── */}
      {tab === 'attendance' && (
        <>
          {/* totals strip */}
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

          {/* unified sortable column headers + rows share one scroll container */}
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="min-w-[780px]">
              <div className={`${ATT_GRID} sticky top-0 z-10 border-b border-slate-800/40 bg-[#161616] px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest`}>
                <span className="text-right">#</span>
                <AttH col="name"       label="Team" />
                <AttH col="wins"       label="W-L"       align="center" />
                <AttH col="capacity"   label="Capacity"  align="right" />
                <AttH col="fill"       label="Fill Rate" />
                <AttH col="attendance" label="Avg Att"   align="right" />
                <AttH col="ticket"     label="$/Tkt"     align="right" />
                <AttH col="revenue"    label="Revenue"   align="right" />
                <span />
              </div>
              {attSorted.map((d, i) => (
                <AttRow
                  key={d.team.id}
                  d={d}
                  rank={i + 1}
                  isOwn={ownTid !== null && d.team.id === ownTid}
                  onClick={() => navigateToTeamFinances(d.team.id)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
