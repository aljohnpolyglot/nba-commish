import React from 'react';
import { motion } from 'motion/react';
import { BriefcaseBusiness, ShieldCheck, XCircle } from 'lucide-react';
import type { GmSeasonReview } from '../../types';

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, notation: 'compact', maximumFractionDigits: 2,
  }).format(value);
}

export const GmReviewDecisionModal: React.FC<{ review: GmSeasonReview; onContinue: () => void }> = ({ review, onContinue }) => {
  const approved = review.decision === 'approved';
  const actionLabel = !approved
    ? 'View GM Offers'
    : review.contractYearsRemaining === 0 ? 'View Contract Decision' : 'Continue';

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center overflow-y-auto bg-[#020810]/95 p-4 backdrop-blur-md">
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="gm-review-decision-title"
        initial={{ opacity: 0, scale: 0.94, y: 22 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full max-w-xl overflow-hidden rounded-3xl border-2 p-4 shadow-2xl sm:p-6 ${approved ? 'border-emerald-400 bg-[#052d2c] shadow-emerald-950/50' : 'border-rose-500 bg-[#32111b] shadow-rose-950/50'}`}
      >
        <div className="flex items-start gap-4">
          {approved
            ? <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={54} strokeWidth={1.8} />
            : <XCircle className="mt-0.5 shrink-0 text-rose-300" size={54} strokeWidth={1.8} />}
          <div className="min-w-0">
            <h1 id="gm-review-decision-title" className={`modded-font-sport text-3xl uppercase sm:text-4xl ${approved ? 'text-emerald-300' : 'text-rose-300'}`}>
              {approved ? 'Approved' : 'Dismissed'}
            </h1>
            <p className={`mt-0.5 text-sm font-black sm:text-base ${approved ? 'text-emerald-200' : 'text-rose-200'}`}>
              {approved ? 'You will remain General Manager' : 'Your contract has been terminated'}
            </p>
          </div>
        </div>

        <blockquote className="mt-5 rounded-xl border border-white/10 bg-[#03101c]/75 p-4 text-sm leading-relaxed text-slate-200">
          “{review.ownerMessage}”
        </blockquote>

        <div className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-200 sm:text-sm">
          <BriefcaseBusiness className="mt-0.5 shrink-0" size={16} />
          {approved
            ? review.contractYearsRemaining > 0
              ? <>Contract continues unchanged · {money(review.annualSalary, review.currency)}/year · {review.contractYearsRemaining} {review.contractYearsRemaining === 1 ? 'year' : 'years'} remaining</>
              : <>Season review passed · Your contract decision follows</>
            : <>Remaining contract terminated · Paychecks from this team have ended</>}
        </div>

        <button
          onClick={onContinue}
          className={`mt-5 w-full rounded-xl py-3.5 text-sm font-black uppercase tracking-wide text-white transition-colors ${approved ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-700 hover:bg-rose-600'}`}
        >
          {actionLabel}
        </button>
      </motion.section>
    </div>
  );
};
