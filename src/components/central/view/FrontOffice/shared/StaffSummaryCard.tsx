import React from 'react';

type Accent = 'blue' | 'violet' | 'cyan' | 'orange';

const accentStyles: Record<Accent, { icon: string; bar: string; value: string; shadow: string }> = {
  blue: { icon: 'border-blue-400/35 bg-blue-500/10 text-blue-300', bar: 'bg-blue-400', value: 'text-blue-100', shadow: 'shadow-blue-950/20' },
  violet: { icon: 'border-violet-400/35 bg-violet-500/10 text-violet-300', bar: 'bg-violet-400', value: 'text-violet-100', shadow: 'shadow-violet-950/20' },
  cyan: { icon: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-300', bar: 'bg-cyan-400', value: 'text-cyan-100', shadow: 'shadow-cyan-950/20' },
  orange: { icon: 'border-orange-400/35 bg-orange-500/10 text-orange-300', bar: 'bg-orange-400', value: 'text-orange-100', shadow: 'shadow-orange-950/20' },
};

export const StaffSummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: Accent;
  progress: number;
}> = ({ icon, label, value, accent, progress }) => {
  const styles = accentStyles[accent];
  const activeSegments = Math.round(Math.max(0, Math.min(1, progress)) * 5);

  return (
    <div className={`rounded-xl border border-slate-700/70 bg-slate-900/80 p-4 shadow-lg ${styles.shadow}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${styles.icon}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-400">{label}</div>
          <div className={`mt-0.5 truncate text-lg font-black tabular-nums ${styles.value}`}>{value}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-1" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={`h-1 rounded-full ${index < activeSegments ? styles.bar : 'bg-slate-700/80'}`} />
        ))}
      </div>
    </div>
  );
};
