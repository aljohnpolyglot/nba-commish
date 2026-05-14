import React from 'react';

export const FacilityKpi: React.FC<{ icon: React.ReactNode; label: string; value: string; sub: string }> = ({ icon, label, value, sub }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex items-center gap-4">
    <div className="w-12 h-12 rounded-full border border-slate-700 bg-slate-950/80 flex items-center justify-center text-slate-300">{icon}</div>
    <div>
      <div className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-xl font-black text-white tabular-nums mt-1">{value}</div>
      <div className="text-xs text-slate-400">{sub}</div>
    </div>
  </div>
);
