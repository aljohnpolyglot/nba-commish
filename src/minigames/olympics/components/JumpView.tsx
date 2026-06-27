import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Player, OlympicEvent, EventResult } from '../types';

interface JumpViewProps {
  event: OlympicEvent;
  players: Player[];
  gameSeed: number;
  onFinish: (results: any[]) => void;
  isPaused?: boolean;
}

export function JumpView({ event, players, gameSeed, onFinish, isPaused }: JumpViewProps) {
  const isHighJump = event.id === 'high_jump';
  const isTriple = event.id === 'triple_jump';
  const isJavelin = event.id === 'javelin';
  const isThrow = event.id === 'javelin' || event.id === 'shot_put' || event.id === 'discus' || event.id === 'hammer_throw';

  // Phases:
  // intro -> qualifier_wait -> qualifier -> final_wait -> final -> finished_wait -> finished
  const [phase, setPhase] = useState<'intro' | 'mode_select' | 'qualifier_wait' | 'qualifier' | 'final_wait' | 'final' | 'finished_wait' | 'finished' | 'lms_wait' | 'lms'>('intro');
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  
  const [isJumping, setIsJumping] = useState(false);
  const isJumpingRef = useRef(false);
  const isPausedRef = useRef(false);
  isPausedRef.current = !!isPaused;
  const [hasJumped, setHasJumped] = useState(false);
  const [animTime, setAnimTime] = useState(0); 

  const [qualifyingResults, setQualifyingResults] = useState<(EventResult & { jumpStr: string })[]>([]);
  const [finalResults, setFinalResults] = useState<(EventResult & { jumpStr: string })[]>([]);

  const top8 = useMemo(() => players.slice(0, 8), [players]);
  const [hjMode, setHjMode] = useState<'normal' | 'lms'>('normal');
  const [lmsHeight, setLmsHeight] = useState(1.80);
  const [lmsFailsCount, setLmsFailsCount] = useState<Record<number, number>>({});
  const [lmsHistory, setLmsHistory] = useState<Record<number, string>>({}); // status like XO-
  const [lmsSurvivors, setLmsSurvivors] = useState<number[]>([]);
  const [lmsHeights, setLmsHeights] = useState<number[]>([1.80]);
  const [lmsAttempts, setLmsAttempts] = useState<Record<number, Record<number, string>>>({});
  
  useEffect(() => {
      // init survivors once top8 is ready
      setLmsSurvivors(top8.map(p => p.pid));
  }, [top8]);

  const sortedQualifying = [...qualifyingResults].sort((a, b) => b.score - a.score);
  const showFinalLeaderboard = phase === 'final' || phase === 'finished_wait' || phase === 'finished' || hjMode === 'lms';
  const currentArray = showFinalLeaderboard ? finalResults : qualifyingResults;
  const sortedCurrent = [...currentArray].sort((a, b) => b.score - a.score);
  const currentLeaderScore = sortedCurrent.length > 0 ? sortedCurrent[0].score : null;

  useEffect(() => {
     if (phase === 'intro') {
         const t = setTimeout(() => {
             if (isHighJump) {
                 setPhase('mode_select');
             } else {
                 setPhase('qualifier_wait');
             }
         }, 2800);
         return () => clearTimeout(t);
     }
  }, [phase, isHighJump]);

  const runJump = () => {
     if (isJumpingRef.current) return;
     isJumpingRef.current = true;
     setIsJumping(true);
     setAnimTime(0);

     const dur = 1200; 
     const postDelay = 1400;
     const totalDur = dur + postDelay;
     
     let lastTickTime = performance.now();
     let elapsed = 0;
     let resultCalculated = false;

     const tick = (now: number) => {
         if (isPausedRef.current) {
             lastTickTime = now;
             requestAnimationFrame(tick);
             return;
         }
         
         const delta = now - lastTickTime;
         lastTickTime = now;
         elapsed += delta;

         if (elapsed < dur) {
             setAnimTime(elapsed / dur);
             requestAnimationFrame(tick);
         } else {
             if (!resultCalculated) {
                 resultCalculated = true;
                 setAnimTime(1);
                 
                 if (phase === 'qualifier') {
                     const pInfo = top8[currentPlayerIdx] || top8[0];
                     const score = event.calculate(pInfo, gameSeed);
                     setQualifyingResults(prev => {
                         if (prev.some(r => r.player.pid === pInfo.pid)) return prev;
                         return [...prev, {
                             player: pInfo,
                             score,
                             displayScore: event.format(score),
                             isSurprise: false,
                             jumpStr: event.format(score),
                             round1Score: event.format(score)
                         }];
                     });
                 } else if (phase === 'final') {
                     const finalists = sortedQualifying.slice(0, 2);
                     const pInfo = finalists[currentPlayerIdx]?.player || top8[0];
                     const qualScore = event.calculate(pInfo, gameSeed); 
                     const newScore = event.calculate(pInfo, gameSeed + 100);
                     const bestScore = Math.max(qualScore, newScore);
                     
                     setFinalResults(prev => {
                         if (prev.some(r => r.player.pid === pInfo.pid)) return prev;
                         return [...prev, {
                             player: pInfo,
                             score: bestScore,
                             displayScore: event.format(bestScore),
                             isSurprise: false,
                             jumpStr: event.format(newScore) + (newScore === bestScore ? ' (New)' : ''),
                             round1Score: event.format(qualScore),
                             round2Score: event.format(newScore)
                         }];
                     });
                 } else if (phase === 'lms') {
                     const pid = lmsSurvivors[currentPlayerIdx];
                     const pInfo = top8.find(p => p.pid === pid)!;
                     const newScore = event.calculate(pInfo, gameSeed + (lmsHeight * 100) + (lmsFailsCount[pid] || 0));
                     const isClear = newScore >= lmsHeight;
                     
                     if (isClear) {
                         setLmsHistory(prev => ({...prev, [pid]: (prev[pid] || '') + 'O'}));
                         setFinalResults(prev => {
                             const without = prev.filter(r => r.player.pid !== pid);
                             return [...without, {
                                 player: pInfo,
                                 score: lmsHeight,
                                 displayScore: event.format(lmsHeight),
                                 isSurprise: false,
                                 jumpStr: '',
                             }].sort((a,b) => b.score - a.score);
                         });
                         const char = 'O';
                         setLmsAttempts(prev => {
                             const pAtts = prev[pid] || {};
                             return {
                                 ...prev,
                                 [pid]: {
                                     ...pAtts,
                                     [lmsHeight]: (pAtts[lmsHeight] || '') + char
                                 }
                             };
                         });
                     } else {
                         const char = 'X';
                        setLmsAttempts(prev => {
                            const pAtts = prev[pid] || {};
                            return {
                                ...prev,
                                [pid]: {
                                    ...pAtts,
                                    [lmsHeight]: (pAtts[lmsHeight] || '') + char
                                }
                            };
                        });
                        const newFails = (lmsFailsCount[pid] || 0) + 1;
                         setLmsHistory(prev => ({...prev, [pid]: (prev[pid] || '') + 'X'}));
                         setLmsFailsCount(prev => ({...prev, [pid]: newFails}));
                     }
                 }
             }

             if (elapsed < totalDur) {
                 requestAnimationFrame(tick);
             } else {
                 isJumpingRef.current = false;
                 setIsJumping(false);
                 
                 // Automatically advance
                 if (phase === 'lms') {
                     const pid = lmsSurvivors[currentPlayerIdx];
                     const pInfo = top8.find(p => p.pid === pid)!;
                     const newScore = event.calculate(pInfo, gameSeed + (lmsHeight * 100) + (lmsFailsCount[pid] || 0));
                     const isClear = newScore >= lmsHeight;
                     const fails = lmsFailsCount[pid] || 0; // Updated in state already, but might not be reflected yet in closure.
                     // Actually, state updates are async, so let's recompute based on closure values
                     // Wait, fails was incremented in the state update ONLY. Let's just use the fact that it is a fail.
                     // It is better to use `failsCount` variable locally or calculate it here.
                     
                     const currentFails = isClear ? 0 : fails; // Wait, lmsFailsCount has NOT updated in closure.
                     const nextFails = isClear ? 0 : (lmsFailsCount[pid] || 0) + 1;
                     
                     if (isClear || nextFails >= 3) {
                         if (currentPlayerIdx + 1 < lmsSurvivors.length) {
                             setCurrentPlayerIdx(idx => idx + 1);
                         } else {
                             // end of height round
                             const nextSurvivors = lmsSurvivors.filter(pId => {
                                 const f = pId === pid ? nextFails : (lmsFailsCount[pId] || 0);
                                 return f < 3;
                             });
                             if (nextSurvivors.length <= 1) {
                                 setPhase('finished_wait');
                             } else {
                                 setPhase('lms_wait');
                                 setLmsSurvivors(nextSurvivors);
                                 const newH = Math.round((lmsHeight + 0.05) * 100) / 100;
                                 setLmsHeight(newH);
                                 setLmsHeights(prev => [...prev, newH]);
                                 setCurrentPlayerIdx(0);
                                 setLmsHistory({});
                                 setLmsFailsCount({});
                             }
                         }
                     }
                 } else {
                     const targetArray = phase === 'qualifier' ? top8 : sortedQualifying.slice(0, 2);
                     if (currentPlayerIdx + 1 < targetArray.length) {
                         setCurrentPlayerIdx(idx => idx + 1);
                     } else {
                         if (phase === 'qualifier') {
                             setPhase('final_wait');
                         } else {
                             setPhase('finished_wait');
                         }
                         setCurrentPlayerIdx(0);
                     }
                 }
             }
         }
     };
     requestAnimationFrame(tick);
  };

  useEffect(() => {
      // Remove auto-play logic completely
  }, []);

  let activePlayer = top8[0];
  let activeScore = 0;
  if (phase === 'qualifier' || phase === 'qualifier_wait') {
      activePlayer = top8[currentPlayerIdx] || top8[0];
      activeScore = event.calculate(activePlayer, gameSeed);
  } else if (phase === 'final' || phase === 'final_wait') {
      const finalists = sortedQualifying.slice(0, 2);
      activePlayer = finalists[currentPlayerIdx]?.player || top8[0];
      if (activePlayer) activeScore = event.calculate(activePlayer, gameSeed + 100);
  } else if (phase === 'lms' || phase === 'lms_wait') {
      const pid = lmsSurvivors[currentPlayerIdx] || (top8[0]?.pid);
      activePlayer = top8.find(p => p.pid === pid) || top8[0];
      if (activePlayer) {
          activeScore = event.calculate(activePlayer, gameSeed + (lmsHeight * 100) + (lmsFailsCount[pid] || 0));
      }
  }

  const startX = -20;
  const runEnd = 0;
  const landX = isHighJump ? 2 : activeScore;
  
  let pX = startX;
  let pY = 0; 
  let pZ = 0; 
  let pRotation = 0;

  let oX = 0;
  let oY = 0;
  let oZ = 0;
  let oRotation = 0;

  if (isThrow) {
      const releaseTime = 0.35;
      if (isJumping) {
          if (animTime < releaseTime) {
              const jt = animTime / releaseTime;
              if (isJavelin) {
                  pX = startX + (runEnd - startX) * jt;
                  pZ = 0.1 * Math.abs(Math.sin(animTime * 40));
                  oX = pX + 0.5;
                  oZ = pZ + 1.2;
                  oRotation = -30;
              } else {
                  // Spin in place for discus/hammer/shot put
                  pX = runEnd - 1;
                  pRotation = jt * 360 * 3; // 3 spins
                  pZ = 0;
                  oX = pX + Math.cos(pRotation * Math.PI/180) * 1.5;
                  oY = Math.sin(pRotation * Math.PI/180) * 1.5;
                  oZ = 1.0;
              }
          } else {
              const jtAirX = (animTime - releaseTime) / (1 - releaseTime);
              // Athlete stops/follows slightly
              if (isJavelin) {
                  pX = runEnd + 0.5 * jtAirX;
              } else {
                  pX = runEnd - 1;
                  pRotation = 0; // stop spinning
              }
              // Object flies
              oX = runEnd - (isJavelin ? 0 : 1) + landX * jtAirX;
              oZ = Math.sin(jtAirX * Math.PI) * (landX > 30 ? 6.0 : 3.0);
              if (isJavelin) {
                  oRotation = -30 + 75 * jtAirX; // starts pointing up, lands pointing down
              } else if (event.id === 'discus' || event.id === 'hammer_throw') {
                  oRotation = jtAirX * 360 * 5; // spinning in air
              }
          }
      } else {
          if (isJavelin) {
              pX = startX;
              oX = pX + 0.5;
              oZ = 1.2;
              oRotation = -30;
          } else {
              pX = runEnd - 1;
              oX = pX + 1.5;
              oY = 0;
              oZ = 1.0;
          }
      }
  } else if (isHighJump) {
      if (isJumping) {
          if (animTime < 0.4) {
              const jt = animTime / 0.4;
              if (jt < 0.5) {
                  const localT = jt / 0.5;
                  pX = -12 + 7 * localT; // -12 to -5
                  pY = 5;
                  pRotation = 0; // pointing right
              } else {
                  const localT = (jt - 0.5) / 0.5;
                  pX = -5 + 4.5 * Math.sin(localT * Math.PI / 2);        // -5 to -0.5
                  pY = 5 - 5 * (1 - Math.cos(localT * Math.PI / 2));     // 5 to 0
                  pRotation = -45 * localT; // turn left to angle roughly -45 deg
              }
              pZ = 0.1 * Math.abs(Math.sin(animTime * 60)); // running bob
          } else if (animTime < 0.7) {
              const jt = (animTime - 0.4) / 0.3; // 0 to 1
              pX = -0.5 + 3.5 * jt; // across the bar
              pY = 0 - 2 * jt;      // drifting further in y
              pZ = (activeScore * 0.8) * Math.sin(jt * Math.PI); // height
              pRotation = -45 - 135 * jt; // Fosbury flop backward rotation (ends at -180)
          } else {
              // Landing
              const jt = (animTime - 0.7) / 0.3;
              pX = 3;
              pY = -2;
              pZ = 0.3; // mat height
              pRotation = -180;
          }
      } else {
          pX = -12;
          pY = 5;
          pRotation = 0;
      }
  } else {
      if (isJumping) {
          if (animTime < 0.3) {
              pX = startX + (runEnd - startX) * (animTime / 0.3);
              pZ = 0.1 * Math.abs(Math.sin(animTime * 40));
          } else {
              const jt = (animTime - 0.3) / 0.7;
              if (isTriple) {
                  if (jt < 0.33) {
                      const localT = jt / 0.33;
                      pX = runEnd + landX * 0.33 * localT;
                      pZ = Math.sin(localT * Math.PI) * 1.5;
                      pY = Math.sin(localT * Math.PI) * 0.5;
                  } else if (jt < 0.66) {
                      const localT = (jt - 0.33) / 0.33;
                      pX = runEnd + landX * 0.33 + landX * 0.33 * localT;
                      pZ = Math.sin(localT * Math.PI) * 1.0;
                      pY = -Math.sin(localT * Math.PI) * 0.5;
                  } else {
                      const localT = (jt - 0.66) / 0.34;
                      pX = runEnd + landX * 0.66 + landX * 0.34 * localT;
                      pZ = Math.sin(localT * Math.PI) * 2.0;
                      pY = 0;
                  }
              } else { 
                  pX = runEnd + (landX - runEnd) * jt;
                  pZ = Math.sin(jt * Math.PI) * 2.5;
              }
          }
      } else {
          pX = startX;
      }
  }

  const scale = 1 + pZ * 0.3;
  const shadowOffset = pZ * 0.5;
  const shadowOpacity = Math.max(0.1, 0.5 - pZ * 0.15);

  const handleFinish = React.useCallback(() => {
      const finalists = sortedQualifying.slice(0, 2);
      const nonFinalists = sortedQualifying.slice(2).map(r => ({ ...r, round2Score: 'DNQ' }));
      const top2Final = [...finalResults].sort((a, b) => b.score - a.score);
      const combined = [...top2Final, ...nonFinalists];
      combined.forEach((c, i) => { (c as any).rank = i + 1; });
      onFinish(combined);
  }, [sortedQualifying, finalResults, onFinish]);

  useEffect(() => {
      if (phase === 'finished_wait') {
          const t = setTimeout(() => {
              handleFinish();
          }, 2000);
          return () => clearTimeout(t);
      }
  }, [phase, handleFinish]);

  const renderMarker = (score: number, color: string, label: string) => {
      if (isHighJump) return null;

      if (isThrow) {
          if (isJavelin) {
              const rad = score + 8;
              const angle = 14.48 * Math.PI / 180;
              const x0 = -8 + rad * Math.cos(angle);
              const y0 = rad * Math.sin(angle);
              return (
                  <g key={`marker-${label}`}>
                      <path d={`M ${x0} ${-y0} A ${rad} ${rad} 0 0 1 ${x0} ${y0}`} fill="none" stroke={color} strokeWidth="0.3" opacity="0.8" />
                      <text x={score + 0.5} y="-1" fill={color} fontSize="1.5" fontWeight="bold">{label} - {event.format(score)}</text>
                  </g>
              );
          } else {
              const rad = score;
              const angle = 17.46 * Math.PI / 180;
              const x0 = -1 + rad * Math.cos(angle);
              const y0 = rad * Math.sin(angle);
              return (
                  <g key={`marker-${label}`}>
                      <path d={`M ${x0} ${-y0} A ${rad} ${rad} 0 0 1 ${x0} ${y0}`} fill="none" stroke={color} strokeWidth="0.3" opacity="0.8" />
                      <text x={score - 1 + 0.5} y="-1" fill={color} fontSize="1.5" fontWeight="bold">{label} - {event.format(score)}</text>
                  </g>
              );
          }
      } else {
          return (
              <g key={`marker-${label}`}>
                  <line x1={score} y1="-3.5" x2={score} y2="3.5" stroke={color} strokeWidth="0.2" opacity="0.8" />
                  <text x={score} y="-4" fill={color} fontSize="1" textAnchor="middle" fontWeight="bold">{label} - {event.format(score)}</text>
              </g>
          );
      }
  };

  return (
    <div className="flex flex-col h-auto md:h-[70vh] bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl relative">
       
      {(phase === 'intro') && (
          <div className="absolute inset-0 z-50 bg-zinc-950/90 backdrop-blur flex flex-col items-center justify-center animate-in fade-in duration-500">
              <h2 className="text-4xl font-black text-white tracking-widest uppercase mb-4 text-center">
                  {event.name}
              </h2>
              <p className="text-amber-500 font-mono tracking-widest text-lg">
                  Qualification Round
              </p>
          </div>
      )}

      {phase === 'mode_select' && (
          <div className="absolute inset-0 z-50 bg-zinc-950/95 backdrop-blur flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500 pointer-events-auto p-4">
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-widest uppercase mb-6 sm:mb-8 text-center drop-shadow-lg">
                  Select Game Mode
              </h2>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full max-w-2xl">
                  <button 
                      onClick={() => { setHjMode('normal'); setPhase('qualifier_wait'); }}
                      className="flex-1 bg-zinc-900 border border-zinc-700 hover:border-amber-500 hover:bg-zinc-800 p-6 rounded-2xl flex flex-col items-center text-center transition-all group active:scale-95"
                  >
                      <span className="text-2xl font-bold text-white mb-2 group-hover:text-amber-500 transition-colors uppercase tracking-wider">Tournament</span>
                      <span className="text-sm text-zinc-400 font-mono">Standard Qualifier & Top 2 Finals</span>
                  </button>
                  <button 
                      onClick={() => { 
                          setHjMode('lms'); 
                          setPhase('lms_wait'); 
                          setFinalResults(top8.map(p => ({
                              player: p,
                              score: 0,
                              displayScore: 'NH',
                              isSurprise: false,
                              jumpStr: ''
                          })));
                      }}
                      className="flex-1 bg-zinc-900 border border-zinc-700 hover:border-emerald-500 hover:bg-zinc-800 p-6 rounded-2xl flex flex-col items-center text-center transition-all group active:scale-95"
                  >
                      <span className="text-2xl font-bold text-white mb-2 group-hover:text-emerald-500 transition-colors uppercase tracking-wider">Last Man Standing</span>
                      <span className="text-sm text-zinc-400 font-mono">Base 1.80m • +5cm/Round • Max 3 Fails</span>
                  </button>
              </div>
          </div>
      )}

      <div className="h-[40vh] md:h-auto md:flex-1 relative overflow-hidden bg-green-900 border-b border-zinc-800 shrink-0">
          <svg viewBox={isThrow ? `${isJumping ? Math.max(-15, oX - 20) : -15} -12 40 24` : (isHighJump ? "-20 -10 40 20" : `${Math.max(-25, pX - 20)} -8 40 16`)} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
             <defs>
                 <clipPath id="circleClipJump">
                     <circle cx="0" cy="0" r="0.6" />
                 </clipPath>
             </defs>
             {isHighJump ? (
                 <>
                     <rect x="-25" y="-10" width="50" height="20" fill="#14532d" />
                     {/* The semi-circle approach area (D-zone) */}
                     <path d="M -15 -8 L 5 -8 L 5 8 L -15 8 A 15 15 0 0 1 -15 -8 Z" fill="#9f1239" opacity="0.8" />
                     {/* Mat */}
                     <rect x="0" y="-3.5" width="5" height="7" rx="0.5" fill="#3b82f6" opacity="0.9" />
                     <rect x="0" y="-3.5" width="5" height="7" rx="0.5" fill="transparent" stroke="#2563eb" strokeWidth="0.2" />
                     <rect x="0.5" y="-3" width="4" height="6" rx="0.2" fill="#2563eb" opacity="0.5" />
                     
                     {/* Uprights */}
                     <circle cx="-0.2" cy="-3.5" r="0.2" fill="#94a3b8" />
                     <circle cx="-0.2" cy="3.5" r="0.2" fill="#94a3b8" />
                     {/* Bar */}
                     {(() => {
                         const barHeight = (phase.startsWith('lms')) ? lmsHeight : activeScore;
                         const isKnocked = phase === 'lms' && activeScore < lmsHeight && isJumping && animTime > 0.55;
                         return (
                             <g>
                                 <line 
                                     x1="-0.2" y1="-3.5" 
                                     x2={isKnocked ? "0.8" : "-0.2"} y2="3.5" 
                                     stroke="#f8fafc" strokeWidth="0.15" 
                                 />
                                 {/* Score text indicating bar height */}
                                 <text x="-1.5" y="0" transform="rotate(-90 -1.5 0)" fill="#fff" opacity="0.7" fontSize="1" textAnchor="middle" fontWeight="bold">Bar: {barHeight.toFixed(2)}m</text>
                             </g>
                         );
                     })()}
                 </>
             ) : isThrow ? (
                 <>
                     <rect x="-50" y="-40" width="180" height="80" fill="#14532d" />
                     {isJavelin ? (
                         <>
                             <rect x="-30" y="-2" width="30" height="4" fill="#881337" />
                             <line x1="-30" y1="-2" x2="0" y2="-2" stroke="#fff" strokeWidth="0.15" opacity="0.8" />
                             <line x1="-30" y1="2" x2="0" y2="2" stroke="#fff" strokeWidth="0.15" opacity="0.8" />
                             {/* Javelin throwing arc (radius 8m, centered 8m behind) */}
                             <path d="M 0 -2 A 8 8 0 0 1 0 2" fill="none" stroke="#fff" strokeWidth="0.4" />
                             <path d="M 0 -2 A 8 8 0 0 1 0 2" fill="none" stroke="#fbbf24" strokeWidth="0.1" />
                             {/* Javelin sector (28.96 deg) */}
                             <path d={`M -8 0 L 100 ${-108 * Math.tan(14.48 * Math.PI / 180)} L 100 ${108 * Math.tan(14.48 * Math.PI / 180)} Z`} fill="#166534" opacity="0.5" />
                             <line x1="-8" y1="0" x2="100" y2={-108 * Math.tan(14.48 * Math.PI / 180)} stroke="#fff" strokeWidth="0.2" opacity="0.8" />
                             <line x1="-8" y1="0" x2="100" y2={108 * Math.tan(14.48 * Math.PI / 180)} stroke="#fff" strokeWidth="0.2" opacity="0.8" />
                             
                             {/* Distance arcs */}
                             {[20, 40, 60, 80, 100].map(m => (
                                 <g key={m}>
                                     <path d={`M ${-8 + (m + 8) * Math.cos(14.48 * Math.PI/180)} ${-(m + 8) * Math.sin(14.48 * Math.PI/180)} A ${m + 8} ${m + 8} 0 0 1 ${-8 + (m + 8) * Math.cos(14.48 * Math.PI/180)} ${(m + 8) * Math.sin(14.48 * Math.PI/180)}`} fill="none" stroke="#fff" strokeWidth="0.15" opacity="0.5" strokeDasharray="0.5 0.5" />
                                     <text x={m + 0.5} y="1" fill="#fff" opacity="0.6" fontSize="2" fontWeight="bold">{m}m</text>
                                 </g>
                             ))}
                         </>
                     ) : (
                         <>
                             {/* Shot put, Discus, Hammer circle logic */}
                             {/* Circle center at (-1, 0) */}
                             {event.id === 'shot_put' ? (
                                 <>
                                     <circle cx="-1" cy="0" r="1.065" fill="#e5e5e5" />
                                     <circle cx="-1" cy="0" r="1.065" fill="none" stroke="#fff" strokeWidth="0.1" />
                                     {/* Stop board */}
                                     <path d="M 0.05 -0.6 A 1.065 1.065 0 0 1 0.05 0.6 L 0.25 0.6 A 1.25 1.25 0 0 0 0.25 -0.6 Z" fill="#f8fafc" />
                                 </>
                             ) : event.id === 'discus' ? (
                                 <>
                                     {/* Discus Cage */}
                                     <path d="M -4 -3 L -1 -3 A 3 3 0 0 1 1.5 -1.5 L 2.5 -2.5 M -4 3 L -1 3 A 3 3 0 0 0 1.5 1.5 L 2.5 2.5" fill="none" stroke="#94a3b8" strokeWidth="0.1" opacity="0.8" strokeDasharray="0.2 0.2" />
                                     <path d="M -4 -3.1 L -1 -3.1 A 3.1 3.1 0 0 1 1.6 -1.4 L 2.6 -2.4 M -4 3.1 L -1 3.1 A 3.1 3.1 0 0 0 1.6 1.4 L 2.6 2.4" fill="none" stroke="#64748b" strokeWidth="0.1" opacity="0.6" />
                                     <circle cx="-1" cy="0" r="1.25" fill="#d4d4d4" />
                                     <circle cx="-1" cy="0" r="1.25" fill="none" stroke="#fff" strokeWidth="0.1" />
                                 </>
                             ) : (
                                 <>
                                     {/* Hammer Cage (tighter door) */}
                                     <path d="M -4 -2.5 L -1 -2.5 A 2.5 2.5 0 0 1 1 -1 L 2 -2 M -4 2.5 L -1 2.5 A 2.5 2.5 0 0 0 1 1 L 2 2" fill="none" stroke="#94a3b8" strokeWidth="0.1" opacity="0.8" strokeDasharray="0.2 0.2" />
                                     <path d="M -4 -2.6 L -1 -2.6 A 2.6 2.6 0 0 1 1.1 -0.9 L 2.1 -1.9 M -4 2.6 L -1 2.6 A 2.6 2.6 0 0 0 1.1 0.9 L 2.1 1.9" fill="none" stroke="#64748b" strokeWidth="0.1" opacity="0.6" />
                                     <circle cx="-1" cy="0" r="1.065" fill="#d4d4d4" />
                                     {/* concentric circles for grip inside hammer circle */}
                                     <circle cx="-1" cy="0" r="0.8" fill="none" stroke="#a3a3a3" strokeWidth="0.05" />
                                     <circle cx="-1" cy="0" r="0.5" fill="none" stroke="#a3a3a3" strokeWidth="0.05" />
                                     <circle cx="-1" cy="0" r="1.065" fill="none" stroke="#fff" strokeWidth="0.1" />
                                 </>
                             )}

                             {/* Sector 34.92 deg */}
                             <path d={`M -1 0 L 100 ${-101 * Math.tan(17.46 * Math.PI / 180)} L 100 ${101 * Math.tan(17.46 * Math.PI / 180)} Z`} fill="#166534" opacity="0.5" />
                             <line x1="-1" y1="0" x2="100" y2={-101 * Math.tan(17.46 * Math.PI / 180)} stroke="#fff" strokeWidth="0.2" opacity="0.8" />
                             <line x1="-1" y1="0" x2="100" y2={101 * Math.tan(17.46 * Math.PI / 180)} stroke="#fff" strokeWidth="0.2" opacity="0.8" />
                             
                             {/* Distance arcs */}
                             {Array.from({length: event.id === 'shot_put' ? 6 : 10}).map((_, i) => {
                                 const m = event.id === 'shot_put' ? (i + 1) * 5 : (i + 1) * 10;
                                 return (
                                     <g key={m}>
                                         <path d={`M ${-1 + m * Math.cos(17.46 * Math.PI/180)} ${-m * Math.sin(17.46 * Math.PI/180)} A ${m} ${m} 0 0 1 ${-1 + m * Math.cos(17.46 * Math.PI/180)} ${m * Math.sin(17.46 * Math.PI/180)}`} fill="none" stroke="#fff" strokeWidth="0.15" opacity="0.5" strokeDasharray="0.5 0.5" />
                                         <text x={m - 1 + 0.5} y="1" fill="#fff" opacity="0.6" fontSize="2" fontWeight="bold">{m}m</text>
                                     </g>
                                 );
                             })}
                         </>
                     )}
                 </>
             ) : (
                 <>
                     <rect x="-50" y="-20" width="100" height="40" fill="#14532d" />
                     <rect x="-30" y="-1.5" width="30" height="3" fill="#9f1239" />
                     <line x1="-30" y1="-1.5" x2="0" y2="-1.5" stroke="#fff" strokeWidth="0.1" opacity="0.5"/>
                     <line x1="-30" y1="1.5" x2="0" y2="1.5" stroke="#fff" strokeWidth="0.1" opacity="0.5"/>
                     <rect x="-0.4" y="-1.5" width="0.4" height="3" fill="#fff" />
                     <rect x="0" y="-1.5" width="0.2" height="3" fill="#f43f5e" />

                     <rect x="1" y="-2.5" width="22" height="5" rx="0.5" fill="#eab308" opacity="0.9" />
                     <rect x="1" y="-2.5" width="22" height="5" rx="0.5" fill="transparent" stroke="#a16207" strokeWidth="0.2" />
                     
                     {[5, 10, 15, 20].map(m => (
                         <g key={m}>
                            <line x1={m} y1="-3" x2={m} y2="-5" stroke="#fff" strokeWidth="0.1" opacity="0.6" />
                            <line x1={m} y1="3" x2={m} y2="5" stroke="#fff" strokeWidth="0.1" opacity="0.6" />
                            <text x={m} y="-5.5" fill="#fff" opacity="0.8" fontSize="1.2" textAnchor="middle" fontWeight="bold">{m}m</text>
                         </g>
                     ))}
                 </>
             )}

             {/* Markers */}
             {(isThrow || isTriple || (!isHighJump && event.id === 'long_jump')) && (
                 <>
                     {renderMarker(event.goldStandard, '#fbbf24', 'OR')} 
                     {(() => {
                         let toQualify = null;
                         let toWin = null;
                         
                         if (phase.includes('qualifier') && sortedQualifying.length >= 2) {
                             toQualify = sortedQualifying[1].score;
                         }
                         if (phase.includes('final') && sortedCurrent.length > 0) {
                             toWin = sortedCurrent[0].score;
                         }
                         
                         return (
                             <>
                                 {phase.includes('qualifier') ? (
                                     toQualify !== null && toQualify > 0 ? (
                                         renderMarker(toQualify, '#38bdf8', 'To Qualify')
                                     ) : (
                                         currentLeaderScore !== null && currentLeaderScore > 0 ? renderMarker(currentLeaderScore, '#38bdf8', 'Leader') : null
                                     )
                                 ) : null}
                                 {phase.includes('final') && toWin !== null && toWin > 0 && (
                                     renderMarker(toWin, '#38bdf8', 'To Win')
                                 )}
                             </>
                         );
                     })()}
                 </>
             )}

             {(['qualifier', 'final', 'lms', 'qualifier_wait', 'final_wait', 'lms_wait'].includes(phase)) && activePlayer && (
                 <>
                     <circle 
                         cx={pX - shadowOffset} 
                         cy={pY + shadowOffset} 
                         r="0.6" 
                         fill="#000" 
                         opacity={shadowOpacity} 
                     />
                     <g transform={`translate(${pX}, ${pY}) rotate(${pRotation}) scale(${scale})`}>
                        <circle cx="0" cy="0" r="0.6" fill="#f59e0b" stroke="#fff" strokeWidth="0.1" />
                        {activePlayer.imgURL ? (
                            <image 
                               href={activePlayer.imgURL} 
                               x="-0.6" y="-0.6" 
                               width="1.2" height="1.2" 
                               preserveAspectRatio="xMidYMid slice" 
                               clipPath="url(#circleClipJump)"
                               transform={isHighJump ? `rotate(${-pRotation})` : undefined}
                               style={{ transformOrigin: '0px 0px' }}
                            />
                        ) : (
                            <text x="0" y="0.2" fontSize="0.5" fill="#fff" textAnchor="middle" fontWeight="bold" transform={isHighJump ? `rotate(${-pRotation})` : undefined} style={{ transformOrigin: '0px 0px' }}>
                                {activePlayer.lastName.charAt(0)}
                            </text>
                        )}
                        <circle cx="0.45" cy="0" r="0.15" fill="#fff" opacity="0.9" />
                     </g>
                     {isJavelin && isJumping && animTime < 0.35 && (
                         <text x={pX} y={pY - 1.5} fontSize="1.2" fill="#6ee7b7" fontWeight="bold" textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
                             {(20 + (activePlayer.spd / 99) * 12 * (animTime / 0.35)).toFixed(1)} km/h
                         </text>
                     )}
                 </>
             )}
             
             {(phase === 'qualifier' || phase === 'final') && activePlayer && isThrow && (
                 <>
                     {/* Object Shadow */}
                     <circle cx={oX - oZ * 0.5} cy={oY + oZ * 0.5} r={0.3} fill="#000" opacity={Math.max(0.1, 0.5 - oZ * 0.05)} />
                     {/* Object */}
                     <g transform={`translate(${oX}, ${oY - oZ * 0.2}) rotate(${oRotation}) scale(${1 + oZ * 0.1})`}>
                         {isJavelin ? (
                             <>
                                 <line x1="-2" y1="0" x2="2" y2="0" stroke="#fbbf24" strokeWidth="0.15" strokeLinecap="round" />
                                 <line x1="1" y1="0" x2="2" y2="0" stroke="#f8fafc" strokeWidth="0.15" strokeLinecap="round" />
                                 <circle cx="-0.2" cy="0" r="0.15" fill="#ec4899" />
                             </>
                         ) : event.id === 'discus' ? (
                             <ellipse cx="0" cy="0" rx="0.6" ry="0.2" fill="#e2e8f0" stroke="#64748b" strokeWidth="0.05" />
                         ) : event.id === 'hammer_throw' ? (
                             <>
                                 <circle cx="0.8" cy="0" r="0.25" fill="#94a3b8" />
                                 <line x1="0" y1="0" x2="0.8" y2="0" stroke="#475569" strokeWidth="0.05" />
                                 <circle cx="0" cy="0" r="0.1" fill="#ef4444" />
                             </>
                         ) : ( // shot put
                             <circle cx="0" cy="0" r="0.25" fill="#94a3b8" />
                         )}
                     </g>
                 </>
             )}

             {isJumping && animTime > 0.95 && activeScore > 1 && !isHighJump && !isThrow && (
                 <circle cx={activeScore} cy={pY} r={(animTime - 0.95) * 40} fill="#fef08a" opacity={1 - (animTime - 0.95) * 20} />
             )}
             {isJumping && animTime > 0.95 && isThrow && (
                 <circle cx={activeScore} cy={0} r={(animTime - 0.95) * 40} fill="#60a5fa" opacity={1 - (animTime - 0.95) * 20} />
             )}
             {isJumping && animTime > 0.95 && isHighJump && (
                 <circle cx={3} cy={-2} r={(animTime - 0.95) * 40} fill="#60a5fa" opacity={1 - (animTime - 0.95) * 20} />
             )}
          </svg>
      </div>

      <div className="h-auto md:h-64 bg-zinc-900 border-t border-zinc-800 p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6 shrink-0">
          <div className="w-full sm:w-1/3 flex flex-col justify-center items-center sm:border-r border-zinc-800 sm:pr-6 pb-4 sm:pb-0 border-b sm:border-b-0">
              {activePlayer && (phase === 'qualifier' || phase === 'final' || phase === 'lms') ? (
                  <>
                      <div className="flex sm:flex-col items-center gap-4 sm:gap-0 w-full justify-start sm:justify-center">
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border border-zinc-700 bg-zinc-800 sm:mb-4 shadow-xl shrink-0">
                              {activePlayer.imgURL ? (
                                  <img src={activePlayer.imgURL} className="w-full h-full object-cover" />
                              ) : (
                                  <div className="w-full h-full flex items-center justify-center font-bold text-xl text-zinc-500 uppercase">{activePlayer.lastName.slice(0, 2)}</div>
                              )}
                          </div>
                          <div className="flex flex-col text-left sm:text-center w-full min-w-0">
                              <div className="text-lg sm:text-xl font-bold text-white truncate w-full">{activePlayer.firstName} {activePlayer.lastName}</div>
                              <div className="text-zinc-500 font-mono text-xs sm:text-sm mt-0.5 sm:mt-1">{activePlayer.teamName || activePlayer.teamAbbrev}</div>
                          </div>
                      </div>
                      
                      {!isJumping && (
                          <button 
                             onClick={runJump}
                             className="mt-4 sm:mt-6 w-full py-3 sm:py-4 bg-amber-500 text-black font-bold uppercase tracking-wider rounded-xl hover:bg-amber-400 active:scale-95 transition-all shadow-lg hover:shadow-amber-500/20 text-sm sm:text-base"
                          >
                             Start Attempt
                          </button>
                      )}
                  </>
              ) : (
                  <div className="flex flex-col items-center justify-center h-full w-full">
                      {phase === 'qualifier_wait' && (
                          <button onClick={() => setPhase('qualifier')} className="w-full py-3 sm:py-4 bg-amber-500 text-black font-bold uppercase tracking-wider rounded-xl hover:bg-amber-400 active:scale-95 transition-all shadow-lg text-sm sm:text-base">Start Qualifier</button>
                      )}
                      {phase === 'final_wait' && (
                          <button onClick={() => setPhase('final')} className="w-full py-3 sm:py-4 bg-amber-500 text-black font-bold uppercase tracking-wider rounded-xl hover:bg-amber-400 active:scale-95 transition-all shadow-lg text-sm sm:text-base">Start Final (Top 2)</button>
                      )}
                      {phase === 'lms_wait' && (
                          <button onClick={() => setPhase('lms')} className="w-full py-3 sm:py-4 bg-emerald-500 text-black font-bold uppercase tracking-wider rounded-xl hover:bg-emerald-400 active:scale-95 transition-all shadow-lg text-sm sm:text-base">Start Height: {lmsHeight.toFixed(2)}m</button>
                      )}
                      {phase === 'finished_wait' && (
                          <div className="w-full text-center py-3 text-zinc-400 font-mono text-sm tracking-widest uppercase">
                             Compiling final results...
                          </div>
                      )}
                  </div>
              )}
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden max-h-48 sm:max-h-none">
              <h3 className="text-zinc-400 font-mono text-xs tracking-widest uppercase mb-4">
                  {hjMode === 'lms' ? 'Last Man Standing • Heights Table' : (phase.includes('final') || phase === 'finished_wait' ? `Final Leaderboard (Top 2 Keeps Best ${isThrow ? 'Throw' : 'Jump'})` : 'Qualification Leaderboard')}
              </h3>
              
              <div className="flex-1 overflow-x-auto overflow-y-auto pr-2 custom-scrollbar">
                  {hjMode === 'lms' ? (
                      <table className="w-full text-left font-mono text-xs sm:text-sm border-collapse">
                          <thead>
                              <tr className="border-b border-zinc-800 text-zinc-500">
                                  <th className="py-2 px-2 sticky left-0 bg-zinc-900 z-10 w-24">Competitor</th>
                                  {lmsHeights.map(h => (
                                      <th key={h} className="py-2 px-2 text-center min-w-[3rem]">{h.toFixed(2)}</th>
                                  ))}
                                  <th className="py-2 px-2 text-right">Best</th>
                              </tr>
                          </thead>
                          <tbody>
                              {top8.map(p => {
                                  const result = finalResults.find(r => r.player.pid === p.pid);
                                  const pAtts = lmsAttempts[p.pid] || {};
                                  const isSurvivor = lmsSurvivors.includes(p.pid);
                                  const isDNF = !isSurvivor && !result?.score;
                                  
                                  return (
                                      <tr key={p.pid} className={`border-b border-zinc-800/50 ${activePlayer?.pid === p.pid ? 'bg-amber-500/10' : ''}`}>
                                          <td className={`py-2 px-2 sticky left-0 z-10 w-24 font-bold ${activePlayer?.pid === p.pid ? 'text-amber-500' : 'text-zinc-300'} ${isSurvivor ? 'bg-zinc-900' : 'bg-zinc-900/80 grayscale opacity-50'}`}>
                                              {p.lastName}
                                          </td>
                                          {lmsHeights.map(h => (
                                              <td key={h} className="py-2 px-2 text-center text-zinc-400">
                                                  {pAtts[h] || '-'}
                                              </td>
                                          ))}
                                          <td className="py-2 px-2 text-right font-bold text-amber-400">
                                              {result ? result.displayScore : (isDNF ? 'NH' : '-')}
                                          </td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  ) : (
                      <div className="space-y-2 font-mono text-sm">
                          {sortedCurrent.map((res, i) => (
                              <div key={res.player.pid} className="flex items-center justify-between bg-zinc-950 px-4 py-2 rounded-lg border border-zinc-800/50">
                                  <div className="flex items-center gap-3">
                                      <span className={i === 0 ? 'text-amber-500 font-bold' : 'text-zinc-500'}>{i + 1}</span>
                                      <span className="text-zinc-200">{res.player.lastName}</span>
                                  </div>
                                  <div className="text-amber-400 font-bold flex gap-2 items-center">
                                      {res.displayScore}
                                  </div>
                              </div>
                          ))}
                          {Array.from({ length: Math.max(0, (phase.includes('final') ? 2 : top8.length) - sortedCurrent.length) }).map((_, i) => (
                              <div key={'empty'+i} className="flex items-center justify-between bg-zinc-950/20 px-4 py-3 rounded-lg border border-dashed border-zinc-800/30">
                                  <div className="flex items-center gap-3">
                                      <span className="text-zinc-700">{sortedCurrent.length + i + 1}</span>
                                      <span className="text-zinc-700">---</span>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>
      </div>
    </div>
  );
}
