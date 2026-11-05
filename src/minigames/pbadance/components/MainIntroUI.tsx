import React from 'react';
import { motion } from 'motion/react';
import { Play, Music, Users, Lightbulb, Heart, Trophy } from 'lucide-react';
import { PlayerAnim } from '../types';

interface MainIntroUIProps {
  onStart: () => void;
  northCaptain?: PlayerAnim;
  southCaptain?: PlayerAnim;
  northName?: string;
  southName?: string;
}

export default function MainIntroUI({ onStart, northCaptain, southCaptain, northName = 'TEAM NORTH', southName = 'TEAM SOUTH' }: MainIntroUIProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="w-full max-w-6xl bg-[#070b14] border border-slate-800 rounded-[2.5rem] p-6 md:p-10 shadow-[0_0_80px_rgba(0,0,0,0.95)] relative overflow-hidden flex flex-col justify-between min-h-[620px] my-auto"
    >
      {/* Stadium Floodlight Glows */}
      <div className="absolute -top-20 -left-20 w-96 h-96 bg-blue-600/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-96 h-96 bg-orange-600/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Section: Stadium Lighting, Team Titles & Captain Portraits */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center text-center">
        
        {/* Left: TEAM NORTH Captain Portrait */}
        <div className="flex flex-col items-center md:items-start order-2 md:order-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <h2 className="text-3xl md:text-4xl font-black italic tracking-widest text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]">
              {northName}
            </h2>
          </div>
          
          {/* Team Captain Portrait Badge */}
          <div className="flex flex-col items-center md:items-start mt-2">
            <div className="relative group">
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-blue-500 bg-blue-950/80 shadow-[0_0_25px_rgba(59,130,246,0.6)] overflow-hidden p-0.5 relative transition-transform duration-300 group-hover:scale-105">
                {northCaptain?.portraitUrl ? (
                  <img
                    src={northCaptain.portraitUrl}
                    className="w-full h-full object-cover rounded-full bg-slate-800"
                    alt={`${northCaptain.firstName} ${northCaptain.lastName}`}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl font-black text-blue-200">
                    {northCaptain?.firstName.charAt(0)}{northCaptain?.lastName.charAt(0)}
                  </span>
                )}
              </div>
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-700 to-blue-500 text-white font-black text-[10px] tracking-wider uppercase px-3 py-0.5 rounded-full border border-blue-300 shadow-[0_2px_8px_rgba(0,0,0,0.8)] whitespace-nowrap">
                CAPTAIN
              </span>
            </div>
            
            {northCaptain && (
              <div className="mt-3 text-center md:text-left">
                <div className="text-white font-black text-sm md:text-base tracking-tight drop-shadow">
                  {northCaptain.firstName} {northCaptain.lastName}
                </div>
                <div className="text-blue-400 font-bold text-xs tracking-wider">
                  #{northCaptain.jerseyNumber}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Main Title Header */}
        <div className="flex flex-col items-center order-1 md:order-2">
          {/* Top Star Accent */}
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-widest mb-2">
            <span className="text-blue-400">★</span>
            <span className="text-amber-400">★</span>
            <span className="text-orange-400">★</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-white to-orange-400 leading-none drop-shadow-[0_4px_25px_rgba(255,255,255,0.2)]">
            DANCE
          </h1>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-slate-100 to-orange-300 leading-tight mt-1 drop-shadow-md">
            CONTEST
          </h1>
        </div>

        {/* Right: TEAM SOUTH Captain Portrait */}
        <div className="flex flex-col items-center md:items-end order-3">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-3xl md:text-4xl font-black italic tracking-widest text-orange-400 drop-shadow-[0_0_15px_rgba(249,115,22,0.6)]">
                  {southName}
            </h2>
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          </div>

          {/* Team Captain Portrait Badge */}
          <div className="flex flex-col items-center md:items-end mt-2">
            <div className="relative group">
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-orange-500 bg-orange-950/80 shadow-[0_0_25px_rgba(249,115,22,0.6)] overflow-hidden p-0.5 relative transition-transform duration-300 group-hover:scale-105">
                {southCaptain?.portraitUrl ? (
                  <img
                    src={southCaptain.portraitUrl}
                    className="w-full h-full object-cover rounded-full bg-slate-800"
                    alt={`${southCaptain.firstName} ${southCaptain.lastName}`}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl font-black text-orange-200">
                    {southCaptain?.firstName.charAt(0)}{southCaptain?.lastName.charAt(0)}
                  </span>
                )}
              </div>
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-700 to-orange-500 text-white font-black text-[10px] tracking-wider uppercase px-3 py-0.5 rounded-full border border-orange-300 shadow-[0_2px_8px_rgba(0,0,0,0.8)] whitespace-nowrap">
                CAPTAIN
              </span>
            </div>
            
            {southCaptain && (
              <div className="mt-3 text-center md:text-right">
                <div className="text-white font-black text-sm md:text-base tracking-tight drop-shadow">
                  {southCaptain.firstName} {southCaptain.lastName}
                </div>
                <div className="text-orange-400 font-bold text-xs tracking-wider">
                  #{southCaptain.jerseyNumber}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Middle Interactive Call to Action */}
      <div className="relative z-10 flex flex-col items-center justify-center my-8 text-center">
        <div className="text-amber-400 text-lg mb-2">★</div>
        <p className="text-gray-200 text-base md:text-lg font-medium max-w-md">
          Two teams enter. One routine each.
        </p>
        <p className="text-gray-400 text-sm md:text-base max-w-md mb-8">
          Who has the best moves, formation, and crowd appeal?
        </p>

        {/* Glowing Pill Start Contest Button */}
        <button
          onClick={onStart}
          className="group relative inline-flex items-center justify-center gap-3.5 px-10 py-4 bg-black/80 hover:bg-black rounded-full border-2 border-amber-500/80 shadow-[0_0_30px_rgba(234,179,8,0.4)] transition-all duration-300 hover:scale-105 active:scale-95"
        >
          {/* Outer glowing border ring */}
          <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-blue-500 via-amber-400 to-orange-500 opacity-70 group-hover:opacity-100 blur-sm transition-opacity pointer-events-none" />
          
          <div className="relative z-10 flex items-center gap-3 bg-gradient-to-r from-slate-900 via-black to-slate-900 px-8 py-3 rounded-full border border-amber-400/50">
            <Play className="w-5 h-5 text-white fill-white" />
            <span className="text-xl font-black italic tracking-wider uppercase text-white drop-shadow-md">
              START CONTEST
            </span>
          </div>
        </button>
      </div>

      {/* Scoring Criteria Icons Row */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto w-full my-4">
        
        {/* Entertainment */}
        <div className="flex flex-col items-center text-center p-3 bg-slate-900/40 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-full bg-blue-900/60 border border-blue-400/50 flex items-center justify-center text-blue-400 mb-2 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
            <Music className="w-5 h-5" />
          </div>
          <div className="text-xs font-black tracking-wider text-blue-400 uppercase">ENTERTAINMENT</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Showmanship & energy</div>
        </div>

        {/* Synchronization */}
        <div className="flex flex-col items-center text-center p-3 bg-slate-900/40 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-full bg-purple-900/60 border border-purple-400/50 flex items-center justify-center text-purple-400 mb-2 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
            <Users className="w-5 h-5" />
          </div>
          <div className="text-xs font-black tracking-wider text-purple-400 uppercase">SYNCHRONIZATION</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Timing, unity & precision</div>
        </div>

        {/* Creativity */}
        <div className="flex flex-col items-center text-center p-3 bg-slate-900/40 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-full bg-amber-900/60 border border-amber-400/50 flex items-center justify-center text-amber-400 mb-2 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div className="text-xs font-black tracking-wider text-amber-400 uppercase">CREATIVITY</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Originality & execution</div>
        </div>

        {/* Crowd Appeal */}
        <div className="flex flex-col items-center text-center p-3 bg-slate-900/40 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-full bg-rose-900/60 border border-rose-400/50 flex items-center justify-center text-rose-400 mb-2 shadow-[0_0_10px_rgba(244,63,94,0.3)]">
            <Heart className="w-5 h-5" />
          </div>
          <div className="text-xs font-black tracking-wider text-rose-400 uppercase">CROWD APPEAL</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Fan reaction & hype</div>
        </div>

      </div>

      {/* Bottom Footer Bar */}
      <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold">
        
        {/* Left Tagline */}
        <div className="flex items-center gap-2">
          <span className="text-blue-400 text-sm">★</span>
          <div>
            <div className="text-blue-400 font-extrabold tracking-wider">ONE ROUTINE.</div>
            <div className="text-gray-500 text-[10px] tracking-widest uppercase">ALL HEART.</div>
          </div>
        </div>

        {/* Center Golden Trophy */}
        <div className="flex items-center justify-center w-12 h-12 bg-amber-500/10 border border-amber-500/40 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.4)]">
          <Trophy className="w-6 h-6 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
        </div>

        {/* Right Tagline */}
        <div className="flex items-center gap-2 text-right">
          <div>
            <div className="text-orange-400 font-extrabold tracking-wider">ONE WINNER.</div>
            <div className="text-gray-500 text-[10px] tracking-widest uppercase">OWN THE FLOOR.</div>
          </div>
          <span className="text-orange-400 text-sm">★</span>
        </div>

      </div>

    </motion.div>
  );
}
