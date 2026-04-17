import React, { useMemo, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import {
  DollarSign, ChevronDown, ChevronUp, ExternalLink,
  TrendingUp, TrendingDown, Minus, Users, Ticket,
} from 'lucide-react';
import {
  getCapThresholds, getCapStatus, formatSalaryM, contractToUSD,
  getTradeOutlook, effectiveRecord, topNAvgK2, CapThresholds,
} from '../../../utils/salaryUtils';
import {
  estimateAttendance, getArenaCapacity, formatAttendance, formatRevM, ARENA_HARD_CAP,
} from '../../../utils/attendanceUtils';

// ─── shared types ─────────────────────────────────────────────────────────────
interface TeamEnriched {
  team: any;
  payroll: number;
  playerCount: number;
  expiringCount: number;
  confRank: number;       // 1-15 within conference
  gbFromLeader: number;   // games behind conference leader
  effectiveWins: number;  // last-season fallback when offseason
  effectiveLosses: number;
  topThreeAvgK2: number;  // avg K2 OVR of top-3 players (star-power override)
  hasInjuredStar: boolean; // best player is out 30+ games (season-altering injury)
}

// ─── PayrollBar ───────────────────────────────────────────────────────────────
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

// ─── AttendanceBar ────────────────────────────────────────────────────────────
const AttendanceBar: React.FC<{ fill: number }> = ({ fill }) => {
  const pct = Math.min(fill * 100, 100);
  const color = fill >= 0.9 ? '#34d399' : fill >= 0.75 ? '#60a5fa' : fill >= 0.6 ? '#facc15' : '#f87171';
  return (
    <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden w-full">
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
};

// ─── Cap Overview row ─────────────────────────────────────────────────────────
type CapSortKey = 'payroll' | 'space' | 'wins' | 'name';

const CapRow: React.FC<{
  d: TeamEnriched; thresholds: CapThresholds; maxPayroll: number;
  rank: number; onClick: () => void; seasonYear: number;
}> = ({ d, thresholds, maxPayroll, rank, onClick, seasonYear }) => {
  const { team, payroll, playerCount, expiringCount, confRank, gbFromLeader, effectiveWins, effectiveLosses } = d;
  const status    = getCapStatus(payroll, thresholds);
  const baseOutlook = getTradeOutlook(payroll, effectiveWins, effectiveLosses, expiringCount, thresholds, d.confRank, d.gbFromLeader, d.topThreeAvgK2);
  const outlook = d.hasInjuredStar
    ? { ...baseOutlook, label: 'Injured Star', color: 'text-amber-300', bgColor: 'bg-amber-500/10' }
    : baseOutlook;
  const capSpace  = thresholds.salaryCap - payroll;
  const taxOver   = payroll - thresholds.luxuryTax;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/30 cursor-pointer transition-colors border-b border-slate-800/40 last:border-0 group"
      onClick={onClick}
    >
      <span className="text-[10px] font-mono text-slate-600 w-4 flex-shrink-0 text-right">{rank}</span>

      {/* Logo + Name */}
      <div className="flex items-center gap-2 w-36 flex-shrink-0">
        <img src={team.logoUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <span className="text-xs font-black text-white uppercase tracking-tight leading-none">{team.abbrev}</span>
          <div className="text-[9px] text-slate-500 truncate">{team.name}</div>
        </div>
      </div>

      {/* W-L */}
      <div className="text-[10px] font-bold text-slate-300 w-14 flex-shrink-0 text-center tabular-nums">
        {effectiveWins}–{effectiveLosses}
      </div>

      {/* Trade role */}
      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md flex-shrink-0 w-24 text-center ${outlook.bgColor} ${outlook.color}`}>
        {outlook.label}
      </span>

      {/* Cap status */}
      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md flex-shrink-0 w-20 text-center ${status.bgColor} ${status.color}`}>
        {status.label}
      </span>

      {/* Payroll bar */}
      <div className="flex-1 min-w-0 px-1">
        <PayrollBar payroll={payroll} thresholds={thresholds} maxPayroll={maxPayroll} />
      </div>

      {/* Payroll + space/over */}
      <div className="text-right flex-shrink-0 w-24">
        <div className="text-sm font-black text-white leading-none">{formatSalaryM(payroll)}</div>
        <div className={`text-[9px] font-bold leading-none mt-0.5 ${capSpace >= 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
          {capSpace >= 0
            ? `+${formatSalaryM(capSpace)} space`
            : taxOver > 0
              ? <span className="text-yellow-400">{formatSalaryM(taxOver)} tax</span>
              : `${formatSalaryM(Math.abs(capSpace))} over`
          }
        </div>
      </div>

      {/* Expiring */}
      <div className="text-[10px] text-slate-500 w-12 text-right flex-shrink-0">
        {expiringCount > 0
          ? <span className="text-amber-400 font-bold">{expiringCount} exp</span>
          : <span>–</span>
        }
      </div>

      {/* Players */}
      <div className="text-[10px] text-slate-400 w-5 text-right flex-shrink-0">{playerCount}</div>

      <ExternalLink size={10} className="text-slate-700 group-hover:text-slate-400 transition-colors flex-shrink-0" />
    </div>
  );
};

// ─── Trade Board card ─────────────────────────────────────────────────────────
const TradeCard: React.FC<{
  d: TeamEnriched; thresholds: CapThresholds; onClick: () => void;
}> = ({ d, thresholds, onClick }) => {
  const { team, payroll, expiringCount, confRank, gbFromLeader, effectiveWins, effectiveLosses } = d;
  const baseOutlook = getTradeOutlook(payroll, effectiveWins, effectiveLosses, expiringCount, thresholds, confRank, gbFromLeader, d.topThreeAvgK2);
  const outlook = d.hasInjuredStar
    ? { ...baseOutlook, label: 'Injured Star', color: 'text-amber-300', bgColor: 'bg-amber-500/10' }
    : baseOutlook;
  const capSpace = thresholds.salaryCap - payroll;
  const taxOver  = payroll - thresholds.luxuryTax;
  const gp       = effectiveWins + effectiveLosses || 1;
  const winPct   = effectiveWins / gp;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-800/40 cursor-pointer transition-all group"
      onClick={onClick}
    >
      <img src={team.logoUrl} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-white uppercase tracking-tight">{team.abbrev}</span>
          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${outlook.bgColor} ${outlook.color}`}>{outlook.label}</span>
        </div>
        <div className="text-[9px] text-slate-500 mt-0.5">
          {effectiveWins}–{effectiveLosses}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        {capSpace > 0
          ? <div className="text-[10px] font-bold text-emerald-400">+{formatSalaryM(capSpace)}</div>
          : taxOver > 0
            ? <div className="text-[10px] font-bold text-yellow-400">{formatSalaryM(taxOver)} tax</div>
            : <div className="text-[10px] font-bold text-slate-500">{formatSalaryM(Math.abs(capSpace))} over</div>
        }
        {expiringCount > 0 && (
          <div className="text-[9px] text-amber-400">{expiringCount} expiring</div>
        )}
      </div>
      <ExternalLink size={9} className="text-slate-700 group-hover:text-slate-500 transition-colors flex-shrink-0" />
    </div>
  );
};

// ─── Attendance row ───────────────────────────────────────────────────────────
type AttSortKey = 'attendance' | 'revenue' | 'fill' | 'name';

const AttRow: React.FC<{ d: TeamEnriched; rank: number; onClick: () => void }> = ({ d, rank, onClick }) => {
  const { team, effectiveWins, effectiveLosses } = d;
  const att = estimateAttendance(team);
  const fillPct = (att.fillRate * 100).toFixed(1);
  const fillColor = att.fillRate >= 0.9 ? 'text-emerald-400' : att.fillRate >= 0.75 ? 'text-sky-400' : att.fillRate >= 0.6 ? 'text-yellow-400' : 'text-rose-400';

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/30 cursor-pointer transition-colors border-b border-slate-800/40 last:border-0 group"
      onClick={onClick}
    >
      <span className="text-[10px] font-mono text-slate-600 w-4 flex-shrink-0 text-right">{rank}</span>

      {/* Team */}
      <div className="flex items-center gap-2 w-36 flex-shrink-0">
        <img src={team.logoUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-black text-white uppercase tracking-tight leading-none">{team.abbrev}</div>
          <div className="text-[9px] text-slate-500 truncate">{team.name}</div>
        </div>
      </div>

      {/* W-L */}
      <div className="text-[10px] font-bold text-slate-300 w-12 flex-shrink-0 text-center tabular-nums">
        {effectiveWins}–{effectiveLosses}
      </div>

      {/* Arena cap */}
      <div className="text-[10px] text-slate-400 w-14 flex-shrink-0 text-right tabular-nums">
        {formatAttendance(att.arenaCapacity)}
      </div>

      {/* Fill bar */}
      <div className="flex-1 min-w-0 px-1">
        <AttendanceBar fill={att.fillRate} />
      </div>

      {/* Avg attendance */}
      <div className="text-right flex-shrink-0 w-20">
        <div className="text-sm font-black text-white leading-none">{formatAttendance(att.avgAttendance)}</div>
        <div className={`text-[9px] font-bold leading-none mt-0.5 ${fillColor}`}>{fillPct}% capacity</div>
      </div>

      {/* Home games */}
      <div className="text-[10px] text-slate-500 w-10 text-center flex-shrink-0">{att.homeGames}G</div>

      {/* Avg ticket */}
      <div className="text-[10px] text-slate-400 w-12 text-right flex-shrink-0 tabular-nums">${att.avgTicketPrice}</div>

      {/* Revenue */}
      <div className="text-[10px] font-bold text-emerald-400 w-16 text-right flex-shrink-0 tabular-nums">
        {formatRevM(att.seasonRevenue)}
      </div>

      <ExternalLink size={10} className="text-slate-700 group-hover:text-slate-400 transition-colors flex-shrink-0" />
    </div>
  );
};

// ─── Main view ────────────────────────────────────────────────────────────────
type TabKey = 'cap' | 'trade' | 'attendance';

export const LeagueFinancesView: React.FC = () => {
  const { state, navigateToTeamFinances } = useGame();
  const [tab, setTab]         = useState<TabKey>('cap');
  const [capSort, setCapSort] = useState<CapSortKey>('payroll');
  const [capDir, setCapDir]   = useState<'desc' | 'asc'>('desc');
  const [attSort, setAttSort] = useState<AttSortKey>('attendance');
  const [attDir, setAttDir]   = useState<'desc' | 'asc'>('desc');

  const thresholds  = useMemo(() => getCapThresholds(state.leagueStats), [state.leagueStats]);
  const seasonYear  = state.leagueStats.year;

  // ── conference standings (rank + GB) ──
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
  }, [state.teams]);

  const teamData: TeamEnriched[] = useMemo(() => state.teams.map(team => {
    const players = state.players.filter(p =>
      p.tid === team.id &&
      !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '')
    );
    const payroll       = players.reduce((s, p) => s + contractToUSD(p.contract?.amount || 0), 0);
    const expiringCount = players.filter(p => (p.contract?.exp ?? 0) <= seasonYear).length;
    const { confRank = 15, gbFromLeader = 0 } = confStandings[team.id] ?? {};
    const { wins: effectiveWins, losses: effectiveLosses } = effectiveRecord(team, seasonYear);
    const topThreeAvgK2 = topNAvgK2(state.players, team.id, 3);
    // Injured star: franchise best player (by OVR) out 30+ games
    const topPlayer = [...players].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))[0];
    const hasInjuredStar = !!topPlayer && (topPlayer.injury?.gamesRemaining ?? 0) >= 30;
    return { team, players, payroll, playerCount: players.length, expiringCount, confRank, gbFromLeader, effectiveWins, effectiveLosses, topThreeAvgK2, hasInjuredStar };
  }), [state.teams, state.players, seasonYear, confStandings]);

  const maxPayroll = useMemo(
    () => Math.max(...teamData.map(d => d.payroll), thresholds.secondApron * 1.05),
    [teamData, thresholds]
  );

  // ── league summary stats ──
  const totalPayroll  = useMemo(() => teamData.reduce((s, d) => s + d.payroll, 0), [teamData]);
  const overTaxCount  = useMemo(() => teamData.filter(d => d.payroll >= thresholds.luxuryTax).length, [teamData, thresholds]);
  const underCapCount = useMemo(() => teamData.filter(d => d.payroll < thresholds.salaryCap).length, [teamData, thresholds]);
  const avgPayroll    = totalPayroll / (teamData.length || 1);

  // ── sorted cap list ──
  const capSorted = useMemo(() => [...teamData].sort((a, b) => {
    let diff = 0;
    if (capSort === 'payroll') diff = a.payroll - b.payroll;
    else if (capSort === 'space') diff = (thresholds.salaryCap - a.payroll) - (thresholds.salaryCap - b.payroll);
    else if (capSort === 'wins') diff = a.team.wins - b.team.wins;
    else diff = a.team.name.localeCompare(b.team.name);
    return capDir === 'desc' ? -diff : diff;
  }), [teamData, capSort, capDir, thresholds]);

  const handleCapSort = (col: CapSortKey) => {
    if (capSort === col) setCapDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setCapSort(col); setCapDir('desc'); }
  };

  // ── sorted attendance list ──
  const attSorted = useMemo(() => [...teamData].sort((a, b) => {
    const aAtt = estimateAttendance(a.team);
    const bAtt = estimateAttendance(b.team);
    let diff = 0;
    if (attSort === 'attendance') diff = aAtt.avgAttendance - bAtt.avgAttendance;
    else if (attSort === 'revenue') diff = aAtt.seasonRevenue - bAtt.seasonRevenue;
    else if (attSort === 'fill') diff = aAtt.fillRate - bAtt.fillRate;
    else diff = a.team.name.localeCompare(b.team.name);
    return attDir === 'desc' ? -diff : diff;
  }), [teamData, attSort, attDir]);

  const handleAttSort = (col: AttSortKey) => {
    if (attSort === col) setAttDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setAttSort(col); setAttDir('desc'); }
  };

  // ── trade board grouping ──
  const buyers = useMemo(() =>
    teamData
      .filter(d => {
        const r = getTradeOutlook(d.payroll, d.effectiveWins, d.effectiveLosses, d.expiringCount, thresholds, d.confRank, d.gbFromLeader, d.topThreeAvgK2).role;
        return r === 'buyer' || r === 'heavy_buyer';
      })
      .sort((a, b) => a.confRank - b.confRank)
  , [teamData, thresholds]);

  const sellers = useMemo(() =>
    teamData
      .filter(d => {
        const r = getTradeOutlook(d.payroll, d.effectiveWins, d.effectiveLosses, d.expiringCount, thresholds, d.confRank, d.gbFromLeader, d.topThreeAvgK2).role;
        return r === 'seller' || r === 'rebuilding';
      })
      .sort((a, b) => b.confRank - a.confRank)
  , [teamData, thresholds]);

  const neutrals = useMemo(() =>
    teamData.filter(d => {
      const r = getTradeOutlook(d.payroll, d.effectiveWins, d.effectiveLosses, d.expiringCount, thresholds, d.confRank, d.gbFromLeader).role;
      return r === 'neutral';
    })
  , [teamData, thresholds]);

  // ── attendance totals ──
  const attTotals = useMemo(() => {
    const profiles = teamData.map(d => estimateAttendance(d.team));
    const totalRev  = profiles.reduce((s, p) => s + p.seasonRevenue, 0);
    const avgFill   = profiles.reduce((s, p) => s + p.fillRate, 0) / (profiles.length || 1);
    const avgAtt    = profiles.reduce((s, p) => s + p.avgAttendance, 0) / (profiles.length || 1);
    const soldOut   = profiles.filter(p => p.avgAttendance >= ARENA_HARD_CAP * 0.97).length;
    return { totalRev, avgFill, avgAtt: Math.round(avgAtt), soldOut };
  }, [teamData]);

  const SortBtn = ({ col, label, current, dir, onSort }: { col: string; label: string; current: string; dir: 'asc' | 'desc'; onSort: (c: any) => void }) => (
    <button
      onClick={() => onSort(col)}
      className={`flex items-center gap-1 hover:text-white transition-colors ${current === col ? 'text-white' : ''}`}
    >
      {label}
      {current === col && (dir === 'desc' ? <ChevronDown size={9} /> : <ChevronUp size={9} />)}
    </button>
  );

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

        {/* Summary pills */}
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

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 text-[9px] text-slate-500">
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

      {/* ── Content ── */}

      {/* CAP OVERVIEW */}
      {tab === 'cap' && (
        <>
          <div className="flex-shrink-0 border-b border-slate-800/40 bg-[#161616] px-4 py-1.5 flex items-center gap-3 text-[9px] font-black text-slate-600 uppercase tracking-widest">
            <span className="w-4 flex-shrink-0" />
            <div className="w-36 flex-shrink-0">
              <SortBtn col="name" label="Team" current={capSort} dir={capDir} onSort={handleCapSort} />
            </div>
            <div className="w-14 flex-shrink-0 text-center flex justify-center">
              <SortBtn col="wins" label="W-L" current={capSort} dir={capDir} onSort={handleCapSort} />
            </div>
            <span className="w-24 flex-shrink-0" />
            <span className="w-20 flex-shrink-0" />
            <span className="flex-1 min-w-0" />
            <div className="w-24 flex-shrink-0 text-right flex flex-col items-end gap-0.5">
              <SortBtn col="payroll" label="Payroll"  current={capSort} dir={capDir} onSort={handleCapSort} />
              <SortBtn col="space"   label="Cap Space" current={capSort} dir={capDir} onSort={handleCapSort} />
            </div>
            <span className="w-12 flex-shrink-0" />
            <span className="w-5 flex-shrink-0 text-right text-slate-700">{capSorted.length}</span>
            <span className="w-2.5 flex-shrink-0" />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {capSorted.map((d, i) => (
              <CapRow
                key={d.team.id}
                d={d}
                thresholds={thresholds}
                maxPayroll={maxPayroll}
                rank={i + 1}
                seasonYear={seasonYear}
                onClick={() => navigateToTeamFinances(d.team.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* TRADE BOARD */}
      {tab === 'trade' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Buyers */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={13} className="text-emerald-400" />
                <span className="text-xs font-black text-white uppercase tracking-wider">Buyers</span>
                <span className="text-[9px] text-slate-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded-full ml-1">{buyers.length} teams</span>
                <span className="text-[9px] text-slate-600 ml-auto">Contenders with room to add</span>
              </div>
              <div className="space-y-1.5">
                {buyers.length === 0
                  ? <div className="text-[10px] text-slate-600 italic text-center py-4">No teams currently qualify</div>
                  : buyers.map(d => (
                    <TradeCard key={d.team.id} d={d} thresholds={thresholds} onClick={() => navigateToTeamFinances(d.team.id)} />
                  ))
                }
              </div>
            </div>

            {/* Sellers / Rebuilders */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown size={13} className="text-rose-400" />
                <span className="text-xs font-black text-white uppercase tracking-wider">Sellers / Rebuilding</span>
                <span className="text-[9px] text-slate-500 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded-full ml-1">{sellers.length} teams</span>
                <span className="text-[9px] text-slate-600 ml-auto">Moving assets or shedding salary</span>
              </div>
              <div className="space-y-1.5">
                {sellers.length === 0
                  ? <div className="text-[10px] text-slate-600 italic text-center py-4">No teams currently qualify</div>
                  : sellers.map(d => (
                    <TradeCard key={d.team.id} d={d} thresholds={thresholds} onClick={() => navigateToTeamFinances(d.team.id)} />
                  ))
                }
              </div>
            </div>

            {/* Neutrals */}
            {neutrals.length > 0 && (
              <div className="md:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <Minus size={13} className="text-slate-400" />
                  <span className="text-xs font-black text-white uppercase tracking-wider">Neutral</span>
                  <span className="text-[9px] text-slate-500 font-bold bg-slate-700/40 px-1.5 py-0.5 rounded-full ml-1">{neutrals.length} teams</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {neutrals.map(d => (
                    <TradeCard key={d.team.id} d={d} thresholds={thresholds} onClick={() => navigateToTeamFinances(d.team.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ATTENDANCE */}
      {tab === 'attendance' && (
        <>
          {/* Attendance summary */}
          <div className="flex-shrink-0 border-b border-slate-800/40 bg-[#161616] px-4 py-2">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <div className="text-[8px] font-bold text-slate-600 uppercase tracking-wider">Total Gate Rev</div>
                <div className="text-sm font-black text-emerald-400">{formatRevM(attTotals.totalRev)}</div>
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-600 uppercase tracking-wider">Avg Attendance</div>
                <div className="text-sm font-black text-white">{formatAttendance(attTotals.avgAtt)}</div>
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-600 uppercase tracking-wider">Avg Fill Rate</div>
                <div className="text-sm font-black text-sky-400">{(attTotals.avgFill * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-600 uppercase tracking-wider">Arena Cap</div>
                <div className="text-sm font-black text-slate-300">{formatAttendance(ARENA_HARD_CAP)} max</div>
              </div>
            </div>
          </div>

          {/* Sort controls */}
          <div className="flex-shrink-0 border-b border-slate-800/40 bg-[#161616] px-4 py-1.5 flex items-center gap-3 text-[9px] font-black text-slate-600 uppercase tracking-widest">
            <SortBtn col="attendance" label="Attendance" current={attSort} dir={attDir} onSort={handleAttSort} />
            <SortBtn col="revenue"    label="Revenue"    current={attSort} dir={attDir} onSort={handleAttSort} />
            <SortBtn col="fill"       label="Fill %"     current={attSort} dir={attDir} onSort={handleAttSort} />
            <SortBtn col="name"       label="Team"       current={attSort} dir={attDir} onSort={handleAttSort} />
            <div className="ml-auto text-[9px] text-slate-700 flex items-center gap-1">
              <Users size={9} /> Capped at {formatAttendance(ARENA_HARD_CAP)}
            </div>
          </div>

          {/* Column headers */}
          <div className="flex-shrink-0 border-b border-slate-800/30 px-4 py-1 bg-[#141414]">
            <div className="flex items-center gap-3 text-[8px] font-black text-slate-700 uppercase tracking-widest">
              <span className="w-4" />
              <span className="w-36">Team</span>
              <span className="w-12 text-center">W–L</span>
              <span className="w-14 text-right">Capacity</span>
              <span className="flex-1 px-1">Fill</span>
              <span className="w-20 text-right">Avg Att</span>
              <span className="w-10 text-center">HG</span>
              <span className="w-12 text-right">$/Ticket</span>
              <span className="w-16 text-right">Est. Rev</span>
              <span className="w-3" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {attSorted.map((d, i) => (
              <AttRow
                key={d.team.id}
                d={d}
                rank={i + 1}
                onClick={() => navigateToTeamFinances(d.team.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
