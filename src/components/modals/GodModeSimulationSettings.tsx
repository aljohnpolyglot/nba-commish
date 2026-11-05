import React from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import type { LeagueStats } from '../../types';

const FACTOR_CONTROLS = [
  ['threePointTendencyFactor', '3PT Frequency'],
  ['threePointAccuracyFactor', '3PT Accuracy'],
  ['twoPointAccuracyFactor', '2PT Accuracy'],
  ['ftAccuracyFactor', 'FT Accuracy'],
  ['foulRateFactor', 'Foul Rate'],
  ['blockFactor', 'Blocks'],
  ['stealFactor', 'Steals'],
  ['turnoverFactor', 'Turnovers'],
  ['orbFactor', 'Offensive Rebounds'],
] as const satisfies readonly [keyof LeagueStats, string][];

const NEUTRAL_SIMULATION: Partial<LeagueStats> = {
  pace: 100,
  threePointTendencyFactor: 1,
  threePointAccuracyFactor: 1,
  twoPointAccuracyFactor: 1,
  ftAccuracyFactor: 1,
  foulRateFactor: 1,
  blockFactor: 1,
  stealFactor: 1,
  turnoverFactor: 1,
  orbFactor: 1,
  tragicDeathRateFactor: 1,
  injuryFrequencyFactor: 1,
  homeCourtAdvantage: 50,
};

interface GodModeSimulationSettingsProps {
  rules: LeagueStats;
  onPatch: (patch: Partial<LeagueStats>) => void;
}

interface NumberControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}

const NumberControl: React.FC<NumberControlProps> = ({ label, value, min, max, step, suffix, onChange }) => (
  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-950/35 p-3">
    <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">{label}</span>
    <span className="flex items-center gap-2">
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={event => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        className="w-20 rounded-lg border border-cyan-500/30 bg-slate-950 px-2 py-1.5 text-right font-mono text-xs font-bold text-cyan-200 outline-none transition-colors focus:border-cyan-400"
      />
      {suffix && <span className="w-4 text-[10px] font-bold text-slate-500">{suffix}</span>}
    </span>
  </label>
);

export const GodModeSimulationSettings: React.FC<GodModeSimulationSettingsProps> = ({ rules, onPatch }) => (
  <div className="space-y-4">
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white">
            <Activity size={17} className="text-cyan-300" />
            League Simulation
          </h3>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">
            Set the league-wide statistical environment. Team coaching and gameplans still determine how each club plays within it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPatch(NEUTRAL_SIMULATION)}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <NumberControl
        label="Pace"
        value={Number(rules.pace ?? 100)}
        min={1}
        max={400}
        step={1}
        onChange={pace => onPatch({ pace })}
      />
      {FACTOR_CONTROLS.map(([key, label]) => (
        <NumberControl
          key={key}
          label={label}
          value={Number(rules[key] ?? 1)}
          min={0}
          max={4}
          step={0.01}
          suffix="×"
          onChange={value => onPatch({ [key]: value })}
        />
      ))}
      <NumberControl
        label="Injury Frequency"
        value={Number(rules.injuryFrequencyFactor ?? 1)}
        min={0}
        max={10}
        step={0.1}
        suffix="×"
        onChange={injuryFrequencyFactor => onPatch({ injuryFrequencyFactor })}
      />
      <NumberControl
        label="Tragic Death Frequency"
        value={Number(rules.tragicDeathRateFactor ?? 1)}
        min={0}
        max={10}
        step={0.1}
        suffix="×"
        onChange={tragicDeathRateFactor => onPatch({ tragicDeathRateFactor })}
      />
      <label className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-950/35 p-3 sm:col-span-2">
        <span className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-wider text-slate-300">
          Home-Court Advantage
          <span className="rounded-lg bg-slate-950 px-2 py-1 font-mono text-xs text-cyan-200">
            {Math.max(0, Math.min(100, Number(rules.homeCourtAdvantage ?? 50)))}
          </span>
        </span>
        <input
          aria-label="God Mode Home-Court Advantage"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.max(0, Math.min(100, Number(rules.homeCourtAdvantage ?? 50)))}
          onChange={event => onPatch({ homeCourtAdvantage: Number(event.target.value) })}
          className="h-2 w-full cursor-pointer accent-cyan-400"
        />
        <span className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span>Neutral</span>
          <span>Standard</span>
          <span>Maximum</span>
        </span>
      </label>
    </div>
  </div>
);
