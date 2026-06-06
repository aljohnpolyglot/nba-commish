import React from 'react';
import { CheckCircle2, HeartPulse, Info, Lock, Plane, Search, SlidersHorizontal, Ticket, Trophy, X } from 'lucide-react';
import type { NBATeam } from '../../types';
import type { TravelPreferences } from '../../types/tycoon';
import { computeAnnualBudget } from '../../services/tycoon/budgetEngine';
import { ACADEMY_COST_BY_TIER, defaultAcademyBudgetForTier } from '../../services/tycoon/economyScale';
import { MEDICAL_BUDGET_MAX_EUR, MEDICAL_BUDGET_MIN_EUR } from '../../services/tycoon/medicalEngine';
import { formatCurrencyWithCode } from '../../utils/helpers';

export interface AnnualBudgetReviewValues {
  ticketPriceMultiplier: number;
  travelPreferences: TravelPreferences;
  medicalBudget: number;
  scoutingInvestment: number;
  academyBudget: number;
}

interface AnnualBudgetReviewModalProps {
  open: boolean;
  team: NBATeam | null;
  players: any[];
  currentYear: number;
  currency: string;
  onClose: () => void;
  onFinalize: (values: AnnualBudgetReviewValues) => void;
  readOnly?: boolean;
  title?: string;
  description?: string;
  finalizeLabel?: string;
  /** Pass null to hide the footer close button entirely — top-right X always remains. */
  closeLabel?: string | null;
  onEdit?: () => void;
  editLabel?: string;
  /** Optional footer-left content (e.g. transfer window counter + sim-day button). */
  footerLeft?: React.ReactNode;
}

