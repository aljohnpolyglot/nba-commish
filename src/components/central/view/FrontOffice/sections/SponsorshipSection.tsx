import React from 'react';
import {
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Gift,
  Plus,
  Users,
} from 'lucide-react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { ALL_SLOTS, type OneTimePayout, type SponsorshipSlot, type TycoonState } from '../../../../../types/tycoon';
import { SponsorLogo } from '../../../../tycoon/SponsorLogo';
import { getBrandMeta, type LeagueKey } from '../../../../../data/sponsorCatalogFetcher';
import {
  getSponsorContractEndYear,
  isSponsorExpiringNextRollover,
} from '../../../../../services/tycoon/sponsorshipEngine';
import {
  ENDORSEMENT_SLOT_CAP,
  getCoreSponsorPerk,
  getEndorsementPerk,
  SPONSOR_SLOT_CONFIG,
} from '../../../../tycoon/sponsorshipRevampConfig';

type CoreAction = 'details' | 'find-new';

export const SponsorshipSection: React.FC<{
  tycoon: TycoonState;
  currency: string;
  sponsorLeague: LeagueKey;
  currentYear: number;
  onCoreAction: (slot: SponsorshipSlot, action: CoreAction) => void;
  onOpenEndorsement: () => void;
  onEndorsementDetails: (endorsement: OneTimePayout) => void;
}> = ({
  tycoon,
  currency,
  sponsorLeague,
  currentYear,
  onCoreAction,
  onOpenEndorsement,
  onEndorsementDetails,
}) => {
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const sponsorships = tycoon.sponsorships ?? {};
  const coreDeals = ALL_SLOTS.map(slot => ({ slot, deal: sponsorships[slot] }));
  const activeCoreDeals = coreDeals.filter(item => item.deal);
  const endorsements = ((tycoon.oneTimePayouts ?? []) as OneTimePayout[])
    .filter(payout => (
      payout.kind === 'endorsement'
      && payout.year <= currentYear
      && (payout.expiresAfterYear ?? payout.year + 1) > currentYear
    ))
    .filter((payout, index, rows) => {
      const key = payout.id ?? `${payout.year}-${payout.brand}-${payout.amount}`;
      return rows.findIndex(other => (other.id ?? `${other.year}-${other.brand}-${other.amount}`) === key) === index;
    })
    .slice(0, ENDORSEMENT_SLOT_CAP);
  const annualRevenue = activeCoreDeals.reduce((sum, item) => sum + (item.deal?.valuePerYear ?? 0), 0)
    + endorsements.reduce((sum, deal) => sum + deal.amount, 0);
  const expiringSoon = activeCoreDeals.filter(item => (
    isSponsorExpiringNextRollover(item.deal, currentYear)
  )).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(620px,1.35fr)] xl:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Sponsorships</h1>
          <p className="mt-2 text-sm text-slate-400">Manage core partnerships and one-year endorsements.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={<CircleDollarSign size={20} />}
            label="Annual Revenue"
            value={fmt(annualRevenue)}
            valueClass="text-emerald-300"
          />
          <StatCard
            icon={<Users size={20} />}
            label="Filled Slots"
            value={`${activeCoreDeals.length} / ${ALL_SLOTS.length}`}
          />
          <StatCard
            icon={<CalendarClock size={20} />}
            label="Expiring Soon"
            value={String(expiringSoon)}
            valueClass="text-amber-300"
          />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-white">Core Partnerships</h2>
          <span className="hidden text-xs text-slate-500 sm:block">Click a row for details</span>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {coreDeals.map(({ slot, deal }) => {
            const slotConfig = SPONSOR_SLOT_CONFIG[slot];
            if (!deal) {
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onCoreAction(slot, 'find-new')}
                  className="flex min-h-24 items-center gap-3 rounded-xl border border-dashed border-amber-400/35 bg-amber-400/[0.03] p-3 text-left transition hover:border-amber-300 hover:bg-amber-400/[0.07]"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-amber-400/60 text-amber-300">
                    <Plus size={23} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-400">{slotConfig.label}</div>
                    <div className="mt-1 font-black text-white">Open slot</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {slotConfig.description} · Payment multiplier ×{slotConfig.multiplier.toFixed(2)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-amber-300">Find sponsor</span>
                </button>
              );
            }

            const endYear = getSponsorContractEndYear(deal, currentYear) ?? currentYear + deal.yearsRemaining;
            const perk = getCoreSponsorPerk(deal, slot);
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onCoreAction(slot, 'details')}
                className="grid min-h-24 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-left transition hover:border-slate-600"
              >
                <SponsorLogo
                  name={deal.sponsor}
                  meta={getBrandMeta(sponsorLeague, deal.sponsor)}
                  industry={deal.industry ?? 'generic'}
                  size={56}
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-400">{slotConfig.label}</div>
                  <div className="mt-1 truncate text-base font-black text-white">{deal.sponsor}</div>
                  <div className="mt-2 flex items-start gap-2 text-xs text-slate-400 lg:hidden">
                    <Gift size={13} className="mt-0.5 shrink-0 text-amber-300" />
                    <span className="truncate">{perk.label}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <div className="px-2 text-right sm:px-4">
                    <div className="font-black tabular-nums text-emerald-300">
                      {fmt(deal.valuePerYear)} <span className="font-medium text-slate-400">/ year</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Through {endYear}</div>
                  </div>
                  <div className="hidden max-w-48 items-center gap-2 border-l border-slate-700 px-4 text-xs text-slate-300 lg:flex">
                    <Gift size={15} className="shrink-0 text-amber-300" />
                    <span className="line-clamp-2">{perk.label}</span>
                  </div>
                  <ChevronRight size={18} className="ml-1 text-slate-500" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-white">One-Year Endorsements</h2>
          <span className="text-xs font-black text-slate-500">{endorsements.length} / {ENDORSEMENT_SLOT_CAP}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: ENDORSEMENT_SLOT_CAP }, (_, index) => {
            const deal = endorsements[index];
            if (!deal) {
              return (
                <button
                  key={`open-${index}`}
                  type="button"
                  onClick={onOpenEndorsement}
                  className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-950/35 p-4 text-center transition hover:border-amber-400/60 hover:bg-amber-400/[0.04]"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-amber-400 text-amber-300">
                    <Plus size={27} />
                  </div>
                  <div className="mt-4 font-black text-white">Open endorsement slot</div>
                  <div className="mt-2 text-sm leading-6 text-slate-500">Same sponsor storefront.<br />Fixed at 1 year.</div>
                  <span className="mt-5 rounded-lg border border-amber-400/70 px-5 py-2 text-xs font-black uppercase tracking-widest text-amber-300">
                    Open sponsor
                  </span>
                </button>
              );
            }

            const perk = getEndorsementPerk(deal);
            return (
              <button
                type="button"
                key={deal.id ?? `${deal.brand}-${index}`}
                onClick={() => onEndorsementDetails(deal)}
                className="flex min-h-60 flex-col rounded-xl border border-slate-700 bg-slate-950/45 p-4 text-left transition hover:border-slate-500"
              >
                <SponsorLogo
                  name={deal.brand}
                  meta={getBrandMeta(sponsorLeague, deal.brand)}
                  industry={deal.industry ?? 'generic'}
                  size={52}
                />
                <div className="mt-4 text-xs font-bold text-slate-400">One-Year Endorsement</div>
                <div className="mt-1 truncate text-lg font-black text-white">{deal.brand}</div>
                <div className="mt-3 font-black tabular-nums text-emerald-300">{fmt(deal.amount)}</div>
                <div className="mt-1 text-xs text-slate-500">Ends this season</div>
                <div className="mt-auto flex items-start gap-2 border-t border-slate-800 pt-4 text-xs text-slate-300">
                  <Gift size={14} className="mt-0.5 shrink-0 text-amber-300" />
                  <span>{perk.label}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-4 text-xs text-slate-500">Click any open slot to browse eligible sponsor offers.</div>
      </section>
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}> = ({ icon, label, value, valueClass = 'text-white' }) => (
  <div className="flex min-h-24 items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
    <div className="text-amber-300">{icon}</div>
    <div>
      <div className="text-xs font-bold text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-black tabular-nums ${valueClass}`}>{value}</div>
    </div>
  </div>
);
