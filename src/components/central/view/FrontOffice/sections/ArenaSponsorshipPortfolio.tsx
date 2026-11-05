import React from 'react';
import { BadgeEuro, CircleDot, Eye, Landmark, MonitorUp, Tag } from 'lucide-react';
import type { ArenaFeatureId, Sponsorship, SponsorshipSlot } from '../../../../../types/tycoon';
import { getBrandMeta, type LeagueKey } from '../../../../../data/sponsorCatalogFetcher';
import { SponsorLogo } from '../../../../tycoon/SponsorLogo';

interface ArenaSponsorshipPortfolioProps {
  arenaSponsors: Array<{ slot: SponsorshipSlot; deal: Sponsorship }>;
  arenaName: string;
  fmt: (value: number) => string;
  sponsorLeague: LeagueKey;
  sponsoredFeatureIds: ArenaFeatureId[];
}

const PLACEMENT: Partial<Record<SponsorshipSlot, { label: string; tone: string }>> = {
  stadium: { label: 'Naming Rights', tone: 'border-amber-400/35 bg-amber-400/10 text-amber-300' },
  court: { label: 'Court Logo', tone: 'border-sky-400/35 bg-sky-400/10 text-sky-300' },
};

export const ArenaSponsorshipPortfolio: React.FC<ArenaSponsorshipPortfolioProps> = ({
  arenaSponsors,
  arenaName,
  fmt,
  sponsorLeague,
  sponsoredFeatureIds,
}) => {
  const namingRights = arenaSponsors.find(item => item.slot === 'stadium')?.deal;
  const courtPartner = arenaSponsors.find(item => item.slot === 'court')?.deal;
  const totalValue = arenaSponsors.reduce((sum, item) => sum + Math.max(0, item.deal.valuePerYear), 0);
  const hasLedRibbon = sponsoredFeatureIds.includes('led-ribbon');
  const visibility = [
    {
      label: 'Naming Rights',
      description: 'Arena name across broadcasts, signage, and entrances.',
      icon: <Landmark size={22} />,
      sponsor: namingRights?.sponsor,
      tone: 'text-amber-300 border-amber-400/25 bg-amber-400/5',
    },
    {
      label: 'Court Logo',
      description: 'Center-court and baseline branding visible throughout games.',
      icon: <CircleDot size={22} />,
      sponsor: courtPartner?.sponsor,
      tone: 'text-sky-300 border-sky-400/25 bg-sky-400/5',
    },
    {
      label: 'LED Ribbon',
      description: 'Dynamic in-arena advertising around the seating bowl.',
      icon: <MonitorUp size={22} />,
      sponsor: hasLedRibbon ? arenaSponsors.find(item => item.deal.benefitPackage?.arenaFeatureId === 'led-ribbon')?.deal.sponsor : undefined,
      tone: 'text-violet-300 border-violet-400/25 bg-violet-400/5',
    },
    {
      label: 'Concourse Banners',
      description: 'Fan-facing branding in gates, walkways, and high-traffic areas.',
      icon: <Eye size={22} />,
      tone: 'text-teal-300 border-teal-400/25 bg-teal-400/5',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <PortfolioMetric
          icon={<Tag size={24} />}
          label="Active Deals"
          value={String(arenaSponsors.length)}
          sub="Arena partnerships"
        />
        <PortfolioMetric
          icon={<BadgeEuro size={24} />}
          label="Portfolio Value"
          value={fmt(totalValue)}
          sub="Annual revenue"
        />
        <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
          {namingRights ? (
            <SponsorLogo
              name={namingRights.sponsor}
              meta={getBrandMeta(sponsorLeague, namingRights.sponsor)}
              industry={namingRights.industry}
              size={56}
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-600">
              <Landmark size={24} />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Naming Rights</div>
            <div className="mt-1 truncate text-lg font-black text-white">{namingRights?.sponsor ?? 'Open'}</div>
            <div className="mt-1 truncate text-xs text-slate-400">{namingRights ? arenaName : 'No title partner'}</div>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/65">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-300">
            <Tag size={16} className="text-amber-300" /> Arena Sponsorship Slots
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Annual value · term</span>
        </div>
        {arenaSponsors.length > 0 ? (
          <div className="divide-y divide-slate-800">
            {arenaSponsors.map(({ slot, deal }) => {
              const placement = PLACEMENT[slot] ?? { label: slot, tone: 'border-slate-600 bg-slate-800 text-slate-300' };
              return (
                <div key={slot} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <SponsorLogo
                      name={deal.sponsor}
                      meta={getBrandMeta(sponsorLeague, deal.sponsor)}
                      industry={deal.industry}
                      size={52}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-base font-black text-white">{deal.sponsor}</div>
                      <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${placement.tone}`}>
                        {placement.label}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:min-w-56">
                    <div className="rounded-xl bg-slate-950/70 px-3 py-2 sm:text-right">
                      <div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Annual value</div>
                      <div className="mt-1 text-sm font-black text-emerald-300">{fmt(deal.valuePerYear)}</div>
                    </div>
                    <div className="rounded-xl border border-sky-400/15 bg-sky-400/5 px-3 py-2 text-right">
                      <div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Remaining</div>
                      <div className="mt-1 text-sm font-black text-sky-200">{deal.yearsRemaining} yr</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <Tag size={30} className="mx-auto text-slate-700" />
            <div className="mt-3 text-sm font-bold text-slate-400">No active arena partnerships</div>
            <p className="mt-1 text-xs text-slate-600">Naming rights and court branding can be negotiated from Sponsorships.</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-300">
          <Eye size={16} className="text-amber-300" /> Sponsor Visibility
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibility.map(item => (
            <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <div className="font-black text-white">{item.label}</div>
                  <div className="truncate text-[10px] font-bold uppercase tracking-wider opacity-80">{item.sponsor ?? 'Available placement'}</div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const PortfolioMetric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}> = ({ icon, label, value, sub }) => (
  <div className="flex items-center gap-4 rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-amber-400/35 bg-amber-400/10 text-amber-300">
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-2xl font-black text-amber-300">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{sub}</div>
    </div>
  </div>
);
