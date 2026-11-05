import React, { useState } from 'react';
import { BadgeDollarSign, BriefcaseBusiness, Building2, CalendarDays, Check, ChevronRight, Landmark, MapPin, ShieldCheck, TrendingUp, X } from 'lucide-react';
import type { GmContractDecision, GmJobOffer } from '../../types';
import { useGame } from '../../store/GameContext';
import { acceptGmJobOffer, acceptGmRenewal, openGmJobMarket, withGmPerformanceReviewTaskStatus } from '../../services/gmCareer/careerService';

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, notation: 'compact', maximumFractionDigits: 2,
  }).format(value);
}

function franchiseValue(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
  }).format(value);
}

const Metric: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="min-w-0 rounded-xl border border-white/10 bg-slate-950/55 p-2.5">
    <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-wider text-slate-500">{icon}{label}</div>
    <p className="mt-1 truncate text-xs font-black text-slate-100">{value}</p>
  </div>
);

const OfferConfirmation: React.FC<{ offer: GmJobOffer; onClose: () => void }> = ({ offer, onClose }) => {
  const { state, dispatchAction, setCurrentView } = useGame();
  const accept = async () => {
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: withGmPerformanceReviewTaskStatus(state, acceptGmJobOffer(state, offer.id)),
    });
    await dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'performanceReview' } });
    setCurrentView('Front Office');
  };
  return (
    <div className="fixed inset-0 z-[12200] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-emerald-500/35 bg-slate-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">Contract Offer</p>
            <h2 className="mt-1 text-2xl font-black text-white">{offer.teamName}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <div className="flex justify-between border-b border-white/10 pb-3"><span className="text-sm text-slate-400">Role</span><span className="font-black text-white">General Manager</span></div>
          <div className="flex justify-between border-b border-white/10 py-3"><span className="text-sm text-slate-400">Annual salary</span><span className="font-black text-emerald-400">{money(offer.annualSalary, offer.currency)}</span></div>
          <div className="flex justify-between border-b border-white/10 py-3"><span className="text-sm text-slate-400">Term</span><span className="font-black text-white">{offer.years} years</span></div>
          <div className="flex justify-between pt-3"><span className="text-sm text-slate-400">State income tax</span><span className="font-black text-white">{offer.estimatedStateTaxRate == null ? 'Local fallback applies' : `${(offer.estimatedStateTaxRate * 100).toFixed(2)}% est.`}</span></div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">Accepting moves your career to this franchise. Your salary begins with the new contract and the club will fill its open front-office position around you.</p>
        <button onClick={accept} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3.5 text-sm font-black uppercase tracking-wide text-white hover:bg-emerald-600">
          <Check size={18} /> Accept Contract
        </button>
      </div>
    </div>
  );
};

