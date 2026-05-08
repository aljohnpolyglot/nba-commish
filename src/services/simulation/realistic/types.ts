import { NBAPlayer as Player, NBATeam as Team } from '../../../types';

export type ShotZone = 'rim' | 'midRange' | 'three' | 'lowPost';
export type PossessionEnd =
  | { kind: 'shot'; zone: ShotZone; made: boolean; pts: number; shooterId: string; assisterId?: string; blockerId?: string; fouled: boolean; ftAttempts: number; ftMade: number }
  | { kind: 'turnover'; offenderId: string; stealerId?: string }
  | { kind: 'foul'; offenderId: string; victimId: string; ftAttempts: number; ftMade: number };

export interface OnCourt {
  players: Player[];          // 5 actives
  composites: PlayerComposite[]; // parallel array, same order
}

export interface PlayerComposite {
  id: string;
  // Offense
  rim: number;        // finishing at rim
  midRange: number;   // mid-range jumper
  three: number;      // three-point
  lowPost: number;    // back-to-basket
  driving: number;    // creates rim attempts
  passing: number;    // assist generation
  drawingFouls: number;
  ft: number;         // free-throw shooting (0-1)
  // Defense
  defRim: number;
  defPerimeter: number;
  steal: number;
  block: number;
  rebound: number;
  // Other
  usage: number;      // 0-1 weight for getting touches
  endurance: number;  // future fatigue base
  // Raw fallback
  ovr: number;
}

export interface RealisticGameContext {
  homeTeam: Team;
  awayTeam: Team;
  homeRoster: Player[];        // ordered by minutes (starters first)
  awayRoster: Player[];
  homeMinutes: number[];       // parallel to homeRoster
  awayMinutes: number[];
  homeComposites: PlayerComposite[];
  awayComposites: PlayerComposite[];
  date: string;
  gameId: number;
  isAllStar: boolean;
  isRisingStars: boolean;
  riggedForTid?: number;
  numQuarters: number;
  quarterLength: number;       // minutes
  overtimeLength: number;      // minutes
}
