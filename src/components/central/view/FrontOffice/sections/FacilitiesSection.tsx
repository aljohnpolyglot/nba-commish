import React from 'react';
import {
  ArrowRight,
  Building2,
  Dumbbell,
  HeartPulse,
  Landmark,
  Plane,
  Shield,
  Star,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { TycoonState } from '../../../../../types/tycoon';
import { getAcademyBudgetStrength, normalizeAcademyBudgetEUR } from '../../../../../services/tycoon/economyScale';
import { getMedicalAreaLevels, getMedicalDepartmentBreakdown } from '../../../../../services/tycoon/medicalEngine';
import {
  getTycoonFacilityLevel,
  getTycoonStadiumCapacity,
} from '../../../../../services/tycoon/tierBase';
import { SectionTitle } from '../shared/helpers';
import { getArenaRating, getTrainingAreaLevels, getTrainingCenterRating } from '../../../../../services/tycoon/facilityUpgradeEngine';
import { getTravelDepartmentRating, getTravelServiceQuality } from '../../../../../services/tycoon/travelGameplayEffects';

type FacilityTone = 'amber' | 'violet' | 'emerald' | 'cyan' | 'sky';

interface FacilitySummary {
  title: string;
  icon: React.ReactNode;
  rating: number;
  level: string;
  impact: string;
  tone: FacilityTone;
  onDetails?: () => void;
}

interface FacilityPortfolioMetrics {
  medicalRating: number;
  medicalOwned: number;
  travelAverage: number;
  travelRating: number;
  stadiumLevel: number;
  trainingLevel: number;
  academyLevel: number;
  academyBudget: number;
  stadiumCapacity: number;
  trainingRating: number;
  trainingOwned: number;
  academyRating: number;
  arenaRating: number;
  analyticsRating: number;
  maintenance: number;
  facilityValue: number;
  overallRating: number;
}

const toneClasses: Record<FacilityTone, string> = {
  amber: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  violet: 'border-violet-400/40 bg-violet-400/10 text-violet-300',
  emerald: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  cyan: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300',
  sky: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
};

const FacilityRow: React.FC<FacilitySummary> = ({ title, icon, rating, level, impact, tone, onDetails }) => (
  <button
    type="button"
    onClick={onDetails}
    disabled={!onDetails}
    className="group w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-slate-600 disabled:cursor-default disabled:opacity-70 sm:p-5"
  >
    <div className="flex items-start gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${toneClasses[tone]}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-white">{title}</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">{impact}</div>
          </div>
          <ArrowRight size={17} className="mt-1 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-amber-300" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(8, Math.min(99, rating))}%` }} />
          </div>
          <span className="w-7 text-right text-sm font-black tabular-nums text-emerald-300">{Math.min(99, rating)}</span>
          <span className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${toneClasses[tone]}`}>{level}</span>
        </div>
      </div>
    </div>
  </button>
);

export const FacilitiesSection: React.FC<{
  tycoon: TycoonState;
  fmt: (value: number) => string;
  economyIndex?: number;
  leagueTycoons?: TycoonState[];
  onTravelDetails?: () => void;
  onMedicalDetails?: () => void;
  onAnalyticsDetails?: () => void;
  onArenaDetails?: () => void;
  onTrainingDetails?: () => void;
  onAcademyDetails?: () => void;
}> = ({
  tycoon,
  fmt,
  economyIndex = 1,
  leagueTycoons = [],
  onTravelDetails,
  onMedicalDetails,
  onAnalyticsDetails,
  onArenaDetails,
  onTrainingDetails,
  onAcademyDetails,
}) => {
  const metrics = getFacilityPortfolioMetrics(tycoon, economyIndex);
  const {
    medicalRating,
    medicalOwned,
    travelAverage,
    travelRating,
    trainingRating,
    trainingOwned,
    academyBudget,
    academyRating,
    arenaRating,
    analyticsRating,
    maintenance,
    facilityValue,
    overallRating,
  } = metrics;
  const facilities: FacilitySummary[] = [
    {
      title: 'Training Center',
      icon: <Dumbbell size={23} />,
      rating: trainingRating,
      level: `${trainingOwned}/60`,
      impact: 'Player development and training effectiveness.',
      tone: 'sky',
      onDetails: onTrainingDetails,
    },
    {
      title: 'Medical & Recovery',
      icon: <HeartPulse size={23} />,
      rating: medicalRating,
      level: `${medicalOwned}/60`,
      impact: 'Injury frequency, recovery time, and availability.',
      tone: 'violet',
      onDetails: onMedicalDetails,
    },
    {
      title: 'Youth Academy',
      icon: <Target size={23} />,
      rating: academyRating,
      level: fmt(academyBudget),
      impact: 'Youth intake, development, and the club talent pipeline.',
      tone: 'emerald',
      onDetails: onAcademyDetails,
    },
    {
      title: 'Analytics Lab',
      icon: <TrendingUp size={23} />,
      rating: analyticsRating,
      level: 'Active',
      impact: 'Market coverage and confidence in player reports.',
      tone: 'cyan',
      onDetails: onAnalyticsDetails,
    },
    {
      title: 'Arena & Fan Experience',
      icon: <Landmark size={23} />,
      rating: arenaRating,
      level: `${arenaRating}/99`,
      impact: 'Attendance, matchday revenue, and home atmosphere.',
      tone: 'amber',
      onDetails: onArenaDetails,
    },
    {
      title: 'Travel & Logistics',
      icon: <Plane size={23} />,
      rating: travelRating,
      level: `${travelAverage.toFixed(1)} / 5`,
      impact: 'Road fatigue, morale, and travel operating costs.',
      tone: 'sky',
      onDetails: onTravelDetails,
    },
  ];
  const rankedMetrics = (leagueTycoons.length > 0 ? leagueTycoons : [tycoon])
    .map(teamTycoon => getFacilityPortfolioMetrics(teamTycoon, economyIndex));
  const valueRank = 1 + rankedMetrics.filter(item => item.facilityValue > facilityValue).length;
  const costRank = 1 + rankedMetrics.filter(item => item.maintenance > maintenance).length;

  return (
    <div className="space-y-6">
      <SectionTitle icon={<Building2 size={22} />} title="Facilities" subtitle="Review club operations and adjust the areas that matter most." />

      <div className="grid gap-3 lg:grid-cols-3">
        <FacilityHeaderMetric
          icon={<Landmark size={25} />}
          label="Facility Value"
          value={fmt(facilityValue)}
          rank={`#${valueRank} in league`}
        />
        <FacilityHeaderMetric
          icon={<Shield size={25} />}
          label="Annual Cost"
          value={fmt(maintenance)}
          rank={`#${costRank} in league`}
        />
        <FacilityHeaderMetric
          icon={<Star size={25} />}
          label="Overall Rating"
          value={String(overallRating)}
          rank={overallRating >= 88 ? 'Elite' : overallRating >= 75 ? 'Strong' : 'Developing'}
          progress={overallRating}
          suffix="/ 100"
        />
      </div>

      <div>
        <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Club operations</div>
        <div className="grid gap-3 lg:grid-cols-2">
          {facilities.map(facility => <FacilityRow key={facility.title} {...facility} />)}
        </div>
      </div>
    </div>
  );
};

