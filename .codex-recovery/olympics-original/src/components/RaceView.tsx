import React, { useState, useEffect, useRef } from 'react';
import { Player, OlympicEvent } from '../types';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { getHurdleHits } from '../lib/calculator';

interface RaceViewProps {
  event: OlympicEvent;
  players: Player[];
  onFinish: () => void;
  gameSeed: number;
  isPaused?: boolean;
}

const cx1 = 150;
const cx2 = 234.39;
const cy = 100;
const S = 84.39;

const getHurdleDistances = (eventId: string): number[] => {
  if (eventId === '110m_hurdles') {
    return [13.72, 22.86, 32.00, 41.14, 50.28, 59.42, 68.56, 77.70, 86.84, 95.98];
  } else if (eventId === '400m_hurdles') {
    return [45.00, 80.00, 115.00, 150.00, 185.00, 220.00, 255.00, 290.00, 325.00, 360.00];
  } else if (eventId === 'steeplechase') {
    const baseR = 36.50 + 0.61;
    const baseLapLength = 2 * 84.39 + 2 * Math.PI * baseR;
    return Array.from({length: 35}, (_, k) => {
        const lap = Math.floor(k / 5);
        const subIndex = k % 5;
        return (0.5 * baseLapLength) + (lap * baseLapLength) + ((subIndex + 1) * (baseLapLength / 5));
    });
  }
  return [];
};

const getTrackPosition = (laneIndex: number, distRemaining: number, eventId: string, totalDistToRun?: number) => {
    if (eventId === 'swimming') {
        const laneY = cy - 23 + (laneIndex * 5.5) + 2.75; 
        const distDone = Math.max(0, (totalDistToRun || 100) - Math.max(0, distRemaining));
        const lapDone = Math.floor(distDone / 50);
        const remInLap = distDone % 50;
        
        let x = 0;
        let angle = 0;
        // Block center is cx1 - 42.5, Right wall touching is cx2 + 44.3, Left wall touching is cx1 - 44.3
        const blockX = cx1 - 42.5;
        const rightWallX = cx2 + 44.3;
        const leftWallX = cx1 - 44.3;

        let progressInLap = remInLap / 50;
        let isForward = lapDone % 2 === 0;

        // Cap at finish
        if (distDone >= 100) {
            progressInLap = 1;
            isForward = false;
        }

        if (isForward) {
           x = blockX + progressInLap * (rightWallX - blockX);
           angle = 0;
        } else {
           x = rightWallX - (progressInLap * (rightWallX - leftWallX));
           angle = 180;
        }

        return { x, y: laneY, angle };
    }

    // Lane cutting logic for middle/long distances
    let effectiveLane = laneIndex;
    const isPackEvent = eventId === 'steeplechase' || eventId === '1500m' || eventId === '800m' || eventId === 'marathon';
    if (isPackEvent) {
       const distDone = (totalDistToRun || 3000) - Math.max(0, distRemaining);
       if (distDone > 50) {
           effectiveLane = 0; // Cut inside fully
       } else {
           effectiveLane = laneIndex * (1 - (distDone / 50)); // Gradually cut inside over 50m
       }
    }

    const baseR = 36.50 + 0 * 1.22 + 0.61; // Lane 0 radius
    const baseLapLength = 2 * S + 2 * Math.PI * baseR;

    const R = 36.50 + effectiveLane * 1.22 + 0.61;
    const LapLength = isPackEvent ? baseLapLength : (2 * S + 2 * Math.PI * R);
    const useR = isPackEvent ? baseR : R; // Use baseR for longitudinal progress in pack events

    const isStraight = eventId === '100m' || eventId === '110m_hurdles';

    if (isStraight) {
        return { x: cx2 - distRemaining, y: cy + R, angle: 0 };
    }

    const D_raw = distRemaining % LapLength;
    const D = D_raw < 0 ? D_raw + LapLength : D_raw;

    if (D <= S) {
       return { x: cx2 - D, y: cy + R, angle: 0 };
    } else if (D <= S + Math.PI * useR) {
       const c = D - S;
       const p = c / (Math.PI * useR);
       const theta = Math.PI/2 + p * Math.PI; 
       const angle = theta * 180 / Math.PI - 90;
       return { x: cx1 + R * Math.cos(theta), y: cy + R * Math.sin(theta), angle };
    } else if (D <= 2*S + Math.PI * useR) {
       const c = D - S - Math.PI * useR;
       return { x: cx1 + c, y: cy - R, angle: 180 };
    } else {
       const c = D - 2*S - Math.PI * useR;
       const p = c / (Math.PI * useR);
       const theta = -Math.PI/2 + p * Math.PI;
       const angle = theta * 180 / Math.PI - 90;
       return { x: cx2 + R * Math.cos(theta), y: cy + R * Math.sin(theta), angle };
    }
};

