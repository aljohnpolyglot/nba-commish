import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Zap, Shield, Activity, X, Play, Pause, FastForward, Scissors, Crown } from 'lucide-react';
import { GameSim } from '../../engine/GameSim';
import { LogEntry, GameStatus, Player, PlayerStats } from '../../types/throne';

interface TheThroneGameProps {
  currentGame: GameSim;
  gameLogs: LogEntry[];
  isPlaying: boolean;
  speed: number;
  onSpeedChange: (n: number) => void;
  onTogglePlay: () => void;
  onSkip: () => void;
  onFinished: () => void;
}

const FALLBACK_HEADSHOT = 'https://www.nba.com/assets/img/default-headshot.png';

function AnimatedScore({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const [flashing, setFlashing] = useState(false);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === prevRef.current) return;
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;
    setFlashing(true);
    const start = performance.now();
    const duration = 300;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(from + (to - from) * t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(to);
        setTimeout(() => setFlashing(false), 500);
      }
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return (
    <span className={`tabular-nums inline-block text-6xl md:text-8xl font-black transition-none ${flashing ? 'score-flash' : ''}`}>
      {display}
    </span>
  );
}

function StatBadge({ label, val }: { label: string; val: number }) {
  const pct = Math.round(val);
  const color = pct >= 85 ? 'text-yellow-400' : pct >= 70 ? 'text-white' : 'text-zinc-500';
  return (
    <div className="bg-zinc-900 rounded p-2 text-center">
      <div className="text-zinc-600 text-[8px] uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`font-black text-[11px] tabular-nums ${color}`}>{pct}</div>
    </div>
  );
}

type K2Data = ReturnType<GameSim['getK2']>['p1K2'];

