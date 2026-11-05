import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { soundFx } from '../lib/audio';

interface PackProps {
  roundTitle: string;
  roundNumber: number;
  onOpenPack: () => void;
  isOpening: boolean;
  rosterSize: number;
}

export const Pack: React.FC<PackProps> = ({
  roundTitle,
  roundNumber,
  onOpenPack,
  isOpening,
  rosterSize,
}) => {
  const handleOpenClick = () => {
    soundFx.playPackOpen();
    onOpenPack();
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 min-h-[420px]">
      {/* Floating Mystery Pack */}
      <motion.div
        initial={{ y: 50, opacity: 0, scale: 0.95 }}
        animate={
          isOpening
            ? {
                scale: [1, 1.15, 0.9, 1.3],
                rotate: [0, -4, 4, -8, 8, 0],
                opacity: [1, 1, 0.8, 0],
              }
            : {
                y: [0, -10, 0],
                opacity: 1,
                scale: 1,
              }
        }
        transition={
          isOpening
            ? { duration: 0.75, ease: 'easeInOut' }
            : {
                y: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' },
                duration: 0.4,
              }
        }
        className="relative w-72 h-[380px] rounded-2xl bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 border-2 border-slate-700/80 shadow-2xl p-6 flex flex-col justify-between items-center overflow-hidden cursor-pointer group"
        onClick={handleOpenClick}
      >
        {/* Foil Shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />

        {/* Top Header */}
        <div className="w-full flex justify-between items-center z-10">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-800 text-amber-300 border border-slate-700 flex items-center gap-1 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            MYSTERY PACK
          </span>
          <span className="text-xs font-mono font-bold tracking-wider text-slate-300 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
            ROUND {roundNumber}/{rosterSize}
          </span>
        </div>

        {/* Pack Center Graphics */}
        <div className="relative my-auto flex flex-col items-center z-10 text-center">
          <div className="w-28 h-28 rounded-full border-2 border-amber-400/60 bg-slate-950/90 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-300 p-2">
            <div>
              <span className="block text-3xl font-black text-amber-400 font-mono">
                ?
              </span>
              <span className="block text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-1">
                3 CARDS
              </span>
            </div>
          </div>

          <h3 className="mt-4 text-xs font-black text-white tracking-wider uppercase">
            {roundTitle}
          </h3>
        </div>

        {/* Rip Line Visual */}
        <div className="w-full border-t border-dashed border-slate-700 my-2 relative z-10">
          <span className="absolute left-1/2 -top-2.5 -translate-x-1/2 bg-slate-900 text-[10px] text-slate-400 px-2 uppercase tracking-widest font-mono">
            CLICK TO OPEN
          </span>
        </div>

        {/* Action Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation();
            handleOpenClick();
          }}
          disabled={isOpening}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-xs tracking-wider uppercase shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 z-10 transition-all"
        >
          <Sparkles className="w-4 h-4 fill-slate-950" />
          OPEN PACK
        </motion.button>
      </motion.div>
    </div>
  );
};
