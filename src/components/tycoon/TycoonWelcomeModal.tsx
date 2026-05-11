import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Building2, Handshake, Wallet } from 'lucide-react';

const STORAGE_KEY = 'tycoon_welcome_seen_v1';

export function hasSeenTycoonWelcome(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true; // fail-closed: don't spam the modal if storage is blocked
  }
}

export function markTycoonWelcomeSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

interface Slide {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    icon: <Building2 size={28} className="text-amber-400" />,
    eyebrow: 'Welcome to Spain',
    title: 'Your club has a budget, not a cap.',
    body: (
      <>
        <p>European basketball doesn't run on a salary cap — it runs on <strong className="text-amber-300">cash flow</strong>. Every club has a Tier (S/A/B/C/D) that determines its baseline revenue: stadium capacity, TV deal, sponsor floor.</p>
        <p className="mt-3 text-slate-400">Real Madrid is a Tier S club. San Pablo Burgos is Tier B. The gap shows up in the ledger, every season.</p>
      </>
    ),
  },
  {
    icon: <Handshake size={28} className="text-amber-400" />,
    eyebrow: 'Sponsorship Slots',
    title: 'Three deals to manage: Kit, Sleeve, Stadium.',
    body: (
      <>
        <p>Each slot has a sponsor with a multi-year deal. When a deal runs out, you negotiate: <strong className="text-emerald-300">accept</strong> the market offer or <strong className="text-rose-300">decline</strong> and fall back to a default fallback (much lower).</p>
        <p className="mt-3">Win Endesa or reach the EuroLeague Final Four and your sponsors offer mid-term bonuses. Lose 5 in a row and they pull back next renewal.</p>
      </>
    ),
  },
  {
    icon: <Wallet size={28} className="text-amber-400" />,
    eyebrow: 'Year-End Ledger',
    title: 'Profit each season. Watch the FFP deficit.',
    body: (
      <>
        <p>At every season's end, your club's Annual Ledger is calculated — revenue from matchday, sponsorship, TV, prize pool, minus wages, staff, facility ops, travel.</p>
        <p className="mt-3">Three years of losses stack into your <strong className="text-amber-300">FFP rolling deficit</strong>. Run too deep into the red and the league steps in — transfer bans, point deductions, eventually disqualification.</p>
        <p className="mt-3 text-slate-400">Cash on Hand carries year-to-year. Make smart deals.</p>
      </>
    ),
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export const TycoonWelcomeModal: React.FC<Props> = ({ open, onClose }) => {
  const [slideIndex, setSlideIndex] = useState(0);

  if (!open) return null;
  const slide = SLIDES[slideIndex];
  const isLast = slideIndex === SLIDES.length - 1;

  const handleClose = () => {
    markTycoonWelcomeSeen();
    setSlideIndex(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-500/30 rounded-2xl max-w-xl w-full p-8 shadow-[0_0_60px_rgba(245,158,11,0.15)]">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            {slide.icon}
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">{slide.eyebrow}</span>
          </div>
          <button onClick={handleClose} aria-label="Skip tutorial"><X size={18} className="text-slate-500 hover:text-white" /></button>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white mb-4">{slide.title}</h1>
        <div className="text-sm text-slate-300 space-y-2 leading-relaxed">{slide.body}</div>

        <div className="flex justify-center gap-2 mt-8">
          {SLIDES.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === slideIndex ? 'w-8 bg-amber-400' : 'w-4 bg-slate-700'}`} />
          ))}
        </div>

        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => setSlideIndex(i => Math.max(0, i - 1))}
            disabled={slideIndex === 0}
            className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} /> Back
          </button>
          {isLast ? (
            <button onClick={handleClose} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-6 py-2 rounded-xl font-black uppercase tracking-widest text-xs">
              Get Started
            </button>
          ) : (
            <button onClick={() => setSlideIndex(i => Math.min(SLIDES.length - 1, i + 1))} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-black uppercase tracking-widest text-xs">
              Next <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