function PlayerPanel({ player, score, stats, hasBall, side, k2Data }: {
  player: Player; score: number; stats: PlayerStats; hasBall: boolean; side: 'left' | 'right'; k2Data: K2Data;
}) {
  const ovrK2 = player.ovr ?? 70;

  const attr = {
    '3PT': Math.round(k2Data?.OS?.sub?.[2] ?? player.ratings.tp ?? 50),
    'MID': Math.round(k2Data?.OS?.sub?.[1] ?? player.ratings.fg ?? 50),
    'INS': Math.round(k2Data?.IS?.sub?.[0] ?? player.ratings.ins ?? 50),
    'DNK': Math.round(k2Data?.IS?.sub?.[2] ?? player.ratings.dnk ?? 50),
    'DEF': Math.round(k2Data?.DF?.ovr ?? player.ratings.def ?? 50),
    'SPD': Math.round(k2Data?.AT?.sub?.[3] ?? player.ratings.spd ?? 50),
  };

  return (
    <div
      className="hidden md:flex flex-col bg-zinc-950 p-6 lg:p-8 overflow-y-auto"
      style={{
        borderRight: side === 'left' ? '1px solid #27272a' : 'none',
        borderLeft:  side === 'right' ? '1px solid #27272a' : 'none',
      }}
    >
      <div className="flex flex-col items-center">
        <div className="h-5 flex items-center justify-center mb-2">
          {hasBall ? (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
              </span>
              <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">BALL</span>
            </div>
          ) : (
            <span className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">DEF</span>
          )}
        </div>

        <div className="relative mb-4">
          <img
            src={player.imgURL}
            className={`w-20 h-20 lg:w-24 lg:h-24 rounded-lg bg-zinc-900 object-cover transition-all duration-500 ${
              hasBall ? 'grayscale-0 shadow-[0_0_30px_rgba(234,179,8,0.25)]' : 'grayscale opacity-60'
            }`}
            onError={(e) => (e.currentTarget.src = FALLBACK_HEADSHOT)}
            alt=""
          />
          <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded leading-none">
            {ovrK2}
          </div>
        </div>

        <div className="text-center mb-6">
          <h3 className="text-lg lg:text-xl font-black italic uppercase tracking-tight leading-none mb-1">
            {player.lastName}
          </h3>
          <p className="text-[10px] text-zinc-500 uppercase font-bold">
            {player.team} • {player.pos}
          </p>
        </div>

        <div className="text-center mb-4">
          <div className="text-xs font-mono text-zinc-600 tracking-widest mb-1">SCORE</div>
          <AnimatedScore value={score} />
        </div>

        {/* Collapsible: full stats grid + attribute badges */}
        <details className="w-full group" open>
          <summary className="cursor-pointer list-none text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300 text-center py-2 border-t border-zinc-800/60 select-none">
            <span className="group-open:hidden">▾ More Stats</span>
            <span className="hidden group-open:inline">▴ Hide Stats</span>
          </summary>

          <div className="w-full grid grid-cols-3 gap-2 text-[8px] lg:text-[9px] font-bold uppercase text-zinc-400 mb-4 mt-2">
            <div className="bg-zinc-900 p-2 rounded text-center">
              <div className="text-zinc-600 mb-1">FG</div>
              <div className="text-white">{stats.fgm}/{stats.fga}</div>
            </div>
            <div className="bg-zinc-900 p-2 rounded text-center">
              <div className="text-zinc-600 mb-1">3P</div>
              <div className="text-white">{stats.tpm}/{stats.tpa}</div>
            </div>
            <div className="bg-zinc-900 p-2 rounded text-center">
              <div className="text-zinc-600 mb-1">REB</div>
              <div className="text-white">{stats.reb}</div>
            </div>
            <div className="bg-zinc-900 p-2 rounded text-center">
              <div className="text-zinc-600 mb-1">STL</div>
              <div className="text-white">{stats.stl}</div>
            </div>
            <div className="bg-zinc-900 p-2 rounded text-center">
              <div className="text-zinc-600 mb-1">BLK</div>
              <div className="text-white">{stats.blk}</div>
            </div>
            <div className="bg-zinc-900 p-2 rounded text-center">
              <div className="text-zinc-600 mb-1">STK</div>
              <div className="text-white">{stats.streak}</div>
            </div>
          </div>

          <div className="w-full">
            <div className="text-[8px] font-black uppercase tracking-widest text-zinc-700 mb-2 text-center">ATTRIBUTES</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.entries(attr) as [string, number][]).map(([label, val]) => (
                <StatBadge key={label} label={label} val={val} />
              ))}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function LogIcon({ type }: { type: LogEntry['type'] }) {
  if (type === 'make') return <Zap className="w-3 h-3 text-yellow-500 fill-current" />;
  if (type === 'block') return <Shield className="w-3 h-3 text-white" />;
  if (type === 'turnover') return <X className="w-3 h-3 text-rose-400" />;
  if (type === 'steal') return <Scissors className="w-3 h-3 text-green-400" />;
  if (type === 'reb') return <Activity className="w-3 h-3 text-blue-400" />;
  if (type === 'end') return <Crown className="w-3 h-3 text-yellow-400 fill-current" />;
  return <Activity className="w-3 h-3 text-zinc-600" />;
}

