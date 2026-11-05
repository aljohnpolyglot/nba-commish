import React from 'react';
import { motion } from 'motion/react';
import { TeamData } from '../types';

export default function PlayerIntro({ teamData }: { teamData: TeamData }) {
  const isNorth = teamData.team === 'NORTH';
  const borderColor = isNorth ? 'border-blue-500' : 'border-orange-500';
  const shadowColor = isNorth ? 'shadow-blue-500/20' : 'shadow-orange-500/20';
  const textColor = isNorth ? 'text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'text-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.5)]';
  const bgAccent = isNorth ? 'bg-blue-600' : 'bg-orange-500';

  return (
    <div className={`flex flex-col items-center justify-center min-h-[520px] w-full max-w-5xl mx-auto bg-[#0b0f19] rounded-3xl border-2 ${borderColor} p-6 md:p-10 shadow-2xl ${shadowColor} relative overflow-hidden`}>
      {/* Background glow effects */}
      <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 ${isNorth ? 'bg-blue-500/10' : 'bg-orange-500/10'} blur-3xl pointer-events-none`} />

      {/* Header Title Block */}
      <div className="flex flex-col items-center text-center mb-8 relative z-10 w-full">
        <motion.h3 
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl md:text-4xl font-black italic tracking-wider text-white uppercase"
        >
          INTRODUCING
        </motion.h3>

        <motion.h1 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className={`text-5xl md:text-7xl font-black italic tracking-widest uppercase mt-1 ${textColor}`}
        >
          {teamData.name}
        </motion.h1>

        {/* Stars Divider */}
        <div className="flex items-center justify-center gap-3 mt-4 w-full max-w-md">
          <div className={`h-[1px] flex-1 bg-gradient-to-r from-transparent to-${isNorth ? 'blue' : 'orange'}-500/60`} />
          <div className="flex items-center gap-1.5 text-amber-400 text-sm md:text-base">
            <span>★</span>
            <span>★</span>
            <span>★</span>
          </div>
          <div className={`h-[1px] flex-1 bg-gradient-to-l from-transparent to-${isNorth ? 'blue' : 'orange'}-500/60`} />
        </div>
      </div>
      
      {/* 2x6 Player Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-6 md:gap-x-6 md:gap-y-8 w-full relative z-10">
        {teamData.routine.players.map((p, i) => (
          <motion.div 
            key={p.id}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 200 }}
            className="flex flex-col items-center group"
          >
            {/* Round Avatar Container */}
            <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full border-4 ${borderColor} ${bgAccent} shadow-lg overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105 p-0.5`}>
              {p.portraitUrl ? (
                <img
                  src={p.portraitUrl}
                  className="w-full h-full object-cover rounded-full bg-slate-800"
                  alt={`${p.firstName} ${p.lastName}`}
                />
              ) : (
                <span className="text-xl font-black text-white">{p.firstName.charAt(0)}{p.lastName.charAt(0)}</span>
              )}
            </div>

            {/* Player Name */}
            <div className="text-sm md:text-base font-black text-white text-center leading-tight mt-2.5 tracking-tight">
              {p.firstName} {p.lastName}
            </div>

            {/* Jersey Number */}
            <div className="text-xs font-bold text-gray-400 text-center mt-0.5">
              #{p.jerseyNumber}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
