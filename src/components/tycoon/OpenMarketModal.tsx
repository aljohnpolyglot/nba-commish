import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  CircleDollarSign,
  Gift,
  Search,
  Trophy,
} from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getBrandMeta, resolveSponsorLeagueKey } from '../../data/sponsorCatalogFetcher';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { getSimulationSeed } from '../../services/saveIdentity';
import { getIndustryLabel } from '../../utils/sponsorLogos';
import { getSeasonEconomyIndex, postClubTransaction } from '../../services/tycoon/clubFinance';
import { applyRenewal, classifySponsor, type SponsorshipOffer } from '../../services/tycoon/sponsorshipEngine';
import { buildSponsorPerformanceBonuses } from '../../services/tycoon/sponsorOfferConstants';
import { SPONSOR_OFFER_POOL_RULES } from '../../services/tycoon/sponsorPerkLibrary';
import { applySponsorPerkOnDealSigned } from '../../services/tycoon/sponsorPerkEngine';
import type { OneTimePayout, SponsorPerformanceBonus, SponsorshipSlot, TycoonTier } from '../../types/tycoon';
import { SponsorLogo } from './SponsorLogo';
import { generateMockOffers, type MockOffer } from './openMarketModalShared';
import { ENDORSEMENT_SLOT_CAP, SPONSOR_SLOT_CONFIG } from './sponsorshipRevampConfig';
import {
  BonusPanel,
  ContractFact,
  ModalFooter,
  ModalHeader,
  SponsorIdentity,
  SummaryValue,
} from './SponsorshipMarketUi';

export type SponsorMarketDealType = 'core' | 'endorsement';

interface Props {
  open: boolean;
  onClose: () => void;
  initialSlot?: SponsorshipSlot | null;
  dealType?: SponsorMarketDealType;
}

type FlowStep = 'offers' | 'terms' | 'success';
type SortKey = 'payment' | 'perk' | 'name';

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}

function weightedOfferDraw(offers: MockOffer[], count: number, seed: number): MockOffer[] {
  const rand = seededRandom(seed);
  const ranked = offers
    .filter(offer => (offer.poolWeight ?? 1) > 0)
    .map(offer => ({
      offer,
      key: Math.pow(Math.max(Number.EPSILON, rand()), 1 / Math.max(0.01, offer.poolWeight ?? 1)),
    }))
    .sort((left, right) => right.key - left.key);
  const selected: MockOffer[] = [];
  let aspirationalCount = 0;
  for (const item of ranked) {
    if (item.offer.aspirational) {
      if (aspirationalCount >= SPONSOR_OFFER_POOL_RULES.maxAspirationalOffers) continue;
      aspirationalCount += 1;
    }
    selected.push(item.offer);
    if (selected.length >= count) break;
  }
  return selected;
}

function sumBonuses(bonuses: SponsorPerformanceBonus[]): number {
  return bonuses.reduce((sum, bonus) => sum + bonus.amountEUR, 0);
}

function perkScore(offer: MockOffer): number {
  return offer.perk?.value ?? offer.benefitPackage?.inKindValueEUR ?? 0;
}

