import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Player, OlympicEvent, EventResult } from '../types';
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react';

interface RockClimbingViewProps {
  event: OlympicEvent;
  players: Player[];
  onFinish: (results: EventResult[]) => void;
  gameSeed: number;
  isPaused?: boolean;
}

export function RockClimbingView({ event, players, onFinish, gameSeed, isPaused }: RockClimbingViewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const lastTimeRef = useRef<number | null>(null);

  const isPausedRef = useRef(false);
  isPausedRef.current = !!isPaused;
  const countdownTimeRef = useRef(0);
  const introTimeRef = useRef(0);

  const [phase, setPhase] = useState<'intro' | 'countdown' | 'racing' | 'finished'>('intro');
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const [results, setResults] = useState<EventResult[]>([]);

  // Pre-calculate climbing stats for each player
  const playerStats = useMemo(() => {
    return players.map((p, i) => {
      const finishTimeS = event.calculate(p, gameSeed + p.pid);
      return {
        player: p,
        laneIndex: i,
        finishTimeS,
        score: finishTimeS
      };
    });
  }, [players, event, gameSeed]);

  const maxTimeS = Math.max(...playerStats.map(p => p.finishTimeS));
  const raceDurationS = maxTimeS + 2.0; // Hang out for 2 seconds after the last climber reaches the top

  const handleFinish = React.useCallback(() => {
    setPhase('finished');
    setIsPlaying(false);
    
    // Create results sorted properly
    const newResults: EventResult[] = playerStats.map(c => ({
        player: c.player,
        score: c.score,
        displayScore: event.format(c.score)
    }));
    newResults.sort((a, b) => event.sortOrder === 'asc' ? a.score - b.score : b.score - a.score);
    setResults(newResults);

    setTimeout(() => {
        onFinish(newResults);
    }, 2000);
  }, [playerStats, event, onFinish]);

  // Unified phase and timing loop (same as sprint logic)
  useEffect(() => {
    let rafId: number;

    const loop = (timestamp: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const deltaMs = Math.min(timestamp - lastTimeRef.current, 100);
      lastTimeRef.current = timestamp;

      if (isPausedRef.current) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      if (phase === 'intro') {
        introTimeRef.current += deltaMs;
        if (introTimeRef.current >= 1500) {
          setPhase('countdown');
        }
      } else if (phase === 'countdown') {
        countdownTimeRef.current += deltaMs;
        const ticks = Math.floor(countdownTimeRef.current / 1000);
        if (ticks === 0) setCountdown(3);
        else if (ticks === 1) setCountdown(2);
        else if (ticks === 2) setCountdown(1);
        else if (ticks >= 3) {
          setCountdown(0);
          setPhase('racing');
          setIsPlaying(true);
        }
      } else if (phase === 'racing' && isPlaying) {
        setTimeMs(prev => Math.min(prev + deltaMs * speed, raceDurationS * 1000));
      }
      
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, speed, raceDurationS, phase]); // Removed handleFinish

  // Dedicated finish checker
  useEffect(() => {
    if (phase === 'racing' && timeMs >= raceDurationS * 1000) {
        handleFinish();
    }
  }, [timeMs, raceDurationS, phase, handleFinish]);

  const currentSeconds = timeMs / 1000;

  // Calculate current Y positions using percentage (0 = bottom, 100 = top)
  const currentPositions = playerStats.map(stat => {
    let progressY = 0;
    let isFinished = false;

    if (currentSeconds >= stat.finishTimeS) {
      progressY = 100;
      isFinished = true;
    } else if (currentSeconds > 0) {
      const t = currentSeconds / stat.finishTimeS;
      
      // Endurance dictates pacing strategy.
      // Low endurance (0) -> power ~0.4 -> very explosive start, slows down tremendously ("blows lead")
      // High endurance (100) -> power ~1.0 -> perfectly paced steady climb
      const endRating = Math.max(1, stat.player.end) / 100;
      const curvePower = 0.35 + (endRating * 0.65);
      
      const curvedT = Math.pow(t, curvePower);
      progressY = curvedT * 100;
    }

    const laneSpace = 100 / (players.length + 1);
    const laneX = laneSpace * (stat.laneIndex + 1);

    return { ...stat, laneX, progressY, isFinished };
  });

  return (
    <div className="w-full flex justify-center items-center">
      <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-900 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500">
        
        {/* Top Header & Results button */}
        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900 overflow-hidden relative">
           {phase === 'finished' && (
               <div className="absolute inset-0 bg-green-900/20 z-0"></div>
           )}
           <div className="relative z-10 flex flex-col">
              <h3 className="text-xl sm:text-2xl font-display font-black text-white tracking-widest uppercase italic leading-none">{event.name}</h3>
              <p className="text-xs sm:text-sm font-mono text-zinc-400 tracking-wider uppercase mt-1">
                 {phase === 'finished' ? 'Event Complete' : 'Speed Wall Simulation'}
              </p>
           </div>
           
           <div className="relative z-10 flex items-center gap-4">
           </div>
        </div>

        {/* Sprint Control Bar */}
        <div className="bg-zinc-800 border-b border-zinc-700 px-4 py-2 flex items-center gap-4 transition-opacity duration-500" style={{ opacity: phase === 'intro' ? 0 : 1 }}>
           <div className="font-mono text-xl sm:text-2xl font-bold text-white tracking-wide tabular-nums w-24 border-b border-amber-500 text-center shrink-0 leading-none pb-1">
              {currentSeconds.toFixed(2)}s
           </div>

           <div className="flex-1 flex items-center gap-3">
              <span className="text-zinc-400 font-mono text-[10px] sm:text-xs tracking-wider shrink-0 hidden sm:inline">SPEED: {speed}X</span>
              <input 
                 type="range" min="0.5" max="10" step="0.25" value={speed} 
                 onChange={e => setSpeed(parseFloat(e.target.value))}
                 className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
           </div>

           <div className="flex items-center gap-2 shrink-0">
               <button 
                 onClick={() => setIsPlaying(!isPlaying)} 
                 disabled={phase !== 'racing' && phase !== 'finished'}
                 className="w-10 h-10 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-full flex items-center justify-center pointer-events-auto"
               >
                   {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
               </button>
               <button 
                 onClick={() => { setTimeMs(0); setPhase('intro'); lastTimeRef.current = null; }}
                 className="w-10 h-10 bg-zinc-700 hover:bg-zinc-600 text-white rounded-full flex items-center justify-center pointer-events-auto"
               >
                   <RotateCcw className="w-4 h-4" />
               </button>
           </div>
        </div>

        {/* Climbing Simulation Viewport */}
        <div 
          className="relative w-full aspect-square md:aspect-[4/3] bg-zinc-800/80 overflow-hidden select-none border-b-8 border-green-600/30 border-t-8 border-red-600/30"
          style={{ 
            backgroundImage: 'radial-gradient(#3f3f46 2px, transparent 2px)', 
            backgroundSize: '40px 40px' 
          }}
        >
           
           {/* Countdown Overlay */}
           {phase === 'countdown' && countdown !== null && (
               <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                  <div className="text-[10rem] leading-none font-display font-black text-white italic drop-shadow-[0_0_30px_rgba(245,158,11,0.8)] animate-in zoom-in spin-in-12 duration-300">
                     {countdown === 0 ? 'GO!' : countdown}
                  </div>
               </div>
           )}

           {/* Finish line label */}
           <div className="absolute top-0 left-0 w-full h-8 flex items-center justify-center pointer-events-none z-0 opacity-50">
               <span className="font-display font-black italic text-red-500 tracking-widest text-2xl uppercase">Buzzer</span>
           </div>

           {/* Start line label */}
           <div className="absolute bottom-0 left-0 w-full h-8 flex items-center justify-center pointer-events-none z-0 opacity-50">
               <span className="font-display font-black italic text-green-500 tracking-widest text-2xl uppercase">Pad</span>
           </div>

           {/* Lanes & Holds */}
           {currentPositions.map((pos, laneIdx) => (
             <React.Fragment key={`lane-bg-${laneIdx}`}>
                {/* Guide line */}
                <div 
                  className="absolute top-0 bottom-0 border-r-2 border-dashed border-zinc-700/50" 
                  style={{ left: `${pos.laneX}%`, transform: 'translateX(-1px)' }} 
                />
                
                {/* Holds (12 steps up the wall) */}
                {Array.from({ length: 12 }).map((_, hIdx) => {
                    const holdY = ((hIdx + 1) / 13) * 100;
                    return (
                        <div 
                            key={`hold-${hIdx}`}
                            className="absolute w-5 h-4 bg-red-600/80 rounded-t-lg rounded-b-sm shadow-md border-b-2 border-red-800"
                            style={{
                                left: `calc(${pos.laneX}% + ${hIdx % 2 === 0 ? '-14px' : '14px'})`,
                                bottom: `${holdY}%`,
                                transform: `translateX(-50%) rotate(${hIdx % 3 === 0 ? '15deg' : '-10deg'})`
                            }}
                        />
                    )
                })}
             </React.Fragment>
           ))}

           {/* Climbers */}
           {currentPositions.map((pos) => {
              const player = pos.player;
              // Simple percentage without calc to avoid browser anomalies
              const bottomPos = `${Math.min(100, Math.max(0, pos.progressY))}%`; 
              
              // Wiggle X and Rotate to simulate frantic climbing up the holds
              let wiggleX = 0;
              let rotateOffset = 0;
              if (!pos.isFinished && pos.progressY > 0) {
                  // 12 holds = 6 full cycles over 100 progress points, roughly ~0.4 frequency
                  wiggleX = Math.sin(pos.progressY * 0.4 + (pos.laneIndex)) * 16; 
                  // Rapidly wiggle body rotation 
                  rotateOffset = Math.sin(timeMs / 30 + player.pid) * 12;
              }

              return (
                 <div 
                    key={player.pid}
                    className="absolute flex flex-col items-center justify-end z-[50]"
                    style={{
                        left: `calc(${pos.laneX}% + ${wiggleX}px)`,
                        bottom: bottomPos,
                        transform: `translate(-50%, 50%) rotate(${rotateOffset}deg)`
                    }}
                 >
                    {/* Score Tag above climber */}
                    {pos.isFinished && (
                        <div className="mb-2 bg-black/80 px-2 py-1 rounded text-[10px] font-mono text-white tracking-widest border border-amber-500/30 whitespace-nowrap z-10 fade-in zoom-in animate-in">
                            {event.format(pos.score)}
                        </div>
                    )}
                    
                    {/* Climber Avatar */}
                    <div 
                        className={`relative w-8 h-8 rounded-full border-2 overflow-hidden shadow-lg ${pos.isFinished ? 'border-amber-500 z-10 ring-2 ring-amber-500/50' : 'border-zinc-500'}`}
                    >
                        {player.imgURL ? (
                            <img src={player.imgURL} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <div className="w-full h-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-500 text-xs shadow-inner">
                                {player.firstName.charAt(0)}
                            </div>
                        )}
                    </div>

                    <div className="mt-1 text-[9px] font-mono font-bold text-zinc-300 uppercase tracking-widest bg-zinc-950/90 px-1.5 py-0.5 rounded truncate max-w-[60px] border border-zinc-800/80">
                        {player.lastName}
                    </div>
                 </div>
              );
           })}
        </div>
      </div>
    </div>
  );
}

