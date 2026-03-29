import React from 'react';

interface SectionLabelProps {
  children: React.ReactNode;
  /** Optional left icon (any ReactNode, typically a small Lucide icon) */
  icon?: React.ReactNode;
  color?: 'slate' | 'amber' | 'sky' | 'emerald' | 'rose' | 'violet' | 'teal' | 'indigo';
  className?: string;
}

const COLOR_MAP: Record<NonNullable<SectionLabelProps['color']>, string> = {
  slate:   'text-slate-500',
  amber:   'text-amber-400',
  sky:     'text-sky-400',
  emerald: 'text-emerald-400',
  rose:    'text-rose-400',
  violet:  'text-violet-400',
  teal:    'text-teal-400',
  indigo:  'text-indigo-400',
};

/**
 * Tiny uppercase section divider label.
 * The repeating `text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2` pattern.
 *
 * @example
 * <SectionLabel>Eastern Conference</SectionLabel>
 * <SectionLabel icon={<AlertTriangle size={10} />} color="rose">Injured — Need Replacements</SectionLabel>
 */
export const SectionLabel: React.FC<SectionLabelProps> = ({
  children,
  icon,
  color = 'slate',
  className = '',
}) => (
  <p className={`text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 ${COLOR_MAP[color]} ${className}`}>
    {icon}
    {children}
  </p>
);
