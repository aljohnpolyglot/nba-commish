import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Pause, FastForward } from 'lucide-react';
import { Game, NBATeam, NBAPlayer } from '../../types';
import { useLiveGame } from '../../hooks/useLiveGame';
import { SettingsManager } from '../../services/SettingsManager';
import { getTeamForGame, getPlayersForExhibitionTeam } from '../../utils/helpers';

interface GameSimulatorScreenProps {
  game: Game;
  teams: NBATeam[];
  players: NBAPlayer[];
  isProcessing: boolean;
  onClose: () => void;
  onComplete: (result: any) => void;
  allStar?: any;
  otherGamesToday?: number;
  riggedForTid?: number;
  precomputedResult?: any;
}

function fmtMin(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const GameSimulatorScreen: React.FC<GameSimulatorScreenProps> = ({
  game,
  teams,
  players,
  isProcessing,
  onClose,
  onComplete,
  allStar,
  otherGamesToday = 0,
  riggedForTid,
  precomputedResult,
}) => {
  const isExhibition = game.homeTid < 0;

  const homeTeam = useMemo(() => getTeamForGame(game.homeTid, teams), [game.homeTid, teams]);
  const awayTeam = useMemo(() => getTeamForGame(game.awayTid, teams), [game.awayTid, teams]);

  const homeOverridePlayers = useMemo(
    () => isExhibition ? getPlayersForExhibitionTeam(game, true, allStar, players) : undefined,
    [game, isExhibition, allStar, players]
  );
  const awayOverridePlayers = useMemo(
    () => isExhibition ? getPlayersForExhibitionTeam(game, false, allStar, players) : undefined,
    [game, isExhibition, allStar, players]
  );

  if (!homeTeam || !awayTeam) {
    return <div className="text-white p-4">Error: Teams not found for this game ({game.homeTid} vs {game.awayTid}).</div>;
  }

  const {
    homeScore,
    awayScore,
    quarter,
    clock,
    events,
    plays,
    currentIndex,
    speed,
    setSpeed,
    liveStats,
    teamStats,
    isSimulating,
    isFinished,
    startSimulation,
    pauseSimulation,
    skipToEndOfQuarter,
    skip3Minutes,
    skipToLast2Minutes,
    togglePlay,
    badgesLoaded,
    currentPlay,
    finalResult
  } = useLiveGame(game, homeTeam, awayTeam, players, onComplete, homeOverridePlayers, awayOverridePlayers, riggedForTid, precomputedResult);

  const [activeTab, setActiveTab] = useState('boxscore');
  const [loadingMessage, setLoadingMessage] = useState("Players taking the court...");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const settings = SettingsManager.getSettings();
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (badgesLoaded) return;
    const messages = [
      "Players taking the court...",
      "Referees reviewing ground rules...",
      "National Anthem playing...",
      "Finalizing starting lineups...",
      "Tip-off imminent..."
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      setLoadingMessage(messages[i]);
    }, 1500);
    return () => clearInterval(interval);
  }, [badgesLoaded]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [currentIndex]);

  const currentPossession = currentPlay ? currentPlay.possession : null;
  const isFinal = isFinished;

  const getClockDisplay = () => {
    if (isFinal) return '0:00';
    if (!currentPlay) return '12:00';
    
    const gs = currentPlay.gs;
    const isOT = currentPlay.q > 4;
    const qLen = isOT ? 300 : 720;
    const qStartGs = currentPlay.q <= 4 
      ? (currentPlay.q - 1) * 720 
      : 2880 + (currentPlay.q - 5) * 300;
    
    const tiq = qLen - (gs - qStartGs);
    
    if (tiq <= 60 && tiq > 0) {
      const seconds = Math.floor(tiq);
      const tenths = Math.floor((tiq % 1) * 10);
      return `${seconds}.${tenths}`;
    } else {
      const minutes = Math.max(0, Math.floor(tiq / 60));
      const seconds = Math.max(0, Math.floor(tiq % 60));
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }
  };

  const getPeriodLabel = (q: number) => {
    if (q === 1) return '1ST';
    if (q === 2) return '2ND';
    if (q === 3) return '3RD';
    if (q === 4) return '4TH';
    return `OT${q - 4}`;
  };

  const clockDisplay = getClockDisplay();
  const periodDisplay = isFinal 
    ? (finalResult?.otCount ? `FINAL/${finalResult.otCount > 1 ? finalResult.otCount : ''}OT` : 'FINAL') 
    : (currentPlay ? getPeriodLabel(currentPlay.q) : '1ST');

  const qScores = { away: [] as (string|number)[], home: [] as (string|number)[] };
  if (currentIndex >= 0) {
    const aQs: number[] = [];
    const hQs: number[] = [];
    for (let i = 0; i <= currentIndex; i++) {
      const p = plays[i];
      if (p && p.pts > 0) {
        if (!aQs[p.q - 1]) aQs[p.q - 1] = 0;
        if (!hQs[p.q - 1]) hQs[p.q - 1] = 0;
        if (p.tm === 'AWAY') aQs[p.q - 1] += p.pts;
        else                 hQs[p.q - 1] += p.pts;
      }
    }
    const currentQ = plays[currentIndex]?.q || 1;
    const totalCols = Math.max(4, currentQ);
    for (let i = 0; i < totalCols; i++) {
      if (i + 1 <= currentQ) {
        qScores.away[i] = aQs[i] || 0;
        qScores.home[i] = hQs[i] || 0;
      } else {
        qScores.away[i] = '-';
        qScores.home[i] = '-';
      }
    }
  }

  const awayLogo = awayTeam.logoUrl;
  const homeLogo = homeTeam.logoUrl;

  const playColor = (type: string) => {
    if (type === 'made')  return 'text-white';
    if (type === 'foul')  return 'text-orange-400';
    if (type === 'tov')   return 'text-red-400';
    if (type === 'stl')   return 'text-green-400';
    if (type === 'blk')   return 'text-yellow-400';
    if (type === 'reb')   return 'text-blue-300';
    if (type === 'ft')    return 'text-gray-200';
    if (type === 'jumpball') return 'text-indigo-400';
    if (type === 'ghost') return 'text-gray-400';
    return 'text-gray-400';
  };

  const doLeaveGame = () => {
    if (finalResult) {
      onComplete(finalResult);
    } else {
      onClose();
    }
  };

  const handleLeaveGame = () => {
    if (otherGamesToday > 0) {
      setShowLeaveConfirm(true);
    } else {
      doLeaveGame();
    }
  };

  if (!badgesLoaded) {
    return (
      <div
        className="absolute inset-0 z-50 bg-[#0a0a0c] flex flex-col items-center justify-center p-4"
        style={{ backgroundImage: 'radial-gradient(circle at center, #222 0%, #000 100%)' }}
      >
        <div className="flex items-center justify-center gap-8 md:gap-16 mb-12">
          <div className="flex flex-col items-center gap-3 md:gap-4">
            <img
              src={awayTeam.logoUrl}
              alt={awayTeam.abbrev}
              className="w-20 h-20 md:w-32 md:h-32 object-contain drop-shadow-2xl animate-pulse"
              referrerPolicy="no-referrer"
            />
            <span className="text-slate-400 font-black tracking-widest text-xs md:text-base uppercase">{awayTeam.abbrev}</span>
          </div>
          <div className="text-3xl md:text-6xl font-black text-slate-700 italic tracking-tighter">VS</div>
          <div className="flex flex-col items-center gap-3 md:gap-4">
            <img
              src={homeTeam.logoUrl}
              alt={homeTeam.abbrev}
              className="w-20 h-20 md:w-32 md:h-32 object-contain drop-shadow-2xl animate-pulse"
              referrerPolicy="no-referrer"
            />
            <span className="text-slate-400 font-black tracking-widest text-xs md:text-base uppercase">{homeTeam.abbrev}</span>
          </div>
        </div>
        
        <div className="flex flex-col items-center gap-4">
          <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full bg-indigo-500 w-1/2 rounded-full animate-[ping-pong_1.5s_ease-in-out_infinite_alternate]" />
          </div>
          <h2 className="text-indigo-400 font-bold tracking-widest uppercase text-xs md:text-base animate-pulse text-center px-4">
            {loadingMessage}
          </h2>
        </div>
        
        <style>{`
          @keyframes ping-pong {
            0% { transform: translateX(0); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
    <motion.div
      key="watching"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 z-50 bg-[#0a0a0c] flex flex-col items-center justify-start overflow-y-auto"
      style={{ backgroundImage: 'radial-gradient(circle at center, #222 0%, #000 100%)' }}
    >
      {/* ── top bar: date + close ── */}
      <div className="w-full max-w-5xl flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-50 bg-[#0a0a0c]/90 backdrop-blur-sm">
        <div className="text-gray-300 font-bold tracking-[0.2em] text-xs md:text-sm">{game.date}</div>
        <button
          onClick={handleLeaveGame}
          className="p-2.5 md:p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-all"
        >
          <X size={20} />
        </button>
      </div>

      <div className="w-full max-w-5xl px-2 sm:px-4 pb-4 flex flex-col gap-0">
        <div className="bg-[#1a1c23] border border-gray-700 shadow-2xl flex flex-col overflow-hidden rounded-sm">

          {/* ── top panel: play-by-play + scoreboard ── */}
          <div className="flex flex-col md:flex-row">

            {/* scoreboard — shown FIRST on mobile */}
            <div className="w-full md:w-[65%] md:order-2 relative bg-[#0d0e12] flex flex-col overflow-hidden min-h-[200px] sm:min-h-[240px] md:h-[360px]">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg,#222 25%,transparent 25%,transparent 75%,#222 75%,#222),linear-gradient(45deg,#222 25%,transparent 25%,transparent 75%,#222 75%,#222)',
                  backgroundSize: '20px 20px',
                  backgroundPosition: '0 0,10px 10px',
                }}
              />

              {/* scores */}
              <div className="flex justify-between items-center px-5 sm:px-10 md:px-16 py-5 sm:py-8 md:py-12 z-10">
                <div className="text-center flex flex-col items-center">
                  <div className="text-gray-400 font-bold tracking-[0.2em] mb-1 md:mb-4 text-[10px] md:text-sm">AWAY</div>
                  <div className="text-4xl sm:text-5xl md:text-7xl font-black font-mono text-white tracking-tighter">{awayScore}</div>
                </div>
                <div className="text-center flex flex-col items-center justify-center mt-1 md:mt-4">
                  <div className="text-white font-bold tracking-[0.2em] mb-0.5 md:mb-2 text-xs md:text-lg">{periodDisplay}</div>
                  <div
                    className="text-3xl sm:text-4xl md:text-6xl font-mono text-gray-200 font-bold tracking-widest"
                    style={{ textShadow: '0 0 10px rgba(255,255,255,0.3)' }}
                  >
                    {clockDisplay}
                  </div>
                </div>
                <div className="text-center flex flex-col items-center">
                  <div className="text-gray-400 font-bold tracking-[0.2em] mb-1 md:mb-4 text-[10px] md:text-sm">HOME</div>
                  <div className="text-4xl sm:text-5xl md:text-7xl font-black font-mono text-yellow-500 tracking-tighter">{homeScore}</div>
                </div>
              </div>

              {/* court + logos */}
              <div className="absolute bottom-0 left-0 w-full h-20 sm:h-24 md:h-32 flex justify-between items-end px-4 md:px-12 pb-3 md:pb-4 z-10 bg-gradient-to-t from-black/80 to-transparent">
                <img
                  src={awayLogo}
                  className={`h-14 sm:h-16 md:h-24 object-contain z-20 transition-all duration-300 ${currentPossession === 'AWAY' ? 'scale-110 drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]' : 'opacity-50 drop-shadow-2xl'}`}
                  alt="AWAY"
                />
                <div
                  className="flex-1 h-10 sm:h-14 md:h-20 border-2 border-gray-600 mx-3 md:mx-8 relative opacity-50 bg-[#1a1a1a]"
                  style={{ transform: 'perspective(500px) rotateX(20deg)' }}
                >
                  <div className="absolute top-0 left-1/2 w-0 h-full border-l-2 border-gray-600"></div>
                  <div className="absolute top-1/2 left-1/2 w-8 h-8 md:w-12 md:h-12 rounded-full border-2 border-gray-600 -translate-x-1/2 -translate-y-1/2"></div>
                  <div className="absolute top-0 left-0  w-10 sm:w-12 md:w-20 h-full border-r-2 border-gray-600 bg-gray-800/50"></div>
                  <div className="absolute top-0 right-0 w-10 sm:w-12 md:w-20 h-full border-l-2 border-gray-600 bg-gray-800/50"></div>
                  <div className="absolute top-0 left-0  w-20 sm:w-24 md:w-40 h-full border-r-2 border-gray-600 rounded-r-full"></div>
                  <div className="absolute top-0 right-0 w-20 sm:w-24 md:w-40 h-full border-l-2 border-gray-600 rounded-l-full"></div>
                </div>
                <img
                  src={homeLogo}
                  className={`h-14 sm:h-16 md:h-24 object-contain z-20 transition-all duration-300 ${currentPossession === 'HOME' ? 'scale-110 drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]' : 'opacity-50 drop-shadow-2xl'}`}
                  alt="HOME"
                />
              </div>
            </div>

            {/* play-by-play — shown SECOND on mobile */}
            <div className="w-full md:w-[35%] md:order-1 h-[220px] sm:h-[260px] md:h-[360px] border-t md:border-t-0 md:border-r border-gray-700 bg-[#22252d] flex flex-col">
              <div className="p-2.5 md:p-3 bg-[#1a1c23] border-b border-gray-700 font-bold text-[10px] tracking-[0.15em] text-gray-400 flex items-center gap-2 shrink-0">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
                LIVE PLAY-BY-PLAY
              </div>
              <div ref={feedRef} className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                {currentIndex < 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500 text-xs tracking-widest">
                    PRESS PLAY TO BEGIN
                  </div>
                ) : (
                  plays.slice(0, currentIndex + 1).map((play, idx) => {
                    if (!play) return null;
                    const isGameWinner = play.isGameWinner;
                    const isSpecialLine = play.desc?.includes('End of Regulation') || play.desc?.includes('We are TIED');

                    return (
                      <div
                        key={play.id ?? `play-${idx}`}
                        className={`flex items-start gap-2 md:gap-3 p-2 md:p-3 border-b border-gray-800/50 transition-all duration-500 ${
                          isGameWinner ? 'bg-gradient-to-r from-yellow-600/40 to-yellow-900/40 border-y-2 border-yellow-500/50 scale-[1.02] z-10' :
                          isSpecialLine ? 'bg-indigo-900/40 border-y border-indigo-500/30' :
                          play.tm === 'AWAY' ? 'bg-white/5' : 'bg-blue-500/5'
                        }`}
                      >
                        {isGameWinner && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[8px] font-black px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.5)] animate-bounce">
                            GAME WINNER
                          </div>
                        )}
                        <div className="relative shrink-0 w-8 h-8 md:w-10 md:h-10">
                          {play.player ? (
                            <img
                              src={play.player.imgURL || `https://picsum.photos/seed/${play.player.n}/100/100`}
                              className={`w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#111] object-cover border ${isGameWinner ? 'border-yellow-400 ring-2 ring-yellow-400/20' : 'border-gray-700'}`}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#111] border flex items-center justify-center ${isGameWinner ? 'border-yellow-400' : 'border-gray-700'}`}>
                              <span className="text-gray-500 text-[8px] md:text-[10px] font-bold">TEAM</span>
                            </div>
                          )}
                          <img
                            src={play.tm === 'AWAY' ? awayLogo : homeLogo}
                            className="absolute -bottom-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-[#1a1c23] rounded-full p-0.5 border border-gray-700 shadow-lg"
                            alt={play.tm}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[9px] md:text-[10px] text-gray-400 font-mono mb-0.5 md:mb-1">
                            {play.isOT ? `OT${play.otNum} ` : ''}{play.time}
                          </div>
                          <div className={`text-[11px] md:text-xs leading-snug ${isGameWinner ? 'text-yellow-100 font-bold text-sm' : playColor(play.type)}`}>
                            {play.desc}
                          </div>
                        </div>
                        {play.pts > 0 && (
                          <div className={`text-xs md:text-sm font-mono font-bold shrink-0 ${isGameWinner ? 'text-yellow-400 text-lg' : (play.tm === 'AWAY' ? 'text-white' : 'text-blue-400')}`}>
                            +{play.pts}
                          </div>
                        )}
                        {play.type === 'foul' && (
                          <div className={`text-[10px] md:text-xs font-mono shrink-0 ${
                            play.desc?.includes('FLAGRANT') ? 'text-red-500 font-bold' :
                            play.desc?.includes('Technical') ? 'text-purple-400' :
                            play.desc?.includes('Offensive') ? 'text-yellow-500' :
                            'text-orange-400'
                          }`}>
                            {play.desc?.includes('FLAGRANT') ? 'FLG' :
                             play.desc?.includes('Technical') ? 'TEC' :
                             play.desc?.includes('Offensive') ? 'OFF' : 'PF'}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── tab bar ── */}
          <div className="flex bg-[#111] border-y border-gray-700 text-[9px] sm:text-[10px] font-bold tracking-[0.1em] sm:tracking-[0.15em] text-gray-400 overflow-x-auto">
            <button
              onClick={togglePlay}
              className="bg-[#e61938] text-white px-4 sm:px-6 md:px-10 py-3 border-r border-gray-700 flex items-center justify-center gap-2 hover:bg-red-700 transition-colors shrink-0"
            >
              {isSimulating ? 'PAUSE' : (isFinal ? 'RESTART' : 'PLAY')}
              <div className={`w-2 h-2 ${isSimulating ? 'bg-white' : 'border border-white'}`}></div>
            </button>
            {[
              ['boxscore',   'BOX SCORE'],
              ['comparison', 'TEAM STATS'],
              ['quarterly',  'QUARTERLY'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 sm:px-5 md:px-8 py-3 hover:text-white hover:bg-white/5 border-r border-gray-700 flex items-center justify-center gap-1.5 transition-colors shrink-0 whitespace-nowrap ${activeTab === key ? 'text-white bg-white/10' : ''}`}
              >
                {label}
                <div className={`w-1.5 h-1.5 border ${activeTab === key ? 'border-white bg-white' : 'border-gray-500'}`}></div>
              </button>
            ))}
          </div>

          {/* ── bottom panel: skip controls + stats ── */}
          <div className="flex flex-col md:flex-row bg-[#1a1c23]">

            {/* skip / leave buttons */}
            <div className="w-full md:w-[30%] p-3 md:p-6 border-b md:border-b-0 md:border-r border-gray-700 flex flex-row md:flex-col flex-wrap gap-2 sticky top-0 bg-[#1a1c23] z-20">
              {!isFinished && (
                <>
                  <button
                    onClick={skip3Minutes}
                    className="font-bold tracking-[0.1em] sm:tracking-[0.15em] px-3 py-2.5 text-[10px] sm:text-xs transition-colors whitespace-nowrap bg-[#22252d] text-white hover:bg-white/10 flex-1 md:w-full md:flex-none text-center md:text-left"
                  >
                    SKIP 3 MINS
                  </button>
                  <button
                    onClick={skipToEndOfQuarter}
                    className="font-bold tracking-[0.1em] sm:tracking-[0.15em] px-3 py-2.5 text-[10px] sm:text-xs transition-colors whitespace-nowrap bg-[#22252d] text-white hover:bg-white/10 flex-1 md:w-full md:flex-none text-center md:text-left"
                  >
                    END OF QTR
                  </button>
                  <button
                    onClick={skipToLast2Minutes}
                    className="font-bold tracking-[0.1em] sm:tracking-[0.15em] px-3 py-2.5 text-[10px] sm:text-xs transition-colors whitespace-nowrap bg-[#22252d] text-white hover:bg-white/10 flex-1 md:w-full md:flex-none text-center md:text-left"
                  >
                    LAST 2 MINS
                  </button>
                </>
              )}
              <button
                onClick={handleLeaveGame}
                className="font-bold tracking-[0.1em] sm:tracking-[0.15em] px-3 py-2.5 text-[10px] sm:text-xs transition-colors whitespace-nowrap bg-[#22252d] text-white hover:bg-red-600/20 hover:text-red-400 flex-1 md:w-full md:flex-none text-center md:text-left md:mt-auto"
              >
                LEAVE GAME
              </button>
            </div>

            {/* stats panel */}
            <div className="w-full md:w-[70%] p-3 md:p-4 overflow-x-auto min-h-[160px] md:h-[210px] md:overflow-y-auto custom-scrollbar">

              {/* BOX SCORE */}
              {activeTab === 'boxscore' && (
                <div className="flex flex-col sm:flex-row gap-4 min-w-0">
                  {(['AWAY','HOME'] as const).map(tm => (
                    <div key={tm} className="flex-1 min-w-0">
                      <div className={`text-[10px] sm:text-xs font-bold tracking-widest mb-1.5 md:mb-2 ${tm === 'AWAY' ? 'text-white' : 'text-blue-400'}`}>
                        {tm === 'AWAY' ? awayTeam.abbreviation : homeTeam.abbreviation} — {teamStats[tm].pts} PTS
                      </div>
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-right text-[9px] sm:text-[10px] text-gray-400 whitespace-nowrap">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left font-normal pb-1 pr-2">PLAYER</th>
                              <th className="font-normal pb-1 px-1">MIN</th>
                              <th className="font-normal pb-1 px-1">PTS</th>
                              <th className="font-normal pb-1 px-1">REB</th>
                              <th className="font-normal pb-1 px-1">AST</th>
                              <th className="font-normal pb-1 px-1">STL</th>
                              <th className="font-normal pb-1 px-1">BLK</th>
                              <th className="font-normal pb-1 px-1">TO</th>
                              <th className="font-normal pb-1 px-1">PF</th>
                              <th className="font-normal pb-1 px-1">+/-</th>
                              <th className="font-normal pb-1 px-1">FG</th>
                              <th className="font-normal pb-1 px-1">3P</th>
                              <th className="font-normal pb-1 px-1">FT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.values(liveStats[tm])
                              .sort((a: any, b: any) => (b?.pts || 0) - (a?.pts || 0))
                              .map((p: any, idx: number) => {
                                if (!p) return null;
                                const displayMin = fmtMin(p.sec || 0);
                                const reb = (p.orb || 0) + (p.drb || 0);
                                const currentLineup = tm === 'AWAY' ? (plays[currentIndex]?.lineupAWAY || []) : (plays[currentIndex]?.lineupHOME || []);
                                const isOnFloor = currentLineup.some((lp: any) => String(lp.id) === String(p.id));
                                return (
                                  <tr key={p.id || `player-${tm}-${idx}`} className={`border-b border-gray-800/30 transition-colors ${isOnFloor ? 'bg-emerald-500/20 hover:bg-emerald-500/25' : 'hover:bg-white/5'}`}>
                                    <td className="text-left py-1 pr-2 text-gray-200 font-medium">
                                      <div className="flex items-center gap-1.5">
                                        {isOnFloor && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
                                        <span className="truncate max-w-[70px] sm:max-w-none">{p.n}</span>
                                      </div>
                                    </td>
                                    <td className="py-1 px-1 text-gray-400 font-mono">{displayMin}</td>
                                    <td className="py-1 px-1 text-white font-bold">{p.pts}</td>
                                    <td className="py-1 px-1">{reb}</td>
                                    <td className="py-1 px-1">{p.ast}</td>
                                    <td className="py-1 px-1">{p.stl}</td>
                                    <td className="py-1 px-1">{p.blk}</td>
                                    <td className="py-1 px-1 text-red-400">{p.tov}</td>
                                    <td className={`py-1 px-1 ${p.pf >= 5 ? 'text-red-500 font-bold' : p.pf >= 4 ? 'text-orange-400' : ''}`}>{p.pf}</td>
                                    <td className={`py-1 px-1 font-mono ${p.pm > 0 ? 'text-green-400' : p.pm < 0 ? 'text-red-400' : 'text-gray-400'}`}>{p.pm > 0 ? `+${p.pm}` : p.pm}</td>
                                    <td className="py-1 px-1">{p.fgm}-{p.fga}</td>
                                    <td className="py-1 px-1">{p.tp}-{p.tpa}</td>
                                    <td className="py-1 px-1">{p.ftm}-{p.fta}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-600 text-gray-300">
                              <td className="text-left py-1 pr-2 font-bold">TOTALS</td>
                              <td className="py-1 px-1 text-gray-500">—</td>
                              <td className="py-1 px-1 font-bold text-white">{teamStats[tm].pts}</td>
                              <td className="py-1 px-1">{teamStats[tm].reb}</td>
                              <td className="py-1 px-1">{teamStats[tm].ast}</td>
                              <td className="py-1 px-1">{teamStats[tm].stl}</td>
                              <td className="py-1 px-1">{teamStats[tm].blk}</td>
                              <td className="py-1 px-1 text-red-400">{teamStats[tm].tov}</td>
                              <td className="py-1 px-1">{teamStats[tm].pf}</td>
                              <td className="py-1 px-1 text-gray-500">—</td>
                              <td className="py-1 px-1">{teamStats[tm].fgm}-{teamStats[tm].fga}</td>
                              <td className="py-1 px-1">{teamStats[tm].tp}-{teamStats[tm].tpa}</td>
                              <td className="py-1 px-1">{teamStats[tm].ftm}-{teamStats[tm].fta}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TEAM COMPARISON */}
              {activeTab === 'comparison' && (() => {
                const getAdvancedStats = (tm: 'HOME' | 'AWAY') => {
                  const opp = tm === 'HOME' ? 'AWAY' : 'HOME';
                  const ts = teamStats[tm];
                  const oppTs = teamStats[opp];
                  const eFG = ts.fga > 0 ? ((ts.fgm + 0.5 * ts.tp) / ts.fga) * 100 : 0;
                  const tovPct = (ts.fga + 0.44 * ts.fta + ts.tov) > 0 ? (ts.tov / (ts.fga + 0.44 * ts.fta + ts.tov)) * 100 : 0;
                  const orbPct = (ts.orb + oppTs.drb) > 0 ? (ts.orb / (ts.orb + oppTs.drb)) * 100 : 0;
                  const ftFga = ts.fga > 0 ? ts.fta / ts.fga : 0;
                  return { eFG, tovPct, orbPct, ftFga };
                };

                const awayAdv = getAdvancedStats('AWAY');
                const homeAdv = getAdvancedStats('HOME');

                return (
                  <div className="w-full flex flex-col gap-3">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-xs text-center min-w-[280px]">
                        <thead className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-widest border-b border-gray-800">
                          <tr>
                            <th className="py-2 text-left font-normal">Team</th>
                            <th className="py-2 font-normal">eFG%</th>
                            <th className="py-2 font-normal">TOV%</th>
                            <th className="py-2 font-normal">ORB%</th>
                            <th className="py-2 font-normal">FTA/FGA</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                          <tr>
                            <td className="py-2 text-left font-bold text-white text-[10px]">{awayTeam.abbreviation}</td>
                            <td className="py-2 font-mono text-gray-300 text-[10px]">{awayAdv.eFG.toFixed(1)}</td>
                            <td className="py-2 font-mono text-gray-300 text-[10px]">{awayAdv.tovPct.toFixed(1)}</td>
                            <td className="py-2 font-mono text-gray-300 text-[10px]">{awayAdv.orbPct.toFixed(1)}</td>
                            <td className="py-2 font-mono text-gray-300 text-[10px]">{awayAdv.ftFga.toFixed(3)}</td>
                          </tr>
                          <tr>
                            <td className="py-2 text-left font-bold text-blue-400 text-[10px]">{homeTeam.abbreviation}</td>
                            <td className="py-2 font-mono text-gray-300 text-[10px]">{homeAdv.eFG.toFixed(1)}</td>
                            <td className="py-2 font-mono text-gray-300 text-[10px]">{homeAdv.tovPct.toFixed(1)}</td>
                            <td className="py-2 font-mono text-gray-300 text-[10px]">{homeAdv.orbPct.toFixed(1)}</td>
                            <td className="py-2 font-mono text-gray-300 text-[10px]">{homeAdv.ftFga.toFixed(3)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex justify-between text-[9px] sm:text-xs font-bold tracking-widest text-gray-500 mb-1">
                        <span className="text-white">{awayTeam.abbreviation}</span>
                        <span>TEAM STATS</span>
                        <span className="text-blue-400">{homeTeam.abbreviation}</span>
                      </div>
                      {[
                        { label:'FIELD GOALS',
                          c:`${teamStats.AWAY.fgm}-${teamStats.AWAY.fga} (${teamStats.AWAY.fga > 0 ? ((teamStats.AWAY.fgm/teamStats.AWAY.fga)*100).toFixed(1) : '0.0'}%)`,
                          d:`${teamStats.HOME.fgm}-${teamStats.HOME.fga} (${teamStats.HOME.fga > 0 ? ((teamStats.HOME.fgm/teamStats.HOME.fga)*100).toFixed(1) : '0.0'}%)`
                        },
                        { label:'3PT FG',
                          c:`${teamStats.AWAY.tp}-${teamStats.AWAY.tpa} (${teamStats.AWAY.tpa > 0 ? ((teamStats.AWAY.tp/teamStats.AWAY.tpa)*100).toFixed(1) : '0.0'}%)`,
                          d:`${teamStats.HOME.tp}-${teamStats.HOME.tpa} (${teamStats.HOME.tpa > 0 ? ((teamStats.HOME.tp/teamStats.HOME.tpa)*100).toFixed(1) : '0.0'}%)`
                        },
                        { label:'FREE THROWS',
                          c:`${teamStats.AWAY.ftm}-${teamStats.AWAY.fta} (${teamStats.AWAY.fta > 0 ? ((teamStats.AWAY.ftm/teamStats.AWAY.fta)*100).toFixed(1) : '0.0'}%)`,
                          d:`${teamStats.HOME.ftm}-${teamStats.HOME.fta} (${teamStats.HOME.fta > 0 ? ((teamStats.HOME.ftm/teamStats.HOME.fta)*100).toFixed(1) : '0.0'}%)`
                        },
                        { label:'REBOUNDS',  c: teamStats.AWAY.reb, d: teamStats.HOME.reb },
                        { label:'ASSISTS',   c: teamStats.AWAY.ast, d: teamStats.HOME.ast },
                        { label:'STEALS',    c: teamStats.AWAY.stl, d: teamStats.HOME.stl },
                        { label:'BLOCKS',    c: teamStats.AWAY.blk, d: teamStats.HOME.blk },
                        { label:'TURNOVERS', c: teamStats.AWAY.tov, d: teamStats.HOME.tov },
                        { label:'FOULS',     c: teamStats.AWAY.pf,  d: teamStats.HOME.pf  },
                      ].map(stat => (
                        <div key={stat.label} className="flex justify-between items-center py-1.5 border-b border-gray-800/50">
                          <div className="w-1/3 text-left font-mono text-[10px] sm:text-xs text-gray-300">{stat.c}</div>
                          <div className="w-1/3 text-center text-[8px] sm:text-[10px] text-gray-500 uppercase tracking-widest">{stat.label}</div>
                          <div className="w-1/3 text-right font-mono text-[10px] sm:text-xs text-gray-300">{stat.d}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* QUARTERLY */}
              {activeTab === 'quarterly' && (
                <div className="w-full overflow-x-auto custom-scrollbar">
                  <table className="w-full text-center min-w-[300px]">
                    <thead>
                      <tr className="text-gray-500 text-[9px] tracking-[0.15em] border-b border-gray-800">
                        <th className="text-left pb-2 font-normal">TEAM</th>
                        {['1ST','2ND','3RD','4TH'].map(label => (
                          <th key={label} className="pb-2 font-normal">{label}</th>
                        ))}
                        {qScores.away.length > 4 && qScores.away.slice(4).map((_, i) => (
                          <th key={`ot-header-${i}`} className="pb-2 font-normal">OT{i + 1}</th>
                        ))}
                        <th className="pb-2 font-normal">FINAL</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-sm sm:text-base">
                      {[
                        { label: awayTeam.abbreviation, logo: awayLogo, qs: qScores.away, final: awayScore, color: 'text-gray-300', finalColor: 'text-white' },
                        { label: homeTeam.abbreviation, logo: homeLogo, qs: qScores.home, final: homeScore, color: 'text-yellow-600', finalColor: 'text-yellow-500' },
                      ].map(row => (
                        <tr key={row.label} className="border-b border-gray-800/30">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <img src={row.logo} className="h-5 w-5 sm:h-6 sm:w-6 object-contain" alt={row.label} />
                              <span className="text-gray-500 text-[9px] tracking-[0.2em] font-sans">{row.label}</span>
                            </div>
                          </td>
                          {row.qs.map((q, i) => <td key={`q-score-${row.label}-${i}`} className={`py-2 ${row.color}`}>{q}</td>)}
                          <td className={`py-2 font-bold ${row.finalColor}`}>{row.final}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── speed control ── */}
        <div className="mt-3 flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] text-gray-400 font-bold tracking-[0.15em]">
          <div className="flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded border border-gray-800 w-full sm:w-auto justify-center sm:justify-start">
            Simulation Speed
          </div>
          <div className="flex items-center gap-3 bg-black/50 px-4 py-1.5 rounded border border-gray-800 w-full sm:min-w-[300px]">
            <span className="text-[9px] text-gray-500 shrink-0">SLOW</span>
            <input
              type="range"
              min="10"
              max="2000"
              step="10"
              value={2010 - speed}
              onChange={(e) => setSpeed(2010 - parseInt(e.target.value))}
              className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
            />
            <span className="text-[9px] text-gray-500 shrink-0">FAST</span>
            <div className="w-10 text-right text-gray-300 font-mono shrink-0">
              {Math.round((2010 - speed) / 20)}%
            </div>
          </div>
        </div>
      </div>
    </motion.div>

    {/* Leave confirmation — shown when there are other games today */}
    {showLeaveConfirm && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowLeaveConfirm(false)} />
        <div className="relative bg-[#111] border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
          <div className="text-4xl mb-4">🏀</div>
          <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">Another Event Today</h3>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            There {otherGamesToday === 1 ? 'is' : 'are'} <span className="text-white font-bold">{otherGamesToday}</span> more event{otherGamesToday !== 1 ? 's' : ''} happening today. Are you sure you want to leave?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowLeaveConfirm(false)}
              className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-sm transition-all"
            >
              Stay
            </button>
            <button
              onClick={() => { setShowLeaveConfirm(false); doLeaveGame(); }}
              className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition-all"
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};