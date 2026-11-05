import React, { useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock,
  LockKeyhole,
  Sparkles,
  Star,
  Trophy,
} from 'lucide-react';
import type { FranchiseLeagueEventDeal, FranchiseLeagueEventState, GameState } from '../../types';
import { getLeagueEventSponsorOffers } from '../../services/franchises/franchiseSponsors';
import { getLeagueEventDisplayName } from '../../services/franchises/franchiseEventNaming';
import { LeagueEventSponsorModal } from './LeagueEventSponsorModal';

type Props = {
  state: GameState;
  portfolio: FranchiseLeagueEventState;
  onSelectDeal: (deal: FranchiseLeagueEventDeal) => void;
  onSelectDeals: (deals: FranchiseLeagueEventDeal[]) => void;
};

type ViewTab = 'inventory' | 'deals';

const money = (value: number) =>
  `$${value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value.toLocaleString()}`;

const DealLogo: React.FC<{ deal: FranchiseLeagueEventDeal }> = ({ deal }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <span className="text-sm font-black text-slate-300">{deal.brand === 'Unbranded' ? '—' : deal.brand.slice(0, 2).toUpperCase()}</span>
      {deal.logoUrl && !failed && (
        <img src={deal.logoUrl} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full bg-slate-950 object-contain p-2" />
      )}
    </div>
  );
};

