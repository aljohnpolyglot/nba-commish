import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { formatCurrency } from '../../../utils/helpers';
import { contractToUSD, formatSalaryM, getCapThresholds, getTeamPayrollUSD, getMLEAvailability } from '../../../utils/salaryUtils';
import { ArrowLeft, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ContractTimeline } from '../../shared/ContractTimeline';

const COLORS = ['#38bdf8', '#facc15', '#4ade80', '#f87171', '#c084fc', '#fb923c', '#94a3b8'];

export const TeamFinancesViewDetailed: React.FC = () => {
  const { state, selectedTeamId, setCurrentView } = useGame();

  const teamId = selectedTeamId ?? state.teams[0]?.id ?? 0;
  const currentYear = state.leagueStats.year;

  const { salaryCap, luxuryPayroll } = state.leagueStats;
  const capThresholds = getCapThresholds(state.leagueStats);
  const { firstApron, secondApron } = capThresholds;

  const selectedTeam = state.teams.find(t => t.id === teamId);
  const teamPlayers = useMemo(
    () => state.players.filter(p => p.tid === teamId && !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '')),
    [state.players, teamId]
  );
  const twoWayPlayers = useMemo(() => teamPlayers.filter(p => !!(p as any).twoWay), [teamPlayers]);
  const ngPlayers = useMemo(() => teamPlayers.filter(p => !!(p as any).nonGuaranteed), [teamPlayers]);
  const standardPlayers = useMemo(() => teamPlayers.filter(p => !(p as any).twoWay && !(p as any).nonGuaranteed), [teamPlayers]);

  const payroll = useMemo(() => getTeamPayrollUSD(state.players, teamId, selectedTeam, currentYear), [state.players, teamId, selectedTeam, currentYear]);
  const deadMoneyEntries = useMemo(() => selectedTeam?.deadMoney ?? [], [selectedTeam]);
  const deadMoneyThisSeason = useMemo(
    () => deadMoneyEntries.reduce((sum, e) => {
      const yr = e.remainingByYear.find(y => parseInt(y.season.split('-')[0], 10) + 1 === currentYear);
      return sum + (yr?.amountUSD ?? 0);
    }, 0),
    [deadMoneyEntries, currentYear],
  );

  const capSpace = salaryCap - payroll;
  const firstApronSpace = firstApron - payroll;
  const secondApronSpace = secondApron - payroll;

  const positionData = useMemo(() => {
    const groups = { Guards: 0, Forwards: 0, Centers: 0 };
    standardPlayers.forEach(p => {
      const usd = contractToUSD(p.contract?.amount || 0);
      const pos = p.pos || '';
      if (pos.includes('G')) groups.Guards += usd;
      else if (pos.includes('F')) groups.Forwards += usd;
      else if (pos.includes('C')) groups.Centers += usd;
    });
    return [
      { name: 'Guards', value: groups.Guards },
      { name: 'Forwards', value: groups.Forwards },
      { name: 'Centers', value: groups.Centers },
    ].filter(d => d.value > 0);
  }, [teamPlayers]);

  const playerPieData = useMemo(() =>
    [...standardPlayers]
      .sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0))
      .map(p => ({ name: p.name, value: contractToUSD(p.contract?.amount || 0), pos: p.pos })),
    [standardPlayers]
  );

  const highEarners = useMemo(() => playerPieData.filter(p => p.value >= 8_000_000), [playerPieData]);

  if (!selectedTeam) return null;

  // MLE availability (signingUSD=0 → what's available RIGHT NOW)
  const mleAvail = (state.leagueStats.mleEnabled ?? true)
    ? getMLEAvailability(teamId, payroll, 0, capThresholds, state.leagueStats as any)
    : null;
  const mleBadge: { label: string; color: string; bg: string } | null =
    mleAvail && !mleAvail.blocked && mleAvail.available > 0
      ? mleAvail.type === 'room'
        ? { label: `Room MLE · ${formatSalaryM(mleAvail.available)}`, color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30' }
        : mleAvail.type === 'non_taxpayer'
        ? { label: `Non-Tax MLE · ${formatSalaryM(mleAvail.available)}`, color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30' }
        : { label: `Tax MLE · ${formatSalaryM(mleAvail.available)}`, color: 'text-yellow-300', bg: 'bg-yellow-500/15 border-yellow-500/30' }
      : null;

  const maxBarValue = Math.max(payroll, secondApron * 1.05);
  const capPct = (salaryCap / maxBarValue) * 100;
  const taxPct = ((luxuryPayroll - salaryCap) / maxBarValue) * 100;
  const apron1Pct = ((firstApron - luxuryPayroll) / maxBarValue) * 100;
  const apron2Pct = ((secondApron - firstApron) / maxBarValue) * 100;

  const ApronStatus = ({ space, label }: { space: number; label: string }) => (
    <div className="flex items-center gap-2">
      {space >= 0
        ? <TrendingDown className="w-4 h-4 text-emerald-400" />
        : <TrendingUp className="w-4 h-4 text-rose-400" />}
      <span className={`font-bold ${space >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {space >= 0 ? `Below ${label}` : `Over ${label}`}
      </span>
      <span className="text-slate-500">
        {space >= 0 ? `by ${formatSalaryM(space)}` : `by ${formatSalaryM(Math.abs(space))}`}
      </span>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#1a1d24] text-slate-200">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-800/50 p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4 mb-0">
          <button
            onClick={() => setCurrentView('League Finances')}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft size={14} /> <span className="hidden sm:inline">All Teams</span>
          </button>
          <div className="w-px h-5 bg-slate-700 flex-shrink-0" />
          <div className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 bg-slate-800 rounded-full p-1 sm:p-1.5 flex items-center justify-center">
            <img src={selectedTeam.logoUrl} alt={selectedTeam.abbrev} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
              {selectedTeam.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">{currentYear}–{currentYear + 1} Salary Cap Analysis</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">

          {/* Top Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Total Payroll */}
            <div className="bg-[#232730] rounded-xl p-4 sm:p-6 border border-slate-800/50">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 sm:mb-6 flex items-center gap-2">
                <span className="text-slate-500">$</span> TOTAL PAYROLL
              </h3>
              <div className="flex flex-col items-center justify-center mb-4 sm:mb-8">
                <p className="text-3xl sm:text-5xl font-bold text-white tracking-tight">{formatSalaryM(payroll)}</p>
                {ngPlayers.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Full (w/ NG): <span className="text-amber-400 font-bold">{formatSalaryM(payroll + ngPlayers.reduce((s, p) => s + contractToUSD(p.contract?.amount || 0), 0))}</span>
                  </p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm flex-wrap gap-2">
                <ApronStatus space={firstApronSpace} label="1st Apron" />
                <ApronStatus space={secondApronSpace} label="2nd Apron" />
              </div>
              {mleBadge && (
                <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${mleBadge.bg} ${mleBadge.color}`}>
                  <span>⚡</span>
                  {mleBadge.label}
                </div>
              )}
            </div>

            {/* Cap Utilization */}
            <div className="bg-[#232730] rounded-xl p-4 sm:p-6 border border-slate-800/50">
              <div className="flex justify-between items-center mb-4 sm:mb-8">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <img src={selectedTeam.logoUrl} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                  CAP UTILIZATION
                </h3>
                <span className="text-lg sm:text-xl font-bold text-white">{formatSalaryM(payroll)}</span>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[260px]">
                  <div className="text-center text-xs text-slate-500 mb-2">
                    Range: {formatSalaryM(salaryCap * 0.8)} → {formatSalaryM(secondApron * 1.05)}
                  </div>
                  <div className="relative h-8 bg-slate-800/50 rounded-full overflow-hidden mb-4 flex">
                    <div className="h-full bg-[#38bdf8]" style={{ width: `${capPct}%` }} />
                    <div className="h-full bg-[#facc15]" style={{ width: `${taxPct}%` }} />
                    <div className="h-full bg-[#334155]" style={{ width: `${apron1Pct}%` }} />
                    <div className="h-full bg-[#1e293b]" style={{ width: `${apron2Pct}%` }} />
                  </div>
                  <div className="relative h-14 text-xs font-medium">
                    <div className="absolute flex flex-col items-center" style={{ left: `${capPct}%`, transform: 'translateX(-50%)' }}>
                      <span className="text-[#38bdf8]">Cap</span>
                      <span className="text-slate-500">{formatSalaryM(salaryCap)}</span>
                    </div>
                    <div className="absolute flex flex-col items-center" style={{ left: `${capPct + taxPct}%`, transform: 'translateX(-50%)' }}>
                      <span className="text-[#facc15]">Tax</span>
                      <span className="text-slate-500">{formatSalaryM(luxuryPayroll)}</span>
                    </div>
                    <div className="absolute flex flex-col items-center" style={{ left: `${capPct + taxPct + apron1Pct}%`, transform: 'translateX(-50%)' }}>
                      <span className="text-slate-400">1st</span>
                      <span className="text-slate-500">{formatSalaryM(firstApron)}</span>
                    </div>
                    <div className="absolute flex flex-col items-center" style={{ left: `${capPct + taxPct + apron1Pct + apron2Pct}%`, transform: 'translateX(-50%)' }}>
                      <span className="text-orange-400">2nd</span>
                      <span className="text-slate-500">{formatSalaryM(secondApron)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contract Timeline */}
          <div className="bg-[#232730] rounded-xl border border-slate-800/50 overflow-hidden flex flex-col">
              <div className="p-4 sm:p-6 border-b border-slate-800/50 flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <img src={selectedTeam.logoUrl} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                  CONTRACT TIMELINE
                </h3>
              </div>
              <div className="flex-1">
                <ContractTimeline teamId={teamId} currentYear={currentYear} />
              </div>
            </div>

          {/* Bottom Row: Pie Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Payroll Pie Breakdown */}
            <div className="bg-[#232730] rounded-xl p-4 sm:p-6 border border-slate-800/50">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <img src={selectedTeam.logoUrl} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                  PAYROLL PIE BREAKDOWN
                </h3>
                <span className="text-xs text-slate-500">{formatSalaryM(payroll)} total</span>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0">
                <div className="w-56 h-56 sm:w-64 sm:h-64 relative flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0, false)} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                      <Pie data={positionData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} stroke="#232730" strokeWidth={2}>
                        {positionData.map((_, index) => <Cell key={`c-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Pie data={playerPieData} dataKey="value" cx="50%" cy="50%" innerRadius={85} outerRadius={110} stroke="#232730" strokeWidth={2}>
                        {playerPieData.map((entry, index) => {
                          const epos = entry.pos || '';
                          const pi = epos.includes('G') ? 0 : epos.includes('F') ? 1 : 2;
                          return <Cell key={`cp-${index}`} fill={COLORS[pi % COLORS.length]} />;
                        })}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Payroll</span>
                    <span className="text-xl font-black text-white">{formatSalaryM(payroll)}</span>
                    <span className="text-[10px] text-slate-500">{positionData.length} groups</span>
                  </div>
                </div>
                <div className="sm:ml-8 space-y-3 sm:space-y-4 w-full sm:w-auto">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Position Share</h4>
                  {positionData.map((pos, idx) => (
                    <div key={pos.name} className="flex items-center justify-between gap-4 sm:gap-8">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="text-sm font-medium text-slate-300">{pos.name}</span>
                      </div>
                      <span className="text-sm text-slate-400">{((pos.value / payroll) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* High-Earners Pie */}
            <div className="bg-[#232730] rounded-xl p-4 sm:p-6 border border-slate-800/50">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <img src={selectedTeam.logoUrl} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                  HIGH-EARNERS PIE
                </h3>
                <span className="text-xs text-slate-500">$8M+ only</span>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0">
                <div className="w-56 h-56 sm:w-64 sm:h-64 relative flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0, false)} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                      <Pie data={highEarners} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={110} stroke="#232730" strokeWidth={3}>
                        {highEarners.map((entry, index) => {
                          const epos = entry.pos || '';
                          const pi = epos.includes('G') ? 0 : epos.includes('F') ? 1 : 2;
                          return <Cell key={`he-${index}`} fill={COLORS[pi % COLORS.length]} />;
                        })}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">High Earners</span>
                    <span className="text-xl font-black text-white">{formatSalaryM(highEarners.reduce((s, p) => s + p.value, 0))}</span>
                    <span className="text-[10px] text-slate-500">{highEarners.length} players at $8M+</span>
                  </div>
                </div>
                <div className="sm:ml-8 flex-1 w-full">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Players ({formatSalaryM(highEarners.reduce((s, p) => s + p.value, 0))} Total)
                  </h4>
                  <div className="space-y-2 sm:space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {highEarners.map((player, idx) => {
                      const ppos = player.pos || '';
                      const pi = ppos.includes('G') ? 0 : ppos.includes('F') ? 1 : 2;
                      return (
                        <div key={player.name} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[pi % COLORS.length] }} />
                            <span className="text-sm font-medium text-slate-300 truncate max-w-[120px]">{player.name}</span>
                          </div>
                          <span className="text-sm font-bold text-white">{formatSalaryM(player.value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Two-Way + Non-Guaranteed + Dead Money panels */}
          {(twoWayPlayers.length > 0 || ngPlayers.length > 0 || deadMoneyEntries.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {twoWayPlayers.length > 0 && (
                <div className="bg-[#232730] rounded-xl p-4 border border-slate-800/50">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                    Two-Way Contracts
                    <span className="text-slate-600 font-normal normal-case tracking-normal">(cap-exempt)</span>
                  </h3>
                  <div className="space-y-2">
                    {twoWayPlayers.map(p => (
                      <div key={p.internalId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">2W</span>
                          <span className="text-sm text-slate-300">{p.name}</span>
                          <span className="text-[10px] text-slate-500">{p.pos}</span>
                        </div>
                        <span className="text-sm font-bold text-slate-400">{formatSalaryM(contractToUSD(p.contract?.amount || 0))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ngPlayers.length > 0 && (
                <div className="bg-[#232730] rounded-xl p-4 border border-amber-500/20">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    Non-Guaranteed
                    <span className="text-slate-600 font-normal normal-case tracking-normal">(guarantee by Jan 10 or cut)</span>
                  </h3>
                  <div className="space-y-2">
                    {ngPlayers.map(p => (
                      <div key={p.internalId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">NG</span>
                          <span className="text-sm text-slate-300">{p.name}</span>
                          <span className="text-[10px] text-slate-500">{p.pos}</span>
                        </div>
                        <span className="text-sm font-bold text-amber-300">{formatSalaryM(contractToUSD(p.contract?.amount || 0))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {deadMoneyEntries.length > 0 && (
                <div className="bg-[#1a1d24] rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                    Dead Money
                    <span className="text-slate-600 font-normal normal-case tracking-normal">
                      (waived contracts — still on cap · ${(deadMoneyThisSeason / 1_000_000).toFixed(1)}M this season)
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {deadMoneyEntries.map(entry => {
                      const yr = entry.remainingByYear.find(y => parseInt(y.season.split('-')[0], 10) + 1 === currentYear);
                      const total = entry.remainingByYear.reduce((s, y) => s + y.amountUSD, 0);
                      const lastYear = entry.remainingByYear[entry.remainingByYear.length - 1];
                      return (
                        <div key={entry.playerId} className="flex items-center justify-between opacity-60">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-500 bg-slate-700/40 px-1.5 py-0.5 rounded border border-slate-700">
                              {entry.stretched ? 'STRETCH' : 'DEAD'}
                            </span>
                            <span className="text-sm text-slate-400 line-through">{entry.playerName}</span>
                            <span className="text-[10px] text-slate-600">
                              waived {entry.waivedDate} · thru {lastYear?.season ?? '?'}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-slate-400">{formatSalaryM(yr?.amountUSD ?? 0)}</div>
                            <div className="text-[9px] text-slate-600">${(total / 1_000_000).toFixed(1)}M total</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

