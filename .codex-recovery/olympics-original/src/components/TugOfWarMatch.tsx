import React, { useState, useEffect, useRef } from 'react';
import { Player, EventResult } from '../types';

interface TugOfWarMatchProps {
  players: Player[];
  gameSeed: number;
  onFinish: (results: any[]) => void;
  isPaused?: boolean;
}

export function TugOfWarMatch({ players, gameSeed, onFinish, isPaused }: TugOfWarMatchProps) {
  const [phase, setPhase] = useState<'intro' | 'playing' | 'finished'>('intro');
  const [ropePositions, setRopePositions] = useState<number>(0);
  
  const team1Players = players.filter((_, i) => i % 2 === 0);
  const team2Players = players.filter((_, i) => i % 2 !== 0);

  const team1Power = team1Players.reduce((sum, p) => sum + (p.str * 0.65 + (Math.min(99, p.weightLbs / 300 * 99)) * 0.35), 0);
  const team2Power = team2Players.reduce((sum, p) => sum + (p.str * 0.65 + (Math.min(99, p.weightLbs / 300 * 99)) * 0.35), 0);

  // Add slight randomness from gameSeed
  const t1Actual = team1Power + (gameSeed % 10);
  const t2Actual = team2Power + ((gameSeed * 7) % 10);
  
  const powerDiff = t1Actual - t2Actual;
  const isMatchClose = Math.abs(powerDiff) < (players.length * 3 + 5);
  
  const isPausedRef = useRef(false);
  isPausedRef.current = !!isPaused;

  useEffect(() => {
     if (phase === 'intro') {
         const t = setTimeout(() => {
             setPhase('playing');
         }, 2500);
         return () => clearTimeout(t);
     } else if (phase === 'playing') {
         let lastTick = performance.now();
         let currentX = 0;
         let frameId: number;
         let timeElapsed = 0;

         const tick = (now: number) => {
             if (isPausedRef.current) {
                 lastTick = now;
                 frameId = requestAnimationFrame(tick);
                 return;
             }

             const dt = (now - lastTick) / 1000; // seconds
             lastTick = now;
             timeElapsed += dt;

             // Noise / back and forth
             const noise = Math.sin(timeElapsed * 5) * 5 + Math.cos(timeElapsed * 3.1) * 3;
             
             // Base pull speed based on difference
             // If power diff is 20, pull speed is e.g. 5 units / sec
             const baseSpeed = powerDiff * 0.8;
             
             // Mismatched -> quick pull. Matched -> back and forth
             let targetVel = baseSpeed;
             
             // If closely matched, make it struggle more
             if (isMatchClose) {
                 targetVel = baseSpeed * 0.2 + noise;
             } else {
                 // Add small noise anyway
                 targetVel += noise * 0.3;
             }

             currentX += targetVel * dt;
             
             // limit cap
             if (currentX > 50) currentX = 50;
             if (currentX < -50) currentX = -50;

             setRopePositions(currentX);

             // Win condition: pulled absolute 40 units from center
             if (Math.abs(currentX) >= 40) {
                 setPhase('finished');
             } else {
                 frameId = requestAnimationFrame(tick);
             }
         };
         frameId = requestAnimationFrame(tick);
         return () => cancelAnimationFrame(frameId);
     } else if (phase === 'finished') {
         const t = setTimeout(() => {
             // Calculate results
             const team1Won = ropePositions >= 40;
             
             const t1Results = team1Players.map(p => ({
                 player: p,
                 score: team1Won ? 1 : 2,
                 displayScore: team1Won ? 'WINNER' : 'Loser',
                 isSurprise: false,
                 rank: team1Won ? 1 : 2,
                 teamMembers: team1Players,
                 teamColorIdx: 0 // amber
             }));
             const t2Results = team2Players.map(p => ({
                 player: p,
                 score: !team1Won ? 1 : 2,
                 displayScore: !team1Won ? 'WINNER' : 'Loser',
                 isSurprise: false,
                 rank: !team1Won ? 1 : 2,
                 teamMembers: team2Players,
                 teamColorIdx: 1 // blue
             }));
             
             onFinish([t1Results[0], t2Results[0]]); 
         }, 2000);
         return () => clearTimeout(t);
     }
  }, [phase, powerDiff, isMatchClose]);

  useEffect(() => {
     if (phase === 'finished') {
         // See finished block above
     }
  }, [phase]);

  return (
    <div className="flex flex-col h-auto md:h-[70vh] bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl relative">
       
      {phase === 'intro' && (
          <div className="absolute inset-0 z-50 bg-zinc-950/90 backdrop-blur flex flex-col items-center justify-center animate-in fade-in duration-500">
              <h2 className="text-4xl font-black text-white tracking-widest uppercase mb-4 text-center">
                  Tug of War
              </h2>
              <p className="text-amber-500 font-mono tracking-widest text-lg">
                  Amber vs Blue
              </p>
          </div>
      )}
      
      {phase === 'finished' && (
          <div className="absolute inset-0 z-50 bg-zinc-950/80 backdrop-blur flex flex-col items-center justify-center animate-in zoom-in-95 duration-500">
              <h2 className="text-5xl font-black text-white tracking-widest uppercase mb-4 text-center drop-shadow-2xl">
                  {ropePositions >= 40 ? 'Team Amber Wins!' : 'Team Blue Wins!'}
              </h2>
          </div>
      )}

      {/* 3D Canvas Representation using SVG */}
      <div className="h-48 md:flex-1 relative overflow-hidden bg-[#2D452B] border-b border-zinc-800 shrink-0">
          <svg viewBox="-60 -20 120 40" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
             {/* Center line */}
             <line x1="0" y1="-20" x2="0" y2="20" stroke="#fff" strokeWidth="0.5" opacity="0.3" strokeDasharray="2 2" />
             
             {/* Win Lines */}
             <line x1="-30" y1="-20" x2="-30" y2="20" stroke="#ef4444" strokeWidth="0.3" opacity="0.4" />
             <line x1="30" y1="-20" x2="30" y2="20" stroke="#ef4444" strokeWidth="0.3" opacity="0.4" />
             
             {/* The Rope */}
             <g transform={`translate(${ropePositions}, 0)`}>
                 {/* Main rope line */}
                 <line x1="-40" y1="0" x2="40" y2="0" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" />
                 {/* Center marker */}
                 <rect x="-0.5" y="-1" width="1" height="2" fill="#ef4444" />
                 
                 {/* Team 2 (Blue) on left side of rope... wait Team 2 should pull left (negative x), so they win if rope < -40. 
                     If team 1 wins (rope > 40), they pull right. */}
                 {team2Players.map((p, i) => {
                     const rX = -10 - (i * 6);
                     return (
                         <g key={`t2-${p.pid}`} transform={`translate(${rX}, 0)`}>
                            <circle cx="0" cy="0" r="1.5" fill="#3b82f6" stroke="#fff" strokeWidth="0.2" />
                            {p.imgURL && <image href={p.imgURL} x="-1.5" y="-1.5" width="3" height="3" clipPath="url(#t-clip)" preserveAspectRatio="xMidYMid slice" />}
                         </g>
                     )
                 })}
                 
                 {/* Team 1 (Amber) on right side of rope */}
                 {team1Players.map((p, i) => {
                     const rX = 10 + (i * 6);
                     return (
                         <g key={`t1-${p.pid}`} transform={`translate(${rX}, 0)`}>
                            <circle cx="0" cy="0" r="1.5" fill="#f59e0b" stroke="#fff" strokeWidth="0.2" />
                            {p.imgURL && <image href={p.imgURL} x="-1.5" y="-1.5" width="3" height="3" clipPath="url(#t-clip)" preserveAspectRatio="xMidYMid slice" />}
                         </g>
                     )
                 })}
             </g>
             
             <defs>
                 <clipPath id="t-clip">
                     <circle cx="0" cy="0" r="1.5" />
                 </clipPath>
             </defs>
          </svg>
      </div>

      <div className="h-auto bg-zinc-900 border-t border-zinc-800 p-4 shrink-0 flex flex-col justify-center">
          <div className="flex justify-between items-center px-4 md:px-12">
              <div className="text-center">
                  <div className="text-xl font-bold text-blue-400">Team Blue</div>
              </div>
              <div className="text-zinc-600 font-black italic">VS</div>
              <div className="text-center">
                  <div className="text-xl font-bold text-amber-400">Team Amber</div>
              </div>
          </div>
      </div>
    </div>
  );
}
