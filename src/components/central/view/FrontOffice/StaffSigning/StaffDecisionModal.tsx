import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import type { StaffPortraitRenderer } from './StaffSigningModal';
import type { StaffOfferDecision } from './StaffOfferModal';
import { normalizeNationality } from '../../../../../utils/countryFlags';

function responseFor(
  decision: StaffOfferDecision,
  context: { clubName: string; clubCountry?: string; clubCity?: string; competitionLabel?: string },
): string {
  if (decision.previouslyRejected) {
    return decision.mode === 'extension'
      ? 'I have already made my decision. I will not extend my contract and will consider other opportunities.'
      : 'I have already made my decision. I am no longer considering this club and am looking at other opportunities.';
  }
  if (!decision.accepted) {
    return decision.mode === 'extension'
      ? 'I will not extend my contract and will consider other opportunities.'
      : 'I am no longer considering this club and am looking at other opportunities.';
  }
  const role = decision.role.toLowerCase();
  const staffCountry = normalizeNationality(decision.candidate.nationality);
  const clubCountry = normalizeNationality(context.clubCountry);
  const atHome = staffCountry !== 'Unknown' && clubCountry !== 'Unknown' && staffCountry === clubCountry;
  const place = context.clubCity || context.clubName;
  const competition = context.competitionLabel || 'the domestic league';
  if (role.includes('head coach')) {
    return atHome
      ? `This club belongs in the fight for ${competition} and the cup. Let’s get to work.`
      : `I’m ready to make ${place} home and build ${context.clubName} into a team Europe respects.`;
  }
  if (role.includes('regional scout')) return `Send me where the club needs eyes next. I’ll build ${context.clubName} a stronger network.`;
  if (role.includes('chief scout')) return `I’ll organize the department and make sure every trip gives ${context.clubName} a clearer picture.`;
  if (role.includes('academy')) return atHome
    ? `I know the basketball culture here. Let’s give the next generation a real path into ${context.clubName}.`
    : `I’m excited to help the young players in ${place} earn their way into the senior team.`;
  if (role.includes('physio') || role.includes('medical') || role.includes('sports science')) return `I’ll help this squad recover well, train safely, and stay ready for the hardest weeks of the season.`;
  if (role.includes('development')) return `Give me the players who need the next step. I’ll help them turn training into real minutes.`;
  if (role.includes('assistant coach')) return `I’m ready to support the staff, prepare the team properly, and help ${context.clubName} win.`;
  return `I’m ready to take responsibility for my department and help ${context.clubName} move forward.`;
}

export const StaffDecisionModal: React.FC<{
  decision: StaffOfferDecision;
  currency?: string;
  renderPortrait: StaffPortraitRenderer;
  clubName: string;
  clubCountry?: string;
  clubCity?: string;
  competitionLabel?: string;
  onAcknowledge: () => void;
  onFinalize: () => void;
}> = ({ decision, currency = 'EUR', renderPortrait, clubName, clubCountry, clubCity, competitionLabel, onAcknowledge, onFinalize }) => {
  const { candidate, accepted, mode } = decision;
  const initials = candidate.name.split(' ').map(part => part[0]).join('').slice(0, 2);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="fixed inset-0 z-[122] flex items-center justify-center overflow-y-auto bg-black/90 p-3 backdrop-blur-md sm:p-6"
    >
      <motion.div
        initial={{ y: 24, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 12, scale: 0.98 }}
        className={`w-full max-w-xl rounded-2xl border-2 bg-slate-950 p-5 text-center text-white shadow-2xl sm:p-8 ${accepted ? 'border-emerald-400/60' : 'border-rose-400/60'}`}
      >
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${accepted ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-rose-400/40 bg-rose-400/10 text-rose-300'}`}>
          {accepted ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
        </div>
        <div className={`mt-4 text-[10px] font-black uppercase tracking-[0.35em] ${accepted ? 'text-emerald-300' : 'text-rose-300'}`}>
          {decision.previouslyRejected
            ? (mode === 'extension' ? 'Extension Declined' : 'Candidate Unavailable')
            : accepted
              ? (mode === 'extension' ? 'Extension Accepted' : 'Signing Accepted')
              : (mode === 'extension' ? 'Extension Rejected' : 'Signing Rejected')}
        </div>
        <div className="mt-4 flex justify-center">{renderPortrait(candidate.face, initials, 'w-24 h-32', candidate.staffImageId, candidate.name, candidate.playerPortraitUrl)}</div>
        <h2 className="mt-3 text-3xl font-black">{candidate.name}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-300">“{responseFor(decision, { clubName, clubCountry, clubCity, competitionLabel })}”</p>

        <dl className="mx-auto mt-6 max-w-sm rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-400">Annual salary</dt><dd className="font-black tabular-nums">{formatCurrencyWithCode(decision.salary, currency, false)}</dd></div>
          <div className="mt-2 flex justify-between gap-3"><dt className="text-slate-400">Term</dt><dd className="font-black">{decision.years} year{decision.years === 1 ? '' : 's'}</dd></div>
          <div className="mt-2 flex justify-between gap-3"><dt className="text-slate-400">{mode === 'extension' ? 'Extension bonus' : 'Signing bonus'}</dt><dd className="font-black tabular-nums">{formatCurrencyWithCode(decision.bonus, currency, false)}</dd></div>
        </dl>

        <button
          onClick={accepted ? onFinalize : onAcknowledge}
          className={`mt-6 h-12 w-full rounded-xl text-sm font-black ${accepted ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
        >
          {accepted ? (mode === 'extension' ? 'Finalize Extension' : 'Finalize Hire') : 'Continue'}
        </button>
      </motion.div>
    </motion.div>
  );
};
