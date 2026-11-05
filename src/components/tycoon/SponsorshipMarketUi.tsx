import React from 'react';
import { ArrowLeft, CalendarDays, Trophy, X } from 'lucide-react';
import { getBrandMeta, type LeagueKey } from '../../data/sponsorCatalogFetcher';
import type { SponsorPerformanceBonus } from '../../types/tycoon';
import { SponsorLogo } from './SponsorLogo';
import type { MockOffer } from './openMarketModalShared';

export const ModalHeader: React.FC<{
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4 sm:px-7 sm:py-5">
    <div>
      <h2 className="text-2xl font-black text-white">{title}</h2>
      {children}
    </div>
    <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
      <X size={21} />
    </button>
  </div>
);

export const SponsorIdentity: React.FC<{
  offer: MockOffer;
  sponsorLeague: LeagueKey;
  subtitle: string;
}> = ({ offer, sponsorLeague, subtitle }) => (
  <div className="flex items-center gap-4">
    <SponsorLogo name={offer.brand} meta={getBrandMeta(sponsorLeague, offer.brand)} industry={offer.industry} size={64} />
    <div>
      <div className="text-sm font-bold text-slate-400">{subtitle}</div>
      <div className="text-2xl font-black text-white">{offer.brand}</div>
    </div>
  </div>
);

export const BonusPanel: React.FC<{
  bonuses: SponsorPerformanceBonus[];
  fmt: (value: number) => string;
}> = ({ bonuses, fmt }) => {
  const potentialBonusEUR = bonuses.reduce((sum, bonus) => sum + bonus.amountEUR, 0);
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/55 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-white"><Trophy size={17} className="text-amber-300" /> Performance Bonuses</div>
        <div className="text-xs font-bold text-slate-400">Up to {fmt(potentialBonusEUR)} / season</div>
      </div>
      <div className="space-y-2">
        {bonuses.map(bonus => (
          <div key={bonus.id} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-slate-300">{bonus.label}</span>
            <span className="shrink-0 font-black tabular-nums text-white">{fmt(bonus.amountEUR)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SummaryValue: React.FC<{
  label: string;
  value: string;
  tint?: string;
}> = ({ label, value, tint = 'text-white' }) => (
  <div>
    <div className="text-xs font-bold text-slate-500">{label}</div>
    <div className={`mt-1 text-xl font-black tabular-nums ${tint}`}>{value}</div>
  </div>
);

export const ContractFact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="flex items-center gap-2 text-slate-400"><CalendarDays size={14} className="text-amber-300" /> {label}</span>
    <span className="text-right font-black text-white">{value}</span>
  </div>
);

export const ModalFooter: React.FC<{
  backLabel: string;
  onBack: () => void;
  actionLabel: string;
  onAction: () => void;
}> = ({ backLabel, onBack, actionLabel, onAction }) => (
  <div className="flex gap-3 border-t border-slate-800 p-4 sm:justify-between sm:px-7">
    <button
      type="button"
      onClick={onBack}
      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-600 px-5 text-sm font-black text-white hover:bg-slate-800 sm:flex-none"
    >
      <ArrowLeft size={16} /> {backLabel}
    </button>
    <button
      type="button"
      onClick={onAction}
      className="h-12 flex-1 rounded-xl bg-amber-400 px-7 text-sm font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 sm:flex-none"
    >
      {actionLabel}
    </button>
  </div>
);
