import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileSignature } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { rfaOfferSheetSalaries } from '../../services/freeAgency/rfaOfferSheetSalaries';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { getPlayerImage } from '../../utils/playerImage';

export const RFAOfferSheetModal: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const pending = ((state as any).pendingRFAOfferSheets ?? []) as Array<{
    playerId: string;
    playerName: string;
    signingTeamName: string;
    annualM: number;
    salaryUSD?: number;
    years: number;
    expiresInDays: number;
  }>;
  const submitting = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const sheets = pending;
  const isOpen = sheets.length > 0;
  const decisionError = error ?? (state.lastOutcome?.startsWith('The offer-sheet ') ? state.lastOutcome : undefined);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [isOpen]);

  const handle = async (playerId: string, decision: 'match' | 'decline') => {
    if (submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    setError(undefined);
    try {
      await dispatchAction({
        type: decision === 'match' ? 'MATCH_RFA_OFFER' : 'DECLINE_RFA_OFFER',
        payload: { playerId },
      } as any);
    } catch {
      setError('The offer-sheet decision could not be completed. Please try again.');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[116] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rfa-offer-sheet-title"
            aria-busy={isSubmitting}
            onKeyDown={event => {
              if (event.key !== 'Tab') return;
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
              const first = buttons[0];
              const last = buttons.at(-1);
              if (!first || (event.shiftKey ? document.activeElement === first : document.activeElement === last)
                || document.activeElement === event.currentTarget) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
              }
            }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[24px] border border-fuchsia-500/40 bg-[#0f0f0f] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-fuchsia-500/[0.06] px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <FileSignature className="w-5 h-5 text-fuchsia-400" />
                <h3 id="rfa-offer-sheet-title" className="text-lg font-black text-white uppercase tracking-tight">RFA Offer Sheets</h3>
              </div>
            </div>

            <div className="overflow-y-auto p-4 sm:p-6">
              <p className="text-sm text-slate-300 mb-1">
                Your restricted free {sheets.length === 1 ? 'agent has' : 'agents have'} a signed offer sheet from another team.
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Match the contract to retain the player, or decline to let him join the offering team.
              </p>
              <div className="mb-6 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/10">
                {sheets.map(s => {
                  const totalValue = formatCurrencyWithCode(rfaOfferSheetSalaries(s.salaryUSD ?? s.annualM * 1_000_000, s.years).reduce((sum, salary) => sum + salary, 0), 'USD', false);
                  const player = state.players.find(candidate => candidate.internalId === s.playerId);
                  return (
                    <div key={s.playerId} className="px-3 py-3 flex flex-wrap items-center gap-3 text-sm">
                      <PlayerPortrait
                        imgUrl={player ? getPlayerImage(player) : undefined}
                        face={(player as any)?.face}
                        playerName={s.playerName}
                        size={38}
                      />
                      <div className="flex-1 min-w-32">
                        <div className="font-bold text-white truncate">{s.playerName}</div>
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                          <span className="text-rose-300">{s.signingTeamName}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-[#FDB927] tabular-nums">{totalValue} / {s.years}yr</span>
                          <span className="text-slate-600">·</span>
                          <span>{s.expiresInDays}d</span>
                        </div>
                      </div>
                        <div className="w-full flex items-center justify-end gap-2">
                          <button
                            onClick={() => handle(s.playerId, 'match')}
                            disabled={isSubmitting}
                            aria-label={`Match offer for ${s.playerName}`}
                            className="min-h-11 px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-md text-xs font-black uppercase tracking-widest transition-colors border border-emerald-500/30 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                          >
                            Match
                          </button>
                          <button
                            onClick={() => handle(s.playerId, 'decline')}
                            disabled={isSubmitting}
                            aria-label={`Decline offer for ${s.playerName}`}
                            className="min-h-11 px-3 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded-md text-xs font-black uppercase tracking-widest transition-colors border border-rose-500/30 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                          >
                            Decline
                          </button>
                        </div>
                    </div>
                  );
                })}
              </div>
              {decisionError && <p role="alert" className="text-sm text-rose-300">{decisionError}</p>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
