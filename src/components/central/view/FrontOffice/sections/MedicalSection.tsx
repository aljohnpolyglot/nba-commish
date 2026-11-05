import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Lock,
  Save,
  Shield,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { MedicalFacilityAreaKey, TycoonState } from '../../../../../types/tycoon';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { getStaffImageUrl, resolveStaffImageId } from '../../../../../utils/staffPortrait';
import {
  MEDICAL_AREA_SPECS,
  MEDICAL_BUDGET_MAX_EUR,
  MEDICAL_BUDGET_MIN_EUR,
  getImpactStats,
  getMedicalAreaLevels,
  getMedicalDepartmentBreakdown,
} from '../../../../../services/tycoon/medicalEngine';
import { MedicalFacilityAreas } from './MedicalFacilityAreas';

type MedicalTab = 'overview' | 'facilities';

export const MedicalSection: React.FC<{
  tycoon: TycoonState;
  currency: string;
  economyIndex?: number;
  availableCash: number;
  onSave: (budget: number) => void;
  onPurchaseArea: (area: MedicalFacilityAreaKey) => void;
  onDirtyChange?: (dirty: boolean) => void;
  locked?: boolean;
  onViewMedicalReport?: () => void;
}> = ({
  tycoon,
  currency,
  economyIndex = 1,
  availableCash,
  onSave,
  onPurchaseArea,
  onDirtyChange,
  locked = false,
  onViewMedicalReport,
}) => {
  const [tab, setTab] = useState<MedicalTab>('overview');
  const minimum = Math.round(MEDICAL_BUDGET_MIN_EUR * economyIndex);
  const maximum = Math.round(MEDICAL_BUDGET_MAX_EUR * economyIndex);
  const step = Math.max(5_000, Math.round(50_000 * economyIndex / 5_000) * 5_000);
  const savedBudget = tycoon.medicalBudget ?? minimum;
  const [budget, setBudget] = useState(savedBudget);
  const dirty = budget !== savedBudget;
  const breakdown = getMedicalDepartmentBreakdown(tycoon, economyIndex, budget);
  const impacts = getImpactStats(breakdown.quality / 100);
  const levels = getMedicalAreaLevels(tycoon);
  const headPhysio = tycoon.staffMembers?.find(member => member.role === 'Head Physio');
  const physioPortrait = headPhysio ? headPhysio.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(headPhysio)) : null;
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const sortedAreas = useMemo(
    () => [...MEDICAL_AREA_SPECS].sort((left, right) => levels[right.id] - levels[left.id] || left.label.localeCompare(right.label)),
    [levels],
  );

  useEffect(() => setBudget(savedBudget), [savedBudget]);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const qualityLabel = breakdown.quality >= 85
    ? 'Elite'
    : breakdown.quality >= 70
      ? 'Strong'
      : breakdown.quality >= 50
        ? 'Established'
        : 'Developing';

  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-800 scrollbar-hide">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabButton>
        <TabButton active={tab === 'facilities'} onClick={() => setTab('facilities')}>Facility Areas</TabButton>
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.78fr)]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-rose-400/50 bg-rose-400/[0.08] text-rose-300">
                  <Shield size={48} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-white">Medical Department Quality</p>
                      <p className="mt-2 text-5xl font-black tabular-nums text-rose-400">{breakdown.quality} <span className="text-2xl text-slate-400">/ 100</span></p>
                    </div>
                    <span className="rounded-lg border border-rose-400/45 bg-rose-400/[0.07] px-3 py-2 text-sm font-black text-rose-300">{qualityLabel}</span>
                  </div>
                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-300" style={{ width: `${breakdown.quality}%` }} />
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-3">
              <QualityCard icon={<Building2 size={24} />} label="Facilities" value={breakdown.facilityRating} tone="sky" />
              <QualityCard icon={<CalendarPlus size={24} />} label="Annual Plan" value={breakdown.budgetRating} tone="rose" />
              <QualityCard icon={<UserRound size={24} />} label="Department Head" value={breakdown.departmentHeadRating} tone="emerald" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
                <div className="flex items-center gap-3">
                  <CalendarPlus size={23} className="text-rose-300" />
                  <h3 className="text-lg font-black text-white">Annual Medical Plan</h3>
                </div>
                <p className="mt-4 text-3xl font-black tabular-nums text-white">{fmt(budget)} <span className="text-sm font-medium text-slate-400">per season</span></p>
                <div className="mt-5 grid grid-cols-[52px_minmax(0,1fr)_52px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
                  <button type="button" onClick={() => setBudget(Math.max(minimum, budget - step))} disabled={locked || budget <= minimum} aria-label="Decrease medical budget" className="flex h-14 items-center justify-center border-r border-slate-700 text-slate-200 hover:bg-white/5 disabled:text-slate-700">
                    <ChevronLeft size={20} />
                  </button>
                  <div className="flex items-center justify-center px-2 text-center text-lg font-black tabular-nums text-white">{fmt(budget)}</div>
                  <button type="button" onClick={() => setBudget(Math.min(maximum, budget + step))} disabled={locked || budget >= maximum} aria-label="Increase medical budget" className="flex h-14 items-center justify-center border-l border-slate-700 text-slate-200 hover:bg-white/5 disabled:text-slate-700">
                    <ChevronRight size={20} />
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400">
                  {locked ? <><Lock size={15} className="text-amber-300" />Locked until next offseason</> : <><Check size={15} className="text-emerald-300" />Ready to adjust</>}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
                <div className="flex items-center gap-3">
                  <UserRound size={23} className="text-emerald-300" />
                  <h3 className="text-lg font-black text-white">Head Physiologist</h3>
                </div>
                <div className="mt-5 flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-400/50 bg-slate-800">
                    {physioPortrait ? <img src={physioPortrait} alt={headPhysio?.name ?? ''} className="h-full w-full object-cover" /> : <UserRound size={30} className="text-slate-500" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-white">{headPhysio?.name ?? 'Position Vacant'}</p>
                    <p className="mt-1 text-2xl font-black text-emerald-300">{breakdown.departmentHeadRating} <span className="text-sm text-slate-400">/ 100</span></p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">Leads treatment, rehabilitation, and return-to-play work.</p>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <Building2 size={23} className="text-sky-300" />
                    <h3 className="text-lg font-black text-white">Medical Facilities</h3>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{MEDICAL_AREA_SPECS.length} areas · {breakdown.ownedLevels} / {breakdown.maximumLevels} upgrades owned</p>
                </div>
                <button type="button" onClick={() => setTab('facilities')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/45 px-4 py-3 text-xs font-black uppercase tracking-wider text-sky-200 hover:bg-sky-400/10 sm:w-auto">
                  Review Facilities <ArrowRight size={15} />
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <FacilitySnapshot label="Best Area" area={sortedAreas[0]} level={levels[sortedAreas[0].id]} />
                <FacilitySnapshot label="Needs Attention" area={sortedAreas[sortedAreas.length - 1]} level={levels[sortedAreas[sortedAreas.length - 1].id]} />
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Quick Info</p>
              <div className="mt-4 divide-y divide-slate-800">
                <QuickRow icon={<CircleDollarSign size={18} />} label="Medical Budget" value={fmt(budget)} />
                <QuickRow icon={<Shield size={18} />} label="Department Quality" value={`${breakdown.quality} / 100`} />
                <QuickRow icon={<Sparkles size={18} />} label="Owned Upgrades" value={`${breakdown.ownedLevels} / ${breakdown.maximumLevels}`} />
                <QuickRow icon={<UserRound size={18} />} label="Head Physiologist" value={headPhysio?.name ?? 'Vacant'} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Department Effects</p>
              <div className="mt-4 space-y-3">
                <EffectCard label="Recovery Support" value={`${Math.abs(impacts[1].value)}%`} positive />
                <EffectCard label="Minor Injury Frequency" value={`${impacts[0].value}%`} />
                <EffectCard label="Training Tolerance" value={`+${impacts[2].value}%`} positive />
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <MedicalFacilityAreas
          tycoon={tycoon}
          currency={currency}
          economyIndex={economyIndex}
          availableCash={availableCash}
          departmentQuality={breakdown.quality}
          onPurchaseArea={onPurchaseArea}
          onViewOverview={() => setTab('overview')}
        />
      )}

      <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500">The annual plan supports daily care. Permanent upgrades strengthen the department over the long term.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {onViewMedicalReport && (
            <button type="button" onClick={onViewMedicalReport} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/40 px-4 py-3 text-xs font-black uppercase tracking-wider text-rose-200 hover:bg-rose-400/10">
              Medical Report <ArrowRight size={14} />
            </button>
          )}
          <button type="button" onClick={() => onSave(budget)} disabled={locked || !dirty} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-400 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-rose-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
            <Save size={15} /> Save Medical Plan
          </button>
        </div>
      </div>
    </div>
  );
};

