// Bridge: re-export types from main app for CoachingView compatibility
export type { K2Result, PlayerK2 } from '../../../../../types';
export type { CoachSliders } from '../../../../../utils/coachSliders';

// Standalone Player/Team types expected by CoachingView — map to NBAPlayer/NBATeam
export type { NBAPlayer as Player, NBATeam as Team } from '../../../../../types';

// PlayerRatings type for the coaching view
export interface PlayerRatings {
  season?: number;
  hgt: number;
  stre: number;
  spd: number;
  jmp: number;
  endu: number;
  ins: number;
  dnk: number;
  ft: number;
  fg: number;
  tp: number;
  oiq: number;
  diq: number;
  drb: number;
  pss: number;
  reb: number;
  ovr: number;
  [key: string]: any;
}
