import React from 'react';
import { useGame } from '../../store/GameContext';
import { DollarSign, Activity } from 'lucide-react'; // Kept only necessary icons
import { ApprovalChart } from './dashboard/ApprovalChart';
import { ViewershipChart } from './dashboard/ViewershipChart';
import { RevenueChart } from './dashboard/RevenueChart';
import { getGamePhase } from '../../utils/helpers';
import { VIEWERSHIP_MEANS } from '../../services/logic/ViewershipService';

interface DashboardProps {
  initialTab?: 'approvals' | 'finances';
}

// Phase-weighted season revenue: Finals days are worth ~6x more than Preseason days.
// Total weighted season budget: sum(phase_weight * phase_days) across all phases.
// Each historical point accumulates revenue proportional to the phase it was in.
const SEASON_PHASE_BUDGETS: { days: number; phaseKey: string }[] = [
  { phaseKey: 'Preseason', days: 21 },
  { phaseKey: 'Opening Week', days: 7 },
  { phaseKey: 'Regular Season (Early)', days: 45 },
  { phaseKey: 'Regular Season (Mid)', days: 50 },
  { phaseKey: 'Regular Season (Late)', days: 45 },
  { phaseKey: 'Play-In Tournament', days: 4 },
  { phaseKey: 'Playoffs (Round 1)', days: 16 },
  { phaseKey: 'Playoffs (Round 2)', days: 14 },
  { phaseKey: 'Conference Finals', days: 10 },
  { phaseKey: 'NBA Finals', days: 14 },
];

const TOTAL_WEIGHTED_BUDGET = SEASON_PHASE_BUDGETS.reduce(
  (sum, p) => sum + (VIEWERSHIP_MEANS[p.phaseKey as any] ?? 1.8) * p.days,
  0
);

function getPhaseWeight(dateStr: string): number {
  const phase = getGamePhase(dateStr);
  return VIEWERSHIP_MEANS[phase] ?? 1.8;
}

const Dashboard: React.FC<DashboardProps> = ({ initialTab = 'approvals' }) => {
  const { state } = useGame();
  const { leagueStats, stats, historicalStats } = state;

  // Season revenue calculations — phase-weighted so Finals days earn more than Preseason days
  const openingNight = new Date('2025-10-24');
  const currentDate  = new Date(state.date);
  const daysSinceOpening = Math.max(0, (currentDate.getTime() - openingNight.getTime()) / (1000 * 60 * 60 * 24));
  const annualRevB   = leagueStats.mediaRights?.totalRev ?? 0;

  // Compute phase-weighted season revenue for the current date
  const currentPhaseWeight = getPhaseWeight(state.date);
  const weightedDaysCurrent = daysSinceOpening * (currentPhaseWeight / (TOTAL_WEIGHTED_BUDGET / 265));
  const seasonRevB = parseFloat(Math.min((weightedDaysCurrent / 265) * annualRevB, annualRevB).toFixed(2));

  const displayRevenue = leagueStats.mediaRights?.totalRev
    ? leagueStats.mediaRights.totalRev * 1000
    : leagueStats.revenue;

  // For each historical point compute phase-weighted season revenue accrued by that date
  const chartData = historicalStats.map(stat => {
      const pointDate = new Date(stat.date);
      const daysIn = Math.max(0, (pointDate.getTime() - openingNight.getTime()) / (1000 * 60 * 60 * 24));
      const pointAnnualRevB = stat.revenue / 1000; // raw millions → billions
      const phaseWeight = getPhaseWeight(stat.date);
      const avgDailyWeight = TOTAL_WEIGHTED_BUDGET / 265;
      const weightedDays = daysIn * (phaseWeight / avgDailyWeight);
      const seasonRevAtPoint = parseFloat(Math.min((weightedDays / 265) * pointAnnualRevB, pointAnnualRevB).toFixed(2));
      return { ...stat, seasonRevenue: seasonRevAtPoint * 1000 }; // keep same million scale as revenue for RevenueChart to divide
  });

  const currentDataFallback = [{
      date: state.date,
      publicApproval: stats.publicApproval,
      ownerApproval: stats.ownerApproval,
      playerApproval: stats.playerApproval,
      viewership: leagueStats.viewership,
      revenue: leagueStats.revenue,
      seasonRevenue: seasonRevB * 1000,
  }];

  const displayData = chartData.length > 0 ? chartData : currentDataFallback;

  return (
    <div className="space-y-8 pb-12 h-full flex flex-col">
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4">
        {initialTab === 'approvals' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Public</span>
                        </div>
                        <span className="text-3xl font-black text-white">{stats.publicApproval}%</span>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Owners</span>
                        </div>
                        <span className="text-3xl font-black text-white">{stats.ownerApproval}%</span>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Players</span>
                        </div>
                        <span className="text-3xl font-black text-white">{stats.playerApproval}%</span>
                    </div>
                </div>
                <ApprovalChart data={displayData} />
            </div>
        )}

        {initialTab === 'finances' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Changed to grid-cols-2 since we only have Revenue and Season Revenue left */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <DollarSign size={18} className="text-emerald-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Expected Annual Revenue</span>
                        </div>
                        <span className="text-2xl font-black text-white">${(displayRevenue / 1000).toFixed(1)}B</span>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <Activity size={18} className="text-violet-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Expected Season Rev</span>
                        </div>
                        <span className="text-2xl font-black text-white">
                          {annualRevB === 0
                            ? '—'
                            : daysSinceOpening <= 0
                              ? 'Pre-season'
                              : `$${seasonRevB.toFixed(2)}B`}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {annualRevB > 0 && daysSinceOpening > 0 && `of $${annualRevB.toFixed(2)}B annual`}
                        </div>
                    </div>
                </div>

                <RevenueChart data={displayData} />
            </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;