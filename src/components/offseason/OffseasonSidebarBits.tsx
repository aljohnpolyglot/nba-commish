import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, CheckCircle, FileSignature, Sparkles, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { NBAPlayer } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';

interface QualifyingOfferModalProps {
  isOpen: boolean;
  players: NBAPlayer[];
  leagueStats: any;
  submittedIds: Set<string>;
  skippedIds: Set<string>;
  onSubmitOne: (playerId: string) => void;
  onSkipOne: (playerId: string) => void;
  onAssistant: () => void;
  onDismiss: () => void;
}

export const ExpansionSchedulePin: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const schedule = (state as any).expansionSchedule;
  const lsYear = state.leagueStats?.year;
  if (!schedule || lsYear == null || schedule.year < lsYear) return null;
  if (state.leagueStats?.uiMode === 'euro_isolated' || state.leagueStats?.uiMode === 'pba_isolated') return null;

  const isThisYear = schedule.year === lsYear;
  const teamCount = schedule.teams?.length ?? 0;

  return (
    <div className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
      isThisYear
        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
        : 'bg-zinc-800/40 border-zinc-700 text-zinc-300'
    }`}>
      <Sparkles size={14} className={isThisYear ? 'text-emerald-400' : 'text-amber-400'} />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-black uppercase tracking-tight">
          Expansion {isThisYear ? 'this offseason' : `scheduled for ${schedule.year}`}
        </div>
        <div className="text-[9px] opacity-70">
          {teamCount} new franchise{teamCount === 1 ? '' : 's'}
        </div>
      </div>
      <button
        onClick={() => dispatchAction({ type: 'CLEAR_EXPANSION_SCHEDULE' } as any)}
        title="Cancel scheduled expansion"
        className="text-zinc-500 hover:text-rose-400 shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  );
};

export const QualifyingOfferModal: React.FC<QualifyingOfferModalProps> = ({
  isOpen, players, leagueStats, submittedIds, skippedIds,
  onSubmitOne, onSkipOne, onAssistant, onDismiss,
}) => {
  const computeQOAmount = (p: NBAPlayer): number => {
    const lastSalaryUSD = (p.contract?.amount ?? 0) * 1_000;
    const rawMin = leagueStats?.minContract ?? 1.273;
    const minSalaryUSD = rawMin > 1000 ? rawMin : rawMin * 1_000_000;
    return Math.max(Math.round(lastSalaryUSD * 1.3), Math.round(minSalaryUSD * 1.5));
  };
  const fmtUSD = (n: number) => n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : `$${(n / 1_000).toFixed(0)}K`;

  return (
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
            className="relative bg-[#0f0f0f] border border-fuchsia-500/30 rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-fuchsia-500/[0.05]">
              <div className="flex items-center gap-3">
                <FileSignature className="w-5 h-5 text-fuchsia-400" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Qualifying Offers</h3>
              </div>
              <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-300 mb-4">
                Submit a qualifying offer to make this expiring R1 rookie a <span className="font-black text-fuchsia-300">restricted free agent</span> — you keep match rights when other teams come calling. Skip = he walks as UFA.
              </p>
              {players.length === 0 ? (
                <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center text-sm text-emerald-200 font-bold">
                  No expiring R1 rookies on your roster — nothing to submit.
                </div>
              ) : (
                <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 max-h-60 overflow-y-auto">
                  {players.map(p => {
                    const submitted = submittedIds.has(p.internalId);
                    const skipped = skippedIds.has(p.internalId);
                    const decided = submitted || skipped;
                    const qoUSD = computeQOAmount(p);
                    const r = (p as any).ratings?.[(p as any).ratings?.length - 1];
                    const k2 = convertTo2KRating(p.overallRating ?? 0, r?.hgt ?? 50, r?.tp ?? 50);
                    return (
                      <div key={p.internalId} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-500">K2 {k2} · QO {fmtUSD(qoUSD)} / 1yr</div>
                        </div>
                        {decided ? (
                          <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-1 ${submitted ? 'text-fuchsia-300' : 'text-rose-400'}`}>
                            {submitted ? 'Submitted' : 'Skipped'}
                          </span>
                        ) : (
                          <div className="shrink-0 flex items-center gap-1.5">
                            <button
                              onClick={() => onSubmitOne(p.internalId)}
                              className="px-2 py-1 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-fuchsia-500/30"
                            >
                              Submit
                            </button>
                            <button
                              onClick={() => onSkipOne(p.internalId)}
                              className="px-2 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-rose-500/30"
                            >
                              Skip
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {(() => {
                  const total = players.length;
                  const decidedCount = players.filter(p => submittedIds.has(p.internalId) || skippedIds.has(p.internalId)).length;
                  const allDone = total === 0 || decidedCount === total;
                  if (allDone) {
                    return (
                      <button
                        onClick={onDismiss}
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
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-fuchsia-500 hover:bg-fuchsia-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                    >
                      <Bot size={14} />
                      Assistant GM: Handle Likely Keepers
                    </button>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
