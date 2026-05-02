import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, CheckCircle, Eye, X } from 'lucide-react';
import type { NBAPlayer } from '../../types';

interface TeamOptionGateModalProps {
  isOpen: boolean;
  players: NBAPlayer[];
  onAssistant: () => void;
  onManual: () => void;
  onDismiss: () => void;
  onExerciseOne?: (playerId: string) => void;
  onDeclineOne?: (playerId: string) => void;
  exercisedIds?: Set<string>;
  declinedIds?: Set<string>;
}

export const TeamOptionGateModal: React.FC<TeamOptionGateModalProps> = ({
  isOpen,
  players,
  onAssistant,
  onManual,
  onDismiss,
  onExerciseOne,
  onDeclineOne,
  exercisedIds,
  declinedIds,
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 md:p-6">
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
          className="relative bg-[#0f0f0f] border border-emerald-500/30 rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-emerald-500/[0.05]">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <h3 className="text-lg font-black text-white uppercase tracking-tight">Team Options Due</h3>
            </div>
            <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-6">
            <p className="text-sm text-slate-300 mb-4">
              Your front office has team-option decisions before free agency opens. Exercise keeps the player for the listed option year; decline sends him to free agency.
            </p>
            <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 max-h-40 overflow-y-auto">
              {players.map(p => {
                const exercised = exercisedIds?.has(p.internalId);
                const declined = declinedIds?.has(p.internalId);
                const decided = exercised || declined;
                return (
                  <div key={p.internalId} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-white truncate flex-1">{p.name}</span>
                    <span className="text-emerald-300 tabular-nums shrink-0">
                      ${(((p.contract?.amount ?? 0) * 1000) / 1_000_000).toFixed(1)}M
                    </span>
                    {(onExerciseOne || onDeclineOne) && (
                      decided ? (
                        <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-1 ${exercised ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {exercised ? 'Exercised' : 'Declined'}
                        </span>
                      ) : (
                        <div className="shrink-0 flex items-center gap-1.5">
                          {onExerciseOne && (
                            <button
                              onClick={() => onExerciseOne(p.internalId)}
                              className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-emerald-500/30"
                            >
                              Exercise
                            </button>
                          )}
                          {onDeclineOne && (
                            <button
                              onClick={() => onDeclineOne(p.internalId)}
                              className="px-2 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-rose-500/30"
                            >
                              Decline
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              {(() => {
                const total = players.length;
                const decidedCount = players.filter(p => exercisedIds?.has(p.internalId) || declinedIds?.has(p.internalId)).length;
                const anyDecisions = (exercisedIds?.size ?? 0) + (declinedIds?.size ?? 0) > 0;
                const allDone = (total === 0 && anyDecisions) || (total > 0 && decidedCount === total);
                if (allDone) {
                  return (
                    <button
                      onClick={onAssistant}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                    >
                      <CheckCircle size={14} />
                      Done
                    </button>
                  );
                }
                return (
                  <button
                    onClick={onAssistant}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                  >
                    <Bot size={14} />
                    Assistant GM: Exercise All
                  </button>
                );
              })()}
              <button
                onClick={onManual}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
              >
                <Eye size={14} />
                Review Manually
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
