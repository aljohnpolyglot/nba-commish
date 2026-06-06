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
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/80 p-4 sm:p-6 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`relative flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col items-center overflow-hidden rounded bg-[#0a0a0a] text-center shadow-2xl ${borderCls}`}
      >
        <div className="relative flex h-40 w-full items-end justify-center border-b border-white/5 bg-[#050505] pt-6 sm:h-48 sm:pt-8">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20 pointer-events-none" />
          {otherTeam?.logoUrl
            ? <img src={otherTeam.logoUrl} className="h-32 object-contain z-10" alt={otherTeam.name} referrerPolicy="no-referrer" />
            : <div className="h-24 w-24 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-black text-slate-400 z-10">{otherTeam?.abbrev ?? 'AI'}</div>}
        </div>
        <div className="relative z-20 flex w-full flex-col items-center overflow-y-auto p-5 sm:p-8">
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
          <div className="flex w-full flex-col gap-2">
            {tradeResponse.accepted ? (
              <button onClick={onFinalize} className="w-full rounded-sm bg-emerald-600 py-4 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-emerald-500">
                Finalize Trade
              </button>
            ) : (
              <>
                <button onClick={onGoBack} className="w-full rounded-sm border border-white/10 bg-white/5 py-4 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-white/10">
                  Go Back — Tweak Offer
                </button>
                <button onClick={onEndNegotiation} className="w-full rounded-sm border border-rose-500/20 bg-rose-500/10 py-3 text-[10px] font-black uppercase tracking-widest text-rose-300 transition-colors hover:bg-rose-500/20">
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
