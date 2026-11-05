import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AnimatedInteger } from './AnimatedInteger';

interface OwnerApprovalBarProps {
  value: number;
  previous?: number;
  active?: boolean;
}

function approvalGrade(value: number): string {
  if (value >= 85) return 'A';
  if (value >= 70) return 'B';
  if (value >= 45) return 'C';
  if (value >= 25) return 'D';
  return 'F';
}

function sentiment(value: number): string {
  if (value >= 80) return 'Very Pleased';
  if (value >= 62) return 'Pleased';
  if (value >= 42) return 'Neutral';
  if (value >= 25) return 'Disappointed';
  return 'Very Disappointed';
}

export const OwnerApprovalBar: React.FC<OwnerApprovalBarProps> = ({ value, previous, active = true }) => {
  const reduceMotion = useReducedMotion();
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const previousSafe = previous == null ? null : Math.max(0, Math.min(100, Math.round(previous)));
  const change = previousSafe == null ? null : safe - previousSafe;
  const settled = active || reduceMotion;

  return (
    <div className="grid items-center gap-4 rounded-2xl border border-blue-400/35 bg-[#071628]/90 p-4 shadow-[inset_0_0_45px_rgba(30,64,175,0.08)] sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-6 sm:p-5">
      <div className="flex items-center justify-between border-b border-blue-300/15 pb-3 sm:block sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300/70">Overall Approval</p>
          <p className="modded-font-sport mt-1 text-5xl text-blue-400">{settled ? approvalGrade(safe) : '—'}</p>
        </div>
        {settled && (
          <div className="text-right sm:mt-2 sm:text-left">
            <p className="text-xs font-black uppercase text-blue-200">{sentiment(safe)}</p>
            {change != null && <p className={`mt-1 text-[10px] font-bold ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{change >= 0 ? '+' : ''}{change} this season</p>}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-end justify-between gap-3">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-blue-300/70">Ownership Sentiment</p>
          <p className="text-sm font-black text-white"><AnimatedInteger value={settled ? safe : 0} duration={1_250} suffix=" / 100" /></p>
        </div>
        <div
          role="progressbar"
          aria-label="Ownership sentiment"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={safe}
          className="relative h-4 rounded-full border border-white/15 bg-[linear-gradient(90deg,#ef4444_0%,#f97316_24%,#facc15_50%,#84cc16_74%,#10b981_100%)] shadow-[0_0_22px_rgba(37,99,235,0.15)]"
        >
          <motion.div
            initial={false}
            animate={{ width: settled ? `${safe}%` : '0%' }}
            transition={{ duration: reduceMotion ? 0 : 1.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 left-0 rounded-full bg-white/10"
          />
          {previousSafe != null && settled && (
            <span className="absolute top-1/2 h-6 w-px -translate-y-1/2 bg-white/35" style={{ left: `${previousSafe}%` }} aria-hidden="true" />
          )}
          <motion.span
            initial={false}
            animate={{ left: settled ? `${safe}%` : '0%' }}
            transition={{ duration: reduceMotion ? 0 : 1.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-300 shadow-[0_0_18px_rgba(255,255,255,0.7)]"
          />
          <div className="pointer-events-none absolute inset-0 grid grid-cols-10 overflow-hidden rounded-full">
            {Array.from({ length: 10 }, (_, index) => <span key={index} className="border-r border-slate-950/55 last:border-r-0" />)}
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[8px] font-black uppercase tracking-wide sm:text-[9px]">
          <span className="text-rose-400">Very Disappointed</span>
          <span className="text-amber-300">Neutral</span>
          <span className="text-emerald-400">Very Pleased</span>
        </div>
      </div>
    </div>
  );
};
