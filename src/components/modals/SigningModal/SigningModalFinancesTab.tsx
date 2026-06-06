import type { ReactElement } from 'react';

type MleType = 'room' | 'non_taxpayer' | 'taxpayer' | null;

interface SigningModalFinancesTabProps {
  initialOffer: {
    salaryUSD: number;
    years: number;
    tier: string;
  };
  mle: {
    type: MleType;
    available: number;
    limit: number;
    blocked: boolean;
  };
  money: (value: number) => string;
  playerOverallRating?: number;
  teamPayroll: number;
  thresholds: {
    salaryCap: number;
    luxuryTax: number;
    firstApron: number;
    secondApron: number;
  };
}

export default function SigningModalFinancesTab({
  initialOffer,
  mle,
  money,
  playerOverallRating,
  teamPayroll,
  thresholds,
}: SigningModalFinancesTabProps): ReactElement {
  const showMleRow = !!mle.type;
  const mleLabel = mle.type === 'room'
    ? 'Room MLE Remaining'
    : mle.type === 'non_taxpayer'
      ? 'Non-Taxpayer MLE Remaining'
      : 'Taxpayer MLE Remaining';
  const mleValue = `${money(mle.available)} / ${money(mle.limit)}`;
  const mleAccent = mle.blocked ? 'text-rose-400' : 'text-emerald-400';
  const capSpace = thresholds.salaryCap - teamPayroll;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-8">
      <div className="space-y-5 sm:space-y-6">
        <div className="bg-white/[0.04] p-4 sm:p-7 rounded-sm border border-white/5">
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#e21d37] mb-5 italic border-b border-[#e21d37]/20 pb-3">
            Roster Financials
          </h4>
          {[
            { label: 'Total Active Payroll', value: money(teamPayroll), accent: 'text-white' },
            { label: 'Cap Space Remaining', value: money(capSpace), accent: capSpace >= 0 ? 'text-emerald-400' : 'text-rose-400' },
            { label: 'Luxury Tax Line', value: money(thresholds.luxuryTax), accent: 'text-white' },
            { label: 'First Apron', value: money(thresholds.firstApron), accent: 'text-amber-400' },
            ...(showMleRow ? [{ label: mleLabel, value: mleValue, accent: mleAccent }] : []),
          ].map(({ label, value, accent }) => (
            <div key={label} className="flex justify-between items-center py-3 border-b border-white/[0.04] last:border-0">
              <span className="text-[10px] font-bold uppercase text-white/40 tracking-wide">{label}</span>
              <span className={`text-sm font-black italic ${accent}`}>{value}</span>
            </div>
          ))}
        </div>

        <div className="bg-white/[0.04] p-4 sm:p-7 rounded-sm border border-white/5">
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-4 italic">Market Value</h4>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-1.5 h-14 bg-emerald-500 rounded-full" />
            <div>
              <span className="text-xl sm:text-2xl font-black italic text-white break-words">
                {money(initialOffer.salaryUSD)}
                <span className="text-xs text-white/30 not-italic ml-2">/ {initialOffer.years} Yrs</span>
              </span>
              <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1">
                Based on OVR {playerOverallRating} — Tier {initialOffer.tier}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#0d0d0d] p-4 sm:p-7 rounded-sm border border-white/5">
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-6 italic">CBA Thresholds</h4>
        <div className="space-y-5">
          {[
            { label: 'Salary Cap', val: thresholds.salaryCap },
            { label: 'Luxury Tax', val: thresholds.luxuryTax },
            { label: 'First Apron', val: thresholds.firstApron },
            { label: 'Second Apron', val: thresholds.secondApron },
          ].map(({ label, val }) => (
            <div key={label}>
              <div className="flex justify-between text-[9px] font-bold text-white/30 uppercase mb-1.5">
                <span>{label}</span>
                <span>{money(val)}</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#e21d37] to-[#e21d37]/60 rounded-full"
                  style={{ width: `${Math.min(100, (teamPayroll / val) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
