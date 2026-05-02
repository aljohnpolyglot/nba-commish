export interface Player {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  imgURL: string;
  ovr: number;
  pos: string;
  team: string;
  ratings: {
    tp: number;
    fg: number;
    ins: number;
    dnk: number;
    def: number;
    spd: number;
    drb: number;
    blk: number;
    reb: number;
    jmp: number;
    hgt: number;
  };
  seed?: number;
}

export interface Match {
  id: string;
  round: number;
  player1: Player | null;
  player2: Player | null;
  winner: Player | null;
  score1: number;
  score2: number;
  firstPossessionId?: string;
  bracket?: 'main' | 'consolation';
}

export interface LogEntry {
  text: string;
  timestamp: string;
  score1: number;
  score2: number;
  playerId: string;
  type: 'make' | 'miss' | 'turnover' | 'block' | 'reb' | 'steal' | 'end';
}

export interface GameSettings {
  targetPoints: number;
  winByTwo: boolean;
  makeItTakeIt: boolean;
  scoringSystem: '1-2' | '2-3';
  isDoubleElim: boolean;
}

export enum GameStatus {
  PRE_GAME = 'PRE_GAME',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED'
}

export interface PlayerStats {
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  streak: number;
}

export interface GameState {
  player1: Player;
  player2: Player;
  score1: number;
  score2: number;
  status: GameStatus;
  logs: LogEntry[];
  possessionCount: number;
  currentPossessionPlayerId: string;
  winProb1: number;
  winProb2: number;
  momentum: number;
  p1Stats: PlayerStats;
  p2Stats: PlayerStats;
  winner?: Player;
}

export interface PossessionResult {
  type: 'MAKE' | 'MISS' | 'TURNOVER' | 'FOUL' | 'VIOLATION';
  points: number;
  description: string;
  player1Stats: PlayerStats;
  player2Stats: PlayerStats;
  timeElapsed: number;
}

export interface PlayerTournamentStats {
  id: string;
  lastName: string;
  imgURL: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pf: number;
  pa: number;
  pd: number;
  r1Pd: number;
  roundPds: Record<number, number>;
  pts: number;
  reb: number;
  ast: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  stl: number;
  blk: number;
}
