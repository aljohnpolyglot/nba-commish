import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, SkipForward, RotateCcw, Trophy, Users, Zap, Star, Layout, List } from 'lucide-react';
import { CONTESTANTS } from '../data/dunkData';
import { useDunkContest } from '../hooks/useDunkContest';
import { Scoreboard } from './Scoreboard';
import { PlayFeed } from './PlayFeed';
import { JudgeRevealModal } from './JudgeRevealModal';

/**
 * Main Dunk Contest Component.
 * Handles contestant selection and the live simulation view.
 */
export const DunkContest: React.FC = () => {
  const [view, setView] = useState<'setup' | 'live'>('setup');
  const [activeTab, setActiveTab] = useState<'live' | 'results'>('live');
  const [selectedContestants, setSelectedContestants] = useState(CONTESTANTS.slice(0, 4));

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
    skipToEnd,
    setSpeed,
    reset,
    closeJudgeModal
  } = useDunkContest(selectedContestants);

  const handleStart = () => {
    reset();
    setView('live');
  };

  const handleTabChange = (tab: 'live' | 'results') => {
    if (tab === 'results' && isPlaying) {
      pause();
    }
    setActiveTab(tab);
  };

  const handleContestantToggle = (player: typeof CONTESTANTS[0]) => {
    if (selectedContestants.find(p => p.nbaId === player.nbaId)) {
      if (selectedContestants.length > 2) {
        setSelectedContestants(selectedContestants.filter(p => p.nbaId !== player.nbaId));
      }
    } else {
      if (selectedContestants.length < 4) {
        setSelectedContestants([...selectedContestants, player]);
      }
    }
  };

  if (view === 'setup') {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center space-x-2 bg-orange-500/10 border border-orange-500/20 px-4 py-1 rounded-full mb-4">
            <Trophy className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-bold tracking-widest uppercase text-orange-500">All-Star Weekend</span>
          </div>
          <h1 className="text-6xl font-black tracking-tighter mb-2 italic">SLAM DUNK CONTEST</h1>
          <p className="text-zinc-500 max-w-md mx-auto">Select 4 elite high-flyers to compete for the most prestigious trophy in basketball.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl mb-12">
          {CONTESTANTS.map((p) => {
            const isSelected = selectedContestants.find(s => s.nbaId === p.nbaId);
            const hasWon = p.awards.some(a => a.type === "Slam Dunk Contest Winner");

            return (
              <motion.button
                key={p.nbaId}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleContestantToggle(p)}
                className={`relative p-4 rounded-2xl border-2 transition-all text-left group ${
                  isSelected 
                    ? 'bg-zinc-800 border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.2)]' 
                    : 'bg-zinc-900 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-black/40">
                    <img 
                      src={p.imgURL} 
                      alt={p.name} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                        <Zap className="w-6 h-6 text-orange-500 fill-orange-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black italic uppercase tracking-tight">{p.name}</p>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                      {p.pos} • {p.age} YRS
                    </p>
                    {hasWon && (
                      <div className="mt-1 flex items-center space-x-1">
                        <Trophy className="w-3 h-3 text-yellow-500" />
                        <span className="text-[9px] text-yellow-500 font-black uppercase">PAST WINNER</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleStart}
          disabled={selectedContestants.length < 2}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-black text-xl px-12 py-4 rounded-full shadow-2xl flex items-center space-x-3 transition-colors"
        >
          <span>START SIMULATION</span>
          <SkipForward className="w-6 h-6" />
        </motion.button>
      </div>
    );
  }

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
              <button 
                onClick={() => {
                  setView('setup');
                  setActiveTab('live');
                }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <RotateCcw className="w-6 h-6 text-zinc-500" />
              </button>
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
                className="w-12 h-12 flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-black rounded-full transition-all transform active:scale-95"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
              </button>
              <button 
                onClick={skipToEnd}
                className="w-12 h-12 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white rounded-full transition-all"
              >
                <SkipForward className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
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
              {/* Left Column: Scoreboard & Visuals */}
              <div className="lg:col-span-8 flex flex-col space-y-6 min-h-0">
                <div style={{ flexShrink: 0 }}>
                  <Scoreboard 
                    contestants={selectedContestants} 
                    liveScores={liveScores}
                    currentPlay={currentPlay}
                    winnerId={isFinished ? simResult?.winnerId : undefined}
                    simResult={simResult}
                  />
                </div>
                
                <div className="flex-1 relative bg-zinc-900/40 rounded-3xl border border-white/5 overflow-hidden flex items-center justify-center">
                  {/* Background Ambient Glow */}
                  <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent" />
                  
                  {/* Active Player Focus */}
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
                            src={selectedContestants.find(c => c.name === currentPlay.activePlayer)?.imgURL} 
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

                  {/* Overlay for Loading */}
                  {!badgesLoaded && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-xl">
                      <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
                      <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Scouting Dunkers...</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Play Feed */}
              <div className="lg:col-span-4 flex flex-col min-h-0">
                <div className="flex items-center space-x-2 mb-3 px-2 shrink-0">
                  <Zap className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Broadcast Feed</span>
                </div>
                <PlayFeed plays={plays} currentIndex={currentIndex} contestants={selectedContestants} />
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
                {/* Wikipedia Style Table */}
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
                        {simResult?.round1.sort((a, b) => b.totalScore - a.totalScore).map((r1, idx) => {
                          const finalsRow = simResult.round2.find(f => f.playerName === r1.playerName);
                          const isWinner = simResult.winnerName === r1.playerName;
                          const isFinalist = !!finalsRow;

                          // Fix 3a: No spoilers in results tab
                          const getRevealedData = (playerId: string, round: 'round1' | 'finals') => {
                            const scoreRevealPlays = plays
                              .slice(0, currentIndex + 1)
                              .filter(p => 
                                p.type === 'score_reveal' && 
                                p.playerId === playerId && 
                                p.round === round
                              );
                            return scoreRevealPlays.length; // how many dunks revealed so far
                          };

                          const dunksRevealedR1 = getRevealedData(r1.playerName, 'round1');
                          const d1Score = dunksRevealedR1 >= 1 ? r1.dunks[0]?.score : null;
                          const d2Score = dunksRevealedR1 >= 2 ? r1.dunks[1]?.score : null;
                          const r1Total = dunksRevealedR1 >= 2 ? r1.totalScore : null;

                          const dunksRevealedFin = getRevealedData(r1.playerName, 'finals');
                          const finD1 = finalsRow && dunksRevealedFin >= 1 ? finalsRow.dunks[0]?.score : null;
                          const finD2 = finalsRow && dunksRevealedFin >= 2 ? finalsRow.dunks[1]?.score : null;
                          const finTotal = finalsRow && dunksRevealedFin >= 2 ? finalsRow.totalScore : null;

                          // De-emphasize rows if not revealed yet
                          const hasDunked = dunksRevealedR1 > 0;
                          const opacity = hasDunked ? 'opacity-100' : 'opacity-40';

                          return (
                            <tr key={r1.playerName} className={`hover:bg-white/5 transition-colors ${opacity}`}>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <img 
                                    src={selectedContestants.find(c => c.name === r1.playerName)?.imgURL} 
                                    className="w-8 h-8 rounded bg-zinc-800 object-cover"
                                    alt=""
                                  />
                                  <span className="font-bold text-white">{r1.playerName}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center font-mono text-zinc-400">{d1Score ?? '—'}</td>
                              <td className="px-6 py-4 text-center font-mono text-zinc-400">{d2Score ?? '—'}</td>
                              <td className="px-6 py-4 text-center font-black text-white bg-zinc-800/20">{r1Total ?? '—'}</td>
                              
                              {/* Fix 3b: Finals column should be dunk-by-dunk */}
                              <td className="px-6 py-4 text-center font-mono text-zinc-400">
                                {!finalsRow ? '—' : (finD1 ?? '...')}
                              </td>
                              <td className="px-6 py-4 text-center font-mono text-zinc-400">
                                {!finalsRow ? '—' : (finD2 ?? '...')}
                              </td>
                              <td className="px-6 py-4 text-center font-black text-orange-400">
                                {!finalsRow ? '—' : (finTotal ?? '...')}
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

                {/* MVP Dunk Callout */}
                {simResult?.mvpDunk && isFinished && (
                  <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/30 rounded-2xl p-8 flex items-center gap-8 shadow-xl">
                    <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/30 shrink-0">
                      <Zap size={40} className="text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-purple-400 text-xs font-black uppercase tracking-[0.3em] mb-2">Dunk of the Night</h4>
                      <h3 className="text-3xl font-black italic tracking-tighter text-white uppercase mb-2">{simResult.mvpDunk}</h3>
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
          <JudgeRevealModal 
            data={judgeModal} 
            judges={simResult?.judges || []}
            onClose={closeJudgeModal} 
          />
        )}
      </AnimatePresence>

      {/* Winner Overlay */}
      <AnimatePresence>
        {isFinished && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
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
                  <p className="text-3xl font-black">{liveScores[simResult?.winnerId || '']}</p>
                </div>
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Status</p>
                  <p className="text-3xl font-black text-emerald-500 italic">CHAMP</p>
                </div>
              </div>

              <button 
                onClick={reset}
                className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center space-x-2"
              >
                <RotateCcw className="w-5 h-5" />
                <span>RUN ANOTHER SIM</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
