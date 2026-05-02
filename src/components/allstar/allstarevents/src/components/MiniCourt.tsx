import React from 'react';
import { NBAPlayer, Play } from '../data/AllStarDunkContestSim';

interface MiniCourtProps {
  contestants: NBAPlayer[];
  currentPlay: Play | null;
  liveScores: Record<string, number>;
}

/**
 * SVG-based Mini Court for visual feedback.
 * Shows player positions, active dunker, and score indicators.
 */
export const MiniCourt: React.FC<MiniCourtProps> = ({ contestants, currentPlay, liveScores }) => {
  const activePlayerId = currentPlay?.playerId;
  const launchSpot = (currentPlay as any)?.launchSpot || 'Top of Key';

  // Map launch spots to SVG coordinates (100x100 grid)
  const spotCoords: Record<string, { x: number; y: number }> = {
    'Top of Key': { x: 50, y: 80 },
    'Left Wing': { x: 20, y: 70 },
    'Right Wing': { x: 80, y: 70 },
    'Left Corner': { x: 10, y: 90 },
    'Right Corner': { x: 90, y: 90 },
    'Baseline': { x: 50, y: 95 },
  };

  const activeCoord = spotCoords[launchSpot] || { x: 50, y: 80 };

  return (
    <div className="relative w-full aspect-video bg-zinc-900 rounded-xl border border-white/10 overflow-hidden shadow-2xl">
      <svg viewBox="0 0 100 100" className="w-full h-full opacity-40">
        {/* Court Lines */}
        <rect x="5" y="5" width="90" height="90" fill="none" stroke="white" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="15" fill="none" stroke="white" strokeWidth="0.5" />
        <line x1="5" y1="50" x2="95" y2="50" stroke="white" strokeWidth="0.5" />
        
        {/* Three Point Line (Simplified) */}
        <path d="M 5 80 Q 50 60 95 80" fill="none" stroke="white" strokeWidth="0.5" />
        
        {/* The Key */}
        <rect x="35" y="70" width="30" height="25" fill="none" stroke="white" strokeWidth="0.5" />
        
        {/* The Rim */}
        <circle cx="50" cy="92" r="2" fill="none" stroke="#f97316" strokeWidth="1" />
      </svg>

      {/* Player Avatars */}
      <div className="absolute inset-0">
        {contestants.map((p, i) => {
          const isActive = p.nbaId === activePlayerId;
          const isWinner = false; // Could be passed in
          
          // Position contestants on the sideline if not active
          const sidelineX = 10 + i * 20;
          const sidelineY = 10;
          
          const x = isActive ? activeCoord.x : sidelineX;
          const y = isActive ? activeCoord.y : sidelineY;

          return (
            <div 
              key={p.nbaId}
              className={`absolute transition-all duration-700 ease-in-out transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div className={`relative w-10 h-10 rounded-full border-2 overflow-hidden shadow-lg ${isActive ? 'border-orange-500 scale-125 z-10' : 'border-white/20 scale-100 opacity-60'}`}>
                <img 
                  src={p.imgURL} 
                  alt={p.name} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                {isActive && (
                  <div className="absolute inset-0 bg-orange-500/20 animate-pulse" />
                )}
              </div>
              <span className={`text-[10px] font-bold mt-1 px-1 rounded ${isActive ? 'bg-orange-500 text-white' : 'bg-black/50 text-white/70'}`}>
                {p.name.split(' ').pop()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Visual Effects for Dunk */}
      {currentPlay?.type === 'dunk_outcome_made' && (
        <div className="absolute left-1/2 top-[92%] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-16 h-16 bg-orange-500/40 rounded-full animate-ping" />
        </div>
      )}
    </div>
  );
};
