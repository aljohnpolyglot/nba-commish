import React from 'react';
import { Clock, CheckCircle, XCircle, Plus } from 'lucide-react';
import { decimalToAmerican, decimalToAmericanNum } from './sportsbookTypes';

/* ─── OddsButton ─────────────────────────────────────────────── */
export const OddsButton = ({
  odds, label, selected, onClick, size = 'md', wide = false
}: {
  odds: number; label?: string; selected: boolean;
  onClick: () => void; size?: 'sm' | 'md'; wide?: boolean;
}) => {
  const american = decimalToAmerican(odds);
  const isPos = decimalToAmericanNum(odds) > 0;
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center transition-all duration-200 rounded-lg border font-mono font-bold select-none
        ${size === 'sm' ? 'px-2 py-2 text-xs' : 'px-4 py-2.5 text-sm'}
        ${wide ? 'flex-1' : 'min-w-[60px]'}
        ${selected
          ? 'bg-emerald-500 border-emerald-400 text-white shadow-[0_0_16px_rgba(16,185,129,0.35)]'
          : 'bg-slate-800/70 border-slate-700/60 text-amber-400 hover:bg-slate-700/80 hover:border-slate-600'
        }`}
    >
      {label && (
        <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${selected ? 'text-emerald-100' : 'text-slate-400'}`}>
          {label}
        </span>
      )}
      <span className={selected ? 'text-white' : isPos ? 'text-amber-400' : 'text-slate-300'}>
        {american}
      </span>
    </button>
  );
};

/* ─── TabButton ──────────────────────────────────────────────── */
export const TabButton = ({ active, onClick, icon: Icon, label, badge }: {
  active: boolean; onClick: () => void;
  icon: any; label: string; badge?: number;
}) => (
  <button
    onClick={onClick}
    className={`relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-widest transition-all duration-200 border-b-2 whitespace-nowrap
      ${active
        ? 'text-emerald-400 border-emerald-500 bg-emerald-500/5'
        : 'text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-600'
      }`}
  >
    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
    <span className="hidden xs:inline">{label}</span>
    <span className="xs:hidden">{label.split(' ')[0]}</span>
    {badge !== undefined && badge > 0 && (
      <span className="bg-emerald-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
        {badge}
      </span>
    )}
  </button>
);

/* ─── StatusBadge ────────────────────────────────────────────── */
export const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { cls: string; label: string; Icon: any }> = {
    pending: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',      label: 'Pending', Icon: Clock       },
    won:     { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: 'Won',     Icon: CheckCircle },
    lost:    { cls: 'bg-rose-500/15 text-rose-400 border-rose-500/20',          label: 'Lost',    Icon: XCircle     },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${cfg.cls}`}>
      <cfg.Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
};

/* ─── EmptyState ─────────────────────────────────────────────── */
export const EmptyState = ({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-600 mb-4">
      {icon}
    </div>
    <p className="text-slate-300 font-bold text-lg mb-1">{title}</p>
    <p className="text-slate-500 text-sm max-w-xs">{body}</p>
  </div>
);

/* ─── SlipEmptyPlaceholder ───────────────────────────────────── */
export const SlipEmptyPlaceholder = () => (
  <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
    <div className="w-12 h-12 rounded-full bg-slate-800/60 flex items-center justify-center mb-3">
      <Plus className="w-5 h-5 text-slate-600" />
    </div>
    <p className="text-slate-500 text-xs font-medium">Click any odds button<br />to add a selection</p>
  </div>
);
