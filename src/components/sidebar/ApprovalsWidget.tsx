import React from 'react';
import { Sparkles } from 'lucide-react';
import { useGame } from '../../store/GameContext';

export const ApprovalsWidget: React.FC = () => {
  const { state } = useGame();
  
  const stats = [
    { label: 'Public', value: state.stats.publicApproval, color: 'bg-sky-500' },
    { label: 'Owners', value: state.stats.ownerApproval, color: 'bg-violet-500' },
    { label: 'Players', value: state.stats.playerApproval, color: 'bg-amber-500' },
    { label: 'Legacy', value: state.stats.legacy, color: 'bg-rose-500', icon: Sparkles },
    { label: 'Viewership', value: Math.min(100, (state.leagueStats.viewership / 30) * 100), color: 'bg-indigo-400', displayValue: `${state.leagueStats.viewership}M` }
  ];

  return (
    <div>
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-3 mb-4">Approvals</h3>
      <div className="px-3 space-y-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="flex justify-between text-[11px] mb-1.5 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1 text-slate-400">
                {stat.icon && <stat.icon size={10} className="text-rose-500" />}
                {stat.label}
              </span>
              <span className={stat.value < 40 ? 'text-rose-400' : 'text-slate-200'}>{stat.displayValue || `${stat.value.toFixed(0)}%`}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full ${stat.color} transition-all duration-1000 ease-out`} 
                style={{ width: `${stat.value}%` }} 
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
