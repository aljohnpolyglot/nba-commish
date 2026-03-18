import { ThreePointContestant } from './ThreePointContestant';

export interface ShootingZoneData {
  racks: Array<{ pct: string; vol: string }>;
  pctByStation: number[];
  volByStation: number[];
}

export type MissType =
  | 'airball'
  | 'backboard'
  | 'front_rim'
  | 'back_rim'
  | 'in_and_out'
  | 'left_right'
  | 'short';

export interface BallResult {
  made: boolean;
  isMoneyball: boolean;
  points: number;
  missType?: MissType;
  consecutiveMakes: number;
  consecutiveMisses: number;
}

export interface StationResult {
  score: number;
  balls: BallResult[];
}

export interface PlayerRoundResult {
  playerId: string;
  totalScore: number;
  stations: StationResult[];
}

export interface ThreePointContestResult {
  round1: PlayerRoundResult[];
  finals: PlayerRoundResult[];
  winnerId: string | null;
}

function calcShotProb(
  contestant: ThreePointContestant,
  station: number,
  ballIndex: number,
  isMoneyball: boolean,
  shotsFired: number,
  zones: ShootingZoneData | null,
  consecutiveMakes: number = 0,
  consecutiveMisses: number = 0
): number {
  let prob: number;

  if (zones) {
    prob = zones.pctByStation[station - 1];
    console.log(`[3PT] ${contestant.name} station ${station}: API base prob = ${(prob * 100).toFixed(1)}%`);
  } else {
    prob = 0.30 + (contestant.ratings.tp / 100) * 0.42;
  }

  const badges = contestant.badges;

  const cas = badges['Catch and Shoot'];
  if (cas === 'HOF')         prob += 0.06;
  else if (cas === 'Gold')   prob += 0.04;
  else if (cas === 'Silver') prob += 0.02;
  else if (cas === 'Bronze') prob += 0.01;

  if (station === 1 || station === 5) {
    const cs = badges['Corner Specialist'];
    if (cs === 'HOF')         prob += 0.08;
    else if (cs === 'Gold')   prob += 0.05;
    else if (cs === 'Silver') prob += 0.03;
    else if (cs === 'Bronze') prob += 0.01;
  }

  if (ballIndex >= 3) {
    const de = badges['Deadeye'];
    if (de === 'HOF')         prob += 0.05;
    else if (de === 'Gold')   prob += 0.03;
    else if (de === 'Silver') prob += 0.02;
    else if (de === 'Bronze') prob += 0.01;
  }

  if (isMoneyball) {
    const sss = badges['Set Shot Specialist'];
    if (sss === 'HOF')         prob += 0.07;
    else if (sss === 'Gold')   prob += 0.05;
    else if (sss === 'Silver') prob += 0.03;
    else if (sss === 'Bronze') prob += 0.02;
  }

  if (station === 3) {
    const lr = badges['Limitless Range'];
    if (lr === 'HOF')         prob += 0.06;
    else if (lr === 'Gold')   prob += 0.04;
    else if (lr === 'Silver') prob += 0.02;
  }

  if (shotsFired > 15) prob -= (shotsFired - 15) * 0.008;
  if (isMoneyball && ballIndex === 4) prob -= 0.03;

  if (consecutiveMakes >= 3) {
    prob += Math.min((consecutiveMakes - 2) * 0.02, 0.06);
  }
  if (consecutiveMisses >= 3) {
    prob -= Math.min((consecutiveMisses - 2) * 0.015, 0.05);
  }

  return Math.min(Math.max(prob, 0.15), 0.92);
}

function selectMissType(
  station: number,
  isMoneyball: boolean,
  prob: number
): MissType {
  const airballed = !isMoneyball && Math.random() < (prob < 0.45 ? 0.04 : 0.015);
  if (airballed) return 'airball';

  const isCorner = station === 1 || station === 5;
  if (isCorner && Math.random() < 0.08) return 'backboard';

  const roll = Math.random();
  if (roll < 0.22) return 'in_and_out';
  if (roll < 0.40) return 'front_rim';
  if (roll < 0.55) return 'back_rim';
  if (roll < 0.68) return 'short';
  return 'left_right';
}

function simulatePlayerRound(
  contestant: ThreePointContestant,
  zones: ShootingZoneData | null,
  moneyrackStation: number
): PlayerRoundResult {
  const stations: StationResult[] = [];
  let totalScore = 0;
  let shotsFired = 0;
  let consecutiveMakes = 0;
  let consecutiveMisses = 0;

  for (let s = 1; s <= 5; s++) {
    const isMoneyballRack = moneyrackStation === s;
    const balls: BallResult[] = [];
    let stationScore = 0;

    for (let b = 0; b < 5; b++) {
      const isMoneyball = isMoneyballRack || b === 4;
      const prob = calcShotProb(contestant, s, b, isMoneyball, shotsFired, zones, consecutiveMakes, consecutiveMisses);
      const made = Math.random() < prob;

      if (made) {
        consecutiveMakes++;
        consecutiveMisses = 0;
        stationScore += isMoneyball ? 2 : 1;
      } else {
        consecutiveMisses++;
        consecutiveMakes = 0;
      }

      const missType = made ? undefined : selectMissType(s, isMoneyball, prob);
      balls.push({
        made,
        isMoneyball,
        points: made ? (isMoneyball ? 2 : 1) : 0,
        missType,
        consecutiveMakes,
        consecutiveMisses
      });

      shotsFired++;
    }

    totalScore += stationScore;
    stations.push({ score: stationScore, balls });
  }

  return { playerId: contestant.id, totalScore, stations };
}

export function simulateContest(
  contestants: ThreePointContestant[],
  zoneData: Map<string, ShootingZoneData>,
  moneyrackAssignments: Map<string, number>
): ThreePointContestResult {
  const round1: PlayerRoundResult[] = [];

  for (const c of contestants) {
    const zones = zoneData.get(c.id) ?? null;
    const moneyrack = moneyrackAssignments.get(c.id) ?? 3;
    round1.push(simulatePlayerRound(c, zones, moneyrack));
  }

  const sortedR1 = [...round1].sort((a, b) => b.totalScore - a.totalScore);
  const finalists = sortedR1.slice(0, 2);
  const finals: PlayerRoundResult[] = [];

  for (const f of finalists) {
    const c = contestants.find(x => x.id === f.playerId)!;
    const zones = zoneData.get(c.id) ?? null;
    const moneyrack = moneyrackAssignments.get(c.id) ?? 3;
    finals.push(simulatePlayerRound(c, zones, moneyrack));
  }

  const sortedFinals = [...finals].sort((a, b) => b.totalScore - a.totalScore);
  const winnerId = sortedFinals.length > 0 ? sortedFinals[0].playerId : null;

  return { round1, finals, winnerId };
}
