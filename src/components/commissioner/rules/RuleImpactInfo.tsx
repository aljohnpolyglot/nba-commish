import React from 'react';
import { Info, Zap } from 'lucide-react';

export const RuleImpactInfo: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl shadow-indigo-500/20 relative overflow-hidden group">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
        <div className="relative z-10">
          <div className="p-3 rounded-2xl bg-white/20 w-fit mb-6">
            <Zap size={24} className="text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Executive Power</h3>
          <p className="text-indigo-100 text-sm font-medium leading-relaxed">
            As Commissioner, you have the unilateral power to change league rules and honors. However, drastic changes will impact your approval ratings with owners and fans.
          </p>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-slate-800 text-slate-400">
            <Info size={20} />
          </div>
          <h4 className="text-lg font-bold text-white tracking-tight">Rule Change Impact</h4>
        </div>
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="w-1 h-12 bg-emerald-500 rounded-full"></div>
            <div>
              <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-1">Fan Engagement</h5>
              <p className="text-xs text-slate-500 leading-relaxed">Exciting rules (like 4pt line) or prestigious awards increase viewership but may hurt traditionalist approval.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-1 h-12 bg-amber-500 rounded-full"></div>
            <div>
              <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-1">Owner Profits</h5>
              <p className="text-xs text-slate-500 leading-relaxed">Financial rules directly impact owner approval. Higher caps make them nervous.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-1 h-12 bg-rose-500 rounded-full"></div>
            <div>
              <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-1">Legacy Cost</h5>
              <p className="text-xs text-slate-500 leading-relaxed">Frequent rule changes decrease league stability and your long-term legacy score.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
