import React from 'react';
import { X, CheckCircle2, Star, ArrowRight, Sparkles } from 'lucide-react';
import { SponsorLogo } from './SponsorLogo';
import { getBrandMeta } from '../../data/sponsorCatalogFetcher';
import type { SponsorshipSlot, SponsorIndustry } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import {
  SLOT_PLACEMENT_LABEL, SLOT_VISIBILITY, INDUSTRY_PROFILE_LABEL,
  describeBrand, getSponsorPerks, getClubBenefits, breakdownAnnualValue,
  STRATEGIC_FIT_GRADES, type StrategicFitGrade, type ExclusivityType,
  NEGOTIATION_WINDOW_DAYS,
} from '../../services/tycoon/sponsorOfferConstants';

export interface SponsorOfferModalData {
  brand: string;
  industry: SponsorIndustry | 'generic';
  archetype?: 'premium' | 'gambling' | 'tech' | 'local' | 'generic';
  slot: SponsorshipSlot;
  dealType?: 'sponsorship' | 'endorsement';
  oneTime?: boolean;
  /** Localised plain-English headline shown beneath the brand name. Overrides generic describeBrand(). */
  pitch?: string;
  /** Used as the "Category" detail row and the deal-type sub-label. */
  dealTypeLabel?: string;
  /** Brand-specific list of what the brand gets — overrides slot-based perks. */
  brandGets?: string[];
  /** Brand-specific list of what the club gets — overrides industry-based benefits. */
  clubGets?: string[];
  valuePerYear: number;
  contractYears: number;
  contractStartSeason: string;   // e.g. "2026/27"
  contractEndSeason: string;     // e.g. "2029/30"
  exclusivity: ExclusivityType;
  exclusivityScope: string;      // e.g. "Telecommunications"
  interestLabel: 'Very Interested' | 'Interested' | 'Neutral' | 'Not Interested';
  interestSub: string;
  strategicFit: StrategicFitGrade;
  negotiationDaysLeft: number;
  expiresOn: string;             // e.g. "Jun 01, 2026"
  currentSponsorRevenue: number;
  // Optional jersey preview slot — user is wiring real jersey rendering separately.
  jerseyPreview?: React.ReactNode;
  recentPartnerships?: Array<{ name: string; role: string; logoDomain?: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: SponsorOfferModalData | null;
  onDismiss?: () => void;
  onStartNegotiation?: () => void;
}

export const SponsorOfferModal: React.FC<Props> = ({ open, onClose, data, onDismiss, onStartNegotiation }) => {
  if (!open || !data) return null;

  const isEndorsement = data.dealType === 'endorsement';
  const isOneTime = data.oneTime === true;
  const eyebrowLabel = isEndorsement ? 'Endorsement Offer' : 'Sponsor Offer';
  const dealTypeLabel = isOneTime ? 'One-Time' : (isEndorsement ? 'Endorsement' : 'Sponsorship');
  const dealTypeSub = data.dealTypeLabel ?? (isEndorsement ? 'Player Endorsement' : SLOT_PLACEMENT_LABEL[data.slot]);
  const detailsPanelTitle = isEndorsement ? 'Endorsement Details' : 'Sponsorship Details';
  const placementLabel = isEndorsement ? (data.dealTypeLabel ?? 'Community Activation') : SLOT_PLACEMENT_LABEL[data.slot];
  const visibilityLabel = isEndorsement ? 'Player appearances, social & community' : SLOT_VISIBILITY[data.slot];
  const categoryLabel = data.dealTypeLabel ?? INDUSTRY_PROFILE_LABEL[data.industry];
  const perks = data.brandGets ?? getSponsorPerks(data.slot);
  const clubBenefits = data.clubGets ?? getClubBenefits(data.industry);
  const yearsLabel = `${data.contractYears} Year${data.contractYears === 1 ? '' : 's'}`;

  const currency = 'EUR'; // wired through later
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const fmtCompact = (v: number) => formatCurrencyWithCode(v, currency, false);

  const totalValue = isOneTime ? data.valuePerYear : data.valuePerYear * data.contractYears;
  const breakdown = breakdownAnnualValue(data.valuePerYear, data.archetype);
  const fit = STRATEGIC_FIT_GRADES[data.strategicFit];
  const projectedRevenue = data.currentSponsorRevenue + data.valuePerYear;
  const revenueDelta = data.valuePerYear;
  const revenuePctDelta = data.currentSponsorRevenue > 0 ? (revenueDelta / data.currentSponsorRevenue) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-[1280px] w-full max-h-[94vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-6 px-7 py-6 border-b border-slate-800">
          <div className="shrink-0">
            <SponsorLogo
              name={data.brand}
              meta={getBrandMeta('spain', data.brand)}
              industry={data.industry}
              size={96}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-violet-300">{eyebrowLabel}</div>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-black text-white">{data.brand}</h2>
              <InterestPill label={data.interestLabel} />
            </div>
            <div className="text-sm text-slate-300 mt-1">
              {data.dealTypeLabel ?? INDUSTRY_PROFILE_LABEL[data.industry]} • <span className="text-slate-400">{data.exclusivityScope}</span>
            </div>
            <p className="text-sm text-slate-400 mt-3 max-w-[640px]">{data.pitch ?? describeBrand(data.industry)}</p>
          </div>
          <div className="shrink-0 flex items-start gap-4">
            <InterestLevelCard label={data.interestLabel} sub={data.interestSub} />
            <button onClick={onClose} aria-label="Close" className="mt-1"><X size={22} className="text-slate-400 hover:text-white" /></button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-6 gap-3 px-7 py-4 border-b border-slate-800">
          <KpiCell label={isOneTime ? 'Payout' : 'Value per Year'} value={fmt(data.valuePerYear)} sub={isOneTime ? 'Immediate' : 'Fixed Fee'} tint="text-white" />
          <KpiCell label={isOneTime ? 'Duration' : 'Contract Length'} value={isOneTime ? 'One-Time' : yearsLabel} sub={isOneTime ? 'Paid on signing' : `${data.contractStartSeason} – ${data.contractEndSeason}`} tint="text-white" />
          <KpiCell label="Total Contract Value" value={fmt(totalValue)} sub={isOneTime ? 'One-Time Payout' : 'Guaranteed'} tint="text-emerald-300" />
          <KpiCell label="Deal Type" value={dealTypeLabel} sub={dealTypeSub} tint="text-white" />
          <KpiCell label="Exclusivity" value={data.exclusivity} sub={data.exclusivityScope} tint="text-white" />
          <KpiCell
            label="Negotiation Window"
            value={`${data.negotiationDaysLeft} Days Left`}
            sub={`Expires ${data.expiresOn}`}
            tint={data.negotiationDaysLeft <= 5 ? 'text-amber-300' : 'text-amber-300'}
          />
        </div>

        {/* Overview content */}
        <div className="px-7 py-6 space-y-5">
          {/* Row 1: Sponsorship Details / Deal Breakdown / What X Gets */}
          <div className="grid lg:grid-cols-3 gap-5">
                {/* Sponsorship / Endorsement Details */}
                <Panel title={detailsPanelTitle}>
                  <div className="grid grid-cols-[140px_1fr] gap-4 items-start">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex items-center justify-center">
                      {isEndorsement ? (
                        <div className="w-full aspect-[3/4] rounded-lg border border-slate-700 bg-gradient-to-b from-violet-500/15 to-slate-900/40 flex flex-col items-center justify-center gap-2 p-2">
                          <SponsorLogo name={data.brand} meta={getBrandMeta('spain', data.brand)} industry={data.industry} size={56} />
                          <div className="text-[10px] font-black uppercase tracking-widest text-violet-300 text-center">Endorsement</div>
                        </div>
                      ) : (
                        data.jerseyPreview ?? (
                          <div className="w-full aspect-[3/4] rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-[10px] text-slate-600 text-center px-2">
                            Jersey Preview
                          </div>
                        )
                      )}
                    </div>
                    <dl className="text-sm">
                      <DetailRow k="Placement" v={placementLabel} />
                      <DetailRow k="Visibility" v={visibilityLabel} />
                      <DetailRow k="Territory" v="Local / Regional" />
                      <DetailRow k="Category" v={categoryLabel} />
                      {isOneTime ? (
                        <>
                          <DetailRow k="Activation" v="One-Time Event" />
                          <DetailRow k="Payout" v="Immediate on signing" />
                        </>
                      ) : (
                        <>
                          <DetailRow k="Contract Start" v={`${data.contractStartSeason} Season`} />
                          <DetailRow k="Contract End" v={`${data.contractEndSeason} Season`} />
                          <DetailRow k="Renewal Option" v="1 Year" />
                          <DetailRow k="Termination Notice" v="12 Months" />
                        </>
                      )}
                    </dl>
                  </div>
                </Panel>

                {/* Deal Breakdown */}
                <Panel title={isOneTime ? 'Deal Breakdown' : 'Deal Breakdown (Per Year)'}>
                  {isOneTime ? (
                    <div className="space-y-3 text-sm">
                      <BreakdownRow tint="text-emerald-300" label="One-Time Payment" value={fmt(data.valuePerYear)} />
                      <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
                        <span className="text-sm font-bold text-white">Total Payout</span>
                        <span className="text-sm font-black text-emerald-300 tabular-nums">{fmt(data.valuePerYear)}</span>
                      </div>
                      <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-xs text-slate-300">
                        Cash is paid out immediately on signing and lands in this year's endorsement ledger.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3 text-sm">
                        <BreakdownRow tint="text-emerald-300" label="Base Fee" value={fmt(breakdown.baseFee)} />
                        <BreakdownRow tint="text-amber-300" label="Performance Bonuses" value={fmt(breakdown.performanceBonus)} />
                        <BreakdownRow tint="text-violet-300" label="Appearance Clauses" value={fmt(breakdown.appearanceClauses)} />
                        <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
                          <span className="text-sm font-bold text-white">Total Value Per Year</span>
                          <span className="text-sm font-black text-emerald-300 tabular-nums">{fmt(data.valuePerYear)}</span>
                        </div>
                      </div>
                      <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-300">
                          <Star size={12} /> Performance Bonuses
                        </div>
                        <p className="text-xs text-slate-300 mt-2">
                          Up to {fmt(breakdown.performanceBonus)} based on team performance, playoff qualification, and media exposure.
                        </p>
                      </div>
                    </>
                  )}
                </Panel>

                {/* What X Gets */}
                <Panel title={`What ${data.brand} Gets`}>
                  <ul className="space-y-2.5">
                    {perks.map((perk) => (
                      <li key={perk} className="flex items-start gap-2.5 text-sm text-slate-200">
                        <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>

              {/* Row 2: Club Benefits / Financial Impact / Recent Partnerships */}
              <div className="grid lg:grid-cols-3 gap-5">
                <Panel title="Club Benefits">
                  <ul className="space-y-2.5">
                    {clubBenefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-2.5 text-sm text-slate-200">
                        <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20">
                      <Sparkles size={14} className="text-emerald-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-black ${fit.tint}`}>Strategic Fit</div>
                      <div className="text-xs text-slate-300 mt-1">{fit.copy}</div>
                    </div>
                    <div className="shrink-0 w-9 h-9 rounded-lg border border-emerald-400/40 bg-emerald-400/15 flex items-center justify-center font-black text-emerald-300">
                      {data.strategicFit}
                    </div>
                  </div>
                </Panel>

                <Panel title="Financial Impact">
                  {isOneTime ? (
                    <>
                      <FinancialBar label="Current Sponsorship Revenue" value={fmtCompact(data.currentSponsorRevenue)} pct={Math.min(100, (data.currentSponsorRevenue / Math.max(1, projectedRevenue)) * 100)} tint="bg-sky-400" />
                      <FinancialBar label="With One-Time Payout" value={fmtCompact(projectedRevenue)} pct={100} tint="bg-emerald-400" />
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="text-slate-400">One-Time Boost</span>
                        <span className="text-emerald-300 font-bold tabular-nums">+{fmtCompact(revenueDelta)} cash</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">Lands on cash on hand immediately — no recurring revenue commitment.</div>
                    </>
                  ) : (
                    <>
                      <FinancialBar label="Current Sponsorship Revenue" value={fmtCompact(data.currentSponsorRevenue)} pct={Math.min(100, (data.currentSponsorRevenue / Math.max(1, projectedRevenue)) * 100)} tint="bg-sky-400" />
                      <FinancialBar label={`With ${data.brand} Deal`} value={fmtCompact(projectedRevenue)} pct={100} tint="bg-emerald-400" />
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="text-slate-400">Increase</span>
                        <span className="text-emerald-300 font-bold tabular-nums">+{fmtCompact(revenueDelta)} (+{revenuePctDelta.toFixed(0)}%)</span>
                      </div>
                    </>
                  )}
                </Panel>

                <Panel title="Recent Partnerships">
                  <div className="grid grid-cols-2 gap-3">
                    {(data.recentPartnerships ?? []).slice(0, 4).map((p) => (
                      <div key={p.name} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden">
                          {p.logoDomain ? (
                            <img src={`https://img.logo.dev/${p.logoDomain}?size=64&format=png`} alt={p.name} className="max-w-full max-h-full object-contain" />
                          ) : (
                            <span className="text-xs font-black text-slate-400">{p.name.slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-white text-center">{p.name}</div>
                        <div className="text-[10px] text-slate-500 text-center">{p.role}</div>
                      </div>
                    ))}
                    {(!data.recentPartnerships || data.recentPartnerships.length === 0) && (
                      <div className="col-span-2 text-xs text-slate-500 text-center py-6">No partnership history available.</div>
                    )}
                  </div>
                </Panel>
              </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-7 py-4 flex items-center gap-3">
          <button
            onClick={onDismiss}
            className="px-5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-500 text-sm font-bold text-slate-300"
          >
            Dismiss Offer
          </button>
          <div className="flex-1 flex items-center justify-end gap-3">
            <button
              onClick={onStartNegotiation}
              className="px-5 py-2.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-bold flex items-center gap-2"
            >
              Start Negotiation <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <div className="px-7 pb-5 text-[11px] text-slate-500">
          ⓘ You can add this offer to negotiations or start negotiating directly. Offer window: {NEGOTIATION_WINDOW_DAYS} days.
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────

const InterestPill: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-black tracking-widest text-emerald-300">
    {label}
  </span>
);

const InterestLevelCard: React.FC<{ label: string; sub: string }> = ({ label, sub }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 min-w-[200px]">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Interest Level</div>
    <div className="mt-1 flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      <span className="text-sm font-black text-emerald-300">{label}</span>
    </div>
    <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
  </div>
);

const KpiCell: React.FC<{ label: string; value: string; sub: string; tint: string }> = ({ label, value, sub, tint }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className={`mt-1 text-xl font-black tabular-nums ${tint}`}>{value}</div>
    <div className="text-[11px] text-slate-500">{sub}</div>
  </div>
);

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
    <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">{title}</div>
    {children}
  </div>
);

const DetailRow: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
    <dt className="text-slate-500">{k}</dt>
    <dd className="text-slate-200 font-bold">{v}</dd>
  </div>
);

const BreakdownRow: React.FC<{ label: string; value: string; tint: string }> = ({ label, value, tint }) => (
  <div className="flex items-center justify-between">
    <span className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${tint.replace('text-', 'bg-')}`} />
      <span className="text-slate-300">{label}</span>
    </span>
    <span className={`tabular-nums font-bold ${tint}`}>{value}</span>
  </div>
);

const FinancialBar: React.FC<{ label: string; value: string; pct: number; tint: string }> = ({ label, value, pct, tint }) => (
  <div className="mb-3">
    <div className="flex items-center justify-between text-sm mb-1.5">
      <span className="text-slate-400">{label}</span>
      <span className="text-white font-bold tabular-nums">{value}</span>
    </div>
    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
      <div className={`h-full ${tint}`} style={{ width: `${pct}%` }} />
    </div>
  </div>
);
