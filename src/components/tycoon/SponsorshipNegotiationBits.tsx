import React from 'react';

type ControlProps = {
  label: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
};

export const SponsorshipControl: React.FC<ControlProps> = ({ label, value, min, max, step, fmt, onChange, disabled }) => {
  const applyValue = (next: number) => onChange(Math.max(min, max == null ? next : Math.min(max, next)));
  return (
  <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
    <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
      <span>{label}</span><span className="text-amber-300 tabular-nums">{fmt(value)}</span>
    </div>
    <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
      <button type="button" onClick={() => applyValue(value - step)} disabled={disabled || value <= min} className="h-11 rounded-lg border border-slate-700 bg-slate-950 text-lg font-black text-slate-300 disabled:opacity-35">−</button>
      <div className="flex h-11 min-w-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-3 text-center text-sm font-black tabular-nums text-white" aria-label={label}>
        {fmt(value)}
      </div>
      <button type="button" onClick={() => applyValue(value + step)} disabled={disabled || (max != null && value >= max)} className="h-11 rounded-lg border border-slate-700 bg-slate-950 text-lg font-black text-slate-300 disabled:opacity-35">+</button>
    </div>
  </div>
  );
};

type DiffRowProps = {
  label: string;
  current?: number;
  next: number;
  fmt?: (v: number) => string;
  suffix?: string;
};

export const SponsorshipDiffRow: React.FC<DiffRowProps> = ({ label, current, next, fmt, suffix = '' }) => {
  const c = current ?? 0;
  const delta = next - c;
  const render = (v: number) => fmt ? fmt(v) : `${v}${suffix}`;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-white font-bold">{render(next)}</span>
      <span className={`text-[10px] font-black ${delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
        {delta >= 0 ? '+' : ''}{fmt ? fmt(delta) : `${delta}${suffix}`}
      </span>
    </div>
  );
};
