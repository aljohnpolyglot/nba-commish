import React from 'react';

export const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatter: (value: number) => string;
}> = ({ label, value, min, max, step, onChange, formatter }) => (
  <label className="block">
    <div className="flex justify-between text-sm mb-2">
      <span className="font-bold text-slate-300">{label}</span>
      <span className="font-black text-violet-300">{formatter(value)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-violet-400"
    />
  </label>
);
