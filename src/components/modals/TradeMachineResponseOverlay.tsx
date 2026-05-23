import React from 'react';
import { motion } from 'motion/react';
import type { NBATeam } from '../../types';

export const TradeMachineResponseOverlay: React.FC<{
  tradeResponse: { accepted: boolean; gmName: string; reason: string; suggestion?: string };
  otherTeam?: NBATeam;
  onFinalize: () => void;
  onGoBack: () => void;
  onEndNegotiation: () => void;
}> = ({ tradeResponse, otherTeam, onFinalize, onGoBack, onEndNegotiation }) => {
  const borderCls = tradeResponse.accepted ? 'border-emerald-500/30' : 'border-rose-500/30';
  const headlineCls = tradeResponse.accepted ? 'text-emerald-400' : 'text-rose-400';
  const eyebrowCls = tradeResponse.accepted ? 'text-emerald-300' : 'text-rose-300';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`relative w-full max-w-md bg-[#0a0a0a] border ${borderCls} shadow-2xl rounded flex flex-col items-center text-center overflow-hidden`}
      >
        <div className="w-full h-48 bg-[#050505] relative flex items-end justify-center pt-8 border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
          {otherTeam?.logoUrl
            ? <img src={otherTeam.logoUrl} className="h-32 object-contain z-10" alt={otherTeam.name} referrerPolicy="no-referrer" />
            : <div className="h-24 w-24 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-black text-slate-400 z-10">{otherTeam?.abbrev ?? 'AI'}</div>}
        </div>
        <div className="p-8 w-full flex flex-col items-center relative z-20">
          <p className={`text-[10px] font-black uppercase tracking-[0.4em] mb-2 ${eyebrowCls}`}>
            {otherTeam?.region} {otherTeam?.name} Front Office
          </p>
          <h2 className={`text-2xl font-black italic uppercase tracking-wider mb-1 ${headlineCls}`}>
            {tradeResponse.accepted ? 'Noice doing business.' : 'No Deal'}
          </h2>
          <p className="text-[11px] font-bold text-white/50 mb-4">{tradeResponse.gmName}</p>
          <p className="text-white/80 italic mb-3 leading-relaxed text-sm">"{tradeResponse.reason}"</p>
          {!tradeResponse.accepted && tradeResponse.suggestion && (
            <p className="text-amber-300 italic text-sm mb-3 leading-relaxed bg-amber-500/5 border border-amber-500/20 rounded px-3 py-2">
              "{tradeResponse.suggestion}"
            </p>
          )}
          {!tradeResponse.accepted && (
            <p className="text-white/50 text-xs mb-6 leading-relaxed">
              Rework the offer, add future picks, or come back later when the market shifts.
            </p>
          )}
          {tradeResponse.accepted && <div className="mb-5" />}
          <div className="flex flex-col gap-2 w-full">
            {tradeResponse.accepted ? (
              <button onClick={onFinalize} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm">
                Finalize Trade
              </button>
            ) : (
              <>
                <button onClick={onGoBack} className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm">
                  Go Back — Tweak Offer
                </button>
                <button onClick={onEndNegotiation} className="w-full py-3 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-300 font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm">
                  End Negotiation
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
