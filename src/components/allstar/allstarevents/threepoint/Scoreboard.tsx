import React, { useEffect, useRef, useState } from 'react';
import { ThreePointContestant } from '../../../../services/allStar/ThreePointContestant';
import { ThreePointPlay } from '../../../../services/allStar/threePointPlaysEngine';

interface Scoreboard3PTProps {
  contestants: ThreePointContestant[];
  plays: ThreePointPlay[];
  currentIndex: number;
  ballState: Record<string, any>;
  phase: 'round1' | 'finals' | 'done';
}

export function getStationScores(
  playerId: string,
  round: string,
  ballState: Record<string, any>
): (number | undefined)[] {
  return [0,1,2,3,4].map(si => {
    const balls = [0,1,2,3,4].map(bi =>
      ballState[`${playerId}|${round}|${si}|${bi}`]
    );
    if (balls.every(b => b !== undefined)) {
      return balls.reduce((sum, b) => sum + (b ? b.points : 0), 0);
    }
    return undefined;
  });
}

export function Scoreboard3PT({ contestants, plays, currentIndex, ballState, phase }: Scoreboard3PTProps) {
  const currentScores = new Map<string, number>();
  let activePlayerId = '';
  let activeRound = 'round1';
  const completedStations = new Map<string, number>();

  for (let i = 0; i <= currentIndex; i++) {
    const play = plays[i];
    if (!play) continue;

    if (play.type === 'contestant_intro') {
      activePlayerId = play.playerId;
      activeRound = play.round;
      if (play.round === 'finals') {
        currentScores.set(play.playerId, 0);
        completedStations.set(play.playerId, 0);
      }
    } else if (play.type === 'ball_shot' && play.scoreUpdate) {
      currentScores.set(play.playerId, play.scoreUpdate.newTotal);
    } else if (play.type === 'station_complete') {
      completedStations.set(play.playerId, (completedStations.get(play.playerId) || 0) + 1);
    }
  }

  const finalists = new Set<string>();
  let hasFinalsStarted = false;
  for (let i = 0; i <= currentIndex; i++) {
    if (plays[i].type === 'finals_start') hasFinalsStarted = true;
    if (plays[i].round === 'finals' && plays[i].playerId) {
      finalists.add(plays[i].playerId);
    }
  }

  let winnerId = '';
  for (let i = 0; i <= currentIndex; i++) {
    if (plays[i].type === 'winner') winnerId = plays[i].playerId;
  }

  const prevScoreRef = useRef<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  useEffect(() => {
    const newDeltas: Record<string, number> = {};
    let hasChanges = false;

    Array.from(currentScores.entries()).forEach(([id, score]) => {
      const prev = prevScoreRef.current[id] ?? 0;
      if (score !== prev) {
        newDeltas[id] = score - prev;
        hasChanges = true;
        prevScoreRef.current[id] = score;
      }
    });

    if (hasChanges) {
      setDeltas(d => ({ ...d, ...newDeltas }));
      setTimeout(() => {
        setDeltas(d => {
          const n = { ...d };
          Object.keys(newDeltas).forEach(id => delete n[id]);
          return n;
        });
      }, 1200);
    }
  }, [currentScores]);

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
      <style>{`
        @keyframes fadeUp {
          0%   { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-12px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.8); }
        }
        .scoreboard-feed { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.12) transparent; }
        .scoreboard-feed::-webkit-scrollbar { width: 3px; }
        .scoreboard-feed::-webkit-scrollbar-track { background: transparent; }
        .scoreboard-feed::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 10px; }
        .scoreboard-feed::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
      `}</style>
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Live Scoreboard</h3>
        <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded">
          {activeRound === 'round1' ? 'ROUND 1' : 'FINALS'}
        </span>
      </div>

      <div className="scoreboard-feed flex-1 overflow-y-auto p-2 space-y-2">
        {contestants.map(c => {
          const isActive = c.id === activePlayerId;
          const isFinalist = finalists.has(c.id);
          const isWinner = c.id === winnerId;
          const isEliminated = hasFinalsStarted && !isFinalist;

          const score = currentScores.get(c.id) || 0;
          const stationsDone = completedStations.get(c.id) || 0;
          const stationScores = getStationScores(c.id, activeRound, ballState);

          if (phase === 'finals' && !isFinalist) {
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 8px', opacity: 0.35,
                borderBottom: '0.5px solid rgba(255,255,255,0.1)',
              }}>
                <img src={c.imgURL} style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top' }} />
                <span style={{ fontSize: 10, color: '#94a3b8', flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 9, color: '#64748b' }}>DNQ</span>
                <span style={{ fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{score}</span>
              </div>
            );
          }

          let borderClass = 'border-slate-800/50';
          let bgClass = 'bg-slate-800/30';
          const opacityClass = isEliminated ? 'opacity-40' : 'opacity-100';

          if (isWinner) {
            borderClass = 'border-amber-500';
            bgClass = 'bg-amber-500/20';
          } else if (isActive) {
            borderClass = 'border-white';
            bgClass = 'bg-slate-800';
          } else if (isFinalist) {
            borderClass = 'border-amber-500/50';
          }

          return (
            <div key={c.id} className={`flex items-center p-2 rounded-lg border ${borderClass} ${bgClass} ${opacityClass} transition-all duration-300`}>
              <img src={c.imgURL} alt={c.name} className="w-10 h-10 rounded-full bg-slate-700 object-cover border border-slate-600 mr-3" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-white truncate">{c.name}</h4>
                  {isActive && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '2px 6px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.1)',
                      border: '0.5px solid rgba(255,255,255,0.2)',
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: '#fff',
                        animation: 'pulse 1s ease-in-out infinite',
                      }} />
                      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', color: '#fff' }}>LIVE</span>
                    </div>
                  )}
                  {isWinner && <span className="text-[10px] bg-amber-500 text-black px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Winner</span>}
                </div>
                <div className="text-xs text-slate-400">{c.team}</div>

                <div className="flex flex-col mt-1.5">
                  <div className="flex space-x-1 mb-1">
                    {[0, 1, 2, 3, 4].map(s => {
                      const isDone = s < stationsDone;
                      const isCurrent = s === stationsDone && isActive;
                      return (
                        <div
                          key={s}
                          className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isDone ? 'bg-emerald-500' : isCurrent ? 'bg-white animate-pulse' : 'bg-slate-700'}`}
                        />
                      );
                    })}
                  </div>
                  {stationsDone > 0 && (
                    <div className="grid grid-cols-5 gap-1 max-w-[80px]">
                      {[0,1,2,3,4].map(si => {
                        const pts = stationScores[si];
                        return (
                          <span key={si} className={`text-[8px] sm:text-[9px] font-bold text-center tabular-nums ${
                            pts === undefined
                              ? 'text-transparent'
                              : pts >= 5 ? 'text-emerald-400'
                              : pts >= 3 ? 'text-slate-300'
                              : 'text-red-400'
                          }`}>
                            {pts ?? '·'}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="ml-3 text-right">
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: isWinner ? '#fbbf24' : '#fff' }}>{score}</span>
                  {deltas[c.id] && (
                    <span style={{
                      position: 'absolute', top: -14, right: 0,
                      fontSize: 11, fontWeight: 700, color: '#4ade80',
                      animation: 'fadeUp 1.2s ease forwards',
                    }}>
                      +{deltas[c.id]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
