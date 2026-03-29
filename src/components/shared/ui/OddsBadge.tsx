import React from 'react';

interface OddsBadgeProps {
  odds: string;
  /** Highlight the favourite in accent colour (default false) */
  highlight?: boolean;
  /** Accent colour when highlighted (default 'indigo') */
  accentColor?: 'indigo' | 'teal' | 'amber' | 'emerald' | 'rose' | 'violet' | 'sky';
  className?: string;
}

const ACCENT_MAP: Record<NonNullable<OddsBadgeProps['accentColor']>, string> = {
  indigo:  'text-indigo-400',
  teal:    'text-teal-400',
  amber:   'text-amber-400',
  emerald: 'text-emerald-400',
  rose:    'text-rose-400',
  violet:  'text-violet-400',
  sky:     'text-sky-400',
};

/**
 * Compact odds display chip — the `+550 / ODDS` pattern in award race cards.
 *
 * @example
 * <OddsBadge odds="+120" highlight />
 * <OddsBadge odds="+550" accentColor="teal" highlight={index === 0} />
 */
export const OddsBadge: React.FC<OddsBadgeProps> = ({
  odds,
  highlight = false,
  accentColor = 'indigo',
  className = '',
}) => (
  <div className={`text-right shrink-0 ${className}`}>
    <div className={`text-lg font-black tracking-tighter ${highlight ? ACCENT_MAP[accentColor] : 'text-white'}`}>
      {odds}
    </div>
    <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Odds</div>
  </div>
);
