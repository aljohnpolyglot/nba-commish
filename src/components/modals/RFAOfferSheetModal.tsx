import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, FileSignature, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';

export const RFAOfferSheetModal: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const pending = ((state as any).pendingRFAOfferSheets ?? []) as Array<{
    playerId: string;
    playerName: string;
    signingTeamName: string;
    annualM: number;
    years: number;
    expiresInDays: number;
  }>;
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());

  const sheets = useMemo(() => pending, [pending]);
  const isOpen = sheets.length > 0;

  const handle = (playerId: string, decision: 'match' | 'decline') => {
    if (decidedIds.has(playerId)) return;
    setDecidedIds(prev => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
    dispatchAction({
      type: decision === 'match' ? 'MATCH_RFA_OFFER' : 'DECLINE_RFA_OFFER',
      payload: { playerId },
    } as any);
    // Remove this entry from the queue so the modal closes once everyone's decided.
    const remaining = pending.filter(s => s.playerId !== playerId);
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingRFAOfferSheets: remaining } });
  };

  const dismiss = () => {
    // Clear any sheets the user hasn't decided yet (they default to letting walk via the AI tick).
    dispatchAction({ type: 'UPDATE_STATE' as any, payload: { pendingRFAOfferSheets: [] } });
    setDecidedIds(new Set());
  };

  const allDecided = sheets.every(s => decidedIds.has(s.playerId));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[116] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={dismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-[#0f0f0f] border border-fuchsia-500/40 rounded-[24px] w-full max-w-lg shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-fuchsia-500/[0.06]">
              <div className="flex items-center gap-3">
                <FileSignature className="w-5 h-5 text-fuchsia-400" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight">RFA Offer Sheets</h3>
              </div>
              <button onClick={dismiss} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-300 mb-1">
                Your restricted free {sheets.length === 1 ? 'agent has' : 'agents have'} a signed offer sheet from another team.
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Match the contract to retain via Bird Rights, or decline and let the offering team have him.
              </p>
              <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 max-h-72 overflow-y-auto">
                {sheets.map(s => {
                  const decided = decidedIds.has(s.playerId);
                  const totalM = Math.round(s.annualM * s.years);
                  return (
                    <div key={s.playerId} className="px-3 py-2 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white truncate">{s.playerName}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2">
                          <span className="text-rose-300">{s.signingTeamName}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-[#FDB927] tabular-nums">${totalM}M / {s.years}yr</span>
                          <span className="text-slate-600">·</span>
                          <span>{s.expiresInDays}d</span>
                        </div>
                      </div>
                      {decided ? (
                        <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-emerald-400 px-2 py-1">
                          Submitted
                        </span>
                      ) : (
                        <div className="shrink-0 flex items-center gap-1.5">
                          <button
                            onClick={() => handle(s.playerId, 'match')}
                            className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-emerald-500/30"
                          >
                            Match
                          </button>
                          <button
                            onClick={() => handle(s.playerId, 'decline')}
                            className="px-2 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-rose-500/30"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={dismiss}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-fuchsia-500 hover:bg-fuchsia-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                >
                  <CheckCircle size={14} />
                  {allDecided ? 'Done' : 'Close'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
