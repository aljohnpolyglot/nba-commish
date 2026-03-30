import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { formatCurrency } from '../../../utils/helpers';
import { contractToUSD, formatSalaryM, getCapThresholds, getTeamPayrollUSD } from '../../../utils/salaryUtils';
import { ArrowLeft, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sankey } from 'recharts';

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
    () => state.players.filter(p => p.tid === teamId && !['WNBA', 'Euroleague', 'PBA', 'B-League'].includes(p.status || '')),
    [state.players, teamId]
  );

  const payroll = useMemo(() => getTeamPayrollUSD(state.players, teamId), [state.players, teamId]);

  const capSpace = salaryCap - payroll;
  const firstApronSpace = firstApron - payroll;
  const secondApronSpace = secondApron - payroll;

  const positionData = useMemo(() => {
    const groups = { Guards: 0, Forwards: 0, Centers: 0 };
    teamPlayers.forEach(p => {
      const usd = contractToUSD(p.contract?.amount || 0);
      if (p.pos.includes('G')) groups.Guards += usd;
      else if (p.pos.includes('F')) groups.Forwards += usd;
      else if (p.pos.includes('C')) groups.Centers += usd;
    });
    return [
      { name: 'Guards', value: groups.Guards },
      { name: 'Forwards', value: groups.Forwards },
      { name: 'Centers', value: groups.Centers },
    ].filter(d => d.value > 0);
  }, [teamPlayers]);

  const playerPieData = useMemo(() =>
    [...teamPlayers]
      .sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0))
      .map(p => ({ name: p.name, value: contractToUSD(p.contract?.amount || 0), pos: p.pos })),
    [teamPlayers]
  );

  const highEarners = useMemo(() => playerPieData.filter(p => p.value >= 8_000_000), [playerPieData]);

  const sankeyData = useMemo(() => {
    const nodes = [
      { name: 'Total Payroll' },
      { name: 'Guards' },
      { name: 'Forwards' },
      { name: 'Centers' },
    ];
    const links: any[] = [];
    let playerIndex = 4;
    const addGroup = (group: typeof teamPlayers, sourceIndex: number) => {
      let groupTotal = 0;
      group.forEach(p => {
        const amount = contractToUSD(p.contract?.amount || 0);
        if (amount > 0) {
          nodes.push({ name: p.name });
          links.push({ source: sourceIndex, target: playerIndex, value: amount });
          playerIndex++;
          groupTotal += amount;
        }
      });
      if (groupTotal > 0) links.push({ source: 0, target: sourceIndex, value: groupTotal });
    };
    addGroup(teamPlayers.filter(p => p.pos.includes('G')), 1);
    addGroup(teamPlayers.filter(p => p.pos.includes('F')), 2);
    addGroup(teamPlayers.filter(p => p.pos.includes('C')), 3);
    return { nodes, links };
  }, [teamPlayers]);

  if (!selectedTeam) return null;

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
              {selectedTeam.city || selectedTeam.region} {selectedTeam.name}
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
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm flex-wrap gap-2">
                <ApronStatus space={firstApronSpace} label="1st Apron" />
                <ApronStatus space={secondApronSpace} label="2nd Apron" />
              </div>
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

          {/* Middle Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Payroll Flow */}
            <div className="bg-[#232730] rounded-xl p-4 sm:p-6 border border-slate-800/50 flex flex-col">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <img src={selectedTeam.logoUrl} className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                  PAYROLL FLOW
                </h3>
                <span className="text-xs text-slate-500">Total → Position → Player</span>
              </div>
              <div className="flex-1 min-h-[220px] sm:min-h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <Sankey data={sankeyData} nodePadding={10} margin={{ top: 20, right: 20, bottom: 20, left: 20 }} link={{ stroke: '#334155' }} node={{ fill: '#38bdf8' }}>
                    <Tooltip formatter={(value: number) => formatCurrency(value, false)} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                  </Sankey>
                </ResponsiveContainer>
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
              <div className="overflow-x-auto custom-scrollbar p-3 sm:p-6 flex-1">
                <table className="w-full text-sm text-left whitespace-nowrap border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="pb-4 font-medium w-1/4">Player</th>
                      <th className="pb-4 font-medium text-center w-32 text-yellow-500 border-b-2 border-yellow-500">{currentYear}-{String(currentYear + 1).slice(2)}</th>
                      <th className="pb-4 font-medium text-center w-32">{currentYear + 1}-{String(currentYear + 2).slice(2)}</th>
                      <th className="pb-4 font-medium text-center w-32">{currentYear + 2}-{String(currentYear + 3).slice(2)}</th>
                      <th className="pb-4 font-medium text-center w-32">{currentYear + 3}-{String(currentYear + 4).slice(2)}</th>
                      <th className="pb-4 font-medium text-center w-32">{currentYear + 4}-{String(currentYear + 5).slice(2)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...teamPlayers].sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0)).map(player => {
                      const amount = player.contract?.amount || 0;
                      const expYear = player.contract?.exp || currentYear;
                      const yearsLeft = expYear - currentYear + 1;
                      const cell = (show: boolean) => show
                        ? <div className="bg-[#facc15] text-slate-900 font-bold text-center py-1.5 rounded">{formatSalaryM(contractToUSD(amount))}</div>
                        : <div className="text-slate-600 text-xs text-center py-1.5">{show === false && yearsLeft > 0 ? 'FA' : ''}</div>;
                      return (
                        <tr key={player.internalId}>
                          <td className="py-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-200">{player.name.split(' ')[0][0]}. {player.name.split(' ').slice(1).join(' ')}</span>
                              <span className={`text-xs ${player.overallRating > 80 ? 'text-emerald-400' : 'text-slate-400'}`}>{player.overallRating}</span>
                            </div>
                          </td>
                          <td className="py-1 px-1"><div className="bg-[#facc15] text-slate-900 font-bold text-center py-1.5 rounded">{formatSalaryM(contractToUSD(amount))}</div></td>
                          <td className="py-1 px-1">{yearsLeft >= 2 ? <div className="bg-[#facc15] text-slate-900 font-bold text-center py-1.5 rounded">{formatSalaryM(contractToUSD(amount))}</div> : <div className="text-slate-600 text-xs text-center py-1.5">FA</div>}</td>
                          <td className="py-1 px-1">{yearsLeft >= 3 ? <div className="bg-[#facc15] text-slate-900 font-bold text-center py-1.5 rounded">{formatSalaryM(contractToUSD(amount))}</div> : <div className="text-slate-600 text-xs text-center py-1.5">{yearsLeft === 2 ? 'FA' : ''}</div>}</td>
                          <td className="py-1 px-1">{yearsLeft >= 4 ? <div className="bg-[#facc15] text-slate-900 font-bold text-center py-1.5 rounded">{formatSalaryM(contractToUSD(amount))}</div> : <div className="text-slate-600 text-xs text-center py-1.5">{yearsLeft === 3 ? 'FA' : ''}</div>}</td>
                          <td className="py-1 px-1">{yearsLeft >= 5 ? <div className="bg-[#facc15] text-slate-900 font-bold text-center py-1.5 rounded">{formatSalaryM(contractToUSD(amount))}</div> : <div className="text-slate-600 text-xs text-center py-1.5">{yearsLeft === 4 ? 'FA' : ''}</div>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-6 flex items-center gap-6 text-xs text-slate-400">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#facc15] rounded-sm" /><span>Guaranteed</span></div>
                  <div className="flex items-center gap-2 border border-slate-500 border-dashed px-2 py-0.5 rounded"><span>Player option</span></div>
                  <div className="flex items-center gap-2 border border-[#38bdf8] border-dashed px-2 py-0.5 rounded text-[#38bdf8]"><span>Team option</span></div>
                  <div className="flex items-center gap-2"><span className="text-slate-600 font-bold">FA</span><span>Free agent</span></div>
                </div>
              </div>
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
                      <Tooltip formatter={(value: number) => formatCurrency(value, false)} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                      <Pie data={positionData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} stroke="#232730" strokeWidth={2}>
                        {positionData.map((_, index) => <Cell key={`c-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Pie data={playerPieData} dataKey="value" cx="50%" cy="50%" innerRadius={85} outerRadius={110} stroke="#232730" strokeWidth={2}>
                        {playerPieData.map((entry, index) => {
                          const pi = entry.pos.includes('G') ? 0 : entry.pos.includes('F') ? 1 : 2;
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
                      <Tooltip formatter={(value: number) => formatCurrency(value, false)} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                      <Pie data={highEarners} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={110} stroke="#232730" strokeWidth={3}>
                        {highEarners.map((entry, index) => {
                          const pi = entry.pos.includes('G') ? 0 : entry.pos.includes('F') ? 1 : 2;
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
                      const pi = player.pos.includes('G') ? 0 : player.pos.includes('F') ? 1 : 2;
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

        </div>
      </div>
    </div>
  );
};
