import React, { useEffect, useMemo, useState } from 'react';
import { X, CheckCircle2, Calendar, PartyPopper } from 'lucide-react';
import { SponsorLogo } from './SponsorLogo';
import { getBrandMeta } from '../../data/sponsorCatalogFetcher';
import type { SponsorshipSlot, SponsorIndustry } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import {
  SLOT_PLACEMENT_LABEL, INDUSTRY_PROFILE_LABEL,
  getSponsorPerks, EXCLUSIVITY_DEFAULT_BY_SLOT, type ExclusivityType,
} from '../../services/tycoon/sponsorOfferConstants';

/** Slots that share the kit-apparel family — the placement picker is shown for these. */
export const KIT_FAMILY_SLOTS: SponsorshipSlot[] = ['kit', 'sleeve', 'back', 'shorts', 'training'];

/** Base offer-strength multipliers per kit-family placement, relative to front-of-shirt.
 *  Higher placement visibility → higher base value. */
export const KIT_PLACEMENT_MULTIPLIER: Record<SponsorshipSlot, number> = {
  kit:      1.00, // Front of Shirt
  sleeve:   0.55,
  back:     0.45,
  shorts:   0.25,
  training: 0.30,
  court:    0,
  stadium:  0,
  practice: 0,
};

export interface StartNegotiationModalData {
  brand: string;
  industry: SponsorIndustry | 'generic';
  slot: SponsorshipSlot;
  /** Base value the sponsor is willing to pay for the FRONT-OF-SHIRT placement.
   *  Other kit-family placements scale via KIT_PLACEMENT_MULTIPLIER. */
  baseValuePerYear: number;
  interestLabel: 'Very Interested' | 'Interested' | 'Neutral' | 'Not Interested';
  exclusivityScope: string;
  expiresOn: string;
  negotiationDaysLeft: number;
  currentSeasonYear: number;
  /** Slots that already have an active sponsor — these are greyed out in the placement picker. */
  occupiedSlots?: Set<SponsorshipSlot>;
  /** One-time community / endorsement payout — immediate payout, no contract length picker. */
  oneTime?: boolean;
  /** Optional label shown in place of "Year" picker for one-time deals. */
  dealTypeLabel?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: StartNegotiationModalData | null;
  onSubmit?: (submission: {
    slot: SponsorshipSlot;
    valuePerYear: number;
    contractYears: number;
    exclusivity: ExclusivityType | null;
  }) => void;
}

type Strength = 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';

const STRENGTH_TINT: Record<Strength, string> = {
  'Very Weak':   'text-rose-400',
  'Weak':        'text-amber-400',
  'Fair':        'text-amber-300',
  'Strong':      'text-emerald-400',
  'Very Strong': 'text-emerald-300',
};

const STRENGTH_BAR: Record<Strength, string> = {
  'Very Weak':   'bg-rose-500',
  'Weak':        'bg-amber-500',
  'Fair':        'bg-amber-400',
  'Strong':      'bg-emerald-400',
  'Very Strong': 'bg-emerald-400',
};

function strengthForPct(pct: number): { level: Strength; lit: number } {
  if (pct < 35) return { level: 'Very Weak', lit: 1 };
  if (pct < 55) return { level: 'Weak', lit: 2 };
  if (pct < 70) return { level: 'Fair', lit: 3 };
  if (pct < 85) return { level: 'Strong', lit: 4 };
  return { level: 'Very Strong', lit: 5 };
}