export const TheThroneGame: React.FC<TheThroneGameProps> = ({
  currentGame,
  gameLogs,
  isPlaying,
  speed,
  onSpeedChange,
  onTogglePlay,
  onSkip,
  onFinished,
}) => {
  const feedRef = useRef<HTMLDivElement>(null);
  const state = currentGame.getState();
  const isFinished = state.status === GameStatus.FINISHED;
  const { p1K2, p2K2 } = currentGame.getK2();

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [gameLogs]);

  const playerById = (id: string) => (state.player1.id === id ? state.player1 : state.player2);

  return (
    <motion.div
      key="game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-[100dvh] md:grid md:grid-cols-[280px_1fr_280px] lg:grid-cols-[320px_1fr_320px] bg-[#020202] overflow-hidden"
    >
      <PlayerPanel
        player={state.player1}
        score={state.score1}
        stats={state.p1Stats}
        hasBall={state.currentPossessionPlayerId === state.player1.id}
        side="left"
        k2Data={p1K2}
      />

      {/* Middle: Play-by-play */}
      <div className="flex-1 bg-[#0a0a0a] flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex justify-between items-center px-4 py-3 bg-black border-b border-zinc-900 rounded mb-4">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest mb-1">
              {state.currentPossessionPlayerId === state.player1.id ? 'BALL' : ''}
            </span>
            <span className="text-3xl font-black"><AnimatedScore value={state.score1} /></span>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-1">REGULATION</div>
            <div className="w-12 h-px bg-zinc-800" />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">
              {state.currentPossessionPlayerId === state.player2.id ? 'BALL' : ''}
            </span>
            <span className="text-3xl font-black"><AnimatedScore value={state.score2} /></span>
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
              const actor = playerById(log.playerId || state.player1.id);
              const isP1 = log.playerId === state.player1.id;
              const ringClass = isP1 ? 'ring-yellow-500/70' : 'ring-white/60';
              const isMake = log.type === 'make';

              if (log.type === 'end') {
                return (
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    key={log.timestamp + i}
                    className="mt-2 p-4 border-2 border-yellow-500 bg-yellow-500/10 rounded text-center"
                  >
                    <Crown className="w-5 h-5 text-yellow-400 fill-current mx-auto mb-2" />
                    <div className="text-yellow-300 font-black text-[12px] leading-snug break-words uppercase tracking-wide">
                      {log.text}
                    </div>
                    <div className="mt-1 text-[9px] font-mono text-yellow-600 uppercase tracking-widest">
                      FINAL {log.score1} – {log.score2}
                    </div>
                  </motion.div>
                );
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
                  <div className="relative shrink-0">
                    <img
                      src={actor.imgURL}
                      alt={actor.lastName}
                      className={`w-9 h-9 rounded-full bg-zinc-900 object-cover ring-2 ${ringClass}`}
                      onError={(e) => (e.currentTarget.src = FALLBACK_HEADSHOT)}
                    />
                    <div className="absolute -bottom-1 -right-1 bg-zinc-950 border border-zinc-800 rounded-full p-0.5">
                      <LogIcon type={log.type} />
                    </div>
                  </div>
                  <div className="flex-1 leading-snug min-w-0">
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
                    <div className={`${isMake ? 'text-white font-bold' : log.type === 'steal' ? 'text-green-300 font-semibold' : log.type === 'reb' ? 'text-zinc-500 text-[10px]' : isLatest ? 'text-zinc-200' : 'text-zinc-400'} leading-snug break-words`}>
                      {log.text}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Controls — Play/Pause + Speed slider + Skip */}
        <div className="pt-4 border-t border-zinc-800/50 bg-black/20">
          {!isFinished ? (
            <div className="flex items-center gap-4 px-2 py-2">
              <button
                onClick={onTogglePlay}
                className="w-12 h-12 flex items-center justify-center bg-yellow-500 hover:bg-yellow-400 text-black rounded-full transition-all transform active:scale-95 shrink-0"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <div className="flex-1 flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest shrink-0">SPEED</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={speed}
                  onChange={(e) => onSpeedChange(parseInt(e.target.value))}
                  className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                />
                <span className="text-[10px] font-mono text-zinc-500 w-8 text-right shrink-0 tabular-nums">{speed}</span>
              </div>

              <button
                onClick={onSkip}
                className="px-4 h-10 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 font-black uppercase text-[10px] tracking-widest flex items-center gap-1.5 shrink-0"
                title="Skip to end"
              >
                <FastForward size={12} /> SKIP
              </button>
            </div>
          ) : (
            <button
              onClick={onFinished}
              className="w-full py-4 md:py-6 bg-yellow-500 text-black font-black text-lg uppercase tracking-tighter hover:bg-yellow-400 animate-pulse"
            >
              NEXT MATCH
            </button>
          )}
        </div>
      </div>

      <PlayerPanel
        player={state.player2}
        score={state.score2}
        stats={state.p2Stats}
        hasBall={state.currentPossessionPlayerId === state.player2.id}
        side="right"
        k2Data={p2K2}
      />
    </motion.div>
  );
};
