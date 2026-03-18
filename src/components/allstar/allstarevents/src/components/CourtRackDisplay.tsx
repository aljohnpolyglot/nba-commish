import React from 'react';
import { motion } from 'motion/react';
import { BallResult, ShootingZoneData } from '../data/ThreePointContestSim';

interface CourtRackDisplayProps {
  activePlayerId: string;
  activeRound: string;
  activeStation: number; // 0-4
  activeBall: number; // 0-4
  ballState: Record<string, BallResult>;
  moneyrackStation: number; // 1-5
  showShotChart: boolean;
  shotChart?: ShootingZoneData;
  highScoreFlash?: number | null;
}

const STATION_POSITIONS = [
  { x: '8%',  y: '18%', label: 'Left Corner' },
  { x: '24%', y: '52%', label: 'Left Wing' },
  { x: '50%', y: '68%', label: 'Top of Key' },
  { x: '76%', y: '52%', label: 'Right Wing' },
  { x: '92%', y: '18%', label: 'Right Corner' },
];

export function CourtRackDisplay({
  activePlayerId,
  activeRound,
  activeStation,
  activeBall,
  ballState,
  moneyrackStation,
  showShotChart,
  shotChart,
  highScoreFlash
}: CourtRackDisplayProps) {

  const getBubbleColor = (pct: number) => 
    pct >= 40 ? '#4ade80' :
    pct >= 35 ? '#facc15' : '#f87171';

  const getBubbleSize = (vol: number) =>
    vol >= 3 ? 52 : vol >= 1.5 ? 44 : 36;

  return (
    <div className="relative w-full aspect-[540/510] bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
      <style>{`
        @keyframes popIn {
          from { transform: translateX(-50%) scale(0); opacity: 0; }
          to   { transform: translateX(-50%) scale(1); opacity: 1; }
        }
        @keyframes ballPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
        @keyframes flashIn {
          0% { opacity: 0; transform: scale(0.95); }
          10% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      
      {/* High Score Flash Overlay */}
      {highScoreFlash && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)',
          animation: 'flashIn 0.3s ease',
          borderRadius: 'inherit',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', color: '#f59e0b', marginBottom: 4 }}>
            SERIOUS NUMBER
          </div>
          <div style={{ fontSize: 72, fontWeight: 900, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {highScoreFlash}
          </div>
        </div>
      )}

      {/* Shot Chart Overlay */}
      {showShotChart && shotChart && STATION_POSITIONS.map((pos, i) => {
        const zonePct = shotChart.pctByStation[i];
        const zoneVol = shotChart.volByStation[i];
        const size = getBubbleSize(zoneVol);
        const color = getBubbleColor(zonePct * 100);
        return (
          <div key={`chart-${i}`} style={{
            position: 'absolute',
            left: pos.x, top: pos.y,
            transform: 'translate(-50%, -50%)',
            width: size, height: size,
            borderRadius: '50%',
            background: `${color}22`,
            border: `1.5px solid ${color}`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 5, pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color }}>{(zonePct * 100).toFixed(1)}</span>
            <span style={{ fontSize: 8, color, opacity: 0.8 }}>%</span>
          </div>
        );
      })}

      {/* Add source indicator when overlay is on */}
      {showShotChart && shotChart && (
        <div style={{
          position: 'absolute', top: 8, left: 8, zIndex: 6,
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 10,
          background: 'rgba(0,0,0,0.6)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
          color: '#fff'
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: '#4ade80'
          }} />
          LIVE DATA
        </div>
      )}

      {/* Court SVG */}
      <svg viewBox="0 0 540 510" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-60">
        <g transform="translate(20, 17)">
          <path d="M469.8,139.9c-49.7,121.4-188.3,179.6-309.7,129.9c-59-24.1-105.8-70.9-129.9-129.9" fill="none" stroke="#c8a96e" strokeWidth="2" />
          <path d="M470,0v140 M30,0v140" fill="none" stroke="#c8a96e" strokeWidth="2" />
          <path d="M330,0v190 M170,0v190 M310,0v190 M190,0v190 M330,190H170" fill="none" stroke="#c8a96e" strokeWidth="2" />
          <path d="M250,42.5c4.1,0,7.5,3.4,7.5,7.5s-3.4,7.5-7.5,7.5s-7.5-3.4-7.5-7.5S245.9,42.5,250,42.5z" fill="none" stroke="#c8a96e" strokeWidth="2" />
          <path d="M0,0v470h500" fill="none" stroke="#c8a96e" strokeWidth="2" />
        </g>
      </svg>

      {/* Racks */}
      {STATION_POSITIONS.map((pos, sIdx) => {
        const isMoneyRack = moneyrackStation === sIdx + 1;
        const isStationActive = activeStation === sIdx;
        const isMoneyrackActive = isStationActive && isMoneyRack;
        
        const stationBalls = [0, 1, 2, 3, 4].map(bIdx => ballState[`${activePlayerId}|${activeRound}|${sIdx}|${bIdx}`]);
        const stationComplete = stationBalls.every(b => b !== undefined);
        const stationPoints = stationBalls.reduce((sum, b) => sum + (b ? b.points : 0), 0);
        
        return (
          <div 
            key={sIdx}
            className="absolute flex flex-col items-center justify-center -translate-x-1/2 -translate-y-1/2"
            style={{ left: pos.x, top: pos.y }}
          >
            {/* Station Score Pill */}
            {stationComplete && (
              <div style={{
                position: 'absolute',
                top: -18,
                left: '50%',
                transform: 'translateX(-50%)',
                background: isMoneyRack ? '#f59e0b' : 
                            stationPoints >= 5 ? 'rgba(74, 222, 128, 0.2)' : 
                            stationPoints >= 3 ? 'rgba(255,255,255,0.15)' : 'rgba(248, 113, 113, 0.2)',
                color: isMoneyRack ? '#000' : 
                       stationPoints >= 5 ? '#4ade80' : 
                       stationPoints >= 3 ? '#fff' : '#f87171',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 20,
                whiteSpace: 'nowrap',
                animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                zIndex: 10,
              }}>
                {stationPoints}
              </div>
            )}

            {/* Station Container */}
            <div style={{
              padding: '6px 8px',
              borderRadius: 8,
              background: isMoneyrackActive 
                ? 'rgba(245, 158, 11, 0.12)' 
                : isStationActive 
                ? 'rgba(255,255,255,0.06)' 
                : 'transparent',
              border: isMoneyrackActive
                ? '1px solid rgba(245, 158, 11, 0.4)'
                : isStationActive
                ? '1px solid rgba(255,255,255,0.12)'
                : '1px solid transparent',
              transition: 'all 0.3s ease',
              boxShadow: isMoneyrackActive 
                ? '0 0 20px rgba(245, 158, 11, 0.15)' 
                : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              {/* Station Label */}
              <div className={`text-[clamp(8px,2vw,10px)] font-bold uppercase tracking-wider mb-2 px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap flex items-center gap-1
                ${isStationActive ? 'bg-white text-black' : isMoneyRack ? 'bg-amber-500/20 text-amber-500' : 'text-slate-400'}
              `}>
                {pos.label}
                {isMoneyRack && <span style={{ color: isStationActive ? '#000' : '#f59e0b' }}>● MB</span>}
              </div>

              {/* Balls */}
              <div className="flex gap-0.5 sm:gap-1 bg-slate-900/80 p-1 sm:p-1.5 rounded-lg border border-slate-700/50 backdrop-blur-sm shadow-xl">
                {[0, 1, 2, 3, 4].map(bIdx => {
                  const isMoneyball = isMoneyRack || bIdx === 4;
                  const stateKey = `${activePlayerId}|${activeRound}|${sIdx}|${bIdx}`;
                  const result = ballState[stateKey];
                  const isActiveBall = isStationActive && activeBall === bIdx && result === undefined;

                  if (isActiveBall) {
                    return (
                      <div key={bIdx} style={{
                        width: 'clamp(10px, 2.5vw, 14px)', height: 'clamp(10px, 2.5vw, 14px)', borderRadius: '50%',
                        background: 'transparent',
                        border: isMoneyball ? '2px solid #f59e0b' : '1.5px solid rgba(255,255,255,0.5)',
                        animation: 'ballPulse 0.6s ease-in-out infinite',
                      }} />
                    );
                  }

                  let bgClass = 'bg-transparent';
                  let borderClass = isMoneyball ? 'border-amber-500/50' : 'border-slate-600';
                  let shadowClass = '';

                  if (result) {
                    if (result.made) {
                      if (result.isMoneyball) {
                        bgClass = 'bg-amber-500';
                        borderClass = 'border-amber-500';
                        shadowClass = 'shadow-[0_0_15px_rgba(245,158,11,0.8)]';
                      } else {
                        bgClass = 'bg-white';
                        borderClass = 'border-white';
                        shadowClass = 'shadow-[0_0_10px_rgba(255,255,255,0.5)]';
                      }
                    } else {
                      bgClass = 'bg-slate-800';
                      borderClass = 'border-slate-800';
                    }
                  }

                  return (
                    <motion.div
                      key={bIdx}
                      animate={result ? { scale: [0.8, 1.2, 1] } : { scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className={`w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full border-2 ${bgClass} ${borderClass} ${shadowClass}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
