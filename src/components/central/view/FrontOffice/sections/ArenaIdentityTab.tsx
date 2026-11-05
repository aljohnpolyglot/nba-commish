import React from 'react';
import {
  ArrowRight,
  Crown,
  DollarSign,
  Landmark,
  MapPin,
  MonitorUp,
  Newspaper,
  ScanLine,
  Shield,
  Smile,
  Sparkles,
  Star,
  Ticket,
  Users,
  Volume2,
} from 'lucide-react';
import type { ArenaFeatureId, TycoonState } from '../../../../../types/tycoon';
import {
  ARENA_FEATURE_SPECS,
  getOwnedArenaFeatureIds,
  type ArenaFeatureSpec,
} from '../../../../../services/tycoon/facilityUpgradeEngine';
import { getSponsoredArenaFeatures } from '../../../../../services/tycoon/sponsorBenefits';
import { SponsorLogo } from '../../../../tycoon/SponsorLogo';
import { getBrandMeta, type LeagueKey } from '../../../../../data/sponsorCatalogFetcher';

interface ArenaIdentityTabProps {
  arenaName: string;
  capacity: number;
  location: string;
  arenaRating: number;
  revenueEstimate: number;
  homeGames: number;
  teamName: string;
  teamLogoUrl?: string;
  fmt: (value: number) => string;
  stadium: TycoonState['facilities']['stadium'];
  onSelectFeature: (feature: ArenaFeatureSpec) => void;
  onManageTickets: () => void;
  sponsoredFeatures: ReturnType<typeof getSponsoredArenaFeatures>;
  sponsorLeague: LeagueKey;
}

const FEATURE_ICONS: Record<ArenaFeatureId, React.ReactNode> = {
  'led-ribbon': <MonitorUp size={22} />,
  'luxury-suites': <Crown size={22} />,
  jumbotron: <ScanLine size={22} />,
  'premium-courtside': <Users size={22} />,
  'fan-zone': <Smile size={22} />,
  'sound-system': <Volume2 size={22} />,
  'media-center': <Newspaper size={22} />,
  'tunnel-show': <Sparkles size={22} />,
};

const ratingLabel = (rating: number): string => {
  if (rating >= 90) return 'Elite';
  if (rating >= 80) return 'Great';
  if (rating >= 65) return 'Strong';
  return 'Developing';
};

