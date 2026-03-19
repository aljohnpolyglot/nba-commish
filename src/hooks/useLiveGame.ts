import { useState, useEffect, useRef, useMemo } from 'react';
import { NBATeam, NBAPlayer, Game } from '../types';
import { GameResult } from '../services/simulation/types';
import { GameSimulator } from '../services/simulation/GameSimulator';
import { genPlays } from '../services/simulation/live/playback/simulationService';
import { loadBadges } from '../services/simulation/live/playback/badgeService';

declare global {
  interface Window {
    __finalResult: any;
  }
}

export function useLiveGame(
  game: Game,
  homeTeam: NBATeam,
  awayTeam: NBATeam,
  players: NBAPlayer[],
  onComplete: (result: GameResult) => void,
  homeOverridePlayers?: NBAPlayer[],
  awayOverridePlayers?: NBAPlayer[],
  riggedForTid?: number,
  precomputedResult?: GameResult
) {
  const [badgesLoaded, setBadgesLoaded] = useState(false);
  const [plays, setPlays] = useState<any[]>([]);
  const [finalResult, setFinalResult] = useState<GameResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(160);
  const simulatedRef = useRef(false);

  useEffect(() => {
    simulatedRef.current = false;
    setCurrentIndex(-1);
    setPlays([]);
    setIsPlaying(false);
    setFinalResult(null);
    setBadgesLoaded(false);

    loadBadges().then(async () => {
      if (simulatedRef.current) return;
      simulatedRef.current = true;

      try {
        const result = precomputedResult ?? GameSimulator.simulateGame(homeTeam, awayTeam, players, game.gid, game.date, 50, homeOverridePlayers, awayOverridePlayers, undefined, undefined, riggedForTid);
        setFinalResult(result);
        window.__finalResult = result;
        console.log("Set window.__finalResult to:", result);
        console.log('Raw result:', window.__finalResult);
        const qs = result.quarterScores;
        const otCount = result.otCount ?? 0;

        if (!result.homeStats || !result.awayStats || result.homeStats.length === 0 || result.awayStats.length === 0) {
          console.warn("Missing stats for game simulation, skipping genPlays");
          setPlays([]);
        } else {
          const generatedPlays = await genPlays(
            result.homeStats, result.awayStats, players,
            qs,
            otCount,
            result.gameWinner,
            homeTeam.abbrev,
            awayTeam.abbrev
          );
          setPlays(generatedPlays);
        }
      } catch (e) {
        console.error("Error generating plays:", e);
        setPlays([]);
      } finally {
        setBadgesLoaded(true);
      }
    });
  }, [game, homeTeam, awayTeam, players, homeOverridePlayers, awayOverridePlayers, riggedForTid, precomputedResult]);

  useEffect(() => {
    let timer: any;
    if (isPlaying && currentIndex < plays.length - 1) {
      timer = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= plays.length - 2) {
            setIsPlaying(false);
            return plays.length - 1;
          }
          return prev + 1;
        });
      }, speed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, speed, plays.length, currentIndex, finalResult]);

  const startSimulation = () => setIsPlaying(true);
  const pauseSimulation = () => setIsPlaying(false);
  const skipToEndOfQuarter = () => {
    if (currentIndex < 0) return;
    const currentQ = plays[currentIndex].q;
    let nextIdx = currentIndex;
    while (nextIdx < plays.length - 1 && plays[nextIdx].q === currentQ) {
      nextIdx++;
    }
    setCurrentIndex(nextIdx);
    setIsPlaying(false);
  };
  const skip3Minutes = () => {
    if (currentIndex < 0) return;
    const isOT = plays[currentIndex].q > 4;
    const qLen = isOT ? 300 : 720;
    const targetGs = plays[currentIndex].gs + 180;
    const qStartGs = plays[currentIndex].q <= 4 
      ? (plays[currentIndex].q - 1) * 720 
      : 2880 + (plays[currentIndex].q - 5) * 300;
    
    let nextIdx = currentIndex;
    while (nextIdx < plays.length - 1 && plays[nextIdx].gs < targetGs && plays[nextIdx].gs < (qStartGs + qLen)) {
      nextIdx++;
    }
    setCurrentIndex(nextIdx);
    setIsPlaying(false);
  };
  const skipToLast2Minutes = () => {
    if (!finalResult) return;
    const totalQuarters = finalResult.otCount > 0 ? 4 + finalResult.otCount : 4;
    const lastQ = totalQuarters;
    const isOT = lastQ > 4;
    const qLen = isOT ? 300 : 720;
    const qStartGs = lastQ <= 4 
      ? (lastQ - 1) * 720 
      : 2880 + (lastQ - 5) * 300;
    
    const targetGs = qStartGs + qLen - 120;
    
    let nextIdx = 0;
    while (nextIdx < plays.length - 1 && plays[nextIdx].gs < targetGs) {
      nextIdx++;
    }
    setCurrentIndex(nextIdx);
    setIsPlaying(false);
  };
  const togglePlay = () => {
    if (currentIndex >= plays.length - 1) {
      setCurrentIndex(-1);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const currentPlay = currentIndex >= 0 ? plays[currentIndex] : null;
  const homeScore = currentPlay ? currentPlay.cs : 0;
  const awayScore = currentPlay ? currentPlay.ds : 0;
  const quarter = currentPlay ? currentPlay.q : 1;
  const clock = currentPlay ? currentPlay.clock : '12:00';
  const events = plays.slice(0, currentIndex + 1);

  const liveStats = useMemo(() => {
    const stats: any = { HOME: {}, AWAY: {} };
    
    if (finalResult) {
      finalResult.homeStats.forEach(stat => {
        const p = players.find(p => p.internalId?.toString() === stat.playerId)
          ?? homeOverridePlayers?.find(p => p.internalId?.toString() === stat.playerId);
        if (p) stats.HOME[stat.playerId] = { ...p, n: stat.name, fgm: 0, fga: 0, tp: 0, tpa: 0, ftm: 0, fta: 0, ast: 0, orb: 0, drb: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, pm: 0, sec: 0 };
      });
      finalResult.awayStats.forEach(stat => {
        const p = players.find(p => p.internalId?.toString() === stat.playerId)
          ?? awayOverridePlayers?.find(p => p.internalId?.toString() === stat.playerId);
        if (p) stats.AWAY[stat.playerId] = { ...p, n: stat.name, fgm: 0, fga: 0, tp: 0, tpa: 0, ftm: 0, fta: 0, ast: 0, orb: 0, drb: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, pm: 0, sec: 0 };
      });
    }

    for (let i = 0; i <= currentIndex; i++) {
      const play = plays[i];
      if (!play || play.type === 'sub') continue;

      // Skip foul attempt lines — they are 
      // narrative only and not real shot attempts
      if (play.type === 'miss' && play.id?.includes('foul_attempt')) {
        continue;
      }

      const timeElapsed = i === 0 ? play.gs : (play.gs - plays[i - 1].gs);
      const tm = play.tm;
      
      if (timeElapsed > 0) {
        play.lineupHOME?.forEach((lp: any) => {
          if (stats.HOME[lp.id]) stats.HOME[lp.id].sec += timeElapsed;
        });
        play.lineupAWAY?.forEach((lp: any) => {
          if (stats.AWAY[lp.id]) stats.AWAY[lp.id].sec += timeElapsed;
        });
      }

      const pts = play.pts || 0;
      const isScoringPlay = (play.type === 'made' || (play.type === 'ft' && play.isMake)) && pts > 0;
      if (isScoringPlay) {
        if (tm === 'HOME') {
          play.lineupHOME?.forEach((lp: any) => { if (stats.HOME[lp.id]) stats.HOME[lp.id].pm += pts; });
          play.lineupAWAY?.forEach((lp: any) => { if (stats.AWAY[lp.id]) stats.AWAY[lp.id].pm -= pts; });
        } else if (tm === 'AWAY') {
          play.lineupAWAY?.forEach((lp: any) => { if (stats.AWAY[lp.id]) stats.AWAY[lp.id].pm += pts; });
          play.lineupHOME?.forEach((lp: any) => { if (stats.HOME[lp.id]) stats.HOME[lp.id].pm -= pts; });
        }
      }

      const player = play.player;
      if (player && player.n !== 'Team') {
        const pStat = stats[tm]?.[player.id];
        if (pStat) {
          if (play.type === 'made') {
            pStat.fgm++; pStat.fga++; pStat.pts += pts;
            if (play.is3) { pStat.tp++; pStat.tpa++; }
          } else if (play.type === 'miss') {
            pStat.fga++;
            if (play.is3) pStat.tpa++;
          } else if (play.type === 'ft') {
            pStat.fta++;
            if (play.isMake) { pStat.ftm++; pStat.pts++; }
          } else if (play.type === 'reb') {
            if (play.isOffReb) pStat.orb++; else pStat.drb++;
          } else if (play.type === 'stl') {
            pStat.stl++;
          } else if (play.type === 'blk') {
            pStat.blk++;
          } else if (play.type === 'tov') {
            pStat.tov++;
          } else if (play.type === 'foul') {
            pStat.pf++;
          }
        }
      }

      if (play.type === 'made' && play.astPlayer) {
        const astStats = stats[tm]?.[play.astPlayer.id];
        if (astStats) astStats.ast++;
      }
    }
    return stats;
  }, [currentIndex, plays, players, homeTeam.id, finalResult]);

  const teamStats = useMemo(() => {
    const ts: any = {
      HOME: { fgm:0,fga:0,tp:0,tpa:0,ftm:0,fta:0,ast:0,reb:0,orb:0,drb:0,stl:0,blk:0,tov:0,pts:0,pf:0 },
      AWAY: { fgm:0,fga:0,tp:0,tpa:0,ftm:0,fta:0,ast:0,reb:0,orb:0,drb:0,stl:0,blk:0,tov:0,pts:0,pf:0 },
    };
    ['HOME','AWAY'].forEach(tm => {
      Object.values(liveStats[tm]).forEach((p: any) => {
        ts[tm].fgm += p.fgm; ts[tm].fga += p.fga;
        ts[tm].tp  += p.tp;  ts[tm].tpa += p.tpa;
        ts[tm].ftm += p.ftm; ts[tm].fta += p.fta;
        ts[tm].ast += p.ast; 
        ts[tm].reb += p.orb + p.drb;
        ts[tm].orb += p.orb; ts[tm].drb += p.drb;
        ts[tm].stl += p.stl; ts[tm].blk += p.blk;
        ts[tm].tov += p.tov; ts[tm].pts += p.pts;
        ts[tm].pf  += p.pf;
      });
    });
    return ts;
  }, [liveStats]);

  return {
    isSimulating: isPlaying,
    isFinished: currentIndex >= plays.length - 1 && plays.length > 0,
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
    startSimulation,
    pauseSimulation,
    skipToEndOfQuarter,
    skip3Minutes,
    skipToLast2Minutes,
    togglePlay,
    badgesLoaded,
    currentPlay,
    finalResult
  };
}
