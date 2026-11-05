import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TeamData } from '../types';
import { Star, RefreshCw, Lightbulb, Users, Trophy, X } from 'lucide-react';
import { sfx } from '../utils/sfx';

interface ScoreBoardProps {
  north: TeamData;
  south: TeamData;
  onComplete: () => void;
}

export default function ScoreBoard({ north, south, onComplete }: ScoreBoardProps) {
  const [revealIndex, setRevealIndex] = useState(0);

  useEffect(() => {
    // Sound trigger on reveal steps
    if (revealIndex === 1 || revealIndex === 7) {
      sfx.playWhoosh();
    } else if (
      (revealIndex >= 2 && revealIndex <= 5) || 
      (revealIndex >= 8 && revealIndex <= 11)
    ) {
      sfx.playTick();
    } else if (revealIndex === 6) {
      sfx.playScoreBang();
      if (north.scores.finalScore < 80 || north.routine.style === 'Awkward' || north.routine.mood === 'Goofy') {
        sfx.playCrowdBoo();
      } else {
        sfx.playCrowdCheer();
      }
    } else if (revealIndex === 12) {
      sfx.playScoreBang();
      if (south.scores.finalScore < 80 || south.routine.style === 'Awkward' || south.routine.mood === 'Goofy') {
        sfx.playCrowdBoo();
      } else {
        sfx.playCrowdCheer();
      }
    } else if (revealIndex === 13) {
      sfx.playFanfare();
      sfx.playCrowdCheer();
    }

    if (revealIndex < 13) {
      const timer = setTimeout(() => {
        setRevealIndex(r => r + 1);
      }, revealIndex === 6 || revealIndex === 12 ? 1800 : 500); 
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        onComplete();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [revealIndex, onComplete]);

  const northWinner = north.scores.finalScore >= south.scores.finalScore;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#080d1a] border border-cyan-900/40 rounded-3xl p-6 md:p-8 max-w-4xl w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden"
      >
        {/* Subtle glowing mesh background */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

        <button 
          onClick={onComplete}
          className="absolute top-6 right-6 text-gray-400 hover:text-white bg-gray-800/60 p-2 rounded-full border border-gray-700/50 transition-all hover:scale-110 z-20"
          title="Show winner"
          aria-label="Show winner"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6 md:mb-8 relative z-10">
          <div className="text-amber-400 font-bold uppercase text-xs md:text-sm tracking-[0.3em] mb-1 flex items-center justify-center gap-2">
            <span>★</span> GRAND REVEAL <span>★</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 drop-shadow-md">
            DANCE CONTEST
          </h1>
        </div>

        {/* Both Teams Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
          
          {/* TEAM NORTH CARD */}
          <div className="flex flex-col bg-gradient-to-b from-blue-950/40 via-[#0a1224] to-[#080d1a] border border-blue-500/40 rounded-2xl p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_0_20px_rgba(59,130,246,0.15)] relative overflow-hidden">
            {/* Blue glowing header light */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_10px_#3b82f6]" />

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-900/60 border border-blue-400/50 flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                {/* Shield Icon */}
                <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-3zm0 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/>
                </svg>
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-blue-400 italic tracking-wide drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">
                {north.name}
              </h3>
            </div>

            <div className="h-[1px] w-full bg-blue-500/20 mb-4" />

            {/* Sub Metrics */}
            <div className="flex flex-col gap-3 min-h-[140px] justify-center text-sm font-semibold text-gray-300">
              {revealIndex >= 2 && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <Star className="w-4 h-4 text-blue-400" /> Entertainment
                  </span>
                  <span className="border-b border-dotted border-gray-700 flex-1 mx-3 h-1" />
                  <span className="text-white font-bold text-base">{north.scores.entertainment}</span>
                </motion.div>
              )}

              {revealIndex >= 3 && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <RefreshCw className="w-4 h-4 text-blue-400" /> Synchronization
                  </span>
                  <span className="border-b border-dotted border-gray-700 flex-1 mx-3 h-1" />
                  <span className="text-white font-bold text-base">{north.scores.synchronization}</span>
                </motion.div>
              )}

              {revealIndex >= 4 && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <Lightbulb className="w-4 h-4 text-blue-400" /> Creativity
                  </span>
                  <span className="border-b border-dotted border-gray-700 flex-1 mx-3 h-1" />
                  <span className="text-white font-bold text-base">{north.scores.creativity}</span>
                </motion.div>
              )}

              {revealIndex >= 5 && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-blue-400" /> Crowd Appeal
                  </span>
                  <span className="border-b border-dotted border-gray-700 flex-1 mx-3 h-1" />
                  <span className="text-white font-bold text-base">{north.scores.crowdAppeal}</span>
                </motion.div>
              )}
            </div>

            {/* Final Score */}
            <div className="mt-4 pt-3 border-t border-blue-500/20 text-center min-h-[90px] flex flex-col items-center justify-center">
              {revealIndex >= 6 && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                  <div className="text-[11px] text-blue-300 uppercase tracking-[0.25em] font-extrabold mb-1">
                    — FINAL SCORE —
                  </div>
                  <div className="text-5xl md:text-6xl font-black text-blue-400 italic tracking-tight drop-shadow-[0_0_20px_rgba(59,130,246,0.8)] font-mono">
                    {north.scores.finalScore.toFixed(1)}
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* TEAM SOUTH CARD */}
          <div className="flex flex-col bg-gradient-to-b from-orange-950/40 via-[#160d08] to-[#080d1a] border border-orange-500/40 rounded-2xl p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_0_20px_rgba(249,115,22,0.15)] relative overflow-hidden">
            {/* Orange glowing header light */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] bg-gradient-to-r from-transparent via-orange-400 to-transparent shadow-[0_0_10px_#f97316]" />

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-900/60 border border-orange-400/50 flex items-center justify-center shadow-[0_0_10px_rgba(249,115,22,0.3)]">
                {/* Shield Icon */}
                <svg className="w-6 h-6 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-3zm0 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/>
                </svg>
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-orange-400 italic tracking-wide drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]">
                {south.name}
              </h3>
            </div>

            <div className="h-[1px] w-full bg-orange-500/20 mb-4" />

            {/* Sub Metrics */}
            <div className="flex flex-col gap-3 min-h-[140px] justify-center text-sm font-semibold text-gray-300">
              {revealIndex >= 8 && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <Star className="w-4 h-4 text-orange-400" /> Entertainment
                  </span>
                  <span className="border-b border-dotted border-gray-700 flex-1 mx-3 h-1" />
                  <span className="text-white font-bold text-base">{south.scores.entertainment}</span>
                </motion.div>
              )}

              {revealIndex >= 9 && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <RefreshCw className="w-4 h-4 text-orange-400" /> Synchronization
                  </span>
                  <span className="border-b border-dotted border-gray-700 flex-1 mx-3 h-1" />
                  <span className="text-white font-bold text-base">{south.scores.synchronization}</span>
                </motion.div>
              )}

              {revealIndex >= 10 && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <Lightbulb className="w-4 h-4 text-orange-400" /> Creativity
                  </span>
                  <span className="border-b border-dotted border-gray-700 flex-1 mx-3 h-1" />
                  <span className="text-white font-bold text-base">{south.scores.creativity}</span>
                </motion.div>
              )}

              {revealIndex >= 11 && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-orange-400" /> Crowd Appeal
                  </span>
                  <span className="border-b border-dotted border-gray-700 flex-1 mx-3 h-1" />
                  <span className="text-white font-bold text-base">{south.scores.crowdAppeal}</span>
                </motion.div>
              )}
            </div>

            {/* Final Score */}
            <div className="mt-4 pt-3 border-t border-orange-500/20 text-center min-h-[90px] flex flex-col items-center justify-center">
              {revealIndex >= 12 && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                  <div className="text-[11px] text-orange-300 uppercase tracking-[0.25em] font-extrabold mb-1">
                    — FINAL SCORE —
                  </div>
                  <div className="text-5xl md:text-6xl font-black text-orange-400 italic tracking-tight drop-shadow-[0_0_20px_rgba(249,115,22,0.8)] font-mono">
                    {south.scores.finalScore.toFixed(1)}
                  </div>
                </motion.div>
              )}
            </div>
          </div>

        </div>

        {/* CHAMPION BANNER */}
        <div className="mt-6 min-h-[110px] relative z-10 flex items-center justify-center">
          <AnimatePresence>
            {revealIndex >= 13 && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="w-full bg-gradient-to-r from-amber-950/80 via-yellow-900/60 to-amber-950/80 border-2 border-amber-500/80 rounded-2xl p-4 md:p-6 text-center relative overflow-hidden shadow-[0_0_35px_rgba(234,179,8,0.3)] flex flex-col md:flex-row items-center justify-center gap-4"
              >
                {/* Golden background light flares */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.25)_0%,transparent_70%)] pointer-events-none" />

                {/* Trophy Graphic */}
                <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-amber-500/20 border-2 border-amber-400/80 rounded-full shadow-[0_0_20px_rgba(251,191,36,0.6)] flex-shrink-0">
                  <Trophy className="w-10 h-10 md:w-12 md:h-12 text-yellow-300 drop-shadow-[0_0_10px_rgba(253,224,71,0.8)]" />
                </div>

                <div className="flex flex-col items-center md:items-start text-center md:text-left">
                  <div className="text-amber-300 uppercase tracking-[0.3em] font-black text-xs md:text-sm flex items-center gap-2">
                    <span>🌿</span> DANCE CONTEST CHAMPIONS <span>🌿</span>
                  </div>
                  <div className={`text-4xl md:text-6xl font-black italic tracking-wider uppercase text-transparent bg-clip-text ${
                    northWinner 
                      ? 'bg-gradient-to-r from-blue-200 via-blue-400 to-cyan-300 drop-shadow-[0_0_15px_rgba(59,130,246,0.8)]' 
                      : 'bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-100 drop-shadow-[0_0_20px_rgba(234,179,8,0.9)]'
                  }`}>
                    {northWinner ? north.name : south.name}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </motion.div>
    </div>
  );
}
