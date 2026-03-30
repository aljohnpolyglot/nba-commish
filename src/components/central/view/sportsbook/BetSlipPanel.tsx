import React from 'react';
import { Layers, Trash2, XCircle, AlertCircle, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../../../../utils/helpers';
import { SlipLeg, SlipMode, decimalToAmerican, combinedOdds } from './sportsbookTypes';
import { SlipEmptyPlaceholder } from './SportsbookShared';

interface BetSlipPanelProps {
  slipLegs: SlipLeg[];
  slipMode: SlipMode;
  wagerStr: string;
  setWagerStr: (v: string) => void;
  setSlipMode: (m: SlipMode) => void;
  setSlipLegs: React.Dispatch<React.SetStateAction<SlipLeg[]>>;
  removeLeg: (id: string) => void;
  handlePlace: () => void;
  maxWagerDollars: number; // personalWealth * 1_000_000
}

const QUICK_AMOUNTS = [10, 50, 100, 500];

export const BetSlipPanel: React.FC<BetSlipPanelProps> = ({
  slipLegs, slipMode, wagerStr, setWagerStr,
  setSlipMode, setSlipLegs, removeLeg, handlePlace, maxWagerDollars
}) => {
  const wager = Math.max(0, parseFloat(wagerStr) || 0);
  const parlayOdds = combinedOdds(slipLegs);
  const potentialPayout = wager * (slipMode === 'parlay' ? parlayOdds : (slipLegs[0]?.odds ?? 1));
  const overBudget = wager > maxWagerDollars;

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-slate-800/60">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Bet Slip
            {slipLegs.length > 0 && (
              <span className="bg-emerald-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {slipLegs.length}
              </span>
            )}
          </h3>
          {slipLegs.length > 0 && (
            <button onClick={() => setSlipLegs([])} className="text-slate-600 hover:text-rose-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex bg-slate-900/60 rounded-lg p-0.5">
          {(['single', 'parlay'] as SlipMode[]).map(m => (
            <button key={m}
              onClick={() => {
                setSlipMode(m);
                if (m === 'single' && slipLegs.length > 1)
                  setSlipLegs(prev => [prev[prev.length - 1]]);
              }}
              className={`flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all
                ${slipMode === m ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {m === 'single' ? 'Single' : `Parlay${slipLegs.length > 1 ? ` (${slipLegs.length})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      {/* Legs */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {slipLegs.length === 0 ? <SlipEmptyPlaceholder /> : slipLegs.map(leg => (
          <div key={leg.id} className="bg-slate-900/60 rounded-lg p-3 border border-emerald-500/20 relative group">
            <button onClick={() => removeLeg(leg.id)} className="absolute top-2 right-2 text-slate-700 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100">
              <XCircle className="w-3.5 h-3.5" />
            </button>
            <p className="text-xs font-bold text-white pr-5 leading-snug">{leg.description}</p>
            {leg.subDescription && <p className="text-[10px] text-slate-500 mt-0.5">{leg.subDescription}</p>}
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                {leg.type === 'moneyline' ? 'Moneyline' : leg.type === 'spread' ? 'Spread' : 'O/U'}
              </span>
              <span className="text-sm font-black text-amber-400 font-mono">{decimalToAmerican(leg.odds)}</span>
            </div>
          </div>
        ))}

        {slipMode === 'parlay' && slipLegs.length > 1 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-0.5">Combined Odds</p>
            <p className="text-xl font-black text-emerald-400 font-mono">{decimalToAmerican(parlayOdds)}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{parlayOdds.toFixed(2)}x</p>
          </div>
        )}
      </div>

      {/* Wager Footer */}
      {slipLegs.length > 0 && (
        <div className="p-4 border-t border-slate-800/60 space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
              Wager <span className="text-slate-600 normal-case font-normal">(actual $)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={wagerStr}
                onChange={e => {
                  const v = e.target.value;
                  // Allow empty, digits, and one decimal point
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setWagerStr(v);
                }}
                onFocus={e => e.target.select()}
                placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-700/60 rounded-lg py-2 pl-7 pr-3 text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-500/60 transition-colors"
              />
            </div>
            <div className="grid grid-cols-4 gap-1 mt-1.5">
              {QUICK_AMOUNTS.map(amt => (
                <button key={amt} onClick={() => setWagerStr(String(amt))}
                  className="bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-white text-[10px] font-bold py-1 rounded transition-colors border border-slate-700/40">
                  ${amt >= 1000 ? `${amt / 1000}k` : amt}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/50 rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Wager</span>
              <span className="text-white font-mono font-bold">{formatCurrency(wager, false)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Odds</span>
              <span className="text-amber-400 font-mono font-bold">
                {decimalToAmerican(slipMode === 'parlay' ? parlayOdds : slipLegs[0]?.odds ?? 1)}
              </span>
            </div>
            <div className="border-t border-slate-700/40 pt-1.5 flex justify-between">
              <span className="text-xs font-bold text-slate-400">To Win</span>
              <span className="text-base font-black text-emerald-400 font-mono">
                {formatCurrency(potentialPayout - wager, false)}
              </span>
            </div>
          </div>

          <button
            onClick={handlePlace}
            disabled={wager <= 0 || overBudget}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm uppercase tracking-widest shadow-[0_4px_20px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_28px_rgba(16,185,129,0.4)] disabled:shadow-none"
          >
            <CheckCircle className="w-4 h-4" />
            Place {slipMode === 'parlay' ? 'Parlay' : 'Bet'}
          </button>
          {overBudget && (
            <p className="text-rose-400 text-[10px] font-bold text-center flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" /> Insufficient funds
            </p>
          )}
        </div>
      )}
    </>
  );
};