export function RaceView({ event, players, onFinish, gameSeed, isPaused }: RaceViewProps) {
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
  const [cameraTarget, setCameraTarget] = useState<'all' | number>('all');
  
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef({ x: 150, y: 100, w: 200, h: 100 });
  const targetViewRef = useRef({ x: 150, y: 100, w: 200, h: 100 });

  const playerStats = React.useMemo(() => {
    const isRelay = event.id.startsWith('4x');

    // First calculate raw final times to find gaps
    const rawTimes = players.map(p => event.calculate(p, gameSeed));
    let minGapPercent = 1.0;
    if (players.length > 1) {
        for (let i = 0; i < players.length; i++) {
           for (let j = 0; j < players.length; j++) {
               if (i !== j) {
                   const diff = Math.abs(rawTimes[i] - rawTimes[j]) / rawTimes[i];
                   if (diff < minGapPercent) minGapPercent = diff;
               }
           }
        }
    }

    const getStats = (p: Player) => {
      const timeS = event.calculate(p, gameSeed);
      const jInfo = Math.max(0, Math.min(100, p.jmp)) / 100;
      const eInfo = Math.max(0, Math.min(100, p.end)) / 100;
      
      const prng = (seed: number) => {
          let x = Math.sin(p.pid * 13.37 + seed * 42.11) * 43758.5453;
          return x - Math.floor(x);
      };

      const steps = 100;
      const velocities = [];
      let totalV = 0;
      
      const isTightRace = minGapPercent < 0.02;
      const raceTypeFactor = (event.id === '100m' || event.id === '110m_hurdles') ? 0.35 : (event.id === '1500m' ? 1.5 : 1.0);
      
      const earlyPhase = prng(1) * Math.PI * 2;
      const earlyFreq = 2 + prng(2) * 4;
      const earlyAmp = (prng(3) * 0.015) * (isTightRace ? 1.2 : 0.4) * raceTypeFactor; 
      
      const lateMoveAmp = (prng(4) - 0.5) * (isTightRace ? 0.02 : 0.005) * raceTypeFactor;

      const accelRatio = 0.05 + (1 - jInfo) * 0.15; 

      const isHurdles = event.id.includes('hurdles') || event.id === 'steeplechase';
      const hurdleHits = isHurdles ? getHurdleHits(p, gameSeed) : [];
      const hurdleDists = isHurdles ? getHurdleDistances(event.id) : [];
      const steeplechaseDist = 7.5 * (2 * 84.39 + 2 * Math.PI * (36.50 + 0.61));
      const totalRaceDist = isRelay ? (event.id === '4x400m' ? 400 : 100) : (event.id === '110m_hurdles' ? 110 : (event.id === '400m_hurdles' ? 400 : (event.id === 'steeplechase' ? steeplechaseDist : 100)));

      for (let k = 1; k <= steps; k++) {
         const u = k / steps;
         
         const startFade = Math.min(1, u * 20);
         const earlyNoise = earlyAmp * Math.sin(earlyFreq * Math.PI * u + earlyPhase) * Math.max(0, 1 - (u / 0.4)) * startFade;
         
         let lateNoise = 0;
         if (u > 0.7) {
             const lateU = (u - 0.7) / 0.3;
             lateNoise = lateMoveAmp * lateU * Math.sin(lateU * Math.PI * 0.5); 
         }
         
         // Endurance dictates pacing. 
         // eInfo near 0: Blows lead (starts extremely fast, finishes extremely slow)
         // eInfo near 1: Perfect even pacing
         // We do this by tilting the velocity line: slope = (1.0 - eInfo)
         // So low endurance -> high negative slope (fast early, slow late).
         const paceSlope = (1.0 - eInfo) * 2.5; // multiplier for how extreme the lead blowing is
         let v = 1.0 + paceSlope * (0.5 - u); 
         
         // Add some explosive jump burst at the very start
         if (u < 0.15) {
             v += jInfo * (0.15 - u) * 5.0; 
         }
         
         if (u < accelRatio) {
            v *= Math.pow(u / accelRatio, 0.5); 
         }
         
         if (isHurdles) {
             const curDistAtU = u * totalRaceDist;
             hurdleDists.forEach((hDist, idx) => {
                 if (hurdleHits[idx] && curDistAtU >= hDist && curDistAtU < hDist + 8) {
                     // 25% speed drop at hurdle, decaying over 8 meters
                     const slowdown = 0.25 * Math.exp(-(curDistAtU - hDist) / 4);
                     v *= (1 - slowdown);
                 }
             });
         }

         v += earlyNoise + lateNoise;
         if (v < 0.1) v = 0.1; 
         
         velocities.push(v);
         totalV += v;
      }
      
      const curve = [0];
      let currDist = 0;
      for (let k = 0; k < steps; k++) {
         currDist += velocities[k] / totalV;
         curve.push(currDist);
      }
      curve[steps] = 1;
      return { timeS, curve, hurdleHits };
    };

    if (isRelay) {
      const stats = [];
      const numTeams = Math.floor(players.length / 4);
      for (let i = 0; i < numTeams; i++) {
         const team = players.slice(i*4, i*4 + 4);
         let currentStart = 0;
         for (let leg = 0; leg < 4; leg++) {
             const p = team[leg];
             const { timeS, curve, hurdleHits } = getStats(p);
             stats.push({
                isRelay,
                player: p,
                teamIndex: i, // used for color & camera
                laneIndex: i,
                leg,
                startTimeS: currentStart,
                finishTimeS: currentStart + timeS,
                durationS: timeS,
                curve,
                hurdleHits
             });
             currentStart += timeS;
         }
      }
      return stats;
    } else {
      return players.slice(0, 8).map((p, i) => {
        const { timeS, curve, hurdleHits } = getStats(p);
        return {
          isRelay: false,
          player: p,
          teamIndex: i,
          laneIndex: i,
          leg: 0,
          startTimeS: 0,
          finishTimeS: timeS,
          durationS: timeS,
          curve,
          hurdleHits
        };
      });
    }
  }, [players, event]);

  const maxTimeS = Math.max(...playerStats.map(p => p.finishTimeS));
  const raceDurationS = maxTimeS + 2.5; 

  const handleFinish = React.useCallback(() => {
      setPhase('finished');
      setIsPlaying(false);
      
      setTimeout(() => {
          onFinish();
      }, 2000);
  }, [onFinish]);

  // Unified Phase and Timing Simulation Loop
  useEffect(() => {
    let rafId: number;

    const loop = (timestamp: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const deltaMs = Math.min(timestamp - lastTimeRef.current, 100);
      lastTimeRef.current = timestamp;

      // Honor the pause state
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

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isPlaying, speed, raceDurationS, phase]);

  // Dedicated finish checker
  useEffect(() => {
    if (phase === 'racing' && timeMs >= raceDurationS * 1000) {
        handleFinish();
    }
  }, [timeMs, raceDurationS, phase, handleFinish]);

  // Smooth cinematic framing rendering loop!
  useEffect(() => {
    let rafId: number;
    const loop = () => {
      if (svgRef.current) {
          const t = targetViewRef.current;
          
          // Adaptive easing: faster follow when speed is high or when targeting single player
          const isTargetingPlayer = cameraTarget !== 'all';
          const baseK = isTargetingPlayer ? 0.15 : 0.08;
          const k = Math.min(baseK + (speed * 0.015), 1.0); 
          
          viewRef.current.x += (t.x - viewRef.current.x) * k;
          viewRef.current.y += (t.y - viewRef.current.y) * k;
          viewRef.current.w += (t.w - viewRef.current.w) * k;
          viewRef.current.h += (t.h - viewRef.current.h) * k;
          
          svgRef.current.setAttribute('viewBox', `${viewRef.current.x} ${viewRef.current.y} ${viewRef.current.w} ${viewRef.current.h}`);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [speed, cameraTarget]);

  const getEventDistance = React.useCallback(() => {
     if (event.id === '100m') return 100;
     if (event.id === '110m_hurdles') return 110;
     if (event.id === '200m') return 200;
     if (event.id === '400m') return 400;
     if (event.id === '400m_hurdles') return 400;
     if (event.id === '800m') return 800;
     if (event.id === '1500m') return 1500;
     if (event.id === 'steeplechase') {
         const baseR = 36.50 + 0.61;
         const baseLapLength = 2 * 84.39 + 2 * Math.PI * baseR;
         return 7.5 * baseLapLength; // Starts exactly half a lap opposite to the finish line
     }
     if (event.id === 'swimming') return 100;
     return 100;
  }, [event.id]);

  const eventDistance = getEventDistance();
  const currentSeconds = timeMs / 1000;

  const currentPositions = playerStats.map((stat, globalIndex) => {
    let curDist = 0;
    let isWaiting = false;
    let isActive = false;
    let isFinished = false;
    
    const PRE_START_S = 1.5; 
    const POST_RUN_S = 2.5; 
    
    const legDistance = stat.isRelay ? (event.id === '4x400m' ? 400 : 100) : eventDistance;
    const avgSpeed = legDistance / stat.durationS;
    const accelDist = avgSpeed * PRE_START_S * 0.5;
    const extraDecelDist = avgSpeed * POST_RUN_S * 0.5;

    let postDistT = 0;
    if (currentSeconds <= stat.startTimeS) {
        if (stat.isRelay && stat.leg > 0 && currentSeconds > stat.startTimeS - PRE_START_S) {
            const t = (currentSeconds - (stat.startTimeS - PRE_START_S)) / PRE_START_S;
            curDist = -accelDist + accelDist * t * t;
            isActive = true; 
        } else {
            curDist = (stat.isRelay && stat.leg > 0) ? -accelDist : 0;
            isWaiting = true;
        }
    } else if (currentSeconds >= stat.finishTimeS) {
        postDistT = Math.min(1, (currentSeconds - stat.finishTimeS) / POST_RUN_S);
        curDist = legDistance + extraDecelDist * postDistT * (2 - postDistT);
        isFinished = true;
    } else {
        let u = (currentSeconds - stat.startTimeS) / stat.durationS;
        const idx = u * 100;
        const i0 = Math.floor(idx);
        const i1 = Math.min(100, Math.ceil(idx));
        const fract = idx - i0;
        const progress = stat.curve[i0] * (1 - fract) + stat.curve[i1] * fract;
        
        curDist = progress * legDistance;
        isActive = true;
    }

    let distRemaining = 0;
    if (stat.isRelay) {
        if (event.id === '4x400m') {
            if (stat.leg === 0) {
               distRemaining = 400 - curDist;
            } else {
               const R = 36.50 + stat.laneIndex * 1.22 + 0.61;
               const LapLength = 2 * 84.39 + 2 * Math.PI * R;
               distRemaining = LapLength - (curDist / 400) * LapLength;
            }
        } else {
            const legStartDist = 400 - (stat.leg * 100);
            distRemaining = legStartDist - curDist;
        }
    } else {
        distRemaining = eventDistance - curDist;
    }

    const baseEventId = stat.isRelay ? '400m' : event.id; // full track for relay
    let pos = getTrackPosition(stat.laneIndex, distRemaining, baseEventId, eventDistance);
    
    // Add micro-positioning for bunched events (800m+) to prevent perfect overlap
    if (event.id === 'steeplechase' || event.id === '1500m' || event.id === '800m' || event.id === 'marathon') {
        const sideOffset = ((stat.player.pid % 7) - 3) * 0.15; // small deterministic offset
        pos.x += Math.cos(pos.angle * Math.PI / 180 + Math.PI / 2) * sideOffset;
        pos.y += Math.sin(pos.angle * Math.PI / 180 + Math.PI / 2) * sideOffset;
    }
    
    // Determine progress relative to whole event distance for camera grouping if needed
    const progress = Math.min(1, Math.max(0, curDist / legDistance));
    
    // Calculate Z-space jumping coordinate for hurdle animations
    let jumpHeight = 0;
    let isStumbling = false;
    const isHurdles = event.id.includes('hurdles') || event.id === 'steeplechase';
    if (isHurdles && isActive && !isFinished) {
        const hurdleDists = getHurdleDistances(event.id);
        for (let idx = 0; idx < hurdleDists.length; idx++) {
            const hDist = hurdleDists[idx];
            const isWaterJump = event.id === 'steeplechase' && (idx % 5 === 4);
            const dStart = hDist - 1.5;
            const dEnd = isWaterJump ? hDist + 4.0 : hDist + 1.8;
            if (curDist >= dStart && curDist <= dEnd) {
                const tJump = (curDist - dStart) / (dEnd - dStart);
                const jumpHeightMax = isWaterJump ? 0.8 : (event.id === 'steeplechase' ? 0.6 : 1.0);
                // Parabolic jump peaking nicely
                jumpHeight = jumpHeightMax * Math.sin(tJump * Math.PI);
                
                // If this is a hit, add wobble
                if (stat.hurdleHits && stat.hurdleHits[idx] && tJump > 0.4) {
                    isStumbling = true;
                }
                break;
            }
        }
    } else if (event.id === 'swimming' && isActive && !isFinished) {
        // Initial dive animation for swimming
        if (curDist >= 0 && curDist < 3.5) {
            const tDive = curDist / 3.5;
            // Shorter, more forward dive peaking at 0.35 height
            jumpHeight = 0.35 * Math.sin(tDive * Math.PI);
        }
    }
    
    return { ...stat, progress, ...pos, isActive, isFinished, isWaiting, globalIndex, postDistT, jumpHeight, curDist, isStumbling };
  });

  const activeOrFinishedPositions = currentPositions.filter(p => !p.isWaiting || (p.isRelay && p.leg > 0));

  let targetW = 200, targetH = 100, targetX = 150, targetY = 100;

  let paddingScale = 1;
  if (phase === 'intro') paddingScale = 2.5;
  else if (phase === 'countdown') paddingScale = 1.5;
  else if (phase === 'finished') paddingScale = 2;

  const isRelay = event.id.startsWith('4x');
  const relayColorsHex = ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#f97316', '#ec4899', '#06b6d4'];

  const cameraButtons = React.useMemo(() => {
     if (isRelay) {
         // Create a button per team
         const numTeams = Math.floor(players.length / 4);
         const btns = [];
         const colorNames = ['Amber', 'Blue', 'Green', 'Red', 'Purple', 'Orange', 'Pink', 'Cyan'];
         for(let i=0; i<numTeams; i++) {
             // we can use teamIndex for targetting
             btns.push({
                 id: `team-${i}`,
                 targetId: `team-${i}`, // custom id
                 label: `${colorNames[i % colorNames.length]} Team`,
                 color: relayColorsHex[i % relayColorsHex.length]
             });
         }
         return btns;
     } else {
         return playerStats.map(stat => ({
             id: stat.player.pid,
             targetId: stat.player.pid,
             label: stat.player.lastName,
             imgURL: stat.player.imgURL
         }));
     }
  }, [isRelay, players, playerStats]);

  const activePositions = currentPositions.filter(p => !p.isRelay || p.isActive || (p.leg === 3 && p.isFinished) || (p.leg === 0 && p.isWaiting && currentSeconds === 0));

  if (cameraTarget === 'all') {
    const minX = Math.min(...activePositions.map(p => p.x));
    const maxX = Math.max(...activePositions.map(p => p.x));
    const minY = Math.min(...activePositions.map(p => p.y));
    const maxY = Math.max(...activePositions.map(p => p.y));

    targetW = Math.max((maxX - minX) + 20 * paddingScale, 40);
    targetH = Math.max((maxY - minY) + 15 * paddingScale, 30);
    targetX = ((minX + maxX) / 2) - targetW / 2;
    targetY = ((minY + maxY) / 2) - targetH / 2;
  } else if (typeof cameraTarget === 'string' && cameraTarget.startsWith('team-')) {
    const teamIdx = parseInt(cameraTarget.split('-')[1]);
    const teamPositions = currentPositions.filter(p => p.teamIndex === teamIdx);
    const activeMembers = teamPositions.filter(p => p.isActive);
    const stat = activeMembers.length > 0 ? activeMembers[0] : (currentSeconds === 0 ? teamPositions[0] : teamPositions[3]);
    if (stat) {
      targetW = 24; 
      targetH = 16;
      targetX = stat.x - targetW / 2;
      targetY = stat.y - targetH / 2;
    }
  } else {
    const stat = currentPositions.find(p => p.player.pid === cameraTarget);
    if (stat) {
      targetW = 24; 
      targetH = 16;
      targetX = stat.x - targetW / 2;
      targetY = stat.y - targetH / 2;
    }
  }

  targetViewRef.current = { x: targetX, y: targetY, w: targetW, h: targetH };

  const isHurdles = event.id.includes('hurdles') || event.id === 'steeplechase';
  const hurdleDists = getHurdleDistances(event.id);

  return (
    <div className="w-full h-auto md:h-[600px] flex flex-col relative bg-zinc-950 rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden border border-zinc-900 border-b-zinc-800 shadow-2xl">
      
      {/* Overlay during countdown */}
      {phase === 'countdown' && countdown !== null && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
             <div className="text-[8rem] sm:text-[12rem] leading-none font-display font-black text-white italic drop-shadow-[0_0_40px_rgba(245,158,11,1)] animate-in zoom-in spin-in-12 duration-300">
                {countdown === 0 ? 'GO!' : countdown}
             </div>
          </div>
      )}

      {/* Finished State Overlay */}
      {phase === 'finished' && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-auto bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-700">
          </div>
      )}

      {/* Control Panel (Moved to top so it doesn't block) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl sm:rounded-2xl p-2 sm:p-4 flex items-center gap-2 sm:gap-4 shadow-xl backdrop-blur-sm w-full max-w-xl mx-auto z-50 transition-opacity duration-500 shrink-0 mb-2 sm:mb-4 pointer-events-auto" style={{ opacity: phase === 'intro' ? 0 : 1 }}>
         <div className="flex items-center justify-between w-full h-10 sm:h-12 gap-2 sm:gap-4">
            <div className="font-mono text-xl sm:text-3xl font-bold text-white tracking-wide sm:tracking-wider tabular-nums w-20 sm:w-32 border-b-2 border-amber-500 pb-0.5 sm:pb-1 text-center shrink-0">
               {currentSeconds.toFixed(2)}s
            </div>

            {/* Speed Slider */}
            <div className="flex-1 flex items-center gap-1.5 sm:gap-3 px-1 sm:px-6 min-w-0">
               <span className="text-zinc-400 font-mono text-[10px] sm:text-xs tracking-wider shrink-0">SPEED: {speed}X</span>
               <input 
                  type="range" 
                  min="0.5" 
                  max="10" 
                  step="0.25" 
                  value={speed} 
                  onChange={e => setSpeed(parseFloat(e.target.value))}
                  className="flex-1 min-w-[40px] h-1.5 sm:h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 pointer-events-auto relative z-[60]"
               />
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                <button 
                  onClick={() => setIsPlaying(!isPlaying)} 
                  disabled={phase !== 'racing' && phase !== 'finished'}
                  className="w-9 h-9 sm:w-12 sm:h-12 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-zinc-950 rounded-full flex items-center justify-center transition-transform active:scale-95 pointer-events-auto"
                >
                    {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5 sm:ml-1" />}
                </button>
                <button 
                  onClick={() => { setTimeMs(0); setPhase('intro'); lastTimeRef.current = null; }}
                  className="w-9 h-9 sm:w-12 sm:h-12 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-full flex items-center justify-center transition-colors shadow-lg pointer-events-auto"
                >
                    <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
            </div>
         </div>
      </div>

      {/* Track Engine */}
      <div className={`relative w-full h-[40vh] md:h-auto md:flex-1 shrink-0 overflow-hidden rounded-[1rem] sm:rounded-[2rem] border border-zinc-700/80 shadow-inner pointer-events-none ${event.id === 'swimming' ? 'bg-sky-200' : 'bg-zinc-900'}`}>
         <svg 
            ref={svgRef}
            className="w-full h-full object-cover absolute inset-0" 
            preserveAspectRatio="xMidYMid meet"
         >
            <defs>
              <pattern id="checkers" x="0" y="0" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <rect x="0" width="0.25" height="0.25" y="0" fill="#fff" />
                <rect x="0.25" width="0.25" height="0.25" y="0.25" fill="#fff" />
                <rect x="0" width="0.25" height="0.25" y="0.25" fill="#000" />
                <rect x="0.25" width="0.25" height="0.25" y="0" fill="#000" />
              </pattern>
              <clipPath id="circleClip">
                 <circle cx="0" cy="0" r="0.6" />
              </clipPath>
            </defs>

            {/* Environment Underlay */}
            {event.id === 'swimming' ? (
                <g className="pool-underlay">
                    {/* Pool Deck / Surroundings */}
                    <rect x={cx1 - 100} y={cy - 50} width={S + 200} height={100} fill="#e0f2fe" />
                    
                    {/* Grid Pattern for Tiles */}
                    <pattern id="pool-tiles" width="2" height="2" patternUnits="userSpaceOnUse">
                        <path d="M 2 0 L 0 0 0 2" fill="none" stroke="#bae6fd" strokeWidth="0.1"/>
                    </pattern>
                    <rect x={cx1 - 100} y={cy - 50} width={S + 200} height={100} fill="url(#pool-tiles)" />

                    {/* Edge shadow for the pool */}
                    <rect x={cx1 - 46} y={cy - 26} width={S + 97} height={52} fill="#7dd3fc" opacity="0.6"/>

                    {/* Pool Water */}
                    <rect x={cx1 - 45} y={cy - 25} width={S + 95} height={50} fill="#0284c7" />
                    <rect x={cx1 - 45} y={cy - 25} width={S + 95} height={50} fill="none" stroke="#0ea5e9" strokeWidth="0.5" />
                    <rect x={cx1 - 45} y={cy - 25} width={5} height={50} fill="#0369a1" />
                    <rect x={cx2 + 45} y={cy - 25} width={5} height={50} fill="#0369a1" />
                    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                        const laneCenterY = cy - 23 + (i * 5.5) + 2.75;
                        return (
                            <g key={`pool-lane-${i}`}>
                                {/* Starting Block */}
                                <rect x={cx1 - 44} y={laneCenterY - 1} width={2.5} height={2} fill="#1e293b" rx="0.2" />
                                <rect x={cx1 - 41.5} y={laneCenterY - 0.7} width={0.5} height={1.4} fill="#f59e0b" />

                                {/* lane rope */}
                                <line x1={cx1 - 45} x2={cx2 + 45} y1={cy - 23 + (i * 5.5)} y2={cy - 23 + (i * 5.5)} stroke="#fde047" strokeWidth="0.2" opacity="0.8" strokeDasharray="1,1"/>
                                {/* lane bottom line */}
                                <line x1={cx1 - 40} x2={cx2 + 40} y1={laneCenterY} y2={laneCenterY} stroke="#082f49" strokeWidth="0.6" opacity="0.6" />
                            </g>
                        )
                    })}
                    <line x1={cx1 - 45} x2={cx2 + 45} y1={cy - 23 + 8 * 5.5} y2={cy - 23 + 8 * 5.5} stroke="#fde047" strokeWidth="0.2" opacity="0.8" strokeDasharray="1,1"/>
                </g>
            ) : (
                <g className="track-underlay">
                    {/* Track Underlay */}
                    <rect x={cx1 - 46.26} y={cy - 46.26} width={S + 2*46.26} height={2*46.26} rx={46.26} fill="#9f1239" />
                    <rect x={100} y={cy} width={50} height={46.26} fill="#9f1239" /> {/* 100m extension */}
                    <rect x={cx1 - 36.50} y={cy - 36.50} width={S + 2*36.50} height={2*36.50} rx={36.50} fill="#18181b" />
                    
                    {/* Lane Lines */}
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => {
                        const r = 36.50 + i * 1.22;
                        return (
                            <g key={i}>
                               <rect x={cx1 - r} y={cy - r} width={S + 2*r} height={2*r} rx={r} stroke="#ffffff" strokeWidth="0.12" fill="none" opacity="0.4"/>
                               <line x1={80} x2={cx1} y1={cy + r} y2={cy + r} stroke="#ffffff" strokeWidth="0.12" opacity="0.4"/>
                            </g>
                        );
                    })}

                    {/* Finish Line */}
                    <rect x={cx2 - 0.5} y={cy + 36.5} width={1} height={9.76} fill="url(#checkers)" />
                    <line x1={cx2} y1={cy + 36.5} x2={cx2} y2={cy + 46.26} stroke="#fff" strokeWidth="0.1" />
                    <text x={cx2} y={cy + 47.5} fill="#fff" fontSize="1" fontFamily="monospace" fontWeight="bold" textAnchor="middle">FINISH</text>

                    {/* Staggered Start Blocks */}
                    {['1500m', '800m', 'steeplechase', 'marathon'].includes(event.id) ? null : [0,1,2,3,4,5,6,7].map(lane => {
                        const pos = getTrackPosition(lane, eventDistance, event.id, eventDistance);
                        return (
                            <g key={`start-block-${lane}`} transform={`translate(${pos.x}, ${pos.y}) rotate(${pos.angle})`}>
                                <rect x="-0.2" y="-0.61" width="0.4" height="1.22" fill="#fff" opacity="0.8" />
                            </g>
                        )
                    })}
                </g>
            )}

            {/* Hurdles Obstacles */}
            {isHurdles && (event.id === 'steeplechase' ? [0] : [0,1,2,3,4,5,6,7]).map(lane => {
                const athletesInLane = currentPositions.filter(p => event.id === 'steeplechase' || p.laneIndex === lane);
                return hurdleDists.map((hDist, idx) => {
                    const distRemaining = eventDistance - hDist;
                    const pos = getTrackPosition(lane, distRemaining, event.id, eventDistance);
                    
                    // For steeplechase, check if ANY athlete hit it (though barriers don't fall, we keep logic)
                    const hitAthlete = athletesInLane.find(a => a?.hurdleHits?.[idx] && a.curDist >= hDist - 0.2);
                    const isKnockedDown = !!hitAthlete && event.id !== 'steeplechase';

                    let fallRotation = 0;
                    let fallScale = 1;
                    if (isKnockedDown) {
                        const fallFactor = Math.min(1, (hitAthlete.curDist - (hDist - 0.2)) / 0.4);
                        fallRotation = fallFactor * 85; 
                        fallScale = 1 + fallFactor * 0.3; 
                    }

                    if (event.id === 'steeplechase') {
                        const isWaterJump = (idx % 5 === 4); // every 5th barrier roughly
                        return (
                            <g key={`barrier-${idx}`} transform={`translate(${pos.x}, ${pos.y}) rotate(${pos.angle})`}>
                               {isWaterJump && (
                                   // Water pit on the inside, placed AFTER the barrier
                                   <rect x="0.15" y="-1" width="3.5" height="6.0" fill="#0284c7" opacity="0.6" rx="0.2"/>
                               )}
                               {/* Thick Wooden Barrier spanning all lanes */}
                               <rect x="-0.2" y="-1.2" width="0.4" height="11" fill="#fff" stroke="#1c1917" strokeWidth="0.06" rx="0.1"/>
                               {/* Zebra stripes for visibility */}
                               <rect x="-0.2" y="-0.5" width="0.4" height="1.5" fill="#1c1917" />
                               <rect x="-0.2" y="2.5" width="0.4" height="1.5" fill="#1c1917" />
                               <rect x="-0.2" y="5.5" width="0.4" height="1.5" fill="#1c1917" />
                               <rect x="-0.2" y="8.5" width="0.4" height="1.5" fill="#1c1917" />
                            </g>
                        );
                    }

                    return (
                        <g key={`hurdle-${lane}-${idx}`} transform={`translate(${pos.x}, ${pos.y}) rotate(${pos.angle})`}>
                            <g transform={`rotate(${fallRotation}, 0, 0.5) scale(1, ${fallScale})`}>
                                {/* Hurdle base support legs */}
                                <line x1="-0.12" y1="-0.5" x2="0.12" y2="-0.5" stroke="#94a3b8" strokeWidth="0.08" />
                                <line x1="-0.12" y1="0.5" x2="0.12" y2="0.5" stroke="#94a3b8" strokeWidth="0.08" />
                                <line x1="0" y1="-0.5" x2="0" y2="0.5" stroke="#475569" strokeWidth="0.04" />
                                {/* Main white frame crossbar */}
                                <rect x="-0.08" y="-0.5" width="0.16" height="1.0" fill={isKnockedDown ? "#cbd5e1" : "#f8fafc"} stroke="#1e293b" strokeWidth="0.04" rx="0.02" />
                                {/* Orange visibility stripes */}
                                <rect x="-0.04" y="-0.38" width="0.08" height="0.16" fill={isKnockedDown ? "#ea580c" : "#f97316"} />
                                <rect x="-0.04" y="-0.08" width="0.08" height="0.16" fill={isKnockedDown ? "#ea580c" : "#f97316"} />
                                <rect x="-0.04" y="0.22" width="0.08" height="0.16" fill={isKnockedDown ? "#ea580c" : "#f97316"} />
                            </g>
                        </g>
                    );
                });
            })}

            {/* Racers */}
            {currentPositions.map((pos) => {
                const isRelay = pos.isRelay;
                
                if (isRelay && pos.isWaiting && event.id === '4x400m') {
                    if (currentSeconds < pos.startTimeS - 5) return null; // hide 4x400m waiting runners until 5s before handoff to avoid clutter
                }

                const strokeColor = isRelay ? relayColorsHex[pos.teamIndex % relayColorsHex.length] : '#f59e0b';
                
                let opacity = 1;
                if (!pos.isActive && pos.isRelay && currentSeconds > 0) opacity = 0.6;
                if (pos.isFinished) opacity = Math.max(0, 1 - pos.postDistT * 2); // fade out over the first half of deceleration

                return (
                    <g key={`${pos.player.pid}-${pos.globalIndex}`} transform={`translate(${pos.x}, ${pos.y})`}>
                        {/* 3D ground drop shadow for jumping athletes */}
                        {pos.jumpHeight > 0 && event.id !== 'swimming' && (
                            <ellipse 
                                cx="0" 
                                cy="0" 
                                rx={0.6 * (1 - pos.jumpHeight * 0.3)} 
                                ry={0.25 * (1 - pos.jumpHeight * 0.3)} 
                                fill="#000000" 
                                opacity={opacity * 0.4 * (1 - pos.jumpHeight * 0.5)} 
                            />
                        )}

                        {/* Athlete representation offset vertically by jump height */}
                        <g transform={`translate(0, -${pos.jumpHeight || 0}) ${pos.isStumbling ? `rotate(${Math.sin(timeMs * 0.05) * 15}) translate(${Math.sin(timeMs * 0.1) * 0.2}, 0)` : ''}`}>
                            <circle cx="0" cy="0" r="0.65" fill="#18181b" stroke={strokeColor} strokeWidth="0.12" opacity={opacity} />
                            {pos.player.imgURL ? (
                                <image href={pos.player.imgURL} x="-0.6" y="-0.6" width="1.2" height="1.2" clipPath="url(#circleClip)" preserveAspectRatio="xMidYMid slice" opacity={opacity} />
                            ) : (
                                <text y="0.2" fill={isRelay ? strokeColor : "#71717a"} fontSize="0.6" fontFamily="sans-serif" textAnchor="middle" fontWeight="bold" opacity={opacity}>
                                    {isRelay ? pos.leg + 1 : '?'}
                                </text>
                            )}
                            {/* Only show names if active or we are zoomed in or doing a relay? No, show all, but we can make it smaller for inactive relay members */}
                            {(pos.isActive || !pos.isRelay || currentSeconds === 0) && (
                                <text x="0" y="1.2" fill="#fff" fontSize="0.45" fontFamily="sans-serif" textAnchor="middle" fontWeight="bold" opacity={opacity}>
                                    {pos.player.lastName}
                                </text>
                            )}
                        </g>
                    </g>
                )
            })}

            {/* Water Surface Overlay (Semi-transparent on top of swimmers) */}
            {event.id === 'swimming' && (
                <rect x={cx1 - 45} y={cy - 25} width={S + 95} height={50} fill="#0ea5e9" opacity="0.3" pointerEvents="none" />
            )}
         </svg>
      </div>

      {/* Camera Controls */}
      {phase !== 'intro' && (
        <div className="h-auto bg-zinc-900 border-t border-zinc-800 p-2 sm:p-4 shrink-0 flex items-center justify-center">
           <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-2 flex items-center gap-2 shadow-xl backdrop-blur-sm max-w-full overflow-x-auto custom-scrollbar">
              <button 
                 onClick={() => setCameraTarget('all')}
                 className={`px-4 py-2 rounded-xl text-sm font-bold tracking-wider whitespace-nowrap transition-colors ${cameraTarget === 'all' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}
              >
                  SHOW ALL
              </button>
              
              <div className="w-px h-8 bg-zinc-800 shrink-0 mx-1"></div>

              {cameraButtons.map((btn) => (
                  <button
                     key={btn.targetId}
                     onClick={() => setCameraTarget(btn.targetId)}
                     className={`flex items-center gap-2 pr-4 pl-1 py-1 rounded-full transition-colors shrink-0 border ${cameraTarget === btn.targetId ? 'bg-zinc-800 text-white' : 'bg-transparent text-zinc-400 hover:bg-zinc-800 border-transparent'}`}
                     style={{ borderColor: cameraTarget === btn.targetId ? (btn.color || '#f59e0b') : 'transparent' }}
                  >
                     <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 bg-zinc-950 flex shadow-sm items-center justify-center font-bold" 
                            style={{ backgroundColor: isRelay ? (btn.color || '#f59e0b') : undefined }}>
                        {btn.imgURL && !isRelay ? (
                           <img src={btn.imgURL} className="w-full h-full object-cover" />
                        ) : (
                           <span className="text-[10px] uppercase font-bold text-zinc-950">{isRelay ? btn.label.slice(0,3) : btn.label.slice(0,2)}</span>
                        )}
                     </div>
                     <span className="text-xs font-bold leading-none" style={{ color: cameraTarget === btn.targetId && isRelay ? btn.color : undefined }}>{btn.label}</span>
                  </button>
              ))}
           </div>
        </div>
      )}

    </div>
  );
}
