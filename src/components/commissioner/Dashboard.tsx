import React, { useState } from 'react';
import { useGame } from '../../store/GameContext';
import { TrendingUp, Users, DollarSign, BarChart3, Star, Target, ShieldCheck, PieChart, Activity } from 'lucide-react';
import { ApprovalChart } from './dashboard/ApprovalChart';
import { ViewershipChart } from './dashboard/ViewershipChart';
import { RevenueChart } from './dashboard/RevenueChart';

interface DashboardProps {
  initialTab?: 'approvals' | 'finances';
}

const Dashboard: React.FC<DashboardProps> = ({ initialTab = 'approvals' }) => {
  const { state } = useGame();
  const { leagueStats, stats, historicalStats } = state;

  const expenses = (leagueStats.salaryCap / 1000) * 30 * 0.9; 
  const profit = leagueStats.revenue - expenses;

  const chartData = historicalStats.map(stat => ({
      ...stat,
      profit: stat.revenue - ((state.leagueStats.salaryCap / 1000) * 30 * 0.9) 
  }));

  const currentDataFallback = [{ 
      date: state.date, 
      publicApproval: stats.publicApproval, 
      ownerApproval: stats.ownerApproval, 
      playerApproval: stats.playerApproval,
      viewership: leagueStats.viewership,
      revenue: leagueStats.revenue,
      profit: profit
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <DollarSign size={18} className="text-emerald-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Revenue</span>
                        </div>
                        <span className="text-2xl font-black text-white">${(leagueStats.revenue / 1000).toFixed(1)}B</span>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <BarChart3 size={18} className="text-amber-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Salary Cap</span>
                        </div>
                        <span className="text-2xl font-black text-white">${(leagueStats.salaryCap / 1000).toFixed(1)}M</span>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <Target size={18} className="text-rose-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Luxury Tax</span>
                        </div>
                        <span className="text-2xl font-black text-white">{(leagueStats.luxuryTax * 100).toFixed(0)}%</span>
                    </div>
                     <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <PieChart size={18} className="text-blue-400" />
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Profit Margin</span>
                        </div>
                        <span className="text-2xl font-black text-white">{((profit / leagueStats.revenue) * 100).toFixed(1)}%</span>
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
