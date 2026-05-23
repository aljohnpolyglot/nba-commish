import React from 'react';

type ControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
};

export const SponsorshipControl: React.FC<ControlProps> = ({ label, value, min, max, step, fmt, onChange, disabled }) => (
  <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
      <span>{label}</span><span className="text-amber-300">{fmt(value)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseInt(e.target.value, 10))} className="w-full accent-amber-400" disabled={disabled} />
  </div>
);

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
