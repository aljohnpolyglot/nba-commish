import React from 'react';
import {
  X, CheckCircle2, Eye, Users, Megaphone, TrendingUp, Target, Smile,
  Calendar, MapPin, ShoppingBag, Handshake, ArrowRight, RefreshCw, Search,
} from 'lucide-react';
import { SponsorLogo } from './SponsorLogo';
import { getBrandMeta } from '../../data/sponsorCatalogFetcher';
import type { SponsorshipSlot, Sponsorship } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { isSponsorDueForRenewal } from '../../services/tycoon/sponsorshipEngine';
import {
  SLOT_PLACEMENT_LABEL, SLOT_VISIBILITY, INDUSTRY_PROFILE_LABEL,
  describeBrand, getSponsorPerks, breakdownAnnualValue,
  RELATIONSHIP_TIERS, tierForRelationshipScore,
  IMPACT_TIER_TINT, SLOT_DEFAULT_IMPACT,
  CONTRACT_TERMS_DEFAULTS, EXCLUSIVITY_DEFAULT_BY_SLOT,
} from '../../services/tycoon/sponsorOfferConstants';

interface Props {
  open: boolean;
  onClose: () => void;
  slot: SponsorshipSlot | null;
  sponsor: Sponsorship | null;
  currentYear: number;
  currency?: string;
  jerseyPreview?: React.ReactNode;
  onRenegotiate?: () => void;
  onFindNewSponsors?: () => void;
}

