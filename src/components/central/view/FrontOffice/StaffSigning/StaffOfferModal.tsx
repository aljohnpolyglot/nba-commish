import React, { useState } from 'react';
import { Briefcase, X } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { normalizeNationality } from '../../../../../utils/countryFlags';
import { CountryFlag } from '../../../../shared/CountryFlag';
import { SliderRow } from '../shared/SliderRow';
import type { StaffCandidate, StaffPortraitRenderer, StaffSigningMode } from './StaffSigningModal';
import type { SponsorSigningPerkGrant, TycoonState } from '../../../../../types/tycoon';
import { getAvailableSigningSponsorPerks } from '../../../../../services/tycoon/sponsorPerkEngine';
import { SponsorSigningPerkPicker } from '../../../../tycoon/SponsorSigningPerkPicker';

export type StaffOfferDecision = {
  candidate: StaffCandidate;
  role: string;
  mode: StaffSigningMode;
  salary: number;
  years: number;
  bonus: number;
  ratio: number;
  accepted: boolean;
  previouslyRejected?: boolean;
  sponsorSigningPerk?: SponsorSigningPerkGrant;
};

export const StaffOfferModal: React.FC<{
  candidate: StaffCandidate;
  selectedRole: string;
  mode: StaffSigningMode;
  currency?: string;
  currentYear: number;
  tycoon?: TycoonState;
  renderPortrait: StaffPortraitRenderer;
  onCancel: () => void;
  onSubmit: (decision: StaffOfferDecision) => void;
}> = ({ candidate, selectedRole, mode, currency = 'EUR', currentYear, tycoon, renderPortrait, onCancel, onSubmit }) => {
  const askYears = candidate.askYears ?? 2;
  const askBonus = candidate.askBonus ?? 0;
  const [salary, setSalary] = useState(candidate.salary);
  const [years, setYears] = useState(askYears);
  const [bonus, setBonus] = useState(askBonus);
  const [selectedSponsorPerkKey, setSelectedSponsorPerkKey] = useState<string | null>(null);
  const sponsorPerks = getAvailableSigningSponsorPerks(tycoon, currentYear, 'staff', salary);
  const selectedSponsorPerk = sponsorPerks.find(choice => choice.key === selectedSponsorPerkKey) ?? null;
  const salaryMin = Math.max(40_000, Math.round(candidate.salary * 0.65 / 5_000) * 5_000);
  const salaryMax = Math.max(salaryMin, Math.round(candidate.salary * 1.65 / 5_000) * 5_000);
  const bonusMax = Math.max(100_000, Math.round(Math.max(candidate.salary, askBonus * 2) / 25_000) * 25_000);
  const requestedAnnual = candidate.salary + askBonus / Math.max(1, askYears);
  const offeredAnnual = salary + (bonus + (selectedSponsorPerk?.equivalentAnnualValueEUR ?? 0)) / Math.max(1, years);
  const termAdjustment = years < askYears ? (askYears - years) * 0.04 : Math.min(0.06, (years - askYears) * 0.02);
  const ratio = requestedAnnual > 0 ? offeredAnnual / requestedAnnual + termAdjustment : 1;
  const strength = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  const accepted = ratio >= 0.9;
  const strengthTone = strength >= 90 ? 'text-emerald-300' : strength >= 75 ? 'text-amber-300' : 'text-rose-300';
  const strengthBar = strength >= 90 ? 'bg-emerald-400' : strength >= 75 ? 'bg-amber-400' : 'bg-rose-400';
  const initials = candidate.name.split(' ').map(part => part[0]).join('').slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="fixed inset-0 z-[121] flex items-center justify-center overflow-y-auto bg-black/85 p-2 backdrop-blur-md sm:p-4"
    >
      <motion.div
        initial={{ y: 18, scale: 0.985 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 10, scale: 0.985 }}
        className="flex max-h-[calc(100vh-1rem)] w-full max-w-[1040px] flex-col overflow-y-auto rounded-2xl border border-violet-400/30 bg-slate-950 text-white shadow-2xl sm:max-h-[calc(100vh-2rem)]"
      >
        <header className="flex items-start gap-4 border-b border-slate-800 p-4 sm:p-6">
          {renderPortrait(candidate.face, initials, 'w-16 h-20', candidate.staffImageId, candidate.name, candidate.playerPortraitUrl)}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-300">
              {mode === 'extension' ? 'Contract Extension' : 'New Staff Signing'}
            </div>
            <h2 className="mt-1 truncate text-2xl font-black sm:text-3xl">{candidate.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
              <span>{selectedRole}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5"><CountryFlag country={candidate.nationality} /> {normalizeNationality(candidate.nationality)}</span>
            </div>
          </div>
          <div className="hidden min-w-[170px] rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:block">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Offer Strength</div>
            <div className={`mt-1 text-xl font-black tabular-nums ${strengthTone}`}>{strength}%</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full transition-all ${strengthBar}`} style={{ width: `${strength}%` }} />
            </div>
          </div>
          <button onClick={onCancel} aria-label="Close offer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-900 hover:text-white"><X size={19} /></button>
        </header>

        <main className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Briefcase size={16} className="text-violet-300" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">
                {mode === 'extension' ? 'Extension Terms' : 'Signing Terms'}
              </h3>
            </div>
            <SliderRow label="Annual Salary" value={salary} min={salaryMin} max={salaryMax} step={5_000} onChange={setSalary} formatter={value => formatCurrencyWithCode(value, currency, false)} />
            <SliderRow label="Contract Length" value={years} min={1} max={4} step={1} onChange={setYears} formatter={value => `${value} year${value === 1 ? '' : 's'}`} />
            <SliderRow label={mode === 'extension' ? 'Extension Bonus' : 'Signing Bonus'} value={bonus} min={0} max={bonusMax} step={25_000} onChange={setBonus} formatter={value => formatCurrencyWithCode(value, currency, false)} />
            <SponsorSigningPerkPicker
              tycoon={tycoon}
              currentYear={currentYear}
              appliesTo="staff"
              annualSalaryEUR={salary}
              selectedKey={selectedSponsorPerkKey}
              onSelect={choice => setSelectedSponsorPerkKey(choice?.key ?? null)}
              currency={currency}
            />
          </section>

          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {mode === 'extension' ? 'Extension Request' : 'Candidate Ask'}
              </div>
              <div className="mt-2 text-xl font-black tabular-nums text-white">
                {formatCurrencyWithCode(candidate.salary, currency, false)} / {askYears} yr
              </div>
              {askBonus > 0 && <div className="mt-1 text-xs text-slate-400">{mode === 'extension' ? 'Extension bonus' : 'Signing bonus'} · {formatCurrencyWithCode(askBonus, currency, false)}</div>}
            </section>
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {mode === 'extension' ? 'Extension Summary' : 'Signing Summary'}
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Annual salary</dt><dd className="font-black tabular-nums">{formatCurrencyWithCode(salary, currency, false)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Term</dt><dd className="font-black">{years} year{years === 1 ? '' : 's'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">{mode === 'extension' ? 'Extension bonus' : 'Signing bonus'}</dt><dd className="font-black tabular-nums">{formatCurrencyWithCode(bonus, currency, false)}</dd></div>
                <div className="flex justify-between gap-3 border-t border-slate-800 pt-2"><dt className="text-slate-400">Total commitment</dt><dd className="font-black tabular-nums text-emerald-300">{formatCurrencyWithCode(salary * years + bonus, currency, false)}</dd></div>
              </dl>
            </section>
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:hidden">
              <div className="flex items-center justify-between text-xs"><span className="font-black uppercase tracking-widest text-slate-500">Offer Strength</span><span className={`text-lg font-black ${strengthTone}`}>{strength}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full ${strengthBar}`} style={{ width: `${strength}%` }} /></div>
            </section>
          </div>
        </main>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button onClick={onCancel} className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-6 text-sm font-bold text-slate-300 hover:border-slate-500">Cancel</button>
          <button
            onClick={() => onSubmit({
              candidate,
              role: selectedRole,
              mode,
              salary,
              years,
              bonus,
              ratio,
              accepted,
              sponsorSigningPerk: selectedSponsorPerk ? {
                sponsor: selectedSponsorPerk.sponsor,
                perkId: selectedSponsorPerk.perk.id,
                label: selectedSponsorPerk.perk.label,
                season: currentYear,
                equivalentAnnualValueEUR: selectedSponsorPerk.equivalentAnnualValueEUR,
              } : undefined,
            })}
            className="h-11 rounded-xl bg-violet-500 px-8 text-sm font-black text-white hover:bg-violet-400"
          >
            {mode === 'extension' ? 'Submit Extension' : 'Submit Signing Offer'}
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
};
