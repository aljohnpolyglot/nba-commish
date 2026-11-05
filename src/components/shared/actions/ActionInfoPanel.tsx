import type { ReactNode } from 'react';

type InfoAccent = 'violet' | 'cyan' | 'emerald' | 'amber' | 'sky';

interface ActionInfoPanelProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  accent?: InfoAccent;
  aside?: ReactNode;
}

const accentClasses: Record<InfoAccent, string> = {
  violet: 'border-l-violet-400 bg-violet-500/[0.035] text-violet-300',
  cyan: 'border-l-cyan-400 bg-cyan-500/[0.035] text-cyan-300',
  emerald: 'border-l-emerald-400 bg-emerald-500/[0.035] text-emerald-300',
  amber: 'border-l-amber-400 bg-amber-500/[0.035] text-amber-300',
  sky: 'border-l-sky-400 bg-sky-500/[0.035] text-sky-300',
};

export function ActionInfoPanel({
  icon,
  title,
  children,
  accent = 'violet',
  aside,
}: ActionInfoPanelProps) {
  return (
    <section className={`flex flex-col gap-4 rounded-2xl border border-slate-700/60 border-l-2 p-5 sm:flex-row sm:items-center sm:p-6 ${accentClasses[accent]}`}>
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-600/60 bg-slate-950/30">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-black uppercase tracking-wide text-white sm:text-base">{title}</h3>
        <div className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-base">{children}</div>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </section>
  );
}
