import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NBAPlayer, Play } from '../../../../services/allStar/AllStarDunkContestSim';

interface ScoreboardProps {
  contestants: NBAPlayer[];
  liveScores: Record<string, number>;
  currentPlay: Play | null;
  winnerId?: string;
  simResult: any;
}

export const DunkContestScoreboard: React.FC<ScoreboardProps> = ({ contestants, liveScores, currentPlay, winnerId, simResult }) => {
  const currentRound = currentPlay?.round ?? 'round1';
  const finalistNames = simResult?.round2?.map((r: any) => r.playerName) ?? [];

  return (
    <div className="w-full flex flex-wrap justify-center gap-3">
      <AnimatePresence mode="popLayout">
        {contestants.map((p) => {
          const score = liveScores[p.name] || 0;
          const isActive = currentPlay?.activePlayer === p.name;
          const isWinner = winnerId === p.name;
          const isEliminated = currentRound === 'finals' && !finalistNames.includes(p.name);

          if (isEliminated) return null;

          return (
            <motion.div
              key={p.internalId || p.name}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.3 } }}
              className={`relative p-3 rounded-xl border transition-all duration-500 overflow-hidden flex-1 min-w-[200px] max-w-sm ${
                isActive
                  ? 'bg-zinc-800 border-white/40 shadow-[0_0_20px_rgba(255,255,255,0.1)] scale-[1.02]'
                  : isWinner
                  ? 'bg-emerald-900/40 border-emerald-500'
                  : 'bg-zinc-900/80 border-white/10 opacity-60'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-glow"
                  className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"
                />
              )}

              <div className="flex items-center space-x-3 relative z-10">
                <div className={`relative w-14 h-14 rounded-lg overflow-hidden bg-black/40 border transition-transform duration-500 ${isActive ? 'border-white/30 scale-110' : 'border-white/5'}`}>
                  <img
                    src={p.imgURL}
                    alt={p.name}
                    className={`w-full h-full object-cover transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-50'}`}
                    referrerPolicy="no-referrer"
                  />
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-black uppercase tracking-widest truncate ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                    {p.name.split(' ').pop()}
                  </p>
                  <div className="flex items-baseline space-x-1">
                    <span className={`text-2xl font-black tracking-tighter transition-colors duration-500 ${isActive ? 'text-white' : 'text-zinc-400'}`}>
                      {score}
                    </span>
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">
                      PTS
                    </span>
                  </div>
                </div>
              </div>

              {isActive && (
                <div className="absolute top-0 right-0">
                  <div className="bg-white text-black text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-tighter">
                    ON DECK
                  </div>
                </div>
              )}

              {isWinner && (
                <div className="absolute -top-2 -right-2 bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg">
                  CHAMPION
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
