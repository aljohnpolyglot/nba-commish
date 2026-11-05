import React from 'react';
import { CalendarDays, FileText, Gift, Trophy, X } from 'lucide-react';
import { getBrandMeta, type LeagueKey } from '../../data/sponsorCatalogFetcher';
import { buildSponsorPerformanceBonuses } from '../../services/tycoon/sponsorOfferConstants';
import type { OneTimePayout, TycoonState } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { SponsorLogo } from './SponsorLogo';
import { getEndorsementPerk } from './sponsorshipRevampConfig';

interface Props {
  endorsement: OneTimePayout | null;
  tycoon: TycoonState;
  currentYear: number;
  currency?: string;
  sponsorLeague?: LeagueKey;
  onClose: () => void;
}

export const CurrentEndorsementModal: React.FC<Props> = ({
  endorsement,
  tycoon,
  currentYear,
  currency = 'EUR',
  sponsorLeague = 'spain',
  onClose,
}) => {
  if (!endorsement) return null;
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const perk = getEndorsementPerk(endorsement);
  const bonuses = endorsement.performanceBonuses
    ?? buildSponsorPerformanceBonuses(endorsement.amount, endorsement.archetype);
  const potentialBonusEUR = bonuses.reduce((sum, bonus) => sum + bonus.amountEUR, 0);
  const totalUses = Math.max(0, Math.round(Number(perk.effect?.uses ?? 0)));
  const usedUses = tycoon.sponsorPerkUsage?.find(usage => (
    usage.sponsor === endorsement.brand
    && usage.perkId === perk.id
    && usage.season === currentYear
  ))?.uses ?? 0;
  const remainingUses = Math.max(0, totalUses - usedUses);
  const endYear = endorsement.expiresAfterYear ?? endorsement.year + 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-0 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4 sm:px-7 sm:py-5">
          <div className="flex min-w-0 items-center gap-4">
            <SponsorLogo
              name={endorsement.brand}
              meta={getBrandMeta(sponsorLeague, endorsement.brand)}
              industry={endorsement.industry ?? 'generic'}
              size={64}
            />
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-black text-white">{endorsement.brand}</h2>
              <div className="mt-1 text-sm font-bold text-slate-400">
                One-Year Endorsement · <span className="text-emerald-300">Active</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={21} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-7">
          <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/55 p-4 sm:grid-cols-2">
            <SummaryValue label="Payment" value={fmt(endorsement.amount)} tint="text-emerald-300" />
            <SummaryValue label="Term" value="Ends this season" />
          </div>

          <section className="rounded-xl border border-slate-700 bg-slate-900/55 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white">
                <Trophy size={17} className="text-amber-300" /> Performance Bonuses
              </div>
              <div className="text-xs font-bold text-slate-400">Up to {fmt(potentialBonusEUR)}</div>
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
                {totalUses > 0 && (
                  <div className="mt-2 text-xs font-black text-amber-300">
                    Remaining this season: {remainingUses} / {totalUses}
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
              <ContractRow label="Started" value={String(endorsement.year)} />
              <ContractRow label="Ends" value={String(endYear)} />
              <ContractRow label="Payment" value="On signing" />
            </div>
          </section>
        </div>

        <div className="flex justify-end border-t border-slate-800 p-4 sm:px-7">
          <button type="button" onClick={onClose} className="h-11 w-full rounded-xl bg-amber-400 px-6 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 sm:w-auto">
            Close
          </button>
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
