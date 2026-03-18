import React from 'react';
import { ThreePointContestant } from '../../../../services/allStar/ThreePointContestant';
import { BallResult } from '../../../../services/allStar/ThreePointContestSim';
import { getStationScores } from './Scoreboard';

interface FinalsScoreboardProps {
  finalist1: ThreePointContestant;
  finalist2: ThreePointContestant;
  r1Scores: Record<string, number>;
  finalsScores: Record<string, number>;
  ballState: Record<string, BallResult>;
  activeId: string | null;
  activeSi: number | null;
  winnerId: string | null;
  phase: 'finals' | 'done';
  round: 'finals';
  moneyrackAssignments: Map<string, number>;
}

function FinalistCard({
  contestant, r1Score, finalsScore, isActive, isWinner, stationScores, phase, moneyrackStation
}: {
  contestant: ThreePointContestant;
  r1Score: number;
  finalsScore: number;
  isActive: boolean;
  isWinner: boolean;
  stationScores: (number | undefined)[];
  phase: 'finals' | 'done';
  moneyrackStation: number;
}) {
  return (
    <div style={{
      background: isWinner ? 'rgba(234,179,8,0.08)' : isActive ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
      border: isWinner ? '1px solid rgba(234,179,8,0.4)' : isActive ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: '16px 14px',
      transition: 'all 0.4s ease', position: 'relative', overflow: 'hidden',
      filter: phase === 'done' && !isWinner ? 'opacity(0.45)' : 'none',
    }}>
      {isActive && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', borderRadius: 10,
          background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.2)',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', animation: 'pulse 1s ease-in-out infinite' }} />
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', color: '#fff' }}>LIVE</span>
        </div>
      )}

      <div style={{ width: 'clamp(48px, 12vw, 64px)', height: 'clamp(48px, 12vw, 64px)', borderRadius: '50%', overflow: 'hidden', margin: '0 auto 10px', border: isActive ? '2px solid rgba(255,255,255,0.5)' : '2px solid rgba(255,255,255,0.1)', transition: 'border-color 0.3s' }}>
        <img src={contestant.imgURL} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', filter: isActive ? 'none' : 'brightness(0.65)', transition: 'filter 0.3s' }} />
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', textAlign: 'center', letterSpacing: '-0.01em', marginBottom: 2 }}>{contestant.name}</div>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', color: '#94a3b8', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase' }}>{contestant.team} · {contestant.pos}</div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 10, padding: '4px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 20, width: 'fit-content', margin: '0 auto 10px' }}>
        <span style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.06em' }}>ROUND 1</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>{r1Score}</span>
      </div>

      <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '0 0 12px' }} />

      <div style={{
        fontSize: 'clamp(2rem, 10vw, 3.25rem)', fontWeight: 800,
        color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
        textAlign: 'center', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.03em', marginBottom: 12,
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: isActive ? 'scale(1.05)' : 'scale(1)',
      }}>
        {finalsScore}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: 4 }}>
        {[0,1,2,3,4].map(si => {
          const complete = stationScores[si] !== undefined;
          const isMBRack = moneyrackStation === si + 1;
          return (
            <div key={si} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: complete ? (isMBRack ? '#f59e0b' : '#fff') : 'rgba(255,255,255,0.15)',
              transition: 'background 0.3s',
            }} />
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 9, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
        {[0,1,2,3,4].map(si => {
          const pts = stationScores[si];
          const isMBRack = moneyrackStation === si + 1;
          return (
            <span key={si} style={{
              color: pts === undefined ? 'transparent' : pts >= 5 ? (isMBRack ? '#f59e0b' : '#4ade80') : pts >= 3 ? 'rgba(255,255,255,0.5)' : '#f87171',
              fontWeight: 600, width: 14, textAlign: 'center',
            }}>
              {pts ?? '·'}
            </span>
          );
        })}
      </div>

      {phase === 'done' && isWinner && (
        <div style={{
          marginTop: 14, padding: '4px 14px', background: '#eab308', color: '#000',
          borderRadius: 20, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
          textTransform: 'uppercase', textAlign: 'center', width: 'fit-content', margin: '14px auto 0',
        }}>
          ★ Champion
        </div>
      )}
    </div>
  );
}

export function FinalsScoreboard({
  finalist1, finalist2, r1Scores, finalsScores, ballState,
  activeId, activeSi, winnerId, phase, round, moneyrackAssignments
}: FinalsScoreboardProps) {
  const scoreDiff = Math.abs((finalsScores[finalist1.id] || 0) - (finalsScores[finalist2.id] || 0));
  const leadingPlayer = (finalsScores[finalist1.id] || 0) > (finalsScores[finalist2.id] || 0) ? finalist1 : finalist2;

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden flex flex-col p-4 h-full">
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#94a3b8', textTransform: 'uppercase' }}>Finals</span>
        {scoreDiff > 0 && phase !== 'done' && (
          <span style={{ fontSize: 10, color: '#cbd5e1' }}>{leadingPlayer.name.split(' ')[1]} +{scoreDiff}</span>
        )}
      </div>

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 relative">
          <FinalistCard
            contestant={finalist1}
            r1Score={r1Scores[finalist1.id] || 0}
            finalsScore={finalsScores[finalist1.id] || 0}
            isActive={activeId === finalist1.id}
            isWinner={winnerId === finalist1.id}
            stationScores={getStationScores(finalist1.id, round, ballState)}
            phase={phase}
            moneyrackStation={moneyrackAssignments.get(finalist1.id) || 0}
          />
          <FinalistCard
            contestant={finalist2}
            r1Score={r1Scores[finalist2.id] || 0}
            finalsScore={finalsScores[finalist2.id] || 0}
            isActive={activeId === finalist2.id}
            isWinner={winnerId === finalist2.id}
            stationScores={getStationScores(finalist2.id, round, ballState)}
            phase={phase}
            moneyrackStation={moneyrackAssignments.get(finalist2.id) || 0}
          />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-slate-400">
          vs
        </div>
      </div>
    </div>
  );
}
