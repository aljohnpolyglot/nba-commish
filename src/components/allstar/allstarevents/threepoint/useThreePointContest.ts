import { useState, useEffect } from 'react';
import { ThreePointContestant } from '../../../../services/allStar/ThreePointContestant';
import { ThreePointContestResult, simulateContest, BallResult, ShootingZoneData } from '../../../../services/allStar/ThreePointContestSim';
import { ThreePointPlay, buildThreePointPlays } from '../../../../services/allStar/threePointPlaysEngine';

export type BallDisplayState = Record<string, BallResult>;

const WORKER_URL = 'https://shiny-sky-8d8a.pitanbatman.workers.dev/';

function assignMoneyrackStation(
  contestant: ThreePointContestant,
  zones: ShootingZoneData | null
): number {
  if (zones) {
    const { pctByStation, volByStation } = zones;
    const scores = pctByStation.map((pct, i) => {
      const vol = volByStation[i];
      if (vol < 1.0) return 0;
      return pct * Math.min(vol, 4.0);
    });
    const bestStation = scores.indexOf(Math.max(...scores));
    if (scores[bestStation] > 0) {
      return bestStation + 1;
    }
  }

  const badges = contestant.badges;
  const cs  = badges['Corner Specialist'];
  const lr  = badges['Limitless Range'];
  const sss = badges['Set Shot Specialist'];

  if (cs === 'HOF' || cs === 'Gold') return Math.random() < 0.5 ? 1 : 5;
  if (lr === 'HOF' || lr === 'Gold') return 3;
  if (sss === 'HOF' || sss === 'Gold') return Math.random() < 0.5 ? 2 : 4;
  if (contestant.ratings.tp >= 85) return 3;

  const weights = [1, 2, 4, 2, 1];
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i + 1;
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

  // Use a stable key so a new array reference with same contestants doesn't re-fetch/re-sim
  const contestantsKey = contestants.map(c => c.id).join(',');

  useEffect(() => {
    let cancelled = false;

    async function loadAllZoneData() {
      await Promise.allSettled(
        contestants.map(async (c) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20000);

            const res = await fetch(`${WORKER_URL}?player=${c.nbaSlug}`, { signal: controller.signal });
            clearTimeout(timeout);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            if (json.success && json.racks) {
              const pctByStation = json.racks.map((r: any) => parseFloat(r.pct.replace('%', '')) / 100);
              const volByStation = json.racks.map((r: any) => parseFloat(r.vol.replace('/g', '')));

              if (!cancelled) {
                setZoneData(prev => {
                  const next = new Map(prev);
                  next.set(c.id, { racks: json.racks, pctByStation, volByStation });
                  return next;
                });
              }
            }
          } catch {
            // Falls back to badge-based logic
          }
        })
      );

      if (!cancelled) setZonesLoaded(true);
    }

    loadAllZoneData();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestantsKey]);

  useEffect(() => {
    if (!zonesLoaded) return;
    const assignments = new Map<string, number>();
    contestants.forEach(c => {
      assignments.set(c.id, assignMoneyrackStation(c, zoneData.get(c.id) ?? null));
    });
    setMoneyrackAssignments(assignments);

    const result = simulateContest(contestants, zoneData, assignments);
    const builtPlays = buildThreePointPlays(contestants, result, zoneData, assignments);
    setPlays(builtPlays);
    setSimResult(result);

    setLoadingPhase('moneyrack');
    setTimeout(() => setLoadingPhase('ready'), 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonesLoaded, contestantsKey, zoneData]);

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

    const timer = setTimeout(() => setCurrentIndex(c => c + 1), delay);
    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, plays, speed]);

  const togglePlay = () => {
    if (isFinished) return;
    setIsPlaying(p => !p);
  };

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
