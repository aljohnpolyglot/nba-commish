import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, CheckCircle, Eye, X } from 'lucide-react';
import type { NBAPlayer } from '../../types';

export type ResignIntentLabel = 'ready_to_extend' | 'open' | 'testing_market' | 'farewell' | 'not_expiring';

export interface ExpiringRow {
  player: NBAPlayer;
  intent: ResignIntentLabel;
  offerSalaryUSD: number;
  offerYears: number;
}

interface ExpiringResignGateModalProps {
  isOpen: boolean;
  rows: ExpiringRow[];
  onAssistant: () => void;
  onManual: () => void;
  onDismiss: () => void;
  onMakeOffer: (playerId: string) => void;
  onReject: (playerId: string) => void;
  offeredIds: Set<string>;
  rejectedIds: Set<string>;
}

const intentBadge = (intent: ResignIntentLabel) => {
  switch (intent) {
    case 'ready_to_extend': return { text: 'Wants to extend', cls: 'text-emerald-300' };
    case 'open':            return { text: 'Open',           cls: 'text-sky-300'     };
    case 'testing_market':  return { text: 'Testing FA',     cls: 'text-slate-500'   };
    case 'farewell':        return { text: 'Retiring',       cls: 'text-rose-300'    };
    default:                return { text: '',               cls: 'text-slate-500'   };
  }
};

export const ExpiringResignGateModal: React.FC<ExpiringResignGateModalProps> = ({
  isOpen,
  rows,
  onAssistant,
  onManual,
  onDismiss,
  onMakeOffer,
  onReject,
  offeredIds,
  rejectedIds,
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[114] flex items-center justify-center p-4 md:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/90 backdrop-blur-md"
          onClick={onDismiss}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-[#0f0f0f] border border-indigo-500/30 rounded-[24px] w-full max-w-lg shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-indigo-500/[0.05]">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-black text-white uppercase tracking-tight">Expiring Contracts</h3>
            </div>
            <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-6">
            <p className="text-sm text-slate-300 mb-1">
              These players hit unrestricted free agency when the offseason opens.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Make an early offer to lock them in, or let them walk to the open market. Players testing the market won't accept early offers — wait for FA to sign them.
            </p>
            <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 max-h-72 overflow-y-auto">
              {rows.map(({ player, intent, offerSalaryUSD, offerYears }) => {
                const offered = offeredIds.has(player.internalId);
                const rejected = rejectedIds.has(player.internalId);
                const decided = offered || rejected;
                const willingToSign = intent === 'ready_to_extend' || intent === 'open';
                const annualM = Math.round(offerSalaryUSD / 100_000) / 10;
                const totalM = Math.round(annualM * offerYears);
                const badge = intentBadge(intent);
                return (
                  <div key={player.internalId} className="px-3 py-2 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white truncate">{player.name}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-2">
                        <span className={badge.cls}>{badge.text}</span>
                        <span className="text-slate-600">·</span>
                        <span className="tabular-nums">${totalM}M / {offerYears}yr</span>
                      </div>
                    </div>
                    {decided ? (
                      <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-1 ${offered ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {offered ? 'Offered' : 'Letting Walk'}
                      </span>
                    ) : willingToSign ? (
                      <div className="shrink-0 flex items-center gap-1.5">
                        <button
                          onClick={() => onMakeOffer(player.internalId)}
                          className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-emerald-500/30"
                        >
                          Make Offer
                        </button>
                        <button
                          onClick={() => onReject(player.internalId)}
                          className="px-2 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-rose-500/30"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span
                        className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-600 px-2 py-1"
                        title={intent === 'testing_market' ? 'Player wants to test the open market — no early offers' : 'Player is retiring at season end'}
                      >
                        Unavailable
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              {(() => {
                const total = rows.length;
                const decidedCount = rows.filter(r =>
                  offeredIds.has(r.player.internalId) ||
                  rejectedIds.has(r.player.internalId) ||
                  !(r.intent === 'ready_to_extend' || r.intent === 'open')
                ).length;
                // Make Offer dispatches SIGN_FREE_AGENT which bumps contract.exp,
                // dropping the player from the rows memo. Treat empty-with-decisions
                // as all-done so the button collapses to Done.
                const anyDecisions = offeredIds.size + rejectedIds.size > 0;
                const allDone = (total === 0 && anyDecisions) || (total > 0 && decidedCount === total);
                if (allDone) {
                  return (
                    <button
                      onClick={onAssistant}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                    >
                      <CheckCircle size={14} />
                      Done
                    </button>
                  );
                }
                return (
                  <>
                    <button
                      onClick={onAssistant}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                    >
                      <Bot size={14} />
                      Assistant GM: Offer All Willing
                    </button>
                    <button
                      onClick={onManual}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white/8 hover:bg-white/12 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors border border-white/10"
                    >
                      <Eye size={14} />
                      Review Manually
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
