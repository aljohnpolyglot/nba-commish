import React from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  tab: 'GAMEPLAN' | 'IDEAL' | 'SYSTEM' | 'COACHING' | 'PREFERENCES' | 'STAFF' | null;
  onClose: () => void;
  onDontShowAgain: () => void;
}

export function CoachingTabWelcomeModal({ open, tab, onClose, onDontShowAgain }: Props) {
  if (!open || !tab) return null;

  const contentByTab = {
    GAMEPLAN: {
      section: 'Gameplan',
      title: 'Gameplan Quick Start',
      body: 'This is your active next-game plan. Set who plays now based on current availability.',
    },
    IDEAL: {
      section: 'Ideal',
      title: 'Ideal Rotation Quick Start',
      body: 'This is your full-strength baseline without injuries. Build your best long-term version here.',
    },
    SYSTEM: {
      section: 'System',
      title: 'System Quick Start',
      body: 'Pick the style that matches your roster strengths on both ends.',
    },
    COACHING: {
      section: 'Strategy',
      title: 'Strategy Quick Start',
      body: 'Tune team behavior like tempo and shot mix to fit your roster.',
    },
    PREFERENCES: {
      section: 'Preferences',
      title: 'Preferences Quick Start',
      body: 'Set your key scorers and team tendencies for consistent possessions.',
    },
    STAFF: {
      section: 'Staff',
      title: 'Staff Quick Start',
      body: 'Review your staff quality and keep each role covered at a solid level.',
    },
  } as const;
  const content = contentByTab[tab];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-[#FDB927]/35 bg-slate-900 p-5 shadow-[0_0_60px_rgba(253,185,39,0.16)] sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#FDB927]">
              {content.section}
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">{content.title}</h2>
            <p className="mt-2 text-sm text-slate-300">{content.body}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-xs font-black uppercase tracking-widest text-slate-200 hover:bg-slate-700"
          >
            Close
          </button>
          <button
            onClick={onDontShowAgain}
            className="rounded-xl bg-[#FDB927] px-5 py-2 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-[#f3c54d]"
          >
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}
