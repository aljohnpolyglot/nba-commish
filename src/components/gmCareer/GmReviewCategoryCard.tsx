import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChartNoAxesColumnIncreasing, Dribbble, Trophy } from 'lucide-react';
import type { GmReviewCategory, GmReviewTone } from '../../types';
import { AnimatedInteger } from './AnimatedInteger';
import {
  getFinanceFrames,
  getPlayoffRevealLabel,
  getRegularSeasonWins,
  reviewPhaseReached,
  type GmReviewPhase,
} from './reviewPresentation';

const toneClass: Record<GmReviewTone, { text: string; border: string; glow: string; surface: string }> = {
  excellent: { text: 'text-emerald-300', border: 'border-emerald-400/70', glow: 'shadow-emerald-500/10', surface: 'bg-emerald-500/10' },
  good: { text: 'text-cyan-300', border: 'border-cyan-400/65', glow: 'shadow-cyan-500/10', surface: 'bg-cyan-500/10' },
  acceptable: { text: 'text-amber-300', border: 'border-amber-400/65', glow: 'shadow-amber-500/10', surface: 'bg-amber-500/10' },
  poor: { text: 'text-orange-400', border: 'border-orange-500/65', glow: 'shadow-orange-500/10', surface: 'bg-orange-500/10' },
  failed: { text: 'text-rose-400', border: 'border-rose-500/70', glow: 'shadow-rose-500/10', surface: 'bg-rose-500/10' },
};

const subtitles: Record<GmReviewCategory['key'], string> = {
  regularSeason: 'Record, performance, and consistency',
  playoffs: 'Postseason performance and progress',
  finances: 'Team financial health and efficiency',
};

function CategoryIcon({ category }: { category: GmReviewCategory }) {
  if (category.key === 'playoffs') return <Trophy size={28} strokeWidth={1.7} />;
  if (category.key === 'finances') return <ChartNoAxesColumnIncreasing size={29} strokeWidth={1.7} />;
  return <Dribbble size={30} strokeWidth={1.7} />;
}

interface Frame {
  key: string;
  eyebrow: string;
  content: React.ReactNode;
  subline?: React.ReactNode;
}

function categoryFrame(category: GmReviewCategory, phase: GmReviewPhase): Frame {
  const impact = <AnimatedInteger value={category.impact} prefix={category.impact >= 0 ? '+' : ''} duration={650} />;
  if (category.key === 'regularSeason') {
    if (!reviewPhaseReached(phase, 'regularVerdict')) {
      return {
        key: 'regular-wins', eyebrow: 'Season Wins',
        content: <><AnimatedInteger value={getRegularSeasonWins(category)} duration={850} /> <span className="text-base sm:text-lg">WINS</span></>,
      };
    }
    return { key: 'regular-verdict', eyebrow: 'Owner Assessment', content: category.assessment, subline: impact };
  }
  if (category.key === 'playoffs') {
    if (!reviewPhaseReached(phase, 'playoffVerdict')) {
      return { key: 'playoff-outcome', eyebrow: 'Postseason Result', content: getPlayoffRevealLabel(category) };
    }
    return { key: 'playoff-verdict', eyebrow: 'Owner Assessment', content: category.assessment, subline: impact };
  }
  const frames = getFinanceFrames(category);
  if (phase === 'financePayroll') return { key: 'finance-payroll', eyebrow: frames.payroll.label, content: frames.payroll.value };
  if (phase === 'financeRank') return { key: 'finance-rank', eyebrow: frames.rank.label, content: frames.rank.value };
  if (phase === 'financeJustification') return { key: 'finance-justification', eyebrow: frames.justification.label, content: frames.justification.value };
  if (phase === 'financeVerdict') return { key: 'finance-verdict', eyebrow: 'Financial Grade', content: category.grade, subline: category.assessment };
  return { key: 'finance-impact', eyebrow: 'Approval Impact', content: impact, subline: category.assessment };
}

function categoryStart(category: GmReviewCategory): GmReviewPhase {
  if (category.key === 'playoffs') return 'playoffOutcome';
  if (category.key === 'finances') return 'financePayroll';
  return 'regularWins';
}

function categoryActive(category: GmReviewCategory, phase: GmReviewPhase): boolean {
  if (category.key === 'regularSeason') return phase === 'regularWins' || phase === 'regularVerdict';
  if (category.key === 'playoffs') return phase === 'playoffOutcome' || phase === 'playoffVerdict';
  return ['financePayroll', 'financeRank', 'financeJustification', 'financeVerdict', 'financeImpact'].includes(phase);
}

export const GmReviewCategoryCard: React.FC<{ category: GmReviewCategory; phase: GmReviewPhase }> = ({ category, phase }) => {
  const revealed = reviewPhaseReached(phase, categoryStart(category));
  const active = categoryActive(category, phase);
  const tone = toneClass[category.tone];
  const frame = revealed ? categoryFrame(category, phase) : null;

  return (
    <motion.article
      initial={false}
      animate={{ opacity: revealed ? 1 : 0.42, scale: active ? 1 : 0.995 }}
      transition={{ duration: 0.35 }}
      className={`relative overflow-hidden rounded-2xl border bg-[#081523]/90 shadow-xl ${revealed ? tone.border : 'border-slate-700/55'} ${tone.glow}`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${revealed ? tone.surface : 'bg-slate-800'}`} />
      <div className="grid min-h-[108px] gap-3 p-3.5 pl-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(290px,43%)] sm:items-center sm:gap-4 sm:p-4 sm:pl-5">
        <div className={`flex h-14 w-14 items-center justify-center rounded-full border sm:h-16 sm:w-16 ${revealed ? `${tone.border} ${tone.text} bg-slate-950/70` : 'border-slate-700 text-slate-600'}`}>
          <CategoryIcon category={category} />
        </div>
        <div className="min-w-0">
          <h2 className="modded-font-sport text-lg uppercase tracking-wide text-white sm:text-xl">{category.label}</h2>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">{subtitles[category.key]}</p>
        </div>
        <div className={`min-h-[78px] rounded-xl border px-4 py-3 text-center sm:flex sm:flex-col sm:justify-center ${revealed ? `${tone.border} ${tone.surface}` : 'border-slate-700/60 bg-slate-950/65'}`}>
          <AnimatePresence initial={false} mode="wait">
            {frame ? (
              <motion.div
                key={frame.key}
                initial={{ opacity: 0, y: 8, filter: 'blur(5px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, filter: 'blur(5px)' }}
                transition={{ duration: 0.28 }}
              >
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">{frame.eyebrow}</p>
                <div className={`mt-1 text-2xl font-black uppercase leading-tight ${tone.text}`}>{frame.content}</div>
                {frame.subline != null && <div className={`mt-1 text-sm font-black uppercase ${tone.text}`}>{frame.subline}</div>}
              </motion.div>
            ) : (
              <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">Awaiting Review</p>
                <p className="mt-1 text-2xl font-black text-slate-700">—</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.article>
  );
};