export const GmOffersModal: React.FC<{ offers: GmJobOffer[] }> = ({ offers }) => {
  const [selected, setSelected] = useState<GmJobOffer | null>(null);
  return (
    <div className="fixed inset-0 z-[12000] overflow-y-auto bg-[#050b12]/95 p-3 backdrop-blur-md sm:p-5">
      <div className="mx-auto w-full max-w-5xl py-3 sm:py-8">
        <header className="mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">General Manager Career</p>
          <h1 className="mt-1 text-3xl font-black text-white sm:text-5xl">General Manager Offers</h1>
          <p className="mt-2 text-sm text-slate-400">{offers.length} {offers.length === 1 ? 'team is' : 'teams are'} interested. Choose the next franchise for your career.</p>
        </header>

        <div className="space-y-3">
          {offers.map(offer => (
            <article key={offer.id} className={`overflow-hidden rounded-2xl border bg-slate-900/70 shadow-xl ${offer.isFormerTeam ? 'border-emerald-400/70 ring-1 ring-emerald-400/20' : 'border-slate-700/70'}`}>
              <div className="grid gap-0 md:grid-cols-[140px_1fr]">
                <div className="flex items-center justify-center border-b border-white/10 bg-slate-950/45 p-5 md:border-b-0 md:border-r">
                  {offer.logoUrl ? <img src={offer.logoUrl} alt="" className="h-24 w-24 object-contain" /> : <Building2 size={58} className="text-slate-600" />}
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-black text-white">{offer.teamName}</h2>
                        {offer.badge && <span className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">{offer.badge}</span>}
                      </div>
                      <p className="text-xs font-bold uppercase tracking-widest text-orange-400">General Manager</p>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <p className="text-xl font-black text-white">{money(offer.annualSalary, offer.currency)} <span className="text-sm font-medium text-slate-400">/ year</span></p>
                      <p className="text-sm text-slate-400">{offer.years} years</p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-slate-200">{offer.pitch}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <Metric label="Market Size" value={offer.marketSize} icon={<MapPin size={11} />} />
                    <Metric label="Franchise Value" value={franchiseValue(offer.franchiseValue, offer.franchiseValueCurrency ?? 'USD')} icon={<Landmark size={11} />} />
                    <Metric label="Last Year" value={offer.lastYearRecord} icon={<TrendingUp size={11} />} />
                    <Metric label="Strategy" value={offer.strategyLabel} icon={<ShieldCheck size={11} />} />
                  </div>
                  <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <BadgeDollarSign size={15} className="text-emerald-400" />
                      {offer.stateName ? `${offer.stateName} income tax` : 'State tax fallback'}: {offer.estimatedStateTaxRate == null ? 'not available' : `${(offer.estimatedStateTaxRate * 100).toFixed(2)}% estimated effective rate`}
                    </div>
                    <button onClick={() => setSelected(offer)} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white hover:bg-emerald-600">
                      {offer.isFormerTeam ? 'Re-sign' : 'Accept Offer'} <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {offers.length === 0 && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-8 text-center">
            <BriefcaseBusiness className="mx-auto text-slate-500" size={42} />
            <p className="mt-3 font-black text-white">No open positions are available right now.</p>
          </div>
        )}

        <p className="mx-auto mt-5 max-w-3xl text-center text-[10px] leading-relaxed text-slate-500">
          Offers currently stay within the active league. External-league opportunities can join this market after their GM contract cycles are fully supported.
        </p>
      </div>
      {selected && <OfferConfirmation offer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

export const GmContractDecisionModal: React.FC<{ decision: GmContractDecision }> = ({ decision }) => {
  const { state, dispatchAction } = useGame();
  const offer = decision.offer;
  const accept = async () => {
    await dispatchAction({
      type: 'UPDATE_STATE',
      payload: withGmPerformanceReviewTaskStatus(state, acceptGmRenewal(state)),
    });
    await dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'performanceReview' } });
  };
  const compare = () => void dispatchAction({
    type: 'UPDATE_STATE',
    payload: withGmPerformanceReviewTaskStatus(state, openGmJobMarket(state, true)),
  });
  const decline = () => void dispatchAction({
    type: 'UPDATE_STATE',
    payload: withGmPerformanceReviewTaskStatus(state, openGmJobMarket(state, false)),
  });
  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center overflow-y-auto bg-[#050b12]/95 p-3 backdrop-blur-md">
      <section className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:p-7">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300"><CalendarDays size={28} /></div>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">Contract Expired</p>
        <h1 className="mt-1 text-3xl font-black text-white">Contract Decision</h1>
        {decision.renewalOffered && offer ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{decision.teamName} would like you to remain as General Manager.</p>
            <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-3"><BriefcaseBusiness className="text-emerald-400" /><div><p className="font-black text-white">{offer.years} years</p><p className="text-xl font-black text-emerald-400">{money(offer.annualSalary, offer.currency)} per year</p></div></div>
            </div>
            <button onClick={accept} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3.5 text-sm font-black uppercase tracking-wide text-white hover:bg-emerald-600"><Check size={18} /> Accept Renewal</button>
            <button onClick={compare} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 py-3 text-xs font-black uppercase tracking-wide text-slate-200 hover:border-slate-500">Compare All Offers</button>
            <button onClick={decline} className="mt-2 w-full py-2 text-xs font-bold text-slate-500 hover:text-rose-300">Decline and leave the franchise</button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{decision.teamName} has allowed your contract to expire. This is not recorded as a dismissal.</p>
            <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-400">No renewal offer was made. Your next contract will begin only after you accept another GM position.</div>
            <button onClick={decline} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3.5 text-sm font-black uppercase tracking-wide text-white hover:bg-emerald-600"><BriefcaseBusiness size={18} /> View GM Offers</button>
          </>
        )}
      </section>
    </div>
  );
};
