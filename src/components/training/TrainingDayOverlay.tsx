import React from 'react';
import { Activity, Dumbbell, HeartPulse, Shield, Zap } from 'lucide-react';
import type { Allocations, TrainingParadigm } from '../../TeamTraining/types';

interface TrainingPlanBadge {
  intensity: number;
  paradigm: TrainingParadigm;
  allocations: Allocations;
}

interface Props {
  plan?: TrainingPlanBadge;
  isGameDay?: boolean;
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

export const TrainingDayOverlay: React.FC<Props> = ({ plan, isGameDay }) => {
  if (!plan && !isGameDay) return null;

  const paradigm = plan?.paradigm ?? 'Balanced';
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
          {Math.round(plan?.intensity ?? 25)}
        </span>
      </div>
    </div>
  );
};
