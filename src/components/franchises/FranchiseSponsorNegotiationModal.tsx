import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PenTool,
  Shirt,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  FranchiseCommercialDeal,
  FranchiseSponsorOffer,
  FranchiseSponsorSlot,
  GameState,
  NBATeam,
} from '../../types';
import { getFranchiseSponsorOffers } from '../../services/franchises/franchiseSponsors';

type Props = {
  state: GameState;
  team: NBATeam;
  slot: FranchiseSponsorSlot;
  currentDeal?: FranchiseCommercialDeal;
  onClose: () => void;
  onSign: (offer: FranchiseSponsorOffer) => void;
};

const money = (value: number) =>
  `$${value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : Math.round(value).toLocaleString()}`;

const suffixes = ['Center', 'Arena', 'Stadium', 'Garden', 'Fieldhouse', 'Forum', 'Dome', 'Custom'];

const SponsorLogo: React.FC<{ offer: FranchiseSponsorOffer }> = ({ offer }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <span className="font-black text-slate-300">{offer.brand.slice(0, 2).toUpperCase()}</span>
      {offer.logoUrl && !failed && (
        <img src={offer.logoUrl} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full bg-slate-950 object-contain p-2" />
      )}
    </div>
  );
};

export const FranchiseSponsorNegotiationModal: React.FC<Props> = ({
  state,
  team,
  slot,
  currentDeal,
  onClose,
  onSign,
}) => {
  const offers = useMemo(
    () => getFranchiseSponsorOffers(state, team, slot),
    [slot, state, team],
  );
  const [selected, setSelected] = useState<FranchiseSponsorOffer | null>(null);
  const [years, setYears] = useState(1);
  const [suffix, setSuffix] = useState('Arena');
  const [arenaName, setArenaName] = useState('');
  const [signed, setSigned] = useState<FranchiseSponsorOffer | null>(null);
  const isNaming = slot === 'namingRights';
  const title = isNaming ? 'Arena Naming Rights Offers' : 'Jersey Patch Sponsorship Offers';
  const selectOffer = (offer: FranchiseSponsorOffer) => {
    setSelected(offer);
    setYears(Math.max(1, offer.years));
    setSuffix('Arena');
    setArenaName(offer.venueName ?? `${offer.brand} Arena`);
  };
  const finalName = !isNaming
    ? undefined
    : suffix === 'Custom'
      ? arenaName.trim() || `${selected?.brand ?? ''} Arena`
      : `${selected?.brand ?? ''} ${suffix}`;
  const adjusted = selected
    ? { ...selected, years, venueName: finalName }
    : null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-2 backdrop-blur-md sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-[#070d18] shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-[#091322] via-[#0d1c33] to-[#07111e] p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-2.5 text-cyan-300">
              {isNaming ? <Building2 size={23} /> : <Shirt size={23} />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Sponsor Offer Negotiations</p>
              <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">{title}</h2>
              <p className="mt-1 text-xs text-slate-400">
                {selected ? `Set the terms for ${selected.brand}.` : 'Review an offer, then customize its contract terms.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:text-white" aria-label="Close negotiations"><X size={20} /></button>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#050a12] p-4 sm:p-6">
          {signed ? (
            <div className="mx-auto flex max-w-xl flex-col items-center py-4 text-center sm:py-8">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={42} /></div>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Contract Confirmed</p>
              <h3 className="mt-2 text-3xl font-black text-white">Partnership Signed</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{signed.brand} is now the official {isNaming ? 'arena naming-rights' : 'jersey patch'} partner.</p>
              <div className="mt-6 w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left">
                {[
                  ['Partner', signed.brand],
                  [isNaming ? 'Official Arena Title' : 'Placement', signed.venueName ?? 'Jersey Patch'],
                  ['Annual Revenue', `${money(signed.annualValueUSD)} / year`],
                  ['Contract Term', `${signed.years} ${signed.years === 1 ? 'season' : 'seasons'}`],
                  ['Total Contract Value', money(signed.annualValueUSD * signed.years)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-800 py-3 last:border-0"><span className="text-xs text-slate-500">{label}</span><span className="text-right text-sm font-black text-white">{value}</span></div>
                ))}
              </div>
            </div>
          ) : selected && adjusted ? (
            <div className="space-y-5">
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-cyan-400/30 bg-[#081321] p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3"><SponsorLogo offer={selected} /><div><p className="text-xl font-black text-white">{selected.brand}</p><p className="mt-1 text-xs text-slate-400">{selected.fit}% brand fit · {money(selected.annualValueUSD)} / year</p></div></div>
                <button onClick={() => setSelected(null)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-black text-slate-300"><ArrowLeft size={14} />Back to Offers</button>
              </div>

              {isNaming && (
                <section className="rounded-2xl border border-slate-800 bg-[#081120] p-4 sm:p-5">
                  <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Arena Naming Format</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {suffixes.map(value => (
                      <button key={value} onClick={() => { setSuffix(value); if (value !== 'Custom') setArenaName(`${selected.brand} ${value}`); }} className={`rounded-xl border px-3 py-2.5 text-xs font-black ${suffix === value ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200' : 'border-slate-800 bg-slate-950 text-slate-400'}`}>{value}</button>
                    ))}
                  </div>
                  {suffix === 'Custom' ? (
                    <label className="mt-4 block"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Official Arena Title</span><input value={arenaName} onChange={event => setArenaName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-400/60" /></label>
                  ) : (
                    <div className="mt-4 flex flex-col justify-between gap-1 rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:flex-row sm:items-center"><span className="text-xs text-slate-500">Official Arena Title</span><span className="text-sm font-black text-cyan-200">{finalName}</span></div>
                  )}
                </section>
              )}

              <section className="rounded-2xl border border-slate-800 bg-[#081120] p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div><h3 className="text-sm font-black text-white">Contract Duration</h3><p className="mt-1 text-xs text-slate-400">Choose how many seasons the agreement remains locked.</p></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setYears(value => Math.max(1, value - 1))} disabled={years <= 1} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-white disabled:opacity-30"><ChevronLeft size={19} /></button>
                    <div className="min-w-28 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-center"><p className="text-xl font-black text-cyan-200">{years}</p><p className="text-[9px] font-black uppercase tracking-widest text-cyan-400">{years === 1 ? 'Season' : 'Seasons'}</p></div>
                    <button onClick={() => setYears(value => value + 1)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-white"><ChevronRight size={19} /></button>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Annual Value</p><p className="mt-1 font-mono text-lg font-black text-emerald-300">{money(selected.annualValueUSD)}</p></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total Value</p><p className="mt-1 font-mono text-lg font-black text-white">{money(selected.annualValueUSD * years)}</p></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Term</p><p className="mt-1 text-sm font-black text-white">{state.leagueStats.year}–{state.leagueStats.year + years - 1}</p></div>
                </div>
              </section>
            </div>
          ) : (
            <div>
              {currentDeal && (
                <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-xs text-amber-100">The {currentDeal.brand} agreement has reached its decision window. A newly signed contract replaces it.</div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {offers.map(offer => (
                  <article key={offer.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-[#081120] p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 items-center gap-3"><SponsorLogo offer={offer} /><div className="min-w-0"><h3 className="truncate font-black text-white">{offer.brand}</h3><p className="mt-1 text-xs text-slate-400">{offer.years} years · {offer.fit}% brand fit</p><p className="mt-1 font-mono text-sm font-black text-emerald-300">{money(offer.annualValueUSD)} / year</p></div></div>
                    <button onClick={() => selectOffer(offer)} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-slate-950"><PenTool size={14} />Negotiate</button>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end gap-3 border-t border-slate-800 bg-[#060c16] p-4 sm:px-6">
          {signed ? (
            <button onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-xs font-black text-slate-950 sm:w-auto"><CheckCircle2 size={16} />Done</button>
          ) : adjusted ? (
            <button onClick={() => { onSign(adjusted); setSigned(adjusted); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-xs font-black text-slate-950 sm:w-auto"><Sparkles size={16} />Confirm Contract & Sign Deal</button>
          ) : (
            <button onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-xs font-black text-slate-300">Cancel / Close</button>
          )}
        </footer>
      </div>
    </div>
  );
};
