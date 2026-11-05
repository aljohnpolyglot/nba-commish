import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ClipboardList, FastForward, UserRound } from 'lucide-react';
import type { GmSeasonReview } from '../../types';
import { useGame } from '../../store/GameContext';
import { resolveGmSeasonReview, withGmPerformanceReviewTaskStatus } from '../../services/gmCareer/careerService';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { GmReviewCategoryCard } from './GmReviewCategoryCard';
import { GmReviewDecisionModal } from './GmReviewDecisionModal';
import { OwnerApprovalBar } from './OwnerApprovalBar';
import {
  GM_REVIEW_PHASE_DURATION_MS,
  GM_REVIEW_PHASES,
  reviewPhaseReached,
} from './reviewPresentation';

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, notation: 'compact', maximumFractionDigits: 2,
  }).format(value);
}

export const GmReviewModal: React.FC<{ review: GmSeasonReview }> = ({ review }) => {
  const { state, dispatchAction } = useGame();
  const reduceMotion = useReducedMotion();
  const [phaseIndex, setPhaseIndex] = React.useState(0);
  const [decisionOpen, setDecisionOpen] = React.useState(false);
  const phase = GM_REVIEW_PHASES[phaseIndex];
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const reviewTeam = [...state.teams, ...(state.nonNBATeams ?? [])].find(team =>
    Number('id' in team ? team.id : team.tid) === Number(review.teamId),
  );
  const reviewTeamLogo = reviewTeam
    ? getResolvedTeamLogoUrl(reviewTeam, currentYear) || ('logoUrl' in reviewTeam ? reviewTeam.logoUrl : '')
    : '';

  React.useEffect(() => {
    setDecisionOpen(false);
    setPhaseIndex(reduceMotion ? GM_REVIEW_PHASES.length - 1 : 0);
  }, [reduceMotion, review.id]);

  React.useEffect(() => {
    if (reduceMotion || phaseIndex >= GM_REVIEW_PHASES.length - 1) return;
    const timer = globalThis.setTimeout(
      () => setPhaseIndex(current => Math.min(current + 1, GM_REVIEW_PHASES.length - 1)),
      GM_REVIEW_PHASE_DURATION_MS[phase],
    );
    return () => globalThis.clearTimeout(timer);
  }, [phase, phaseIndex, reduceMotion]);

  const finish = async () => {
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: withGmPerformanceReviewTaskStatus(state, resolveGmSeasonReview(state)),
    });
    await dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'performanceReview' } });
  };
  if (decisionOpen) return <GmReviewDecisionModal review={review} onContinue={finish} />;

  return (
    <div className="fixed inset-0 z-[12000] overflow-y-auto bg-[#020810]/95 p-2 backdrop-blur-md sm:p-5">
      <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center py-2 sm:py-4">
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="gm-review-title"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative w-full overflow-hidden rounded-[28px] border border-blue-400/45 bg-[#06111d] shadow-[0_28px_90px_rgba(0,0,0,0.65),0_0_45px_rgba(37,99,235,0.08)]"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-15%,rgba(30,64,175,0.22),transparent_38%)]" />
          <header className="relative px-4 pb-4 pt-6 text-center sm:px-8 sm:pb-5 sm:pt-8">
            <div className="mx-auto flex max-w-4xl items-center justify-center gap-4">
              {reviewTeamLogo && (
                <img src={reviewTeamLogo} alt="" className="hidden h-16 w-16 object-contain sm:block" referrerPolicy="no-referrer" />
              )}
              <h1 id="gm-review-title" className="modded-font-sport text-3xl uppercase tracking-tight text-white sm:text-4xl lg:whitespace-nowrap lg:text-5xl">
                Annual Performance Review
              </h1>
            </div>
            <div className="mx-auto mt-3 flex max-w-3xl items-center gap-4 text-[9px] font-black uppercase tracking-[0.34em] text-blue-200/70 sm:text-[11px]">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-blue-400/70" />
              {review.season} Season Review
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-blue-400/70" />
            </div>
          </header>

          <div className="relative space-y-4 px-3 pb-3 sm:px-6 sm:pb-6">
            <div className="relative overflow-hidden rounded-2xl border border-blue-400/35 bg-[#08172a]/90 p-4 sm:p-5">
              {reviewTeamLogo && <img src={reviewTeamLogo} alt="" className="pointer-events-none absolute -right-5 -top-10 h-44 w-44 object-contain opacity-[0.06]" referrerPolicy="no-referrer" />}
              <div className="relative flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-400/65 bg-[#07111f] shadow-[0_0_28px_rgba(56,189,248,0.18)] sm:h-20 sm:w-20">
                  {review.ownerPortraitUrl ? (
                    <img src={review.ownerPortraitUrl} alt="" className="h-full w-full object-cover" />
                  ) : reviewTeamLogo ? (
                    <img src={reviewTeamLogo} alt="" className="h-full w-full object-contain p-3" referrerPolicy="no-referrer" />
                  ) : (
                    <UserRound className="text-blue-300" size={34} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-blue-300/70 sm:text-[10px]">From: {review.ownerName}</p>
                  <p className="mt-1 text-lg font-black text-white sm:text-2xl">Reviewing your season...</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-blue-300/15 pt-3 text-xs sm:text-sm">
                    <span className="font-black text-emerald-400">{money(review.annualSalary, review.currency)}/year</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400">{review.contractYearsRemaining} {review.contractYearsRemaining === 1 ? 'year' : 'years'} remaining</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {review.categories.map(category => (
                <GmReviewCategoryCard key={category.key} category={category} phase={phase} />
              ))}
            </div>

            {reviewPhaseReached(phase, 'sentimentEnter') && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
                <OwnerApprovalBar
                  value={review.currentApproval}
                  previous={review.previousApproval}
                  active={reviewPhaseReached(phase, 'sentimentMove')}
                />
              </motion.div>
            )}

            {phase === 'complete' ? (
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setDecisionOpen(true)}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-blue-300 bg-gradient-to-r from-blue-950 via-blue-900 to-blue-950 py-4 text-sm font-black uppercase tracking-wide text-white shadow-[0_0_24px_rgba(59,130,246,0.28)] transition-colors hover:border-cyan-300 hover:text-cyan-100"
              >
                <ClipboardList size={21} />
                <span>Review Summary <span className="ml-2 hidden text-[10px] tracking-[0.2em] text-blue-300 sm:inline">View final decision</span></span>
              </motion.button>
            ) : (
              <div className="flex flex-col items-center gap-3 py-1">
                <div className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-blue-300/45" aria-live="polite">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                  Season review in progress
                </div>
                <button
                  type="button"
                  onClick={() => setPhaseIndex(GM_REVIEW_PHASES.length - 1)}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/55 px-4 text-xs font-black uppercase tracking-wider text-slate-300 transition-colors hover:border-blue-400/70 hover:text-white sm:w-auto"
                >
                  <FastForward size={16} />
                  Skip to Results
                </button>
              </div>
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
};
