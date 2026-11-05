import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  remaining?: number;
}

export function OffseasonTaskRailFrame({ children, remaining }: Props) {
  return (
    <aside className="w-full shrink-0 space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 lg:w-[320px]">
      <header className="mb-2 flex items-start justify-between gap-3">
        <div>
          <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/80">
            Offseason
          </span>
          <h2 className="text-base font-black uppercase tracking-tight text-white">
            Tasks
          </h2>
        </div>
        {remaining != null && (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
            {remaining} left
          </span>
        )}
      </header>
      {children}
    </aside>
  );
}
