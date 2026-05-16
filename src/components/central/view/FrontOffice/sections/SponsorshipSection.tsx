import React, { useState } from 'react';
import { AlertTriangle, Briefcase } from 'lucide-react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { ALL_SLOTS, type OneTimePayout, type SponsorshipSlot, type TycoonState } from '../../../../../types/tycoon';
import { Line, SectionTitle } from '../shared/helpers';
import { SponsorLogo } from '../../../../tycoon/SponsorLogo';
import { getIndustryLabel } from '../../../../../utils/sponsorLogos';
import { getBrandMeta } from '../../../../../data/sponsorCatalogFetcher';
import type { NegotiationMode } from '../../../../tycoon/SponsorshipNegotiationModal';

const SPONSOR_SLOT_LABELS: Record<SponsorshipSlot, string> = {
  kit: 'Kit Sponsor',
  sleeve: 'Sleeve Sponsor',
  back: 'Back of Shirt',
  shorts: 'Shorts Sponsor',
  training: 'Training Kit',
  court: 'Court Logo',
  stadium: 'Arena Naming',
  practice: 'Practice Facility',
};

const SLOT_GRADES: Record<SponsorshipSlot, string> = {
  kit: 'A',
  sleeve: 'B',
  back: 'B+',
  shorts: 'B+',
  training: 'B',
  court: 'B',
  stadium: 'A',
  practice: 'B',
};

const ENDORSEMENT_SLOT_CAP = 4;

