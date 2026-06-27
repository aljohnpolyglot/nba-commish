import React, { useState, useEffect, useRef, useMemo } from 'react';
import Matter from 'matter-js';
import { Player, EventResult, OlympicEvent } from '../types';
import { Trophy, FastForward, Flag, Users, Pause, User, ChevronRight, Play } from 'lucide-react';

interface GolfViewProps {
  event: OlympicEvent;
  players: Player[];
  gameSeed: number;
  isPaused: boolean;
  onFinish: (results: EventResult[]) => void;
}

interface WallDef {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HoleDef {
  number: number;
  par: number;
  length: number;
  tee: { x: number, y: number };
  pin: { x: number, y: number };
  walls: WallDef[];
}

function generateHole(seed: number, isTieBreaker = false): HoleDef {
   // Golfio_01 Level layout
   const walls: WallDef[] = [
       { x: 480, y: 32, w: 960, h: 64 }, // Top
       { x: 480, y: 928, w: 960, h: 64 }, // Bottom
       { x: 32, y: 480, w: 64, h: 960 }, // Left
       { x: 928, y: 272, w: 64, h: 416 }, // Right Top
       { x: 928, y: 752, w: 64, h: 288 }, // Right Bottom
       { x: 623, y: 544, w: 544, h: 128 }, // Inner Horizontal
       { x: 495.5, y: 399.5, w: 289, h: 161 } // Inner Vertical
   ];

   return {
       number: isTieBreaker ? 99 : 1,
       par: 4,
       length: 700,
       tee: { x: 816, y: 752 },
       pin: { x: 784, y: 400 },
       walls
   };
}

function generateStrokes(tee: {x:number, y:number}, pin: {x:number, y:number}, score: number, seed: number, skill: number) {
    const WAYPOINTS = [
        pin, 
        { x: 784, y: 190 }, // Top Right Hallway
        { x: 200, y: 190 }, // Top Left Hallway
        { x: 200, y: 752 }, // Bottom Left Hallway
        tee
    ];
    if (score <= 1) return [pin];
    const pts: {x: number, y: number}[] = new Array(score);
    pts[score - 1] = pin; // Final shot always hits the pin

    const skillFactor = Math.max(0.1, (110 - skill) / 100);
    const totalWp = WAYPOINTS.length - 1;

    // Calculate backwards from hole to starting point
    for (let i = score - 2; i >= 0; i--) {
        const progressFrac = (score - 1 - i) / score;
        const wpFloat = progressFrac * totalWp;
        const sIdx = Math.floor(wpFloat);
        const eIdx = Math.min(sIdx + 1, totalWp);
        const lerp = wpFloat - sIdx;
        
        const w1 = WAYPOINTS[sIdx];
        const w2 = WAYPOINTS[eIdx];
        
        const rng = Math.sin(seed + i * 543.21) * 10000;
        const rand = rng - Math.floor(rng);
        
        const targetX = w1.x + (w2.x - w1.x) * lerp;
        const targetY = w1.y + (w2.y - w1.y) * lerp;

        const spread = (15 + (progressFrac * 100)) * skillFactor; 
        
        pts[i] = {
            x: targetX + Math.max(-40, Math.min(40, (rand - 0.5) * spread)),
            y: targetY + Math.max(-40, Math.min(40, (Math.cos(rng * 0.7) * 0.5) * spread))
        };
    }
    
    return pts;
}

function getPrecalculatedScore(p: Player, hole: HoleDef, seed: number) {
     const skill = (p.pss + p.end + p.str) / 3;
     const pBase = skill; 
     const baseSeed = seed * 1000 + hole.number * 50 + p.pid;
     const rng1 = Math.sin(baseSeed) * 10000;
     const rand1 = rng1 - Math.floor(rng1);
     const punishment = Math.max(0, (99 - pBase) / 15); 
     const expect = hole.par - 0.5 + punishment; 
     const noise = (rand1 - 0.5) * (1.5 + punishment * 0.4); 
     let score = Math.round(expect + noise);
     const rng2 = Math.sin(baseSeed * 2) * 10000;
     const rand2 = rng2 - Math.floor(rng2);
     if (rand2 < 0.05) score += 1 + Math.floor(rand2 * 2); 
     if (score < 1) score = 1;
     return score;
}

const formatScoreStr = (score: number, par: number) => {
    const diff = score - par;
    if (score === 1) return 'Hole in One!';
    if (diff <= -2) return 'Eagle (-2)';
    if (diff === -1) return 'Birdie (-1)';
    if (diff === 0) return 'Par (E)';
    if (diff === 1) return 'Bogey (+1)';
    if (diff >= 2) return `Double (+${diff})`;
    return String(score);
};

export function GolfView({ event, players, gameSeed, isPaused, onFinish }: GolfViewProps) {
    const [isTieBreakerActive, setIsTieBreakerActive] = useState(false);
    const currentHole = useMemo(() => generateHole(gameSeed, isTieBreakerActive), [gameSeed, isTieBreakerActive]);
    
    const [activePlayers, setActivePlayers] = useState<Player[]>(players);
    const [activePlayerIndex, setActivePlayerIndex] = useState(0);
    const [scores, setScores] = useState<Record<number, number>>({}); // [pid] = score
    
    const [speedScale, setSpeedScale] = useState(1);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [showChampionScreen, setShowChampionScreen] = useState(false);
    
    // Shot state
    const [strokesTaken, setStrokesTaken] = useState(0);
    const [targetScore, setTargetScore] = useState(0);
    const [swingAngle, setSwingAngle] = useState(0);
    const [isSwingingUI, setIsSwingingUI] = useState(false);
    
    // Physics refs
    const engineRef = useRef<Matter.Engine | null>(null);
    const runnerRef = useRef<Matter.Runner | null>(null);
    const ballBody = useRef<Matter.Body | null>(null);
    const ballRef = useRef<SVGCircleElement>(null);
    const isMoving = useRef(false);
    
    const [ballPos, setBallPos] = useState({ x: 0, y: 0 });
    const currentPlayer = activePlayers[activePlayerIndex];

    const [ballZ, setBallZ] = useState(0);
    const [currentShotInfo, setCurrentShotInfo] = useState<{ startX: number, startY: number, totalDist: number } | null>(null);

    useEffect(() => {
        engineRef.current = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
        
        ballBody.current = Matter.Bodies.circle(0, 0, 10, { 
            restitution: 0.98, 
            frictionAir: 0.005, // Perfect Billiards feel
            friction: 0.005,
            slop: 0.01,
            label: 'ball'
        });

        const wallBodies = currentHole.walls.map(w => 
            Matter.Bodies.rectangle(w.x, w.y, w.w, w.h, { 
                isStatic: true, 
                label: 'wall',
                restitution: 0.98, // High bounce for billiards effect
                friction: 0.005
            })
        );

        Matter.World.add(engineRef.current.world, [ballBody.current, ...wallBodies]);
        
        Matter.Events.on(engineRef.current, 'afterUpdate', () => {
            if (ballRef.current && ballBody.current) {
                const px = ballBody.current.position.x;
                const py = ballBody.current.position.y;
                
                ballRef.current.setAttribute('cx', String(px));
                ballRef.current.setAttribute('cy', String(py));
                
                const speed = Matter.Vector.magnitude(ballBody.current.velocity);
                
                if (isMoving.current && currentShotInfo) {
                    const currentDist = Math.hypot(px - currentShotInfo.startX, py - currentShotInfo.startY);
                    const progress = Math.min(currentDist / currentShotInfo.totalDist, 1);
                    // Higher, punchier arc
                    const maxH = Math.min(currentShotInfo.totalDist * 0.2, 70); 
                    const h = 4 * maxH * progress * (1 - progress);
                    setBallZ(h);
                } else {
                    setBallZ(0);
                }

                // Force absolute zero when speed is negligible (Very strict for Billiards feel)
                if (speed < 0.003 && isMoving.current) {
                    Matter.Body.setVelocity(ballBody.current, {x: 0, y: 0});
                    Matter.Body.setAngularVelocity(ballBody.current, 0);
                    isMoving.current = false;
                    setBallPos({ ...ballBody.current.position });
                }
            }
        });
        
        runnerRef.current = Matter.Runner.create();
        Matter.Runner.run(runnerRef.current, engineRef.current);

        return () => {
            if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
            if (engineRef.current) {
                Matter.World.clear(engineRef.current.world, false);
                Matter.Engine.clear(engineRef.current);
            }
        };
    }, [currentHole]);

    useEffect(() => {
        if (engineRef.current) engineRef.current.timing.timeScale = speedScale;
    }, [speedScale]);

    useEffect(() => {
        if (!currentPlayer || showLeaderboard || isPaused) return;
        
        if (ballBody.current) {
            Matter.Body.setPosition(ballBody.current, currentHole.tee);
            Matter.Body.setVelocity(ballBody.current, { x: 0, y: 0 });
            setBallPos(currentHole.tee);
            if (ballRef.current) {
                ballRef.current.setAttribute('cx', String(currentHole.tee.x));
                ballRef.current.setAttribute('cy', String(currentHole.tee.y));
            }
        }
        setStrokesTaken(0);
        setTargetScore(getPrecalculatedScore(currentPlayer, currentHole, gameSeed));
        isMoving.current = false;
    }, [currentHole, activePlayerIndex, showLeaderboard, isPaused]);

    const shotPath = useMemo(() => {
        if (!currentPlayer || !currentHole || targetScore <= 0) return [];
        const skill = (currentPlayer.pss + currentPlayer.end + currentPlayer.str) / 3;
        return generateStrokes(currentHole.tee, currentHole.pin, targetScore, gameSeed + currentHole.number + currentPlayer.pid, skill);
    }, [currentPlayer, currentHole, targetScore, gameSeed]);

    const strokesTakenRef = useRef(0);
    useEffect(() => { strokesTakenRef.current = strokesTaken; }, [strokesTaken]);

    const ballPosRef = useRef({x:0, y:0});
    useEffect(() => { ballPosRef.current = ballPos; }, [ballPos]);
    
    const isSwingingUIRef = useRef(false);
    useEffect(() => { isSwingingUIRef.current = isSwingingUI; }, [isSwingingUI]);

    // Turn state
    const [turnStatus, setTurnStatus] = useState<'idle' | 'aiming' | 'swinging' | 'moving' | 'hole-in'>('idle');

    useEffect(() => {
        if (showLeaderboard || isPaused || !currentPlayer) return;

        // If player just finished
        if (strokesTaken >= targetScore && turnStatus !== 'hole-in' && !isMoving.current) {
            setTurnStatus('hole-in');
            setTimeout(() => {
                setScores(prev => ({ ...prev, [currentPlayer.pid]: targetScore }));
                if (activePlayerIndex + 1 < activePlayers.length) {
                    setActivePlayerIndex(activePlayerIndex + 1);
                    setTurnStatus('idle');
                } else {
                    setShowLeaderboard(true);
                }
            }, 1800 / speedScale);
            return;
        }

        // Main Turn Cycle
        if (turnStatus === 'idle' && !isMoving.current) {
            // Stronger check to ensure ball is truly stopped
            if (ballBody.current && Matter.Vector.magnitude(ballBody.current.velocity) > 0.1) return;
            
            const delay = strokesTaken === 0 ? 1200 : 1000;
            const timer = setTimeout(() => setTurnStatus('aiming'), delay / speedScale);
            return () => clearTimeout(timer);
        }

        if (turnStatus === 'aiming') {
            if (isMoving.current) {
                setTurnStatus('idle'); // Recoil if somehow moving
                return;
            }
            const nextTarget = shotPath[strokesTaken] || currentHole.pin;
            const dx = nextTarget.x - ballPos.x;
            const dy = nextTarget.y - ballPos.y;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            setSwingAngle(angle);

            const timer = setTimeout(() => {
                setIsSwingingUI(true);
                setTurnStatus('swinging');
            }, 600 / speedScale);
            return () => clearTimeout(timer);
        }

        if (turnStatus === 'swinging') {
            const timer = setTimeout(() => {
                if (ballBody.current) {
                    const nextTarget = shotPath[strokesTaken] || currentHole.pin;
                    const dx = nextTarget.x - ballPos.x;
                    const dy = nextTarget.y - ballPos.y;
                    const dist = Math.hypot(dx, dy);
                    
                    setCurrentShotInfo({ startX: ballPos.x, startY: ballPos.y, totalDist: dist });
                    
                    // Punchier velocity
                    let v = dist * 0.075; 
                    v = Math.min(v, 28);
                    const dirX = dx / dist;
                    const dirY = dy / dist;
                    Matter.Body.setVelocity(ballBody.current, { x: dirX * v, y: dirY * v });
                    isMoving.current = true;
                    setStrokesTaken(s => s + 1);
                }
                setIsSwingingUI(false);
                setTurnStatus('moving');
            }, 300 / speedScale);
            return () => clearTimeout(timer);
        }

        if (turnStatus === 'moving' && !isMoving.current) {
            // Add a meaningful pause after the ball stops before the next turn starts
            const timer = setTimeout(() => {
                setTurnStatus('idle');
            }, 600 / speedScale);
            return () => clearTimeout(timer);
        }

    }, [showLeaderboard, isPaused, activePlayerIndex, currentHole, speedScale, targetScore, shotPath, activePlayers.length, currentPlayer, turnStatus, strokesTaken, ballPos]);

    const sortedLeaderboard = useMemo(() => {
        return [...activePlayers].map(p => {
            const sumScore = scores[p.pid] || 0;
            return { p, sumScore };
        }).sort((a, b) => {
            if (a.sumScore === 0 && b.sumScore === 0) return 0;
            if (a.sumScore === 0) return 1;
            if (b.sumScore === 0) return -1;
            return a.sumScore - b.sumScore;
        });
    }, [activePlayers, scores]);

    const handleNextHole = () => {
        const topScore = sortedLeaderboard[0].sumScore;
        const winners = sortedLeaderboard.filter(r => r.sumScore === topScore && r.sumScore > 0);
        
        if (!isTieBreakerActive && winners.length > 1) {
            setIsTieBreakerActive(true);
            setActivePlayers(winners.map(w => w.p));
            setActivePlayerIndex(0);
            setShowLeaderboard(false);
            setScores({});
            setTurnStatus('idle');
            setStrokesTaken(0);
            isMoving.current = false;
        } else {
            setShowChampionScreen(true);
        }
    };

    useEffect(() => {
        if (showChampionScreen) {
            const t = setTimeout(() => {
                handleFinishTournament();
            }, 2000);
            return () => clearTimeout(t);
        }
    }, [showChampionScreen]);

    const handleFinishTournament = () => {
        const finalResults: EventResult[] = sortedLeaderboard.map((row, i) => ({
            player: row.p,
            score: row.sumScore,
            displayScore: `${row.sumScore} Strokes`,
            isSurprise: false,
            rank: i + 1
        }));
        onFinish(finalResults);
    };

    if (!currentHole) return null;

    return (
        <div className="bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 flex flex-col font-sans">
            <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Flag className="w-5 h-5 text-emerald-500" />
                        <span className="text-xl font-display font-bold text-white tracking-widest uppercase italic">
                            {isTieBreakerActive ? 'Sudden Death' : currentHole.number === 99 ? 'Tie Breaker' : 'Pool Hall'}
                        </span>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-end gap-3 max-w-[200px] sm:max-w-sm">
                    <span className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider hidden sm:block">Slow-Mo Correction: {speedScale.toFixed(1)}x</span>
                    <input 
                        type="range" 
                        min="1" max="10" step="0.5" 
                        value={speedScale} 
                        onChange={(e)=>setSpeedScale(parseFloat(e.target.value))}
                        className="flex-1 h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                </div>
            </div>

            <div className="relative h-[480px] sm:h-[580px] w-full bg-zinc-950 overflow-hidden flex items-center justify-center p-4">
                <div className="w-full h-full max-w-[800px] max-h-[600px] relative">
                    {showChampionScreen ? (
                        <div className="absolute inset-0 z-30 bg-zinc-950 flex flex-col items-center justify-center p-6 animate-in fade-in duration-700">
                            <Trophy className="w-20 h-20 text-amber-400 mb-6" />
                            <h2 className="text-4xl font-display font-bold text-white mb-2">Round Finished</h2>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg mb-8">
                                <h3 className="text-amber-500 font-bold text-lg mb-4 text-center tracking-widest uppercase italic">Gold Medalist</h3>
                                <div className="flex items-center gap-4 justify-center">
                                    <div className="w-20 h-20 rounded-full overflow-hidden shrink-0 border-2 border-amber-500 bg-zinc-800">
                                        {sortedLeaderboard[0]?.p.imgURL ? (
                                            <img src={sortedLeaderboard[0].p.imgURL} alt={sortedLeaderboard[0].p.lastName} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <User className="w-10 h-10 text-zinc-600" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-3xl font-bold font-display text-white italic">{sortedLeaderboard[0]?.p.firstName} {sortedLeaderboard[0]?.p.lastName}</div>
                                        <div className="text-amber-400 font-mono text-xl">{sortedLeaderboard[0]?.sumScore} Strokes</div>
                                    </div>
                                </div>
                            </div>
                            <div className="text-zinc-500 font-mono text-sm uppercase tracking-widest mt-8 animate-pulse">
                                Finalizing event...
                            </div>
                        </div>
                    ) : showLeaderboard ? (
                        <div className="absolute inset-0 z-20 bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
                            <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500">
                                <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
                                    <div>
                                        <h3 className="text-2xl font-display font-black text-white tracking-widest uppercase italic">{isTieBreakerActive ? 'Sudden Death' : 'Tournament Leaders'}</h3>
                                    </div>
                                    <button onClick={handleNextHole} className="bg-amber-500 text-black px-6 py-3 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-amber-400">
                                        {isTieBreakerActive ? 'Finish' : sortedLeaderboard.filter(r => r.sumScore === sortedLeaderboard[0].sumScore).length > 1 ? 'Sudden Death' : 'Finish'} <ChevronRight className="w-4 h-4 ml-2" />
                                    </button>
                                </div>
                                <div className="p-4 sm:p-8">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-zinc-500 font-mono uppercase tracking-widest text-[10px] border-b border-zinc-800">
                                                <th className="pb-4 px-2">Pos</th>
                                                <th className="pb-4 px-2">Athlete</th>
                                                <th className="pb-4 px-2 text-right">Strokes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/30">
                                            {sortedLeaderboard.map((row, idx) => (
                                                <tr key={row.p.pid} className={`group ${idx === 0 ? 'text-amber-400' : 'text-zinc-300'}`}>
                                                    <td className="py-4 px-2 font-mono text-lg font-bold">{idx + 1}</td>
                                                    <td className="py-4 px-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-800">
                                                                {row.p.imgURL ? <img src={row.p.imgURL} className="w-full h-full object-cover" /> : <div className="bg-zinc-800 w-full h-full" />}
                                                            </div>
                                                            <div className="font-bold">{row.p.firstName} {row.p.lastName}</div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-2 text-right font-mono text-lg font-bold">{row.sumScore || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <svg className="w-full h-full drop-shadow-2xl" viewBox="0 0 960 960" preserveAspectRatio="xMidYMid meet">
                                <defs>
                                    <pattern id="felt" width="60" height="60" patternUnits="userSpaceOnUse">
                                        <rect width="60" height="60" fill="#047857" />
                                        <rect width="30" height="30" fill="#065f46" />
                                        <rect x="30" y="30" width="30" height="30" fill="#065f46" />
                                    </pattern>
                                    <linearGradient id="cueGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#431407" />
                                        <stop offset="70%" stopColor="#78350f" />
                                        <stop offset="90%" stopColor="#fde68a" />
                                        <stop offset="100%" stopColor="#f4f4f5" />
                                    </linearGradient>
                                </defs>
                                <rect width="960" height="960" fill="url(#felt)" />
                                
                                {currentHole.walls.map((w, i) => (
                                    <rect key={i} x={w.x - w.w/2} y={w.y - w.h/2} width={w.w} height={w.h} fill="#78350f" stroke="#451a03" strokeWidth="2" />
                                ))}
                            {/* Target Path Visualization */}
                            {turnStatus === 'aiming' && (
                                <g opacity="0.4">
                                    <line 
                                        x1={ballPos.x} y1={ballPos.y} 
                                        x2={ballPos.x + Math.cos(swingAngle * Math.PI / 180) * 100} 
                                        y2={ballPos.y + Math.sin(swingAngle * Math.PI / 180) * 100} 
                                        stroke="white" strokeWidth="2" strokeDasharray="4,6" 
                                    />
                                    <circle 
                                        cx={ballPos.x + Math.cos(swingAngle * Math.PI / 180) * 100} 
                                        cy={ballPos.y + Math.sin(swingAngle * Math.PI / 180) * 100} 
                                        r="5" stroke="white" fill="none" 
                                    />
                                </g>
                            )}
                            
                            <circle cx={currentHole.pin.x} cy={currentHole.pin.y} r="35" fill="#064e3b" opacity="0.4" />
                                {/* Improved Deep Hole Visuals */}
                                <circle cx={currentHole.pin.x} cy={currentHole.pin.y} r="20" fill="#042f2e" stroke="#0f172a" strokeWidth="2" />
                                <circle cx={currentHole.pin.x} cy={currentHole.pin.y} r="15" fill="#000" />
                                {/* Shadow inside hole */}
                                <circle cx={currentHole.pin.x - 2} cy={currentHole.pin.y - 2} r="10" fill="#000" opacity="0.5" />
                                
                                <line x1={currentHole.pin.x} y1={currentHole.pin.y} x2={currentHole.pin.x} y2={currentHole.pin.y - 45} stroke="#f4f4f5" strokeWidth="2" />
                                <path d={`M ${currentHole.pin.x} ${currentHole.pin.y - 45} L ${currentHole.pin.x + 25} ${currentHole.pin.y - 34} L ${currentHole.pin.x} ${currentHole.pin.y - 23} Z`} fill="#ef4444" />
                                
                                {/* Shadow stays on ground */}
                                <circle 
                                    cx={ballPos.x} cy={ballPos.y} r="10" 
                                    fill="#000" fillOpacity={turnStatus === 'hole-in' ? 0 : 0.4} 
                                    className={`transition-opacity duration-300 ${isMoving.current || turnStatus === 'hole-in' ? 'opacity-100' : 'opacity-0'}`}
                                    style={{ 
                                        transform: `translate(${ballZ * 0.4}px, ${ballZ * 0.4}px) scale(${1 - ballZ/250})`,
                                        transformOrigin: 'center',
                                        transformBox: 'fill-box',
                                        transitionDuration: turnStatus === 'hole-in' ? '1200ms' : '300ms'
                                    }}
                                />

                                <circle 
                                    ref={ballRef} 
                                    cx="-100" cy="-100" r="10" 
                                    fill="#ffffff" stroke="#94a3b8" strokeWidth="0.5" 
                                    className={`transition-all duration-700 ${turnStatus === 'hole-in' ? 'opacity-0 scale-0' : 'opacity-100'}`}
                                    style={{ 
                                        transformOrigin: 'center', 
                                        transformBox: 'fill-box',
                                        transform: `translate(0, ${-ballZ}px) scale(${1 + ballZ/30})`, 
                                        transitionDelay: turnStatus === 'hole-in' ? '200ms' : '0ms'
                                    }} 
                                />
                                {ballPos.x > 0 && !isMoving.current && strokesTaken < targetScore && (
                                    <g transform={`translate(${ballPos.x}, ${ballPos.y})`}>
                                        <g transform={`rotate(${swingAngle})`}>
                                            <g transform="translate(-40, 0)">
                                                <g style={{ transform: isSwingingUI ? 'translateX(18px)' : 'translateX(-8px)', transitionDuration: `${120 / speedScale}ms`, transitionTimingFunction: isSwingingUI ? 'cubic-bezier(0.1, 0, 0.1, 1)' : 'ease-out' }}>
                                                    {/* Cue Stick - Sophisticated pooling cue */}
                                                    <rect x="-160" y="-1.5" width="160" height="3" fill="url(#cueGradient)" rx="1" />
                                                    <rect x="-6" y="-1.5" width="6" height="3" fill="#f4f4f5" rx="1" />
                                                </g>
                                                
                                                <g transform="translate(-10, -20)">
                                                    <clipPath id={`clip-${currentPlayer.pid}`}><circle cx="0" cy="0" r="14" /></clipPath>
                                                    <g transform="translate(0, 0)">
                                                        {currentPlayer.imgURL ? <image href={currentPlayer.imgURL} x="-14" y="-14" width="28" height="28" clipPath={`url(#clip-${currentPlayer.pid})`} /> : <circle r="14" fill="#333" />}
                                                    </g>
                                                </g>
                                            </g>
                                        </g>
                                    </g>
                                )}
                            </svg>
                            {currentPlayer && (
                                <div className="absolute bottom-6 left-6 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4 backdrop-blur-sm shadow-2xl">
                                    <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2 border-zinc-700">
                                        {currentPlayer.imgURL ? <img src={currentPlayer.imgURL} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-zinc-800" />}
                                    </div>
                                    <div>
                                        <div className="text-xl font-bold font-display text-white italic">{currentPlayer.firstName} {currentPlayer.lastName}</div>
                                        <div className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded uppercase font-black italic mt-1 inline-block">Stroke {strokesTaken + 1}</div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
