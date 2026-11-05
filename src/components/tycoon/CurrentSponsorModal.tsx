import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Gift,
  Trophy,
  X,
} from 'lucide-react';
import { SponsorLogo } from './SponsorLogo';
import { getBrandMeta, type LeagueKey } from '../../data/sponsorCatalogFetcher';
import type { Sponsorship, SponsorshipSlot, TycoonState } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import {
  getSponsorContractEndYear,
  isSponsorDueForRenewal,
} from '../../services/tycoon/sponsorshipEngine';
import { buildSponsorPerformanceBonuses } from '../../services/tycoon/sponsorOfferConstants';
import { getCoreSponsorPerk, SPONSOR_SLOT_CONFIG } from './sponsorshipRevampConfig';

interface Props {
  open: boolean;
  onClose: () => void;
  slot: SponsorshipSlot | null;
  sponsor: Sponsorship | null;
  tycoon?: TycoonState;
  currentYear: number;
  currency?: string;
  sponsorLeague?: LeagueKey;
  onBreakContract?: () => void;
  jerseyPreview?: React.ReactNode;
  showDetailedMarketing?: boolean;
}

export const CurrentSponsorModal: React.FC<Props> = ({
  open,
  onClose,
  slot,
  sponsor,
  tycoon,
  currentYear,
  currency = 'EUR',
  sponsorLeague = 'spain',
  onBreakContract,
}) => {
  const [confirmBreak, setConfirmBreak] = useState(false);

  useEffect(() => {
    if (!open) setConfirmBreak(false);
  }, [open]);

  if (!open || !slot || !sponsor) return null;

  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const slotConfig = SPONSOR_SLOT_CONFIG[slot];
  const contractEndYear = getSponsorContractEndYear(sponsor, currentYear) ?? currentYear + sponsor.yearsRemaining;
  const renewalWindowOpen = isSponsorDueForRenewal(sponsor, currentYear);
  const totalValue = sponsor.valuePerYear * Math.max(1, contractEndYear - sponsor.signedYear);
  const bonuses = sponsor.performanceBonuses
    ?? buildSponsorPerformanceBonuses(sponsor.valuePerYear, sponsor.archetype);
  const potentialBonusEUR = bonuses.reduce((sum, bonus) => sum + bonus.amountEUR, 0);
  const perk = getCoreSponsorPerk(sponsor, slot);
  const totalPerkUses = Math.max(0, Math.round(Number(perk.effect?.uses ?? 0)));
  const usedPerkUses = tycoon?.sponsorPerkUsage?.find(usage => (
    usage.sponsor === sponsor.sponsor
    && usage.perkId === perk.id
    && usage.season === currentYear
  ))?.uses ?? 0;
  const remainingPerkUses = Math.max(0, totalPerkUses - usedPerkUses);
  const paymentSchedule = sponsor.paymentSchedule === 'annual' ? 'Annual' : 'Quarterly';
  const renewalOption = `${sponsor.renewalOptionYears ?? 1} year`;
  const terminationNotice = `${sponsor.terminationNoticeDays ?? 90} days`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-0 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4 sm:px-7 sm:py-5">
          <div className="flex min-w-0 items-center gap-4">
            <SponsorLogo
              name={sponsor.sponsor}
              meta={getBrandMeta(sponsorLeague, sponsor.sponsor)}
              industry={sponsor.industry ?? 'generic'}
              size={64}
            />
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-black text-white">{sponsor.sponsor}</h2>
              <div className="mt-1 text-sm font-bold text-slate-400">
                {slotConfig.label} · <span className={renewalWindowOpen ? 'text-amber-300' : 'text-emerald-300'}>{renewalWindowOpen ? 'Renewal due' : 'Active'}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={21} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-7">
          <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/55 p-4 sm:grid-cols-3">
            <SummaryValue label="Annual Base Value" value={fmt(sponsor.valuePerYear)} tint="text-emerald-300" />
            <SummaryValue label="Remaining" value={`${sponsor.yearsRemaining} ${sponsor.yearsRemaining === 1 ? 'year' : 'years'}`} />
            <SummaryValue label="Total Base Value" value={fmt(totalValue)} tint="text-emerald-300" />
          </div>

          <section className="rounded-xl border border-slate-700 bg-slate-900/55 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white">
                <Trophy size={17} className="text-amber-300" /> Performance Bonuses
              </div>
              <div className="text-xs font-bold text-slate-400">Up to {fmt(potentialBonusEUR)} / season</div>
            </div>
            <div className="space-y-2">
              {bonuses.map(bonus => (
                <DetailRow key={bonus.id} label={bonus.label} value={fmt(bonus.amountEUR)} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/55 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10">
                <Gift size={19} className="text-amber-300" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">Active Perk</div>
                <div className="mt-1 font-black text-white">{perk.label}</div>
                <div className="mt-1 text-sm leading-6 text-slate-400">{perk.description}</div>
                {totalPerkUses > 0 && (
                  <div className="mt-2 text-xs font-black text-amber-300">
                    Remaining this season: {remainingPerkUses} / {totalPerkUses}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/55 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white">
              <FileText size={17} className="text-amber-300" /> Contract
            </div>
            <div className="space-y-2">
              <ContractRow label="Started" value={String(sponsor.signedYear)} />
              <ContractRow label="Ends" value={String(contractEndYear)} />
              <ContractRow label="Payment schedule" value={paymentSchedule} />
              <ContractRow label="Renewal option" value={renewalOption} />
              <ContractRow label="Termination notice" value={terminationNotice} />
            </div>
          </section>

          {confirmBreak && (
            <div className="rounded-xl border border-rose-400/35 bg-rose-400/[0.07] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={19} className="mt-0.5 shrink-0 text-rose-300" />
                <div>
                  <div className="font-black text-white">Break this contract?</div>
                  <div className="mt-1 text-sm leading-6 text-slate-400">The slot becomes vacant immediately and the existing commercial-trust penalty still applies.</div>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => setConfirmBreak(false)} className="h-10 flex-1 rounded-lg border border-slate-600 text-sm font-black text-white hover:bg-slate-800">
                  Keep Contract
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onBreakContract?.();
                    setConfirmBreak(false);
                  }}
                  className="h-10 flex-1 rounded-lg bg-rose-500 text-sm font-black text-white hover:bg-rose-400"
                >
                  Confirm Break
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-800 p-4 sm:flex-row sm:items-center sm:px-7">
          {onBreakContract && !confirmBreak && (
            <button type="button" onClick={() => setConfirmBreak(true)} className="h-11 rounded-xl border border-rose-400/40 px-5 text-xs font-black uppercase tracking-widest text-rose-300 hover:bg-rose-400/10">
              Break Contract
            </button>
          )}
          <div className="flex flex-1 gap-3 sm:justify-end">
            <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl bg-amber-400 px-6 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 sm:flex-none">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SummaryValue: React.FC<{ label: string; value: string; tint?: string }> = ({ label, value, tint = 'text-white' }) => (
  <div>
    <div className="text-xs font-bold text-slate-500">{label}</div>
    <div className={`mt-1 text-xl font-black tabular-nums ${tint}`}>{value}</div>
  </div>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-slate-300">{label}</span>
    <span className="shrink-0 font-black tabular-nums text-white">{value}</span>
  </div>
);

const ContractRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="flex items-center gap-2 text-slate-400"><CalendarDays size={14} className="text-amber-300" /> {label}</span>
    <span className="font-black text-white">{value}</span>
  </div>
);