export const StartNegotiationModal: React.FC<Props> = ({ open, onClose, data, onSubmit }) => {
  const [slot, setSlot] = useState<SponsorshipSlot>(data?.slot ?? 'kit');
  const [contractYears, setContractYears] = useState<number>(3);
  const [exclusive, setExclusive] = useState(true);
  const [confirmation, setConfirmation] = useState<null | { brand: string; value: number; years: number }>(null);
  const isKitFamily = KIT_FAMILY_SLOTS.includes(slot);

  const baseForSlot = useMemo(() => {
    if (!data) return 0;
    if (!isKitFamily) return data.baseValuePerYear;
    return Math.round(data.baseValuePerYear * (KIT_PLACEMENT_MULTIPLIER[slot] || 1));
  }, [data, slot, isKitFamily]);

  const minValue = Math.round(baseForSlot * 0.6);
  const maxValue = Math.round(baseForSlot * 1.45);
  const [valuePerYear, setValuePerYear] = useState<number>(baseForSlot);

  useEffect(() => {
    if (data) setSlot(data.slot);
  }, [data]);

  useEffect(() => {
    setValuePerYear(baseForSlot);
  }, [baseForSlot]);

  if (!open || !data) return null;

  const fmt = (v: number) => formatCurrencyWithCode(v, 'EUR', false);
  const offerPct = maxValue > minValue ? ((valuePerYear - minValue) / (maxValue - minValue)) * 100 : 50;
  const strength = strengthForPct(offerPct);
  const totalValue = valuePerYear * contractYears;
  const startYear = data.currentSeasonYear;
  const endYear = startYear + contractYears;
  const seasonRange = `${startYear}/${String(startYear + 1).slice(-2)} – ${endYear - 1}/${String(endYear).slice(-2)}`;
  const exclusivityDefault = EXCLUSIVITY_DEFAULT_BY_SLOT[slot];
  const benefits = getSponsorPerks(slot);
  const includedBenefits = benefits.slice(0, Math.max(1, Math.min(benefits.length, strength.lit)));

  const handleSubmit = () => {
    onSubmit?.({
      slot,
      valuePerYear,
      contractYears,
      exclusivity: exclusive ? exclusivityDefault : null,
    });
    setConfirmation({ brand: data.brand, value: valuePerYear, years: contractYears });
  };
  const handleConfirmationClose = () => {
    setConfirmation(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[70] flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-[1100px] w-full max-h-[94vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-800 flex items-start gap-5">
          <SponsorLogo
            name={data.brand}
            meta={getBrandMeta('spain', data.brand)}
            industry={data.industry}
            size={80}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-violet-300">Start Negotiation</div>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-black text-white">{data.brand}</h2>
              <span className="inline-flex items-center rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-black tracking-widest text-emerald-300">{data.interestLabel}</span>
            </div>
            <div className="text-sm text-slate-400 mt-1">{INDUSTRY_PROFILE_LABEL[data.industry]} • <span className="text-violet-300">{SLOT_PLACEMENT_LABEL[slot]}</span></div>
          </div>
          <div className="shrink-0 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 min-w-[240px]">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Offer Strength</div>
            <div className={`mt-1 text-lg font-black ${STRENGTH_TINT[strength.level]}`}>{strength.level}</div>
            <div className="mt-3 flex gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`flex-1 h-2 rounded ${i < strength.lit ? STRENGTH_BAR[strength.level] : 'bg-slate-800'}`}
                />
              ))}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="mt-1"><X size={20} className="text-slate-400 hover:text-white" /></button>
        </div>

        {/* Placement picker — kit family only */}
        {isKitFamily && (
          <div className="px-7 py-4 border-b border-slate-800">
            <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Placement</div>
            <div className="grid grid-cols-5 gap-2">
              {KIT_FAMILY_SLOTS.map((s) => {
                const active = slot === s;
                const occupied = data.occupiedSlots?.has(s) ?? false;
                const mult = KIT_PLACEMENT_MULTIPLIER[s];
                return (
                  <button
                    key={s}
                    onClick={() => !occupied && setSlot(s)}
                    disabled={occupied}
                    title={occupied ? 'Slot already filled' : undefined}
                    className={`rounded-xl border p-3 text-left transition ${
                      occupied
                        ? 'border-slate-800 bg-slate-950/30 opacity-40 cursor-not-allowed'
                        : active
                          ? 'border-violet-400 bg-violet-500/10'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                    }`}
                  >
                    <div className={`text-sm font-black ${occupied ? 'text-slate-500' : active ? 'text-violet-200' : 'text-white'}`}>{SLOT_PLACEMENT_LABEL[s]}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {occupied ? 'Taken' : `${fmt(Math.round(data.baseValuePerYear * mult))} base`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="grid lg:grid-cols-2 gap-5 px-7 py-6">
          {/* Left column */}
          <div className="space-y-4">
            <Panel title="Offer Amount">
              <div className="flex items-baseline gap-3">
                <div className="text-3xl font-black text-emerald-300 tabular-nums">{fmt(valuePerYear)}</div>
                <div className="text-sm text-slate-400">per year</div>
              </div>
              <input
                type="range"
                min={minValue}
                max={maxValue}
                step={Math.max(1, Math.round((maxValue - minValue) / 200))}
                value={valuePerYear}
                onChange={(e) => setValuePerYear(parseInt(e.target.value, 10))}
                className="w-full mt-3 accent-violet-400"
              />
              <div className="flex justify-between text-xs text-slate-500 tabular-nums">
                <span>{fmt(minValue)}</span>
                <span>{fmt(maxValue)}</span>
              </div>
            </Panel>

            <Panel title={data.oneTime ? 'Deal Type' : 'Contract Length'}>
              {data.oneTime ? (
                <div>
                  <div className="text-sm font-bold text-white">{data.dealTypeLabel ?? 'One-Year Campaign'}</div>
                  <div className="text-xs text-slate-500 mt-1">Paid immediately, active this season, cleared at year rollover.</div>
                </div>
              ) : (
                <>
                  <select
                    value={contractYears}
                    onChange={(e) => setContractYears(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-400/60"
                  >
                    {[1, 2, 3, 4, 5].map((y) => (
                      <option key={y} value={y}>{y} Year{y > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-500 mt-2 tabular-nums">{seasonRange}</div>
                </>
              )}
            </Panel>

            <Panel title="Exclusivity">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exclusive}
                  onChange={(e) => setExclusive(e.target.checked)}
                  className="mt-0.5 accent-violet-400 w-4 h-4"
                />
                <div>
                  <div className="text-sm font-bold text-white">{exclusivityDefault}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Only one brand from {INDUSTRY_PROFILE_LABEL[data.industry]} category</div>
                </div>
              </label>
            </Panel>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <Panel title="Benefits Included">
              <ul className="space-y-2">
                {includedBenefits.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-slate-200">
                    <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-xs text-slate-500">
                Higher offers unlock more sponsor visibility. Low offers reduce placement inventory.
              </div>
            </Panel>

            <Panel title="Estimated Value">
              <div className="text-3xl font-black text-emerald-300 tabular-nums">{fmt(data.oneTime ? valuePerYear : totalValue)}</div>
              <div className="text-xs text-slate-500 mt-1">{data.oneTime ? 'Paid out immediately on signing' : `Total over ${contractYears} year${contractYears > 1 ? 's' : ''}`}</div>
            </Panel>

            <Panel title="Negotiation Window">
              <div className="flex items-center gap-3">
                <Calendar size={28} className="text-violet-300" />
                <div>
                  <div className="text-lg font-black text-violet-300">{data.negotiationDaysLeft} Days Left</div>
                  <div className="text-xs text-slate-500">Expires {data.expiresOn}</div>
                </div>
              </div>
            </Panel>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-7 py-4 flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-500 text-sm font-bold text-slate-300"
          >
            Cancel
          </button>
          <div className="flex-1 text-center text-xs text-slate-500">
            Offer amount controls brand visibility and offer strength.
          </div>
          <button
            onClick={handleSubmit}
            className="px-7 py-2.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-bold"
          >
            {data.oneTime ? 'Sign Deal' : 'Submit Offer'}
          </button>
        </div>
      </div>

      {confirmation && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[80] flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-emerald-500/40 rounded-2xl max-w-md w-full p-7 shadow-2xl shadow-emerald-950/30 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <PartyPopper size={28} className="text-emerald-300" />
            </div>
            <div className="mt-4 text-xs font-black uppercase tracking-widest text-emerald-300">{data.oneTime ? 'Deal Signed' : 'Deal Submitted'}</div>
            <h3 className="mt-1 text-2xl font-black text-white">Nice doing business with you!</h3>
            {data.oneTime ? (
              <>
                <p className="mt-3 text-sm text-slate-300">
                  Signed a one-time deal with <span className="font-bold text-white">{confirmation.brand}</span> for{' '}
                  <span className="font-bold text-emerald-300">{fmt(confirmation.value)}</span>.
                </p>
                <p className="mt-2 text-xs text-slate-500">Cash hits immediately, the deal stays visible this season, and rollover clears the slot.</p>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-slate-300">
                  You've submitted an offer to <span className="font-bold text-white">{confirmation.brand}</span> for{' '}
                  <span className="font-bold text-emerald-300">{fmt(confirmation.value)}</span> per year over{' '}
                  <span className="font-bold">{confirmation.years} year{confirmation.years > 1 ? 's' : ''}</span>.
                </p>
                <p className="mt-2 text-xs text-slate-500">The sponsor will respond within the negotiation window.</p>
              </>
            )}
            <button
              onClick={handleConfirmationClose}
              className="mt-6 w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
    <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">{title}</div>
    {children}
  </div>
);
