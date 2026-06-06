import React from 'react';
import { HeartPulse, Info, Plane, Search, SlidersHorizontal, Ticket, Trophy, X, CheckCircle2 } from 'lucide-react';
import type { NBATeam } from '../../types';
import type { TravelPreferences } from '../../types/tycoon';
import { ACADEMY_COST_BY_TIER, defaultAcademyBudgetForTier } from '../../services/tycoon/economyScale';
import { MEDICAL_BUDGET_MIN_EUR } from '../../services/tycoon/medicalEngine';
import { formatCurrencyWithCode } from '../../utils/helpers';

/**
 * FacilityReviewModal — read-only review of the team's operating levers
 * (Ticket, Medical, Scouting, Academy, Travel). Standalone modal: no ledger
 * sidebar, no Budget Review content. User clicks Open Sliders to jump into
 * the editable Front Office page, or Mark Done to close.
 *
 * Pair with BudgetReviewModal — that one is the ledger-only sibling.
 */

export interface FacilityReviewValues {
  ticketPriceMultiplier: number;
  travelPreferences: TravelPreferences;
  medicalBudget: number;
  scoutingInvestment: number;
  academyBudget: number;
}

interface FacilityReviewModalProps {
  open: boolean;
  team: NBATeam | null;
  currency: string;
  onClose: () => void;
  onMarkDone: () => void;
  onOpenSliders?: () => void;
  footerLeft?: React.ReactNode;
}

const TRAVEL_DEFAULTS: Record<string, TravelPreferences> = {
  S: { hotel: 5.0, flight: 5.0, bus: 5.0 },
  A: { hotel: 4.5, flight: 4.5, bus: 4.0 },
  B: { hotel: 4.0, flight: 4.0, bus: 3.5 },
  C: { hotel: 3.5, flight: 3.0, bus: 3.0 },
  D: { hotel: 3.0, flight: 2.5, bus: 2.5 },
};

function readValues(team: NBATeam | null): FacilityReviewValues {
  const tycoon = team?.tycoon;
  const travelDefaults = TRAVEL_DEFAULTS[tycoon?.tier ?? 'D'] ?? TRAVEL_DEFAULTS.D;
  return {
    ticketPriceMultiplier: tycoon?.ticketPriceMultiplier ?? 1,
    travelPreferences: tycoon?.travelPreferences ?? travelDefaults,
    medicalBudget: tycoon?.medicalBudget ?? MEDICAL_BUDGET_MIN_EUR,
    scoutingInvestment: tycoon?.scoutingInvestment ?? 250_000,
    academyBudget: tycoon?.academyBudget ?? defaultAcademyBudgetForTier(tycoon?.tier),
  };
}

export const FacilityReviewModal: React.FC<FacilityReviewModalProps> = ({
  open,
  team,
  currency,
  onClose,
  onMarkDone,
  onOpenSliders,
  footerLeft,
}) => {
  if (!open || !team || !team.tycoon) return null;

  // 3rd arg = isBaseMillions. Tycoon budget values are already full EUR units;
  // default true would scale €3M → €3T.
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const values = readValues(team);
  const academySpend = ACADEMY_COST_BY_TIER[values.academyBudget] ?? 0;
  const travelAvg = (values.travelPreferences.hotel + values.travelPreferences.flight + values.travelPreferences.bus) / 3;

  const cards = [
    { icon: <Ticket size={22} />,     tone: 'sky',     label: 'Ticket Price',         value: `${values.ticketPriceMultiplier.toFixed(2)}x`, sub: 'Matchday revenue lever' },
    { icon: <HeartPulse size={22} />, tone: 'emerald', label: 'Medical Budget',       value: fmt(values.medicalBudget),                     sub: 'Recovery and injury prevention' },
    { icon: <Search size={22} />,     tone: 'violet',  label: 'Scouting & Analytics', value: fmt(values.scoutingInvestment),                sub: 'Market coverage and rating bands' },
    { icon: <Trophy size={22} />,     tone: 'amber',   label: 'Youth Academy',        value: fmt(academySpend),                             sub: `Investment tier ${values.academyBudget}/5` },
    { icon: <Plane size={22} />,      tone: 'cyan',    label: 'Travel Standards',     value: `${travelAvg.toFixed(1)}/5`,                   sub: `Hotel ${values.travelPreferences.hotel.toFixed(1)} / Flight ${values.travelPreferences.flight.toFixed(1)} / Bus ${values.travelPreferences.bus.toFixed(1)}` },
  ] as const;

  const TONE: Record<string, { ring: string; bg: string; icon: string; value: string }> = {
    sky:     { ring: 'ring-sky-400/30',     bg: 'bg-sky-500/10',     icon: 'text-sky-300',     value: 'text-sky-300' },
    emerald: { ring: 'ring-emerald-400/30', bg: 'bg-emerald-500/10', icon: 'text-emerald-300', value: 'text-emerald-300' },
    violet:  { ring: 'ring-violet-400/30',  bg: 'bg-violet-500/10',  icon: 'text-violet-300',  value: 'text-violet-300' },
    amber:   { ring: 'ring-amber-400/30',   bg: 'bg-amber-500/10',   icon: 'text-amber-300',   value: 'text-amber-300' },
    cyan:    { ring: 'ring-cyan-400/30',    bg: 'bg-cyan-500/10',    icon: 'text-cyan-300',    value: 'text-cyan-300' },
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-amber-500/[0.06] px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <span className="inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">Offseason</span>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">Facility Review</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Review the current operating budgets before preseason. Open the sliders if you want to adjust academy, medical, scouting, travel, or arena pricing.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map(card => {
              const tone = TONE[card.tone];
              return (
                <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${tone.bg} ring-1 ${tone.ring} ${tone.icon}`}>
                      {card.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">{card.label}</div>
                      <div className={`mt-0.5 text-xl font-black tabular-nums sm:text-2xl ${tone.value}`}>{card.value}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">{card.sub}</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-4 text-sm text-slate-300">
            <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />
            <span>This is a read-only review of the operating plan already set in Front Office.</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/80 px-4 py-3 sm:px-5">
          <div className="min-h-[40px] flex items-center">{footerLeft}</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {onOpenSliders && (
              <button
                onClick={onOpenSliders}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-emerald-200 hover:bg-emerald-400/10 sm:w-auto"
              >
                <SlidersHorizontal size={14} /> Open Sliders
              </button>
            )}
            <button
              onClick={onMarkDone}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 sm:w-auto"
            >
              <CheckCircle2 size={14} /> Mark Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
