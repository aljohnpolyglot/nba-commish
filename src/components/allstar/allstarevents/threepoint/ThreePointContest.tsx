import React, { useState, useEffect } from 'react';
import { Play, SkipForward, Activity, X } from 'lucide-react';
import { ThreePointContestant } from '../../../../services/allStar/ThreePointContestant';
import { useThreePointContest } from './useThreePointContest';
import { CourtRackDisplay } from './Rack';
import { Scoreboard3PT } from './Scoreboard';
import { ShotFeed } from './ShotFeed';
import { ResultsTable3PT } from './ResultsTable';
import { FinalsScoreboard } from './FinalsScoreboard';
import { PlayerIntroSequence } from './PlayerIntro';
import { motion, AnimatePresence } from 'motion/react';

interface ThreePointContestProps {
  contestants: ThreePointContestant[];
  onClose?: () => void;
  onComplete?: (result: any) => void;
}

export function ThreePointContest({ contestants, onClose, onComplete }: ThreePointContestProps) {
  const [view, setView] = useState<'setup' | 'intros' | 'live' | 'results'>('setup');
  const [showShotChart, setShowShotChart] = useState(false);
  const [highScoreFlash, setHighScoreFlash] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<'scoreboard' | 'commentary'>('scoreboard');
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const {
    loadingPhase,
    zoneData,
    moneyrackAssignments,
    plays,
    simResult,
    currentIndex,
    isPlaying,
    isFinished,
    speed,
    ballState,
    togglePlay,
    skipToEnd,
    setSpeed,
  } = useThreePointContest(contestants);

  const handleIntrosComplete = React.useCallback(() => {
    setView('live');
    togglePlay();
  }, [togglePlay]);

  const handleExitClick = () => {
    if (isFinished) {
      onClose?.();
    } else {
      setShowExitConfirm(true);
    }
  };

  const handleConfirmExit = () => {
    if (simResult && onComplete) {
      onComplete(simResult);
    }
    setShowExitConfirm(false);
    onClose?.();
  };

  useEffect(() => {
    const play = plays[currentIndex];
    if (play?.type === 'rack_complete' && play.total >= 25) {
      setHighScoreFlash(play.total);
      setTimeout(() => setHighScoreFlash(null), 2000);
    }
  }, [currentIndex, plays]);

  useEffect(() => {
    if (loadingPhase === 'ready' && view === 'setup') {
      setView('intros');
    }
  }, [loadingPhase, view]);

  useEffect(() => {
    if (isFinished && simResult && onComplete) {
      onComplete(simResult);
    }
  }, [isFinished]);

  if (view === 'intros') {
    return (
      <PlayerIntroSequence
        contestants={contestants}
        zoneData={zoneData}
        moneyrackAssignments={moneyrackAssignments}
        onComplete={handleIntrosComplete}
        onSkip={handleIntrosComplete}
      />
    );
  }

  if (view === 'setup') {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-8">
            3-Point Contest
          </h1>
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-400 font-bold tracking-widest uppercase">
            {loadingPhase === 'zones' ? 'Fetching shooting zones...' : 'Preparing contest...'}
          </p>
        </div>
      </div>
    );
  }

  const currentPlay = plays[currentIndex];
  const activePlayerId = currentPlay?.playerId || '';
  const activeRound = currentPlay?.round || 'round1';
  const activeStation = currentPlay?.si ?? -1;
  const activeBall = currentPlay?.bi ?? -1;

  const activeContestant = contestants.find(c => c.id === activePlayerId);
  const activeChart = activeContestant ? zoneData.get(activeContestant.id) : undefined;

  let runningTotal = 0;
  for (let i = 0; i <= currentIndex; i++) {
    if (plays[i].playerId === activePlayerId && plays[i].scoreUpdate) {
      runningTotal = plays[i].scoreUpdate!.newTotal;
    }
  }

  let phase: 'round1' | 'finals' | 'done' = 'round1';
  let winnerId: string | null = null;
  let hasFinalsStarted = false;
  const r1Scores: Record<string, number> = {};
  const finalsScores: Record<string, number> = {};

  for (let i = 0; i <= currentIndex; i++) {
    const play = plays[i];
    if (!play) continue;
    if (play.type === 'finals_start') hasFinalsStarted = true;
    if (play.type === 'winner') winnerId = play.playerId;
    if (play.type === 'ball_shot' && play.scoreUpdate) {
      if (play.round === 'round1') r1Scores[play.playerId] = play.scoreUpdate.newTotal;
      if (play.round === 'finals') finalsScores[play.playerId] = play.scoreUpdate.newTotal;
    }
  }

  if (winnerId) phase = 'done';
  else if (hasFinalsStarted) phase = 'finals';

  const finalist1 = simResult?.finals[0] ? contestants.find(c => c.id === simResult.finals[0].playerId) : undefined;
  const finalist2 = simResult?.finals[1] ? contestants.find(c => c.id === simResult.finals[1].playerId) : undefined;

  return (
    <div className="max-w-7xl mx-auto p-2 sm:p-4 lg:p-8 min-h-screen lg:h-screen flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-6 gap-4 shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tighter">3-Point Contest</h1>
          <div className="px-3 py-1 bg-slate-800 rounded-full text-[10px] sm:text-xs font-bold text-slate-300 uppercase tracking-widest">
            {activeRound === 'round1' ? 'Round 1' : 'Finals'}
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4 bg-slate-900 p-1.5 sm:p-2 rounded-full border border-slate-800 w-full sm:w-auto justify-center">
          <div className="flex items-center space-x-2 px-2 sm:px-4 border-r border-slate-800">
            <span className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase hidden sm:inline">Speed</span>
            <input
              type="range" min="0" max="100" value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-16 sm:w-24 accent-amber-500"
            />
          </div>

          <button onClick={togglePlay} disabled={isFinished} className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-full text-white transition-colors disabled:opacity-50">
            <Play className={`w-4 h-4 sm:w-5 sm:h-5 ${isPlaying ? 'hidden' : 'block'}`} />
            <div className={`w-4 h-4 sm:w-5 sm:h-5 flex justify-center items-center space-x-1 ${isPlaying ? 'flex' : 'hidden'}`}>
              <div className="w-1 h-3 sm:w-1.5 sm:h-4 bg-white rounded-sm" />
              <div className="w-1 h-3 sm:w-1.5 sm:h-4 bg-white rounded-sm" />
            </div>
          </button>

          <button onClick={skipToEnd} disabled={isFinished} className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-full text-white transition-colors disabled:opacity-50">
            <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {onClose && (
            <button onClick={handleExitClick} className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors ml-1 border-l border-slate-800 pl-3">
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>

      {view === 'results' ? (
        <div className="flex-1 overflow-y-auto pb-8">
          <ResultsTable3PT contestants={contestants} result={simResult} />
          {onClose && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={onClose}
                className="bg-amber-500 hover:bg-amber-400 text-black px-8 py-3 rounded-full font-bold uppercase tracking-widest transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 min-h-0">
          {/* Left Column */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4 sm:gap-6 min-h-0">
            {activeContestant ? (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 sm:p-4 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <div className="relative">
                    <img src={activeContestant.imgURL} alt={activeContestant.name} className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-slate-800 object-cover border-2 border-slate-700" />
                    <img src={`https://a.espncdn.com/i/teamlogos/nba/500/${activeContestant.team.toLowerCase()}.png`} alt={activeContestant.team} className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 w-6 h-6 sm:w-8 sm:h-8 bg-slate-900 rounded-full border border-slate-700 p-0.5 object-contain" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-xl font-black text-white uppercase leading-tight">{activeContestant.name}</h2>
                    <div className="text-xs sm:text-sm text-slate-400">{activeContestant.team}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Score</div>
                  <div className="text-3xl sm:text-4xl font-black text-amber-500 tabular-nums leading-none">{runningTotal}</div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex items-center justify-center shrink-0 h-[74px] sm:h-[98px]">
                <span className="text-xs sm:text-sm text-slate-500 font-medium uppercase tracking-widest">Waiting for shooter...</span>
              </div>
            )}

            <div className="flex-1 relative min-h-0 flex flex-col">
              <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 flex items-center space-x-2">
                {isFinished && (
                  <button
                    onClick={() => setView('results')}
                    className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 sm:px-4 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    View Final Results
                  </button>
                )}
                <button
                  onClick={() => setShowShotChart(!showShotChart)}
                  className={`flex items-center space-x-1 sm:space-x-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors border ${
                    showShotChart ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <Activity className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Shot Chart</span>
                  <span className="sm:hidden">Chart</span>
                </button>
              </div>

              <div className="flex-1 flex items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800 p-2 sm:p-4 min-h-0">
                <div className="w-full max-w-[600px] flex items-center justify-center">
                  <CourtRackDisplay
                    activePlayerId={activePlayerId}
                    activeRound={activeRound}
                    activeStation={activeStation}
                    activeBall={activeBall}
                    ballState={ballState}
                    moneyrackStation={activeContestant ? (moneyrackAssignments.get(activeContestant.id) || 0) : 0}
                    showShotChart={showShotChart}
                    shotChart={activeChart}
                    highScoreFlash={highScoreFlash}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4 sm:gap-6 min-h-0">
            <div className="flex lg:hidden bg-slate-900/80 p-1 rounded-xl border border-slate-800 shrink-0">
              <button
                onClick={() => setMobileTab('scoreboard')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${mobileTab === 'scoreboard' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Scoreboard
              </button>
              <button
                onClick={() => setMobileTab('commentary')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${mobileTab === 'commentary' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Commentary
              </button>
            </div>

            <div className={`min-h-[250px] lg:h-[45%] flex flex-col min-h-0 relative ${mobileTab === 'scoreboard' ? 'flex' : 'hidden lg:flex'}`}>
              <AnimatePresence mode="wait">
                {phase === 'finals' || phase === 'done' ? (
                  finalist1 && finalist2 ? (
                    <motion.div key="finals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                      <FinalsScoreboard
                        finalist1={finalist1}
                        finalist2={finalist2}
                        r1Scores={r1Scores}
                        finalsScores={finalsScores}
                        ballState={ballState}
                        activeId={activePlayerId}
                        activeSi={activeStation}
                        winnerId={winnerId}
                        phase={phase}
                        round="finals"
                        moneyrackAssignments={moneyrackAssignments}
                      />
                    </motion.div>
                  ) : null
                ) : (
                  <motion.div key="round1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                    <Scoreboard3PT contestants={contestants} plays={plays} currentIndex={currentIndex} ballState={ballState} phase={phase} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className={`min-h-[250px] lg:h-[55%] flex flex-col min-h-0 ${mobileTab === 'commentary' ? 'flex' : 'hidden lg:flex'}`}>
              <ShotFeed plays={plays} currentIndex={currentIndex} contestants={contestants} />
            </div>
          </div>
        </div>
      )}

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
              className="bg-slate-900 border border-white/10 p-10 rounded-3xl max-w-md w-full text-center shadow-2xl"
            >
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <X className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-3">Exit Contest?</h3>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                You'll miss the rest of the show! The result will be auto-simulated and saved if you leave now.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
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
}