export const CurrentSponsorModal: React.FC<Props> = ({
  open, onClose, slot, sponsor, currentYear, currency = 'EUR',
  jerseyPreview, onRenegotiate, onFindNewSponsors,
}) => {
  if (!open || !slot || !sponsor) return null;

  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const industry = sponsor.industry ?? 'generic';
  const archetype = sponsor.archetype ?? 'generic';
  const yearsRemaining = sponsor.yearsRemaining;
  const totalValue = sponsor.valuePerYear * yearsRemaining;
  const contractEndYear = sponsor.signedYear + yearsRemaining;
  const renewalWindowOpen = isSponsorDueForRenewal(sponsor, currentYear);
  const breakdown = breakdownAnnualValue(sponsor.valuePerYear, archetype);
  const breakdownPct = {
    baseFee: (breakdown.baseFee / sponsor.valuePerYear) * 100,
    performanceBonus: (breakdown.performanceBonus / sponsor.valuePerYear) * 100,
    appearanceClauses: (breakdown.appearanceClauses / sponsor.valuePerYear) * 100,
  };
  const perks = getSponsorPerks(slot);
  const exclusivity = EXCLUSIVITY_DEFAULT_BY_SLOT[slot];
  const visibility = SLOT_VISIBILITY[slot];
  const impacts = SLOT_DEFAULT_IMPACT[slot];

  // Mocked until real relationship + performance pipeline exists.
  const relationshipScore = 72;
  const relationshipTier = tierForRelationshipScore(relationshipScore);
  const rel = RELATIONSHIP_TIERS[relationshipTier];
  const satisfaction = relationshipScore >= 65 ? 'Satisfied' : relationshipScore >= 45 ? 'Neutral' : 'Frustrated';
  const satisfactionTint = relationshipScore >= 65 ? 'text-emerald-300' : relationshipScore >= 45 ? 'text-slate-300' : 'text-rose-400';

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-[1480px] w-full max-h-[94vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-800">
          <div className="flex items-start justify-between">
            <div className="text-xs font-black uppercase tracking-widest text-violet-300">Sponsor Details</div>
            <button onClick={onClose} aria-label="Close"><X size={20} className="text-slate-400 hover:text-white" /></button>
          </div>
          <div className="mt-3 grid grid-cols-[auto_1fr_auto] gap-6 items-start">
            <SponsorLogo
              name={sponsor.sponsor}
              meta={getBrandMeta('spain', sponsor.sponsor)}
              industry={industry}
              size={88}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-3xl font-black text-white">{sponsor.sponsor}</h2>
                <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-black tracking-widest ${renewalWindowOpen ? 'border border-rose-400/40 bg-rose-500/15 text-rose-200' : 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-300'}`}>{renewalWindowOpen ? 'Renewal Due' : 'Active'}</span>
              </div>
              <div className="text-sm font-bold text-violet-300 mt-1">{SLOT_PLACEMENT_LABEL[slot]}</div>
              <p className="text-sm text-slate-400 mt-2 max-w-[640px]">{describeBrand(industry)}</p>
            </div>
            <div className="grid grid-cols-5 gap-3 max-w-[820px]">
              <KpiCell label="Value per Year" value={fmt(sponsor.valuePerYear)} sub="Fixed Fee" tint="text-emerald-300" />
              <KpiCell label="Contract Length" value={`${yearsRemaining} Years`} sub={`Ends Jun 30, ${contractEndYear}`} tint="text-white" />
              <KpiCell label="Total Contract Value" value={fmt(totalValue)} sub="" tint="text-sky-300" />
              <KpiCell label="Status" value={renewalWindowOpen ? 'Renewal Due' : 'Active'} sub={renewalWindowOpen ? `Ends Jun 30, ${contractEndYear}` : `${yearsRemaining} year${yearsRemaining === 1 ? '' : 's'} remaining`} tint={renewalWindowOpen ? 'text-rose-300' : 'text-emerald-300'} />
              <KpiCell label="Renewal Option" value="1 Year" sub="Club Option" tint="text-white" />
            </div>
          </div>

          {/* Sub-header row: Industry / HQ / Partner Since + Relationship card */}
          <div className="mt-5 grid grid-cols-[1fr_2fr] gap-5">
            <div className="grid grid-cols-3 gap-4">
              <SubFact icon={<ShoppingBag size={14} className="text-slate-400" />} label="Industry" value={INDUSTRY_PROFILE_LABEL[industry]} />
              <SubFact icon={<MapPin size={14} className="text-slate-400" />} label="Headquarters" value="—" />
              <SubFact icon={<Calendar size={14} className="text-slate-400" />} label="Partner Since" value={String(sponsor.signedYear)} />
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
                <Handshake size={22} className="text-violet-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Relationship Level</div>
                <div className={`text-base font-black ${rel.tint}`}>{relationshipTier} Relationship</div>
                <div className="text-xs text-slate-400 mt-0.5">{rel.copy}</div>
              </div>
              <div className="shrink-0 min-w-[260px]">
                <RelationshipBar score={relationshipScore} />
                <div className="mt-1 text-right text-xs"><span className="text-white font-black text-2xl tabular-nums">{relationshipScore}</span><span className="text-slate-500"> / 100</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-5">
          {(
            <>
              {/* Row 1: Sponsorship Asset / Sponsorship Impact / Deal Breakdown */}
              <div className="grid lg:grid-cols-[1.2fr_1fr_1.2fr] gap-5">
                {/* Sponsorship Asset */}
                <Panel title="Sponsorship Asset">
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex items-center justify-center min-h-[220px]">
                      {jerseyPreview ?? (
                        <div className="w-full aspect-[3/4] rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-[10px] text-slate-600 text-center px-2">
                          Jersey Preview
                        </div>
                      )}
                    </div>
                    <dl className="text-sm">
                      <DetailRow k="Placement" v={SLOT_PLACEMENT_LABEL[slot]} />
                      <DetailRow k="Visibility" v={visibility} tint="text-emerald-300" />
                      <DetailRow k="Category" v={SLOT_PLACEMENT_LABEL[slot]} />
                      <DetailRow k="Rights" v={`Logo on ${SLOT_PLACEMENT_LABEL[slot].toLowerCase()}`} />
                      <DetailRow k="Exclusivity" v={exclusivity} />
                      <DetailRow k="Territory" v="Regional" />
                      <DetailRow k="Activation Focus" v="Local Engagement" />
                    </dl>
                  </div>
                </Panel>

                {/* Sponsorship Impact */}
                <Panel title="Sponsorship Impact">
                  <div className="space-y-3">
                    <ImpactRow icon={<Eye size={16} className="text-slate-400" />} label="Brand Exposure" tier={impacts.brandExposure} />
                    <ImpactRow icon={<Users size={16} className="text-slate-400" />} label="Fan Recognition" tier={impacts.fanRecognition} />
                    <ImpactRow icon={<Megaphone size={16} className="text-slate-400" />} label="Social Media Impact" tier={impacts.socialMedia} />
                    <ImpactRow icon={<TrendingUp size={16} className="text-slate-400" />} label="Commercial Impact" tier={impacts.commercial} />
                    <ImpactRow icon={<Target size={16} className="text-slate-400" />} label="Market Fit" tier={impacts.marketFit} />
                  </div>
                </Panel>

                {/* Deal Breakdown */}
                <Panel title="Deal Breakdown (Per Year)">
                  <div className="grid grid-cols-[140px_1fr] gap-4 items-center">
                    <DonutBreakdown total={sponsor.valuePerYear} segments={[
                      { pct: breakdownPct.baseFee, color: '#34d399' },
                      { pct: breakdownPct.performanceBonus, color: '#38bdf8' },
                      { pct: breakdownPct.appearanceClauses, color: '#a78bfa' },
                    ]} centerLabel={fmt(sponsor.valuePerYear)} centerSub="Total" />
                    <div className="space-y-2 text-sm">
                      <LegendRow color="bg-emerald-400" label="Base Fee" value={fmt(breakdown.baseFee)} pct={breakdownPct.baseFee.toFixed(1) + '%'} />
                      <LegendRow color="bg-sky-400" label="Performance Bonuses" value={fmt(breakdown.performanceBonus)} pct={breakdownPct.performanceBonus.toFixed(1) + '%'} />
                      <LegendRow color="bg-violet-400" label="Appearance Clauses" value={fmt(breakdown.appearanceClauses)} pct={breakdownPct.appearanceClauses.toFixed(1) + '%'} />
                    </div>
                  </div>
                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Performance Bonuses</div>
                    <div className="text-xs text-slate-400 mb-2">Up to {fmt(breakdown.performanceBonus)} based on:</div>
                    <BonusRow label="Playoff qualification" value={fmt(Math.round(breakdown.performanceBonus * 0.37))} />
                    <BonusRow label="Win domestic cup" value={fmt(Math.round(breakdown.performanceBonus * 0.3))} />
                    <BonusRow label="Average attendance > 70%" value={fmt(Math.round(breakdown.performanceBonus * 0.33))} />
                  </div>
                </Panel>
              </div>

              {/* Row 2: Sponsor Benefits / Last Season Performance / Contract Terms */}
              <div className="grid lg:grid-cols-[1.2fr_1fr_1fr] gap-5">
                <Panel title="Sponsor Benefits">
                  <div className="grid grid-cols-2 gap-3">
                    {perks.slice(0, 6).map((p) => (
                      <div key={p} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
                          <CheckCircle2 size={14} className="text-violet-300" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white leading-tight">{p}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Active</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Last Season Performance" right={<span className="text-[10px] text-slate-500 uppercase tracking-widest">vs. targets</span>}>
                  <div className="grid grid-cols-3 gap-3">
                    <PerformanceDonut label="Impressions" value="2.1M" pct={105} />
                    <PerformanceDonut label="Engagements" value="45K" pct={98} />
                    <PerformanceDonut label="Brand Lift" value="+18%" pct={110} />
                  </div>
                  <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs text-emerald-200 text-center">
                    Great job! You exceeded most of the sponsor's expectations.
                  </div>
                </Panel>

                <Panel title="Contract Terms">
                  <dl className="text-sm">
                    <DetailRow k="Payment Structure" v={CONTRACT_TERMS_DEFAULTS.paymentStructure} />
                    <DetailRow k="Contract Start" v={`Jul 1, ${sponsor.signedYear}`} />
                    <DetailRow k="Contract End" v={`Jun 30, ${contractEndYear}`} />
                    <DetailRow k="Renewal Option" v={CONTRACT_TERMS_DEFAULTS.renewalOption} />
                    <DetailRow k="Termination Notice" v={`${CONTRACT_TERMS_DEFAULTS.terminationNoticeDays} Days`} />
                  </dl>
                </Panel>
              </div>
            </>
          )}
        </div>{/* /body */}

        {/* Footer */}
        <div className="border-t border-slate-800 px-7 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Smile size={18} className={satisfactionTint} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sponsor Satisfaction</div>
              <div className={`text-sm font-black ${satisfactionTint}`}>{satisfaction}</div>
              <div className="text-[10px] text-slate-500">No current issues</div>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-5">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
              <Calendar size={16} className="text-slate-400" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Next Payout</div>
              <div className="text-sm font-bold text-white">Aug 1, {currentYear}</div>
              <div className="text-[10px] text-slate-500 tabular-nums">{fmt(Math.round(sponsor.valuePerYear / 4))}</div>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-end gap-3">
            {renewalWindowOpen && (
              <FooterButton icon={<RefreshCw size={14} />} label="Renegotiate Deal" onClick={onRenegotiate} hint="Contract ends this year — renewal window open" />
            )}
            <button
              onClick={onFindNewSponsors}
              className="px-5 py-2.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-bold flex items-center gap-2"
            >
              <Search size={14} /> Replace Sponsor <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────

const KpiCell: React.FC<{ label: string; value: string; sub: string; tint: string }> = ({ label, value, sub, tint }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 min-w-[120px]">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className={`mt-1 text-lg font-black tabular-nums leading-tight ${tint}`}>{value}</div>
    {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

const SubFact: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2">
    <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">{icon}</div>
    <div className="min-w-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-sm font-bold text-white truncate">{value}</div>
    </div>
  </div>
);

const RelationshipBar: React.FC<{ score: number }> = ({ score }) => {
  const segments = [
    { color: 'bg-rose-500', pct: 25 },
    { color: 'bg-amber-400', pct: 25 },
    { color: 'bg-emerald-400', pct: 25 },
    { color: 'bg-emerald-300', pct: 25 },
  ];
  return (
    <div className="relative h-2.5 rounded-full bg-slate-800 overflow-hidden flex">
      {segments.map((s, i) => <div key={i} className={`h-full ${s.color}`} style={{ width: `${s.pct}%` }} />)}
      <div className="absolute top-[-6px]" style={{ left: `calc(${score}% - 6px)` }}>
        <div className="w-3 h-3 rounded-full bg-white border-2 border-violet-400" />
      </div>
    </div>
  );
};

const Panel: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
    <div className="flex items-center justify-between mb-4">
      <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">{title}</div>
      {right}
    </div>
    {children}
  </div>
);

const DetailRow: React.FC<{ k: string; v: string; tint?: string }> = ({ k, v, tint }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
    <dt className="text-slate-500 text-sm">{k}</dt>
    <dd className={`text-sm font-bold ${tint ?? 'text-slate-200'}`}>{v}</dd>
  </div>
);

const ImpactRow: React.FC<{ icon: React.ReactNode; label: string; tier: keyof typeof IMPACT_TIER_TINT }> = ({ icon, label, tier }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
    <span className="flex items-center gap-2.5 text-sm text-slate-300">{icon}{label}</span>
    <span className={`text-sm font-black ${IMPACT_TIER_TINT[tier]}`}>{tier}</span>
  </div>
);

const LegendRow: React.FC<{ color: string; label: string; value: string; pct: string }> = ({ color, label, value, pct }) => (
  <div className="flex items-center justify-between">
    <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${color}`} /><span className="text-slate-300">{label}</span></span>
    <span className="flex items-center gap-3"><span className="text-slate-200 font-bold tabular-nums">{value}</span><span className="text-slate-500 text-xs tabular-nums">{pct}</span></span>
  </div>
);

const BonusRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="flex items-center gap-2 text-sm text-slate-300"><CheckCircle2 size={14} className="text-emerald-400" />{label}</span>
    <span className="text-sm font-bold text-white tabular-nums">{value}</span>
  </div>
);

const FooterButton: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void; hint?: string }> = ({ icon, label, onClick, hint }) => (
  <button
    onClick={onClick}
    title={hint}
    className="px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-500 text-sm font-bold text-slate-300 flex items-center gap-2"
  >
    {icon} {label}
  </button>
);

const DonutBreakdown: React.FC<{ total: number; segments: Array<{ pct: number; color: string }>; centerLabel: string; centerSub: string }> = ({ segments, centerLabel, centerSub }) => {
  let cumulative = 0;
  const gradientParts = segments.map((s) => {
    const start = cumulative;
    cumulative += s.pct;
    return `${s.color} ${start}% ${cumulative}%`;
  }).join(', ');
  return (
    <div className="relative w-[128px] h-[128px] mx-auto">
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${gradientParts})` }} />
      <div className="absolute inset-3 rounded-full bg-slate-950 flex flex-col items-center justify-center border border-slate-800">
        <div className="text-sm font-black text-white tabular-nums">{centerLabel}</div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest">{centerSub}</div>
      </div>
    </div>
  );
};

const PerformanceDonut: React.FC<{ label: string; value: string; pct: number }> = ({ label, value, pct }) => {
  const clamped = Math.max(0, Math.min(120, pct));
  const color = clamped >= 100 ? '#34d399' : clamped >= 85 ? '#a3e635' : '#fbbf24';
  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</div>
      <div className="relative w-[90px] h-[90px]">
        <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${color} 0% ${Math.min(100, clamped)}%, #1e293b ${Math.min(100, clamped)}% 100%)` }} />
        <div className="absolute inset-2 rounded-full bg-slate-950 flex items-center justify-center">
          <div className="text-base font-black text-white">{value}</div>
        </div>
      </div>
      <div className={`mt-2 text-xs font-bold ${clamped >= 100 ? 'text-emerald-300' : 'text-amber-300'}`}>{clamped}%</div>
    </div>
  );
};
