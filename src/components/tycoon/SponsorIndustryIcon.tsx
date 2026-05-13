import React from 'react';
import type { SponsorIndustry } from '../../types/tycoon';

type IndustryKey = SponsorIndustry | 'generic';

const TINT: Record<IndustryKey, string> = {
  airline:        'from-sky-500/30 to-sky-900/50 text-sky-200',
  tech:           'from-violet-500/30 to-violet-900/50 text-violet-200',
  fashion:        'from-pink-500/30 to-pink-900/50 text-pink-200',
  bank:           'from-emerald-500/30 to-emerald-900/50 text-emerald-200',
  auto:           'from-orange-500/30 to-orange-900/50 text-orange-200',
  telecom:        'from-blue-500/30 to-blue-900/50 text-blue-200',
  beer:           'from-amber-500/30 to-amber-900/50 text-amber-200',
  water:          'from-cyan-500/30 to-cyan-900/50 text-cyan-200',
  energy_drink:   'from-red-500/30 to-red-900/50 text-red-200',
  gambling:       'from-rose-500/30 to-rose-900/50 text-rose-200',
  sportswashing:  'from-yellow-500/30 to-yellow-900/50 text-yellow-200',
  generic:        'from-slate-500/30 to-slate-900/50 text-slate-300',
};

const PATHS: Record<IndustryKey, React.ReactNode> = {
  airline: <path d="M2 16l20-7-9 20-2-9-9-4z" />,
  tech: <path d="M4 7h16v10H4zM2 17h20v2H2z" />,
  fashion: <path d="M7 4l2 4 3-2 3 2 2-4 4 4-4 4v8H6v-8L2 8z" />,
  bank: <path d="M3 10h18l-9-6zM5 11v7M11 11v7M17 11v7M3 20h18v2H3z" />,
  auto: <path d="M3 14l2-5h14l2 5v5h-2v-1H5v1H3zm3.5 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm11 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />,
  telecom: <path d="M12 3a9 9 0 019 9h-2a7 7 0 00-7-7zm0 4a5 5 0 015 5h-2a3 3 0 00-3-3zM4 5l3 1 2 4-2 1c1 3 4 6 7 7l1-2 4 2 1 3-2 2c-9 0-16-7-16-16z" />,
  beer: <path d="M5 4h11v3h2a3 3 0 010 6h-2v8H5zm11 8h2a1 1 0 000-2h-2z" />,
  water: <path d="M12 2c4 5 6 9 6 12a6 6 0 11-12 0c0-3 2-7 6-12z" />,
  energy_drink: <path d="M13 2L4 14h6l-1 8 9-12h-6z" />,
  gambling: <path d="M12 2l3 5h-2v3h-2V7H9zm-7 9h5v5H5zm9 0h5v5h-5zm-4.5 7h5v4h-5z" />,
  sportswashing: <path d="M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z" />,
  generic: <path d="M12 2l10 6v8l-10 6L2 16V8z" />,
};

export const SponsorIndustryIcon: React.FC<{ industry?: IndustryKey; size?: number }> = ({ industry, size = 56 }) => {
  const key: IndustryKey = (industry ?? 'generic') as IndustryKey;
  return (
    <div
      className={`rounded-lg bg-gradient-to-br ${TINT[key] ?? TINT.generic} flex items-center justify-center border border-white/10`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor" aria-hidden>
        {PATHS[key] ?? PATHS.generic}
      </svg>
    </div>
  );
};
