import { OlympicEvent, Player } from '../types';

function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function getNoise(p: Player, seed: number | undefined, range: number) {
  // If no seed is provided, we can just use a fixed seed based on pid so it's stable.
  // Or if seed is present, we incorporate it.
  const baseSeed = seed ? seed * 10000 + p.pid : p.pid * 12345;
  const rand = seededRandom(baseSeed);
  // Return value between -range/2 and +range/2
  return (rand - 0.5) * range;
}

export function getHurdleHits(p: Player, seed: number | undefined): boolean[] {
    const baseSeed = seed ? seed * 10000 + p.pid + 555 : p.pid * 555;
    const hits: boolean[] = [];
    const hitChance = Math.max(0, 0.3 - (p.jmp / 99) * 0.25); // 5% if 99 jmp, 30% if 0 jmp
    for (let i = 0; i < 10; i++) {
        const rand = seededRandom(baseSeed + i * 137);
        hits.push(rand < hitChance);
    }
    return hits;
}

function formatTimeSeconds(seconds: number): string {
  return seconds.toFixed(2) + 's';
}

function formatTimeMinutes(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function formatDistance(m: number): string {
  return m.toFixed(2) + 'm';
}

function formatTimeHours(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const EVENTS: OlympicEvent[] = [
  {
    id: '100m',
    name: '100m Sprint',
    goldStandard: 9.80,
    goldStandardDisplay: '9.80s',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.spd * 0.90 + p.jmp * 0.10 + getNoise(p, seed, 4); // +/- 2 points noise
      let result = 12.50 - (score / 99) * (12.50 - 10.10);
      
      if (p.weightLbs > 180) result += (p.weightLbs - 180) * 0.012;
      return result;
    },
    format: formatTimeSeconds,
  },
  {
    id: '200m',
    name: '200m Sprint',
    goldStandard: 19.80,
    goldStandardDisplay: '19.80s',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.spd * 0.75 + p.jmp * 0.15 + p.end * 0.10 + getNoise(p, seed, 4);
      let result = 25.00 - (score / 99) * (25.00 - 20.50);
      
      if (p.weightLbs > 180) result += (p.weightLbs - 180) * 0.025;
      return result;
    },
    format: formatTimeSeconds,
  },
  {
    id: '400m',
    name: '400m Sprint',
    goldStandard: 43.50,
    goldStandardDisplay: '43.50s',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.spd * 0.55 + p.end * 0.45 + getNoise(p, seed, 4);
      let result = 56.00 - (score / 99) * (56.00 - 45.00);
      if (p.weightLbs > 180) result += (p.weightLbs - 180) * 0.055;
      if (p.hgt > 72) result += (p.hgt - 72) * 0.02;
      return result;
    },
    format: formatTimeSeconds,
  },
  {
    id: '800m',
    name: '800m Run',
    goldStandard: 101.0, // 1:41
    goldStandardDisplay: '1:41.00',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.spd * 0.30 + p.end * 0.70 + getNoise(p, seed, 4);
      let result = 140.0 - (score / 99) * (140.0 - 108.0);
      if (p.weightLbs > 180) result += (p.weightLbs - 180) * 0.05;
      if (p.hgt > 72) result += (p.hgt - 72) * 0.03;
      return result;
    },
    format: formatTimeMinutes,
  },
  {
    id: '1500m',
    name: '1500m Run',
    goldStandard: 210.0, // 3:30
    goldStandardDisplay: '3:30.00',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.spd * 0.15 + p.end * 0.85 + getNoise(p, seed, 4);
      let result = 285.0 - (score / 99) * (285.0 - 225.0);
      if (p.weightLbs > 180) result += (p.weightLbs - 180) * 0.10;
      if (p.hgt > 72) result += (p.hgt - 72) * 0.05;
      return result;
    },
    format: formatTimeMinutes,
  },
  {
    id: '4x100m',
    name: '4x100m Relay',
    goldStandard: 36.84,
    goldStandardDisplay: '36.84s',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.spd * 0.90 + p.jmp * 0.10 + getNoise(p, seed, 4);
      let result = 12.50 - (score / 99) * (12.50 - 10.10);
      
      if (p.weightLbs > 180) result += (p.weightLbs - 180) * 0.012;
      return result;
    },
    format: formatTimeSeconds,
  },
  {
    id: '4x400m',
    name: '4x400m Relay',
    goldStandard: 174.29, // 2:54.29
    goldStandardDisplay: '2:54.29',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.spd * 0.55 + p.end * 0.45 + getNoise(p, seed, 4);
      let result = 56.00 - (score / 99) * (56.00 - 45.00);
      if (p.weightLbs > 180) result += (p.weightLbs - 180) * 0.055;
      if (p.hgt > 72) result += (p.hgt - 72) * 0.02;
      return result;
    },
    format: formatTimeMinutes,
  },
  {
    id: 'long_jump',
    name: 'Long Jump',
    goldStandard: 8.50,
    goldStandardDisplay: '8.50m',
    unit: 'm',
    sortOrder: 'desc',
    calculate: (p, seed) => {
      const score = p.jmp * 0.70 + p.spd * 0.30 + getNoise(p, seed, 6);
      let result = 6.20 + (score / 99) * (7.80 - 6.20);
      if (p.weightLbs > 190) result -= (p.weightLbs - 190) * 0.010;
      return result;
    },
    format: formatDistance,
  },
  {
    id: 'high_jump',
    name: 'High Jump',
    goldStandard: 2.37,
    goldStandardDisplay: '2.37m',
    unit: 'm',
    sortOrder: 'desc',
    calculate: (p, seed) => {
      const hgtBonus = (p.hgt >= 60 && p.jmp >= 45) ? p.hgt * 0.15 : 0;
      const score = p.jmp * 0.85 + hgtBonus + getNoise(p, seed, 6);
      let result = 1.85 + (score / 99) * (2.15 - 1.85);
      if (p.weightLbs > 200) result -= (p.weightLbs - 200) * 0.006;
      return Math.min(result, 2.15); // hard cap
    },
    format: formatDistance,
  },
  {
    id: 'triple_jump',
    name: 'Triple Jump',
    goldStandard: 17.80,
    goldStandardDisplay: '17.80m',
    unit: 'm',
    sortOrder: 'desc',
    calculate: (p, seed) => {
      const score = p.jmp * 0.60 + p.spd * 0.40 + getNoise(p, seed, 6);
      let baseDistance = 12.00 + (score / 99) * (16.50 - 12.00);
      if (p.weightLbs > 190) baseDistance -= (p.weightLbs - 190) * 0.012;
      return baseDistance * 0.90; // -10% penalty
    },
    format: formatDistance,
  },
  {
    id: 'shot_put',
    name: 'Shot Put',
    goldStandard: 22.00,
    goldStandardDisplay: '22.00m',
    unit: 'm',
    sortOrder: 'desc',
    calculate: (p, seed) => {
      const score = p.str * 0.70 + p.hgt * 0.20 + (Math.min(99, p.weightLbs / 300 * 99)) * 0.10 + getNoise(p, seed, 6);
      return 13.00 + (score / 99) * (19.00 - 13.00);
    },
    format: formatDistance,
  },
  {
    id: 'discus',
    name: 'Discus',
    goldStandard: 68.00,
    goldStandardDisplay: '68.00m',
    unit: 'm',
    sortOrder: 'desc',
    calculate: (p, seed) => {
      const score = p.str * 0.65 + p.pss * 0.35 + getNoise(p, seed, 6);
      let baseDistance = 35.00 + (score / 99) * (58.00 - 35.00);
      if (p.weightLbs > 220) baseDistance -= (p.weightLbs - 220) * 0.12;
      if (p.hgt > 76) baseDistance -= (p.hgt - 76) * 0.10;
      return baseDistance * 0.85; // -15% technique penalty
    },
    format: formatDistance,
  },
  {
    id: 'javelin',
    name: 'Javelin',
    goldStandard: 88.00,
    goldStandardDisplay: '88.00m',
    unit: 'm',
    sortOrder: 'desc',
    calculate: (p, seed) => {
      const score = p.pss * 0.55 + p.str * 0.25 + p.spd * 0.20 + getNoise(p, seed, 6);
      let baseDistance = 52.00 + (score / 99) * (78.00 - 52.00);
      if (p.weightLbs > 185) baseDistance -= (p.weightLbs - 185) * 0.18;
      if (p.hgt > 76) baseDistance -= (p.hgt - 76) * 0.12;
      return baseDistance * 0.92; // -8% technique penalty
    },
    format: formatDistance,
  },
  {
    id: 'marathon',
    name: 'Boston Marathon',
    goldStandard: 7260,
    goldStandardDisplay: '2:01:00',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.end * 0.90 + p.spd * 0.10 + getNoise(p, seed, 2);
      let baseTime = 13500 - (score / 99) * (13500 - 10200);
      if (p.weightLbs > 180) baseTime += (p.weightLbs - 180) * 35;
      if (p.hgt > 72) baseTime += (p.hgt - 72) * 20;
      return baseTime;
    },
    format: formatTimeHours,
  },
  {
    id: '110m_hurdles',
    name: '110m Hurdles',
    goldStandard: 12.80,
    goldStandardDisplay: '12.80s',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.spd * 0.55 + p.jmp * 0.45 + getNoise(p, seed, 4);
      let result = 16.50 - (score / 99) * (16.50 - 13.00);
      if (p.weightLbs > 185) {
         result += (p.weightLbs - 185) * 0.018;
      }
      const hits = getHurdleHits(p, seed);
      const hitPenalty = hits.filter(Boolean).length * 0.25; // 0.25s per hit
      return result + hitPenalty;
    },
    format: formatTimeSeconds,
  },
  {
    id: '400m_hurdles',
    name: '400m Hurdles',
    goldStandard: 46.00,
    goldStandardDisplay: '46.00s',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.spd * 0.40 + p.end * 0.35 + p.jmp * 0.25 + getNoise(p, seed, 4);
      let result = 58.00 - (score / 99) * (58.00 - 48.00);
      if (p.weightLbs > 185) {
         result += (p.weightLbs - 185) * 0.030;
      }
      const hits = getHurdleHits(p, seed);
      const hitPenalty = hits.filter(Boolean).length * 0.4; // 0.4s per hit for 400m
      return result + hitPenalty;
    },
    format: formatTimeSeconds,
  },
  {
    id: 'hammer_throw',
    name: 'Hammer Throw',
    goldStandard: 65.00,
    goldStandardDisplay: '65.00m',
    unit: 'm',
    sortOrder: 'desc',
    calculate: (p, seed) => {
      const score = p.str * 0.80 + (Math.min(99, p.weightLbs / 300 * 99)) * 0.20 + getNoise(p, seed, 6);
      let baseDistance = 40.00 + (score / 99) * (65.00 - 40.00);
      if (p.hgt > 78) baseDistance -= (p.hgt - 78) * 0.15;
      return baseDistance;
    },
    format: formatDistance,
  },
  {
    id: 'sumo',
    name: 'Sumo Wrestling',
    goldStandard: 1,
    goldStandardDisplay: 'WIN',
    unit: '',
    sortOrder: 'desc',
    calculate: (p, seed) => {
      // Just for sorting power display if needed
      return p.str * 0.70 + (Math.min(99, p.weightLbs / 300 * 99)) * 0.30;
    },
    format: (v) => v.toFixed(1),
  },
  {
    id: 'steeplechase',
    name: '3000m Steeplechase',
    goldStandard: 480.0,
    goldStandardDisplay: '8:00.00',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      const score = p.end * 0.50 + p.jmp * 0.25 + p.spd * 0.25 + getNoise(p, seed, 4);
      let result = 720.0 - (score / 99) * (720.0 - 485.0); 
      if (p.weightLbs > 175) result += (p.weightLbs - 175) * 1.5;
      return result;
    },
    format: formatTimeHours,
  },
  {
    id: 'swimming',
    name: '100m Freestyle Swimming',
    goldStandard: 46.80,
    goldStandardDisplay: '46.80s',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      // 1. Calculate raw aquatic athleticism
      // Height is a major advantage (longer stroke). Speed/Endurance still key.
      const baseScore = p.spd * 0.35 + p.end * 0.25 + p.hgt * 0.30 + p.str * 0.10;

      // 2. Weight logic: Helps up to 215 lbs due to power, then massive drag
      let wtMult = 1.0;
      if (p.weightLbs <= 215) {
        wtMult = 0.90 + 0.10 * (Math.max(0, p.weightLbs - 160) / 55);
      } else {
        wtMult = 1.0 - 0.30 * (Math.min(100, p.weightLbs - 215) / 85);
      }

      const finalScore = baseScore * wtMult + getNoise(p, seed, 2.5);

      // Best final scores will be around 85-90. Average around 45-55.
      // Top 10 spread should be realistic (6-8 seconds), best around 50-52s (3-5s behind 46.80 WR).
      // Base time of 48.0s + penalty based on score difference from ideal 100.
      const result = 48.0 + ((100 - finalScore) * 0.25);
      
      return result;
    },
    format: formatTimeSeconds,
  },
  {
    id: 'rock_climbing',
    name: 'Speed Climbing',
    goldStandard: 4.8,
    goldStandardDisplay: '4.80 s',
    unit: 's',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      // Speed climbing time (lower is better)
      // Agility and relative strength are key. Huge players (high hgt/wt) are heavily penalized.
      const strToWtRatio = p.str / Math.max(100, p.weightLbs);
      const strengthToWeightBonus = strToWtRatio * 15.0; // Higher ratio translates to huge speed boost
      const agilityBonus = (p.spd / 100) * 4.0;
      const heightPenalty = Math.max(0, p.hgt - 70) * 0.15; // Tall players struggle in compact climbing walls
      const pureEnduranceBonus = (p.end / 100) * 2.0;

      const baseTime = 18.0;
      const score = baseTime + heightPenalty - strengthToWeightBonus - agilityBonus - pureEnduranceBonus + getNoise(p, seed, 0.4);
      return Math.min(30.0, Math.max(4.5, score));
    },
    format: formatTimeSeconds,
  },
  {
    id: 'golf',
    name: 'Golf Stroke Play',
    goldStandard: -18,
    goldStandardDisplay: '54 (-18)',
    unit: 'strokes',
    sortOrder: 'asc',
    calculate: (p, seed) => {
      return 0; // Handled dynamically in GolfView
    },
    format: (score) => String(score),
  }
];
