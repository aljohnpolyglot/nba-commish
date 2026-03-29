import { NBAPlayer as Player, NBATeam as Team } from '../../types';

export interface PlayerGameStats {
  playerId: string;
  name: string;
  min: number;
  sec?: number;
  pts: number;
  reb: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  pf: number;
  gs: number;
  gameScore: number;
  pm: number;
  // Detailed shot location stats
  fgAtRim?: number;
  fgaAtRim?: number;
  fgLowPost?: number;
  fgaLowPost?: number;
  fgMidRange?: number;
  fgaMidRange?: number;
  ba?: number; // blocked attempts (times this player got blocked)
  // Transient night profile fields — set in initial.ts, consumed in coordinated.ts, not persisted to season stats
  _nightOrbMult?: number;
  _nightDrbMult?: number;
  _nightAssistMult?: number;
  _nightStlMult?: number;
  _nightBlkMult?: number;
  _nightBallCtrl?: number;
}

export interface FightResult {
  player1Id: string;
  player1Name: string;
  player1TeamId: number;
  player2Id: string;
  player2Name: string;
  player2TeamId: number;
  severity: 'scuffle' | 'ejection' | 'brawl';
  description: string; // used as LLM story seed
}

export interface GameResult {
  gameId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  homeStats: PlayerGameStats[];
  awayStats: PlayerGameStats[];
  winnerId: number;
  lead: number;
  isOT: boolean;
  otCount: number;
  playerDNPs?: Record<string, string>; // playerId → "DNP — Injury (Type)" | "DNP — Coach's Decision"
  isAllStar?: boolean;
  isRisingStars?: boolean;
  gameWinner?: {
    playerId: string;
    playerName: string;
    teamId: number;
    shotType: 'clutch_ft' | 'clutch_2' | 'clutch_3' | 'walkoff';
    isWalkoff: boolean; // true = buzzer beater, false = go-ahead shot held
    clockRemaining: string; // e.g. "0.4s", "2.1s", "4s"
  };
  quarterScores?: {
    home: number[];
    away: number[];
  };
  date: string;
  injuries?: {
    playerId: string;
    playerName: string;
    teamId: number;
    injuryType: string;
    gamesRemaining: number;
  }[];
  fight?: FightResult;
}

/** Live per-player box-score accumulated by useGameStats */
export interface LivePlayerStat {
  n: string;
  fn: string;
  id: number;
  pos: string;
  pts: number;
  fgm: number; fga: number;
  tp: number; tpa: number;
  ftm: number; fta: number;
  ast: number;
  orb: number; drb: number;
  stl: number; blk: number;
  tov: number; pf: number;
  pm: number;
  sec: number;
}

export interface LiveTeamStat {
  fgm: number; fga: number;
  tp: number; tpa: number;
  ftm: number; fta: number;
  ast: number; reb: number;
  stl: number; blk: number;
  tov: number; pts: number;
  pf: number;
}

export interface RosterPlayer {
  n: string; // short display name e.g. "E. Mobley"
  fn: string; // full name e.g. "Evan Mobley"
  id: number;
  pos: 'G' | 'F' | 'C';
  min: string; // "MM:SS"
  hgt?: number;
  jmp?: number;
  pf: number;
  pm: number;
  fgm: number; fga: number;
  tp: number; tpa: number;
  ftm: number; fta: number;
  ast: number;
  orb: number; drb: number;
  stl: number; blk: number;
  tov: number;
  pts: number;
}
