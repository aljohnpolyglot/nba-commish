import React from 'react';

export interface StatPill {
  label: string;
  val: string;
}

interface StatPillsProps {
  stats: StatPill[];
  /** Visual size of each pill (default 'sm') */
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * Horizontal row of stat pills — the PPG/RPG/APG pattern repeated across award cards, rosters, etc.
 *
 * @example
 * <StatPills stats={[{ label: 'PTS', val: '24.3' }, { label: 'REB', val: '8.1' }, { label: 'AST', val: '6.2' }]} />
 */
export const StatPills: React.FC<StatPillsProps> = ({ stats, size = 'sm', className = '' }) => {
  const labelClass = size === 'xs' ? 'text-[9px]' : 'text-[10px]';
  const valClass   = size === 'xs' ? 'text-[10px]' : 'text-xs';

  return (
    <div className={`flex gap-3 ${className}`}>
      {stats.map(({ label, val }) => (
        <div key={label} className={`${labelClass} uppercase tracking-tighter`}>
          <span className="text-slate-500">{label}</span>
          <div className={`${valClass} font-bold text-slate-300`}>{val}</div>
        </div>
      ))}
    </div>
  );
};
