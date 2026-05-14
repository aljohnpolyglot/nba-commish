import React from 'react';
import { TrendingUp } from 'lucide-react';

export const Line: React.FC<{ label: string; value: number; fmt: (v: number) => string; sign?: 'in' | 'out'; emphasis?: boolean }> =
  ({ label, value, fmt, sign = 'in', emphasis }) => (
  <div className={`flex justify-between items-baseline ${emphasis ? 'pt-2 border-t border-slate-800' : ''}`}>
    <span className={`text-sm ${emphasis ? 'font-bold text-slate-200' : 'text-slate-400'}`}>{label}</span>
    <span className={`tabular-nums ${emphasis ? 'text-base font-bold' : 'text-sm font-semibold'} ${
      sign === 'out' ? 'text-rose-300' : 'text-emerald-300'
    }`}>
      {sign === 'out' ? '−' : ''}{fmt(Math.abs(value))}
    </span>
  </div>
);

export const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; subtitle: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-start gap-3">
    <div className="w-11 h-11 rounded-2xl border border-amber-400/30 bg-amber-400/10 flex items-center justify-center text-amber-300">
      {icon}
    </div>
    <div>
      <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>
      <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
    </div>
  </div>
);

export const ActivityIcon: React.FC = () => <TrendingUp size={18} />;
