import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Judge } from './judges';

interface JudgeRevealModalProps {
  isOpen: boolean;
  onClose: () => void;
  scores: number[];
  judges: Judge[];
  playerName: string;
}

export const JudgeRevealModal: React.FC<JudgeRevealModalProps> = ({
  isOpen,
  onClose,
  scores,
  judges,
  playerName
}) => {
  if (!isOpen) return null;

  const total = scores.reduce((a, b) => a + b, 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
        >
          <div className="p-8 text-center">
            <h2 className="text-zinc-500 uppercase tracking-widest text-sm mb-2">Judge's Scores</h2>
            <h1 className="text-4xl font-bold text-white mb-8">{playerName}</h1>

            <div className="grid grid-cols-5 gap-4 mb-12">
              {scores.map((score, idx) => (
                <motion.div
                  key={idx}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.2 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-16 h-24 bg-zinc-800 rounded-lg flex items-center justify-center mb-2 border border-zinc-700 shadow-inner">
                    <span className="text-4xl font-black text-white">{score}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase font-medium truncate w-full">
                    {judges[idx]?.name || 'Judge'}
                  </span>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.2, type: 'spring' }}
              className="inline-block"
            >
              <div className="text-zinc-500 uppercase tracking-widest text-xs mb-1">Total Score</div>
              <div className="text-8xl font-black text-white tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                {total}
              </div>
            </motion.div>
          </div>

          <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex justify-center">
            <button
              onClick={onClose}
              className="px-8 py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors"
            >
              CONTINUE
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
