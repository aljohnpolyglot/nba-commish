import React from 'react';
import { HeartPulse, Shield, Swords, Users, Zap } from 'lucide-react';
import type { Allocations, TrainingParadigm } from '../types';

export const PARADIGM_DEFAULT_SYSTEMS: Record<TrainingParadigm, string[]> = {
  Balanced: ['Pace and Space', 'Man-to-Man'],
  Offensive: ['Pace and Space', 'Five-Out Drive', 'Man-to-Man'],
  Defensive: ['Pace and Space', 'Drop Coverage', 'Man-to-Man'],
  Biometrics: [],
  Recovery: [],
};

export const PARADIGM_TEMPLATES: Record<TrainingParadigm, { label: string; intensity: number; allocations: Allocations; icon: React.ReactNode; color: string; tooltip: string }> = {
  Balanced: {
    label: 'Balanced Practice',
    intensity: 50,
    allocations: { offense: 30, defense: 30, conditioning: 20, recovery: 20 },
    icon: <Zap size={20} />,
    color: 'sky',
    tooltip: 'Balanced practice keeps both sides of the ball sharp.',
  },
  Offensive: {
    label: 'Offense First',
    intensity: 50,
    allocations: { offense: 60, defense: 10, conditioning: 10, recovery: 20 },
    icon: <Swords size={20} />,
    color: 'rose',
    tooltip: 'Extra reps for spacing, pace, and execution on offense.',
  },
  Defensive: {
    label: 'Defense First',
    intensity: 50,
    allocations: { offense: 10, defense: 60, conditioning: 10, recovery: 20 },
    icon: <Shield size={20} />,
    color: 'indigo',
    tooltip: 'Extra reps for coverages, rotations, and stops.',
  },
  Biometrics: {
    label: 'Conditioning',
    intensity: 50,
    allocations: { offense: 10, defense: 10, conditioning: 60, recovery: 20 },
    icon: <Users size={20} />,
    color: 'purple',
    tooltip: 'Focuses on strength, movement, and staying physically ready.',
  },
  Recovery: {
    label: 'Recovery',
    intensity: 15,
    allocations: { offense: 5, defense: 5, conditioning: 10, recovery: 80 },
    icon: <HeartPulse size={20} />,
    color: 'violet',
    tooltip: 'Keeps legs fresh with light work and film.',
  },
};

export const ACCENT_CLASSES = {
  sky: { iconBg: 'bg-sky-600/20', iconText: 'text-sky-400' },
  orange: { iconBg: 'bg-orange-600/20', iconText: 'text-orange-400' },
  emerald: { iconBg: 'bg-emerald-600/20', iconText: 'text-emerald-400' },
  indigo: { iconBg: 'bg-indigo-600/20', iconText: 'text-indigo-400' },
  rose: { iconBg: 'bg-rose-600/20', iconText: 'text-rose-400' },
} as const;

export const PARADIGM_ACTIVE_CLASSES: Record<TrainingParadigm, string> = {
  Balanced: 'bg-sky-500/15 border-sky-400/60 ring-1 ring-sky-400/30 shadow-lg shadow-sky-900/20',
  Offensive: 'bg-rose-500/15 border-rose-400/60 ring-1 ring-rose-400/30 shadow-lg shadow-rose-900/20',
  Defensive: 'bg-indigo-500/15 border-indigo-400/60 ring-1 ring-indigo-400/30 shadow-lg shadow-indigo-900/20',
  Biometrics: 'bg-purple-500/15 border-purple-400/60 ring-1 ring-purple-400/30 shadow-lg shadow-purple-900/20',
  Recovery: 'bg-violet-500/15 border-violet-400/60 ring-1 ring-violet-400/30 shadow-lg shadow-violet-900/20',
};

export const PARADIGM_CHECK_TEXT: Record<TrainingParadigm, string> = {
  Balanced: 'text-sky-200',
  Offensive: 'text-rose-200',
  Defensive: 'text-indigo-200',
  Biometrics: 'text-purple-200',
  Recovery: 'text-violet-200',
};

export const getIntensityDescription = (paradigm: TrainingParadigm, intensity: number) => {
  const descriptions: Record<TrainingParadigm, Record<string, string>> = {
    Balanced: {
      low: 'Film study, walk-throughs',
      mid: 'Competitive drills, balanced reps',
      high: 'Full-speed 5v5, game intensity',
    },
    Offensive: {
      low: 'Offensive film, spacing work',
      mid: 'Live offensive sets, game speed',
      high: 'Explosive 5v5 offense, max reps',
    },
    Defensive: {
      low: 'Defensive schemes, closeouts',
      mid: 'Live defensive 5v5, pressure',
      high: 'Full-speed defense, game intensity',
    },
    Biometrics: {
      low: 'Mobility, flexibility, prehab',
      mid: 'Speed & strength drills',
      high: 'Max effort vertical, plyometrics',
    },
    Recovery: {
      low: 'Film study, light treatment',
      mid: 'Film study, light activation',
      high: 'Film study, mobility work',
    },
  };

  const bracket = intensity < 40 ? 'low' : intensity < 70 ? 'mid' : 'high';
  return descriptions[paradigm][bracket];
};