export const SponsorshipSection: React.FC<{
  tycoon: TycoonState;
  currency: string;
  avgOpponentPrestige: number;
  marqueeOpponents: string[];
  onAction: (slot: SponsorshipSlot, mode: NegotiationMode) => void;
  onTicketMultChange: (mult: number) => void;
}> = ({ tycoon, currency, avgOpponentPrestige, marqueeOpponents, onAction, onTicketMultChange: _onTicketMultChange }) => {
  const [selectedSlot, setSelectedSlot] = useState<SponsorshipSlot>('kit');
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const deals = ALL_SLOTS.map((slot) => ({ slot, deal: tycoon.sponsorships[slot] }));
  const activeDeals = deals.filter((item) => item.deal);
  const activeEndorsements = ((tycoon.oneTimePayouts ?? []) as OneTimePayout[])
    .filter((p) => p.kind === 'endorsement')
    .filter((p, index, arr) => {
      const key = `${p.year}-${p.brand}-${p.amount}-${p.offerLabel ?? ''}`;
      return arr.findIndex((other) => `${other.year}-${other.brand}-${other.amount}-${other.offerLabel ?? ''}` === key) === index;
    })
    .slice(0, ENDORSEMENT_SLOT_CAP);
  const endorsementTotal = activeEndorsements.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const totalAnnual = activeDeals.reduce((sum, item) => sum + (item.deal?.valuePerYear ?? 0), 0);
  const totalValue = activeDeals.reduce((sum, item) => sum + (item.deal?.valuePerYear ?? 0) * Math.max(1, item.deal?.yearsRemaining ?? 1), 0) + endorsementTotal;
  const nextRenewal = activeDeals.reduce<number | null>((min, item) => {
    const years = item.deal?.yearsRemaining;
    if (years === undefined) return min;
    return min === null ? years : Math.min(min, years);
  }, null);
  const selected = tycoon.sponsorships[selectedSlot];
  const placeholderCount = Math.max(0, ENDORSEMENT_SLOT_CAP - activeEndorsements.length);
  const firstOpenSlot = ALL_SLOTS.find((s) => !tycoon.sponsorships[s]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
        <SectionTitle icon={<Briefcase size={22} />} title="Sponsorships" subtitle="Manage partnerships, brand strength, renewals, and matchday sponsor exposure." />
        <div className="grid sm:grid-cols-4 gap-3 xl:min-w-[760px]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500">Total Revenue</div>
            <div className="mt-2 text-2xl font-black text-emerald-300 tabular-nums">{fmt(totalAnnual)}</div>
            <div className="text-xs text-slate-400">per year</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500">Active Deals</div>
            <div className="mt-2 text-2xl font-black text-white tabular-nums">{activeDeals.length + activeEndorsements.length} / {ALL_SLOTS.length + ENDORSEMENT_SLOT_CAP}</div>
            <div className="text-xs text-slate-400">sponsors + endorsements</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500">Portfolio Value</div>
            <div className="mt-2 text-2xl font-black text-violet-300 tabular-nums">{fmt(totalValue)}</div>
            <div className="text-xs text-slate-400">contracted</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500">Next Renewals</div>
            <div className="mt-2 text-2xl font-black text-amber-300 tabular-nums">{nextRenewal ?? 0}</div>
            <div className="text-xs text-slate-400">years remaining</div>
          </div>
        </div>
      </div>

      {(tycoon.pendingSponsorReview || (selected?.personalityProse)) && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-300 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-widest text-amber-300">Sponsor Hooks</div>
              {tycoon.pendingSponsorReview && (
                <div className="mt-2 text-sm text-amber-50">
                  Offseason review: {tycoon.pendingSponsorReview.openSlots.length} open slots, {tycoon.pendingSponsorReview.expiringSlots.length} expiring slots.
                </div>
              )}
              {selected?.personalityProse && (
                <div className="mt-2 text-sm text-slate-300">
                  {selected.sponsor}: {selected.personality ?? 'Sponsor profile'} — {selected.personalityProse}
                </div>
              )}
              {(tycoon.pendingSponsorReview?.conflictWarnings ?? []).map((warning: string) => (
                <div key={warning} className="mt-2 text-sm text-rose-200">{warning}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5">Sponsorship Portfolio</div>
            <div className="grid md:grid-cols-2 2xl:grid-cols-4 gap-4">
              {deals.map(({ slot, deal }) => {
                const active = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    onClick={() => {
                      setSelectedSlot(slot);
                      onAction(slot, deal ? 'details' : 'find-new');
                    }}
                    className={`min-h-[190px] rounded-xl border p-4 text-left transition ${
                      active ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-xs font-black uppercase tracking-widest text-slate-400">{SPONSOR_SLOT_LABELS[slot]}</div>
                      <span className={`w-3 h-3 rounded-full ${deal ? 'bg-emerald-400' : 'bg-amber-300'}`} />
                    </div>
                    <div className="mt-4 flex items-start gap-3">
                      {deal ? (
                        <SponsorLogo
                          name={deal.sponsor}
                          meta={getBrandMeta('spain', deal.sponsor)}
                          industry={deal.industry ?? 'generic'}
                          size={56}
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-2xl">+</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-bold text-white leading-tight line-clamp-2 break-words">
                          {deal?.sponsor ?? 'Open Slot'}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {deal ? getIndustryLabel(deal.industry) : 'Available'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="uppercase tracking-widest text-slate-500">Value</div>
                        <div className="text-sm font-black text-white tabular-nums">{fmt(deal?.valuePerYear ?? 0)} / year</div>
                      </div>
                      <div>
                        <div className="uppercase tracking-widest text-slate-500">Contract End</div>
                        <div className="text-sm font-black text-white">{deal ? String(deal.signedYear + deal.yearsRemaining) : 'Market'}</div>
                      </div>
                    </div>
                    <div className="mt-3 inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-amber-400/60 px-2 text-sm font-black text-amber-300">{SLOT_GRADES[slot]}</div>
                  </button>
                );
              })}
              {activeEndorsements.map((deal, i) => (
                <button
                  key={`endorsement-${deal.id ?? `${deal.brand}-${i}`}`}
                  onClick={() => onAction(firstOpenSlot ?? selectedSlot, 'find-new')}
                  className="min-h-[190px] rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-left transition hover:border-emerald-300"
                >
                  <div className="flex items-start justify-between">
                    <div className="text-xs font-black uppercase tracking-widest text-emerald-300">Extra Endorsement</div>
                    <span className="w-3 h-3 rounded-full bg-emerald-400" />
                  </div>
                  <div className="mt-4 flex items-start gap-3">
                    <SponsorLogo
                      name={deal.brand}
                      meta={getBrandMeta('spain', deal.brand)}
                      industry={deal.industry ?? 'generic'}
                      size={56}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-white leading-tight line-clamp-2 break-words">{deal.brand}</div>
                      <div className="text-xs text-emerald-200/80 mt-0.5">{deal.offerLabel ?? 'One-Time Endorsement'}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="uppercase tracking-widest text-slate-500">Value</div>
                      <div className="text-sm font-black text-white tabular-nums">{fmt(deal.amount)}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-widest text-slate-500">Contract</div>
                      <div className="text-sm font-black text-white">One Year</div>
                    </div>
                  </div>
                  <div className="mt-3 inline-flex h-7 items-center justify-center rounded-lg border border-emerald-400/50 px-2 text-xs font-black text-emerald-200">Signed</div>
                </button>
              ))}
              {Array.from({ length: placeholderCount }).map((_, i) => (
                <button
                  key={`available-${i}`}
                  onClick={() => onAction(firstOpenSlot ?? selectedSlot, 'find-new')}
                  title="Open market"
                  className="min-h-[190px] rounded-xl border border-dashed border-slate-700 bg-slate-950/40 hover:border-amber-300 hover:bg-amber-400/5 p-4 text-left transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="text-xs font-black uppercase tracking-widest text-slate-500">Extra Endorsement</div>
                    <span className="w-3 h-3 rounded-full bg-amber-300/60" />
                  </div>
                  <div className="mt-4 flex items-start gap-3">
                    <div className="w-14 h-14 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-2xl">+</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-slate-200 leading-tight">Open Market</div>
                      <div className="text-xs text-slate-500 mt-0.5">One-year opportunity</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="uppercase tracking-widest text-slate-500">Value</div>
                      <div className="text-sm font-black text-slate-300">—</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-widest text-slate-500">Contract</div>
                      <div className="text-sm font-black text-slate-300">One Year</div>
                    </div>
                  </div>
                  <div className="mt-3 inline-flex h-7 items-center justify-center rounded-lg border border-slate-700 px-2 text-xs font-black text-slate-400">Browse</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Sponsorship Insights</div>
            <div className="space-y-2 text-sm text-slate-300">
              <div className="text-emerald-300">✓ Kit deal ranks among the strongest current slots.</div>
              <div className="text-emerald-300">✓ Marquee opponents support premium local activation.</div>
              <div className="text-slate-300">Extra endorsements: {activeEndorsements.length}/{ENDORSEMENT_SLOT_CAP} signed this season.</div>
            </div>
            {marqueeOpponents.length > 0 && <div className="mt-2 text-xs text-slate-500">Marquee slate: {marqueeOpponents.slice(0, 3).join(', ')}</div>}
          </div>
      </div>
    </div>
  );
};
