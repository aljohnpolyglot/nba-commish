import type { DraftPick, NBAPlayer } from './player';

export interface Game {
  gid: number;
  homeTid: number;
  awayTid: number;
  homeScore: number;
  awayScore: number;
  played: boolean;
  date: string;
  isPreseason?: boolean;
  city?: string;
  country?: string;
  isAllStar?: boolean;
  isAllStarChampionship?: boolean;
  isRisingStars?: boolean;
  isRisingStarsChampionship?: boolean;
  isCelebrityGame?: boolean;
  isExhibition?: boolean;
  isDunkContest?: boolean;
  isThreePointContest?: boolean;
  isThroneEvent?: boolean;
  isPlayoff?: boolean;
  isPlayIn?: boolean;
  playoffSeriesId?: string;
  playoffGameNumber?: number;
  broadcaster?: string;
  broadcasterName?: string;
  tipoffTime?: string;
  isNBACup?: boolean;
  nbaCupRound?: 'group' | 'QF' | 'SF' | 'Final';
  nbaCupGroupId?: 'East-A' | 'East-B' | 'East-C' | 'West-A' | 'West-B' | 'West-C';
  excludeFromRecord?: boolean;
  isCupTBD?: boolean;
  cupTBDForTid?: number;
  gameFormat?: 'timed' | 'target_score' | 'elam_ending';
  targetScore?: number;
  round?: 'rr' | 'sf' | 'final';
  competitionId?: string;
  competitionPhase?: string;
}

export interface NBACupGroup {
  id: 'East-A' | 'East-B' | 'East-C' | 'West-A' | 'West-B' | 'West-C';
  conference: 'East' | 'West';
  teamIds: number[];
  standings: Array<{
    tid: number;
    w: number;
    l: number;
    pf: number;
    pa: number;
    pd: number;
    gp: number;
  }>;
}

export interface NBACupKnockoutGame {
  round: 'QF' | 'SF' | 'Final';
  seed1: number;
  seed2: number;
  tid1: number;
  tid2: number;
  gameId?: number;
  winnerTid?: number;
  countsTowardRecord: boolean;
}

export interface NBACupState {
  year: number;
  status: 'group' | 'knockout' | 'complete';
  groups: NBACupGroup[];
  wildcards: { East: number | null; West: number | null };
  knockout: NBACupKnockoutGame[];
  championTid?: number;
  runnerUpTid?: number;
  mvpPlayerId?: string;
  allTournamentTeam?: Array<{ playerId: string; tid: number; pos: string; isMvp: boolean }>;
  prizePool?: {
    perPlayerByFinish: { winner: number; runnerUp: number; semi: number; quarter: number };
  };
}

export interface PlayoffSeries {
  id: string;
  round: 1 | 2 | 3 | 4;
  conference: 'East' | 'West' | 'Finals';
  higherSeedTid: number;
  lowerSeedTid: number;
  higherSeedWins: number;
  lowerSeedWins: number;
  gamesNeeded: number;
  winnerId?: number;
  gameIds: number[];
  status: 'pending' | 'active' | 'complete';
  higherSeed: number;
  lowerSeed: number;
}

export interface PlayInGame {
  id: string;
  conference: 'East' | 'West';
  gameType: '7v8' | '9v10' | 'loserGame';
  team1Tid: number;
  team2Tid: number;
  winnerId?: number;
  gameId?: number;
  played: boolean;
}

export interface PlayoffBracket {
  season: number;
  eastTop6: number[];
  westTop6: number[];
  playInGames: PlayInGame[];
  playInComplete: boolean;
  series: PlayoffSeries[];
  currentRound: 1 | 2 | 3 | 4;
  champion?: number;
  gamesInjected: boolean;
  round1Injected: boolean;
  bracketComplete: boolean;
}

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
  pf: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  fourPm?: number;
  fourPa?: number;
  ftm: number;
  fta: number;
  gs: number;
  gameScore: number;
  pm: number;
  tsPct?: number;
  efgPct?: number;
  per?: number;
  ortg?: number;
  drtg?: number;
  usgPct?: number;
  bpm?: number;
  ws?: number;
  vorp?: number;
  fgAtRim?: number;
  fgaAtRim?: number;
  fgLowPost?: number;
  fgaLowPost?: number;
  fgMidRange?: number;
  fgaMidRange?: number;
  ba?: number;
  dunks?: number;
  techs?: number;
}

export interface FightResult {
  player1Id: string;
  player1Name: string;
  player1TeamId: number;
  player2Id: string;
  player2Name: string;
  player2TeamId: number;
  severity: 'scuffle' | 'ejection' | 'brawl';
  description: string;
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
  playerDNPs?: Record<string, string>;
  playerInGameInjuries?: Record<string, { type: string; quarter: number }>;
  playersPlayingHurt?: Record<string, string>;
  quarterScores?: {
    home: number[];
    away: number[];
  };
  gameWinner?: {
    playerId: string;
    playerName: string;
    teamId: number;
    shotType: 'clutch_ft' | 'clutch_2' | 'clutch_3' | 'walkoff';
    isWalkoff: boolean;
    clockRemaining: string;
  };
  date: string;
  isAllStar?: boolean;
  isRisingStars?: boolean;
  isCelebrityGame?: boolean;
  mvpName?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamAbbrev?: string;
  awayTeamAbbrev?: string;
  homeWins?: number;
  homeLosses?: number;
  awayWins?: number;
  awayLosses?: number;
  gameFormat?: 'timed' | 'target_score' | 'elam_ending';
  targetScore?: number;
  injuries?: {
    playerId: string;
    playerName: string;
    teamId: number;
    injuryType: string;
    gamesRemaining: number;
  }[];
  fight?: FightResult;
  highlights?: import('../services/simulation/types').GameHighlight[];
  season?: number;
  isPreseason?: boolean;
  isPlayoff?: boolean;
  isPlayIn?: boolean;
  isNBACup?: boolean;
  nbaCupRound?: 'group' | 'QF' | 'SF' | 'Final';
  nbaCupGroupId?: 'East-A' | 'East-B' | 'East-C' | 'West-A' | 'West-B' | 'West-C';
  excludeFromRecord?: boolean;
  competitionId?: string;
  competitionPhase?: string;
}

export interface LazySimProgress {
  currentDate: string;
  targetDate: string;
  daysComplete: number;
  daysTotal: number;
  currentPhase: string;
  percentComplete: number;
}
