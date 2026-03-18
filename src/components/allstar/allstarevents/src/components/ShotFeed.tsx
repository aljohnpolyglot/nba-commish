import React, { useEffect, useRef } from 'react';
import { ThreePointPlay } from '../data/threePointPlaysEngine';
import { motion, AnimatePresence } from 'motion/react';
import { CONTESTANTS } from '../data/contestants';

interface ShotFeedProps {
  plays: ThreePointPlay[];
  currentIndex: number;
}

const SHOW_PORTRAIT_TYPES = [
  'contestant_intro',
  'rack_complete', 
  'station_complete',
  'r1_standings',
  'finals_start',
  'winner'
];

const PLAY_STYLES: Record<string, { border: string; bg: string; color: string; borderWidth: string }> = {
  // Ball outcomes
  ball_shot_made_regular:   { border: '#4ade80', bg: 'rgba(74,222,128,0.04)',  color: '#4ade80', borderWidth: '2px' },
  ball_shot_made_moneyball: { border: '#f59e0b', bg: 'rgba(245,158,11,0.07)', color: '#f59e0b', borderWidth: '2px' },
  ball_shot_missed:         { border: '#f87171', bg: 'rgba(248,113,113,0.04)', color: '#f87171', borderWidth: '2px' },

  // Station/rack milestones
  station_complete:   { border: '#60a5fa', bg: 'rgba(96,165,250,0.05)', color: '#60a5fa', borderWidth: '2.5px' },
  rack_complete:      { border: '#ffffff', bg: 'rgba(255,255,255,0.06)', color: '#ffffff', borderWidth: '3px' },
  contestant_intro:   { border: '#a78bfa', bg: 'rgba(167,139,250,0.05)', color: '#a78bfa', borderWidth: '2.5px' },

  // Navigation/setup
  station_start:      { border: 'rgba(255,255,255,0.12)', bg: 'transparent', color: 'rgba(255,255,255,0.45)', borderWidth: '1.5px' },
  section_header:     { border: '#f59e0b', bg: 'rgba(245,158,11,0.06)', color: '#f59e0b', borderWidth: '3px' },
  finals_start:       { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)', color: '#f59e0b', borderWidth: '3px' },
  r1_standings:       { border: '#60a5fa', bg: 'rgba(96,165,250,0.05)', color: '#60a5fa', borderWidth: '2px' },
  winner:             { border: '#eab308', bg: 'rgba(234,179,8,0.08)',   color: '#eab308', borderWidth: '3px' },

  // Default fallback
  default:            { border: 'rgba(255,255,255,0.08)', bg: 'transparent', color: 'rgba(255,255,255,0.5)', borderWidth: '1.5px' },
};

function getPlayStyle(play: ThreePointPlay) {
  if (play.type === 'ball_shot') {
    if (!play.ballResult) return PLAY_STYLES.default;
    if (play.isAirball) {
      return { border: '#ef4444', bg: 'rgba(239,68,68,0.08)', color: '#ef4444', borderWidth: '3px' };
    }
    if (play.ballResult.made) {
      return play.ballResult.isMoneyball ? PLAY_STYLES.ball_shot_made_moneyball : PLAY_STYLES.ball_shot_made_regular;
    }
    return PLAY_STYLES.ball_shot_missed;
  }
  if (play.type === 'streak') {
    const isHot = play.text.includes('DIALED') || play.text.includes('miss') || play.text.includes('ROW') || play.text.includes('PERFECT') || play.text.includes('fire');
    return isHot 
      ? { border: '#f59e0b', bg: 'transparent', color: '#fcd34d', borderWidth: '1.5px' }
      : { border: '#f87171', bg: 'transparent', color: '#fca5a5', borderWidth: '1.5px' };
  }
  if (play.type === 'crowd_reaction') {
    return { border: '#818cf8', bg: 'rgba(129,140,248,0.04)', color: 'rgba(129,140,248,0.7)', borderWidth: '2px' };
  }
  return PLAY_STYLES[play.type] ?? PLAY_STYLES.default;
}

export function ShotFeed({ plays, currentIndex }: ShotFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .commentary-feed {
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.12) transparent;
      }
      .commentary-feed::-webkit-scrollbar { width: 3px; }
      .commentary-feed::-webkit-scrollbar-track { background: transparent; }
      .commentary-feed::-webkit-scrollbar-thumb { 
        background: rgba(255,255,255,0.12); 
        border-radius: 10px; 
      }
      .commentary-feed::-webkit-scrollbar-thumb:hover { 
        background: rgba(255,255,255,0.25); 
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentIndex]);

  const visiblePlays = plays.slice(0, currentIndex + 1);

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col h-[400px] lg:h-full overflow-hidden">
      <div className="p-4 border-b border-slate-800 bg-slate-900/80">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Live Commentary</h3>
      </div>
      
      <div ref={scrollRef} className="commentary-feed flex-1 overflow-y-auto p-4 space-y-1 scroll-smooth">
        <AnimatePresence initial={false}>
          {visiblePlays.map((play, i) => {
            const style = getPlayStyle(play);
            const contestant = CONTESTANTS.find(c => c.id === play.playerId);
            const showPortrait = SHOW_PORTRAIT_TYPES.includes(play.type) && contestant;
            const isRackComplete = play.type === 'rack_complete';

            return (
              <motion.div
                key={play.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '5px 10px 5px 10px',
                  borderLeft: `${style.borderWidth} solid ${style.border}`,
                  background: style.bg,
                  marginBottom: 2,
                  borderRadius: '0 4px 4px 0',
                  transition: 'background 0.2s',
                }}
              >
                {showPortrait && contestant && (
                  <img 
                    src={contestant.imgURL} 
                    alt=""
                    style={{ 
                      width: isRackComplete ? 32 : 24, 
                      height: isRackComplete ? 32 : 24, 
                      borderRadius: '50%',
                      objectFit: 'cover', objectPosition: 'top center',
                      flexShrink: 0, marginTop: 2,
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <span style={{ 
                    fontSize: play.isAirball ? 13 : 12, 
                    color: style.color,
                    lineHeight: 1.5,
                    fontWeight: (play.type === 'section_header' || play.type === 'finals_start' || play.type === 'winner' || play.type === 'rack_complete' || play.isAirball) ? 'bold' : 'normal',
                    fontStyle: (play.type === 'streak' || play.type === 'crowd_reaction') ? 'italic' : 'normal',
                  }}>
                    {play.text}
                  </span>
                  {play.subtext && (
                    <div style={{
                      fontSize: 10,
                      color: play.subtext.includes('Moneyball') ? '#f59e0b' : 'rgba(255,255,255,0.3)',
                      marginTop: 2,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '0.04em',
                    }}>
                      {play.subtext}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
