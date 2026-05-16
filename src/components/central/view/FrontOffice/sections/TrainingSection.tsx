import React, { useState } from 'react';
import {
  Activity, Building2, Dumbbell, Eye, FlaskConical, MapPin,
  MonitorPlay, Star, Tag, TrendingUp, Users, Zap,
} from 'lucide-react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import type { TycoonState, SponsorshipSlot } from '../../../../../types/tycoon';
import { TEAM_ARENAS } from '../../../../../data/arenas';

type TrainingTab = 'center' | 'overview' | 'sponsorship';

const TABS: Array<{ id: TrainingTab; label: string; icon: React.ReactNode }> = [
  { id: 'center', label: 'Training Center', icon: <Dumbbell size={16} /> },
  { id: 'overview', label: 'Facility Overview', icon: <Eye size={16} /> },
  { id: 'sponsorship', label: 'Sponsorship', icon: <Tag size={16} /> },
];

type FacilityTier = 'Elite' | 'Advanced' | 'Standard' | 'Basic';

function tierFromLevel(level: number, areaOffset: number): FacilityTier {
  const effective = level + areaOffset;
  if (effective >= 5) return 'Elite';
  if (effective >= 3) return 'Advanced';
  if (effective >= 2) return 'Standard';
  return 'Basic';
}

const TIER_STYLES: Record<FacilityTier, string> = {
  Elite: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
  Advanced: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  Standard: 'text-sky-300 border-sky-400/40 bg-sky-400/10',
  Basic: 'text-slate-400 border-slate-600 bg-slate-800/50',
};

interface TrainingSectionProps {
  tycoon: TycoonState;
  teamName: string;
  teamLogoUrl?: string;
  currency: string;
}

export const TrainingSection: React.FC<TrainingSectionProps> = ({
  tycoon, teamName, teamLogoUrl, currency,
}) => {
  const [tab, setTab] = useState<TrainingTab>('center');
  const level = tycoon.facilities.trainingCenter.level;
  const rating = 58 + level * 9;
  const facilityName = `${teamName} Training Center`;
  const arenaName = TEAM_ARENAS[teamName] ?? 'Arena';
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
              tab === t.id
                ? 'bg-sky-400/15 border border-sky-400/40 text-sky-200'
                : 'border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'center' && (
        <CenterTab
          facilityName={facilityName}
          level={level}
          rating={rating}
          arenaName={arenaName}
          teamLogoUrl={teamLogoUrl}
        />
      )}
      {tab === 'overview' && (
        <OverviewTab level={level} rating={rating} facilityName={facilityName} fmt={fmt} />
      )}
      {tab === 'sponsorship' && (
        <SponsorshipTab tycoon={tycoon} facilityName={facilityName} fmt={fmt} />
      )}
    </div>
  );
};

const FACILITY_AREAS: Array<{
  key: string;
  label: string;
  icon: React.ReactNode;
  desc: string;
  offset: number;
}> = [
  { key: 'courts', label: 'Practice Courts', icon: <Dumbbell size={20} />, desc: 'NBA-standard hardwood courts for team scrimmages and individual work.', offset: 0 },
  { key: 'strength', label: 'Strength & Conditioning', icon: <Zap size={20} />, desc: 'Weight rooms, resistance training, and athletic performance equipment.', offset: -1 },
  { key: 'science', label: 'Sports Science', icon: <FlaskConical size={20} />, desc: 'Biomechanics lab, motion capture, and load monitoring systems.', offset: 0 },
  { key: 'video', label: 'Video Analysis', icon: <MonitorPlay size={20} />, desc: 'Film rooms, AI-powered play breakdown, and opponent scouting feeds.', offset: 1 },
  { key: 'media', label: 'Media & Interview', icon: <Users size={20} />, desc: 'Press room, broadcast studio, and player media facilities.', offset: -1 },
  { key: 'recovery', label: 'Recovery Suite', icon: <Activity size={20} />, desc: 'Cold plunge, sauna, compression therapy, and sleep pods.', offset: 0 },
];

const StatBox: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }> = ({ icon, label, value, sub, accent = 'text-sky-300' }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-center">
    <div className={`flex justify-center ${accent}`}>{icon}</div>
    <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-black ${accent}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
  </div>
);

