import React, { useEffect, useMemo, useState } from 'react';
import { Beer, Building2, Car, ChevronLeft, ChevronRight, RotateCcw, Sandwich, Ticket, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  FranchiseAncillaryPrice,
  FranchiseOperationsState,
  FranchiseTicketTier,
  GameState,
  NBATeam,
} from '../../types';
import {
  FRANCHISE_ANCILLARY_LABELS,
  FRANCHISE_TICKET_LABELS,
  FRANCHISE_TICKET_TIERS,
  getFranchiseMatchdayProjection,
  getFranchiseAncillaryPriceControls,
  getFranchiseTicketPriceControls,
} from '../../services/franchises/franchiseMatchday';
import { ensureFranchiseOperations } from '../../services/franchises/franchiseState';
import { getTeamFullName } from '../../utils/teamNames';
import { FranchiseCenterCourt } from './FranchiseCenterCourt';
import { NewArenaReviewModal } from './NewArenaReviewModal';

type ManifestSection = {
  label: string;
  category: 'lowerBowl' | 'upperBowl' | 'courtside' | 'floorSection' | 'boxTable';
  file: string;
  box: { x: number; y: number; width: number; height: number };
};

type Props = {
  state: GameState;
  team: NBATeam;
  franchise: FranchiseOperationsState;
  readOnly?: boolean;
  onPriceChange: (tier: FranchiseTicketTier, value: number) => void;
  onAncillaryPriceChange: (item: 'parking' | 'hotdog' | 'beer', value: number) => void;
  onAcceptArena: (facilityName: string) => void;
};

const colors: Record<FranchiseTicketTier, string> = {
  courtside: '#f59e0b',
  floor: '#ef4444',
  lowerBowl: '#10b981',
  vip: '#0ea5e9',
  upperBowl: '#6366f1',
  suites: '#ec4899',
};

const sectionTier = (section: ManifestSection): FranchiseTicketTier => {
  if (section.category === 'lowerBowl') return 'lowerBowl';
  if (section.category === 'upperBowl') return 'upperBowl';
  if (section.category === 'courtside') return 'courtside';
  if (section.category === 'floorSection') return 'floor';
  return section.label.toLowerCase().includes('vip') ? 'vip' : 'suites';
};

const money = (value: number) => value.toLocaleString('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: Math.abs(value) < 10 || !Number.isInteger(value) ? 2 : 0,
  maximumFractionDigits: 2,
});

type PriceRank = {
  rank: number;
  total: number;
  tiedAll: boolean;
};

const rankLabel = ({ rank, total, tiedAll }: PriceRank) =>
  tiedAll ? 'League standard' : rank === 1 ? '#1 Most Expensive in League' : `#${rank} of ${total} by price`;

