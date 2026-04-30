import { useState, useRef, useCallback } from 'react';
import { GameSim } from '../engine/GameSim';
import { LogEntry } from '../types/throne';

export function useGameSim() {
  const [currentGame, setCurrentGame] = useState<GameSim | null>(null);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAuto = () => {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
    setIsSimulating(false);
  };

  const nextPossession = useCallback((onFinish: () => void) => {
    setCurrentGame(prev => {
      if (!prev) return prev;
      const log = prev.nextPossession();
      if (log) setGameLogs(logs => [...logs, log]);
      const state = prev.getState();
      if (state.status === 'FINISHED') {
        setTimeout(onFinish, 600);
      }
      return prev;
    });
  }, []);

  const autoSimulate = useCallback((onFinish: () => void) => {
    if (autoRef.current) {
      stopAuto();
      return;
    }
    setIsSimulating(true);
    autoRef.current = setInterval(() => {
      setCurrentGame(prev => {
        if (!prev) { stopAuto(); return prev; }
        const log = prev.nextPossession();
        if (log) setGameLogs(logs => [...logs, log]);
        const state = prev.getState();
        if (state.status === 'FINISHED') {
          stopAuto();
          setTimeout(onFinish, 800);
        }
        return prev;
      });
    }, 300);
  }, []);

  const simMatch = useCallback((onFinish: () => void) => {
    stopAuto();
    setCurrentGame(prev => {
      if (!prev) return prev;
      const allLogs: LogEntry[] = [];
      let safety = 0;
      while (prev.getState().status !== 'FINISHED' && safety++ < 500) {
        const log = prev.nextPossession();
        if (log) allLogs.push(log);
      }
      setGameLogs(allLogs);
      setTimeout(onFinish, 400);
      return prev;
    });
  }, []);

  return {
    currentGame, setCurrentGame,
    gameLogs, setGameLogs,
    isSimulating,
    nextPossession,
    autoSimulate,
    simMatch,
  };
}
