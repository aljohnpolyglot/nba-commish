import React from 'react';
import { Shield } from 'lucide-react';
import type { TycoonState } from '../../../../../types/tycoon';

export const BoardPromisesCard: React.FC<{ tycoon: TycoonState }> = ({ tycoon }) => {
  const confidence = tycoon.boardConfidence ?? 60;
  const promises = (tycoon.boardPromises ?? []).slice(-3);
  const tone = confidence >= 70 ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
    : confidence >= 40 ? 'text-amber-300 border-amber-400/30 bg-amber-400/10'
    : 'text-rose-300 border-rose-400/30 bg-rose-400/10';
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><Shield size={16} /> Board Confidence</div>
          <div className="mt-2 flex items-end gap-3">
            <div className={`rounded-xl border px-4 py-3 text-3xl font-black tabular-nums ${tone}`}>{confidence}/100</div>
            <div className="text-sm text-slate-400 pb-2">{confidence < 25 ? 'Ownership pressure is active.' : confidence < 45 ? 'Board expects a cleaner run.' : 'Board room is stable.'}</div>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3 flex-1">
          {promises.map((promise: any) => (
            <div key={promise.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{promise.status}</div>
                <div className={`text-[10px] font-black uppercase tracking-widest ${promise.status === 'kept' ? 'text-emerald-300' : promise.status === 'missed' ? 'text-rose-300' : 'text-amber-300'}`}>
                  {Math.round((promise.progress ?? 0) * 100)}%
                </div>
              </div>
              <div className="mt-2 text-sm font-black text-white">{promise.label}</div>
              <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-300" style={{ width: `${Math.max(4, Math.min(100, (promise.progress ?? 0) * 100))}%` }} />
              </div>
            </div>
          ))}
          {promises.length === 0 && (
            <div className="md:col-span-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
              Board promises will be issued on the next Euro tycoon tick.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
