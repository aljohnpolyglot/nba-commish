import React from 'react';
import { TrendingUp, Users, DollarSign, BarChart3, Target } from 'lucide-react';
import { LeagueStats } from '../../../types';

interface StatsCardsProps {
  leagueStats: LeagueStats;
  onRevenueClick: () => void;
  onViewershipClick: () => void;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ leagueStats, onRevenueClick, onViewershipClick }) => {
  const statsCards = [
    { label: 'Total Expected Rev', value: `$${(leagueStats.revenue / 1000).toFixed(1)}B`, icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10', onClick: onRevenueClick },
    { label: 'Avg Viewership', value: `${leagueStats.viewership}M`, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/10', onClick: onViewershipClick },
    { label: 'Salary Cap', value: `$${(leagueStats.salaryCap / 1000).toFixed(1)}M`, icon: BarChart3, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Luxury Tax', value: `${(leagueStats.luxuryTax * 100).toFixed(0)}%`, icon: Target, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsCards.map((card) => (
        <div 
          key={card.label} 
          onClick={card.onClick}
          className={`bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm hover:border-slate-700 transition-all duration-300 group ${card.onClick ? 'cursor-pointer hover:bg-slate-800/80' : ''}`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-2xl ${card.bg} group-hover:scale-110 transition-transform duration-300`}>
              <card.icon size={20} className={card.color} />
            </div>
            <TrendingUp size={16} className="text-slate-600" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{card.label}</span>
            <span className="text-2xl font-bold text-white tracking-tight">{card.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
