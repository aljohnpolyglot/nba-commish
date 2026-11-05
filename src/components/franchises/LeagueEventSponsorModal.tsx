import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import type { FranchiseLeagueEventDeal, GameState } from '../../types';
import { getLeagueEventSponsorOffers } from '../../services/franchises/franchiseSponsors';

type Props = {
  state: GameState;
  current: FranchiseLeagueEventDeal;
  onClose: () => void;
  onSign: (deal: FranchiseLeagueEventDeal) => void;
};

const money = (value: number) =>
  `$${value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : Math.round(value).toLocaleString()}`;

const SponsorLogo: React.FC<{ deal: FranchiseLeagueEventDeal }> = ({ deal }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <span className="font-black text-slate-300">{deal.brand.slice(0, 2).toUpperCase()}</span>
      {deal.logoUrl && !failed && <img src={deal.logoUrl} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full bg-slate-950 object-contain p-2" />}
    </div>
  );
};

export const LeagueEventSponsorModal: React.FC<Props> = ({
  state,
  current,
  onClose,
  onSign,
}) => {
  const season = state.leagueStats.year;
  const offers = useMemo(
    () => getLeagueEventSponsorOffers(state, current),
    [current, state],
  );
  const [selected, setSelected] = useState<FranchiseLeagueEventDeal | null>(null);
  const [years, setYears] = useState(3);
  const [signed, setSigned] = useState<FranchiseLeagueEventDeal | null>(null);
  const isStrictNbaAllStarTitle = current.assetId === 'all_star_game'
    && state.leagueType === 'modded'
    && (state.moddedLeagueBase == null || state.moddedLeagueBase === 'nba');
  const namingPreview = selected
    ? isStrictNbaAllStarTitle
      ? current.assetName
      : current.namingTemplate?.replace('{brand}', selected.brand) ?? current.assetName
    : current.assetName;
  const adjusted = selected
    ? {
        ...selected,
        startSeason: season,
        endSeason: season + years - 1,
      }
    : null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-2 backdrop-blur-lg sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-indigo-400/35 bg-[#070d18] shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-[#091322] via-indigo-950/40 to-[#07111e] p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-indigo-400/30 bg-indigo-400/10 p-2.5 text-indigo-300"><Trophy size={23} /></div>
            <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-300">Sponsor Offer Negotiations</p><h2 className="mt-1 text-xl font-black text-white sm:text-2xl">{current.assetName}</h2><p className="mt-1 text-xs text-slate-400">{selected ? 'Set the term and review the event title before signing.' : `Available brand offers: ${offers.length}`}</p></div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:text-white" aria-label="Close sponsor offers"><X size={20} /></button>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#050a12] p-4 sm:p-6">
          {signed ? (
            <div className="mx-auto flex max-w-xl flex-col items-center py-4 text-center sm:py-8">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={42} /></div>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Contract Confirmed</p>
              <h3 className="mt-2 text-3xl font-black text-white">Partnership Signed</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400"><b className="text-white">{signed.brand}</b> is now the official partner for <b className="text-indigo-200">{current.assetName}</b>.</p>
              <div className="mt-6 w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left">
                {[
                  ['Display Name', namingPreview],
                  ['Annual Revenue', `${money(signed.annualValueUSD)} / year`],
                  ['Contract Term', `${signed.startSeason}–${signed.endSeason}`],
                  ['Total Contract Value', money(signed.annualValueUSD * years)],
                ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-800 py-3 last:border-0"><span className="text-xs text-slate-500">{label}</span><span className="text-right text-sm font-black text-white">{value}</span></div>)}
              </div>
            </div>
          ) : selected && adjusted ? (
            <div className="space-y-5">
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-400/30 bg-[#081321] p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3"><SponsorLogo deal={selected} /><div><p className="text-xl font-black text-white">{selected.brand}</p><p className="mt-1 text-xs text-slate-400">{selected.industry} · {selected.brandFit ?? '—'}% brand fit</p></div></div>
                <button onClick={() => setSelected(null)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-black text-slate-300"><ArrowLeft size={14} />Back to Offers</button>
              </div>
              <section className="rounded-2xl border border-slate-800 bg-[#081120] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-white">Contract Duration</h3><p className="mt-1 text-xs text-slate-400">Choose the number of locked seasons.</p></div><span className="rounded-xl border border-indigo-400/30 bg-indigo-400/10 px-3 py-2 text-sm font-black text-indigo-200">{years} {years === 1 ? 'Season' : 'Seasons'}</span></div>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map(value => <button key={value} onClick={() => setYears(value)} className={`rounded-xl border py-3 text-sm font-black ${years === value ? 'border-indigo-300 bg-indigo-500 text-white' : 'border-slate-800 bg-slate-950 text-slate-400'}`}>{value}</button>)}
                </div>
              </section>
              <section className="rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-indigo-950/25 to-[#081120] p-4 sm:p-5">
                <div className="flex items-center gap-2 text-indigo-300"><Sparkles size={15} /><h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Contract Terms Summary</h3></div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Annual Value</p><p className="mt-1 font-mono text-lg font-black text-emerald-300">{money(selected.annualValueUSD)}</p></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total Value</p><p className="mt-1 font-mono text-lg font-black text-white">{money(selected.annualValueUSD * years)}</p></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Agreement</p><p className="mt-1 text-sm font-black text-white">{season}–{season + years - 1}</p></div>
                </div>
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Event Title Preview</p><p className="mt-1 text-sm font-black text-indigo-200">{namingPreview}</p>{isStrictNbaAllStarTitle && <p className="mt-1 text-[10px] text-slate-500">{selected.brand} remains the presenting partner without replacing the official event title.</p>}</div>
              </section>
            </div>
          ) : (
            <div className="space-y-3">
              {offers.map(offer => (
                <article key={`${offer.assetId}-${offer.sponsorId}`} className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-[#081120] p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-3"><SponsorLogo deal={offer} /><div className="min-w-0"><h3 className="truncate font-black text-white">{offer.brand}</h3><p className="mt-1 text-xs text-slate-400">{offer.industry} · {offer.brandFit ?? '—'}% brand fit</p><p className="mt-1 font-mono text-sm font-black text-emerald-300">{money(offer.annualValueUSD)} / year</p></div></div>
                  <button onClick={() => { setSelected(offer); setYears(offer.endSeason - offer.startSeason + 1); }} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-400 px-4 py-3 text-xs font-black text-slate-950">Negotiate Deal <ChevronRight size={14} /></button>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-slate-800 bg-[#060c16] p-4 sm:px-6">
          {signed ? <button onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-xs font-black text-slate-950 sm:w-auto"><CheckCircle2 size={16} />Done</button> : adjusted ? <button onClick={() => { onSign(adjusted); setSigned(adjusted); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-300 px-5 py-3 text-xs font-black text-slate-950 sm:w-auto"><CheckCircle2 size={16} />Confirm Contract & Sign Deal</button> : <button onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-xs font-black text-slate-300">Cancel / Close</button>}
        </footer>
      </div>
    </div>
  );
};
