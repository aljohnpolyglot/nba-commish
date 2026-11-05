import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { LazySimProgress } from '../../types';
import { formatGameDateShort, parseGameDate } from '../../utils/dateUtils';
import { getLeagueStartupEstimatedCeiling } from '../../store/logic/leagueStartupProgress';
import { getVisibleLongSimProgress, subscribeLongSimProgress } from '../../services/simulation/longSimCoordinator';
import { resolveUserFacingSimulationText } from '../../services/simulation/targetPlanner';

interface LazySimLoadingScreenProps {
  progress: LazySimProgress;
}

const formatDate = (iso: string): string => {
  if (!iso) return '';
  const parsed = parseGameDate(iso);
  return Number.isFinite(parsed.getTime()) ? formatGameDateShort(parsed) : '';
};

export const LazySimLoadingScreen: React.FC<LazySimLoadingScreenProps> = ({ progress }) => {
  const streamedProgress = useSyncExternalStore(
    subscribeLongSimProgress,
    getVisibleLongSimProgress,
    () => undefined,
  );
  const liveProgress = progress.kind === 'league-start' || progress.kind === 'save-load'
    ? progress
    : streamedProgress ?? progress;
  const isSetupOrSaveLoad = liveProgress.kind === 'save-load' || liveProgress.kind === 'league-start';
  const rawPct = Number(liveProgress.percentComplete);
  const reportedPct = Math.max(0, Math.min(isSetupOrSaveLoad ? 100 : 99, Number.isFinite(rawPct) ? Math.round(rawPct) : 0));
  const [estimatedPct, setEstimatedPct] = useState(reportedPct);
  useEffect(() => {
    if (liveProgress.kind !== 'league-start') {
      setEstimatedPct(reportedPct);
      return;
    }
    setEstimatedPct(current => current > reportedPct + 10 ? reportedPct : Math.max(current, reportedPct));
    const ceiling = getLeagueStartupEstimatedCeiling(reportedPct);
    const timer = globalThis.setInterval(() => {
      setEstimatedPct(current => Math.max(reportedPct, Math.min(ceiling, current + 1)));
    }, 700);
    return () => globalThis.clearInterval(timer);
  }, [liveProgress.kind, reportedPct]);
  const pct = liveProgress.kind === 'league-start' ? estimatedPct : reportedPct;
  const currentDate = formatDate(liveProgress.currentDate);
  const targetDate = formatDate(liveProgress.targetDate);
  const finalStopDate = formatDate(liveProgress.finalStopDate ?? liveProgress.targetDate);
  const currentPhase = resolveUserFacingSimulationText(liveProgress.currentPhase) ?? 'Simulating season...';
  const targetSemanticName = resolveUserFacingSimulationText(liveProgress.targetSemanticName, undefined);
  const setupStep = Math.max(1, Math.min(liveProgress.daysTotal, Math.round(liveProgress.daysComplete)));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center p-6"
      data-testid="lazy-sim-loading"
      data-current-date={liveProgress.currentDate}
      data-days-complete={liveProgress.daysComplete}
      data-percent-complete={pct}
      data-current-phase={currentPhase}
    >
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
          {targetSemanticName && (
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
              {targetSemanticName}
            </p>
          )}
          <p className="text-lg font-black text-white tracking-tight">{currentPhase}</p>
          {(currentDate || targetDate) && (
            <p className="text-sm text-indigo-400 font-mono mt-1">{currentDate || targetDate}</p>
          )}
          {liveProgress.kind === 'league-start' && (
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">
              Setup step {setupStep} of {liveProgress.daysTotal}
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {!isSetupOrSaveLoad && (
          <div className="flex gap-6 text-center">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">Days</div>
              <div className="text-sm font-black text-white tabular-nums">{liveProgress.daysComplete} / {liveProgress.daysTotal}</div>
            </div>
            <div className="w-px bg-slate-800" />
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">Target</div>
              <div className="text-sm font-black text-indigo-300 tabular-nums">{finalStopDate}</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