export const ArenaIdentityTab: React.FC<ArenaIdentityTabProps> = ({
  arenaName,
  capacity,
  location,
  arenaRating,
  revenueEstimate,
  homeGames,
  teamName,
  teamLogoUrl,
  fmt,
  stadium,
  onSelectFeature,
  onManageTickets,
  sponsoredFeatures,
  sponsorLeague,
}) => {
  const safeRating = Math.min(99, arenaRating);
  const revenue = homeGames > 0 ? fmt(revenueEstimate) : 'Schedule pending';
  const locationParts = location.split(',').map(part => part.trim()).filter(Boolean);
  const city = locationParts[0] ?? '—';
  const country = locationParts.slice(1).join(', ');
  const facts = [
    ['Capacity', capacity.toLocaleString()],
    ['Home Team', teamName],
    ['Location', location || '—'],
    ['Surface', 'Maple Hardwood'],
    ['Arena Rating', `${safeRating} / 99`],
  ];

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/15">
          <div className="flex min-w-0 items-start gap-4 p-4 sm:items-center sm:gap-6 sm:p-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-slate-600 bg-slate-950/65 sm:h-28 sm:w-28">
              {teamLogoUrl ? (
                <img src={teamLogoUrl} alt="" className="h-16 w-16 object-contain sm:h-24 sm:w-24" />
              ) : (
                <Landmark size={42} className="text-amber-300" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Arena Name</div>
              <h3 className="mt-2 break-words text-2xl font-black leading-tight text-white sm:text-4xl">{arenaName}</h3>
              <p className="mt-2 text-sm text-slate-400 sm:text-base">Home of {teamName}</p>
            </div>
          </div>

          <div className="border-t border-slate-800 px-4 py-1 sm:px-6">
            <div className="grid divide-y divide-slate-800 md:grid-cols-3 md:divide-x md:divide-y-0">
              <IdentityDetail
                icon={<Users size={22} />}
                label="Capacity"
                value={capacity.toLocaleString()}
                sub="Seats"
              />
              <IdentityDetail
                icon={<MapPin size={22} />}
                label="Location"
                value={city}
                sub={country}
              />
              <IdentityDetail
                icon={<Shield size={22} />}
                label="Surface"
                value="Maple Hardwood"
              />
            </div>
          </div>

          <div className="border-t border-slate-800 px-4 py-1 sm:px-6">
            <div className="grid divide-y divide-slate-800 md:grid-cols-3 md:divide-x md:divide-y-0">
              <IdentityDetail
                icon={<Landmark size={22} />}
                label="Home Team"
                value={teamName}
              />
              <IdentityDetail
                icon={<DollarSign size={22} />}
                label="Est. Revenue"
                value={revenue}
                sub={homeGames > 0 ? 'Projected annual' : 'Awaiting schedule'}
              />
              <div className="min-w-0 px-1 py-5 md:px-7">
                <div className="flex items-center gap-3 text-slate-400">
                  <Star size={22} />
                  <span className="text-sm">Arena Rating</span>
                </div>
                <div className="mt-2 text-xl font-black text-white">{safeRating} <span className="text-slate-500">/ 99</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${safeRating}%` }} />
                </div>
                <div className="mt-1 text-xs font-bold text-amber-300">{ratingLabel(safeRating)}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
          <div className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Arena Features</div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {ARENA_FEATURE_SPECS.map(feature => {
              const owned = getOwnedArenaFeatureIds(stadium).includes(feature.id);
              const sponsored = sponsoredFeatures.find(item => item.featureId === feature.id);
              return (
                <button
                  type="button"
                  key={feature.id}
                  onClick={() => onSelectFeature(feature)}
                  className={`rounded-xl border p-4 text-left transition ${
                    owned
                      ? 'border-emerald-400/35 bg-emerald-400/[0.06] hover:border-emerald-300/60'
                      : sponsored
                        ? 'border-violet-400/35 bg-violet-400/[0.06] hover:border-violet-300/60'
                        : 'border-slate-700 bg-slate-950/55 hover:border-amber-400/55'
                  }`}
                >
                  <div className={owned ? 'text-emerald-300' : sponsored ? 'text-violet-300' : 'text-slate-400'}>
                    {FEATURE_ICONS[feature.id]}
                  </div>
                  <div className="mt-3 min-h-10 text-sm font-black leading-5 text-white">{feature.label}</div>
                  <span className={`mt-3 inline-flex text-[9px] font-black uppercase tracking-widest ${
                    owned ? 'text-emerald-300' : sponsored ? 'text-violet-300' : 'text-amber-300'
                  }`}>
                    {owned ? 'Owned' : sponsored ? 'Sponsored' : 'Available'}
                  </span>
                  {sponsored && (
                    <div className="mt-3 flex items-center gap-2">
                      <SponsorLogo
                        name={sponsored.sponsor}
                        meta={getBrandMeta(sponsorLeague, sponsored.sponsor)}
                        industry="tech"
                        size={24}
                      />
                      <span className="min-w-0 truncate text-[9px] font-bold text-violet-200">{sponsored.sponsor}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Quick Actions</div>
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/55 p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-amber-400/35 bg-amber-400/10 text-amber-300">
                <Ticket size={25} />
              </div>
              <div>
                <div className="font-black text-white">Ticket Pricing</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">Set pricing tiers and manage matchday revenue.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onManageTickets}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300"
            >
              Manage Ticket Prices <ArrowRight size={16} />
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">At a Glance</div>
          <div className="mt-4 divide-y divide-slate-800">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 py-3">
                <span className="text-sm text-slate-400">{label}</span>
                <span className="max-w-[210px] break-words text-right text-sm font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
};

const IdentityDetail: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}> = ({ icon, label, value, sub }) => (
  <div className="min-w-0 px-1 py-5 md:px-7">
    <div className="flex items-center gap-3 text-slate-400">
      {icon}
      <span className="text-sm">{label}</span>
    </div>
    <div className="mt-2 break-words text-lg font-black text-white">{value}</div>
    {sub && <div className="mt-1 text-sm text-slate-400">{sub}</div>}
  </div>
);
