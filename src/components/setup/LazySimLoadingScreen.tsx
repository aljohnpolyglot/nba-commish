import React from 'react';
import { LazySimProgress } from '../../types';

interface LazySimLoadingScreenProps {
  progress: LazySimProgress;
}

const formatDate = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
};

export const LazySimLoadingScreen: React.FC<LazySimLoadingScreenProps> = ({ progress }) => {
  const pct = Math.min(99, progress.percentComplete);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center p-6">
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm w-full">

        {/* Circular progress ring */}
        <div className="relative w-32 h-32 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 128 128">
            {/* Track */}
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke="#1e293b"
              strokeWidth="8"
            />
            {/* Progress */}
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke="#6366f1"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
          </svg>
          <div className="flex flex-col items-center">
            <span className="text-2xl font-black text-white tabular-nums">{pct}%</span>
          </div>
        </div>

        {/* Phase label */}
        <div className="text-center">
          <p className="text-lg font-black text-white tracking-tight">{progress.currentPhase}</p>
          <p className="text-sm text-indigo-400 font-mono mt-1">{formatDate(progress.currentDate)}</p>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="flex gap-6 text-center">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">Days</div>
            <div className="text-sm font-black text-white tabular-nums">{progress.daysComplete} / {progress.daysTotal}</div>
          </div>
          <div className="w-px bg-slate-800" />
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">Target</div>
            <div className="text-sm font-black text-indigo-300 tabular-nums">{formatDate(progress.targetDate)}</div>
          </div>
        </div>

      </div>
    </div>
  );
};
