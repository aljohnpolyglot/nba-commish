import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Play } from './AllStarDunkContestSim';
import { NBAPlayer } from '../../types';

interface PlayFeedProps {
  plays: Play[];
  currentIndex: number;
  contestants: NBAPlayer[];
}

const PLAY_COLORS: Record<string, string> = {
  section_header: 'text-yellow-400 border-yellow-400/50 bg-yellow-400/5',
  player_intro: 'text-blue-400 border-blue-400/50 bg-blue-400/5',
  dunk_setup: 'text-zinc-400 border-zinc-700',
  dunk_toss: 'text-zinc-300 border-zinc-700',
  dunk_in_air: 'text-zinc-100 border-zinc-600 font-medium',
  dunk_outcome_made: 'text-emerald-400 border-emerald-400/50 bg-emerald-400/5 font-bold',
  dunk_outcome_miss: 'text-red-400 border-red-400/50 bg-red-400/5 font-bold',
  dunk_reveal: 'text-purple-400 border-purple-400/50 bg-purple-400/5 italic',
  score_reveal: 'text-white border-white/30 bg-white/5 font-black',
  perfect: 'text-yellow-400 border-yellow-400/50 bg-yellow-400/10 font-black uppercase tracking-widest',
  retry: 'text-orange-400 border-orange-400/30 italic',
  winner: 'text-yellow-400 border-yellow-400/50 bg-yellow-400/10 font-black text-lg',
  crowd_reaction: 'text-indigo-400 border-indigo-400/30 bg-indigo-400/5 italic',
};

/**
 * Narrative play-by-play feed.
 * Displays commentary with ESPN-style styling.
 */
export const PlayFeed: React.FC<PlayFeedProps> = ({ plays, currentIndex, contestants }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const getPortrait = (playerId?: string) => {
    if (!playerId) return null;
    return contestants.find(c => c.name === playerId)?.imgURL;
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentIndex]);

  const visiblePlays = plays.slice(0, currentIndex + 1);

  return (
    <div 
      ref={scrollRef}
      className="flex-1 bg-black/40 rounded-xl border border-white/5 overflow-y-auto p-4 space-y-3 scroll-smooth custom-scrollbar"
    >
      {visiblePlays.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4 opacity-50">
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-zinc-700 animate-spin-slow" />
          <p className="text-xs font-bold uppercase tracking-widest">Waiting for tip-off...</p>
        </div>
      )}
      
      {visiblePlays.map((play, i) => {
        if (play.type === 'standings' && play.standings) {
          return (
            <motion.div
              key={play.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="my-6 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl"
            >
              <div className="bg-zinc-800/50 px-4 py-2 border-b border-zinc-700 flex justify-between items-center">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{play.text}</span>
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-zinc-600" />
                  <div className="w-1 h-1 rounded-full bg-zinc-600" />
                </div>
              </div>
              <div className="p-4 space-y-3">
                {play.standings.map((s, idx) => (
                  <div key={s.id} className="space-y-1">
                    <div className="flex justify-between items-end text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-500 w-4">{idx + 1}</span>
                        <span className="font-bold text-white uppercase tracking-tight">{s.name}</span>
                      </div>
                      <span className="font-black text-white">{s.score}</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex gap-0.5">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div 
                          key={i}
                          className={`h-full flex-1 transition-all duration-500 ${
                            i < s.dunksDone 
                              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
                              : 'bg-zinc-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        }

        const colorClass = PLAY_COLORS[play.type] || 'text-zinc-400 border-zinc-800';
        const portrait = getPortrait(play.playerId);

        return (
          <motion.div
            key={play.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`p-3 rounded-lg border-l-4 transition-all duration-500 flex gap-3 ${colorClass}`}
          >
            {portrait && (
              <div className="shrink-0">
                <img 
                  src={portrait} 
                  alt="" 
                  className="w-8 h-8 rounded-full bg-black/20 border border-white/10 object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm leading-relaxed">{play.text}</p>
              {play.subtext && (
                <p className="text-xs opacity-70 mt-1 font-mono">{play.subtext}</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
