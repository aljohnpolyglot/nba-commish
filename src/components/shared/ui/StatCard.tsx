import React from 'react';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  subValue?: string;
  /** Accent colour key */
  color?: 'indigo' | 'amber' | 'sky' | 'emerald' | 'rose' | 'violet' | 'teal' | 'slate';
  /** Optional % trend shown top-right */
  trend?: number;
  onClick?: () => void;
  className?: string;
}

const COLOR_MAP: Record<NonNullable<StatCardProps['color']>, { icon: string; bg: string }> = {
  indigo:  { icon: 'text-indigo-400',  bg: 'bg-indigo-500/10'  },
  amber:   { icon: 'text-amber-400',   bg: 'bg-amber-500/10'   },
  sky:     { icon: 'text-sky-400',     bg: 'bg-sky-500/10'     },
  emerald: { icon: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  rose:    { icon: 'text-rose-400',    bg: 'bg-rose-500/10'    },
  violet:  { icon: 'text-violet-400',  bg: 'bg-violet-500/10'  },
  teal:    { icon: 'text-teal-400',    bg: 'bg-teal-500/10'    },
  slate:   { icon: 'text-slate-400',   bg: 'bg-slate-800'      },
};

/**
 * Dashboard-style stat card with icon bubble, label, value, optional trend badge.
 *
 * @example
 * <StatCard icon={DollarSign} label="Expected Revenue" value="$14.3B" color="emerald" trend={2.1} onClick={openRevenue} />
 */
export const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  label,
  value,
  subValue,
  color = 'indigo',
  trend,
  onClick,
  className = '',
}) => {
  const { icon: iconClass, bg } = COLOR_MAP[color];

  return (
    <div
      onClick={onClick}
      className={`bg-slate-900/50 border border-slate-800 p-5 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm hover:border-slate-700 transition-all duration-300 group relative overflow-hidden
        ${onClick ? 'cursor-pointer hover:bg-slate-800/80' : ''}
        ${className}`}
    >
      {/* Glow blob */}
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 opacity-5 rounded-full ${bg} group-hover:scale-125 transition-transform duration-500`} />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className={`p-2.5 rounded-xl ${bg} border border-white/5 group-hover:scale-110 transition-transform duration-300`}>
          <Icon size={18} className={iconClass} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-bold ${trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>

      <div className="relative z-10">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        {subValue && <p className="text-xs text-slate-500 mt-0.5">{subValue}</p>}
      </div>
    </div>
  );
};
