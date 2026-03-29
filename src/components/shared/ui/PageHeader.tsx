import React from 'react';

interface PageHeaderProps {
  /** Lucide icon element or any ReactNode shown in the accent bubble */
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Accent colour key — used for the icon bubble (default 'indigo') */
  color?: 'indigo' | 'amber' | 'sky' | 'emerald' | 'rose' | 'violet' | 'teal' | 'slate';
  /** Optional right-side slot: buttons, tabs, filters, etc. */
  right?: React.ReactNode;
  className?: string;
}

const COLOR_MAP: Record<NonNullable<PageHeaderProps['color']>, string> = {
  indigo:  'bg-indigo-500/10  border-indigo-500/20  text-indigo-400',
  amber:   'bg-amber-500/10   border-amber-500/20   text-amber-400',
  sky:     'bg-sky-500/10     border-sky-500/20     text-sky-400',
  emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  rose:    'bg-rose-500/10    border-rose-500/20    text-rose-400',
  violet:  'bg-violet-500/10  border-violet-500/20  text-violet-400',
  teal:    'bg-teal-500/10    border-teal-500/20    text-teal-400',
  slate:   'bg-slate-800      border-slate-700      text-slate-400',
};

/**
 * Consistent page-level header used across all major views.
 *
 * Layout: icon bubble | title + subtitle | [right slot]
 *
 * @example
 * <PageHeader
 *   icon={<Trophy size={24} />}
 *   title="Award Races"
 *   subtitle="Live betting-style odds for the league's top honours"
 *   color="amber"
 *   right={<TabBar ... />}
 * />
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  icon,
  title,
  subtitle,
  color = 'indigo',
  right,
  className = '',
}) => {
  const bubbleClass = COLOR_MAP[color];

  return (
    <div className={`p-6 md:p-8 border-b border-slate-800 bg-slate-900/50 ${className}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl border shrink-0 ${bubbleClass}`}>
            {icon}
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
              {title}
            </h2>
            {subtitle && (
              <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  );
};