export const FranchiseArenaPanel: React.FC<Props> = ({
  state,
  team,
  franchise,
  readOnly = false,
  onPriceChange,
  onAncillaryPriceChange,
  onAcceptArena,
}) => {
  const [manifest, setManifest] = useState<ManifestSection[]>([]);
  const [selectedTier, setSelectedTier] = useState<FranchiseTicketTier | null>(null);
  const [zoom, setZoom] = useState(1);
  const [reviewNewArena, setReviewNewArena] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/franchises/arena-map-compartmentalized/manifest/manifest.min.json')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Arena manifest unavailable')))
      .then(data => {
        if (active) setManifest(Array.isArray(data.sections) ? data.sections : []);
      })
      .catch(() => {
        if (active) setManifest([]);
      });
    return () => { active = false; };
  }, []);
  const projection = useMemo(
    () => getFranchiseMatchdayProjection(state, team, franchise),
    [franchise, state, team],
  );
  const byTier = new Map(projection.tiers.map(row => [row.tier, row]));
  const capacity = franchise.arena.capacity;
  const isVisible = (tier: FranchiseTicketTier) => (
    (tier !== 'upperBowl' || capacity >= 12_000)
    && (tier !== 'suites' && tier !== 'vip' || capacity >= 15_000)
  );
  const orderedTiers = [...FRANCHISE_TICKET_TIERS].sort(
    (left, right) => franchise.ticketPrices[right].priceUSD - franchise.ticketPrices[left].priceUSD,
  );
  const priceRanks = useMemo(() => {
    const leagueFranchises = state.teams.map(candidate => ({
      teamId: candidate.id,
      franchise: ensureFranchiseOperations(state, candidate),
    }));
    const rank = (values: Array<{ teamId: number; price: number }>, price: number): PriceRank => ({
      rank: 1 + values.filter(row => row.price > price).length,
      total: values.length,
      tiedAll: values.length > 1 && values.every(row => Math.abs(row.price - values[0].price) < 0.001),
    });
    const ticket = Object.fromEntries(FRANCHISE_TICKET_TIERS.map(tier => {
      const values = leagueFranchises
        .map(row => ({ teamId: row.teamId, price: Number(row.franchise.ticketPrices[tier]?.priceUSD) }))
        .filter(row => Number.isFinite(row.price));
      return [tier, rank(values, franchise.ticketPrices[tier].priceUSD)];
    })) as Record<FranchiseTicketTier, PriceRank>;
    const ancillaryItems: FranchiseAncillaryPrice[] = ['parking', 'hotdog', 'beer'];
    const ancillary = Object.fromEntries(ancillaryItems.map(item => {
      const values = leagueFranchises
        .map(row => ({ teamId: row.teamId, price: Number(row.franchise.ancillaryPrices?.[item]?.priceUSD) }))
        .filter(row => Number.isFinite(row.price));
      const price = Number(franchise.ancillaryPrices?.[item]?.priceUSD ?? 0);
      return [item, rank(values, price)];
    })) as Record<FranchiseAncillaryPrice, PriceRank>;
    return { ticket, ancillary };
  }, [franchise, state]);
  return (
    <div className="space-y-5">
      {franchise.arena.pendingNewArena && (
        <section className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Owner-funded arena proposal</p>
              <h3 className="mt-1 text-lg font-black text-white">{franchise.arena.pendingNewArena.proposedName}</h3>
              <p className="mt-1 text-sm text-slate-300">{franchise.arena.pendingNewArena.location} · {franchise.arena.pendingNewArena.capacity.toLocaleString()} seats</p>
            </div>
            {!readOnly && <button onClick={() => setReviewNewArena(true)} className="rounded-xl bg-amber-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-950">Review New Arena</button>}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#081120] shadow-xl">
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative min-h-64 overflow-hidden bg-slate-950">
            {franchise.arena.imageUrl ? (
              <img src={franchise.arena.imageUrl} alt={franchise.arena.displayName} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950 text-slate-600"><Building2 size={72} /></div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Arena Profile</p>
              <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">{franchise.arena.displayName}</h2>
              <p className="mt-1 text-sm text-slate-300">{franchise.arena.location}</p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Capacity</p><p className="mt-1 text-xl font-black text-white">{franchise.arena.capacity.toLocaleString()}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Opened</p><p className="mt-1 text-xl font-black text-white">{franchise.arena.openedSeason ?? '—'}</p></div>
            </div>
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Naming Rights Sponsor</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <p className="truncate text-lg font-black text-white">{franchise.deals.namingRights?.brand ?? 'Unsponsored'}</p>
                {franchise.deals.namingRights && <p className="shrink-0 text-[10px] font-bold text-cyan-300">Through {franchise.deals.namingRights.endSeason}</p>}
              </div>
              {franchise.deals.namingRights && <p className="mt-1 font-mono text-xs font-black text-emerald-300">{money(franchise.deals.namingRights.annualValueUSD)} / year</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#081120] shadow-2xl">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:p-6">
          <div>
            <div className="flex items-center gap-2"><Ticket className="text-purple-400" size={22} /><h2 className="text-xl font-black text-white">Pricing</h2></div>
            <p className="mt-1 text-xs text-slate-400">{franchise.arena.displayName} · {franchise.arena.location}</p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-right">
            <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Capacity</p><p className="mt-1 text-sm font-black text-white">{capacity.toLocaleString()}</p></div>
            <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Expected</p><p className="mt-1 text-sm font-black text-cyan-300">{projection.attendance.toLocaleString()}</p></div>
            <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Fill</p><p className="mt-1 text-sm font-black text-emerald-300">{Math.round(projection.fillRate * 100)}%</p></div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row">
          <div className="relative min-h-[320px] flex-1 overflow-hidden bg-[#050b16] p-3 sm:min-h-[500px]">
            <div className="absolute left-3 top-3 z-10 flex gap-1.5">
              <button onClick={() => setZoom(value => Math.min(2.2, value + 0.25))} className="rounded-lg border border-slate-700 bg-slate-950/90 p-2 text-slate-300"><ZoomIn size={15} /></button>
              <button onClick={() => setZoom(value => Math.max(0.7, value - 0.25))} className="rounded-lg border border-slate-700 bg-slate-950/90 p-2 text-slate-300"><ZoomOut size={15} /></button>
              <button onClick={() => { setZoom(1); setSelectedTier(null); }} className="rounded-lg border border-slate-700 bg-slate-950/90 p-2 text-slate-300"><RotateCcw size={15} /></button>
            </div>
            <div className="flex h-full min-h-[300px] items-center justify-center transition-transform duration-300 sm:min-h-[480px]" style={{ transform: `scale(${zoom})` }}>
              {manifest.length > 0 ? (
                <svg viewBox="0 0 3200 2800" className="h-auto max-h-[520px] w-full max-w-[850px] drop-shadow-2xl">
                  {manifest.map(section => {
                    if (section.file.includes('center/')) return null;
                    const tier = sectionTier(section);
                    if (!isVisible(tier)) return null;
                    return (
                      <image
                        key={section.file}
                        preserveAspectRatio="none"
                        href={`/franchises/arena-map-compartmentalized/${section.file}`}
                        x={section.box.x}
                        y={section.box.y}
                        width={section.box.width}
                        height={section.box.height}
                        opacity={selectedTier && selectedTier !== tier ? 0.2 : 1}
                        onClick={() => setSelectedTier(selectedTier === tier ? null : tier)}
                        className="cursor-pointer transition-opacity"
                      />
                    );
                  })}
                  <FranchiseCenterCourt team={team} />
                </svg>
              ) : (
                <div className="text-center text-slate-500"><Building2 className="mx-auto mb-3" size={42} /><p className="text-sm font-bold">Arena map unavailable</p></div>
              )}
            </div>
          </div>

          <aside className="w-full space-y-2.5 border-t border-slate-800 bg-[#07101d] p-3.5 lg:w-96 lg:border-l lg:border-t-0 sm:p-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">Ticket Tier Pricing</h3>
              <span className="text-[9px] font-bold text-slate-500">Sorted by price</span>
            </div>
            {orderedTiers.map(tier => {
              const stats = byTier.get(tier)!;
              const excluded = !isVisible(tier);
              const selected = selectedTier === tier;
              const price = franchise.ticketPrices[tier].priceUSD;
              const controls = getFranchiseTicketPriceControls(state, tier);
              return (
                <div
                  key={tier}
                  onClick={() => !excluded && setSelectedTier(selected ? null : tier)}
                  className={`rounded-xl border p-3 transition-colors ${excluded ? 'cursor-not-allowed border-slate-900 bg-black/20 opacity-45' : selected ? 'border-purple-400/50 bg-slate-800' : 'cursor-pointer border-slate-800 bg-slate-950/60 hover:border-slate-700'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[tier] }} /><span className="truncate text-xs font-black text-white">{FRANCHISE_TICKET_LABELS[tier]}</span></div>
                    {excluded && <span className="text-[9px] font-black uppercase text-slate-500">Not built</span>}
                  </div>
                  {!excluded && (
                    <>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Per ticket</p>
                          <p className="font-mono text-lg font-black text-white">{money(price)}</p>
                          <p className={`mt-0.5 text-[9px] font-black ${priceRanks.ticket[tier].rank === 1 ? 'text-amber-300' : 'text-slate-500'}`}>{rankLabel(priceRanks.ticket[tier])}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            disabled={readOnly}
                            onClick={event => { event.stopPropagation(); onPriceChange(tier, Math.max(controls.min, price - controls.step)); }}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={`Lower ${FRANCHISE_TICKET_LABELS[tier]} price`}
                          ><ChevronLeft size={18} /></button>
                          <button
                            disabled={readOnly}
                            onClick={event => { event.stopPropagation(); onPriceChange(tier, Math.min(controls.max, price + controls.step)); }}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={`Raise ${FRANCHISE_TICKET_LABELS[tier]} price`}
                          ><ChevronRight size={18} /></button>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-500"><span>{stats.attendance.toLocaleString()} expected</span><span>{Math.round(stats.demand * 100)}% demand</span></div>
                    </>
                  )}
                </div>
              );
            })}
          </aside>
        </div>
        <section className="border-t border-slate-800 bg-[#07101d] p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Arena Parking & Food Concessions</p><p className="mt-1 text-xs text-slate-400">Set matchday add-on prices with the same saved, season-aware controls.</p></div>
            <p className="font-mono text-sm font-black text-emerald-300">{money(projection.ancillaryRevenuePerGame)} / game</p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {projection.ancillary.map(item => {
              const ItemIcon = item.item === 'parking' ? Car : item.item === 'hotdog' ? Sandwich : Beer;
              const iconColor = item.item === 'parking' ? 'text-purple-300' : 'text-amber-300';
              const controls = getFranchiseAncillaryPriceControls(state, item.item);
              return (
              <div key={item.item} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-black text-white"><ItemIcon size={15} className={iconColor} />{FRANCHISE_ANCILLARY_LABELS[item.item]}</span><span className="text-[10px] text-slate-500">{item.volume.toLocaleString()} projected</span></div>
                <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 p-1">
                  <button disabled={readOnly} onClick={() => onAncillaryPriceChange(item.item, Math.max(controls.min, item.price - controls.step))} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-white disabled:cursor-not-allowed disabled:opacity-35" aria-label={`Lower ${FRANCHISE_ANCILLARY_LABELS[item.item]} price`}><ChevronLeft size={16} /></button>
                  <div className="text-center">
                    <p className="font-mono text-base font-black text-white">{money(item.price)}</p>
                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">each</p>
                    <p className={`mt-0.5 text-[8px] font-black ${priceRanks.ancillary[item.item].rank === 1 ? 'text-amber-300' : 'text-slate-500'}`}>{rankLabel(priceRanks.ancillary[item.item])}</p>
                  </div>
                  <button disabled={readOnly} onClick={() => onAncillaryPriceChange(item.item, Math.min(controls.max, item.price + controls.step))} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-white disabled:cursor-not-allowed disabled:opacity-35" aria-label={`Raise ${FRANCHISE_ANCILLARY_LABELS[item.item]} price`}><ChevronRight size={16} /></button>
                </div>
                <div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, item.volume / Math.max(1, projection.attendance) * 180)}%` }} /></div><p className="shrink-0 font-mono text-xs font-bold text-emerald-300">{money(item.revenue)} / game</p></div>
              </div>
              );
            })}
          </div>
        </section>
        <footer className="grid grid-cols-1 gap-3 border-t border-slate-800 bg-black/20 p-4 sm:grid-cols-3">
          <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Matchday / Game</p><p className="mt-1 text-lg font-black text-white">{money(projection.matchdayRevenuePerGame)}</p></div>
          <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{projection.homeGames} {projection.homeGamesSource === 'schedule' ? 'Scheduled' : 'Expected'} Home Games</p><p className="mt-1 text-lg font-black text-emerald-300">{money(projection.annualMatchdayRevenue)}</p></div>
          <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Club</p><p className="mt-1 truncate text-lg font-black text-white">{getTeamFullName(team)}</p></div>
        </footer>
      </section>
      {!readOnly && reviewNewArena && franchise.arena.pendingNewArena && (
        <NewArenaReviewModal
          currentArena={franchise.arena}
          proposal={franchise.arena.pendingNewArena}
          onClose={() => setReviewNewArena(false)}
          onAccept={facilityName => {
            onAcceptArena(facilityName);
            setReviewNewArena(false);
          }}
        />
      )}
    </div>
  );
};
