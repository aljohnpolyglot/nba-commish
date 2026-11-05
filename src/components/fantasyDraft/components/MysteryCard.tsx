import React from 'react';
import { motion } from 'motion/react';
import { CardOption } from '../types';
import { HelpCircle } from 'lucide-react';
import { soundFx } from '../lib/audio';
import { ClueRenderer } from './ClueRenderer';

interface MysteryCardProps {
  option: CardOption;
  cardNumber: number; // 1, 2, or 3
  onSelect: (option: CardOption) => void;
  disabled?: boolean;
}

export const MysteryCard: React.FC<MysteryCardProps> = ({
  option,
  cardNumber,
  onSelect,
  disabled,
}) => {
  const { clues } = option;

  const handleMouseEnter = () => {
    soundFx.playHover();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: cardNumber * 0.08 }}
      whileHover={{ scale: 1.04, y: -6 }}
      whileTap={{ scale: 0.96 }}
      onMouseEnter={handleMouseEnter}
      onClick={() => !disabled && onSelect(option)}
      className="relative w-64 h-[370px] rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-slate-700/80 hover:border-amber-400 shadow-xl hover:shadow-amber-500/20 p-5 flex flex-col justify-between cursor-pointer group transition-colors duration-300 select-none overflow-hidden"
    >
      {/* Subtle Background Foil Texture */}
      <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Card Header */}
      <div className="flex justify-between items-center z-10 border-b border-slate-800 pb-2">
        <span className="text-xs font-mono font-bold text-slate-300 group-hover:text-amber-300 uppercase tracking-widest flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
          CARD {cardNumber}
        </span>
        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
          MYSTERY
        </span>
      </div>

      {/* Mystery Emblem */}
      <div className="my-2 flex flex-col items-center justify-center z-10">
        <div className="w-16 h-16 rounded-full bg-slate-800/90 border border-slate-700 group-hover:border-amber-400/80 flex items-center justify-center text-3xl font-black text-amber-400 shadow-inner group-hover:scale-110 transition-transform duration-300">
          ?
        </div>
        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mt-2">
          BLIND PICK
        </p>
      </div>

      {/* Exposed Factual Clues Box */}
      <div className="z-10 bg-slate-950/90 rounded-xl p-3 border border-slate-800/80 space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1">
          EXPOSED CLUES ({clues.exposedClues.length})
        </div>
        {clues.exposedClues.map((clue, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs font-mono gap-1">
            <span className="text-slate-400 font-bold shrink-0">{clue.label}:</span>
            <ClueRenderer clue={clue} />
          </div>
        ))}
      </div>

      {/* Select CTA */}
      <button
        disabled={disabled}
        className="w-full mt-2 py-2.5 rounded-lg bg-slate-800 group-hover:bg-amber-500 group-hover:text-slate-950 text-slate-200 group-hover:font-black font-bold text-xs uppercase tracking-wider transition-colors duration-200 z-10"
      >
        SELECT CARD
      </button>
    </motion.div>
  );
};