const TabButton: React.FC<React.PropsWithChildren<{ active: boolean; onClick: () => void }>> = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick} className={`min-w-36 border-b-2 px-5 py-3 text-sm font-black transition ${active ? 'border-rose-400 bg-rose-400/[0.06] text-rose-300' : 'border-transparent text-slate-400 hover:text-white'}`}>
    {children}
  </button>
);

const QualityCard: React.FC<{ icon: React.ReactNode; label: string; value: number; tone: 'sky' | 'rose' | 'emerald' }> = ({ icon, label, value, tone }) => {
  const colors = tone === 'sky' ? 'text-sky-300 bg-sky-400' : tone === 'rose' ? 'text-rose-300 bg-rose-400' : 'text-emerald-300 bg-emerald-400';
  const [textColor, barColor] = colors.split(' ');
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4">
      <div className="flex items-center gap-3">
        <span className={textColor}>{icon}</span>
        <div><p className="text-sm font-bold text-white">{label}</p><p className={`mt-1 text-2xl font-black ${textColor}`}>{value} <span className="text-sm text-slate-400">/ 100</span></p></div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${value}%` }} /></div>
    </div>
  );
};

const FacilitySnapshot: React.FC<{ label: string; area: { label: string }; level: number }> = ({ label, area, level }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    <div className="mt-2 flex items-end justify-between gap-3">
      <p className="text-sm font-black text-white">{area.label}</p>
      <span className="shrink-0 text-sm font-black text-rose-300">Level {level}/10</span>
    </div>
  </div>
);

const QuickRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
    <span className="text-sky-300">{icon}</span>
    <span className="min-w-0 flex-1 text-sm text-slate-400">{label}</span>
    <strong className="max-w-[50%] truncate text-right text-sm text-white">{value}</strong>
  </div>
);

const EffectCard: React.FC<{ label: string; value: string; positive?: boolean }> = ({ label, value, positive = false }) => (
  <div className={`rounded-xl border p-4 ${positive ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-rose-400/30 bg-rose-400/[0.06]'}`}>
    <p className="text-sm font-bold text-slate-200">{label}</p>
    <p className={`mt-1 text-2xl font-black ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>{value}</p>
  </div>
);
