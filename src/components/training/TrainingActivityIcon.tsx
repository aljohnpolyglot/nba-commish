import React from 'react';
import { Activity, Coffee, HeartPulse, Target, Trophy, Zap } from 'lucide-react';
import type { DayType, TrainingParadigm } from '../../TeamTraining/types';

interface Props {
  activity: DayType;
  paradigm?: TrainingParadigm;
  size?: number;
  hasUserPlan?: boolean;
}

// Custom playbook SVG — clipboard with X/O play diagram. Matches the
// playbook icon in the user's reference.
const PlaybookIcon: React.FC<{ size?: number; className?: string }> = ({ size = 32, className }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {/* Clipboard frame */}
    <rect x="6" y="5" width="20" height="23" rx="2" />
    <rect x="11" y="3" width="10" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.3" />
    <rect x="11" y="3" width="10" height="4" rx="1" />
    {/* Court lines */}
    <line x1="9" y1="13" x2="23" y2="13" opacity="0.5" />
    <line x1="9" y1="20" x2="23" y2="20" opacity="0.5" />
    {/* X marks (offensive players) */}
    <line x1="11" y1="10" x2="14" y2="13" />
    <line x1="14" y1="10" x2="11" y2="13" />
    <line x1="18" y1="22" x2="21" y2="25" />
    <line x1="21" y1="22" x2="18" y2="25" />
    {/* O marks (defensive players) */}
    <circle cx="20" cy="11.5" r="1.5" />
    <circle cx="13" cy="23.5" r="1.5" />
  </svg>
);

// Custom jersey-with-battery SVG — for full-training / structured-practice
// tiles. Matches the jersey-battery icon in the user's reference.
const JerseyBatteryIcon: React.FC<{ size?: number; className?: string }> = ({ size = 32, className }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {/* Jersey silhouette */}
    <path d="M9 8 L13 5 L19 5 L23 8 L26 11 L24 14 L22 13 L22 27 L10 27 L10 13 L8 14 L6 11 Z" />
    {/* Neck V-cut */}
    <path d="M13 5 L16 9 L19 5" />
    {/* Battery on chest */}
    <rect x="13" y="16" width="7" height="5" rx="0.5" />
    <line x1="20.5" y1="17.5" x2="20.5" y2="19.5" />
    {/* Lightning bolt inside battery */}
    <path d="M16.5 17 L15 19 L17 19 L16 21" strokeWidth={1.4} />
  </svg>
);

// Custom jersey-with-heal SVG — for recovery / recovery practice tiles.
const JerseyHealIcon: React.FC<{ size?: number; className?: string }> = ({ size = 32, className }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 8 L13 5 L19 5 L23 8 L26 11 L24 14 L22 13 L22 27 L10 27 L10 13 L8 14 L6 11 Z" />
    <path d="M13 5 L16 9 L19 5" />
    {/* Pulse line through chest */}
    <path d="M11 19 L14 19 L15 16 L17 22 L18 19 L21 19" strokeWidth={1.5} />
  </svg>
);

// Custom jersey-with-light SVG — for light practice tiles.
const JerseyLightIcon: React.FC<{ size?: number; className?: string }> = ({ size = 32, className }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 8 L13 5 L19 5 L23 8 L26 11 L24 14 L22 13 L22 27 L10 27 L10 13 L8 14 L6 11 Z" />
    <path d="M13 5 L16 9 L19 5" />
    {/* Single small dot (low intensity) */}
    <circle cx="16" cy="19" r="1.2" fill="currentColor" />
  </svg>
);

const ACTIVITY_META: Record<DayType, { color: string; render: (size: number) => React.ReactNode }> = {
  'Game': {
    color: 'text-rose-300',
    render: (s) => <Trophy size={s} />,
  },
  'Shootaround': {
    color: 'text-amber-300',
    render: (s) => <Target size={s} />,
  },
  'Off Day': {
    color: 'text-slate-500',
    render: (s) => <Coffee size={s} />,
  },
  'Recovery': {
    color: 'text-emerald-300',
    render: (s) => <JerseyHealIcon size={s} />,
  },
  'Recovery Practice': {
    color: 'text-emerald-300',
    render: (s) => <JerseyHealIcon size={s} />,
  },
  'Light Practice': {
    color: 'text-indigo-300',
    render: (s) => <JerseyLightIcon size={s} />,
  },
  'Balanced Practice': {
    color: 'text-sky-300',
    render: (s) => <PlaybookIcon size={s} />,
  },
  'Structured Practice': {
    color: 'text-purple-300',
    render: (s) => <JerseyBatteryIcon size={s} />,
  },
  'Full Training': {
    color: 'text-orange-300',
    render: (s) => <JerseyBatteryIcon size={s} />,
  },
};

const PARADIGM_OVERRIDE_COLOR: Record<TrainingParadigm, string> = {
  Balanced: 'text-sky-300',
  Offensive: 'text-rose-300',
  Defensive: 'text-indigo-300',
  Biometrics: 'text-purple-300',
  Recovery: 'text-emerald-300',
};

const PARADIGM_OVERRIDE_RENDER: Record<TrainingParadigm, (size: number) => React.ReactNode> = {
  Balanced:   (s) => <PlaybookIcon size={s} />,
  Offensive:  (s) => <PlaybookIcon size={s} />,
  Defensive:  (s) => <PlaybookIcon size={s} />,
  Biometrics: (s) => <JerseyBatteryIcon size={s} />,
  Recovery:   (s) => <JerseyHealIcon size={s} />,
};

export const TrainingActivityIcon: React.FC<Props> = ({ activity, paradigm, size = 32, hasUserPlan }) => {
  // User-set plans take precedence over the auto-scheduled activity for visuals.
  if (hasUserPlan && paradigm) {
    const color = PARADIGM_OVERRIDE_COLOR[paradigm];
    const render = PARADIGM_OVERRIDE_RENDER[paradigm];
    return <span className={color}>{render(size)}</span>;
  }
  const meta = ACTIVITY_META[activity] ?? ACTIVITY_META['Off Day'];
  return <span className={meta.color}>{meta.render(size)}</span>;
};

// Re-exported so other components (e.g. day view) can compose richer scenes.
export { PlaybookIcon, JerseyBatteryIcon, JerseyHealIcon, JerseyLightIcon };
