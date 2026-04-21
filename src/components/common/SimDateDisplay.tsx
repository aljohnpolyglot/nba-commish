import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../store/GameContext';

function formatSimDate(d: string): string {
  // d is YYYY-MM-DD; render as "Oct 27, 2025"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export const SimDateDisplay: React.FC = () => {
  const { state } = useGame();

  const isSimming = state.isProcessing && !state.lazySimProgress;
  if (!isSimming) return null;

  const isGM = state.gameMode === 'gm';
  const isLLMWait = !state.simCurrentDate;

  // GM mode: only show when actively ticking through dates
  if (isGM && isLLMWait) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={isLLMWait ? 'llm' : 'sim'}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9000] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
          </div>

          {isLLMWait ? (
            <div className="text-center">
              <p className="text-slate-400 text-sm font-medium tracking-widest uppercase">
                Processing Executive Order
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-slate-500 text-xs font-medium tracking-widest uppercase mb-1">Simulating</p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={state.simCurrentDate}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="text-white text-xl font-bold tracking-tight"
                >
                  {formatSimDate(state.simCurrentDate!)}
                </motion.p>
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
