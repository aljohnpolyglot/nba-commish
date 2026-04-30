import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Zap, Shield, Activity } from 'lucide-react';
import { GameSim } from '../../engine/GameSim';
import { LogEntry, GameStatus } from '../../types/throne';

interface TheThroneGameProps {
  currentGame: GameSim;
  gameLogs: LogEntry[];
  isSimulating: boolean;
  onStep: () => void;
  onAuto: () => void;
  onSimToEnd: () => void;
  onFinished: () => void;
}

const AnimatedScore = ({ value }: { value: number }) => {
  return (
    <motion.span
      animate={{ color: '#ffffff', scale: 1 }}
      className="tabular-nums inline-block text-6xl md:text-8xl font-black"
    >
      {value}
    </motion.span>
  );
};

export const TheThroneGame: React.FC<TheThroneGameProps> = ({
  currentGame,
  gameLogs,
  isSimulating,
  onStep,
  onAuto,
  onSimToEnd,
  onFinished
}) => {
  const feedRef = useRef<HTMLDivElement>(null);
  const state = currentGame.getState();
  const isFinished = state.status === GameStatus.FINISHED;

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [gameLogs]);

  return (
    <motion.div
      key="game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-screen md:grid md:grid-cols-[280px_1fr_280px] lg:grid-cols-[320px_1fr_320px] bg-[#020202] overflow-hidden"
    >
      {/* Left Panel: Player 1 */}
      <div className="hidden md:flex flex-col bg-zinc-950 p-6 lg:p-8 border-r border-zinc-800 overflow-y-auto">
        <div className="flex flex-col items-center">
          <div className={`text-[9px] font-black text-yellow-500 uppercase tracking-widest mb-3 ${state.currentPossessionPlayerId === state.player1.id ? 'animate-pulse' : ''}`}>
            {state.currentPossessionPlayerId === state.player1.id ? 'ON BALL' : 'DEFENSE'}
          </div>
          <img
            src={state.player1.imgURL}
            className="w-20 h-20 lg:w-24 lg:h-24 rounded-lg bg-zinc-900 object-cover mb-4"
            onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
            alt=""
          />
          <div className="text-center">
            <h3 className="text-lg lg:text-xl font-black italic uppercase tracking-tight leading-none mb-1">
              {state.player1.lastName}
            </h3>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">
              {state.player1.team} • {state.player1.pos}
            </p>
          </div>

          <div className="mt-8 w-full pt-6 border-t border-zinc-800">
            <div className="text-center">
              <div className="text-sm font-mono text-zinc-500 mb-2 tracking-widest">SCORE</div>
              <div className="text-4xl lg:text-5xl font-black text-white mb-6">
                <AnimatedScore value={state.score1} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[8px] lg:text-[9px] font-bold uppercase text-zinc-400">
              <div className="bg-zinc-900 p-2 rounded text-center">
                <div className="text-zinc-600 mb-1">FG</div>
                <div className="text-white">{state.p1Stats.fgm}/{state.p1Stats.fga}</div>
              </div>
              <div className="bg-zinc-900 p-2 rounded text-center">
                <div className="text-zinc-600 mb-1">3P</div>
                <div className="text-white">{state.p1Stats.tpm}/{state.p1Stats.tpa}</div>
              </div>
              <div className="bg-zinc-900 p-2 rounded text-center">
                <div className="text-zinc-600 mb-1">REB</div>
                <div className="text-white">{state.p1Stats.reb}</div>
              </div>
              <div className="bg-zinc-900 p-2 rounded text-center">
                <div className="text-zinc-600 mb-1">AST</div>
                <div className="text-white">{state.p1Stats.ast}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle: Play-by-play */}
      <div className="flex-1 bg-[#0a0a0a] flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex justify-between items-center px-4 py-3 bg-black border-b border-zinc-900 rounded mb-4">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest mb-1">
              {state.currentPossessionPlayerId === state.player1.id ? 'BALL' : ''}
            </span>
            <span className="text-3xl font-black">
              <AnimatedScore value={state.score1} />
            </span>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-1">REGULATION</div>
            <div className="w-12 h-px bg-zinc-800" />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">
              {state.currentPossessionPlayerId === state.player2.id ? 'BALL' : ''}
            </span>
            <span className="text-3xl font-black">
              <AnimatedScore value={state.score2} />
            </span>
          </div>
        </div>

        {/* Win Probability */}
        <div className="mb-4 bg-[#080808]/80 p-3 border border-zinc-800/50 rounded shadow-lg">
          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest mb-2 px-1">
            <span className="text-yellow-500">{state.player1.lastName} {Math.round((state.winProb1 || 0.5) * 100)}%</span>
            <span className="text-zinc-500 font-mono">WIN PROBABILITY</span>
            <span className="text-white">{Math.round((state.winProb2 || 0.5) * 100)}% {state.player2.lastName}</span>
          </div>
          <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden flex">
            <motion.div
              animate={{ width: `${(state.winProb1 || 0.5) * 100}%` }}
              className="h-full bg-yellow-500 transition-all duration-1000"
            />
            <motion.div
              animate={{ width: `${(state.winProb2 || 0.5) * 100}%` }}
              className="h-full bg-white transition-all duration-1000"
            />
          </div>
        </div>

        {/* Play-by-play */}
        <div
          ref={feedRef}
          className="flex-1 overflow-y-auto space-y-2 px-2 scrollbar-thin scrollbar-thumb-zinc-800 scroll-smooth mb-4"
        >
          {gameLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-xs tracking-widest">
              GAME READY — PRESS PLAY
            </div>
          ) : (
            gameLogs.map((log, i) => {
              const isLatest = i === gameLogs.length - 1;
              let icon = <Activity className="w-4 h-4 opacity-40" />;

              if (log.text.toLowerCase().includes('score') || log.text.toLowerCase().includes('hits') || log.text.toLowerCase().includes('splashes')) {
                icon = <Zap className="w-4 h-4 text-yellow-500 fill-current" />;
              } else if (log.text.toLowerCase().includes('block')) {
                icon = <Shield className="w-4 h-4 text-white" />;
              }

              return (
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  key={log.timestamp + i}
                  className={`p-3 border-l-2 text-[11px] flex gap-3 transition-all ${
                    isLatest ? 'border-yellow-500 bg-zinc-900/80 shadow-lg' : 'border-zinc-800 bg-transparent'
                  }`}
                >
                  <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    {icon}
                  </div>
                  <div className="flex-1 leading-snug">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-mono text-[8px] text-zinc-600 uppercase tracking-widest">{log.timestamp}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-black text-[9px] tabular-nums ${log.score1 > log.score2 ? 'text-yellow-500' : 'text-zinc-500'}`}>
                          {log.score1}
                        </span>
                        <span className="text-[9px] text-zinc-700">-</span>
                        <span className={`font-black text-[9px] tabular-nums ${log.score2 > log.score1 ? 'text-white' : 'text-zinc-500'}`}>
                          {log.score2}
                        </span>
                      </div>
                    </div>
                    <div className={isLatest ? 'text-white font-semibold' : 'text-zinc-300'}>
                      {log.text}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 pt-4 bg-black/20 border-t border-zinc-800/50">
          {!isFinished ? (
            <>
              <button
                onClick={onStep}
                disabled={isSimulating}
                className="py-4 md:py-5 bg-zinc-900 border border-zinc-800 text-white font-black uppercase text-[10px] tracking-[0.2em] hover:bg-zinc-800 disabled:opacity-50 transition-all"
              >
                STEP
              </button>
              <button
                onClick={onAuto}
                disabled={isSimulating}
                className="py-4 md:py-5 bg-zinc-900 border border-zinc-800 text-yellow-500 font-black uppercase text-[10px] tracking-[0.2em] hover:bg-zinc-800 disabled:opacity-50 transition-all"
              >
                AUTO
              </button>
              <button
                onClick={onSimToEnd}
                disabled={isSimulating}
                className="col-span-2 md:col-span-2 py-4 md:py-5 bg-yellow-500 text-black font-black uppercase text-[10px] tracking-[0.2em] hover:bg-yellow-400 disabled:opacity-50 transition-all"
              >
                SIM TO END
              </button>
            </>
          ) : (
            <button
              onClick={onFinished}
              className="col-span-2 md:col-span-4 py-4 md:py-6 bg-yellow-500 text-black font-black text-lg uppercase tracking-tighter hover:bg-yellow-400 animate-pulse"
            >
              NEXT MATCH
            </button>
          )}
        </div>
      </div>

      {/* Right Panel: Player 2 */}
      <div className="hidden md:flex flex-col bg-zinc-950 p-6 lg:p-8 border-l border-zinc-800 overflow-y-auto">
        <div className="flex flex-col items-center">
          <div className={`text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-3 ${state.currentPossessionPlayerId === state.player2.id ? 'text-white animate-pulse' : ''}`}>
            {state.currentPossessionPlayerId === state.player2.id ? 'ON BALL' : 'DEFENSE'}
          </div>
          <img
            src={state.player2.imgURL}
            className="w-20 h-20 lg:w-24 lg:h-24 rounded-lg bg-zinc-900 object-cover mb-4"
            onError={(e) => (e.currentTarget.src = 'https://www.nba.com/assets/img/default-headshot.png')}
            alt=""
          />
          <div className="text-center">
            <h3 className="text-lg lg:text-xl font-black italic uppercase tracking-tight leading-none mb-1">
              {state.player2.lastName}
            </h3>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">
              {state.player2.team} • {state.player2.pos}
            </p>
          </div>

          <div className="mt-8 w-full pt-6 border-t border-zinc-800">
            <div className="text-center">
              <div className="text-sm font-mono text-zinc-500 mb-2 tracking-widest">SCORE</div>
              <div className="text-4xl lg:text-5xl font-black text-white mb-6">
                <AnimatedScore value={state.score2} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[8px] lg:text-[9px] font-bold uppercase text-zinc-400">
              <div className="bg-zinc-900 p-2 rounded text-center">
                <div className="text-zinc-600 mb-1">FG</div>
                <div className="text-white">{state.p2Stats.fgm}/{state.p2Stats.fga}</div>
              </div>
              <div className="bg-zinc-900 p-2 rounded text-center">
                <div className="text-zinc-600 mb-1">3P</div>
                <div className="text-white">{state.p2Stats.tpm}/{state.p2Stats.tpa}</div>
              </div>
              <div className="bg-zinc-900 p-2 rounded text-center">
                <div className="text-zinc-600 mb-1">REB</div>
                <div className="text-white">{state.p2Stats.reb}</div>
              </div>
              <div className="bg-zinc-900 p-2 rounded text-center">
                <div className="text-zinc-600 mb-1">AST</div>
                <div className="text-white">{state.p2Stats.ast}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
