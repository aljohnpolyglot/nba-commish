import React from 'react';
import { Settings2 } from 'lucide-react';
import { LeagueStats } from '../../../types';

interface FinancialsSectionProps {
  leagueStats: LeagueStats;
}

export const FinancialsSection: React.FC<FinancialsSectionProps> = ({ leagueStats }) => {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
          <Settings2 size={20} />
        </div>
        <h4 className="text-lg font-bold text-white tracking-tight">Financials</h4>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-slate-800/50">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Salary Cap</span>
          <span className="font-mono font-bold text-white">${(leagueStats.salaryCap / 1000).toFixed(1)}M</span>
        </div>
        <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-slate-800/50">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Luxury Tax</span>
          <span className="font-mono font-bold text-white">{(leagueStats.luxuryTax * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};
