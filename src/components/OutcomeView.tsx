import React from 'react';
import { useGame } from '../store/GameContext';
import { X, TrendingUp, TrendingDown, Sparkles, DollarSign, Users, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SettingsManager } from '../services/SettingsManager';

export const OutcomeView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const { lastOutcome, lastConsequence } = state;

  const settings = SettingsManager.getSettings();
  if (!lastOutcome) return null;
  if (!settings.enableLLM || !(settings.showExecutiveOutcome ?? true)) return null;

  const handleClose = () => {
    dispatchAction({ type: 'CLEAR_OUTCOME' });
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[100] flex items-center justify-center p-6"
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-slate-900 border border-indigo-500/20 w-full max-w-3xl rounded-[3rem] shadow-2xl shadow-indigo-500/10 overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Sparkles className="text-white" size={24} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight uppercase">Executive Outcome</h2>
            </div>
            <button 
              onClick={handleClose}
              className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
            <div className="prose prose-invert max-w-none">
              <div className="relative mb-8">
                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-violet-500 rounded-full" />
                <p className="text-xl text-slate-100 leading-relaxed font-medium italic pl-4">
                  "{lastOutcome}"
                </p>
              </div>
              
              {lastConsequence && (
                <div className="space-y-8 mt-10">
                  <div className="bg-slate-800/50 p-8 rounded-[2rem] border border-slate-700/50">
                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-[0.2em] mb-4">Detailed Consequences</h3>
                    <p className="text-slate-300 leading-relaxed">
                      {lastConsequence.narrative}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Animated Progress Bars for Approvals */}
                    {[
                      { label: 'Public Approval', key: 'publicApproval', value: state.stats.publicApproval, change: lastConsequence.actualChanges?.publicApproval ?? lastConsequence.statChanges.morale?.fans ?? 0, color: 'bg-sky-500' },
                      { label: 'Owner Approval', key: 'ownerApproval', value: state.stats.ownerApproval, change: lastConsequence.actualChanges?.ownerApproval ?? lastConsequence.statChanges.morale?.owners ?? 0, color: 'bg-violet-500' },
                      { label: 'Player Approval', key: 'playerApproval', value: state.stats.playerApproval, change: lastConsequence.actualChanges?.playerApproval ?? lastConsequence.statChanges.morale?.players ?? 0, color: 'bg-amber-500' },
                      { label: 'Legacy', key: 'legacy', value: state.stats.legacy, change: lastConsequence.actualChanges?.legacy ?? lastConsequence.statChanges.legacy ?? 0, color: 'bg-rose-500' }
                    ].map((stat) => {
                      const prevValue = stat.value - stat.change;
                      return (
                        <div key={stat.label} className={`bg-slate-800/30 p-5 rounded-2xl border border-slate-800 flex flex-col gap-3 border-l-2 border-l-${stat.color.replace('bg-', '')}`}>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-slate-400">{prevValue.toFixed(1)}%</span>
                              <TrendingUp size={12} className="text-slate-600" />
                              <span className={`text-sm font-mono font-black ${stat.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{stat.value.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="h-2 bg-slate-950 rounded-full overflow-hidden relative">
                             {/* Previous Value Bar */}
                             <div 
                                className="absolute inset-y-0 left-0 bg-slate-700 opacity-30 transition-all duration-500"
                                style={{ width: `${Math.max(0, Math.min(100, prevValue))}%` }}
                             />
                             {/* Animated New Value Bar */}
                             <motion.div 
                                initial={{ width: `${Math.max(0, Math.min(100, prevValue))}%` }}
                                animate={{ width: `${Math.max(0, Math.min(100, stat.value))}%` }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                                className={`absolute inset-y-0 left-0 ${stat.color} shadow-[0_0_10px_rgba(255,255,255,0.2)]`}
                             />
                          </div>
                          {stat.change !== 0 && (
                            <div className={`text-[10px] font-bold uppercase tracking-wider text-right ${stat.change > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {stat.change > 0 ? '+' : ''}{stat.change.toFixed(1)}% Impact
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {(lastConsequence.actualChanges?.revenue ?? lastConsequence.statChanges.revenue) !== 0 && (
                      <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${(lastConsequence.actualChanges?.revenue ?? lastConsequence.statChanges.revenue) > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            <DollarSign size={16} />
                          </div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Revenue</span>
                        </div>
                        <span className={`font-mono font-bold ${(lastConsequence.actualChanges?.revenue ?? lastConsequence.statChanges.revenue) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(lastConsequence.actualChanges?.revenue ?? lastConsequence.statChanges.revenue) > 0 ? '+' : ''}${(lastConsequence.actualChanges?.revenue ?? lastConsequence.statChanges.revenue).toFixed(1)}M
                        </span>
                      </div>
                    )}

                    {(lastConsequence.actualChanges?.viewership ?? lastConsequence.statChanges.viewership) !== 0 && (
                      <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${(lastConsequence.actualChanges?.viewership ?? lastConsequence.statChanges.viewership) > 0 ? 'bg-sky-500/10 text-sky-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            <Users size={16} />
                          </div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Viewership</span>
                        </div>
                        <span className={`font-mono font-bold ${(lastConsequence.actualChanges?.viewership ?? lastConsequence.statChanges.viewership) > 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                          {(lastConsequence.actualChanges?.viewership ?? lastConsequence.statChanges.viewership) > 0 ? '+' : ''}{(lastConsequence.actualChanges?.viewership ?? lastConsequence.statChanges.viewership).toFixed(1)}M
                        </span>
                      </div>
                    )}
                  </div>

                  {lastConsequence.forcedTrade && (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-[2rem] flex items-center gap-6">
                      <div className="p-4 bg-amber-500 rounded-2xl text-white shadow-lg shadow-amber-500/20">
                        <Trophy size={24} />
                      </div>
                      <div>
                        <h4 className="text-amber-400 font-bold uppercase tracking-widest text-xs mb-1">Executive Order: Forced Trade</h4>
                        <p className="text-slate-200 font-bold">
                          {lastConsequence.forcedTrade.playerName} has been moved to the {lastConsequence.forcedTrade.destinationTeam}.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-8 bg-slate-950/50 border-t border-slate-800 flex justify-center">
            <button 
              onClick={handleClose}
              className="px-12 py-4 bg-white text-slate-950 font-black rounded-2xl hover:bg-slate-200 transition-all duration-200 uppercase tracking-widest text-sm shadow-xl"
            >
              Understood
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};