function getFacilityPortfolioMetrics(tycoon: TycoonState, economyIndex: number): FacilityPortfolioMetrics {
  const medicalRating = getMedicalDepartmentBreakdown(tycoon, economyIndex).quality;
  const medicalOwned = Object.values(getMedicalAreaLevels(tycoon)).reduce((sum, value) => sum + value, 0);
  const travelAverage = getTravelServiceQuality(tycoon);
  const travelRating = getTravelDepartmentRating(tycoon);
  const stadiumLevel = getTycoonFacilityLevel(tycoon.facilities?.stadium);
  const trainingLevel = getTycoonFacilityLevel(tycoon.facilities?.trainingCenter);
  const academyLevel = getTycoonFacilityLevel(tycoon.facilities?.academy);
  const academyBudget = normalizeAcademyBudgetEUR(tycoon.academyBudget, tycoon.tier, economyIndex);
  const academyBudgetStrength = getAcademyBudgetStrength(academyBudget, tycoon.tier, economyIndex);
  const stadiumCapacity = getTycoonStadiumCapacity(tycoon);
  const trainingRating = getTrainingCenterRating(tycoon);
  const trainingOwned = Object.values(getTrainingAreaLevels(tycoon)).reduce((sum, value) => sum + value, 0);
  const academyRating = Math.min(99, 50 + Math.round(academyBudgetStrength * 49));
  const arenaRating = getArenaRating(tycoon.facilities.stadium, stadiumCapacity);
  const analyticsRating = 72;
  const ratings = [trainingRating, medicalRating, academyRating, analyticsRating, arenaRating, travelRating];
  const maintenance = (stadiumLevel + trainingLevel + academyLevel) * 2_600_000 * economyIndex
    + academyBudget
    + (tycoon.medicalBudget ?? 0) * 0.35
    + medicalOwned * 35_000 * economyIndex
    + travelAverage * 450_000 * economyIndex;
  const facilityValue = (stadiumCapacity * 4_500
    + trainingLevel * 16_000_000
    + academyLevel * 9_000_000) * economyIndex
    + (tycoon.medicalBudget ?? 0) * 5
    + medicalOwned * 1_500_000 * economyIndex;
  return {
    medicalRating,
    medicalOwned,
    travelAverage,
    travelRating,
    stadiumLevel,
    trainingLevel,
    academyLevel,
    academyBudget,
    stadiumCapacity,
    trainingRating,
    trainingOwned,
    academyRating,
    arenaRating,
    analyticsRating,
    maintenance,
    facilityValue,
    overallRating: Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length),
  };
}

const FacilityHeaderMetric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  rank: string;
  progress?: number;
  suffix?: string;
}> = ({ icon, label, value, rank, progress, suffix }) => (
  <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-5 sm:p-6">
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-amber-400/45 bg-amber-400/[0.06] text-amber-300">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="mt-2 break-words text-3xl font-black text-white">{value}</div>
      {progress == null ? (
        <div className="mt-2 text-sm font-bold text-blue-400">{rank}</div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-blue-400">{rank}</span>
          <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
          <span className="text-xs font-bold tabular-nums text-slate-300">{progress} {suffix}</span>
        </div>
      )}
    </div>
  </div>
);