const CenterTab: React.FC<{
  facilityName: string; level: number; rating: number; arenaName: string; teamLogoUrl?: string;
}> = ({ facilityName, level, rating, arenaName, teamLogoUrl }) => {
  const tierLabel = level >= 5 ? 'World Class' : level >= 4 ? 'Elite' : level >= 3 ? 'Excellent' : level >= 2 ? 'Good' : 'Basic';
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-2xl border border-sky-400/30 bg-sky-400/10 flex items-center justify-center shrink-0">
              {teamLogoUrl ? (
                <img src={teamLogoUrl} alt="" className="w-14 h-14 object-contain" />
              ) : (
                <Dumbbell size={36} className="text-sky-300" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Training Facility</div>
              <h3 className="text-2xl font-black text-white mt-1">{facilityName}</h3>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className="inline-flex rounded-lg border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-xs font-black text-sky-300">Level {level}</span>
                <span className="inline-flex rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-black text-emerald-300">{tierLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox icon={<Star size={22} />} label="Overall Rating" value={String(Math.min(99, rating))} sub={tierLabel} />
          <StatBox icon={<TrendingUp size={22} />} label="Level" value={`${level} / 5`} sub="Facility tier" />
          <StatBox icon={<Dumbbell size={22} />} label="Training Quality" value={rating >= 85 ? 'Elite' : rating >= 75 ? 'High' : 'Standard'} sub={`${Math.min(99, rating)}/100`} />
          <StatBox icon={<MapPin size={22} />} label="Arena" value={arenaName.split(' ').slice(0, 2).join(' ')} sub="Home venue" />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Key Benefits</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              ['Player Development', `+${Math.round(level * 3.5)}%`, 'Accelerated skill growth from training sessions.'],
              ['Skill Refinement', `+${Math.round(level * 2.8)}%`, 'Better shooting, handles, and on-court IQ improvement.'],
              ['Training Effectiveness', `+${Math.round(level * 4)}%`, 'Higher returns from each practice session and drill.'],
            ].map(([name, bonus, desc]) => (
              <div key={name} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="text-sm font-black text-white">{name}</div>
                <div className="text-xl font-black text-emerald-300 mt-1">{bonus}</div>
                <p className="text-xs text-slate-400 mt-2">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Facility Areas</div>
          <div className="divide-y divide-slate-800">
            {FACILITY_AREAS.map(area => {
              const tier = tierFromLevel(level, area.offset);
              return (
                <div key={area.key} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-500 shrink-0">{area.icon}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-200">{area.label}</div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{area.desc}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-black ${TIER_STYLES[tier]}`}>{tier}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Quick Info</div>
          <div className="divide-y divide-slate-800">
            {[
              ['Facility', facilityName],
              ['Level', `${level} / 5`],
              ['Rating', `${Math.min(99, rating)}`],
              ['Status', tierLabel],
              ['Courts', `${Math.max(2, level + 1)} full-size`],
              ['Arena', arenaName],
            ].map(([label, val]) => (
              <div key={label} className="py-2.5 flex justify-between gap-3">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-bold text-slate-200 truncate text-right max-w-[160px]">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-sky-400/30 bg-sky-400/5 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-sky-300 mb-3">Facility Impact</div>
          <div className="space-y-3">
            {[
              ['Player Growth', Math.min(99, 50 + level * 10)],
              ['Injury Reduction', Math.min(99, 40 + level * 8)],
              ['Morale Boost', Math.min(99, 45 + level * 9)],
              ['Conditioning', Math.min(99, 48 + level * 10)],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{label}</span>
                  <span className="font-black text-sky-300">{value}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-sky-400" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};

const OverviewTab: React.FC<{
  level: number; rating: number; facilityName: string; fmt: (v: number) => string;
}> = ({ level, rating, facilityName, fmt }) => {
  const attributes: Array<[string, number]> = [
    ['Training Quality', Math.min(99, rating)],
    ['Skill Development', Math.min(99, rating - 2)],
    ['Shooting Labs', Math.min(99, rating - 3)],
    ['Weight Rooms', Math.min(99, rating - 5)],
    ['Biomechanics', Math.min(99, rating - 6)],
    ['Recovery Facilities', Math.min(99, rating - 4)],
  ];
  const facilityValue = level * 16_000_000;
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-5">
      <div className="space-y-5">
        <div className="grid sm:grid-cols-4 gap-3">
          <StatBox icon={<Star size={22} />} label="Rating" value={String(Math.min(99, rating))} />
          <StatBox icon={<TrendingUp size={22} />} label="Level" value={`${level} / 5`} />
          <StatBox icon={<Building2 size={22} />} label="Value" value={fmt(facilityValue)} sub="Estimated" />
          <StatBox icon={<Dumbbell size={22} />} label="Courts" value={String(Math.max(2, level + 1))} sub="Full-size" />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Performance Attributes</div>
          <div className="space-y-3">
            {attributes.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[1fr_100px] items-center gap-4">
                <div className="text-sm text-slate-300">{label}</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-sky-400" style={{ width: `${Math.max(20, value)}%` }} />
                  </div>
                  <span className="text-xs font-black text-sky-300 tabular-nums w-6 text-right">{value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Facility Areas Overview</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FACILITY_AREAS.map(area => {
              const tier = tierFromLevel(level, area.offset);
              const tierRating = tier === 'Elite' ? Math.min(99, rating + 5) : tier === 'Advanced' ? rating : tier === 'Standard' ? rating - 6 : rating - 12;
              return (
                <div key={area.key} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{area.icon}</span>
                      <span className="text-sm font-black text-white">{area.label}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-black ${TIER_STYLES[tier]}`}>{tier}</span>
                    <span className="text-xs font-black text-sky-300 tabular-nums">{Math.max(1, Math.min(99, tierRating))}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-sky-400" style={{ width: `${Math.max(20, Math.min(99, tierRating))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Facility Details</div>
          <div className="divide-y divide-slate-800">
            {[
              ['Name', facilityName],
              ['Level', `${level} / 5`],
              ['Rating', String(Math.min(99, rating))],
              ['Est. Value', fmt(facilityValue)],
              ['Courts', `${Math.max(2, level + 1)} full-size`],
              ['Surface', 'NBA-Grade Hardwood'],
            ].map(([label, val]) => (
              <div key={label} className="py-2.5 flex justify-between gap-3">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-bold text-slate-200 text-right truncate max-w-[160px]">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-sky-400/30 bg-sky-400/5 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-sky-300 mb-3">Facility Impact</div>
          <div className="space-y-3">
            {[
              ['Player Growth', Math.min(99, 50 + level * 10)],
              ['Injury Reduction', Math.min(99, 40 + level * 8)],
              ['Morale Boost', Math.min(99, 45 + level * 9)],
              ['Conditioning', Math.min(99, 48 + level * 10)],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{label}</span>
                  <span className="font-black text-sky-300">{value}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-sky-400" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};

const SponsorshipTab: React.FC<{
  tycoon: TycoonState; facilityName: string; fmt: (v: number) => string;
}> = ({ tycoon, facilityName, fmt }) => {
  const sponsorships = tycoon.sponsorships ?? {};
  const trainingSponsors = (['training', 'practice'] as SponsorshipSlot[])
    .map(slot => ({ slot, deal: sponsorships[slot] }))
    .filter(s => s.deal);
  const totalValue = trainingSponsors.reduce((sum, s) => sum + (s.deal?.valuePerYear ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-3">
        <StatBox icon={<Tag size={22} />} label="Active Deals" value={String(trainingSponsors.length)} sub="Training sponsors" />
        <StatBox icon={<Building2 size={22} />} label="Portfolio Value" value={fmt(totalValue)} sub="Annual revenue" />
        <StatBox icon={<Star size={22} />} label="Naming Rights" value={trainingSponsors.find(s => s.slot === 'practice')?.deal?.sponsor ?? 'Vacant'} sub="Facility sponsor" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Training Facility Sponsorships</div>
        {trainingSponsors.length > 0 ? (
          <div className="divide-y divide-slate-800">
            {trainingSponsors.map(({ slot, deal }) => (
              <div key={slot} className="py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-black text-white capitalize">{slot === 'training' ? 'Training Kit' : slot === 'practice' ? 'Practice Facility' : slot}</div>
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
            <p className="text-sm text-slate-500">No active training facility sponsorship deals.</p>
            <p className="text-xs text-slate-600 mt-1">Visit Sponsorships to negotiate training kit and practice facility deals.</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Sponsorship Zones</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['Training Kit', 'Team-branded apparel worn during all practice sessions and warmups.'],
            ['Practice Facility', 'Naming rights for the training complex and indoor courts.'],
            ['Court Branding', 'Logos on practice court surfaces and backboards.'],
            ['Equipment Partner', 'Weight rooms, machines, and recovery equipment branding.'],
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