const EventIcon: React.FC<{ deal: FranchiseLeagueEventDeal }> = ({ deal }) => {
  const id = deal.assetId;
  const style = id.includes('finals')
    ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
    : id.includes('draft')
      ? 'border-indigo-400/30 bg-indigo-400/10 text-indigo-300'
      : deal.categoryGroup?.includes('All-Star')
        ? 'border-purple-400/30 bg-purple-400/10 text-purple-300'
        : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300';
  const Icon = id.includes('finals') || id.includes('cup')
    ? Trophy
    : id.includes('mvp') || id.includes('draft')
      ? Award
      : Star;
  return <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${style}`}><Icon size={22} /></div>;
};

export const LeagueEventSponsorships: React.FC<Props> = ({
  state,
  portfolio,
  onSelectDeal,
  onSelectDeals,
}) => {
  const season = state.leagueStats.year;
  const [tab, setTab] = useState<ViewTab>('inventory');
  const [selectedAsset, setSelectedAsset] = useState<FranchiseLeagueEventDeal | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const dueDeals = portfolio.deals.filter(deal =>
    deal.brand === 'Unbranded' || deal.endSeason <= season,
  );
  const activeDeals = portfolio.deals.filter(deal =>
    deal.brand !== 'Unbranded' && deal.endSeason >= season,
  );
  const total = activeDeals.reduce((sum, deal) => sum + deal.annualValueUSD, 0);
  const expiringSoon = activeDeals.filter(deal => deal.endSeason <= season + 1).length;
  const progress = Math.round(activeDeals.length / Math.max(1, portfolio.deals.length) * 100);
  const groups = useMemo(
    () => [...new Set(portfolio.deals.map(deal => deal.categoryGroup ?? 'League Events'))],
    [portfolio.deals],
  );

  return (
    <div className="min-h-full bg-[#040811] px-3 py-5 text-slate-100 sm:px-7 sm:py-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-slate-700/70 bg-gradient-to-r from-[#091322] via-[#0d1c33] to-[#07111e] p-6 shadow-2xl sm:p-9">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-indigo-400/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-300">{state.leagueStats.leagueName ?? 'League'} · {season}</p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">League Event Sponsorships</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Manage and assign brand sponsors to major league tournaments, All-Star events and awards.</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-[#081120] p-5"><BadgeCheck className="text-indigo-300" /><p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Sponsored Assets</p><p className="mt-1 text-3xl font-black text-white">{activeDeals.length} / {portfolio.deals.length}</p></div>
          <div className="rounded-2xl border border-slate-800 bg-[#081120] p-5"><CircleDollarSign className="text-emerald-300" /><p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Annual Revenue</p><p className="mt-1 text-3xl font-black text-emerald-300">{money(total)}</p></div>
          <div className="rounded-2xl border border-slate-800 bg-[#081120] p-5"><LockKeyhole className="text-cyan-300" /><p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Locked Deals</p><p className="mt-1 text-3xl font-black text-white">{activeDeals.length}</p></div>
          <div className="rounded-2xl border border-slate-800 bg-[#081120] p-5"><Clock className="text-amber-300" /><p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Expiring Soon</p><p className={`mt-1 text-3xl font-black ${expiringSoon > 0 ? 'text-amber-300' : 'text-white'}`}>{expiringSoon}</p></div>
        </div>

        <nav className="flex rounded-2xl border border-slate-800 bg-[#081120] p-1.5">
          {([
            ['inventory', 'Asset Inventory'],
            ['deals', 'Active Deals'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${tab === id ? 'bg-white text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{label}</button>
          ))}
        </nav>

        {tab === 'inventory' ? (
          <div className="space-y-5">
            <section className="rounded-2xl border border-indigo-400/25 bg-[#08121e] p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex items-center gap-3 lg:min-w-72"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-400/10 text-indigo-300"><CheckCircle2 size={21} /></div><div><p className="text-sm font-black text-white">{activeDeals.length} of {portfolio.deals.length} event assets sponsored</p><p className="mt-0.5 text-xs text-slate-400">{dueDeals.length > 0 ? `${dueDeals.length} decisions remain.` : 'Every scheduled asset has a partner.'}</p></div></div>
                <div className="flex flex-1 items-center gap-3"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${progress}%` }} /></div><span className="font-mono text-xs font-black text-slate-300">{progress}%</span></div>
                {dueDeals.length > 0 && (
                  <button
                    onClick={() => onSelectDeals(
                      dueDeals.flatMap(deal => getLeagueEventSponsorOffers(state, deal).slice(0, 1)),
                    )}
                    className="flex items-center justify-center gap-2 rounded-xl border border-indigo-400/40 bg-indigo-400/10 px-4 py-3 text-xs font-black text-indigo-200"
                  >
                    <Sparkles size={15} /> Auto-Fill Unassigned Assets
                  </button>
                )}
              </div>
            </section>
            {groups.map(group => {
              const deals = portfolio.deals.filter(deal => (deal.categoryGroup ?? 'League Events') === group);
              const isCollapsed = collapsed[group];
              return (
                <section key={group} className="rounded-2xl border border-slate-800 bg-[#081120] p-4 sm:p-6">
                  <button onClick={() => setCollapsed(value => ({ ...value, [group]: !value[group] }))} className="flex w-full items-center justify-between gap-4 text-left">
                    <span className="flex items-center gap-2"><Sparkles className="text-indigo-300" size={18} /><span className="text-xs font-black uppercase tracking-[0.2em] text-white">{group}</span><span className="text-[11px] text-slate-500">({deals.length} assets)</span></span>
                    {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                  </button>
                  {!isCollapsed && (
                    <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {deals.map(deal => {
                        const due = deal.brand === 'Unbranded' || deal.endSeason <= season;
                        return (
                          <article key={deal.assetId} className={`rounded-2xl border p-4 ${due ? 'border-amber-400/35 bg-amber-400/5' : 'border-slate-800 bg-slate-950/55'}`}>
                            <div className="flex items-start gap-3">
                              <EventIcon deal={deal} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-white">{deal.assetName}</h2>{deal.required && <span className="rounded-md border border-indigo-400/30 bg-indigo-400/10 px-2 py-0.5 text-[9px] font-black uppercase text-indigo-300">Required</span>}</div><p className="mt-1 text-[10px] text-slate-500">{deal.day} · {deal.durationDays} · Prestige {deal.prestige}</p></div><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${due ? 'border-amber-400/30 text-amber-300' : 'border-emerald-400/30 text-emerald-300'}`}>{due ? 'Sponsor Due' : `Through ${deal.endSeason}`}</span></div>
                                <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5"><DealLogo deal={deal} /><div className="min-w-0"><p className="truncate text-sm font-black text-white">{deal.brand}</p><p className="mt-0.5 text-[10px] text-slate-500">{deal.industry || 'Presenting Partner'}</p><p className="mt-1 font-mono text-xs font-black text-emerald-300">{money(deal.annualValueUSD)} / year</p></div></div>
                              </div>
                            </div>
                            {due && <button onClick={() => setSelectedAsset(deal)} className="mt-3 w-full rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-950">Select Sponsor</button>}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <section className="rounded-2xl border border-slate-800 bg-[#081120] p-4 sm:p-6">
            <div className="space-y-3">
              {activeDeals.map(deal => (
                <article key={deal.assetId} className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/55 p-3 sm:grid-cols-[auto_1.2fr_1fr_auto_auto]">
                  <DealLogo deal={deal} />
                  <div className="min-w-0"><p className="truncate text-sm font-black text-white">{deal.brand}</p><p className="text-[10px] text-slate-500">{deal.industry}</p></div>
                  <div className="col-span-2 min-w-0 sm:col-span-1"><p className="truncate text-xs font-bold text-indigo-300">{getLeagueEventDisplayName(state, deal.assetId, deal.assetName)}</p><p className="text-[10px] text-slate-500">{deal.assetName}</p></div>
                  <p className="font-mono text-xs font-black text-emerald-300">{money(deal.annualValueUSD)}</p>
                  <p className="text-right text-[10px] font-bold text-slate-400">{deal.startSeason}–{deal.endSeason}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
      {selectedAsset && (
        <LeagueEventSponsorModal
          state={state}
          current={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onSign={onSelectDeal}
        />
      )}
    </div>
  );
};