export const OpenMarketModal: React.FC<Props> = ({
  open,
  onClose,
  initialSlot = null,
  dealType = 'core',
}) => {
  const { state, applyTycoonMutation } = useGame() as any;
  const userTeamId = state?.userTeamId;
  const team = state?.teams?.find((candidate: any) => (candidate.id ?? candidate.tid) === userTeamId)
    ?? state?.nonNBATeams?.find((candidate: any) => (candidate.id ?? candidate.tid) === userTeamId);
  const tycoon = team?.tycoon;
  const tier: TycoonTier = tycoon?.tier ?? 'A';
  const currency = state?.leagueStats?.currency ?? 'EUR';
  const currentYear = Number(state?.leagueStats?.year ?? new Date().getFullYear());
  const sponsorLeague = resolveSponsorLeagueKey(
    team?.country,
    team?.league,
    team?.region,
    state?.euroPrimaryCompetitionId,
  );
  const economyIndex = getSeasonEconomyIndex(state, currentYear);
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);

  const [step, setStep] = useState<FlowStep>('offers');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('payment');
  const [selectedOffer, setSelectedOffer] = useState<MockOffer | null>(null);
  const [contractYears, setContractYears] = useState(3);

  useEffect(() => {
    if (!open) return;
    setStep('offers');
    setSearch('');
    setSortKey('payment');
    setSelectedOffer(null);
    setContractYears(dealType === 'endorsement' ? 1 : 3);
  }, [dealType, initialSlot, open]);

  const activeBrands = useMemo(() => new Set<string>([
    ...Object.values(tycoon?.sponsorships ?? {})
      .map((deal: any) => deal?.sponsor)
      .filter(Boolean),
    ...((tycoon?.oneTimePayouts ?? []) as OneTimePayout[])
      .filter(payout => (
        payout.kind === 'endorsement'
        && payout.year <= currentYear
        && (payout.expiresAfterYear ?? payout.year + 1) > currentYear
      ))
      .map(payout => payout.brand),
  ]), [currentYear, tycoon]);

  const endorsementCount = ((tycoon?.oneTimePayouts ?? []) as OneTimePayout[])
    .filter(payout => (
      payout.kind === 'endorsement'
      && payout.year <= currentYear
      && (payout.expiresAfterYear ?? payout.year + 1) > currentYear
    )).length;

  const storefrontOffers = useMemo(() => {
    if (!open || !tycoon) return [];
    const marketSeed = stableSeed([
      state ? getSimulationSeed(state) : 'unsaved-universe',
      currentYear,
      userTeamId ?? 'club',
      sponsorLeague,
      tier,
      dealType,
      initialSlot ?? 'endorsement',
    ].join(':'));
    const generated = generateMockOffers(
      tier,
      sponsorLeague,
      marketSeed,
      tycoon.commercialTrust ?? 100,
      economyIndex,
    );
    const seen = new Set<string>();
    const eligible = generated
      .filter(offer => dealType === 'endorsement'
        ? offer.dealType === 'endorsement'
        : offer.dealType === 'sponsorship' && offer.slot === initialSlot)
      .filter(offer => !activeBrands.has(offer.brand))
      .filter(offer => {
        if (seen.has(offer.brand)) return false;
        seen.add(offer.brand);
        return true;
      });
    return weightedOfferDraw(
      eligible,
      SPONSOR_OFFER_POOL_RULES.visibleOffersPerRefresh,
      marketSeed ^ 0x9e3779b9,
    );
  }, [
    activeBrands,
    currentYear,
    dealType,
    economyIndex,
    initialSlot,
    open,
    sponsorLeague,
    state?.simulationSeed,
    state?.saveId,
    tier,
    tycoon,
    userTeamId,
  ]);

  const visibleOffers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const offers = storefrontOffers.filter(offer => (
      !query
      || offer.brand.toLowerCase().includes(query)
      || getIndustryLabel(offer.industry).toLowerCase().includes(query)
    ));
    return [...offers].sort((left, right) => {
      if (sortKey === 'name') return left.brand.localeCompare(right.brand);
      if (sortKey === 'perk') return perkScore(right) - perkScore(left) || right.valuePerYear - left.valuePerYear;
      return right.valuePerYear - left.valuePerYear;
    });
  }, [search, sortKey, storefrontOffers]);

  if (!open || !tycoon) return null;

  const slotConfig = initialSlot ? SPONSOR_SLOT_CONFIG[initialSlot] : null;
  const title = dealType === 'endorsement' ? 'One-Year Endorsement' : slotConfig?.label ?? 'Core Partnership';
  const performanceBonuses = selectedOffer
    ? buildSponsorPerformanceBonuses(selectedOffer.valuePerYear, selectedOffer.archetype, selectedOffer.bonusProfileId)
    : [];
  const potentialBonusEUR = sumBonuses(performanceBonuses);
  const totalContractValue = selectedOffer ? selectedOffer.valuePerYear * contractYears : 0;

  const chooseOffer = (offer: MockOffer) => {
    setSelectedOffer(offer);
    const minimum = Math.max(1, offer.minContractYears ?? 1);
    const maximum = Math.min(5, offer.maxContractYears ?? 5);
    setContractYears(dealType === 'endorsement'
      ? 1
      : Math.max(minimum, Math.min(maximum, offer.contractYears)));
    setStep('terms');
  };

  const signDeal = () => {
    if (!selectedOffer || userTeamId == null) return;
    const frozenBonuses = buildSponsorPerformanceBonuses(
      selectedOffer.valuePerYear,
      selectedOffer.archetype,
      selectedOffer.bonusProfileId,
    );
    if (dealType === 'core') {
      if (!initialSlot) return;
      const classified = classifySponsor(selectedOffer.brand);
      const offer: SponsorshipOffer = {
        slot: initialSlot,
        sponsor: selectedOffer.brand,
        industry: selectedOffer.industry === 'generic' ? undefined : selectedOffer.industry,
        archetype: selectedOffer.archetype,
        personality: classified.personality,
        personalityProse: classified.personalityProse,
        valuePerYear: selectedOffer.valuePerYear,
        signingBonus: 0,
        years: contractYears,
        performanceBonuses: frozenBonuses,
        perk: selectedOffer.perk,
        benefitPackage: selectedOffer.benefitPackage,
        headquartersCity: selectedOffer.headquartersCity,
        headquartersCountry: selectedOffer.headquartersCountry,
        headquartersIso2: selectedOffer.headquartersIso2,
      };
      applyTycoonMutation(userTeamId, (club: any) => {
        if (!club.tycoon) return;
        applyRenewal(club.tycoon, initialSlot, offer, currentYear);
        applySponsorPerkOnDealSigned(club.tycoon, selectedOffer.brand, selectedOffer.perk, currentYear);
      });
    } else {
      if (endorsementCount >= ENDORSEMENT_SLOT_CAP) return;
      const sourceId = `one-time-sponsor:${currentYear}:${selectedOffer.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      applyTycoonMutation(userTeamId, (club: any) => {
        if (!club.tycoon) return;
        const payouts: OneTimePayout[] = club.tycoon.oneTimePayouts ?? (club.tycoon.oneTimePayouts = []);
        if (payouts.some(payout => payout.id === sourceId || payout.brand === selectedOffer.brand)) return;
        postClubTransaction(club.tycoon, {
          sourceId,
          date: String(state?.date ?? `${currentYear}-07-01`),
          season: currentYear,
          category: 'sponsorship',
          label: `${selectedOffer.brand} one-year endorsement`,
          amountEUR: selectedOffer.valuePerYear,
        });
        payouts.push({
          id: sourceId,
          year: currentYear,
          brand: selectedOffer.brand,
          amount: selectedOffer.valuePerYear,
          kind: 'endorsement',
          date: String(state?.date ?? `${currentYear}-07-01`),
          expiresAfterYear: currentYear + 1,
          offerLabel: 'One-Year Endorsement',
          slotLabel: 'One-Year Endorsement',
          industry: selectedOffer.industry,
          archetype: selectedOffer.archetype,
          benefitPackage: selectedOffer.benefitPackage,
          performanceBonuses: frozenBonuses,
          perk: selectedOffer.perk,
        });
        applySponsorPerkOnDealSigned(club.tycoon, selectedOffer.brand, selectedOffer.perk, currentYear);
      });
    }
    setStep('success');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-0 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl">
        {step === 'offers' && (
          <>
            <ModalHeader title="Sponsor Offers" onClose={onClose}>
              <p className="mt-1 text-sm text-slate-400">
                Choose a sponsor for {dealType === 'endorsement' ? 'a one-season partnership' : title}.
              </p>
              <p className="mt-1 text-xs text-slate-500">Payments are fixed. Compare base value, potential bonuses, and perk.</p>
            </ModalHeader>

            <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative block w-full sm:max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search sponsors..."
                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-white outline-none focus:border-amber-400"
                />
              </label>
              <label className="flex items-center gap-3 text-xs text-slate-500">
                Sort by
                <select
                  value={sortKey}
                  onChange={event => setSortKey(event.target.value as SortKey)}
                  className="h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-white outline-none focus:border-amber-400"
                >
                  <option value="payment">Highest payment</option>
                  <option value="perk">Best perk</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {visibleOffers.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {visibleOffers.map(offer => {
                    const bonuses = buildSponsorPerformanceBonuses(offer.valuePerYear, offer.archetype, offer.bonusProfileId);
                    return (
                      <div key={offer.id} className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                        <div className="flex items-start gap-3">
                          <SponsorLogo
                            name={offer.brand}
                            meta={getBrandMeta(sponsorLeague, offer.brand)}
                            industry={offer.industry}
                            size={48}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-base font-black text-white">{offer.brand}</div>
                            <div className="text-xs text-slate-500">{getIndustryLabel(offer.industry)}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-black tabular-nums text-emerald-300">{fmt(offer.valuePerYear)}</div>
                            <div className="text-[11px] text-slate-500">per year</div>
                          </div>
                        </div>
                        <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                          <div className="flex items-start gap-2 text-xs text-slate-300">
                            <Trophy size={14} className="mt-0.5 shrink-0 text-amber-300" />
                            <span>Potential bonuses: up to <strong className="text-white">{fmt(sumBonuses(bonuses))}</strong> per season</span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-slate-300">
                            <Gift size={14} className="mt-0.5 shrink-0 text-amber-300" />
                            <span><strong className="text-white">Perk:</strong> {offer.perk?.label ?? offer.benefitPackage?.label ?? 'Partner support'}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => chooseOffer(offer)}
                          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-amber-400/70 text-xs font-black uppercase tracking-widest text-amber-300 hover:bg-amber-400 hover:text-slate-950"
                        >
                          Select <ChevronRight size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-800 px-4 text-center text-sm text-slate-500">
                  No eligible sponsors are available for this slot.
                </div>
              )}
            </div>
          </>
        )}

        {step === 'terms' && selectedOffer && (
          <>
            <ModalHeader title="Contract Terms" onClose={onClose} />
            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-7">
              <SponsorIdentity offer={selectedOffer} sponsorLeague={sponsorLeague} subtitle={title} />

              <div className="grid gap-4 rounded-xl border border-slate-700 bg-slate-900/55 p-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-bold text-slate-400">Annual Payment</div>
                  <div className="mt-2 text-3xl font-black tabular-nums text-emerald-300">{fmt(selectedOffer.valuePerYear)} <span className="text-sm text-slate-400">/ year</span></div>
                </div>
                <div className="border-t border-slate-700 pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <div className="flex items-center gap-2 text-sm font-black text-white"><Gift size={17} className="text-amber-300" /> {selectedOffer.perk?.label ?? selectedOffer.benefitPackage?.label ?? 'Partner support'}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">{selectedOffer.perk?.description ?? selectedOffer.benefitPackage?.label ?? 'Partner support for the club.'}</div>
                </div>
              </div>

              <BonusPanel bonuses={performanceBonuses} fmt={fmt} />

              <div>
                <div className="mb-3 text-sm font-black text-white">Contract Length</div>
                {dealType === 'core' ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[1, 2, 3, 4, 5]
                      .filter(years => (
                        years >= (selectedOffer.minContractYears ?? 1)
                        && years <= (selectedOffer.maxContractYears ?? 5)
                      ))
                      .map(years => (
                      <button
                        key={years}
                        type="button"
                        onClick={() => setContractYears(years)}
                        className={`h-14 rounded-xl border text-sm font-black ${contractYears === years ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-slate-700 bg-slate-900 text-white hover:border-slate-500'}`}
                      >
                        {years} {years === 1 ? 'Year' : 'Years'}
                      </button>
                      ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm font-black text-white">1 year · fixed endorsement term</div>
                )}
              </div>

              <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/55 p-4 text-center sm:grid-cols-3">
                <SummaryValue label="Total Base Value" value={fmt(totalContractValue)} tint="text-emerald-300" />
                <SummaryValue label="Start" value={String(currentYear)} />
                <SummaryValue label="End" value={String(currentYear + contractYears)} />
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs leading-5 text-slate-400">
                <CircleDollarSign size={15} className="mt-0.5 shrink-0" />
                Payments are fixed. Only contract length can be adjusted for a Core Partnership.
              </div>
            </div>
            <ModalFooter
              backLabel="Back"
              onBack={() => setStep('offers')}
              actionLabel="Sign Deal"
              onAction={signDeal}
            />
          </>
        )}

        {step === 'success' && selectedOffer && (
          <div className="flex min-h-[480px] flex-col items-center justify-center p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
              <Check size={30} className="text-emerald-300" />
            </div>
            <div className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-emerald-300">Partnership Confirmed</div>
            <h2 className="mt-3 text-3xl font-black text-white">{selectedOffer.brand}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
              {dealType === 'core'
                ? `${selectedOffer.brand} is now your ${title} through ${currentYear + contractYears}.`
                : `${selectedOffer.brand} has signed a one-year endorsement.`}
            </p>
            <div className="mt-6 w-full max-w-sm space-y-2 rounded-xl border border-slate-800 bg-slate-900/55 p-4 text-left">
              <ContractFact label="Base payment" value={fmt(selectedOffer.valuePerYear)} />
              <ContractFact label="Potential bonuses" value={`${fmt(potentialBonusEUR)} / season`} />
              <ContractFact label="Active perk" value={selectedOffer.perk?.label ?? selectedOffer.benefitPackage?.label ?? 'Partner support'} />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 h-12 min-w-44 rounded-xl bg-amber-400 px-6 text-sm font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
