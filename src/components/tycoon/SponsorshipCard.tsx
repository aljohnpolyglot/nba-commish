import React from 'react';
import { Handshake } from 'lucide-react';
import type { TycoonState, SponsorshipSlot } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { HelpIconPopover } from './HelpIconPopover';
import { SponsorLogo } from './SponsorLogo';
import { getBrandMeta } from '../../data/sponsorCatalogFetcher';

interface Props {
  tycoon: TycoonState;
  currency: string;
  onNegotiate: (slot: SponsorshipSlot) => void;
  onTicketMultChange?: (mult: number) => void;
  avgOpponentPrestige?: number;
  marqueeOpponents?: string[];
}

const SLOT_LABELS: Partial<Record<SponsorshipSlot, string>> = {
  kit: 'Kit',
  sleeve: 'Sleeve',
  back: 'Back',
  shorts: 'Shorts',
  training: 'Training',
  court: 'Court',
  stadium: 'Stadium',
  practice: 'Practice',
};

export const SponsorshipCard: React.FC<Props> = ({ tycoon, currency, onNegotiate }) => {
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const sponsorships = tycoon.sponsorships ?? {};
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="font-black uppercase tracking-widest mb-4 text-sm flex items-center gap-2">
        <Handshake size={14} className="text-amber-400" /> Sponsorship Deals
        <HelpIconPopover
          title="Sponsorship Slots"
          body={
            <>
              <p>Three independent slots: <strong>Kit</strong> (trikotbrust), <strong>Sleeve</strong>, and <strong>Stadium</strong> (naming rights). Each has its own multi-year deal.</p>
              <p>When a deal runs out (Years left = 0), the row opens in the offseason. Accept the market offer or decline — declining drops you to a default fallback worth ~50% of your tier floor.</p>
              <p>Sponsors pay more after sporting success: Endesa top-4 finishes and EuroLeague Final Four runs boost your next renewal by up to +45%.</p>
            </>
          }
        />
      </h2>
      <div className="space-y-3">
        {(['kit', 'sleeve', 'stadium'] as SponsorshipSlot[]).map((slot) => {
          const s = sponsorships[slot];
          const expired = s === null;
          return (
            <div key={slot} className={`rounded-xl border p-3 ${expired ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700 bg-slate-900/40'}`}>
              <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{SLOT_LABELS[slot]}</span>
                <button
                  onClick={() => onNegotiate(slot)}
                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${expired ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {expired ? 'Renew Available →' : 'Negotiate'}
                </button>
              </div>
              {s ? (
                <div className="flex items-center gap-2.5">
                  <SponsorLogo name={s.sponsor} meta={getBrandMeta('spain', s.sponsor)} industry={s.industry ?? 'generic'} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{s.sponsor}</p>
                    <p className="text-xs text-slate-400">{fmt(s.valuePerYear)}/yr · <span className={s.yearsRemaining === 1 ? 'text-amber-300' : 'text-slate-400'}>{s.yearsRemaining}y left</span></p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm font-bold text-amber-300">Default Fallback</p>
                  <p className="text-xs text-slate-500">No active deal — negotiate a new sponsor</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
