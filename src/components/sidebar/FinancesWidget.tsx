import React from 'react';
import { DollarSign, User } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { Tab } from '../../types';
import { formatCurrency } from '../../utils/helpers';

interface FinancesWidgetProps {
  onViewChange?: (view: Tab) => void;
}

export const FinancesWidget: React.FC<FinancesWidgetProps> = ({ onViewChange }) => {
  const { state } = useGame();
  const isGM = state.gameMode === 'gm';

  return (
    <div>
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-3 mb-4">Finances</h3>
      <div className="px-3 space-y-2">
        {/* League funds is commissioner-only — GMs don't control league-wide funds. */}
        {!isGM && (
          <div className="flex items-center justify-between bg-slate-800/40 p-3 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-emerald-500" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">League</span>
            </div>
            <span className="font-mono text-xs font-bold text-emerald-400">{formatCurrency(state.stats.leagueFunds)}</span>
          </div>
        )}

        <button 
          onClick={() => onViewChange?.('Personal')}
          className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
            state.hasUnreadPayslip 
              ? 'bg-amber-500/20 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
              : 'bg-slate-800/40 border-slate-800/50 hover:bg-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2 relative">
            <User size={14} className={state.hasUnreadPayslip ? 'text-amber-400' : 'text-amber-500'} />
            <span className={`text-xs font-bold uppercase tracking-wider ${state.hasUnreadPayslip ? 'text-amber-400' : 'text-slate-400'}`}>Personal</span>
            {state.hasUnreadPayslip && (
              <span className="absolute -top-1 -right-2 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            )}
          </div>
          <span className={`font-mono text-xs font-bold ${state.hasUnreadPayslip ? 'text-amber-300' : 'text-amber-400'}`}>{formatCurrency(state.stats.personalWealth)}</span>
        </button>
      </div>
    </div>
  );
};
