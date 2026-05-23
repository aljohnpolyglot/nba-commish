import React from 'react';
import { InfoTooltip } from './InfoTooltip';

export const EconomyContractExceptionsSection = ({ props }: { props: any }) => {
  if (!props.mleEnabled) return null;

  const cap = props.salaryCap || 154_647_000;
  const dollars = (pct: number) => (cap * pct / 100);
  const setRoomPct = (pct: number) => {
    props.setRoomMlePercentage(pct);
    props.setRoomMleAmount(Math.round(dollars(pct)));
  };
  const setNtPct = (pct: number) => {
    props.setNonTaxpayerMlePercentage(pct);
    props.setNonTaxpayerMleAmount(Math.round(dollars(pct)));
  };
  const setTaxPct = (pct: number) => {
    props.setTaxpayerMlePercentage(pct);
    props.setTaxpayerMleAmount(Math.round(dollars(pct)));
  };
  const setBiaPct = (pct: number) => {
    props.setBiannualPercentage(pct);
    props.setBiannualAmount(Math.round(dollars(pct)));
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Room MLE</span>
          <InfoTooltip text="Available when team is below the salary cap. % of cap — scales automatically when the cap changes." />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{props.roomMlePercentage.toFixed(2)}% of cap → <span className="text-emerald-400 font-bold">${(dollars(props.roomMlePercentage) / 1_000_000).toFixed(3)}M</span></span>
          <span className="text-slate-600 italic">Available to: under-cap teams</span>
        </div>
        <input type="range" min="0" max="15" step="0.01" value={props.roomMlePercentage} onChange={e => setRoomPct(parseFloat(e.target.value))} className="w-full accent-emerald-500" />
      </div>

      <div className="bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Non-Taxpayer MLE</span>
          <InfoTooltip text="Available when team is above cap but below the 1st apron. % of cap." />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{props.nonTaxpayerMlePercentage.toFixed(2)}% of cap → <span className="text-blue-400 font-bold">${(dollars(props.nonTaxpayerMlePercentage) / 1_000_000).toFixed(3)}M</span></span>
          <span className="text-slate-600 italic">Available to: over-cap teams below 1st apron</span>
        </div>
        <input type="range" min="0" max="20" step="0.01" value={props.nonTaxpayerMlePercentage} onChange={e => setNtPct(parseFloat(e.target.value))} className="w-full accent-blue-500" />
      </div>

      <div className="bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">Taxpayer MLE</span>
          <InfoTooltip text="Available when a signing crosses the 1st apron, team stays below the 2nd. % of cap." />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{props.taxpayerMlePercentage.toFixed(2)}% of cap → <span className="text-yellow-400 font-bold">${(dollars(props.taxpayerMlePercentage) / 1_000_000).toFixed(3)}M</span></span>
          <span className="text-slate-600 italic">Available to: 1st-apron teams below 2nd</span>
        </div>
        <input type="range" min="0" max="10" step="0.01" value={props.taxpayerMlePercentage} onChange={e => setTaxPct(parseFloat(e.target.value))} className="w-full accent-yellow-500" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Biannual Exception</span>
          <InfoTooltip text="A smaller exception available every other year to teams below the 1st apron. Cannot be combined with any MLE." />
        </div>
        <button
          onClick={() => props.setBiannualEnabled(!props.biannualEnabled)}
          className={`w-8 h-4 rounded-full transition-all duration-200 relative ${props.biannualEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
        >
          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${props.biannualEnabled ? 'left-4.5' : 'left-0.5'}`} />
        </button>
      </div>
      {props.biannualEnabled && (
        <div className="bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-700/50">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{props.biannualPercentage.toFixed(2)}% of cap → <span className="text-slate-300 font-bold">${(dollars(props.biannualPercentage) / 1_000_000).toFixed(3)}M</span></span>
            <span className="text-slate-600 italic">Available to: below 1st apron teams</span>
          </div>
          <input type="range" min="0" max="8" step="0.01" value={props.biannualPercentage} onChange={e => setBiaPct(parseFloat(e.target.value))} className="w-full accent-slate-500" />
        </div>
      )}
    </div>
  );
};
