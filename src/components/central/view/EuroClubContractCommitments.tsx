import React from 'react';
import { CalendarClock, Handshake, Users } from 'lucide-react';
import type { TycoonState, SponsorshipSlot } from '../../../types/tycoon';
import { formatCurrencyWithCode } from '../../../utils/helpers';
import { getSponsorContractEndYear } from '../../../services/tycoon/sponsorshipEngine';
import { CountryFlag } from '../../shared/CountryFlag';
import { displayStaffRole } from '../../../services/staff/staffCareerRows';

const SLOT_LABELS: Partial<Record<SponsorshipSlot, string>> = {
  kit: 'Kit',
  sleeve: 'Sleeve',
  back: 'Back',
  shorts: 'Shorts',
  training: 'Training',
  court: 'Court',
  stadium: 'Arena Naming',
  practice: 'Practice',
};

export const EuroClubContractCommitments: React.FC<{
  tycoon: TycoonState;
  currency: string;
  currentYear: number;
}> = ({ tycoon, currency, currentYear }) => {
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const seasons = Array.from({ length: 4 }, (_, index) => currentYear + index);
  const sponsors = (Object.entries(tycoon.sponsorships ?? {}) as Array<[SponsorshipSlot, TycoonState['sponsorships'][SponsorshipSlot]]>)
    .filter((entry): entry is [SponsorshipSlot, NonNullable<typeof entry[1]>] => Boolean(entry[1]))
    .sort(([left], [right]) => (SLOT_LABELS[left] ?? left).localeCompare(SLOT_LABELS[right] ?? right));
  const staff = [...(tycoon.staffMembers ?? [])]
    .sort((left, right) => left.role.localeCompare(right.role) || left.name.localeCompare(right.name));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><Handshake size={15} className="text-amber-300" /><h2 className="text-sm font-black uppercase tracking-widest text-white">Sponsor Contract Timeline</h2></div>
        {sponsors.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No active sponsor contracts.</div> : (
          <div className="space-y-3">
            {sponsors.map(([slot, sponsor]) => {
              const endYear = getSponsorContractEndYear(sponsor, currentYear) ?? currentYear - 1;
              return (
                <article key={slot} className="rounded-xl border border-slate-800 bg-slate-950/65 p-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{SLOT_LABELS[slot] ?? slot}</div><div className="truncate text-sm font-black text-white">{sponsor.sponsor}</div></div><div className="text-right text-xs font-black text-emerald-300">{fmt(sponsor.valuePerYear)}<div className="text-[9px] font-normal text-slate-500">per season</div></div></div>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {seasons.map(year => {
                      const active = year <= endYear;
                      return <div key={year} className={`rounded-lg border px-1.5 py-2 text-center ${active ? 'border-amber-400/25 bg-amber-400/10 text-amber-200' : 'border-slate-800 text-slate-700'}`}><div className="text-[9px] font-black">{year - 1}/{String(year).slice(-2)}</div><div className="mt-1 text-[8px] uppercase">{active ? 'Active' : 'Open'}</div></div>;
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><Users size={15} className="text-sky-300" /><h2 className="text-sm font-black uppercase tracking-widest text-white">Staff Contracts</h2></div>
        {staff.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No saved staff contracts.</div> : (
          <div className="space-y-2">
            {staff.map(member => (
              <article key={member.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border border-slate-800 bg-slate-950/65 p-3 sm:grid-cols-[minmax(0,1fr)_130px_80px] sm:items-center">
                <div className="min-w-0"><div className="truncate text-sm font-black text-white">{member.name}</div><div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">{member.nationality && <CountryFlag country={member.nationality} className="h-3 w-4 rounded-[2px]" />}<span className="truncate">{displayStaffRole(member.role)}</span></div></div>
                <div className="text-right text-xs font-black text-sky-200">{fmt(member.salary)}<div className="text-[9px] font-normal text-slate-500">annual salary</div></div>
                <div className="col-span-2 flex items-center justify-end gap-1 text-[10px] font-bold text-slate-300 sm:col-span-1"><CalendarClock size={11} className="text-slate-500" />{Math.max(0, member.contractYears)}y left</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
