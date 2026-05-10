/**
 * DashboardStatusBar — top-of-Dashboard summary in TrainingCenterView.
 *
 * Shows at-a-glance "what training are we doing today?" + "which systems
 * have we drilled?" + the Normal Default preset opener (edits the user's
 * personal regular-day template).
 */
import React from 'react';
import { Activity, Zap, Shield, Swords, RotateCcw } from 'lucide-react';
import type { NBATeam } from '../../types';
import { resolveEffectiveTrainingPlan } from '../../services/training/trainingPlanResolver';

interface Props {
  team: NBATeam;
  today: string;
  isReadOnly: boolean;
  onApplyNormalDefault: () => void;
}

export function DashboardStatusBar({ team, today, isReadOnly, onApplyNormalDefault }: Props) {
  const todayPlan = resolveEffectiveTrainingPlan(team, today);

  const fam = team.systemFamiliarity ?? { offense: 0, defense: 0 };
  // Top 3 across both sides of the ball — gives the user one look at where
  // their team is strongest. Filter out zero-entries.
  const allSystems: Array<{ name: string; score: number; side: 'off' | 'def' }> = [
    ...Object.entries(fam.byOffense ?? {}).map(([n, s]) => ({ name: n, score: s, side: 'off' as const })),
    ...Object.entries(fam.byDefense ?? {}).map(([n, s]) => ({ name: n, score: s, side: 'def' as const })),
  ].filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

  const paradigmColor: Record<string, string> = {
    Balanced: 'text-amber-300',
    Offensive: 'text-rose-300',
    Defensive: 'text-cyan-300',
    Biometrics: 'text-emerald-300',
    Recovery: 'text-violet-300',
  };

  return (
    <div className="bg-[#0d0d0d] border border-[#30363d] rounded-2xl p-4 md:p-5">
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
        {/* Today's plan */}
        <div className="flex items-center gap-3 lg:border-r lg:border-[#30363d] lg:pr-5 min-w-0">
          <div className="bg-[#FDB927]/10 border border-[#FDB927]/30 p-2 rounded-lg shrink-0">
            <Activity size={14} className="text-[#FDB927]" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Today</div>
            {todayPlan ? (
              <div className="text-xs md:text-sm font-bold">
                <span className={paradigmColor[todayPlan.paradigm] ?? 'text-white'}>{todayPlan.paradigm}</span>
                <span className="text-slate-500 mx-1">·</span>
                <span className="text-white tabular-nums">{todayPlan.intensity}%</span>
              </div>
            ) : (
              <div className="text-xs md:text-sm font-bold text-slate-500 italic">No plan (rest day)</div>
            )}
          </div>
        </div>

        {/* Top systems */}
        <div className="flex items-center gap-3 lg:border-r lg:border-[#30363d] lg:pr-5 lg:flex-1 min-w-0">
          <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded-lg shrink-0">
            <Zap size={14} className="text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Top Systems Drilled</div>
            {allSystems.length === 0 ? (
              <div className="text-[11px] text-slate-500 italic">No reps yet — pick systems in the day editor.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allSystems.map(s => (
                  <span
                    key={s.name + s.side}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      s.side === 'off'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                    }`}
                  >
                    {s.side === 'off' ? <Swords size={9} className="inline mr-1" /> : <Shield size={9} className="inline mr-1" />}
                    {s.name}
                    <span className="ml-1 text-slate-400 tabular-nums">{Math.round(s.score)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            disabled={isReadOnly}
            onClick={onApplyNormalDefault}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors ${
              isReadOnly
                ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-amber-500/40 hover:text-amber-300'
            }`}
            title="Edit your Normal Day template — applied to every regular practice day."
          >
            <RotateCcw size={12} />
            Normal Default
          </button>
        </div>
      </div>
    </div>
  );
}
