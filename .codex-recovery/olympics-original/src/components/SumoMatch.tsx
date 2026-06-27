import React, { useState, useEffect, useRef } from 'react';
import { Player, EventResult } from '../types';

interface SumoMatchProps {
  players: Player[]; // exactly 2 players
  gameSeed: number;
  onFinish: (results: any[]) => void;
  isPaused?: boolean;
}

export function SumoMatch({ players, gameSeed, onFinish, isPaused }: SumoMatchProps) {
  const [phase, setPhase] = useState<'intro' | 'playing' | 'finished'>('intro');
  const [winner, setWinner] = useState<Player | null>(null);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  
  const RING_RADIUS = 180;
  const CENTER_X = 400;
  const CENTER_Y = 300;

  const [p1Pos, setP1Pos] = useState({x: CENTER_X - 120, y: CENTER_Y});
  const [p2Pos, setP2Pos] = useState({x: CENTER_X + 120, y: CENTER_Y});

  const isPausedRef = useRef(false);
  isPausedRef.current = !!isPaused;
  const speedRef = useRef(1);
  speedRef.current = speedMultiplier;

  const p1 = players[0];
  const p2 = players[1];

  const p1Mass = p1.weightLbs * 1.2;
  const p2Mass = p2.weightLbs * 1.2;
  const p1Force = Math.max(0, p1.str * 0.70 + (Math.min(99, p1.weightLbs / 300 * 99)) * 0.30);
  const p2Force = Math.max(0, p2.str * 0.70 + (Math.min(99, p2.weightLbs / 300 * 99)) * 0.30);

  const p1Radius = 25 + (p1Mass / 500) * 15;
  const p2Radius = 25 + (p2Mass / 500) * 15;

  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase === 'intro') {
      const t = setTimeout(() => {
        setPhase('playing');
      }, 2500);
      return () => clearTimeout(t);
    }

    if (phase === 'playing') {
      let x1 = CENTER_X - 120;
      let y1 = CENTER_Y;
      let x2 = CENTER_X + 120;
      let y2 = CENTER_Y;
      
      let vx1 = 0;
      let vy1 = 0;
      let vx2 = 0;
      let vy2 = 0;
      
      let timeOffset = 0;
      let phaseEnded = false;

      const loop = () => {
        if (isPausedRef.current) {
          frameRef.current = requestAnimationFrame(loop);
          return;
        }

        const iterations = Math.max(1, Math.floor(speedRef.current));

        for (let i = 0; i < iterations; i++) {
            if (phaseEnded) break;
            
            timeOffset += 1;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 0) {
              const dirX = dx / dist;
              const dirY = dy / dist;

              const isTouching = dist < (p1Radius + p2Radius);

              if (!isTouching) {
                  // Dash towards each other at high speed if knocked back
                  vx1 += dirX * 2.0;
                  vy1 += dirY * 2.0;
                  vx2 -= dirX * 2.0;
                  vy2 -= dirY * 2.0;
              } else {
                  // Collision / Pushing phase
                  const overlap = (p1Radius + p2Radius) - dist;
                 
                  const totalMass = p1Mass + p2Mass;
                  const m1Ratio = p2Mass / totalMass;
                  const m2Ratio = p1Mass / totalMass;
                 
                  // Resolve overlap instantly
                  x1 -= dirX * overlap * m1Ratio;
                  y1 -= dirY * overlap * m1Ratio;
                 
                  x2 += dirX * overlap * m2Ratio;
                  y2 += dirY * overlap * m2Ratio;
                  
                  // Inelastic collision - lock velocities together
                  const v1n = vx1 * dirX + vy1 * dirY;
                  const v2n = vx2 * dirX + vy2 * dirY;
                  
                  const avgV = (p1Mass * v1n + p2Mass * v2n) / totalMass;
                  
                  // Apply collision inelasticity
                  vx1 += (avgV - v1n) * dirX * 0.8; // Dampened
                  vy1 += (avgV - v1n) * dirY * 0.8;
                  vx2 += (avgV - v2n) * dirX * 0.8;
                  vy2 += (avgV - v2n) * dirY * 0.8;

                  // Active Pushing
                  const p1Surge = Math.sin(timeOffset * 0.05 + gameSeed) > 0 ? 1.4 : 0.9;
                  const p2Surge = Math.cos(timeOffset * 0.06 + gameSeed * 2) > 0 ? 1.4 : 0.9;

                  // Endurance / Stamina factor
                  // Stamina matters more in longer matches where they are colliding
                  const staminaDecayStart = 300; // ~ 5 seconds of collision
                  let p1StaminaMultiplier = 1.0;
                  let p2StaminaMultiplier = 1.0;

                  if (timeOffset > staminaDecayStart) {
                      const decayDuration = timeOffset - staminaDecayStart;
                      // decay = (100 - end) * 0.0001
                      const p1DecayRate = (100 - (p1.end || 50)) * 0.0002;
                      const p2DecayRate = (100 - (p2.end || 50)) * 0.0002;
                      
                      p1StaminaMultiplier = Math.max(0.3, 1.0 - decayDuration * p1DecayRate);
                      p2StaminaMultiplier = Math.max(0.3, 1.0 - decayDuration * p2DecayRate);
                  }

                  const p1Push = p1Force * p1Surge * p1StaminaMultiplier;
                  const p2Push = p2Force * p2Surge * p2StaminaMultiplier;
                  
                  const netPush = p1Push - p2Push; // Positive means p1 pushes p2
                  
                  // Adjust push multiplier so it's a visible struggle
                  const pushStrength = 0.5;
                  const pushAccel = (netPush * pushStrength) / totalMass;
                  
                  vx1 += dirX * pushAccel;
                  vy1 += dirY * pushAccel;
                  vx2 += dirX * pushAccel;
                  vy2 += dirY * pushAccel;
                  
                  // Add a little random perpendicular wrestling wobble
                  const wobble = Math.sin(timeOffset * 0.2 + gameSeed) * 5.0;
                  vx1 += -dirY * wobble / p1Mass;
                  vy1 += dirX * wobble / p1Mass;
                  vx2 += -dirY * wobble / p2Mass;
                  vy2 += dirX * wobble / p2Mass;
              }
            }

            // Friction (sand)
            vx1 *= 0.90;
            vy1 *= 0.90;
            vx2 *= 0.90;
            vy2 *= 0.90;

            x1 += vx1;
            y1 += vy1;
            x2 += vx2;
            y2 += vy2;

            // Check ring out
            const p1DistCenter = Math.sqrt(Math.pow(x1 - CENTER_X, 2) + Math.pow(y1 - CENTER_Y, 2));
            const p2DistCenter = Math.sqrt(Math.pow(x2 - CENTER_X, 2) + Math.pow(y2 - CENTER_Y, 2));

            if (p1DistCenter > RING_RADIUS) {
                setWinner(p2);
                setPhase('finished');
                phaseEnded = true;
            } else if (p2DistCenter > RING_RADIUS) {
                setWinner(p1);
                setPhase('finished');
                phaseEnded = true;
            }
        }
        
        setP1Pos({ x: x1, y: y1 });
        setP2Pos({ x: x2, y: y2 });

        if (!phaseEnded) {
            frameRef.current = requestAnimationFrame(loop);
        }
      };

      frameRef.current = requestAnimationFrame(loop);
      
      return () => {
         if (frameRef.current) cancelAnimationFrame(frameRef.current);
      };
    }

    if (phase === 'finished') {
      const showT = setTimeout(() => setShowWinnerModal(true), 1500);
      const t = setTimeout(() => {
        const isP1ObjWinner = winner?.pid === p1.pid;
        const res1 = {
          player: p1,
          score: isP1ObjWinner ? 1 : 2,
          displayScore: isP1ObjWinner ? 'WINNER' : 'OUT',
          isSurprise: false,
          rank: isP1ObjWinner ? 1 : 2
        };
        const res2 = {
          player: p2,
          score: !isP1ObjWinner ? 1 : 2,
          displayScore: !isP1ObjWinner ? 'WINNER' : 'OUT',
          isSurprise: false,
          rank: !isP1ObjWinner ? 1 : 2
        };

        const sorted = isP1ObjWinner ? [res1, res2] : [res2, res1];
        onFinish(sorted);
      }, 2500); // Wait to let the falling animation play and modal show
      return () => { clearTimeout(t); clearTimeout(showT); };
    }
  }, [phase, gameSeed, p1, p2, winner, onFinish, RING_RADIUS, CENTER_X, CENTER_Y, p1Force, p1Mass, p2Force, p2Mass]);

  const isP1Loser = phase === 'finished' && winner?.pid === p2.pid;
  const isP2Loser = phase === 'finished' && winner?.pid === p1.pid;

  return (
    <div className="flex flex-col h-auto md:h-[70vh] bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl relative">
      <div className="absolute top-4 left-0 w-full flex justify-between px-4 sm:px-8 z-10 pointer-events-none">
         <div className="flex flex-col items-start bg-zinc-950/80 p-3 rounded-lg border border-red-500/20 backdrop-blur">
             <div className="text-red-400 font-bold font-display uppercase">{p1.firstName} {p1.lastName}</div>
         </div>
         <div className="flex flex-col items-end bg-zinc-950/80 p-3 rounded-lg border border-blue-500/20 backdrop-blur">
             <div className="text-blue-400 font-bold font-display uppercase">{p2.firstName} {p2.lastName}</div>
         </div>
      </div>

      {phase === 'playing' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center bg-zinc-950/80 border border-zinc-800 p-4 rounded-2xl backdrop-blur">
              <label className="text-zinc-400 font-mono text-[10px] uppercase tracking-widest mb-2 flex justify-between w-full">
                  <span>Simulation Speed</span>
                  <span className="text-amber-500 font-bold">{speedMultiplier}x</span>
              </label>
              <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  step="0.5" 
                  value={speedMultiplier} 
                  onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
                  className="w-48 appearance-none bg-zinc-800 h-1.5 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
              />
          </div>
      )}

      {phase === 'intro' && (
          <div className="absolute inset-0 z-50 bg-zinc-950/90 backdrop-blur flex flex-col items-center justify-center animate-in fade-in duration-500">
              <h2 className="text-4xl font-black text-white tracking-widest uppercase mb-4 text-center">
                  Sumo Wrestling
              </h2>
              <div className="flex items-center gap-8 text-xl font-bold font-display">
                  <span className="text-red-500">{p1.lastName}</span>
                  <span className="text-zinc-600">VS</span>
                  <span className="text-blue-500">{p2.lastName}</span>
              </div>
          </div>
      )}

      {showWinnerModal && winner && (
          <div className="absolute inset-0 z-50 bg-zinc-950/80 backdrop-blur flex flex-col items-center justify-center animate-in zoom-in-95 duration-500">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-amber-500 mb-6 bg-zinc-800 shadow-[0_0_50px_rgba(245,158,11,0.3)]">
                  {winner.imgURL ? (
                      <img src={winner.imgURL} alt={winner.lastName} className="w-full h-full object-cover" />
                  ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 text-3xl font-bold font-display">
                          {winner.lastName.slice(0, 2)}
                      </div>
                  )}
              </div>
              <h2 className="text-5xl font-black text-white tracking-widest uppercase mb-4 text-center drop-shadow-2xl">
                  {winner.firstName} {winner.lastName} 
              </h2>
              <div className="text-amber-500 font-bold uppercase tracking-widest text-2xl font-display">
                  Wins by Ring Out!
              </div>
          </div>
      )}

      <div className="flex-1 overflow-hidden bg-zinc-900 border-b border-zinc-800 relative w-full min-h-[400px]">
          <div 
              style={{ width: 800, height: 600 }} 
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none origin-center transform scale-[0.4] sm:scale-75 md:scale-90 lg:scale-100"
          >
             <div 
                 className="absolute"
                 style={{
                    width: RING_RADIUS * 2,
                    height: RING_RADIUS * 2,
                    borderRadius: '50%',
                    backgroundColor: '#d4a373', // sand color
                    border: '4px solid #fff',
                    opacity: 0.8,
                    left: CENTER_X,
                    top: CENTER_Y,
                    transform: 'translate(-50%, -50%)',
                 }}
              />
              <div 
                 className={`absolute rounded-full overflow-hidden border-4 border-red-500 bg-zinc-800 ${isP1Loser ? 'z-0' : 'z-10 shadow-xl'}`}
                 style={{
                     width: p1Radius * 2,
                     height: p1Radius * 2,
                     left: p1Pos.x,
                     top: p1Pos.y,
                     transform: `translate(-50%, -50%) ${isP1Loser ? 'scale(0.3) rotate(-180deg)' : 'scale(1) rotate(0deg)'}`,
                     opacity: isP1Loser ? 0 : 1,
                     filter: isP1Loser ? 'brightness(0.3) blur(4px)' : 'none',
                     transition: isP1Loser ? 'all 1.5s cubic-bezier(0.4, 0, 1, 1)' : 'none',
                 }}
              >
                  {p1.imgURL ? <img src={p1.imgURL} alt={p1.lastName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-zinc-500 uppercase">{p1.lastName.slice(0,2)}</div>}
              </div>

              <div 
                 className={`absolute rounded-full overflow-hidden border-4 border-blue-500 bg-zinc-800 ${isP2Loser ? 'z-0' : 'z-10 shadow-xl'}`}
                 style={{
                     width: p2Radius * 2,
                     height: p2Radius * 2,
                     left: p2Pos.x,
                     top: p2Pos.y,
                     transform: `translate(-50%, -50%) ${isP2Loser ? 'scale(0.3) rotate(180deg)' : 'scale(1) rotate(0deg)'}`,
                     opacity: isP2Loser ? 0 : 1,
                     filter: isP2Loser ? 'brightness(0.3) blur(4px)' : 'none',
                     transition: isP2Loser ? 'all 1.5s cubic-bezier(0.4, 0, 1, 1)' : 'none',
                 }}
              >
                  {p2.imgURL ? <img src={p2.imgURL} alt={p2.lastName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-zinc-500 uppercase">{p2.lastName.slice(0,2)}</div>}
              </div>
          </div>
      </div>
    </div>
  );
}

