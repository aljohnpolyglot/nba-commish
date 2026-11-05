import React, { useState } from 'react';
import {
  Activity,
  BedDouble,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  HeartPulse,
  ShieldCheck,
  ShieldPlus,
  ShoppingCart,
  Star,
  Waves,
  X,
} from 'lucide-react';
import type { MedicalFacilityAreaKey, TycoonState } from '../../../../../types/tycoon';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import {
  MEDICAL_AREA_SPECS,
  getMedicalAreaLevels,
  getMedicalUpgradeCost,
  type MedicalAreaSpec,
} from '../../../../../services/tycoon/medicalEngine';

const areaIcons: Record<MedicalFacilityAreaKey, React.ReactNode> = {
  clinic: <ShieldPlus size={22} />,
  recovery: <BedDouble size={22} />,
  physicalTherapy: <Activity size={22} />,
  diagnostics: <FlaskConical size={22} />,
  hydrotherapy: <Waves size={22} />,
  loadManagement: <HeartPulse size={22} />,
};

export const MedicalFacilityAreas: React.FC<{
  tycoon: TycoonState;
  currency: string;
  economyIndex: number;
  availableCash: number;
  departmentQuality: number;
  onPurchaseArea: (area: MedicalFacilityAreaKey) => void;
  onViewOverview: () => void;
}> = ({ tycoon, currency, economyIndex, availableCash, departmentQuality, onPurchaseArea, onViewOverview }) => {
  const [selected, setSelected] = useState<MedicalAreaSpec | null>(null);
  const levels = getMedicalAreaLevels(tycoon);
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const orderedBest = [...MEDICAL_AREA_SPECS].sort((left, right) => levels[right.id] - levels[left.id]);
  const recommended = [...MEDICAL_AREA_SPECS].sort((left, right) => (
    levels[left.id] - levels[right.id]
    || Number(right.id === 'recovery') - Number(left.id === 'recovery')
  ))[0];
  const best = orderedBest[0];
  const ownedLevels = Object.values(levels).reduce((sum, level) => sum + level, 0);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MEDICAL_AREA_SPECS.map(area => {
            const level = levels[area.id];
            return (
              <button
                type="button"
                key={area.id}
                onClick={() => setSelected(area)}
                className="group rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-4 text-left transition hover:border-rose-400/55 hover:bg-rose-400/[0.04] sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-rose-400/45 bg-rose-400/[0.08] text-rose-300">
                    {areaIcons[area.id]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-black text-white">{area.label}</h3>
                      <ChevronRight size={17} className="shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-rose-300" />
                    </div>
                    <div className="mt-1 inline-flex rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-300">
                      Level {level} / 10
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-300" style={{ width: `${level * 10}%` }} />
                  </div>
                  <span className="text-xs font-black tabular-nums text-rose-300">{level}/10</span>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-400">{area.description}</p>
              </button>
            );
          })}
        </div>

        <aside className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Department Summary</p>
          <div className="mt-5 space-y-5">
            <SummaryRow icon={<ShieldCheck size={19} />} label="Department Quality" value={`${departmentQuality} / 100`} />
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-sky-400" style={{ width: `${departmentQuality}%` }} />
            </div>
            <SummaryRow icon={<CheckCircle2 size={19} />} label="Owned Upgrades" value={`${ownedLevels} / 60`} />
            <SummaryRow icon={<Star size={19} />} label="Best Area" value={`${best.label} · ${levels[best.id]}/10`} />
            <SummaryRow icon={<HeartPulse size={19} />} label="Needs Attention" value={`${recommended.label} · ${levels[recommended.id]}/10`} />
          </div>
          <button type="button" onClick={onViewOverview} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/45 px-4 py-3 text-xs font-black uppercase tracking-wider text-sky-200 hover:bg-sky-400/10">
            View Budget & Effects <ChevronRight size={15} />
          </button>
        </aside>
      </div>

      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-amber-400/45 bg-amber-400/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-400/45 bg-amber-400/[0.08] text-amber-300">
            <Star size={22} />
          </div>
          <div>
            <p className="text-sm font-black text-amber-300">Recommended review: {recommended.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">This area is currently at Level {levels[recommended.id]}/10. Upgrade it to strengthen the department.</p>
          </div>
        </div>
        <button type="button" onClick={() => setSelected(recommended)} className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-400/55 px-5 py-3 text-xs font-black uppercase tracking-wider text-amber-200 hover:bg-amber-400/10 sm:w-auto">
          Review Area <ChevronRight size={15} />
        </button>
      </div>

      {selected && (
        <MedicalAreaPurchaseModal
          area={selected}
          level={levels[selected.id]}
          currency={currency}
          economyIndex={economyIndex}
          availableCash={availableCash}
          onPurchase={() => onPurchaseArea(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
};

const SummaryRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 border-b border-slate-800 pb-5 last:border-0 last:pb-0">
    <span className="shrink-0 text-sky-300">{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  </div>
);

const MedicalAreaPurchaseModal: React.FC<{
  area: MedicalAreaSpec;
  level: number;
  currency: string;
  economyIndex: number;
  availableCash: number;
  onPurchase: () => void;
  onClose: () => void;
}> = ({ area, level, currency, economyIndex, availableCash, onPurchase, onClose }) => {
  const cost = getMedicalUpgradeCost(area, level, economyIndex);
  const maximum = level >= 10;
  const canAfford = !maximum && availableCash >= cost;
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-600 bg-[#071225] shadow-2xl sm:max-w-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5 sm:p-7">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-rose-400/55 bg-rose-400/[0.08] text-rose-300">
              {areaIcons[area.id]}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-300">Owned Medical Area</p>
              <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">{area.label}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{area.description}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={`Close ${area.label}`} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4 p-5 sm:p-7">
          <div className="rounded-2xl border border-rose-400/35 bg-rose-400/[0.06] p-4 text-sm font-bold text-rose-200">
            {area.focus}
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Owned Level</p>
                <p className="mt-1 text-xl font-black text-white">{level} / 10</p>
              </div>
              <span className="text-sm font-black text-rose-300">{maximum ? 'Complete' : `${10 - level} levels remaining`}</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-300 transition-all" style={{ width: `${level * 10}%` }} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Key Benefits</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {area.benefits.map(benefit => (
                <div key={benefit} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/55 p-3 text-xs font-bold text-slate-200">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-300" />
                  {benefit}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400">Next upgrade</p>
                <p className="mt-1 text-lg font-black text-white">{maximum ? 'Maximum level' : `Level ${level + 1}`}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-slate-400">One-time price</p>
                <p className="mt-1 text-lg font-black text-amber-300">{maximum ? '—' : fmt(cost)}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-700 pt-4 text-sm">
              <span className="text-slate-400">Available club cash</span>
              <strong className={canAfford || maximum ? 'text-white' : 'text-rose-300'}>{fmt(availableCash)}</strong>
            </div>
          </div>

          <button
            type="button"
            disabled={!canAfford}
            onClick={onPurchase}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 py-4 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            <ShoppingCart size={19} />
            {maximum ? 'Maximum Level Reached' : canAfford ? `Purchase Level ${level + 1}` : 'Insufficient Club Cash'}
          </button>
          <button type="button" onClick={onClose} className="w-full rounded-xl border border-slate-700 px-5 py-3 text-sm font-black text-slate-200 hover:bg-slate-800">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
