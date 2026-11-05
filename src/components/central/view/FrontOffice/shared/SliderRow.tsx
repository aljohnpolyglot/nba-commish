import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatter: (value: number) => string;
}> = ({ label, value, min, max, step, onChange, formatter }) => (
  <div className="block">
    <div className="flex justify-between text-sm mb-2">
      <span className="font-bold text-slate-300">{label}</span>
      <span className="font-black text-violet-300">{formatter(value)}</span>
    </div>
    <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/55 p-2">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={`Lower ${label}`}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-base font-black tabular-nums text-white">{formatter(value)}</span>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={`Raise ${label}`}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  </div>
);
