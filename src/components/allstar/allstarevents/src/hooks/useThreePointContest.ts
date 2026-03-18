import { useState, useEffect } from 'react';
import { ThreePointContestant } from '../data/contestants';
import { ThreePointContestResult, simulateContest, BallResult, ShootingZoneData } from '../data/ThreePointContestSim';
import { ThreePointPlay, buildThreePointPlays } from '../data/threePointPlaysEngine';

export type BallDisplayState = Record<string, BallResult>;

const WORKER_URL = 'https://shiny-sky-8d8a.pitanbatman.workers.dev/';

function assignMoneyrackStation(
  contestant: ThreePointContestant,
  zones: ShootingZoneData | null
): number {
  // PRIORITY 1: Real API data — highest % station with decent volume
  if (zones) {
    const { pctByStation, volByStation } = zones;
    // Score each station: pct * volume_weight
    // Volume threshold: only consider stations with > 1.0 attempts/game
    const scores = pctByStation.map((pct, i) => {
      const vol = volByStation[i];
      if (vol < 1.0) return 0; // ignore low-volume stations
      return pct * Math.min(vol, 4.0); // cap volume influence at 4apg
    });
    const bestStation = scores.indexOf(Math.max(...scores));
    if (scores[bestStation] > 0) {
      console.log(`[3PT] ${contestant.name} → moneyball at station ${bestStation + 1} (API: ${(pctByStation[bestStation] * 100).toFixed(1)}% on ${volByStation[bestStation].toFixed(1)} att/g)`);
      return bestStation + 1; // stations are 1-indexed
    }
  }

  // PRIORITY 2: Badge fallback
  const badges = contestant.badges;
  const cs  = badges['Corner Specialist'];
  const lr  = badges['Limitless Range'];
  const sss = badges['Set Shot Specialist'];

  if (cs === 'HOF' || cs === 'Gold') {
    const station = Math.random() < 0.5 ? 1 : 5;
    console.log(`[3PT] ${contestant.name} → moneyball at station ${station} (Corner Specialist badge)`);
    return station;
  }
  if (lr === 'HOF' || lr === 'Gold') {
    console.log(`[3PT] ${contestant.name} → moneyball at station 3 (Limitless Range badge)`);
    return 3;
  }
  if (sss === 'HOF' || sss === 'Gold') {
    const station = Math.random() < 0.5 ? 2 : 4;
    console.log(`[3PT] ${contestant.name} → moneyball at station ${station} (Set Shot Specialist badge)`);
    return station;
  }
  if (contestant.ratings.tp >= 85) {
    console.log(`[3PT] ${contestant.name} → moneyball at station 3 (high tp rating)`);
    return 3;
  }

  // PRIORITY 3: Weighted random — top of key most common in real contest
  const weights = [1, 2, 4, 2, 1]; // L-Corner, L-Wing, Top, R-Wing, R-Corner
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      console.log(`[3PT] ${contestant.name} → moneyball at station ${i + 1} (random)`);
      return i + 1;
    }
  }
  return 3;
}

export function useThreePointContest(contestants: ThreePointContestant[]) {
  const [loadingPhase, setLoadingPhase] = useState<'badges' | 'zones' | 'moneyrack' | 'ready'>('zones');
  const [zoneData, setZoneData] = useState<Map<string, ShootingZoneData>>(new Map());
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [moneyrackAssignments, setMoneyrackAssignments] = useState<Map<string, number>>(new Map());
  
  const [plays, setPlays] = useState<ThreePointPlay[]>([]);
  const [simResult, setSimResult] = useState<ThreePointContestResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  
  const [ballState, setBallState] = useState<BallDisplayState>({});
  
  useEffect(() => {
    let cancelled = false;

    async function loadAllZoneData() {
      const results = new Map<string, ShootingZoneData>();

      // Fetch all contestants in parallel
      await Promise.allSettled(
        contestants.map(async (c) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

            const res = await fetch(
              `${WORKER_URL}?player=${c.nbaSlug}`,
              { signal: controller.signal }
            );
            clearTimeout(timeout);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            if (json.success && json.racks) {
              const pctByStation = json.racks.map((r: any) =>
                parseFloat(r.pct.replace('%', '')) / 100
              );
              const volByStation = json.racks.map((r: any) =>
                parseFloat(r.vol.replace('/g', ''))
              );
              
              if (!cancelled) {
                setZoneData(prev => {
                  const next = new Map(prev);
                  next.set(c.id, { racks: json.racks, pctByStation, volByStation });
                  return next;
                });
              }
              console.log(`[3PT] ${c.name} zone data loaded`);
            }
          } catch (err) {
            console.warn(`[3PT] Zone data failed for ${c.name} — using badge fallback`);
            // Don't set anything — absence means use fallback
          }
        })
      );

      if (!cancelled) {
        setZonesLoaded(true);
      }
    }

    loadAllZoneData();
    return () => { cancelled = true; };
  }, [contestants]);

  useEffect(() => {
    if (!zonesLoaded) return;
    const assignments = new Map<string, number>();
    contestants.forEach(c => {
      const zones = zoneData.get(c.id) ?? null;
      assignments.set(c.id, assignMoneyrackStation(c, zones));
    });
    setMoneyrackAssignments(assignments);
    
    // Simulate contest
    const result = simulateContest(contestants, zoneData, assignments);
    const builtPlays = buildThreePointPlays(contestants, result, zoneData, assignments);
    setPlays(builtPlays);
    setSimResult(result);
    
    // Simulate moneyrack reveal phase
    setLoadingPhase('moneyrack');
    setTimeout(() => {
      setLoadingPhase('ready');
    }, 1500); // Adjust this delay based on how long the reveal should take
  }, [zonesLoaded, contestants, zoneData]);

  useEffect(() => {
    const play = plays[currentIndex];
    if (!play) return;
    
    if (play.type === 'ball_shot' && play.ballResult !== undefined) {
      setBallState(prev => ({
        ...prev,
        [`${play.playerId}|${play.round}|${play.si}|${play.bi}`]: play.ballResult!
      }));
    }
  }, [currentIndex, plays]);

  useEffect(() => {
    if (!isPlaying || currentIndex >= plays.length - 1) return;

    const play = plays[currentIndex + 1];
    let delay = play.pauseMs;
    
    if (play.type !== 'ball_shot') {
      const speedFactor = Math.max(0.1, (100 - speed) / 40);
      delay = delay * speedFactor;
    }

    const timer = setTimeout(() => {
      setCurrentIndex(c => c + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, plays, speed]);

  const togglePlay = () => setIsPlaying(p => !p);
  const skipToEnd = () => {
    setIsPlaying(false);
    setCurrentIndex(plays.length - 1);
    
    const finalBallState: BallDisplayState = {};
    plays.forEach(p => {
      if (p.type === 'ball_shot' && p.ballResult) {
        finalBallState[`${p.playerId}|${p.round}|${p.si}|${p.bi}`] = p.ballResult;
      }
    });
    setBallState(finalBallState);
  };
  const reset = () => {
    setIsPlaying(false);
    setCurrentIndex(-1);
    setBallState({});
  };

  const isFinished = currentIndex >= plays.length - 1 && plays.length > 0;

  return {
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
    reset,
  };
}
