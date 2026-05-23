import React, { useMemo, useState, useEffect } from 'react';
import { X, Check, XCircle, TrendingUp } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import {
  getMarketOffer,
  applyRenewal,
  applyDecline,
  SponsorshipOffer,
  SuccessHistory,
  evaluateOffer,
  computeBrandImpact,
  type NegotiationStance,
} from '../../services/tycoon/sponsorshipEngine';
import { computeStarPower } from '../../services/tycoon/starPower';
import type { SponsorshipSlot } from '../../types/tycoon';
import { ALL_SLOTS } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';

export type NegotiationMode = 'renegotiate' | 'details' | 'replacement' | 'find-new';

interface Props {
  open: boolean;
  onClose: () => void;
  initialSlot?: SponsorshipSlot;
  mode?: NegotiationMode;
}

const SLOTS: SponsorshipSlot[] = ALL_SLOTS;

const SLOT_LABEL: Record<SponsorshipSlot, string> = {
  kit: 'Kit', sleeve: 'Sleeve', back: 'Back', shorts: 'Shorts',
  training: 'Training', court: 'Court', stadium: 'Stadium', practice: 'Practice',
};

export const SponsorshipNegotiationModal: React.FC<Props> = ({ open, onClose, initialSlot, mode = 'renegotiate' }) => {
  const { state, applyTycoonMutation } = useGame() as any;
  const [activeSlot, setActiveSlot] = useState<SponsorshipSlot>(initialSlot ?? 'kit');
  const [stance, setStance] = useState<NegotiationStance>('balanced');
  const [years, setYears] = useState(3);
  const [annualValue, setAnnualValue] = useState(0);
  const [signingBonus, setSigningBonus] = useState(0);
  const [performanceBonus, setPerformanceBonus] = useState(false);
  const [stance, setStance] = useState<NegotiationStance>('balanced');
  const [years, setYears] = useState(3);
  const [annualValue, setAnnualValue] = useState(0);
  const [signingBonus, setSigningBonus] = useState(0);
  const [performanceBonus, setPerformanceBonus] = useState(false);

  useEffect(() => {
    if (initialSlot) setActiveSlot(initialSlot);
  }, [initialSlot, open]);

  const userTeamId = state.userTeamId;
  const team = state.teams.find((t: any) => (t.id ?? t.tid) === userTeamId);
  const currency = state.leagueStats?.currency ?? 'EUR';
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const tycoon = team?.tycoon;

  useEffect(() => {
    if (!open) return;
    if (mode !== 'find-new') return;
    if (!tycoon) return;
    if (!tycoon.sponsorships[activeSlot]) return;
    const firstOpen = ALL_SLOTS.find((s) => !tycoon.sponsorships[s]);
    if (firstOpen) setActiveSlot(firstOpen);
  }, [open, mode, tycoon, activeSlot]);

  const history: SuccessHistory = useMemo(() => ({
    recentEndesaPositions: (team?.recentEndesaPositions ?? []).slice(-3),
    recentEuroleagueStages: (team?.recentEuroleagueStages ?? []).slice(-3),
  }), [team]);

  // Re-roll the offer when activeSlot or tycoon changes (so user sees a stable offer per slot per session)
  const [offerCache, setOfferCache] = useState<Record<SponsorshipSlot, SponsorshipOffer | null>>(
    () => Object.fromEntries(ALL_SLOTS.map(s => [s, null])) as Record<SponsorshipSlot, SponsorshipOffer | null>,
  );

  const starBoost = useMemo(
    () => computeStarPower(state.players ?? [], userTeamId).boost,
    [state.players, userTeamId],
  );

  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => { setConfirmCancel(false); }, [activeSlot, mode, open]);

  useEffect(() => {
    if (!open || !tycoon) return;
    if (offerCache[activeSlot]) return;
    setOfferCache(prev => ({ ...prev, [activeSlot]: getMarketOffer(tycoon, activeSlot, history, starBoost) }));
  }, [activeSlot, open, tycoon, history, offerCache, starBoost]);

  const activeOffer = offerCache[activeSlot];
  useEffect(() => {
    if (!open || !activeOffer) return;
    setAnnualValue(activeOffer.valuePerYear);
    setSigningBonus(activeOffer.signingBonus);
    setYears(activeOffer.years);
    setPerformanceBonus(false);
    setStance('balanced');
  }, [activeSlot, activeOffer, open]);

  if (!open || !team || !tycoon) return null;

  if (mode === 'find-new' && ALL_SLOTS.every((s) => tycoon.sponsorships[s])) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div className="bg-slate-950 border border-amber-500/30 rounded-2xl max-w-md w-full p-6">
          <div className="text-xs font-black uppercase tracking-widest text-amber-300">Commercial Department</div>
          <h2 className="text-2xl font-black text-white mt-1">All slots full</h2>
          <p className="text-sm text-slate-400 mt-2">Every sponsorship slot has an active deal. Use Renegotiate or Find Replacement on the relevant slot.</p>
          <button onClick={onClose} className="mt-5 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl">Close</button>
        </div>
      </div>
    );
  }

  const offer = activeOffer;
  if (!offer) return null;

  const current = tycoon.sponsorships[activeSlot];
  const proposed = {
    ...offer,
    years,
    valuePerYear: annualValue || offer.valuePerYear,
    signingBonus,
    performanceBonus: performanceBonus ? Math.round((annualValue || offer.valuePerYear) * 0.18) : 0,
  };
  const evaluation = evaluateOffer(offer, proposed, stance);
  const impact = computeBrandImpact(proposed, tycoon);

  const handleAccept = () => {
    applyTycoonMutation(userTeamId, (t: any) => applyRenewal(t.tycoon, activeSlot, proposed, state.leagueStats.year));
    setOfferCache(prev => ({ ...prev, [activeSlot]: null }));
    onClose();
  };

  const handleDecline = () => {
    applyTycoonMutation(userTeamId, (t: any) => applyDecline(t.tycoon, activeSlot));
    setOfferCache(prev => ({ ...prev, [activeSlot]: null }));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-amber-500/30 rounded-2xl max-w-7xl w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl shadow-amber-950/30">
        <div className="flex justify-between items-start mb-5">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-amber-300">Commercial Department</div>
            <h2 className="text-2xl font-black text-white">Sponsorship Negotiation</h2>
            <p className="text-sm text-slate-400">Shape the offer, read the sponsor mood, and decide whether this partnership fits your club.</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-white" /></button>
        </div>

        <div className="grid lg:grid-cols-[220px_1fr_330px] gap-5">
          <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500 px-2 pb-1">Sponsor Slots</div>
            {SLOTS.map((slot) => {
              const deal = tycoon.sponsorships[slot];
              return (
                <button
                  key={slot}
                  onClick={() => {
                    setActiveSlot(slot);
                    setAnnualValue(0);
                  }}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${
                    activeSlot === slot ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                  }`}
                >
                  <div className="text-sm font-black text-white">{SLOT_LABEL[slot]}</div>
                  <div className="text-xs text-slate-500 mt-1">{deal ? `${fmt(deal.valuePerYear)}/yr` : 'Open slot'}</div>
                  {deal?.yearsRemaining === 1 && <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-300">Priority</div>}
                </button>
              );
            })}
          </aside>

          <main className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            {mode === 'replacement' && (
              <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                Replacing current sponsor <span className="font-bold">{current?.sponsor ?? '—'}</span>. Confirming below will void the existing deal.
              </div>
            )}
            {mode === 'details' && (
              <div className="mb-3 rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
                Read-only view of the current deal. Use Renegotiate to change terms.
              </div>
            )}
            {mode === 'find-new' && !current && (
              <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                Opening market for <span className="font-bold">{SLOT_LABEL[activeSlot]}</span>.
              </div>
            )}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mb-5">
              <div className="text-xs font-black uppercase tracking-widest text-amber-300">Negotiating with Sponsor</div>
              <div className="text-2xl font-black text-white mt-1">{offer.sponsor}</div>
              <p className="text-sm text-slate-400 mt-2">A {impact.reach.toLowerCase()} brand looking for visibility, stability, and a clear basketball story.</p>
            </div>

            <div className="grid md:grid-cols-[1fr_180px] gap-5">
              <div className="space-y-5">
                <Control label="Annual Value" value={annualValue || offer.valuePerYear} min={Math.round(offer.valuePerYear * 0.65)} max={Math.round(offer.valuePerYear * 1.45)} step={25_000} fmt={fmt} onChange={setAnnualValue} disabled={mode === 'details'} />
                <Control label="Signing Bonus" value={signingBonus} min={0} max={Math.round(offer.valuePerYear * 2.5)} step={25_000} fmt={fmt} onChange={setSigningBonus} disabled={mode === 'details'} />
                <div>
                  <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                    <span>Contract Length</span><span className="text-amber-300">{years} Years</span>
                  </div>
                  <input type="range" min={1} max={4} step={1} value={years} onChange={e => setYears(parseInt(e.target.value, 10))} className="w-full accent-amber-400" disabled={mode === 'details'} />
                </div>
                <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <span>
                    <span className="block text-sm font-black text-white">Performance Bonus Wager</span>
                    <span className="block text-xs text-slate-500">Lower certainty, more upside if you reach the Final Four.</span>
                  </span>
                  <input type="checkbox" checked={performanceBonus} onChange={e => setPerformanceBonus(e.target.checked)} className="accent-amber-400" disabled={mode === 'details'} />
                </label>
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Negotiation Stance</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['conservative', 'balanced', 'aggressive'] as NegotiationStance[]).map(s => (
                      <button
                        key={s}
                        onClick={() => setStance(s)}
                        disabled={mode === 'details'}
                        className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-widest ${
                          stance === s ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-800 bg-slate-950 text-slate-400'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col items-center justify-center">
                <div className="relative w-32 h-32 rounded-full border-[10px] border-slate-800 flex items-center justify-center">
                  <div className="absolute inset-[-10px] rounded-full border-[10px] border-amber-400" style={{ clipPath: `inset(${100 - evaluation.competitiveScore}% 0 0 0)` }} />
                  <div className="text-center">
                    <div className="text-3xl font-black text-white">{evaluation.competitiveScore}%</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">Competitive</div>
                  </div>
                </div>
                <div className="mt-4 text-sm font-black text-white">{evaluation.moodLabel}</div>
                <div className="mt-1 text-xs text-slate-500 text-center">{evaluation.willAccept ? 'Sponsor is likely to accept.' : 'Sponsor will push back hard.'}</div>
              </div>
            </div>
          </main>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-amber-300 mb-3">Brand Impact</div>
              {[
                ['Global Appeal', impact.globalAppeal],
                ['Social Reach', impact.socialReach],
                ['Brand Image', impact.brandImage],
                ['Brand Fit', impact.brandFit],
              ].map(([label, value]) => (
                <div key={label} className="mb-3">
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">{label}</span><span className="text-white font-bold">{value}</span></div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${value}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Current vs New Deal</div>
              <DiffRow label="Annual Value" current={current?.valuePerYear} next={proposed.valuePerYear} fmt={fmt} />
              <DiffRow label="Contract Length" current={current?.yearsRemaining} next={proposed.years} suffix="y" />
              <DiffRow label="Signing Bonus" current={current?.signingBonus ?? 0} next={proposed.signingBonus} fmt={fmt} />
              <DiffRow label="Performance Bonus" current={0} next={proposed.performanceBonus ?? 0} fmt={fmt} />
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Partnership History</div>
              {(current?.relationshipHistory ?? []).length === 0 ? (
                <div className="text-sm text-slate-500">No relationship history yet.</div>
              ) : current!.relationshipHistory!.map(item => (
                <div key={`${item.year}-${item.value}`} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <span className="text-sm text-white">{item.year}</span>
                  <span className="text-xs text-slate-500 uppercase">{item.eventType}</span>
                  <span className="text-sm text-amber-300 font-bold">{fmt(item.value)}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="flex gap-3 mt-5">
          {mode === 'details' ? (
            <button onClick={onClose} className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl">
              Close
            </button>
          ) : (
            <>
              {mode === 'replacement' && (
                <label className="flex items-center gap-2 px-4 py-3 text-xs text-rose-200">
                  <input type="checkbox" checked={confirmCancel} onChange={(e) => setConfirmCancel(e.target.checked)} className="accent-rose-400" />
                  <span>I confirm canceling the current contract with {current?.sponsor ?? '—'}</span>
                </label>
              )}
              <button
                onClick={() => {
                  if (mode === 'replacement') {
                    applyTycoonMutation(userTeamId, (t: any) => applyDecline(t.tycoon, activeSlot));
                  }
                  handleAccept();
                }}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40"
                disabled={!evaluation.willAccept || (mode === 'replacement' && !confirmCancel)}
              >
                <Check size={16} /> {mode === 'replacement' ? 'Replace Sponsor' : 'Accept Deal'}
              </button>
              <button onClick={handleDecline} className="flex-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                <XCircle size={16} /> Decline
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Control: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ label, value, min, max, step, fmt, onChange, disabled }) => (
  <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
      <span>{label}</span><span className="text-amber-300">{fmt(value)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseInt(e.target.value, 10))} className="w-full accent-amber-400" disabled={disabled} />
  </div>
);

const DiffRow: React.FC<{ label: string; current?: number; next: number; fmt?: (v: number) => string; suffix?: string }> = ({ label, current, next, fmt, suffix = '' }) => {
  const c = current ?? 0;
  const delta = next - c;
  const render = (v: number) => fmt ? fmt(v) : `${v}${suffix}`;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-white font-bold">{render(next)}</span>
      <span className={`text-[10px] font-black ${delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
        {delta >= 0 ? '+' : ''}{fmt ? fmt(delta) : `${delta}${suffix}`}
      </span>
    </div>
  );
};
