import React, { useState } from 'react';
import { Building2, TrendingUp, HeartPulse, Smile, Plane, Shield, Dumbbell, Target, Landmark } from 'lucide-react';
import type { TycoonState } from '../../../../../types/tycoon';
import { medicalQuality } from '../../../../../services/tycoon/medicalEngine';
import { FacilityKpi } from '../shared/FacilityKpi';

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; subtitle: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-start gap-3">
    <div className="w-11 h-11 rounded-2xl border border-amber-400/30 bg-amber-400/10 flex items-center justify-center text-amber-300">{icon}</div>
    <div>
      <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>
      <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
    </div>
  </div>
);

const FacilityCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  rating: number;
  tone: string;
  badge: string;
  attributes: Array<[string, number]>;
  chips: string[];
  onDetails?: () => void;
}> = ({ title, icon, rating, tone, badge, attributes, chips, onDetails }) => {
  const accent = tone === 'amber' ? 'text-amber-300 border-amber-400/40 bg-amber-400/10'
    : tone === 'violet' ? 'text-violet-300 border-violet-400/40 bg-violet-400/10'
    : tone === 'emerald' ? 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10'
    : tone === 'cyan' ? 'text-cyan-300 border-cyan-400/40 bg-cyan-400/10'
    : 'text-sky-300 border-sky-400/40 bg-sky-400/10';
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/70 p-5 ${tone === 'amber' ? 'shadow-lg shadow-amber-950/20' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full border flex items-center justify-center ${accent}`}>{icon}</div>
          <div className="text-sm font-black text-white uppercase tracking-wide">{title}</div>
        </div>
        <div className={`rounded-lg border px-2 py-1 text-xs font-black uppercase ${accent}`}>{badge}</div>
      </div>
      <div className="mt-6 grid grid-cols-[96px_1fr] gap-5 items-center">
        <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center bg-[conic-gradient(#74d66f_0deg,#74d66f_var(--rating),#1e293b_var(--rating))]" style={{ '--rating': `${Math.min(99, rating) * 3.6}deg` } as React.CSSProperties}>
          <div className="w-16 h-16 rounded-full bg-slate-950 border border-slate-800 flex flex-col items-center justify-center">
            <div className="text-2xl font-black text-emerald-300">{Math.min(99, rating)}</div>
          </div>
        </div>
        <div className="space-y-2">
          {attributes.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[1fr_56px] items-center gap-3">
              <div className="text-xs text-slate-300 truncate">{label}</div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${Math.max(20, Math.min(99, value))}%` }} /></div>
                <span className="text-xs font-black text-emerald-300 tabular-nums">{Math.max(1, Math.min(99, value))}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 text-xs font-black uppercase tracking-widest text-slate-500">Key Features</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {chips.slice(0, 4).map(chip => <span key={chip} className="rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-[10px] font-bold text-slate-300">{chip}</span>)}
      </div>
      <button onClick={onDetails} className={`mt-4 w-full h-11 rounded-xl border font-black ${accent}`}>View Details →</button>
    </div>
  );
};

