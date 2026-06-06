import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { NBATeam } from '../../types';
import type { TravelPreferences } from '../../types/tycoon';
import { computeAnnualBudget } from '../../services/tycoon/budgetEngine';
import { defaultAcademyBudgetForTier } from '../../services/tycoon/economyScale';
import { MEDICAL_BUDGET_MIN_EUR } from '../../services/tycoon/medicalEngine';
import { formatCurrencyWithCode } from '../../utils/helpers';

/**
 * BudgetReviewModal — final read-only ledger view. No facility cards, no
 * sliders, no Open Sliders button. Single Mark Done CTA + top-right X.
 *
 * Pair with FacilityReviewModal — that one is the facility-cards sibling.
 */

interface BudgetReviewModalProps {
  open: boolean;
  team: NBATeam | null;
  players: any[];
  currentYear: number;
  currency: string;
  onClose: () => void;
  onMarkDone: () => void;
  footerLeft?: React.ReactNode;
}

const TRAVEL_DEFAULTS: Record<string, TravelPreferences> = {
  S: { hotel: 5.0, flight: 5.0, bus: 5.0 },
  A: { hotel: 4.5, flight: 4.5, bus: 4.0 },
  B: { hotel: 4.0, flight: 4.0, bus: 3.5 },
  C: { hotel: 3.5, flight: 3.0, bus: 3.0 },
  D: { hotel: 3.0, flight: 2.5, bus: 2.5 },
};

export const BudgetReviewModal: React.FC<BudgetReviewModalProps> = ({
  open,
  team,
  players,
  currentYear,
  currency,
  onClose,
  onMarkDone,
  footerLeft,
}) => {
  if (!open || !team || !team.tycoon) return null;
  // 3rd arg = isBaseMillions. Ledger numbers are already in full EUR units —
  // omitting this flag defaults to true and scales €6.49M → €6.49T.
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const tycoon = team.tycoon;
  const travelDefaults = TRAVEL_DEFAULTS[tycoon.tier ?? 'D'] ?? TRAVEL_DEFAULTS.D;
  const draftTeam = {
    ...team,
    tycoon: {
      ...tycoon,
      ticketPriceMultiplier: tycoon.ticketPriceMultiplier ?? 1,
      travelPreferences: tycoon.travelPreferences ?? travelDefaults,
      medicalBudget: tycoon.medicalBudget ?? MEDICAL_BUDGET_MIN_EUR,
      scoutingInvestment: tycoon.scoutingInvestment ?? 250_000,
      academyBudget: tycoon.academyBudget ?? defaultAcademyBudgetForTier(tycoon.tier),
    },
  } as NBATeam;
  const ledger = computeAnnualBudget(draftTeam, {
    year: currentYear,
    endesaFinishPosition: (team as any).lastEndesaFinish ?? 9,
    euroleagueStage: (team as any).lastEuroleagueStage ?? 'none',
    euroleagueAwayGames: (team as any).lastEuroAwayGames ?? 0,
    endesaPrizeEUR: 0,
    euroleaguePrizeEUR: 0,
  }, players);
  const totalRevenue = Object.values(ledger.revenue).reduce((sum, value) => sum + value, 0);
  const totalExpenses = Object.values(ledger.expenses).reduce((sum, value) => sum + (value ?? 0), 0);
  const previousLedger = tycoon.ledgerHistory?.[tycoon.ledgerHistory.length - 1] ?? null;
  const healthy = ledger.cashOnHandEnd >= 0;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-amber-500/[0.06] px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <span className="inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">Offseason</span>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">Budget Review</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Final confirmation of the projected ledger for season {currentYear}-{String(currentYear + 1).slice(-2)}.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Projected Ledger</div>
            <div className={`mt-4 rounded-xl border p-4 ${healthy ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-rose-400/30 bg-rose-400/10'}`}>
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">End-of-Season Cash</div>
              <div className={`mt-1 text-2xl font-black tabular-nums sm:text-3xl ${healthy ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(ledger.cashOnHandEnd)}</div>
              <div className="mt-1 text-xs text-slate-400">{healthy ? 'Healthy projection' : 'Negative cash projection'}</div>
            </div>

            <LedgerBlock
              title="Revenue"
              rows={[
                ['Matchday', ledger.revenue.matchday],
                ['Sponsorships', ledger.revenue.sponsorship],
                ['TV / Prize', ledger.revenue.tv + ledger.revenue.prize],
              ]}
              total={totalRevenue}
              fmt={fmt}
              tone="emerald"
            />
            <LedgerBlock
              title="Expenses"
              rows={[
                ['Player Wages', ledger.expenses.wages],
                ['Staff Payroll', ledger.expenses.staff],
                ['Facility Ops', ledger.expenses.facility],
                ['Travel', ledger.expenses.travel],
                ['Medical', ledger.expenses.medical ?? 0],
                ['Scouting', ledger.expenses.scouting ?? 0],
                ['Academy', ledger.expenses.academy ?? 0],
              ]}
              total={totalExpenses}
              fmt={fmt}
              tone="rose"
            />

            <div className="mt-5 space-y-2 border-t border-slate-800 pt-4 text-sm">
              <MetricRow label="Projected Profit" value={fmt(ledger.profit)} tone={ledger.profit >= 0 ? 'emerald' : 'rose'} />
              <MetricRow label="Last Year's Profit" value={previousLedger ? fmt(previousLedger.profit) : 'No prior ledger'} tone={previousLedger && previousLedger.profit < 0 ? 'rose' : 'slate'} />
              <MetricRow label="Board Confidence" value={`${tycoon.boardConfidence ?? 60}/100`} tone="amber" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-h-[40px] flex items-center">{footerLeft}</div>
          <button
            onClick={onMarkDone}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 sm:w-auto"
          >
            <CheckCircle2 size={14} /> Mark Done
          </button>
        </div>
      </div>
    </div>
  );
};

const LedgerBlock: React.FC<{
  title: string;
  rows: Array<[string, number]>;
  total: number;
  fmt: (value: number) => string;
  tone: 'emerald' | 'rose';
}> = ({ title, rows, total, fmt, tone }) => {
  const color = tone === 'emerald' ? 'text-emerald-300' : 'text-rose-300';
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-widest text-slate-500">{title}</div>
        <div className={`text-sm font-black tabular-nums ${color}`}>{fmt(total)}</div>
      </div>
      <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/70">
        {rows.filter(([, value]) => value > 0).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="text-slate-400">{label}</span>
            <span className="font-black text-slate-200 tabular-nums">{fmt(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MetricRow: React.FC<{ label: string; value: string; tone: 'emerald' | 'rose' | 'amber' | 'slate' }> = ({ label, value, tone }) => {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : tone === 'amber' ? 'text-amber-300' : 'text-slate-300';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-black tabular-nums ${color}`}>{value}</span>
    </div>
  );
};
