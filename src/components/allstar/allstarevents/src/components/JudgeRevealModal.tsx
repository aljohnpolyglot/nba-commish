import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play } from '../data/AllStarDunkContestSim';
import { Judge } from '../data/judges';
import { Star, Trophy, User } from 'lucide-react';

interface JudgeRevealModalProps {
  data: NonNullable<Play['triggerJudgeModal']>;
  judges: Judge[];
  onClose: () => void;
}

export function JudgeRevealModal({ data, judges, onClose }: JudgeRevealModalProps) {
  const [phase, setPhase] = useState<'judges' | 'total'>('judges');
  const [visibleScores, setVisibleScores] = useState<number[]>([]);

  useEffect(() => {
    // Reveal scores one by one
    const timers: ReturnType<typeof setTimeout>[] = [];
    
    data.judgeScores.forEach((_, i) => {
      const t = setTimeout(() => {
        setVisibleScores(prev => [...prev, data.judgeScores[i]]);
      }, (i + 1) * 600);
      timers.push(t);
    });

    // Switch to total phase
    const totalTimer = setTimeout(() => {
      setPhase('total');
    }, (data.judgeScores.length + 1) * 600 + 400);
    timers.push(totalTimer);

    // Auto close
    const closeTimer = setTimeout(() => {
      onClose();
    }, (data.judgeScores.length + 1) * 600 + 3500);
    timers.push(closeTimer);

    return () => timers.forEach(clearTimeout);
  }, [data, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl"
      >
        {/* Header / Move Name */}
        <div className="p-6 text-center border-b border-zinc-800 bg-zinc-900/50">
          <motion.h3 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-zinc-500 text-xs font-bold tracking-[0.2em] uppercase mb-2"
          >
            Dunk Attempt Reveal
          </motion.h3>
          <motion.h2 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl font-black text-white italic uppercase tracking-tighter"
          >
            {data.moveName}
          </motion.h2>
          <div className="flex justify-center gap-4 mt-3">
            <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-1 rounded uppercase">
              Tier {data.tier}
            </span>
            <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-1 rounded uppercase">
              Attempt {data.attempts}
            </span>
          </div>
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {phase === 'judges' ? (
              <motion.div 
                key="judges"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-5 gap-4"
              >
                {judges.map((judge, idx) => (
                  <div key={judge.id} className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center overflow-hidden relative group">
                      <div 
                        className="absolute inset-0 opacity-20"
                        style={{ backgroundColor: judge.accentColor }}
                      />
                      <span className="text-lg font-bold text-white relative z-10">{judge.avatarInitials}</span>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-2 truncate w-20">
                        {judge.name}
                      </p>
                      <div className="h-12 w-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-inner">
                        <AnimatePresence>
                          {visibleScores[idx] !== undefined && (
                            <motion.span 
                              initial={{ scale: 2, opacity: 0, rotate: -20 }}
                              animate={{ scale: 1, opacity: 1, rotate: 0 }}
                              className="text-xl font-black text-white"
                            >
                              {visibleScores[idx]}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div 
                key="total"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="flex flex-col items-center py-4"
              >
                <div className="relative">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 12 }}
                    className="w-40 h-40 rounded-full border-8 border-emerald-500/20 flex items-center justify-center relative"
                  >
                    <div className="absolute inset-0 rounded-full bg-emerald-500/5 animate-pulse" />
                    <span className="text-7xl font-black text-white italic tracking-tighter">
                      {data.total}
                    </span>
                  </motion.div>
                  
                  {data.total === 50 && (
                    <motion.div 
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      className="absolute -top-4 -right-4 bg-yellow-500 text-black p-3 rounded-full shadow-lg"
                    >
                      <Star size={24} fill="currentColor" />
                    </motion.div>
                  )}
                </div>

                <div className="mt-8 text-center">
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Final Score</p>
                  <h4 className="text-2xl font-bold text-white uppercase tracking-tight">{data.playerName}</h4>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer info */}
        <div className="p-4 bg-zinc-950/50 border-t border-zinc-800 flex justify-between items-center px-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Live Scoring</span>
          </div>
          <button 
            onClick={onClose}
            className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
          >
            Skip Reveal
          </button>
        </div>
      </motion.div>
    </div>
  );
}
