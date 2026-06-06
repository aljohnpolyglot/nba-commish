import React, { useState, useMemo } from 'react';
import {
  Building2, Calendar, DollarSign, Eye, Landmark, MapPin,
  Maximize2, Star, Tag, Ticket, TrendingUp, Trophy, Users,
} from 'lucide-react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import type { TycoonState, SponsorshipSlot } from '../../../../../types/tycoon';
import { TEAM_ARENAS } from '../../../../../data/arenas';
import { getArenaForTeam, type ArenaInfo } from '../../../../../utils/arenaData';
import { ARENA_TABS, type ArenaTab, NBA_ARENA_CAPACITIES } from './arenaSectionConfig';
import { getTycoonFacilityLevel, getTycoonStadiumCapacity } from '../../../../../services/tycoon/tierBase';
interface ArenaSectionProps {
  tycoon: TycoonState;
  teamName: string;
  teamAbbrev?: string;
  teamLogoUrl?: string;
  currency: string;
  onTicketMultChange: (mult: number) => void;
  locked?: boolean;
}
export const ArenaSection: React.FC<ArenaSectionProps> = ({
  tycoon, teamName, teamAbbrev, teamLogoUrl, currency, onTicketMultChange, locked = false,
}) => {
  const [tab, setTab] = useState<ArenaTab>('identity');
  const ticketMult = tycoon.ticketPriceMultiplier ?? 1.0;
  const arenaName = TEAM_ARENAS[teamName] ?? `${teamName} Arena`;
  const arenaInfo = getArenaForTeam(teamName);
  const stadiumLevel = getTycoonFacilityLevel(tycoon.facilities?.stadium);
  const capacity = arenaInfo?.seating_capacity
    ?? NBA_ARENA_CAPACITIES[arenaName]
    ?? getTycoonStadiumCapacity(tycoon);
  const location = arenaInfo?.arena_location ?? '';
  const openingYear = arenaInfo?.opening_year ?? 0;
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const arenaRating = 56 + stadiumLevel * 9;
  const revenueEstimate = useMemo(() => {
    const avgTicketPrice = 85 * ticketMult;
    const homeGames = 41;
    const fillRate = Math.min(1.0, 0.75 + ticketMult * -0.05 + stadiumLevel * 0.03);
    return Math.round(avgTicketPrice * capacity * homeGames * fillRate);
  }, [ticketMult, capacity, stadiumLevel]);
  const sponsorships = tycoon.sponsorships ?? {};
  const arenaSponsors = (['court', 'stadium'] as SponsorshipSlot[])
    .map(slot => ({ slot, deal: sponsorships[slot] }))
    .filter(s => s.deal);
  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {ARENA_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
              tab === t.id
                ? 'bg-amber-400/15 border border-amber-400/40 text-amber-200'
                : 'border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'identity' && (
        <IdentityTab
          arenaName={arenaName}
          capacity={capacity}
          location={location}
          openingYear={openingYear}
          arenaRating={arenaRating}
          teamName={teamName}
          teamLogoUrl={teamLogoUrl}
          fmt={fmt}
        />
      )}
      {tab === 'court' && (
        <CourtTab teamName={teamName} teamLogoUrl={teamLogoUrl} teamAbbrev={teamAbbrev} arenaName={arenaName} />
      )}
      {tab === 'overview' && (
        <OverviewTab
          arenaName={arenaName}
          capacity={capacity}
          arenaRating={arenaRating}
          stadiumLevel={stadiumLevel}
          tycoon={tycoon}
          revenueEstimate={revenueEstimate}
          fmt={fmt}
        />
      )}
      {tab === 'sponsorship' && (
        <SponsorshipTab arenaSponsors={arenaSponsors} arenaName={arenaName} fmt={fmt} />
      )}
      {tab === 'ticketing' && (
        <TicketingTab
          ticketMult={ticketMult}
          onTicketMultChange={onTicketMultChange}
          capacity={capacity}
          revenueEstimate={revenueEstimate}
          fmt={fmt}
          locked={locked}
        />
      )}
    </div>
  );
};
const StatBox: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }> = ({ icon, label, value, sub, accent = 'text-amber-300' }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-center">
    <div className={`flex justify-center ${accent}`}>{icon}</div>
    <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-black ${accent}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
  </div>
);
const IdentityTab: React.FC<{
  arenaName: string; capacity: number; location: string; openingYear: number;
  arenaRating: number; teamName: string; teamLogoUrl?: string; fmt: (v: number) => string;
}> = ({ arenaName, capacity, location, openingYear, arenaRating, teamName, teamLogoUrl, fmt }) => (
  <div className="grid lg:grid-cols-[1fr_320px] gap-5">
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 rounded-2xl border border-amber-400/30 bg-amber-400/10 flex items-center justify-center shrink-0">
            {teamLogoUrl ? (
              <img src={teamLogoUrl} alt="" className="w-14 h-14 object-contain" />
            ) : (
              <Landmark size={36} className="text-amber-300" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500">Arena Name</div>
            <h3 className="text-2xl font-black text-white mt-1 truncate">{arenaName}</h3>
            <p className="text-sm text-slate-400 mt-1">Home of the {teamName}</p>
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox icon={<Users size={24} />} label="Capacity" value={capacity.toLocaleString()} sub="Seats" />
        <StatBox icon={<MapPin size={24} />} label="Location" value={location.split(',')[0] || '—'} sub={location.split(',').slice(1).join(',').trim() || ''} />
        <StatBox icon={<Calendar size={24} />} label="Opened" value={openingYear ? String(openingYear) : '—'} sub={openingYear ? `${new Date().getFullYear() - openingYear} years` : ''} />
        <StatBox icon={<Star size={24} />} label="Rating" value={String(Math.min(99, arenaRating))} sub={arenaRating >= 90 ? 'Elite' : arenaRating >= 80 ? 'Great' : 'Good'} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Arena Features</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['LED Ribbon System', arenaRating >= 75],
            ['VIP Luxury Suites', arenaRating >= 70],
            ['Jumbotron 360°', arenaRating >= 80],
            ['Premium Courtside', true],
            ['Fan Zone & Concourse', true],
            ['State-of-Art Sound', arenaRating >= 78],
            ['Press & Media Center', true],
            ['Player Tunnel Show', arenaRating >= 85],
          ].map(([feature, active]) => (
            <div key={feature as string} className={`rounded-xl border p-3 flex items-center gap-3 ${active ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/50 opacity-50'}`}>
              <div className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span className={`text-sm ${active ? 'text-slate-200' : 'text-slate-500'}`}>{feature as string}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    <aside className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Quick Facts</div>
        <div className="divide-y divide-slate-800">
          {[
            ['Arena Name', arenaName],
            ['Home Team', teamName],
            ['Capacity', capacity.toLocaleString()],
            ['Location', location || '—'],
            ['Year Opened', openingYear ? String(openingYear) : '—'],
            ['Surface', 'Maple Hardwood'],
            ['Arena Level', `Level ${Math.min(5, Math.max(1, Math.ceil(arenaRating / 20)))}`],
          ].map(([label, val]) => (
            <div key={label} className="py-2.5 flex justify-between gap-3">
              <span className="text-xs text-slate-500">{label}</span>
              <span className="text-xs font-bold text-slate-200 truncate text-right max-w-[180px]">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-amber-300 mb-3">Atmosphere Rating</div>
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: `conic-gradient(#fbbf24 ${Math.min(99, arenaRating) * 3.6}deg, #1e293b 0deg)` }}
          >
            <div className="w-14 h-14 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
              <span className="text-2xl font-black text-amber-300">{Math.min(99, arenaRating)}</span>
            </div>
          </div>
          <div>
            <div className="text-sm font-black text-white">{arenaRating >= 90 ? 'Electric' : arenaRating >= 80 ? 'Loud' : arenaRating >= 70 ? 'Strong' : 'Growing'}</div>
            <p className="text-xs text-slate-400 mt-1">Fans create a formidable home-court advantage.</p>
          </div>
        </div>
      </div>
    </aside>
  </div>
);
const CourtTab: React.FC<{ teamName: string; teamLogoUrl?: string; teamAbbrev?: string; arenaName: string }> = ({ teamName, teamLogoUrl, teamAbbrev, arenaName }) => (
  <div className="space-y-5">
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Court Design</div>
      <div className="relative w-full aspect-[94/50] rounded-xl border border-slate-700 bg-[#c4935a] overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 11px)' }} />
        <div className="absolute inset-4 border-2 border-white/60 rounded-sm" />
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-[19%] h-[64%] border-2 border-white/60" />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-[19%] h-[64%] border-2 border-white/60" />
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-[6%] aspect-square border-2 border-white/60 rounded-full" />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-[6%] aspect-square border-2 border-white/60 rounded-full" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square border-2 border-white/60 rounded-full" />
        <div className="absolute left-1/2 top-4 bottom-4 w-px bg-white/60 -translate-x-1/2" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          {teamLogoUrl ? (
            <img src={teamLogoUrl} alt={teamName} className="w-16 h-16 sm:w-24 sm:h-24 object-contain drop-shadow-lg opacity-80" />
          ) : (
            <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-slate-900/60 border border-white/20 flex items-center justify-center">
              <span className="text-lg sm:text-2xl font-black text-white/70">{teamAbbrev ?? teamName.slice(0, 3).toUpperCase()}</span>
            </div>
          )}
        </div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-bold text-white/40 uppercase tracking-widest">{arenaName}</div>
      </div>
    </div>
    <div className="grid sm:grid-cols-3 gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Court Surface</div>
        <div className="text-lg font-black text-white">Northern Maple</div>
        <p className="text-xs text-slate-400 mt-1">Standard NBA-grade hardwood from northern forests.</p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Court Color</div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#c4935a] border border-slate-700" />
          <div>
            <div className="text-sm font-black text-white">Classic Maple</div>
            <p className="text-xs text-slate-500">Traditional tone</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Center Logo</div>
        <div className="text-sm font-black text-white">{teamName}</div>
        <p className="text-xs text-slate-400 mt-1">Primary team logo displayed at half court.</p>
      </div>
    </div>
  </div>
);
const OverviewTab: React.FC<{
  arenaName: string; capacity: number; arenaRating: number;
  stadiumLevel: number; tycoon: TycoonState; revenueEstimate: number; fmt: (v: number) => string;
}> = ({ arenaName, capacity, arenaRating, stadiumLevel, revenueEstimate, fmt }) => {
  const level = stadiumLevel;
  const attributes: Array<[string, number]> = [
    ['Arena Quality', Math.min(99, arenaRating + 2)],
    ['Attendance Draw', Math.min(99, arenaRating)],
    ['VIP Revenue', Math.min(99, arenaRating - 2)],
    ['Atmosphere', Math.min(99, arenaRating + 1)],
    ['Fan Engagement', Math.min(99, arenaRating - 1)],
    ['Concessions', Math.min(99, arenaRating - 3)],
  ];
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-5">
      <div className="space-y-5">
        <div className="grid sm:grid-cols-4 gap-3">
          <StatBox icon={<Users size={22} />} label="Capacity" value={capacity.toLocaleString()} />
          <StatBox icon={<Star size={22} />} label="Rating" value={String(Math.min(99, arenaRating))} />
          <StatBox icon={<DollarSign size={22} />} label="Est. Revenue" value={fmt(revenueEstimate)} sub="Projected annual" />
          <StatBox icon={<TrendingUp size={22} />} label="Level" value={String(level)} sub={`of 5`} />
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Performance Attributes</div>
          <div className="space-y-3">
            {attributes.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[1fr_100px] items-center gap-4">
                <div className="text-sm text-slate-300">{label}</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${Math.max(20, value)}%` }} />
                  </div>
                  <span className="text-xs font-black text-amber-300 tabular-nums w-6 text-right">{value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Arena Sections</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              ['Lower Bowl', `${Math.round(capacity * 0.45).toLocaleString()} seats`, 'Premium courtside and lower-level seating.'],
              ['Upper Bowl', `${Math.round(capacity * 0.40).toLocaleString()} seats`, 'Upper-level general admission seating.'],
              ['Luxury Suites', `${Math.round(capacity * 0.15).toLocaleString()} seats`, 'Private suites, club seats, and VIP areas.'],
            ].map(([name, seats, desc]) => (
              <div key={name} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-sm font-black text-white">{name}</div>
                <div className="text-xs font-bold text-amber-300 mt-1">{seats}</div>
                <p className="text-xs text-slate-500 mt-2">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <aside className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Arena Details</div>
          <div className="divide-y divide-slate-800">
            {[
              ['Name', arenaName],
              ['Capacity', capacity.toLocaleString()],
              ['Level', `${level} / 5`],
              ['Home Games', '41'],
              ['Surface', 'Maple Hardwood'],
              ['Scoreboard', arenaRating >= 85 ? '360° Halo' : 'Standard'],
            ].map(([label, val]) => (
              <div key={label} className="py-2.5 flex justify-between gap-3">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-bold text-slate-200 text-right">{val}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-amber-300 mb-3">Matchday Revenue</div>
          <div className="text-3xl font-black text-white">{fmt(revenueEstimate)}</div>
          <p className="text-xs text-slate-400 mt-2">Projected annual gate revenue based on current ticket pricing and attendance estimates.</p>
        </div>
      </aside>
    </div>
  );
};
const SponsorshipTab: React.FC<{
  arenaSponsors: Array<{ slot: SponsorshipSlot; deal: any }>;
  arenaName: string;
  fmt: (v: number) => string;
}> = ({ arenaSponsors, arenaName, fmt }) => {
  const totalValue = arenaSponsors.reduce((sum, s) => sum + (s.deal?.valuePerYear ?? 0), 0);
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-3">
        <StatBox icon={<Tag size={22} />} label="Active Deals" value={String(arenaSponsors.length)} sub="Arena sponsors" />
        <StatBox icon={<DollarSign size={22} />} label="Portfolio Value" value={fmt(totalValue)} sub="Annual revenue" />
        <StatBox icon={<Trophy size={22} />} label="Naming Rights" value={arenaSponsors.find(s => s.slot === 'stadium')?.deal?.sponsor ?? 'Vacant'} sub="Title sponsor" />
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Arena Sponsorship Slots</div>
        {arenaSponsors.length > 0 ? (
          <div className="divide-y divide-slate-800">
            {arenaSponsors.map(({ slot, deal }) => (
              <div key={slot} className="py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-black text-white capitalize">{slot === 'stadium' ? 'Naming Rights' : slot === 'court' ? 'Court Logo' : slot}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{deal?.sponsor ?? 'Vacant'}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-emerald-300">{fmt(deal?.valuePerYear ?? 0)}</div>
                  <div className="text-xs text-slate-500">{deal?.yearsRemaining ?? 0} yr remaining</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Tag size={32} className="mx-auto text-slate-600 mb-3" />
            <p className="text-sm text-slate-500">No active arena sponsorship deals.</p>
            <p className="text-xs text-slate-600 mt-1">Visit Sponsorships to negotiate arena naming rights and court logos.</p>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Sponsor Visibility</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['Naming Rights', 'Highest visibility — arena name on all broadcasts and materials.'],
            ['Court Logo', 'Center court and baseline branding seen in every game.'],
            ['LED Ribbon', 'Dynamic in-arena advertising throughout the game.'],
            ['Concourse Banners', 'Fan-facing branding in walkways and concession areas.'],
          ].map(([name, desc]) => (
            <div key={name} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="text-sm font-black text-white">{name}</div>
              <p className="text-xs text-slate-500 mt-2">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
const TicketingTab: React.FC<{
  ticketMult: number; onTicketMultChange: (mult: number) => void;
  capacity: number; revenueEstimate: number; fmt: (v: number) => string;
  locked?: boolean;
}> = ({ ticketMult, onTicketMultChange, capacity, revenueEstimate, fmt, locked = false }) => {
  const basePrice = 85;
  const avgPrice = Math.round(basePrice * ticketMult);
  const fillRate = Math.min(100, Math.round((0.75 + ticketMult * -0.05 + 0.15) * 100));
  const avgAttendance = Math.round(capacity * fillRate / 100);
  const pricingLabel = ticketMult <= 0.7 ? 'Budget'
    : ticketMult <= 0.9 ? 'Value'
    : ticketMult <= 1.1 ? 'Standard'
    : ticketMult <= 1.5 ? 'Premium'
    : 'Elite';

  const tiers = [
    ['Courtside', Math.round(avgPrice * 8.5), '~200 seats'],
    ['Lower Bowl', Math.round(avgPrice * 2.2), `~${Math.round(capacity * 0.25).toLocaleString()} seats`],
    ['Club Level', Math.round(avgPrice * 1.6), `~${Math.round(capacity * 0.15).toLocaleString()} seats`],
    ['Upper Bowl', Math.round(avgPrice * 0.65), `~${Math.round(capacity * 0.40).toLocaleString()} seats`],
    ['Standing Room', Math.round(avgPrice * 0.35), 'Limited availability'],
  ] as Array<[string, number, string]>;
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-5">
        <div className="rounded-2xl border border-amber-400/30 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Ticket Price Multiplier</div>
              <div className="text-4xl font-black text-white mt-2 tabular-nums">{ticketMult.toFixed(2)}x</div>
              <div className="mt-1 inline-flex rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-black text-amber-300">{pricingLabel} Pricing</div>
            </div>
            <div className="w-24 h-24 rounded-full border border-amber-400/40 bg-amber-400/10 flex flex-col items-center justify-center">
              <DollarSign size={28} className="text-amber-300" />
              <div className="text-xs text-slate-400 mt-1">~${avgPrice}</div>
            </div>
          </div>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.05}
            value={ticketMult}
            onChange={(e) => onTicketMultChange(parseFloat(e.target.value))}
            disabled={locked}
            className={`w-full accent-amber-400 ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
          />
          {locked && <div className="mt-3 text-xs font-bold text-amber-300">Ticket pricing is locked until next offseason.</div>}
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>0.50x Budget</span><span>1.00x Standard</span><span>2.00x Elite</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Pricing Tiers</div>
          <div className="divide-y divide-slate-800">
            {tiers.map(([name, price, info]) => (
              <div key={name} className="py-3 grid grid-cols-[1fr_80px_120px] items-center gap-3">
                <div className="text-sm text-slate-200 font-bold">{name}</div>
                <div className="text-sm font-black text-amber-300 text-right tabular-nums">${price}</div>
                <div className="text-xs text-slate-500 text-right">{info}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <StatBox icon={<DollarSign size={22} />} label="Avg Ticket" value={`$${avgPrice}`} sub="Per game" />
          <StatBox icon={<Users size={22} />} label="Avg Attendance" value={avgAttendance.toLocaleString()} sub={`${fillRate}% capacity`} />
          <StatBox icon={<TrendingUp size={22} />} label="Gate Revenue" value={fmt(revenueEstimate)} sub="Projected annual" accent="text-emerald-300" />
        </div>
      </div>

      <aside className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Pricing Impact</div>
          <div className="space-y-4">
            {[
              ['Revenue', ticketMult >= 1.2 ? '+High' : ticketMult >= 0.9 ? 'Standard' : '−Low', ticketMult >= 1.2 ? 'text-emerald-300' : ticketMult >= 0.9 ? 'text-slate-300' : 'text-rose-300'],
              ['Attendance', ticketMult <= 0.8 ? '+High' : ticketMult <= 1.2 ? 'Standard' : '−Low', ticketMult <= 0.8 ? 'text-emerald-300' : ticketMult <= 1.2 ? 'text-slate-300' : 'text-rose-300'],
              ['Fan Satisfaction', ticketMult <= 1.0 ? 'Happy' : ticketMult <= 1.4 ? 'Neutral' : 'Unhappy', ticketMult <= 1.0 ? 'text-emerald-300' : ticketMult <= 1.4 ? 'text-amber-300' : 'text-rose-300'],
              ['Atmosphere', ticketMult <= 0.9 ? 'Electric' : ticketMult <= 1.3 ? 'Good' : 'Quiet', ticketMult <= 0.9 ? 'text-emerald-300' : ticketMult <= 1.3 ? 'text-amber-300' : 'text-rose-300'],
            ].map(([label, status, color]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{label}</span>
                <span className={`text-sm font-black ${color}`}>{status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-emerald-300 mb-3">Revenue Projection</div>
          <div className="text-3xl font-black text-white">{fmt(revenueEstimate)}</div>
          <p className="text-xs text-slate-400 mt-2">Annual gate revenue from 41 home games at current pricing and projected fill rate.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Strategy Guide</div>
          <div className="space-y-3 text-xs text-slate-400 leading-5">
            <p><span className="text-amber-300 font-bold">Premium pricing</span> maximizes per-ticket revenue but may reduce attendance and atmosphere.</p>
            <p><span className="text-emerald-300 font-bold">Budget pricing</span> fills seats and creates a loud arena but generates less gate revenue.</p>
            <p><span className="text-slate-200 font-bold">Standard</span> is the balanced default that most clubs start with.</p>
          </div>
        </div>
      </aside>
    </div>
  );
};
