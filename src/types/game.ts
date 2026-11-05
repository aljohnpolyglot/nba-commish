import type { DraftPick, NBAPlayer } from './player';
import type { NBATeam } from './team';
import type {
  GameEjection,
  GameHeaveEvent,
  GameLiveEvent,
  GameRuleConfig,
  GameTiebreaker,
} from '../services/simulation/types';

export interface Game {
  gid: number;
  homeTid: number;
  awayTid: number;
  homeScore: number;
  awayScore: number;
  played: boolean;
  date: string;
  season?: number;
  isPreseason?: boolean;
  euroFriendly?: boolean;
  euroFriendlyOwnerTid?: number;
  internationalShowcaseName?: string;
  internationalShowcasePlayerIds?: string[];
  city?: string;
  venue?: string;
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
  /** Derived from the current saved series score at simulation time. */
  isEliminationGame?: boolean;
  playoffSeriesId?: string;
  playoffGameNumber?: number;
  broadcaster?: string;
  broadcasterName?: string;
  tipoffTime?: string;
  isNBACup?: boolean;
  nbaCupRound?: 'group' | 'QF' | 'SF' | 'Final';
  nbaCupGroupId?: 'East-A' | 'East-B' | 'East-C' | 'West-A' | 'West-B' | 'West-C';
  isCupGame?: boolean;
  cupLeagueId?: string;
  cupCompetitionId?: string;
  cupGroupId?: string;
  cupRoundId?: string;
  excludeFromRecord?: boolean;
  /** Explicit, non-scoring disposition written only by confirmed legacy recovery. */
  legacyRecovery?: {
    disposition: 'void';
    recoveryId: string;
    reason: 'LEGACY_POSTSEASON_REGULAR_SEASON_CONFLICT';
    confirmedAtDate: string;
  };
  isCupTBD?: boolean;
  cupTBDForTid?: number;
  gameFormat?: 'timed' | 'target_score' | 'elam_ending';
  targetScore?: number;
  winnerId?: number;
  tiebreaker?: GameTiebreaker;
  round?: 'rr' | 'sf' | 'final';
  competitionId?: string;
  competitionPhase?: string;
  attendance?: number;
  ticketPriceEUR?: number;
  gateRevenueEUR?: number;
  matchdayFoodRevenueEUR?: number;
  matchdayDrinkRevenueEUR?: number;
  matchdayRevenueEUR?: number;
  merchandiseGrossRevenueEUR?: number;
  merchandiseDistributionCostEUR?: number;
  merchandiseRevenueEUR?: number;
  clubMediaRevenueEUR?: number;
}

export interface ResolvedGameSide {
  team: NBATeam;
  roster: NBAPlayer[];
}

/** Presentation-ready matchup. Consumers render it without league/event branching. */
export interface ResolvedGamePresentation {
  gameId: number;
  leagueId?: string;
  competitionId?: string;
  season?: number;
  site: 'home-away' | 'neutral';
  away: ResolvedGameSide;
  home: ResolvedGameSide;
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
  round: number;
  conference: 'East' | 'West' | 'League' | 'Finals';
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
  sourceA?: BracketSource;
  sourceB?: BracketSource;
  slotIndex?: number;
}

export type BracketSource =
  | { kind: 'team'; teamId: number; seed: number }
  | { kind: 'winnerOf'; seriesId: string }
  | { kind: 'loserOf'; seriesId: string }
  | { kind: 'tbd' };

export interface BracketSeriesNode {
  id: string;
  roundIndex: number;
  slotIndex: number;
  conference: 'East' | 'West' | 'League' | 'Finals';
  sourceA: BracketSource;
  sourceB: BracketSource;
  resolvedTeamA?: number;
  resolvedTeamB?: number;
  resolvedSeedA?: number;
  resolvedSeedB?: number;
  status: 'waiting' | 'ready' | 'active' | 'complete';
  winnerId?: number;
}

export interface BracketByeNode {
  id: string;
  roundIndex: number;
  slotIndex: number;
  conference: 'East' | 'West' | 'League';
  teamId: number;
  seed: number;
  destinationSeriesId?: string;
  destinationRoundIndex: number;
  advancement: 'bye';
}

export interface PlayInGame {
  id: string;
  conference: 'East' | 'West';
  gameType: '7v8' | '9v10' | 'loserGame' | '8v9' | '8v9Game2';
  team1Tid: number;
  team2Tid: number;
  winnerId?: number;
  gameId?: number;
  played: boolean;
}

export interface PlayoffBracket {
  season: number;
  /** Regular-season evidence consumed when this graph was first materialized. */
  regularSeasonCompletionFingerprint?: string;
  eastTop6: number[];
  westTop6: number[];
  eastTop7?: number[];
  westTop7?: number[];
  eastTop8?: number[];
  westTop8?: number[];
  playoffFormat?: 'modern' | 'historical';
  playoffSeeding?: 'conference' | 'league-wide';
  leagueSeeds?: number[];
  playInFormat?: 'modern_7_10' | 'bubble_8_9';
  numPlayoffTeams?: number;
  numPlayoffByes?: number;
  playoffEntryRounds?: number[];
  playInStartDate?: string;
  firstRoundStartDate?: string;
  playInGames: PlayInGame[];
  playInComplete: boolean;
  series: PlayoffSeries[];
  graphVersion?: 1;
  bracketPolicy?: 'fixed' | 'reseeded';
  nodes?: BracketSeriesNode[];
  byes?: BracketByeNode[];
  currentRound: number;
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
  q4Pts?: number;
  q4Reb?: number;
  q4Ast?: number;
  gameWinners?: number;
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
  _advancedStatVersion?: number;
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
  deflections?: number;
  chargesDrawn?: number;
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
  isDraw?: boolean;
  lead: number;
  isOT: boolean;
  simulationEngine?: 'fast' | 'realistic' | 'fast-fallback';
  teamShotStats?: {
    home: { pointsInPaint: number; paintMakes: number; paintAttempts: number };
    away: { pointsInPaint: number; paintMakes: number; paintAttempts: number };
  };
  otCount: number;
  playersOnCourt?: number;
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
  isAllStarChampionship?: boolean;
  isRisingStars?: boolean;
  isRisingStarsChampionship?: boolean;
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
  gameRules?: GameRuleConfig;
  ejections?: GameEjection[];
  tiebreaker?: GameTiebreaker;
  heaves?: GameHeaveEvent[];
  liveEvents?: GameLiveEvent[];
  highlights?: import('../services/simulation/types').GameHighlight[];
  season?: number;
  isPreseason?: boolean;
  isPlayoff?: boolean;
  isEliminationGame?: boolean;
  isPlayIn?: boolean;
  isNBACup?: boolean;
  nbaCupRound?: 'group' | 'QF' | 'SF' | 'Final';
  nbaCupGroupId?: 'East-A' | 'East-B' | 'East-C' | 'West-A' | 'West-B' | 'West-C';
  isCupGame?: boolean;
  cupLeagueId?: string;
  cupCompetitionId?: string;
  cupGroupId?: string;
  cupRoundId?: string;
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
  kind?: 'simulation' | 'save-load' | 'league-start';
  targetName?: string;
  targetSemanticName?: string;
  /** Presentation-safe semantic checkpoint. Raw lifecycle/TargetPlan enums never enter the UI contract. */
  nextCheckpointLabel?: string;
  nextCheckpointRequiresAction?: boolean;
  finalStopDate?: string;
}

export interface GameLoadProgress {
  currentPhase: string;
  percentComplete: number;
  stepsComplete: number;
  stepsTotal: number;
}
