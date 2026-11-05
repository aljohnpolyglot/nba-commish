import { ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { FICTIONAL_FRANCHISE_BRANDS } from '../../../data/fictionalFranchiseBrands';

interface Props {
  amountUSD: number;
  brand: string;
  canAfford: boolean;
  moneyPrecise: (value: number, decimals?: number) => string;
  personalWealthUSD: number;
  risk: number;
  setBrand: (brand: string) => void;
  lowerAmount: () => void;
  raiseAmount: () => void;
  brands: typeof FICTIONAL_FRANCHISE_BRANDS;
}

export default function SigningModalAspireTab({
  amountUSD,
  brand,
  brands,
  canAfford,
  lowerAmount,
  moneyPrecise,
  personalWealthUSD,
  raiseAmount,
  risk,
  setBrand,
}: Props) {
  const selected = brands.find(candidate => candidate.name === brand) ?? brands[0];
  const riskColor = risk >= 80 ? 'bg-rose-500' : risk >= 40 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-4 border-b border-white/10 pb-5">
        <ShieldAlert className="mt-1 shrink-0 text-rose-400" size={22} />
        <div>
          <h2 className="text-xl font-black italic uppercase text-white">Undisclosed side agreement</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Use personal funds to strengthen the offer outside the official contract. Discovery can cost future first-round picks.</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[9px] font-black uppercase tracking-[0.25em] text-white/35">Sponsorship</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {brands.slice(0, 12).map(candidate => (
            <button
              key={candidate.name}
              onClick={() => setBrand(candidate.name)}
              className={`flex min-h-14 items-center gap-3 rounded-sm px-3 text-left text-xs font-black transition-colors ${candidate.name === brand ? 'bg-rose-600 text-white' : 'bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white'}`}
            >
              <img src={candidate.logoUrl} alt="" className="h-8 w-8 rounded-sm object-contain bg-white/90" referrerPolicy="no-referrer" />
              <span className="min-w-0 truncate">{candidate.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3 text-[9px] font-black uppercase tracking-[0.25em] text-white/35">
          <span>Side payment</span>
          <span className={canAfford ? 'text-white/45' : 'text-rose-300'}>Personal funds {moneyPrecise(personalWealthUSD, 2)}</span>
        </div>
        <div className="flex h-16 items-center justify-between border border-white/10 bg-white/[0.04] px-4">
          <button aria-label="Lower side payment" onClick={lowerAmount} disabled={amountUSD <= 0} className="p-2 text-white/40 hover:text-white disabled:opacity-20"><ChevronLeft size={18} /></button>
          <div className="text-center">
            <div className="text-2xl font-black italic text-white">{moneyPrecise(amountUSD, 2)}</div>
            <div className="mt-1 text-[8px] font-bold uppercase tracking-widest text-white/30">Paid only if the player signs</div>
          </div>
          <button aria-label="Raise side payment" onClick={raiseAmount} disabled={amountUSD >= personalWealthUSD} className="p-2 text-white/40 hover:text-white disabled:opacity-20"><ChevronRight size={18} /></button>
        </div>
        {!canAfford && <p className="mt-2 text-xs font-bold text-rose-300">Insufficient personal funds.</p>}
      </div>

      <div className="border border-white/10 bg-black/40 p-4">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest">
          <span className="text-white/50">Risk meter</span>
          <span className={risk >= 80 ? 'text-rose-300' : risk >= 40 ? 'text-amber-300' : 'text-emerald-300'}>{risk}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full transition-[width] ${riskColor}`} style={{ width: `${risk}%` }} /></div>
        <p className="mt-3 text-xs leading-5 text-white/40">If investigators uncover the agreement, the penalty rises with the exposure.</p>
      </div>

      {selected && <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/25">ASPIRE · {selected.name}</p>}
    </div>
  );
}
