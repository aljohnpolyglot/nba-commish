import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, X, Trophy, Zap, Star, List } from 'lucide-react';
import { NBAPlayer } from '../../../../services/allStar/AllStarDunkContestSim';
import { useDunkContest } from './useDunkContest';
import { DunkContestScoreboard } from './Scoreboard';
import { DunkContestPlayFeed } from './PlayFeed';
import { DunkContestJudgeReveal } from './JudgeReveal';
import { AnimatePresence as AP } from 'motion/react';
import { DUNK_MOVES } from '../../../../services/allStar/dunkMoves';

interface DunkContestProps {
  contestants: NBAPlayer[];
  onClose?: () => void;
  onComplete?: (result: any) => void;
}

/**
 * Main Dunk Contest Component.
 * Accepts real game contestants passed from AllStarView.
 */
export const DunkContest: React.FC<DunkContestProps> = ({ contestants, onClose, onComplete }) => {
  const [activeTab, setActiveTab] = useState<'live' | 'results'>('live');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showWinnerOverlay, setShowWinnerOverlay] = useState(true);

  const {
    badgesLoaded,
    plays,
    simResult,
    currentIndex,
    isPlaying,
    isFinished,
    speed,
    currentPlay,
    liveScores,
    judgeModal,
    togglePlay,
    pause,
    setSpeed,
    closeJudgeModal
  } = useDunkContest(contestants);

  useEffect(() => {
    if (isFinished && simResult && onComplete) {
      onComplete(simResult);
    }
  }, [isFinished]);

  // Reset overlay visibility when a new contest starts
  useEffect(() => {
    setShowWinnerOverlay(true);
  }, [isFinished]);

  const handleExitClick = () => {
    if (isFinished) {
      // Already done — just close
      onClose?.();
    } else {
      setShowExitConfirm(true);
    }
  };

  const handleConfirmExit = () => {
    // Save result if available and not already saved
    if (simResult && onComplete) {
      onComplete(simResult);
    }
    setShowExitConfirm(false);
    onClose?.();
  };

  const handleTabChange = (tab: 'live' | 'results') => {
    if (tab === 'results' && isPlaying) {
      pause();
    }
    setActiveTab(tab);
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: '#000',
      color: '#fff',
    }}>
      {/* Header */}
      <div style={{ flexShrink: 0 }} className="p-4 md:px-8 md:py-4 border-b border-white/5 bg-zinc-900/20">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-4">
              {onClose && (
                <button
                  onClick={handleExitClick}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Exit contest"
                >
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              )}
              <div>
                <h2 className="text-2xl font-black italic tracking-tighter uppercase">Dunk Contest</h2>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">All-Star Saturday Night</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-zinc-900/80 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => handleTabChange('live')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'live'
                    ? 'bg-zinc-800 text-white shadow-lg'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Zap size={14} className={activeTab === 'live' ? 'text-orange-500' : ''} />
                LIVE
              </button>
              <button
                onClick={() => handleTabChange('results')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'results'
                    ? 'bg-zinc-800 text-white shadow-lg'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <List size={14} className={activeTab === 'results' ? 'text-emerald-500' : ''} />
                RESULTS
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-6 bg-zinc-900/50 p-2 rounded-full border border-white/5">
            <div className="flex items-center space-x-2 px-4">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Speed</span>
              <input
                type="range"
                min="1"
                max="100"
                value={speed}
                onChange={(e) => setSpeed(parseInt(e.target.value))}
                className="w-24 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={togglePlay}
                disabled={isFinished}
                className="w-12 h-12 flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-black rounded-full transition-all transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 p-4 md:p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'live' ? (
            <motion.div
              key="live-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* Left: Scoreboard & Active Player */}
              <div className="lg:col-span-8 flex flex-col space-y-6 min-h-0">
                <div style={{ flexShrink: 0 }}>
                  <DunkContestScoreboard
                    contestants={contestants}
                    liveScores={liveScores}
                    currentPlay={currentPlay}
                    winnerId={isFinished ? simResult?.winnerId : undefined}
                    simResult={simResult}
                  />
                </div>

                <div className="flex-1 relative bg-zinc-900/40 rounded-3xl border border-white/5 overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent" />

                  <AnimatePresence mode="wait">
                    {currentPlay?.activePlayer ? (
                      <motion.div
                        key={currentPlay.activePlayer}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        className="relative z-10 flex flex-col items-center"
                      >
                        <div className="relative">
                          <div className="absolute -inset-4 bg-orange-500/20 blur-3xl rounded-full" />
                          <img
                            src={contestants.find(c => c.name === currentPlay.activePlayer)?.imgURL}
                            alt={currentPlay.activePlayer}
                            className="w-48 h-48 md:w-64 md:h-64 object-cover rounded-full border-4 border-white/10 shadow-2xl relative z-10"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <h3 className="mt-6 text-3xl md:text-4xl font-black italic tracking-tighter text-white uppercase">
                          {currentPlay.activePlayer}
                        </h3>
                        <div className="mt-2 px-4 py-1 bg-orange-500 text-black text-[10px] font-black rounded-full uppercase tracking-widest">
                          Currently Dunking
                        </div>
                      </motion.div>
                    ) : (
                      <div className="text-zinc-700 flex flex-col items-center gap-4">
                        <Trophy size={64} className="opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-[0.3em]">Waiting for Action</p>
                      </div>
                    )}
                  </AnimatePresence>

                  {!badgesLoaded && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-xl">
                      <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
                      <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Scouting Dunkers...</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Play Feed */}
              <div className="lg:col-span-4 flex flex-col min-h-0">
                <div className="flex items-center space-x-2 mb-3 px-2 shrink-0">
                  <Zap className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Broadcast Feed</span>
                </div>
                <DunkContestPlayFeed plays={plays} currentIndex={currentIndex} contestants={contestants} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full overflow-y-auto custom-scrollbar pb-12"
            >
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="bg-zinc-800/50 p-4 border-b border-zinc-700 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Contest Summary</h3>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500">
                      <Star size={12} className="text-yellow-500" />
                      {isFinished ? 'OFFICIAL RESULTS' : 'LIVE STANDINGS'}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-black/20 text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800">
                          <th className="px-6 py-4">Player</th>
                          <th className="px-6 py-4 text-center">Dunk 1</th>
                          <th className="px-6 py-4 text-center">Dunk 2</th>
                          <th className="px-6 py-4 text-center bg-zinc-800/30">Total</th>
                          <th className="px-6 py-4 text-center">F1</th>
                          <th className="px-6 py-4 text-center">F2</th>
                          <th className="px-6 py-4 text-center bg-zinc-800/30">F Total</th>
                          <th className="px-6 py-4 text-center">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {simResult?.round1.sort((a: any, b: any) => b.totalScore - a.totalScore).map((r1: any) => {
                          const finalsRow = simResult.round2?.find((f: any) => f.playerName === r1.playerName);
                          const isWinner = simResult.winnerName === r1.playerName;
                          const isFinalist = !!finalsRow;

                          const d1Score = r1.dunks?.[0]?.score ?? null;
                          const d2Score = r1.dunks?.[1]?.score ?? null;
                          const finD1 = finalsRow?.dunks?.[0]?.score ?? null;
                          const finD2 = finalsRow?.dunks?.[1]?.score ?? null;

                          return (
                            <tr key={r1.playerName} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={contestants.find(c => c.name === r1.playerName)?.imgURL}
                                    className="w-8 h-8 rounded bg-zinc-800 object-cover"
                                    alt=""
                                  />
                                  <span className="font-bold text-white">{r1.playerName}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center font-mono text-zinc-400">{d1Score ?? '—'}</td>
                              <td className="px-6 py-4 text-center font-mono text-zinc-400">{d2Score ?? '—'}</td>
                              <td className="px-6 py-4 text-center font-black text-white bg-zinc-800/20">{r1.totalScore ?? '—'}</td>
                              <td className="px-6 py-4 text-center font-mono text-zinc-400">
                                {!finalsRow ? '—' : (finD1 ?? '...')}
                              </td>
                              <td className="px-6 py-4 text-center font-mono text-zinc-400">
                                {!finalsRow ? '—' : (finD2 ?? '...')}
                              </td>
                              <td className="px-6 py-4 text-center font-black text-orange-400">
                                {!finalsRow ? '—' : (finalsRow.totalScore ?? '...')}
                              </td>
                              <td className="px-6 py-4 text-center">
                                {isWinner && isFinished ? (
                                  <span className="inline-flex items-center gap-1 bg-yellow-500 text-black text-[9px] font-black px-2 py-1 rounded uppercase">
                                    <Trophy size={10} /> CHAMPION
                                  </span>
                                ) : isFinalist ? (
                                  <span className="text-[9px] font-bold text-zinc-500 uppercase">Finalist</span>
                                ) : (
                                  <span className="text-[9px] font-bold text-zinc-700 uppercase">
                                    {isFinished ? 'Eliminated' : 'Competing'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {simResult?.mvpDunk && isFinished && (
                  <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/30 rounded-2xl p-8 flex items-center gap-8 shadow-xl">
                    <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/30 shrink-0">
                      <Zap size={40} className="text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-purple-400 text-xs font-black uppercase tracking-[0.3em] mb-2">Dunk of the Night</h4>
                      <h3 className="text-3xl font-black italic tracking-tighter text-white uppercase mb-2">
                        {DUNK_MOVES.find(m => m.id === simResult.mvpDunk)?.displayName ?? simResult.mvpDunk}
                      </h3>
                      <p className="text-zinc-400 text-sm max-w-md">This high-flying maneuver earned the highest single-dunk score of the entire competition.</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Judge Reveal Modal */}
      <AnimatePresence>
        {judgeModal && (
          <DunkContestJudgeReveal
            data={judgeModal}
            judges={simResult?.judges || []}
            onClose={closeJudgeModal}
          />
        )}
      </AnimatePresence>

      {/* Winner Overlay */}
      <AnimatePresence>
        {isFinished && showWinnerOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
          >
            <div className="bg-zinc-900 border border-orange-500/30 p-12 rounded-3xl shadow-[0_0_100px_rgba(249,115,22,0.2)] text-center max-w-lg w-full">
              <div className="w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
                <Trophy className="w-12 h-12 text-black" />
              </div>
              <h3 className="text-sm font-black text-orange-500 uppercase tracking-[0.3em] mb-2">Contest Winner</h3>
              <h2 className="text-5xl font-black italic tracking-tighter mb-8">{simResult?.winnerName}</h2>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Total Score</p>
                  <p className="text-3xl font-black">{liveScores[simResult?.winnerName || '']}</p>
                </div>
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Status</p>
                  <p className="text-3xl font-black text-emerald-500 italic">CHAMP</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowWinnerOverlay(false); setActiveTab('results'); }}
                  className="flex-1 bg-orange-500 hover:bg-orange-400 text-black font-black py-4 rounded-xl transition-colors"
                >
                  VIEW RESULTS
                </button>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="flex-1 bg-zinc-800 text-white font-black py-4 rounded-xl hover:bg-zinc-700 transition-colors"
                  >
                    CLOSE
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit Confirmation Modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-white/10 p-10 rounded-3xl max-w-md w-full text-center shadow-2xl"
            >
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <X className="w-8 h-8 text-zinc-400" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-3">Exit Contest?</h3>
              <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                You'll miss the rest of the show! The result will be auto-simulated and saved if you leave now.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-colors"
                >
                  Stay
                </button>
                <button
                  onClick={handleConfirmExit}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-colors"
                >
                  Exit & Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
