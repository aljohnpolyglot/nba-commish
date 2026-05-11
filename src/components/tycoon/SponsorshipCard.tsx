import React from 'react';
import { Handshake } from 'lucide-react';
import type { TycoonState, SponsorshipSlot } from '../../types/tycoon';
import { formatCurrencyWithCode } from '../../utils/helpers';

interface Props {
  tycoon: TycoonState;
  currency: string;
  onNegotiate: (slot: SponsorshipSlot) => void;
}

const SLOT_LABELS: Record<SponsorshipSlot, string> = {
  kit: 'Kit',
  sleeve: 'Sleeve',
  stadium: 'Stadium',
};

export const SponsorshipCard: React.FC<Props> = ({ tycoon, currency, onNegotiate }) => {
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="font-black uppercase tracking-widest mb-4 text-sm flex items-center gap-2">
        <Handshake size={14} className="text-amber-400" /> Sponsorship Deals
      </h2>
      <div className="space-y-3">
        {(['kit', 'sleeve', 'stadium'] as SponsorshipSlot[]).map((slot) => {
          const s = tycoon.sponsorships[slot];
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
                <>
                  <p className="text-sm font-bold text-white">{s.sponsor}</p>
                  <p className="text-xs text-slate-400">{fmt(s.valuePerYear)}/yr · <span className={s.yearsRemaining === 1 ? 'text-amber-300' : 'text-slate-400'}>{s.yearsRemaining}y left</span></p>
                </>
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
