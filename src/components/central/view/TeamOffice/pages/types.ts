export type { CoachSliders } from '../../../../../utils/coachSliders';

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

export interface Player {
  name?: string;
  firstName?: string;
  lastName?: string;
  internalId?: string;
  pos?: string;
  ratings: PlayerRatings[];
  hgt?: number;
  weight?: number;
  born?: { year: number };
  tid: number;
  injury?: { type: string; gamesRemaining: number };
  imgURL?: string;
  status?: string;
  overallRating?: number;
}

export interface Team {
  tid: number;
  region: string;
  name: string;
  imgURL?: string;
}

export interface K2Result {
  OS: number[];
  AT: number[];
  IS: number[];
  PL: number[];
  DF: number[];
  RB: number[];
}

export interface PlayerK2 extends Player {
  k2: K2Result;
  rating2K: number;
  bbgmOvr: number;
  currentRating: PlayerRatings;
}
