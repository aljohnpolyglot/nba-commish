import React, { useMemo, useState } from 'react';
import { X, Handshake, Search, RefreshCw, List as ListIcon, LayoutGrid } from 'lucide-react';
import { SponsorOfferModal } from './SponsorOfferModal';
import { StartNegotiationModal, KIT_FAMILY_SLOTS } from './StartNegotiationModal';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  CATEGORY_TINT,
  ENDORSEMENT_SLOT_CAP,
  FIT_LABEL,
  FIT_TINT,
  FilterRow,
  FilterSection,
  INTEREST_LABEL,
  INTEREST_TINT,
  KpiCard,
  SORT_LABEL,
  buildSponsorOfferData,
  buildStartNegotiationData,
  formatOpenMarketCurrency,
  generateMockOffers,
  type DealCategory,
  type DealType,
  type MockOffer,
  type OfferStatus,
  type SortKey,
} from './openMarketModalShared';
import { useGame } from '../../store/GameContext';
import { getBrandMeta } from '../../data/sponsorCatalogFetcher';
import { applyRenewal, classifySponsor, type SponsorshipOffer } from '../../services/tycoon/sponsorshipEngine';
import { type SponsorIndustry, type SponsorshipSlot, type TycoonTier } from '../../types/tycoon';
import { SponsorLogo } from './SponsorLogo';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const OpenMarketModal: React.FC<Props> = ({ open, onClose }) => {
  const { state, applyTycoonMutation } = useGame() as any;
  const userTeamId = state?.userTeamId;
  const team = state?.teams?.find((t: any) => (t.id ?? t.tid) === userTeamId)
    ?? state?.nonNBATeams?.find((t: any) => (t.id ?? t.tid) === userTeamId);
  const tycoon = team?.tycoon;
  const tier: TycoonTier = tycoon?.tier ?? 'A';
  const currency = state?.leagueStats?.currency ?? 'EUR';
  const fmt = (value: number) => formatOpenMarketCurrency(value, currency);
  const activeEndorsements = ((tycoon?.oneTimePayouts ?? []) as any[]).filter((p) => p.kind === 'endorsement');
  const activeEndorsementBrands = new Set(activeEndorsements.map((p) => p.brand).filter(Boolean));
  const endorsementCapReached = activeEndorsements.length >= ENDORSEMENT_SLOT_CAP;

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('potential-high');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [categoryFilter, setCategoryFilter] = useState<Set<DealCategory | 'all'>>(new Set(['all']));
  const [statusFilter, setStatusFilter] = useState<Set<OfferStatus | 'all'>>(new Set(['all']));
  const [dealTypeFilter, setDealTypeFilter] = useState<Set<DealType>>(new Set(['sponsorship', 'endorsement']));
  const [minValue, setMinValue] = useState(0);
  const [selectedOffer, setSelectedOffer] = useState<MockOffer | null>(null);
  const [negotiationOffer, setNegotiationOffer] = useState<MockOffer | null>(null);

  const allOffers = useMemo(() => {
    if (!open) return [];
    return generateMockOffers(tier, 'spain', userTeamId ?? 1);
  }, [open, tier, userTeamId]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allOffers.length };
    for (const offer of allOffers) counts[offer.category] = (counts[offer.category] ?? 0) + 1;
    return counts;
  }, [allOffers]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allOffers.length };
    for (const offer of allOffers) counts[offer.status] = (counts[offer.status] ?? 0) + 1;
    return counts;
  }, [allOffers]);

  const dealTypeCounts = useMemo(() => {
    const counts: Record<DealType, number> = { sponsorship: 0, endorsement: 0 };
    for (const offer of allOffers) counts[offer.dealType]++;
    return counts;
  }, [allOffers]);

  const availableCount = useMemo(() => {
    const sponsorships = tycoon?.sponsorships ?? {};
    const signedBrands = new Set([
      ...Object.values(sponsorships).map((s: any) => s?.sponsor).filter(Boolean),
      ...((tycoon?.oneTimePayouts ?? []) as any[])
        .filter((p) => p.kind === 'endorsement')
        .map((p) => p.brand)
        .filter(Boolean),
    ]);
    const endorsementsSigned = ((tycoon?.oneTimePayouts ?? []) as any[]).filter((p) => p.kind === 'endorsement').length;
    return allOffers.filter((offer) => {
      if (offer.interestLevel === 'not-interested') return false;
      if (signedBrands.has(offer.brand)) return false;
      if (offer.dealType === 'endorsement' && endorsementsSigned >= ENDORSEMENT_SLOT_CAP) return false;
      if (offer.dealType !== 'endorsement') {
        const isKitFamily = (KIT_FAMILY_SLOTS as string[]).includes(offer.slot);
        if (isKitFamily && KIT_FAMILY_SLOTS.every((slot) => sponsorships[slot])) return false;
        if (!isKitFamily && sponsorships[offer.slot]) return false;
      }
      return true;
    }).length;
  }, [allOffers, tycoon]);

  const conflictIndustries = useMemo(() => {
    const set = new Set<SponsorIndustry | 'generic'>();
    const sponsorships = Object.values(tycoon?.sponsorships ?? {}) as Array<{ industry?: SponsorIndustry } | null>;
    const gambling = sponsorships.filter((s) => s?.industry === 'gambling').length;
    const beerEnergy = sponsorships.filter((s) => s?.industry === 'beer' || s?.industry === 'energy_drink').length;
    if (gambling >= 1) set.add('gambling');
    if (beerEnergy >= 2) {
      set.add('beer');
      set.add('energy_drink');
    }
    return set;
  }, [tycoon]);

  const filteredOffers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = allOffers
      .filter((offer) => categoryFilter.has('all') || categoryFilter.has(offer.category))
      .filter((offer) => statusFilter.has('all') || statusFilter.has(offer.status))
      .filter((offer) => dealTypeFilter.has(offer.dealType))
      .filter((offer) => offer.valuePerYear >= minValue)
      .filter((offer) => !query || offer.brand.toLowerCase().includes(query));
    list.sort((a, b) => {
      const totalA = a.valuePerYear * a.contractYears;
      const totalB = b.valuePerYear * b.contractYears;
      switch (sortKey) {
        case 'potential-high':
          return totalB - totalA;
        case 'potential-low':
          return totalA - totalB;
        case 'value-high':
          return b.valuePerYear - a.valuePerYear;
        case 'value-low':
          return a.valuePerYear - b.valuePerYear;
        case 'fit-best':
          return FIT_TINT[b.marketFit].pct - FIT_TINT[a.marketFit].pct;
      }
    });
    return list;
  }, [allOffers, categoryFilter, statusFilter, dealTypeFilter, minValue, search, sortKey]);

  const kpis = useMemo(() => {
    const totalAnnual = filteredOffers.reduce((sum, offer) => sum + offer.valuePerYear, 0);
    const totalValue = filteredOffers.reduce((sum, offer) => sum + offer.valuePerYear * offer.contractYears, 0);
    const avg = filteredOffers.length > 0 ? totalAnnual / filteredOffers.length : 0;
    const avgFitPct = filteredOffers.length > 0
      ? filteredOffers.reduce((sum, offer) => sum + FIT_TINT[offer.marketFit].pct, 0) / filteredOffers.length
      : 0;
    const attractiveness = avgFitPct >= 85 ? 'A+'
      : avgFitPct >= 75 ? 'A'
      : avgFitPct >= 65 ? 'A-'
      : avgFitPct >= 55 ? 'B+'
      : avgFitPct >= 45 ? 'B'
      : avgFitPct >= 35 ? 'C'
      : 'D';
    return { count: filteredOffers.length, totalAnnual, totalValue, avg, attractiveness };
  }, [filteredOffers]);

  if (!open) return null;

  const toggleCategory = (category: DealCategory | 'all') => {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (category === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(category)) next.delete(category);
      else next.add(category);
      if (next.size === 0) next.add('all');
      return next;
    });
  };

  const toggleStatus = (status: OfferStatus | 'all') => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (status === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(status)) next.delete(status);
      else next.add(status);
      if (next.size === 0) next.add('all');
      return next;
    });
  };

  const toggleDealType = (dealType: DealType) => {
    setDealTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(dealType)) next.delete(dealType);
      else next.add(dealType);
      if (next.size === 0) {
        next.add('sponsorship');
        next.add('endorsement');
      }
      return next;
    });
  };

  const clearFilters = () => {
    setCategoryFilter(new Set(['all']));
    setStatusFilter(new Set(['all']));
    setDealTypeFilter(new Set(['sponsorship', 'endorsement']));
    setMinValue(0);
    setSearch('');
  };

  const submitNegotiation = (submission: { slot: SponsorshipSlot; valuePerYear: number; contractYears: number }) => {
    if (!negotiationOffer || userTeamId == null) return;
    const year = state?.leagueStats?.year ?? new Date().getFullYear();
    if (negotiationOffer.oneTime) {
      if (negotiationOffer.dealType === 'endorsement' && ((tycoon?.oneTimePayouts ?? []) as any[]).filter((p) => p.kind === 'endorsement').length >= ENDORSEMENT_SLOT_CAP) return;
      const payout = submission.valuePerYear;
      const brand = negotiationOffer.brand;
      applyTycoonMutation(userTeamId, (t: any) => {
        const ledger: any[] = t.tycoon.oneTimePayouts ?? (t.tycoon.oneTimePayouts = []);
        const alreadySigned = ledger.some((p: any) =>
          p.year === year &&
          p.brand === brand &&
          p.kind === (negotiationOffer.dealType === 'endorsement' ? 'endorsement' : 'sponsorship'),
        );
        if (alreadySigned) return;
        t.tycoon.cashOnHand = (t.tycoon.cashOnHand ?? 0) + payout;
        ledger.push({
          id: `one-time-${year}-${brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
          year,
          brand,
          amount: payout,
          kind: negotiationOffer.dealType === 'endorsement' ? 'endorsement' : 'sponsorship',
          date: new Date().toISOString().slice(0, 10),
          expiresAfterYear: year + 1,
          offerLabel: negotiationOffer.offerLabel,
          slotLabel: negotiationOffer.slotLabel,
          industry: negotiationOffer.industry,
        });
      });
      return;
    }
    const classified = classifySponsor(negotiationOffer.brand);
    const signed: SponsorshipOffer = {
      slot: submission.slot,
      sponsor: negotiationOffer.brand,
      industry: classified.industry,
      archetype: classified.archetype,
      personality: classified.personality,
      personalityProse: classified.personalityProse,
      valuePerYear: submission.valuePerYear,
      signingBonus: Math.round(submission.valuePerYear * 0.6),
      years: submission.contractYears,
    };
    applyTycoonMutation(userTeamId, (t: any) => applyRenewal(t.tycoon, submission.slot, signed, year));
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-[1600px] w-full max-h-[94vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-start justify-between px-7 py-5 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Handshake size={22} className="text-emerald-300" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-wide">OPEN MARKET</h2>
              <p className="text-sm text-slate-400">Review sponsor offers from brands interested in partnering with your club.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={22} className="text-slate-400 hover:text-white" /></button>
        </div>

        <div className="flex items-center gap-3 px-7 py-3 border-b border-slate-800">
          <span className="text-xs font-black uppercase tracking-widest text-emerald-300">Interested Sponsors</span>
          <span className="inline-flex items-center justify-center min-w-[26px] h-[22px] rounded-full px-2 text-[11px] font-black bg-emerald-500/25 text-emerald-300">{availableCount}</span>
          <span className={`ml-auto inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${
            endorsementCapReached ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          }`}>
            Endorsements {Math.min(activeEndorsements.length, ENDORSEMENT_SLOT_CAP)}/{ENDORSEMENT_SLOT_CAP}
          </span>
          <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-emerald-400 hidden" />
        </div>

        <div className="grid grid-cols-5 gap-3 px-7 py-4 border-b border-slate-800 bg-slate-950">
          <KpiCard tint="text-emerald-300" label="Interested Brands" value={String(kpis.count)} />
          <KpiCard tint="text-sky-300" label="Total Potential Value / Year" value={fmt(kpis.totalAnnual)} />
          <KpiCard tint="text-amber-300" label="Total Potential Value" value={fmt(kpis.totalValue)} />
          <KpiCard tint="text-violet-300" label="Avg. Market Value" value={fmt(Math.round(kpis.avg))} />
          <KpiCard tint="text-amber-300" label="Market Attractiveness" value={kpis.attractiveness} />
        </div>

        <div className="flex-1 overflow-hidden grid grid-cols-[280px_1fr]">
          <aside className="overflow-y-auto border-r border-slate-800 p-5 space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Filters</div>
              <button onClick={clearFilters} className="text-[11px] font-bold text-slate-500 hover:text-slate-300 flex items-center gap-1">
                Clear All <RefreshCw size={11} />
              </button>
            </div>

            <FilterSection title="Category">
              <FilterRow label="All Categories" count={categoryCounts.all ?? 0} checked={categoryFilter.has('all')} onToggle={() => toggleCategory('all')} icon={null} />
              {(Object.keys(CATEGORY_LABEL) as DealCategory[]).map((category) => {
                const Icon = CATEGORY_ICON[category];
                return (
                  <FilterRow
                    key={category}
                    label={CATEGORY_LABEL[category]}
                    count={categoryCounts[category] ?? 0}
                    checked={categoryFilter.has(category)}
                    onToggle={() => toggleCategory(category)}
                    icon={<Icon size={14} className={CATEGORY_TINT[category]} />}
                  />
                );
              })}
            </FilterSection>

            <FilterSection title="Offer Status">
              <FilterRow label="All Status" count={statusCounts.all ?? 0} checked={statusFilter.has('all')} onToggle={() => toggleStatus('all')} icon={null} />
              <FilterRow label="Interested" count={statusCounts.interested ?? 0} checked={statusFilter.has('interested')} onToggle={() => toggleStatus('interested')} icon={<span className="w-2 h-2 rounded-full bg-emerald-400" />} />
              <FilterRow label="Negotiation" count={2} checked={statusFilter.has('negotiation')} onToggle={() => toggleStatus('negotiation')} icon={<span className="w-2 h-2 rounded-full bg-violet-400" />} />
              <FilterRow label="Neutral" count={statusCounts.neutral ?? 0} checked={statusFilter.has('neutral')} onToggle={() => toggleStatus('neutral')} icon={<span className="w-2 h-2 rounded-full bg-slate-500" />} />
              <FilterRow label="Not Interested" count={statusCounts['not-interested'] ?? 0} checked={statusFilter.has('not-interested')} onToggle={() => toggleStatus('not-interested')} icon={<span className="w-2 h-2 rounded-full bg-rose-500" />} />
            </FilterSection>

            <FilterSection title="Deal Type">
              <FilterRow label="Sponsorship" count={dealTypeCounts.sponsorship} checked={dealTypeFilter.has('sponsorship')} onToggle={() => toggleDealType('sponsorship')} icon={null} />
              <FilterRow label="Endorsement" count={dealTypeCounts.endorsement} checked={dealTypeFilter.has('endorsement')} onToggle={() => toggleDealType('endorsement')} icon={null} />
            </FilterSection>

            <div>
              <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Minimum Value / Year</div>
              <input
                type="range"
                min={0}
                max={2_000_000}
                step={50_000}
                value={minValue}
                onChange={(e) => setMinValue(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>{fmt(0)}</span>
                <span>{fmt(2_000_000)}+</span>
              </div>
            </div>
          </aside>

          <main className="overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
              <div className="relative flex-1 max-w-[420px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search brands..."
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-400/60"
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-400/60"
                >
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                    <option key={key} value={key}>Sort by: {SORT_LABEL[key]}</option>
                  ))}
                </select>
                <div className="flex border border-slate-800 rounded-lg overflow-hidden">
                  <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-slate-300'}`}><ListIcon size={14} /></button>
                  <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-slate-300'}`}><LayoutGrid size={14} /></button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredOffers.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">No offers match the current filters.</div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-950 z-10">
                    <tr className="border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <th className="text-left px-6 py-3">Brand</th>
                      <th className="text-left px-3 py-3">Category</th>
                      <th className="text-left px-3 py-3">Interest Level</th>
                      <th className="text-left px-3 py-3">Offer Type</th>
                      <th className="text-left px-3 py-3">Value / Year</th>
                      <th className="text-left px-3 py-3">Contract Length</th>
                      <th className="text-left px-3 py-3">Total Value</th>
                      <th className="text-left px-3 py-3">Market Fit</th>
                      <th className="text-left px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOffers.map((offer) => {
                      const CatIcon = CATEGORY_ICON[offer.category];
                      const fitMeta = FIT_TINT[offer.marketFit];
                      const interest = INTEREST_TINT[offer.interestLevel];
                      const isKitFamily = (KIT_FAMILY_SLOTS as string[]).includes(offer.slot);
                      const slotOccupied = offer.dealType !== 'endorsement' && (
                        isKitFamily
                          ? KIT_FAMILY_SLOTS.every((slot) => Boolean(tycoon?.sponsorships?.[slot]))
                          : Boolean(tycoon?.sponsorships?.[offer.slot])
                      );
                      const sponsorBrandAlreadySigned = Object.values(tycoon?.sponsorships ?? {}).some((s: any) => s?.sponsor === offer.brand);
                      const endorsementAlreadySigned = activeEndorsementBrands.has(offer.brand);
                      const industryConflict = conflictIndustries.has(offer.industry);
                      const endorsementBlocked = offer.dealType === 'endorsement' && endorsementCapReached && !endorsementAlreadySigned;
                      const unavailable = offer.interestLevel === 'not-interested' || slotOccupied || industryConflict || sponsorBrandAlreadySigned || endorsementAlreadySigned || endorsementBlocked;
                      const unavailableReason = endorsementAlreadySigned ? 'Endorsement already signed this season'
                        : sponsorBrandAlreadySigned ? 'Brand already partnered with club'
                        : endorsementBlocked ? 'Endorsement cap reached'
                        : slotOccupied ? 'Slot already filled'
                        : industryConflict ? 'Conflicts with current sponsor'
                        : offer.interestLevel === 'not-interested' ? 'Not interested'
                        : '';
                      return (
                        <tr
                          key={offer.id}
                          title={unavailableReason || undefined}
                          className={`border-b border-slate-900 transition ${unavailable ? 'opacity-50' : 'hover:bg-slate-900/30'}`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <SponsorLogo name={offer.brand} meta={getBrandMeta('spain', offer.brand)} industry={offer.industry} size={36} />
                              <span className="font-bold text-white">{offer.brand}</span>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-2">
                              <CatIcon size={14} className={CATEGORY_TINT[offer.category]} />
                              <span className="text-sm text-slate-300">{CATEGORY_LABEL[offer.category]}</span>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${interest.dot}`} />
                              <div>
                                <div className={`text-sm font-bold ${interest.text}`}>{INTEREST_LABEL[offer.interestLevel]}</div>
                                <div className="text-[11px] text-slate-500">{offer.interestSub}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="text-sm text-slate-200">{offer.offerLabel}</div>
                            <div className="text-[11px] text-slate-500">{offer.slotLabel}</div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="text-sm font-bold text-white tabular-nums">{fmt(offer.valuePerYear)}</div>
                            <div className="text-[11px] text-slate-500">per year</div>
                          </td>
                          <td className="px-3 py-4 text-sm text-slate-300 tabular-nums">{offer.oneTime ? 'One-Time' : `${offer.contractYears} Years`}</td>
                          <td className="px-3 py-4 text-sm font-bold text-white tabular-nums">{fmt(offer.oneTime ? offer.valuePerYear : offer.valuePerYear * offer.contractYears)}</td>
                          <td className="px-3 py-4">
                            <div className={`text-xs font-bold ${fitMeta.text}`}>{FIT_LABEL[offer.marketFit]}</div>
                            <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-800 overflow-hidden">
                              <div className={`h-full ${fitMeta.bar}`} style={{ width: `${fitMeta.pct}%` }} />
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <button
                              disabled={unavailable}
                              onClick={() => !unavailable && setSelectedOffer(offer)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                unavailable
                                  ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                                  : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                              }`}
                            >
                              {endorsementAlreadySigned ? 'Signed' : unavailable ? 'Unavailable' : offer.dealType === 'endorsement' ? 'View Details' : 'View Offer'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </main>
        </div>

        <div className="flex items-center gap-4 px-7 py-4 border-t border-slate-800 bg-slate-950">
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Very Interested</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500/80" /> Interested</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-500" /> Neutral</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Not Interested</span>
          </div>
          <div className="flex-1 text-center text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">ⓘ Interest level is based on brand fit, market value, and your club&apos;s current profile.</span>
          </div>
        </div>
      </div>

      <SponsorOfferModal
        open={selectedOffer !== null}
        onClose={() => setSelectedOffer(null)}
        data={selectedOffer ? buildSponsorOfferData(selectedOffer, tycoon, state?.leagueStats?.year ?? new Date().getFullYear()) : null}
        onDismiss={() => setSelectedOffer(null)}
        onStartNegotiation={() => {
          if (!selectedOffer) return;
          setNegotiationOffer(selectedOffer);
          setSelectedOffer(null);
        }}
      />
      <StartNegotiationModal
        open={negotiationOffer !== null}
        onClose={() => setNegotiationOffer(null)}
        data={negotiationOffer ? buildStartNegotiationData(negotiationOffer, state?.leagueStats?.year ?? new Date().getFullYear(), tycoon) : null}
        onSubmit={submitNegotiation}
      />
    </div>
  );
};
