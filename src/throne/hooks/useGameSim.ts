import { useState, useRef, useCallback, useEffect } from 'react';
import { GameSim } from '../engine/GameSim';
import { LogEntry } from '../types/throne';

export function useGameSim() {
  const [currentGame, setCurrentGame] = useState<GameSim | null>(null);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(50);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Buffer: plays returned from a possession but not yet shown one-by-one
  const playQueueRef = useRef<LogEntry[]>([]);
  const gameRef = useRef<GameSim | null>(null);

  const stop = useCallback(() => {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Release one play from the queue, or fetch the next possession to fill it.
  // Returns true when the game just finished on this tick.
  const tickOnce = useCallback((): boolean => {
    const game = gameRef.current;
    if (!game) { stop(); return false; }

    // Fill queue if empty
    if (playQueueRef.current.length === 0) {
      const newPlays = game.nextPossession();
      if (newPlays.length === 0) return false;
      playQueueRef.current = newPlays;
    }

    // Release one play
    const next = playQueueRef.current.shift()!;
    setGameLogs(all => [...all, next]);

    const state = game.getState();
    if (state.status === 'FINISHED' && playQueueRef.current.length === 0) {
      stop();
      return true;
    }
    return false;
  }, [stop]);

  const tick = useCallback(() => {
    tickOnce();
  }, [tickOnce]);

  const togglePlay = useCallback(() => {
    if (autoRef.current) {
      stop();
      return;
    }
    setIsPlaying(true);
    const delay = Math.round(2050 - speed * 20);
    autoRef.current = setInterval(tick, delay);
  }, [speed, tick, stop]);

  // Restart interval when speed changes mid-play
  useEffect(() => {
    if (!isPlaying) return;
    if (autoRef.current) clearInterval(autoRef.current);
    const delay = Math.round(2050 - speed * 20);
    autoRef.current = setInterval(tick, delay);
    return () => {
      if (autoRef.current) {
        clearInterval(autoRef.current);
        autoRef.current = null;
      }
    };
  }, [speed, isPlaying, tick]);

  const skipToEnd = useCallback(() => {
    stop();
    playQueueRef.current = [];
    setCurrentGame(prev => {
      if (!prev) return prev;
      const allLogs: LogEntry[] = [...prev.getState().logs];
      let safety = 0;
      while (prev.getState().status !== 'FINISHED' && safety++ < 2000) {
        allLogs.push(...prev.nextPossession());
      }
      setGameLogs(allLogs);
      return prev;
    });
  }, [stop]);

  // Keep gameRef in sync so tickOnce can read it without stale closure
  const setCurrentGameWrapped = useCallback((game: GameSim | null) => {
    gameRef.current = game;
    playQueueRef.current = [];
    setCurrentGame(game);
  }, []);

  return {
    currentGame,
    setCurrentGame: setCurrentGameWrapped,
    gameLogs, setGameLogs,
    isPlaying,
    speed, setSpeed,
    togglePlay,
    skipToEnd,
  };
}
