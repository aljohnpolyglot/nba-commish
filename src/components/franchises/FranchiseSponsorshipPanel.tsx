import React, { useState } from 'react';
import { BadgeCheck, Building2, Handshake, History, Shirt, Sparkles } from 'lucide-react';
import type {
  FranchiseOperationsState,
  FranchiseSponsorOffer,
  FranchiseSponsorSlot,
  GameState,
  NBATeam,
} from '../../types';
import {
  getFranchiseDueSlots,
  isJerseyPatchAvailable,
} from '../../services/franchises/franchiseState';
import { getFranchiseSponsorRevenue } from '../../services/franchises/franchiseSponsors';
import { FranchiseSponsorNegotiationModal } from './FranchiseSponsorNegotiationModal';

type Props = {
  state: GameState;
  team: NBATeam;
  franchise: FranchiseOperationsState;
  readOnly?: boolean;
  onSign: (offer: FranchiseSponsorOffer) => void;
};

const slotLabel: Record<FranchiseSponsorSlot, string> = {
  namingRights: 'Arena Naming Rights',
  jerseyPatch: 'Jersey Patch',
};

const money = (value: number) =>
  `$${value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value.toLocaleString()}`;

const SponsorMark: React.FC<{ brand: string; logoUrl?: string }> = ({ brand, logoUrl }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <span className="text-lg font-black text-slate-300">{brand.slice(0, 2).toUpperCase()}</span>
      {logoUrl && !failed && <img src={logoUrl} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full bg-slate-950 object-contain p-2" />}
    </div>
  );
};

export const FranchiseSponsorshipPanel: React.FC<Props> = ({
  state,
  team,
  franchise,
  readOnly = false,
  onSign,
}) => {
  const season = state.leagueStats.year;
  const jerseyPatchAvailable = isJerseyPatchAvailable(state.leagueStats);
  const dueSlots = getFranchiseDueSlots(franchise, state.leagueStats);
  const slots = (['namingRights', 'jerseyPatch'] as FranchiseSponsorSlot[])
    .filter(slot => slot !== 'jerseyPatch' || jerseyPatchAvailable);
  const annualValue = getFranchiseSponsorRevenue(franchise, season, jerseyPatchAvailable);
  const [negotiatingSlot, setNegotiatingSlot] = useState<FranchiseSponsorSlot | null>(null);
  const history = franchise.history.filter(entry => entry.kind === 'sponsor');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-[#081120] p-5"><div className="flex items-center gap-3"><div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-300"><Handshake size={25} /></div><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Active Deals</p><p className="mt-1 text-3xl font-black text-white">{slots.filter(slot => franchise.deals[slot]?.endSeason! >= season).length}</p></div></div></div>
        <div className="rounded-2xl border border-slate-800 bg-[#081120] p-5"><div className="flex items-center gap-3"><div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-emerald-300"><BadgeCheck size={25} /></div><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Annual Value</p><p className="mt-1 text-3xl font-black text-emerald-300">{money(annualValue)}</p></div></div></div>
        <div className="rounded-2xl border border-slate-800 bg-[#081120] p-5"><div className="flex items-center gap-3"><div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-cyan-300"><Building2 size={25} /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Naming Rights</p><p className="mt-1 truncate text-lg font-black text-white">{franchise.arena.displayName}</p></div></div></div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-[#081120] p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><Sparkles className="text-amber-300" size={18} /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Franchise Partnerships</h2></div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {slots.map(slot => {
            const deal = franchise.deals[slot];
            const due = dueSlots.includes(slot);
            const Icon = slot === 'namingRights' ? Building2 : Shirt;
            return (
              <article key={slot} className={`rounded-2xl border p-4 ${due ? 'border-rose-400/35 bg-rose-400/5' : 'border-slate-800 bg-slate-950/45'}`}>
                <div className="flex items-start gap-3">
                  {deal ? <SponsorMark brand={deal.brand} logoUrl={deal.logoUrl} /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-slate-700 text-slate-500"><Icon size={24} /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{slotLabel[slot]}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${due ? 'border-rose-400/30 bg-rose-400/10 text-rose-300' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'}`}>{due ? 'Decision Due' : 'Contracted'}</span>
                    </div>
                    <h3 className="mt-1 truncate text-lg font-black text-white">{deal?.brand ?? 'Open Partnership'}</h3>
                    {deal && <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400"><span><b className="text-white">{money(deal.annualValueUSD)}</b> annually</span><span>Through <b className="text-white">{deal.endSeason}</b></span></div>}
                    {due && !readOnly && <button onClick={() => setNegotiatingSlot(slot)} className="mt-3 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-950">Review Offers</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {history.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-[#081120] p-4 sm:p-6">
          <div className="flex items-center gap-2"><History size={17} className="text-cyan-300" /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Partnership History</h2></div>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {history.slice(0, 12).map(entry => (
              <article key={entry.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <SponsorMark brand={entry.title} logoUrl={entry.logoUrl} />
                <div className="min-w-0"><p className="truncate text-sm font-black text-white">{entry.title}</p><p className="mt-1 text-xs text-slate-400">{entry.detail}</p><p className="mt-1 text-[10px] font-bold text-cyan-300">{entry.season}</p></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!readOnly && negotiatingSlot && (
        <FranchiseSponsorNegotiationModal
          state={state}
          team={team}
          slot={negotiatingSlot}
          currentDeal={franchise.deals[negotiatingSlot]}
          onClose={() => setNegotiatingSlot(null)}
          onSign={onSign}
        />
      )}
    </div>
  );
};