const TRAVEL_DEFAULTS: Record<string, TravelPreferences> = {
  S: { hotel: 5.0, flight: 5.0, bus: 5.0 },
  A: { hotel: 4.5, flight: 4.5, bus: 4.0 },
  B: { hotel: 4.0, flight: 4.0, bus: 3.5 },
  C: { hotel: 3.5, flight: 3.0, bus: 3.0 },
  D: { hotel: 3.0, flight: 2.5, bus: 2.5 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function initialValues(team: NBATeam | null): AnnualBudgetReviewValues {
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

export const AnnualBudgetReviewModal: React.FC<AnnualBudgetReviewModalProps> = ({
  open,
  team,
  players,
  currentYear,
  currency,
  onClose,
  onFinalize,
  readOnly = false,
  title = 'Annual Budget Review',
  description,
  finalizeLabel = 'Finalize',
  closeLabel = null,
  onEdit,
  editLabel = 'Open Sliders',
  footerLeft,
}) => {
  const [values, setValues] = React.useState<AnnualBudgetReviewValues>(() => initialValues(team));

  React.useEffect(() => {
    if (open) setValues(initialValues(team));
  }, [open, team]);

  if (!open || !team?.tycoon) return null;

  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const draftTeam = {
    ...team,
    tycoon: {
      ...team.tycoon,
      ticketPriceMultiplier: values.ticketPriceMultiplier,
      travelPreferences: values.travelPreferences,
      medicalBudget: values.medicalBudget,
      scoutingInvestment: values.scoutingInvestment,
      academyBudget: values.academyBudget,
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
  const previousLedger = team.tycoon.ledgerHistory?.[team.tycoon.ledgerHistory.length - 1] ?? null;
  const totalRevenue = Object.values(ledger.revenue).reduce((sum, value) => sum + value, 0);
  const totalExpenses = Object.values(ledger.expenses).reduce((sum, value) => sum + (value ?? 0), 0);
  const healthy = ledger.cashOnHandEnd >= 0;

  const setTravel = (key: keyof TravelPreferences, value: number) => {
    setValues(prev => ({
      ...prev,
      travelPreferences: {
        ...prev.travelPreferences,
        [key]: value,
      },
    }));
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-amber-500/[0.06] px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <span className="inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">Offseason</span>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{description ?? `Season ${currentYear}-${String(currentYear + 1).slice(-2)} operating plan`}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cash</div>
              <div className="text-xl font-black text-amber-200 tabular-nums">{fmt(team.tycoon.cashOnHand ?? 0)}</div>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="grid flex-1 gap-0 overflow-y-auto lg:grid-cols-[1fr_390px]">
          <div className="space-y-4 p-4 sm:p-6">
            {readOnly ? (
              <BudgetSummary values={values} fmt={fmt} />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <BudgetSlider
                    icon={<Ticket size={18} />}
                    label="Ticket Price"
                    value={`${values.ticketPriceMultiplier.toFixed(2)}x`}
                    min={0.5}
                    max={2}
                    step={0.05}
                    numericValue={values.ticketPriceMultiplier}
                    onChange={value => setValues(prev => ({ ...prev, ticketPriceMultiplier: clamp(value, 0.5, 2) }))}
                    helper="Matchday revenue reacts immediately in the ledger."
                  />
                  <BudgetSlider
                    icon={<HeartPulse size={18} />}
                    label="Medical Budget"
                    value={fmt(values.medicalBudget)}
                    min={MEDICAL_BUDGET_MIN_EUR}
                    max={MEDICAL_BUDGET_MAX_EUR}
                    step={50_000}
                    numericValue={values.medicalBudget}
                    onChange={value => setValues(prev => ({ ...prev, medicalBudget: clamp(value, MEDICAL_BUDGET_MIN_EUR, MEDICAL_BUDGET_MAX_EUR) }))}
                    helper="Covers recovery staff, diagnostics, rehab, and prevention."
                  />
                  <BudgetSlider
                    icon={<Search size={18} />}
                    label="Scouting & Analytics"
                    value={fmt(values.scoutingInvestment)}
                    min={50_000}
                    max={2_500_000}
                    step={25_000}
                    numericValue={values.scoutingInvestment}
                    onChange={value => setValues(prev => ({ ...prev, scoutingInvestment: clamp(value, 50_000, 2_500_000) }))}
                    helper="Narrows ratings uncertainty and improves market coverage."
                  />
                  <BudgetSlider
                    icon={<Trophy size={18} />}
                    label="Youth Academy"
                    value={fmt(ACADEMY_COST_BY_TIER[values.academyBudget] ?? 0)}
                    min={0}
                    max={5}
                    step={1}
                    numericValue={values.academyBudget}
                    onChange={value => setValues(prev => ({ ...prev, academyBudget: Math.round(clamp(value, 0, 5)) }))}
                    helper={`Tier ${values.academyBudget}/5 annual youth pipeline spend.`}
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                  <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                    <Plane size={16} className="text-amber-300" /> Travel Standards
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <BudgetSlider
                      label="Hotel"
                      value={`${values.travelPreferences.hotel.toFixed(1)} stars`}
                      min={0.5}
                      max={5}
                      step={0.5}
                      numericValue={values.travelPreferences.hotel}
                      onChange={value => setTravel('hotel', value)}
                    />
                    <BudgetSlider
                      label="Flight"
                      value={`${values.travelPreferences.flight.toFixed(1)} stars`}
                      min={0.5}
                      max={5}
                      step={0.5}
                      numericValue={values.travelPreferences.flight}
                      onChange={value => setTravel('flight', value)}
                    />
                    <BudgetSlider
                      label="Bus"
                      value={`${values.travelPreferences.bus.toFixed(1)} stars`}
                      min={0.5}
                      max={5}
                      step={0.5}
                      numericValue={values.travelPreferences.bus}
                      onChange={value => setTravel('bus', value)}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-4 text-sm text-slate-300">
              <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />
              <span>
                {readOnly
                  ? 'This is a final read-only review of the operating plan already set in Front Office.'
                  : 'Finalizing locks these operating levers until next offseason. Staff signings, transfers, trades, and roster moves stay separate.'}
              </span>
            </div>
          </div>

          <aside className="border-t border-slate-800 bg-slate-900/50 p-5 lg:border-l lg:border-t-0">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Projected Ledger</div>
              <div className={`mt-4 rounded-xl border p-4 ${healthy ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-rose-400/30 bg-rose-400/10'}`}>
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">End-of-Season Cash</div>
                <div className={`mt-1 text-3xl font-black tabular-nums ${healthy ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(ledger.cashOnHandEnd)}</div>
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
                <MetricRow label="Board Confidence" value={`${team.tycoon.boardConfidence ?? 60}/100`} tone="amber" />
              </div>
            </div>
          </aside>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/80 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-h-[40px] flex items-center">
            {footerLeft}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {onEdit && (
              <button
                onClick={onEdit}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-emerald-200 hover:bg-emerald-400/10 sm:w-auto"
              >
                <SlidersHorizontal size={14} /> {editLabel}
              </button>
            )}
            {closeLabel && (
              <button
                onClick={onClose}
                className="w-full rounded-xl border border-slate-700 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-200 hover:bg-white/10 sm:w-auto"
              >
                {closeLabel}
              </button>
            )}
            <button
              onClick={() => onFinalize(values)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 sm:w-auto"
            >
              {readOnly ? <CheckCircle2 size={14} /> : <Lock size={14} />} {finalizeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const BudgetSlider: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  numericValue: number;
  onChange: (value: number) => void;
  helper?: string;
}> = ({ icon, label, value, min, max, step, numericValue, onChange, helper }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="text-amber-300">{icon}</span>}
        <div className="min-w-0 text-xs font-black uppercase tracking-widest text-slate-400">{label}</div>
      </div>
      <div className="shrink-0 text-sm font-black text-white tabular-nums">{value}</div>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={numericValue}
      onChange={event => onChange(Number(event.target.value))}
      className="w-full accent-amber-400"
    />
    {helper && <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>}
  </div>
);

type SummaryTone = 'sky' | 'emerald' | 'violet' | 'amber' | 'cyan';

const TONE_STYLES: Record<SummaryTone, { ring: string; bg: string; icon: string; value: string }> = {
  sky:     { ring: 'ring-sky-400/30',     bg: 'bg-sky-500/10',     icon: 'text-sky-300',     value: 'text-sky-200' },
  emerald: { ring: 'ring-emerald-400/30', bg: 'bg-emerald-500/10', icon: 'text-emerald-300', value: 'text-emerald-300' },
  violet:  { ring: 'ring-violet-400/30',  bg: 'bg-violet-500/10',  icon: 'text-violet-300',  value: 'text-violet-300' },
  amber:   { ring: 'ring-amber-400/30',   bg: 'bg-amber-500/10',   icon: 'text-amber-300',   value: 'text-amber-300' },
  cyan:    { ring: 'ring-cyan-400/30',    bg: 'bg-cyan-500/10',    icon: 'text-cyan-300',    value: 'text-cyan-300' },
};

const BudgetSummary: React.FC<{
  values: AnnualBudgetReviewValues;
  fmt: (value: number) => string;
}> = ({ values, fmt }) => {
  const academySpend = ACADEMY_COST_BY_TIER[values.academyBudget] ?? 0;
  const academyLabel = values.academyBudget >= 5 ? 'World Class'
    : values.academyBudget >= 4 ? 'Elite'
    : values.academyBudget >= 3 ? 'Elevated'
    : values.academyBudget >= 2 ? 'Standard'
    : values.academyBudget >= 1 ? 'Minimal'
    : 'None';
  const travelAvg = (values.travelPreferences.hotel + values.travelPreferences.flight + values.travelPreferences.bus) / 3;

  const cards: Array<{
    icon: React.ReactNode;
    tone: SummaryTone;
    label: string;
    value: React.ReactNode;
    sub: string;
  }> = [
    {
      icon: <Ticket size={22} />, tone: 'sky', label: 'Ticket Price',
      value: `${values.ticketPriceMultiplier.toFixed(2)}x`,
      sub: 'Matchday revenue lever',
    },
    {
      icon: <HeartPulse size={22} />, tone: 'emerald', label: 'Medical Budget',
      value: fmt(values.medicalBudget),
      sub: 'Recovery and injury prevention',
    },
    {
      icon: <Search size={22} />, tone: 'violet', label: 'Scouting & Analytics',
      value: fmt(values.scoutingInvestment),
      sub: 'Market coverage and rating bands',
    },
    {
      icon: <Trophy size={22} />, tone: 'amber', label: 'Youth Academy',
      value: fmt(academySpend),
      sub: `Investment tier ${values.academyBudget}/5`,
    },
    {
      icon: <Plane size={22} />, tone: 'cyan', label: 'Travel Standards',
      value: `${travelAvg.toFixed(1)}/5`,
      sub: `Hotel ${values.travelPreferences.hotel.toFixed(1)} / Flight ${values.travelPreferences.flight.toFixed(1)} / Bus ${values.travelPreferences.bus.toFixed(1)}`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(card => {
        const tone = TONE_STYLES[card.tone];
        return (
          <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${tone.bg} ring-1 ${tone.ring} ${tone.icon}`}>
                {card.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">{card.label}</div>
                <div className={`mt-0.5 text-2xl font-black tabular-nums ${tone.value}`}>{card.value}</div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{card.sub}</p>
          </div>
        );
      })}
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
