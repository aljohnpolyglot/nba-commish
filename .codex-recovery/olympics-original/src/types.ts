export interface Player {
  pid: number;
  firstName: string;
  lastName: string;
  tid: number;
  age: number;
  ovr: number;
  hgt: number; // 0-99 rating
  wtRating: number; // calculated 0-99 rating from lbs
  spd: number;
  jmp: number;
  str: number;
  end: number;
  pss: number;
  teamAbbrev?: string;
  teamName?: string;
  weightLbs: number;
  imgURL?: string;
}

export interface EventResult {
  player: Player;
  score: number;
  displayScore: string;
  isSurprise: boolean; // ovr < 65
  round1Score?: string;
  round2Score?: string;
  rank?: number;
}

export interface OlympicEvent {
  id: string;
  name: string;
  goldStandard: number;
  goldStandardDisplay: string;
  unit: string;
  sortOrder: 'asc' | 'desc'; // asc = lower is better (running), desc = higher is better (jumping/throwing)
  calculate: (p: Player, seed?: number) => number;
  format: (score: number) => string;
}