export const FacilitiesSection: React.FC<{
  tycoon: TycoonState;
  fmt: (v: number) => string;
  onTravelDetails?: () => void;
  onMedicalDetails?: () => void;
  onAnalyticsDetails?: () => void;
  onArenaDetails?: () => void;
  onTrainingDetails?: () => void;
  onAcademyDetails?: () => void;
}> = ({ tycoon, fmt, onTravelDetails, onMedicalDetails, onAnalyticsDetails, onArenaDetails, onTrainingDetails, onAcademyDetails }) => {
  const [facilityModal, setFacilityModal] = useState<{ title: string; body: string; tone: 'amber' | 'slate'; comingSoon?: boolean } | null>(null);
  const openComingSoon = (title: string, tone: 'amber' | 'slate' = 'amber') =>
    setFacilityModal({
      title,
      body: 'This screen is under construction. It will let you plan, approve, and track infrastructure projects directly from the Front Office in a future update.',
      tone,
      comingSoon: true,
    });
  const medicalRating = 50 + Math.round(medicalQuality(tycoon.medicalBudget) * 45);
  const travelAverage = tycoon.travelPreferences
    ? Math.round((tycoon.travelPreferences.hotel + tycoon.travelPreferences.flight + tycoon.travelPreferences.bus) / 3)
    : 2;
  const travelRating = 58 + travelAverage * 8;
  const trainingRating = 58 + tycoon.facilities.trainingCenter.level * 9;
  const academyRating = 54 + tycoon.facilities.academy.level * 9;
  const arenaRating = 56 + tycoon.facilities.stadium.level * 9;
  const analyticsRating = 72;
  const cards: Array<{
    title: string;
    icon: React.ReactNode;
    rating: number;
    tone: string;
    badge: string;
    attributes: Array<[string, number]>;
    chips: string[];
  }> = [
    {
      title: 'Training Center',
      icon: <Dumbbell size={26} />,
      rating: trainingRating,
      tone: 'sky',
      badge: trainingRating >= 90 ? 'Elite' : 'A',
      attributes: [
        ['Training Quality', trainingRating],
        ['Skill Development', trainingRating - 2],
        ['Shooting Labs', trainingRating - 3],
        ['Weight Rooms', trainingRating - 5],
        ['Biomechanics', trainingRating - 6],
      ],
      chips: ['Smart Courts', 'AI Motion Capture', 'Recovery Pools', 'Altitude Chambers'],
    },
    {
      title: 'Medical & Recovery Center',
      icon: <HeartPulse size={26} />,
      rating: medicalRating,
      tone: 'violet',
      badge: medicalRating >= 90 ? 'Elite' : 'A',
      attributes: [
        ['Injury Prevention', medicalRating],
        ['Rehab Speed', medicalRating - 2],
        ['Conditioning', medicalRating - 3],
        ['Load Management', medicalRating - 1],
        ['Recovery Tech', medicalRating - 4],
      ],
      chips: ['Cryotherapy', 'Hyperbaric Chambers', 'MRI Center', 'Sleep Labs'],
    },
    {
      title: 'Youth Academy',
      icon: <Target size={26} />,
      rating: academyRating,
      tone: 'emerald',
      badge: academyRating >= 90 ? 'Elite' : 'A',
      attributes: [
        ['Talent Pipeline', academyRating],
        ['Youth Coaching', academyRating - 2],
        ['Recruitment', academyRating - 4],
        ['Academy Prestige', academyRating + 1],
        ['Education', academyRating - 3],
      ],
      chips: ['Dormitories', 'School Partnerships', 'Regional Camps', 'Scouting Hub'],
    },
    {
      title: 'Analytics Lab',
      icon: <TrendingUp size={26} />,
      rating: analyticsRating,
      tone: 'cyan',
      badge: 'A',
      attributes: [
        ['Tactical Analysis', analyticsRating + 4],
        ['Opponent Scouting', analyticsRating + 2],
        ['Data Infrastructure', analyticsRating],
        ['AI Models', analyticsRating - 1],
        ['Match Preparation', analyticsRating + 3],
      ],
      chips: ['AI Video Analysis', 'Big Data Platform', 'Tracking System', 'Scouting AI'],
    },
    {
      title: 'Arena & Fan Experience',
      icon: <Landmark size={26} />,
      rating: arenaRating,
      tone: 'amber',
      badge: arenaRating >= 90 ? 'Elite' : 'A',
      attributes: [
        ['Arena Quality', arenaRating + 2],
        ['Attendance', arenaRating],
        ['VIP Revenue', arenaRating - 2],
        ['Atmosphere', arenaRating + 1],
        ['Fan Engagement', arenaRating - 1],
      ],
      chips: ['LED System', 'VIP Lounges', 'Giant Screens', 'Fan Zones'],
    },
    {
      title: 'Travel & Logistics Hub',
      icon: <Plane size={26} />,
      rating: travelRating,
      tone: 'sky',
      badge: travelRating >= 90 ? 'Elite' : 'A',
      attributes: [
        ['Travel Comfort', travelRating],
        ['Jet Quality', travelRating - 1],
        ['Recovery Efficiency', travelRating - 2],
        ['International Ops', travelRating - 1],
        ['Logistics', travelRating - 3],
      ],
      chips: ['Balanced', 'Optimal cost control', 'Road Recovery', 'European Ops'],
    },
  ];
  const avgRating = Math.round(cards.reduce((sum, card) => sum + card.rating, 0) / cards.length);
  const maintenance = (tycoon.facilities.stadium.level + tycoon.facilities.trainingCenter.level + tycoon.facilities.academy.level) * 2_600_000
    + (tycoon.medicalBudget ?? 0) * 0.35 + travelAverage * 450_000;
  const facilityValue = tycoon.facilities.stadium.capacity * 4_500
    + tycoon.facilities.trainingCenter.level * 16_000_000
    + tycoon.facilities.academy.level * 9_000_000
    + (tycoon.medicalBudget ?? 0) * 5;
  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <SectionTitle icon={<Building2 size={22} />} title="Facilities" subtitle="Manage and upgrade your club's infrastructure and facilities." />
        <button
          onClick={() => openComingSoon('Facility Masterplan')}
          className="h-14 rounded-xl border border-amber-400/50 bg-amber-400/10 px-8 text-amber-200 font-black hover:bg-amber-400/15"
        >
          View Masterplan →
        </button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
        <FacilityKpi icon={<Building2 size={22} />} label="Total Facility Value" value={fmt(facilityValue)} sub="All Facilities" />
        <FacilityKpi icon={<Shield size={22} />} label="Annual Maintenance" value={`${fmt(maintenance)} / year`} sub="Projected cost" />
        <FacilityKpi icon={<TrendingUp size={22} />} label="Facility Rating" value={String(avgRating)} sub={avgRating >= 88 ? 'Elite' : 'Strong'} />
        <FacilityKpi icon={<Smile size={22} />} label="Player Satisfaction" value={String(Math.min(99, avgRating - 3))} sub="Great" />
        <FacilityKpi icon={<HeartPulse size={22} />} label="Injury Prevention" value={`+${Math.round(medicalQuality(tycoon.medicalBudget) * 20)}%`} sub="vs baseline" />
      </div>

      <div className="grid xl:grid-cols-[1fr_370px] gap-6">
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {cards.map(card => (
              <FacilityCard
                key={card.title}
                {...card}
                onDetails={
                  card.title === 'Travel & Logistics Hub' && onTravelDetails
                    ? onTravelDetails
                    : card.title === 'Medical & Recovery Center' && onMedicalDetails
                    ? onMedicalDetails
                    : card.title === 'Analytics Lab' && onAnalyticsDetails
                    ? onAnalyticsDetails
                    : card.title === 'Arena & Fan Experience' && onArenaDetails
                    ? onArenaDetails
                    : card.title === 'Training Center' && onTrainingDetails
                    ? onTrainingDetails
                    : card.title === 'Youth Academy' && onAcademyDetails
                    ? onAcademyDetails
                    : () => setFacilityModal({
                        title: card.title,
                        body: `${card.title} is rated ${Math.min(99, card.rating)}. The strongest traits are ${card.attributes.slice(0, 2).map(([label]) => label).join(' and ')}. Upgrades here raise the club's operational ceiling without changing NBA-mode behavior.`,
                        tone: card.tone === 'amber' ? 'amber' : 'slate',
                      })
                }
              />
            ))}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 overflow-hidden">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5">Club Performance Ecosystem</div>
            <div className="grid lg:grid-cols-[1fr_220px_1fr] gap-5 items-center">
              <div className="space-y-3">
                {cards.slice(0, 3).map(card => (
                  <div key={card.title} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex items-center gap-3">
                    <span className="text-sky-300">{card.icon}</span>
                    <div><div className="text-sm font-black text-white">{card.title.replace(' & Recovery Center', ' Center')}</div><div className="text-xs text-slate-500">Feeds long-term club strength</div></div>
                  </div>
                ))}
              </div>
              <div className="relative mx-auto w-52 h-52 rounded-full border border-amber-400/50 bg-slate-950 shadow-2xl shadow-amber-950/30 flex flex-col items-center justify-center text-center">
                <div className="absolute inset-5 rounded-full border border-amber-400/20" />
                <div className="text-4xl font-black text-white">{avgRating}</div>
                <div className="text-sm font-black text-amber-300">Club Success</div>
                <div className="text-xs text-slate-500">Winning · Growth · Legacy</div>
              </div>
              <div className="space-y-3">
                {cards.slice(3).map(card => (
                  <div key={card.title} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex items-center gap-3">
                    <span className="text-amber-300">{card.icon}</span>
                    <div><div className="text-sm font-black text-white">{card.title}</div><div className="text-xs text-slate-500">Improves operational ceiling</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-5 gap-3">
            {['Upgrade Facility', 'View Blueprints', 'Hire Architects', 'Compare League Facilities', 'Infrastructure Report'].map((action, index) => (
              <button
                key={action}
                onClick={() => openComingSoon(action, index === 0 ? 'amber' : 'slate')}
                className={`h-14 rounded-xl border font-black text-sm ${index === 0 ? 'border-amber-400/50 bg-amber-400/15 text-amber-200' : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-600'}`}
              >
                {action}
              </button>
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Operational Insights</div>
            {[
              ['good', 'Training facilities are world-class. Player development is at elite level.'],
              ['warn', `Arena capacity of ${tycoon.facilities.stadium.capacity.toLocaleString()} may limit future revenue.`],
              ['warn', 'Youth academy facilities could be upgraded.'],
              ['good', 'Medical center is reducing injury risk effectively.'],
              ['info', 'Three European clubs have better travel conditions.'],
            ].map(([kind, text]) => (
              <div key={text} className="py-3 border-b border-slate-800 last:border-b-0 flex gap-3 text-sm text-slate-300">
                <span className={`mt-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${kind === 'good' ? 'bg-emerald-500/20 text-emerald-300' : kind === 'warn' ? 'bg-amber-500/20 text-amber-300' : 'bg-orange-500/20 text-orange-300'}`}>!</span>
                <span>{text}</span>
              </div>
            ))}
            <button
              onClick={() => openComingSoon('Infrastructure Report', 'slate')}
              className="mt-4 w-full h-12 rounded-xl border border-slate-700 text-slate-300 hover:text-white"
            >
              View Full Report →
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Facility Masterplan</div>
            <div className="flex items-center justify-between text-sm font-black text-amber-300 mb-4">
              <span>Under Construction</span><span>2 Active Projects</span>
            </div>
            {[
              ['Recovery Wing Expansion', 'Medical Center', 65, 'Dec 2026'],
              ['Arena Expansion Phase 1', 'Arena', 40, 'May 2027'],
            ].map(([name, area, pct, date]) => (
              <div key={name as string} className="mb-5">
                <div className="flex justify-between gap-3 text-sm"><span className="font-black text-white">{name}</span><span className="text-slate-500">{pct}%</span></div>
                <div className="text-xs text-slate-500">{area} · Completion: {date}</div>
                <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${pct}%` }} /></div>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-800 text-sm font-black text-amber-300">Planned <span className="float-right">3 Projects</span></div>
            {['AI Training Dome', 'Youth Dormitories', 'New Practice Arena'].map((name) => (
              <div key={name} className="py-3 border-b border-slate-800 text-sm">
                <div className="font-black text-white">{name}</div>
                <div className="text-xs text-slate-500">Starts next planning cycle</div>
              </div>
            ))}
            <button
              onClick={() => openComingSoon('Facility Masterplan')}
              className="mt-4 w-full h-14 rounded-xl border border-amber-400/50 bg-amber-400/10 text-amber-200 font-black"
            >
              View Masterplan →
            </button>
          </div>
        </aside>
      </div>
      {facilityModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <button className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setFacilityModal(null)} />
          <div className={`relative w-full max-w-xl rounded-2xl border bg-slate-950 p-6 shadow-2xl ${facilityModal.tone === 'amber' ? 'border-amber-400/40' : 'border-slate-700'}`}>
            <div className={`text-xs font-black uppercase tracking-widest ${facilityModal.tone === 'amber' ? 'text-amber-300' : 'text-slate-400'}`}>Facilities</div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <h3 className="text-2xl font-black text-white">{facilityModal.title}</h3>
              {facilityModal.comingSoon && (
                <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                  Coming Soon
                </span>
              )}
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">{facilityModal.body}</p>
            <button onClick={() => setFacilityModal(null)} className="mt-6 w-full h-12 rounded-xl border border-slate-700 text-slate-200 font-black hover:border-amber-400/50">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
