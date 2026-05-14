import React from 'react';
import { Heart } from 'lucide-react';
import type { TycoonState } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import {
  medicalQuality,
  medicalQualityLabel,
  medicalImpactSummary,
  MEDICAL_BUDGET_MIN_EUR,
  MEDICAL_BUDGET_MAX_EUR,
} from '../../services/tycoon/medicalEngine';

interface Props {
  tycoon: TycoonState;
  currency: string;
  onMedicalBudgetChange?: (budgetEUR: number) => void;
  /** Hides slider — read-only mode for TeamFinancesViewDetailed. */
  readOnly?: boolean;
}

function qualityColor(q: number): string {
  if (q >= 0.85) return 'text-emerald-300';
  if (q >= 0.60) return 'text-emerald-400';
  if (q >= 0.40) return 'text-amber-300';
  if (q >= 0.20) return 'text-orange-300';
  return 'text-rose-300';
}

function qualityBarColor(q: number): string {
  if (q >= 0.85) return 'bg-emerald-400';
  if (q >= 0.60) return 'bg-emerald-500';
  if (q >= 0.40) return 'bg-amber-400';
  if (q >= 0.20) return 'bg-orange-400';
  return 'bg-rose-400';
}

export const MedicalCard: React.FC<Props> = ({ tycoon, currency, onMedicalBudgetChange, readOnly }) => {
  const budget = tycoon.medicalBudget ?? 0;
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const quality = medicalQuality(budget);
  const qPct = Math.round(quality * 100);
  const label = medicalQualityLabel(quality);
  const impact = medicalImpactSummary(quality);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Heart size={16} className="text-rose-400" />
        <h2 className="font-bold text-base text-slate-100">Medical & Recovery</h2>
      </div>
      <p className="text-xs text-slate-500 mb-5">
        Annual investment in physios, sport-science staff, and recovery facilities.
      </p>

      {/* Quality bar */}
      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Staff Quality</span>
          <span className={`text-sm font-bold ${qualityColor(quality)}`}>{label}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full ${qualityBarColor(quality)} transition-all duration-300`}
            style={{ width: `${qPct}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-400 mt-2">{impact}</p>
      </div>

      {/* Annual budget slider */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Annual Budget</span>
          <span className="text-base font-bold text-white tabular-nums">{fmt(budget)}</span>
        </div>
        {!readOnly && onMedicalBudgetChange && (
          <>
            <input
              type="range"
              min={MEDICAL_BUDGET_MIN_EUR}
              max={MEDICAL_BUDGET_MAX_EUR}
              step={50_000}
              value={Math.min(MEDICAL_BUDGET_MAX_EUR, Math.max(MEDICAL_BUDGET_MIN_EUR, budget))}
              onChange={(e) => onMedicalBudgetChange(parseInt(e.target.value, 10))}
              className="w-full accent-rose-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Skeleton</span>
              <span>Premium</span>
            </div>
          </>
        )}
      </div>

      <p className="text-[10px] text-slate-500 italic mt-4">
        Note: Season-ending injuries (ACL, Achilles, etc.) are not affected by investment level —
        only frequency and recovery time on lesser knocks.
      </p>
    </div>
  );
};
