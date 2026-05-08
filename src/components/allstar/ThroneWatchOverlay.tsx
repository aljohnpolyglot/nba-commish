import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, X, Play, Pause, ChevronRight, FastForward, Trophy } from 'lucide-react';
import { TournamentBracket } from '../../throne/components/TheThroneGame/Bracket';
import { toThronePlayer } from '../../services/allStar/throneOrchestrator';
import type { Match as ThroneMatch } from '../../throne/types/throne';
import { getPlayerImage } from '../central/view/bioCache';

interface ThroneWatchOverlayProps {
  throne: any;            // state.allStar.throne — bracket + champion already simulated
  players: any[];
  onClose: () => void;
}

const ROUND_LABELS: Record<number, string> = {
  1: 'Round of 16',
  2: 'Quarterfinals',
  3: 'Semifinals',
  4: 'The Final',
};

/**
 * Read-only replay of a pre-simulated Throne tournament.
 * Progressively reveals matches; show champion when all matches consumed.
 * The simulation has already happened — this is purely a playback view.
 */
export const ThroneWatchOverlay: React.FC<ThroneWatchOverlayProps> = ({ throne, players, onClose }) => {
  const persisted: any[] = throne?.bracket ?? [];
  const total = persisted.length;
  const [revealed, setRevealed] = useState(0);
  const [autoplay, setAutoplay] = useState(true);

  // Build adapted match objects once. Reveal index controls which winners are visible.
  const baseMatches: ThroneMatch[] = useMemo(() => {
    return persisted.map((m: any, idx: number) => {
      const np1 = players.find(p => p.internalId === m.player1Id);
      const np2 = players.find(p => p.internalId === m.player2Id);
      const p1 = np1 ? toThronePlayer(np1, idx * 2 + 1) : null;
      const p2 = np2 ? toThronePlayer(np2, idx * 2 + 2) : null;
      return {
        id: `${m.round}-${idx}`,
        round: m.round,
        player1: p1,
        player2: p2,
        // resolved from persisted record
        _resolvedWinner: m.winnerId === m.player1Id ? p1 : m.winnerId === m.player2Id ? p2 : null,
        _resolvedScore1: m.score1 ?? 0,
        _resolvedScore2: m.score2 ?? 0,
        winner: null,
        score1: 0,
        score2: 0,
      } as any;
    });
  }, [persisted, players]);

  // Project matches at current reveal index — past matches show their winner; future ones blank.
  const matches: ThroneMatch[] = useMemo(() => {
    return baseMatches.map((m: any, idx: number) => {
      if (idx < revealed) {
        return {
          id: m.id,
          round: m.round,
          player1: m.player1,
          player2: m.player2,
          winner: m._resolvedWinner,
          score1: m._resolvedScore1,
          score2: m._resolvedScore2,
        } as ThroneMatch;
      }
      return {
        id: m.id,
        round: m.round,
        player1: m.player1,
        player2: m.player2,
        winner: null,
        score1: 0,
        score2: 0,
      } as ThroneMatch;
    });
  }, [baseMatches, revealed]);

  const finished = revealed >= total;
  const currentMatch = !finished ? baseMatches[revealed] : null;

  // Autoplay tick
  useEffect(() => {
    if (!autoplay || finished) return;
    const t = setTimeout(() => setRevealed(r => Math.min(total, r + 1)), 1800);
    return () => clearTimeout(t);
  }, [autoplay, revealed, total, finished]);

  const champ = throne?.champion;
  const champPlayer = champ ? players.find(p => p.internalId === champ.playerId) : null;
  const champPortrait = champPlayer ? getPlayerImage(champPlayer) : null;
  const totalPD = champ ? (throne.cumulativePDs?.[champ.playerId] ?? 0) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 shrink-0">
        <div className="flex items-center gap-3">
          <Crown className="w-5 h-5 text-yellow-400" />
          <div>
            <h2 className="text-base font-black italic tracking-tight text-white uppercase">The Throne · Replay</h2>
            <p className="text-[10px] font-mono text-zinc-500 tracking-wider">Match {Math.min(revealed + (finished ? 0 : 1), total)} / {total}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!finished && (
            <>
              <button
                onClick={() => setAutoplay(a => !a)}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
              >
                {autoplay ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
                {autoplay ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={() => setRevealed(r => Math.min(total, r + 1))}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
              >
                <ChevronRight size={12} />
                Next
              </button>
              <button
                onClick={() => { setAutoplay(false); setRevealed(total); }}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
              >
                <FastForward size={12} />
                Skip
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body — bracket fills the screen, champion overlay when done */}
      <div className="flex-1 overflow-auto p-6 relative">
        <TournamentBracket matches={matches} currentMatchIndex={finished ? -1 : revealed} />

        {/* Current matchup announcement bar */}
        <AnimatePresence>
          {currentMatch && (
            <motion.div
              key={currentMatch.id}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-950/95 backdrop-blur border border-yellow-500/40 rounded-2xl px-6 py-4 flex items-center gap-6 shadow-2xl shadow-yellow-500/10"
            >
              <span className="text-[9px] font-black tracking-[0.3em] text-yellow-400">{ROUND_LABELS[currentMatch.round] ?? `Round ${currentMatch.round}`}</span>
              <div className="text-sm font-black text-white">{currentMatch.player1?.lastName ?? 'TBD'}</div>
              <div className="text-zinc-700 text-xs font-black italic">VS</div>
              <div className="text-sm font-black text-white">{currentMatch.player2?.lastName ?? 'TBD'}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Champion celebration */}
        <AnimatePresence>
          {finished && champ && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.7, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 18 }}
                className="relative max-w-md mx-auto text-center px-8 py-10 rounded-3xl border-2 border-yellow-500/50 bg-gradient-to-br from-yellow-500/15 via-amber-500/5 to-zinc-950 shadow-[0_0_80px_rgba(250,204,21,0.3)]"
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                  <Trophy className="w-12 h-12 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]" />
                </div>
                <span className="text-[10px] font-black tracking-[0.3em] text-yellow-400 mb-3 inline-block mt-4">KING OF 1V1</span>
                <div className="relative w-32 h-32 mx-auto mb-4">
                  <div className="w-full h-full rounded-full overflow-hidden border-4 border-yellow-400 shadow-[0_0_60px_rgba(250,204,21,0.5)]">
                    {champPortrait ? (
                      <img src={champPortrait} alt={champ.playerName} className="w-full h-full object-cover object-top" />
                    ) : (
                      <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-black text-3xl">
                        {champ.playerName.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                    )}
                  </div>
                  <Crown className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,1)]" />
                </div>
                <h2 className="text-3xl font-black italic tracking-tighter text-white">{champ.playerName}</h2>
                <p className="text-xs text-yellow-400/80 mt-2 mb-6 tracking-wider font-bold">CHAMPION · CUMULATIVE PD +{totalPD}</p>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 text-black font-black text-xs uppercase tracking-widest"
                >
                  Close
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
