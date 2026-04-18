import React from 'react';
import { TrendingUp } from 'lucide-react';
import { useGame } from '../../store/GameContext';

interface InflationEditorProps {
  /** Compact inline layout (used inside SettingsModal). Default false = full panel. */
  compact?: boolean;
}

export const InflationEditor: React.FC<InflationEditorProps> = ({ compact = false }) => {
  const { state, dispatchAction } = useGame();
  const ls = state.leagueStats;

  const enabled = ls.inflationEnabled ?? true;
  const min     = ls.inflationMin     ?? 0;
  const max     = ls.inflationMax     ?? 10;
  const avg     = ls.inflationAverage ?? 5.5;
  const std     = ls.inflationStdDev  ?? 2.0;

  const update = (patch: Partial<typeof ls>) => {
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: { leagueStats: { ...ls, ...patch } },
    } as any);
  };

  const wrapperCls = compact
    ? 'p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3'
    : 'p-5 bg-slate-900/60 rounded-2xl border border-slate-700/30 space-y-4';

  return (
    <div className={wrapperCls}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-white flex items-center gap-2">
          <TrendingUp size={16} className={enabled ? 'text-emerald-400' : 'text-slate-500'} />
          Cap Inflation
        </label>
        <button
          onClick={() => update({ inflationEnabled: !enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-emerald-500' : 'bg-slate-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Each offseason the cap, luxury tax, aprons, min contract, and media rights inflate by a random % drawn from a truncated Gaussian.
      </p>

      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Min %</span>
              <input
                type="number" min="0" max={max} step="0.5" value={min}
                onChange={e => update({ inflationMin: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white text-sm py-1.5 px-3 focus:outline-none focus:border-emerald-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Max %</span>
              <input
                type="number" min={min} max="20" step="0.5" value={max}
                onChange={e => update({ inflationMax: Math.max(min, parseFloat(e.target.value) || 0) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white text-sm py-1.5 px-3 focus:outline-none focus:border-emerald-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Avg %</span>
              <input
                type="number" min={min} max={max} step="0.1" value={avg}
                onChange={e => update({ inflationAverage: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white text-sm py-1.5 px-3 focus:outline-none focus:border-emerald-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Std Dev %</span>
              <input
                type="number" min="0" max="5" step="0.1" value={std}
                onChange={e => update({ inflationStdDev: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg text-white text-sm py-1.5 px-3 focus:outline-none focus:border-emerald-500"
              />
            </label>
          </div>
          <p className="text-[10px] text-slate-500 italic">
            ~{avg}% ± {std}%, clamped to {min}%–{max}%.
          </p>
        </>
      )}
    </div>
  );
};
