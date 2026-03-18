import { useState, useEffect, useCallback } from 'react';
import { 
  NBAPlayer, Play, DunkContestResult, AllStarDunkContestSim 
} from '../data/AllStarDunkContestSim';
import { loadBadges } from '../data/badgeService';

/**
 * Hook to manage the Slam Dunk Contest live simulation state.
 * Follows the exact pattern of the game's useLiveGame hook.
 */
export function useDunkContest(contestants: NBAPlayer[]) {
  const [badgesLoaded, setBadgesLoaded] = useState(false);
  const [plays, setPlays] = useState<Play[]>([]);
  const [simResult, setSimResult] = useState<DunkContestResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(40);
  const [liveScores, setLiveScores] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    contestants.forEach(c => { initial[c.name] = 0; });
    return initial;
  });
  const [judgeModal, setJudgeModal] = useState<Play['triggerJudgeModal'] | null>(null);

  // Load badges first, then build plays
  useEffect(() => {
    const fresh: Record<string, number> = {};
    contestants.forEach(c => { fresh[c.name] = 0; });
    setLiveScores(fresh);
    setCurrentIndex(-1);
    setIsPlaying(false);

    loadBadges().then(() => {
      setBadgesLoaded(true);
      
      const result = AllStarDunkContestSim.simulate(contestants);
      setPlays(result.plays);
      setSimResult(result);
    });
  }, [contestants]);

  // setInterval tick — exact copy of useLiveGame's interval logic
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPlaying && currentIndex < plays.length - 1) {
      const delay = Math.round(2050 - speed * 20);
      timer = setInterval(() => {
        setCurrentIndex(prev => {
          const next = prev + 1;
          if (next >= plays.length) {
            setIsPlaying(false);
            return prev;
          }
          
          // Stop if we reached the end
          if (next >= plays.length - 1) {
            setIsPlaying(false);
          }
          
          return next;
        });
      }, delay);
    }
    return () => clearInterval(timer);
  }, [isPlaying, speed, plays.length, currentIndex]);

  // Handle side effects of plays (score updates, modals)
  useEffect(() => {
    if (currentIndex < 0 || currentIndex >= plays.length) return;
    
    const currentPlay = plays[currentIndex];
    
    // Apply score update
    if (currentPlay?.scoreUpdate) {
      setLiveScores(s => ({
        ...s,
        [currentPlay.scoreUpdate!.playerId]: currentPlay.scoreUpdate!.newTotal
      }));
    }

    // Pause and trigger modal for score reveals
    if (currentPlay?.triggerJudgeModal && speed < 80) {
      setIsPlaying(false);
      setJudgeModal(currentPlay.triggerJudgeModal);
    }
  }, [currentIndex, plays, speed]);

  const togglePlay = () => {
    if (currentIndex >= plays.length - 1) {
      // Reset if finished
      reset();
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const skipToEnd = () => {
    if (simResult) {
      // Apply all scores
      const finalScores: Record<string, number> = {};
      plays.forEach(p => {
        if (p.scoreUpdate) {
          finalScores[p.scoreUpdate.playerId] = p.scoreUpdate.newTotal;
        }
      });
      setLiveScores(finalScores);
      setCurrentIndex(plays.length - 1);
      setIsPlaying(false);
    }
  };

  const reset = useCallback(() => {
    setCurrentIndex(-1);
    setIsPlaying(false);
    setJudgeModal(null);
    const fresh: Record<string, number> = {};
    contestants.forEach(c => { fresh[c.name] = 0; });
    setLiveScores(fresh);
  }, [contestants]);

  const pause = () => {
    setIsPlaying(false);
  };

  const closeJudgeModal = useCallback(() => {
    setJudgeModal(null);
    setIsPlaying(true); // resume playback
  }, []);

  const isFinished = plays.length > 0 && currentIndex >= plays.length - 1;
  const currentPlay = currentIndex >= 0 ? plays[currentIndex] : null;

  return {
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
  };
}
