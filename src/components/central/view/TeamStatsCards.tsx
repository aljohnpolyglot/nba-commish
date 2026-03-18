import React from 'react';
import { Trophy, Users, TrendingUp } from 'lucide-react';

interface TeamStatsCardsProps {
  conferenceRank: number;
  rosterSize: number;
}

export const TeamStatsCards: React.FC<TeamStatsCardsProps> = ({ conferenceRank, rosterSize }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
      {[
        { label: 'Conference Rank', value: `#${conferenceRank}`, icon: Trophy, color: 'text-amber-400' },
        { label: 'Roster Size', value: rosterSize, icon: Users, color: 'text-indigo-400' },
        { label: 'Market Value', value: 'High', icon: TrendingUp, color: 'text-emerald-400' }
      ].map((stat) => (
        <div key={stat.label} className="bg-slate-900/40 border border-slate-800 p-4 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
            <stat.icon size={16} className={stat.color} />
          </div>
          <span className="text-xl md:text-2xl font-black text-white tracking-tight">{stat.value}</span>
        </div>
      ))}
    </div>
  );
};
