/**
 * draftCombineCalculator.ts
 * Placeholder — generates NBA Draft Combine-style measurements and athletic testing
 * from a player's BBGM ratings. All values are derived algorithmically; no external data.
 *
 * TODO: wire into DraftScoutingView to show combine tab per prospect.
 */

import type { NBAPlayer } from '../types';

export interface CombineAnthro {
  heightNoShoes: string;    // e.g. "6' 5.25''"
  heightWithShoes: string;
  wingspan: string;
  standingReach: string;
  weight: number;           // lbs
  bodyFat: number;          // %
  handLength: number;       // inches
  handWidth: number;        // inches
}

export interface CombineAthletic {
  standingVertical: number; // inches
  maxVertical: number;      // inches
  laneAgility: number;      // seconds (lower = better)
  shuttleRun: number;       // seconds
  threeQuarterSprint: number; // seconds
  benchPress: number;       // reps at 185 lbs
}

export interface CombineShootingDrill {
  fgm: number;
  fga: number;
}

export interface CombineShootingDrills {
  offDribble: CombineShootingDrill;   // 30 attempts
  spotUp: CombineShootingDrill;        // 25 attempts
  star3pt: CombineShootingDrill;       // 25 attempts
  starMid: CombineShootingDrill;       // 25 attempts
  side3pt: CombineShootingDrill;       // 25 attempts
  sideMid: CombineShootingDrill;       // 25 attempts
  freeThrow: CombineShootingDrill;     // 10 attempts
}

export interface CombineStats {
  anthro: CombineAnthro;
  athletic: CombineAthletic;
  shootingDrills: CombineShootingDrills;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatInches(totalInches: number): string {
  const feet = Math.floor(totalInches / 12);
  const remainder = totalInches % 12;
  const quarters = [0, 0.25, 0.5, 0.75];
  const q = quarters[Math.floor(Math.random() * 4)];
  return `${feet}' ${(Math.floor(remainder) + q).toFixed(2)}''`;
}

function drillScore(rating: number, fga: number, minFgm: number, maxFgm: number, variance: number): CombineShootingDrill {
  const lerp = minFgm + (rating / 99) * (maxFgm - minFgm);
  const score = Math.round(lerp + (Math.random() - 0.5) * variance);
  return { fgm: Math.max(minFgm - 2, Math.min(fga, score)), fga };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateCombineStats(player: NBAPlayer): CombineStats {
  const r = player.ratings?.[player.ratings.length - 1] as any;
  if (!r) throw new Error('No ratings on player');

  const heightInches = (player as any).hgt ?? 78;
  const weight = (player as any).weight ?? 220;
  const wingspan = (player as any).wingspan ?? heightInches + 2;

  const standingReach = heightInches * 1.33 + (wingspan - heightInches) * 0.48 + (Math.random() - 0.5) * 3;

  return {
    anthro: {
      heightNoShoes: formatInches(heightInches - 1.25),
      heightWithShoes: formatInches(heightInches),
      wingspan: formatInches(wingspan),
      standingReach: formatInches(standingReach),
      weight,
      bodyFat: Number((3.5 + (100 - (r.stre ?? 50)) / 12 + Math.random() * 3.5).toFixed(1)),
      handLength: Number((heightInches / 9.2 + (Math.random() - 0.5) * 1.2).toFixed(2)),
      handWidth: Number((heightInches / 8.2 + (Math.random() - 0.5) * 1.5).toFixed(2)),
    },
    athletic: {
      standingVertical: Number((21 + ((r.jmp ?? 50) / 100) * 14 + Math.random() * 2.5).toFixed(1)),
      maxVertical: Number((26 + ((r.jmp ?? 50) / 100) * 20 + Math.random() * 3).toFixed(1)),
      laneAgility: Number((12.6 - ((r.spd ?? 50) / 100) * 1.6 - ((r.endu ?? 50) / 100) * 0.4 + Math.random() * 0.35).toFixed(2)),
      shuttleRun: Number((3.5 - ((r.spd ?? 50) / 100) * 0.7 + Math.random() * 0.15).toFixed(2)),
      threeQuarterSprint: Number((3.7 - ((r.spd ?? 50) / 100) * 0.6 + Math.random() * 0.15).toFixed(2)),
      benchPress: Math.max(0, Math.round(((r.stre ?? 50) / 100) * 24 + Math.random() * 5 - 2.5)),
    },
    shootingDrills: {
      offDribble: drillScore(r.fg ?? 50, 30, 12, 26, 4),
      spotUp:     drillScore(r.tp ?? 50, 25, 8,  20, 3),
      star3pt:    drillScore(r.tp ?? 50, 25, 8,  19, 4),
      starMid:    drillScore(r.fg ?? 50, 25, 10, 21, 4),
      side3pt:    drillScore(r.tp ?? 50, 25, 8,  20, 4),
      sideMid:    drillScore(r.fg ?? 50, 25, 10, 22, 4),
      freeThrow:  drillScore(r.ft ?? 50, 10, 6,  10, 2),
    },
  };
}
