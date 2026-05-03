import React from 'react';
import { Activity, Dumbbell, HeartPulse, Moon, Shield, Target, Zap } from 'lucide-react';
import type { Allocations, DayType, ScheduleDay, TrainingParadigm } from '../../TeamTraining/types';

interface TrainingPlanBadge {
  intensity: number;
  paradigm: TrainingParadigm;
  allocations: Allocations;
}

interface Props {
  plan?: TrainingPlanBadge;
  isGameDay?: boolean;
  scheduleDay?: ScheduleDay;
}

const PARADIGM_META: Record<TrainingParadigm, { label: string; className: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  Balanced: {
    label: 'BAL',
    className: 'bg-sky-500/85 text-white border-sky-300/40',
    icon: Activity,
  },
  Offensive: {
    label: 'OFF',
    className: 'bg-rose-500/85 text-white border-rose-300/40',
    icon: Zap,
  },
  Defensive: {
    label: 'DEF',
    className: 'bg-indigo-500/85 text-white border-indigo-300/40',
    icon: Shield,
  },
  Biometrics: {
    label: 'BIO',
    className: 'bg-purple-500/85 text-white border-purple-300/40',
    icon: Dumbbell,
  },
  Recovery: {
    label: 'REC',
    className: 'bg-emerald-500/85 text-white border-emerald-300/40',
    icon: HeartPulse,
  },
};

// Auto-scheduled days (no user plan, no game) — desaturated so the eye reads
// them as "system default" vs full-saturation user overrides. Every non-game
// DayType gets a badge so the calendar never has empty black cells.
const SCHEDULE_BADGE_META: Partial<Record<DayType, { label: string; className: string; icon: React.ComponentType<{ size?: number; className?: string }> }>> = {
  'Off Day': {
    label: 'REST',
    className: 'bg-slate-800/60 text-slate-400 border-slate-700/40',
    icon: Moon,
  },
  'Recovery': {
    label: 'REC',
    className: 'bg-emerald-700/40 text-emerald-300 border-emerald-500/30',
    icon: HeartPulse,
  },
  'Recovery Practice': {
    label: 'REC',
    className: 'bg-emerald-700/40 text-emerald-300 border-emerald-500/30',
    icon: HeartPulse,
  },
  'Light Practice': {
    label: 'LIGHT',
    className: 'bg-indigo-700/40 text-indigo-300 border-indigo-500/30',
    icon: Activity,
  },
  'Balanced Practice': {
    label: 'BAL',
    className: 'bg-sky-700/40 text-sky-300 border-sky-500/30',
    icon: Activity,
  },
  'Structured Practice': {
    label: 'STR',
    className: 'bg-purple-700/40 text-purple-300 border-purple-500/30',
    icon: Dumbbell,
  },
  'Full Training': {
    label: 'FULL',
    className: 'bg-orange-700/40 text-orange-300 border-orange-500/30',
    icon: Zap,
  },
  'Shootaround': {
    label: 'SHOOT',
    className: 'bg-amber-700/40 text-amber-300 border-amber-500/30',
    icon: Target,
  },
};

export const TrainingDayOverlay: React.FC<Props> = ({ plan, isGameDay, scheduleDay }) => {
  const scheduleMeta = scheduleDay ? SCHEDULE_BADGE_META[scheduleDay.activity] : undefined;
  if (!plan && !isGameDay && !scheduleMeta) return null;

  // User-set plan path — full saturation, includes intensity readout.
  if (plan) {
    const paradigm = plan.paradigm;
    const meta = PARADIGM_META[paradigm];
    const Icon = meta.icon;
    return (
      <div className="absolute left-1 right-1 bottom-1 z-20 flex items-center justify-center pointer-events-none">
        <div className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 shadow-lg shadow-black/30 ${meta.className}`}>
          <Icon size={10} className="shrink-0" />
          <span className="hidden md:inline text-[8px] font-black uppercase tracking-widest truncate">
            {meta.label}
          </span>
          <span className="text-[8px] font-mono font-black tabular-nums">
            {Math.round(plan.intensity)}
          </span>
        </div>
      </div>
    );
  }

  // Auto-scheduled rest / recovery / light — desaturated, no intensity number.
  if (scheduleMeta) {
    const Icon = scheduleMeta.icon;
    return (
      <div className="absolute left-1 right-1 bottom-1 z-20 flex items-center justify-center pointer-events-none">
        <div className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 opacity-80 ${scheduleMeta.className}`}>
          <Icon size={10} className="shrink-0" />
          <span className="hidden md:inline text-[8px] font-black uppercase tracking-widest truncate">
            {scheduleMeta.label}
          </span>
        </div>
      </div>
    );
  }

  // Game day with no user plan — let the cell's own game icons speak.
  return null;
};
