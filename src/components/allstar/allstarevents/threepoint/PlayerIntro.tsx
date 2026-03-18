import React, { useState, useEffect } from 'react';
import { ThreePointContestant } from '../../../../services/allStar/ThreePointContestant';
import { ShootingZoneData } from '../../../../services/allStar/ThreePointContestSim';

interface PlayerIntroSequenceProps {
  contestants: ThreePointContestant[];
  zoneData: Map<string, ShootingZoneData>;
  moneyrackAssignments: Map<string, number>;
  onComplete: () => void;
  onSkip: () => void;
}

const STATION_NAMES = ['Left Corner', 'Left Wing', 'Top of Key', 'Right Wing', 'Right Corner'];
const PLAYER_DURATION = 8000;

export const PlayerIntroSequence: React.FC<PlayerIntroSequenceProps> = ({
  contestants, zoneData, moneyrackAssignments, onComplete, onSkip
}) => {
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [phase, setPhase] = useState(0);
  const [countedPM, setCountedPM] = useState(0);
  const [countedPA, setCountedPA] = useState(0);
  const [countedPct, setCountedPct] = useState(0);
  const [countedTotalPM, setCountedTotalPM] = useState(0);
  const [zonesVisible, setZonesVisible] = useState<boolean[]>([false,false,false,false,false]);
  const [sliderPos, setSliderPos] = useState(50);
  const [sliderStopped, setSliderStopped] = useState(false);
  const [moneyballRevealed, setMoneyballRevealed] = useState(false);

  const contestant = contestants[currentPlayerIdx];
  const zones = zoneData.get(contestant?.id ?? '');
  const moneyrack = moneyrackAssignments.get(contestant?.id ?? '') ?? 3;
  const sliderStopPct = ((moneyrack - 0.5) / 5) * 100;

  const stats = React.useMemo(() => {
    let threePct = 0, threePM = 0, threePA = 0, totalPM = 0, totalPA = 0;

    if (zones) {
      totalPA = zones.volByStation.reduce((a, b) => a + b, 0);
      totalPM = zones.pctByStation.reduce((sum, pct, i) => sum + pct * zones.volByStation[i], 0);
      threePct = totalPA > 0 ? (totalPM / totalPA) * 100 : 0;
      const estimatedGames = totalPA > 15 ? 35 : 1;
      threePA = totalPA / estimatedGames;
      threePM = totalPM / estimatedGames;
    } else {
      const tp = contestant.ratings.tp;
      threePct = tp * 0.28 + 20;
      threePA = tp * 0.08 + 2;
      threePM = threePA * (threePct / 100);
      totalPA = Math.round(threePA * 35);
      totalPM = Math.round(threePM * 35);
    }

    return { threePct, threePM, threePA, totalPM, totalPA };
  }, [contestant, zones]);

  const onCompleteRef = React.useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    setPhase(0);
    setCountedPM(0); setCountedPA(0); setCountedPct(0); setCountedTotalPM(0);
    setZonesVisible([false,false,false,false,false]);
    setSliderPos(50); setSliderStopped(false); setMoneyballRevealed(false);

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase(1), 1000));
    timers.push(setTimeout(() => setPhase(2), 2000));
    timers.push(setTimeout(() => setPhase(3), 2500));
    timers.push(setTimeout(() => setPhase(4), 4500));
    timers.push(setTimeout(() => setPhase(5), 4800));
    timers.push(setTimeout(() => setPhase(6), 6000));
    timers.push(setTimeout(() => setPhase(7), 6800));
    timers.push(setTimeout(() => {
      if (currentPlayerIdx < contestants.length - 1) {
        setCurrentPlayerIdx(i => i + 1);
      } else {
        onCompleteRef.current();
      }
    }, PLAYER_DURATION));

    return () => timers.forEach(clearTimeout);
  }, [currentPlayerIdx, contestants.length]);

  useEffect(() => {
    if (phase !== 3) return;
    const duration = 600, steps = 25;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      setCountedPct(Math.round(progress * stats.threePct * 10) / 10);
      setCountedPM(Math.round(progress * stats.threePM * 10) / 10);
      setCountedPA(Math.round(progress * stats.threePA * 10) / 10);
      setCountedTotalPM(Math.round(progress * stats.totalPM));
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [phase, stats]);

  useEffect(() => {
    if (phase !== 5) return;
    const timers = STATION_NAMES.map((_, i) =>
      setTimeout(() => {
        setZonesVisible(prev => { const next = [...prev]; next[i] = true; return next; });
      }, i * 120)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  useEffect(() => {
    if (phase !== 6) return;
    const startPos = 50, endPos = sliderStopPct, duration = 600, steps = 30;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / steps, 3);
      setSliderPos(startPos + (endPos - startPos) * eased);
      if (step >= steps) {
        clearInterval(timer);
        setSliderStopped(true);
        setTimeout(() => setMoneyballRevealed(true), 200);
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [phase, sliderStopPct]);

  if (!contestant) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#000',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <button
        onClick={onSkip}
        style={{
          position: 'absolute', top: 20, right: 24,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
          color: '#64748b', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.15em', padding: '6px 14px', borderRadius: 20,
          cursor: 'pointer', zIndex: 10,
        }}
      >
        SKIP INTROS
      </button>

      <div style={{
        position: 'absolute', top: 20, left: 24,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: '#334155',
      }}>
        {currentPlayerIdx + 1} / {contestants.length}
      </div>

      <div style={{ position: 'absolute', bottom: 24, display: 'flex', gap: 6 }}>
        {contestants.map((_, i) => (
          <div key={i} style={{
            width: i === currentPlayerIdx ? 20 : 6, height: 6, borderRadius: 3,
            background: i < currentPlayerIdx ? '#f59e0b' : i === currentPlayerIdx ? '#fff' : '#1e293b',
            transition: 'all 0.3s ease',
          }} />
        ))}
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 0,
        width: '100%', maxWidth: 480, padding: '0 24px',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.3em',
          color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase',
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? 'translateY(0)' : 'translateY(10px)',
          transition: 'all 0.5s ease',
        }}>
          {contestant.pos} · {contestant.team}
        </div>
        <div style={{
          fontSize: 'clamp(2rem, 10vw, 3.5rem)', fontWeight: 900, letterSpacing: '-0.03em',
          color: '#fff', textAlign: 'center', lineHeight: 1,
          marginBottom: 24, textTransform: 'uppercase',
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? 'scale(1)' : 'scale(0.9)',
          transition: 'all 0.6s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          {contestant.name}
        </div>

        <div style={{
          width: 'clamp(100px, 25vw, 130px)', height: 'clamp(100px, 25vw, 130px)', borderRadius: '50%',
          overflow: 'hidden', border: '3px solid #f59e0b',
          boxShadow: '0 0 40px rgba(245,158,11,0.3)', marginBottom: 32,
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.6s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <img
            src={contestant.imgURL}
            alt={contestant.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
            onError={e => {
              (e.target as HTMLImageElement).src =
                `https://ui-avatars.com/api/?name=${encodeURIComponent(contestant.name.split(' ').map(n=>n[0]).join(''))}&background=1e293b&color=fff&size=240`;
            }}
          />
        </div>

        {phase >= 2 && (
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.3em',
            color: '#cbd5e1', marginBottom: 16,
            animation: 'fadeIn 0.3s ease forwards',
          }}>
            THIS SEASON
          </div>
        )}

        {phase >= 3 && (
          <div style={{
            display: 'flex', gap: 'clamp(12px, 4vw, 24px)', marginBottom: 32,
            animation: 'fadeIn 0.3s ease forwards',
            alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {[
              { val: countedPct.toFixed(1), unit: '%', label: '3P%' },
              { val: countedPM.toFixed(1), unit: '', label: '3PM/G' },
              { val: countedPA.toFixed(1), unit: '', label: '3PA/G' },
              { val: countedTotalPM, unit: '', label: 'TOTAL 3PM' },
            ].map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div style={{ width: 1, height: 30, background: '#334155' }} />}
                <div style={{ textAlign: 'center', minWidth: 60 }}>
                  <div style={{
                    fontSize: i === 0 ? 'clamp(2rem, 8vw, 3rem)' : 'clamp(1.5rem, 6vw, 2rem)',
                    fontWeight: 900, fontFamily: 'monospace', color: '#fff', lineHeight: 1,
                  }}>
                    {item.val}<span style={{ fontSize: '0.5em', color: '#94a3b8' }}>{item.unit}</span>
                  </div>
                  <div style={{ fontSize: 8, color: '#94a3b8', letterSpacing: '0.2em', marginTop: 4 }}>
                    {item.label}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {phase >= 4 && zones && (
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: '#cbd5e1', marginBottom: 10 }}>
            SHOOTING ZONES
          </div>
        )}

        {phase >= 5 && zones && (
          <div style={{ display: 'flex', gap: 'clamp(2px, 1vw, 6px)', width: '100%', marginBottom: 'clamp(16px, 4vh, 28px)' }}>
            {zones.racks.map((rack, i) => {
              const pct = parseFloat(rack.pct);
              const isHot = pct >= 40;
              const isMoneyrack = moneyrack === i + 1;
              return (
                <div key={i} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  opacity: zonesVisible[i] ? 1 : 0,
                  transform: zonesVisible[i] ? 'translateY(0)' : 'translateY(10px)',
                  transition: 'all 0.3s ease',
                }}>
                  <div style={{
                    width: '100%', height: 'clamp(40px, 10vh, 60px)',
                    background: '#0d1117', borderRadius: 4, overflow: 'hidden', position: 'relative',
                    border: `1px solid ${isMoneyrack ? '#f59e0b' : '#1e293b'}`,
                  }}>
                    <div style={{
                      position: 'absolute', bottom: 0, width: '100%',
                      height: zonesVisible[i] ? `${pct}%` : '0%',
                      background: isMoneyrack ? '#f59e0b' : isHot ? '#4ade80' : '#3b82f6',
                      transition: 'height 0.5s ease', opacity: 0.8,
                    }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 'clamp(9px, 2.5vw, 11px)', fontWeight: 700, fontFamily: 'monospace', color: '#fff', zIndex: 1 }}>
                        {rack.pct}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 8, color: '#94a3b8' }}>{rack.vol}</div>
                  <div style={{ fontSize: 7, color: '#cbd5e1', textAlign: 'center', lineHeight: 1.2 }}>
                    {STATION_NAMES[i].split(' ')[0]}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {phase >= 6 && (
          <div style={{ width: '100%', marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: '#cbd5e1', marginBottom: 8, textAlign: 'left' }}>
              MONEYBALL RACK
            </div>
            <div style={{ width: '100%', height: 4, background: '#1e293b', borderRadius: 2, position: 'relative', border: '1px solid #334155' }}>
              {[20, 40, 60, 80].map(pos => (
                <div key={pos} style={{ position: 'absolute', left: `${pos}%`, width: 1, height: 12, background: '#475569', top: -4 }} />
              ))}
              <div style={{
                position: 'absolute', left: `${sliderPos}%`, top: '50%',
                transform: 'translate(-50%, -50%)',
                width: sliderStopped ? 22 : 12, height: sliderStopped ? 22 : 12,
                borderRadius: '50%',
                background: sliderStopped ? '#f59e0b' : '#fff',
                boxShadow: sliderStopped ? '0 0 25px rgba(245,158,11,0.9)' : 'none',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)', zIndex: 2,
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              {STATION_NAMES.map((name, i) => (
                <div key={i} style={{
                  fontSize: 8, color: moneyrack === i + 1 ? '#f59e0b' : '#94a3b8',
                  fontWeight: moneyrack === i + 1 ? 700 : 400,
                  textAlign: 'center', flex: 1, transition: 'color 0.3s ease',
                }}>
                  {name.split(' ')[0]}
                </div>
              ))}
            </div>
          </div>
        )}

        {moneyballRevealed && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8, padding: '8px 16px',
            animation: 'fadeIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 12px rgba(245,158,11,0.8)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#f59e0b' }}>
              {STATION_NAMES[moneyrack - 1].toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};
