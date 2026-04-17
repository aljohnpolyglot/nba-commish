import React from 'react';
import { Trophy, Users, TrendingUp } from 'lucide-react';

interface TeamStatsCardsProps {
  conferenceRank: number;
  rosterSize: number;
  marketTier: 'High' | 'Medium' | 'Low';
}

export const TeamStatsCards: React.FC<TeamStatsCardsProps> = ({ conferenceRank, rosterSize, marketTier }) => {
  const marketColor = marketTier === 'High'
    ? 'text-emerald-400'
    : marketTier === 'Medium'
      ? 'text-amber-400'
      : 'text-slate-400';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
      {[
        { label: 'Conference Rank', value: `#${conferenceRank}`, icon: Trophy, color: 'text-amber-400' },
        { label: 'Roster Size', value: rosterSize, icon: Users, color: 'text-indigo-400' },
        { label: 'Market Size', value: marketTier, icon: TrendingUp, color: marketColor },
      ].map((stat) => (
        <div key={stat.label} className="bg-slate-900/40 border border-slate-800 p-4 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
            <stat.icon size={16} className={stat.color} />
          </div>
          <span className={`text-xl md:text-2xl font-black tracking-tight ${stat.color}`}>{stat.value}</span>
        </div>
      ))}
    </div>
  );
};
