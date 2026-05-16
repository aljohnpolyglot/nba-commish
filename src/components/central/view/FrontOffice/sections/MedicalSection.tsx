import React from 'react';
import { AlertTriangle, Bed, Building2, Droplets, Dumbbell, HeartPulse, Moon, ScanLine, Shield, Smile, Snowflake, Timer, Users } from 'lucide-react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import type { TycoonState } from '../../../../../types/tycoon';
import {
  MEDICAL_BUDGET_MIN_EUR,
  MEDICAL_BUDGET_MAX_EUR,
  getFacilityTier,
  getImpactStats,
  medicalQuality,
  medicalQualityLabel,
  type MedicalFacilityKey,
} from '../../../../../services/tycoon/medicalEngine';
import { ActivityIcon, SectionTitle } from '../shared/helpers';

export const MedicalSection: React.FC<{ tycoon: TycoonState; currency: string; onMedicalBudgetChange: (budget: number) => void; locked?: boolean }> =
  ({ tycoon, currency, onMedicalBudgetChange, locked = false }) => {
  const budget = tycoon.medicalBudget ?? 0;
  const quality = medicalQuality(budget);
  const qualityPct = Math.round(quality * 100);
  const facilities: Array<[MedicalFacilityKey, string]> = [
    ['physiotherapy', 'Physiotherapy'],
    ['recoveryRoom', 'Recovery Room'],
    ['hydrotherapy', 'Hydrotherapy'],
    ['cryotherapy', 'Cryotherapy'],
    ['strengthConditioning', 'Strength & Conditioning'],
    ['sleepNutrition', 'Sleep & Nutrition'],
    ['biomechanics', 'Biomechanics Lab'],
    ['diagnostics', 'Diagnostics'],
  ];
  const facilityIcon: Record<MedicalFacilityKey, React.ReactNode> = {
    physiotherapy: <Users size={18} />,
    recoveryRoom: <Bed size={18} />,
    hydrotherapy: <Droplets size={18} />,
    cryotherapy: <Snowflake size={18} />,
    strengthConditioning: <Dumbbell size={18} />,
    sleepNutrition: <Moon size={18} />,
    biomechanics: <ActivityIcon />,
    diagnostics: <ScanLine size={18} />,
  };
  const impactIcon: Record<string, React.ReactNode> = {
    'Injury Frequency': <Shield size={28} />,
    'Recovery Time': <Timer size={28} />,
    'Training Tolerance': <Dumbbell size={28} />,
    'Player Availability': <HeartPulse size={28} />,
    'Player Morale': <Smile size={28} />,
  };
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <SectionTitle icon={<HeartPulse size={24} />} title="Medical & Recovery" subtitle="Invest in your medical department to reduce injuries and speed up recovery." />
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs font-black uppercase tracking-widest text-slate-500">Annual Budget</div>
          <div className="text-4xl font-black text-white mt-1 tabular-nums">{fmt(budget)}</div>
          <div className="mt-2 inline-flex rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-black text-emerald-300">Active Investment</div>
        </div>
      </div>

      <div className="grid 2xl:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Staff Quality</div>
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <div
                className="shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center"
                style={{ background: `conic-gradient(#74d66f ${qualityPct * 3.6}deg, #1e293b 0deg)` }}
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-950 border border-slate-800 flex flex-col items-center justify-center">
                  <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">{qualityPct}</div>
                  <div className="text-xs sm:text-sm text-slate-500">/100</div>
                </div>
              </div>
              <div className="flex-1 min-w-0 w-full">
                <div className="text-lg sm:text-xl font-black text-emerald-300">{medicalQualityLabel(quality).split(' — ')[0]}</div>
                <p className="text-sm text-slate-400 mt-1">{medicalQualityLabel(quality).split(' — ')[1] ?? 'Medical standards are improving.'}</p>
                <div className="mt-4 h-2.5 rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 relative">
                  <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg" style={{ left: `calc(${qualityPct}% - 8px)` }} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>0</span><span>50</span><span>100</span></div>
              </div>
            </div>
          </div>

          <div className="@container rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Impact on Squad</div>
            <div className="grid grid-cols-2 @[480px]:grid-cols-3 @[640px]:grid-cols-5 gap-3">
              {getImpactStats(quality).map((stat) => (
                <div key={stat.label} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:p-4 text-center">
                  <div className={`${stat.value >= 0 ? 'text-emerald-300' : 'text-rose-300'} flex justify-center`}>{impactIcon[stat.label]}</div>
                  <div className="mt-2 sm:mt-3 text-[10px] sm:text-xs font-black uppercase tracking-wide text-slate-400 leading-tight break-words">{stat.label}</div>
                  <div className={`mt-1 sm:mt-2 text-xl sm:text-3xl font-black ${stat.value >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{stat.value > 0 ? '+' : ''}{stat.value}%</div>
                  <div className="text-[10px] sm:text-xs text-slate-500 mt-1 sm:mt-2 leading-tight">{stat.prose}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5">Annual Investment</div>
            <input
              type="range"
              min={MEDICAL_BUDGET_MIN_EUR}
              max={MEDICAL_BUDGET_MAX_EUR}
              step={50_000}
              value={Math.min(MEDICAL_BUDGET_MAX_EUR, Math.max(MEDICAL_BUDGET_MIN_EUR, budget))}
              onChange={(e) => onMedicalBudgetChange(parseInt(e.target.value, 10))}
              disabled={locked}
              className={`w-full accent-rose-400 ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
            />
            {locked && <div className="mt-3 text-xs font-bold text-amber-300">Locked until next offseason.</div>}
            <div className="grid grid-cols-3 mt-4 text-xs sm:text-sm">
              <div><div className="text-slate-400 truncate">{fmt(MEDICAL_BUDGET_MIN_EUR)}</div><div className="text-[10px] sm:text-xs text-slate-500">Skeleton</div></div>
              <div className="text-center"><div className="text-rose-300 font-black truncate">{fmt(budget)}</div><div className="text-[10px] sm:text-xs text-slate-500">Current</div></div>
              <div className="text-right"><div className="text-slate-400 truncate">{fmt(MEDICAL_BUDGET_MAX_EUR)}</div><div className="text-[10px] sm:text-xs text-slate-500">World Class</div></div>
            </div>
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
              Investment covers medical staff, physios, sport scientists, recovery equipment, diagnostics, and rehabilitation programs.
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><Building2 size={16} /> Medical Facilities</div>
            <div className="divide-y divide-slate-800">
              {facilities.map(([key, label]) => {
                const tier = getFacilityTier(budget, key);
                const color = tier === 'Elite' ? 'text-emerald-300' : tier === 'Advanced' ? 'text-amber-300' : tier === 'Standard' ? 'text-sky-300' : 'text-slate-500';
                return (
                  <div key={key} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-slate-500">{facilityIcon[key]}</span>
                      <span className="text-sm text-slate-300 truncate">{label}</span>
                    </div>
                    <div className={`text-sm font-black ${color}`}>{tier}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-rose-500/30 bg-slate-900/70 p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-rose-300" /> Important Note</div>
            <div className="h-px bg-rose-500/50 mb-5" />
            <p className="text-sm text-slate-300 leading-6">
              Season-ending injuries such as ACL or Achilles ruptures are not affected by investment level. Medical spending changes injury frequency and recovery time for lesser injuries.
            </p>
          </div>

          <button className="w-full h-14 rounded-xl border border-rose-400/50 text-rose-300 font-black uppercase tracking-widest hover:bg-rose-500/10">
            View Medical Report →
          </button>
        </aside>
      </div>
    </div>
  );
};
