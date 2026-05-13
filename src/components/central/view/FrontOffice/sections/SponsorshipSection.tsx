import React, { useState } from 'react';
import { AlertTriangle, Briefcase } from 'lucide-react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { ALL_SLOTS, type SponsorshipSlot, type TycoonState } from '../../../../../types/tycoon';
import { Line, SectionTitle } from '../shared/helpers';
import { SponsorLogo } from '../../../../tycoon/SponsorLogo';
import { getIndustryLabel } from '../../../../../utils/sponsorLogos';
import { getBrandMeta } from '../../../../../data/sponsorCatalogFetcher';

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

export const SponsorshipSection: React.FC<{
  tycoon: TycoonState;
  currency: string;
  avgOpponentPrestige: number;
  marqueeOpponents: string[];
  onNegotiate: (slot: SponsorshipSlot) => void;
  onTicketMultChange: (mult: number) => void;
}> = ({ tycoon, currency, avgOpponentPrestige, marqueeOpponents, onNegotiate, onTicketMultChange }) => {
  const [selectedSlot, setSelectedSlot] = useState<SponsorshipSlot>('kit');
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const deals = ALL_SLOTS.map((slot) => ({ slot, deal: tycoon.sponsorships[slot] }));
  const activeDeals = deals.filter((item) => item.deal);
  const totalAnnual = activeDeals.reduce((sum, item) => sum + (item.deal?.valuePerYear ?? 0), 0);
  const totalValue = activeDeals.reduce((sum, item) => sum + (item.deal?.valuePerYear ?? 0) * Math.max(1, item.deal?.yearsRemaining ?? 1), 0);
  const nextRenewal = activeDeals.reduce<number | null>((min, item) => {
    const years = item.deal?.yearsRemaining;
    if (years === undefined) return min;
    return min === null ? years : Math.min(min, years);
  }, null);
  const selected = tycoon.sponsorships[selectedSlot];
  const cityPrestige = tycoon.cityPrestige ?? 0.5;
  const starLike = 0.75 + cityPrestige * 0.7 + avgOpponentPrestige * 0.35;
  const ticketMult = tycoon.ticketPriceMultiplier ?? 1;

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
            <div className="mt-2 text-2xl font-black text-white tabular-nums">{activeDeals.length} / {ALL_SLOTS.length}</div>
            <div className="text-xs text-slate-400">slots live</div>
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

      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 grid lg:grid-cols-[1fr_220px_220px_300px] gap-5 items-center">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full border border-amber-300/40 bg-amber-300/10 flex items-center justify-center text-3xl text-amber-200">★</div>
          <div>
            <div className="text-lg font-black text-white">Strong Global Brand</div>
            <div className="text-sm text-slate-300">Club prestige and marquee opponents keep premium sponsors engaged.</div>
          </div>
        </div>
        <div className="border-l border-violet-400/20 pl-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-500">City Prestige</div>
          <div className="text-2xl font-black text-white tabular-nums">{cityPrestige.toFixed(2)}</div>
          <div className="text-xs text-emerald-300">Excellent</div>
        </div>
        <div className="border-l border-violet-400/20 pl-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-500">Star Power</div>
          <div className="text-2xl font-black text-white tabular-nums">{starLike.toFixed(2)}x</div>
          <div className="text-xs text-slate-400">Marquee Power</div>
        </div>
        <button onClick={() => onNegotiate(selectedSlot)} className="h-14 rounded-xl border border-violet-300/50 text-white font-black hover:bg-violet-400/10">
          View Brand Profile →
        </button>
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

      <div className="grid xl:grid-cols-[1fr_560px] gap-6">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5">Sponsorship Portfolio</div>
            <div className="grid md:grid-cols-2 2xl:grid-cols-4 gap-4">
              {deals.map(({ slot, deal }) => {
                const active = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
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
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_1.5fr] gap-4">
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-5 flex items-center gap-4">
              <button onClick={() => onNegotiate(selectedSlot)} className="w-14 h-14 rounded-full border border-slate-600 text-3xl text-slate-300 hover:border-amber-300 hover:text-amber-200">+</button>
              <div>
                <div className="text-sm font-black text-white">Available Slot</div>
                <div className="text-xs text-slate-400">Open market for new opportunities.</div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Sponsorship Insights</div>
              <div className="space-y-2 text-sm text-slate-300">
                <div className="text-emerald-300">✓ Kit deal ranks among the strongest current slots.</div>
                <div className="text-emerald-300">✓ Marquee opponents support premium local activation.</div>
                <div className="text-slate-400">Ticket multiplier is {ticketMult.toFixed(2)}x; sponsor visibility follows attendance.</div>
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={ticketMult}
                onChange={(event) => onTicketMultChange(parseFloat(event.target.value))}
                className="mt-4 w-full accent-amber-400"
              />
              {marqueeOpponents.length > 0 && <div className="mt-2 text-xs text-slate-500">Marquee slate: {marqueeOpponents.slice(0, 3).join(', ')}</div>}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Selected Sponsor</div>
              <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-black text-emerald-300">{selected ? 'Active' : 'Open'}</span>
            </div>
            <div className="mt-7 rounded-xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="text-4xl font-black text-white">{selected?.sponsor ?? 'Open Market'}</div>
              <div className="text-sm text-slate-400 mt-1">{SPONSOR_SLOT_LABELS[selectedSlot]}</div>
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-800 pt-5">
                <div><div className="text-xs uppercase tracking-widest text-slate-500">Value Per Year</div><div className="text-xl font-black text-white">{fmt(selected?.valuePerYear ?? 0)}</div></div>
                <div><div className="text-xs uppercase tracking-widest text-slate-500">Contract Length</div><div className="text-xl font-black text-white">{selected?.yearsRemaining ?? 0} Years</div></div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Deal Breakdown</div>
            <div className="grid grid-cols-[150px_1fr] gap-5 items-center">
              <div className="w-32 h-32 rounded-full mx-auto flex items-center justify-center bg-[conic-gradient(#22c55e_0_240deg,#eab308_240deg_315deg,#0ea5e9_315deg_360deg)]">
                <div className="w-20 h-20 rounded-full bg-slate-950 border border-slate-800 flex flex-col items-center justify-center">
                  <div className="text-lg font-black text-white">{fmt((selected?.valuePerYear ?? 0) * 4)}</div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <Line label="Base Fee" value={(selected?.valuePerYear ?? 0) * 0.67} fmt={fmt} />
                <Line label="Performance Bonuses" value={(selected?.valuePerYear ?? 0) * 0.25} fmt={fmt} />
                <Line label="Appearance Clauses" value={(selected?.valuePerYear ?? 0) * 0.08} fmt={fmt} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Next Actions</div>
            {['Renegotiate Deal', 'View Contract Details', 'Find Replacement'].map((action) => (
              <button key={action} onClick={() => onNegotiate(selectedSlot)} className="w-full h-12 mb-2 rounded-xl border border-slate-800 bg-slate-950/70 px-4 flex items-center justify-between text-sm text-slate-200 hover:border-amber-400/60">
                {action}<span>→</span>
              </button>
            ))}
            <button onClick={() => onNegotiate(selectedSlot)} className="mt-3 w-full h-14 rounded-xl border border-amber-400/50 bg-amber-400/15 text-amber-200 font-black">
              Find New Sponsors →
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
